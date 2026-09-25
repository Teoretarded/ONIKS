/* Inspect overlay helpers on the 2D overlay canvas, in the Anatomy films' style (pc_anatomy*_film.js):
   lime id chip tags (small: 10.5 px mono), labels that condense out of glyph noise, dotted leaders and stems,
   3 px anchor dots, bracket corners that fit, the confidence bars, the readout block (kick + faint labels with
   white values), key chips, a scale bar. Everything is canvas so ONIKS.still() carries it. */

export const LIME = '#C6F432', CORAL = '#FF6A3D', WHITE = '#FFFFFF', BG = '#0B0C0A';
export const MONO = "'Geist Mono', Consolas, monospace", SANS = "'Geist', 'Segoe UI', sans-serif";
const GLY = '·:+×/\\|-=';
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;

/* the label still condensing: its tail is glyph noise that settles left to right (films' condense()) */
export function condense(s, cond, t, seed) {
  if (cond >= 1) return s;
  const n = s.length, keep = Math.floor(n * Math.max(0, cond)), fr = Math.floor(t * 24);
  let o = s.slice(0, keep);
  for (let i = keep; i < n; i++) o += s[i] === ' ' ? ' ' : (((i * 7 + fr * 13 + seed * 5) % 11) < 3 + 8 * cond ? GLY[(i * 3 + fr + seed) % GLY.length] : ' ');
  return o;
}

const wCache = new Map();
function measure(ctx, s, px) {
  const k = px + '|' + s;
  let w = wCache.get(k);
  if (w === undefined) {
    ctx.font = `500 ${px}px ${MONO}`;
    w = ctx.measureText(s).width + px * .05 * s.length;
    if (wCache.size > 3000) wCache.clear();
    wCache.set(k, w);
  }
  return w;
}
function txt(ctx, s, x, y, sp) {
  if ('letterSpacing' in ctx) { ctx.letterSpacing = sp + 'px'; ctx.fillText(s, x, y); ctx.letterSpacing = '0px'; }
  else ctx.fillText(s, x, y);
}

/* tag width without drawing (same metrics as tag()) */
export function tagWidth(ctx, id, label, value, px) {
  px = px || 10.5;
  const U = s => (s || '').toString().toUpperCase();
  const a = U(id), b = U(label), c = U(value);
  const pX = px * .61, pL = px * .7;
  return (a ? measure(ctx, a, px) + pX * 2 : 0) + (b ? measure(ctx, b, px) + pL * 2 : 0) + (c ? measure(ctx, c, px) + pL * 2 : 0);
}
/* [ID][ LABEL ][ VALUE ] at x, y (top-left; align 'right' puts its right edge at x). kind: 'lime' | 'coral' |
   'white' | 'ghost'; o.valCol overrides the value colour; o.hi draws the chip outline (focused). -> box */
export function tag(ctx, x, y, id, label, value, o) {
  o = o || {};
  const px = o.size || 10.5, sp = px * .05, a = o.a === undefined ? 1 : o.a;
  if (a <= .005) return null;
  const U = s => (s || '').toString().toUpperCase();
  const sId = U(id), sL = U(label), sV = U(value);
  const pX = px * .61, pL = px * .7, hB = Math.round(px + 9);
  ctx.font = `500 ${px}px ${MONO}`;
  const wId = sId ? measure(ctx, sId, px) + pX * 2 : 0, wL = sL ? measure(ctx, sL, px) + pL * 2 : 0, wV = sV ? measure(ctx, sV, px) + pL * 2 : 0;
  const W = wId + wL + wV;
  if (o.align === 'right') x -= W; else if (o.align === 'center') x -= W / 2;
  x = Math.round(x); y = Math.round(y);
  const kind = o.kind || 'lime';
  const chip = kind === 'lime' ? LIME : kind === 'coral' ? CORAL : WHITE;
  ctx.globalAlpha = a; ctx.textBaseline = 'alphabetic';
  const base = y + hB - Math.round(px * .42) - 1.5;
  let cx = x;
  if (sId) {
    if (kind === 'ghost') { ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.lineWidth = 1; ctx.strokeRect(cx + .5, y + .5, wId - 1, hB - 1); ctx.fillStyle = 'rgba(255,255,255,.7)'; }
    else { ctx.fillStyle = chip; ctx.fillRect(cx, y, wId, hB); ctx.fillStyle = BG; }
    txt(ctx, sId, cx + pX, base, sp); cx += wId;
  }
  if (sL || sV) { ctx.fillStyle = `rgba(11,12,10,${o.bgA === undefined ? .86 : o.bgA})`; ctx.fillRect(cx, y, wL + wV, hB); }
  if (sL) { ctx.fillStyle = kind === 'ghost' ? 'rgba(255,255,255,.72)' : o.labCol || WHITE; txt(ctx, sL, cx + pL, base, sp); cx += wL; }
  if (sV) { ctx.fillStyle = o.valCol || (kind === 'coral' ? CORAL : kind === 'white' ? 'rgba(255,255,255,.75)' : LIME); txt(ctx, sV, cx + pL, base, sp); cx += wV; }
  if (o.hi) { ctx.strokeStyle = chip; ctx.globalAlpha = a * .9; ctx.lineWidth = 1; ctx.strokeRect(x - 2.5, y - 2.5, W + 5, hB + 5); }
  ctx.globalAlpha = 1;
  return [x, y, x + W, y + hB];
}

/* thin dotted leader */
export function leader(ctx, x0, y0, x1, y1, col, a) {
  if (a <= .01) return;
  ctx.strokeStyle = col || LIME; ctx.globalAlpha = a; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
}
/* vertical stem of 1 px dots every 3 px (films' stem()) */
export function stem(ctx, x, y, len, col, a) {
  ctx.fillStyle = col || LIME; ctx.globalAlpha = a;
  for (let yy = 6; yy <= len; yy += 3) ctx.fillRect(Math.round(x), Math.round(y - yy), 1, 1);
  ctx.globalAlpha = 1;
}
/* the 3 px anchor dot */
export function adot(ctx, x, y, col, a, s) {
  s = s || 3; ctx.fillStyle = col || LIME; ctx.globalAlpha = a;
  ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s); ctx.globalAlpha = 1;
}
/* bracket corners + a faint dotted frame (films' bracket()) -> the padded box */
export function bracket(ctx, b, col, a, pad, len) {
  if (!b || a <= .01) return null;
  pad = pad === undefined ? 5 : pad; len = len || 9;
  const x0 = Math.round(b[0] - pad) + .5, y0 = Math.round(b[1] - pad) + .5, x1 = Math.round(b[2] + pad) + .5, y1 = Math.round(b[3] + pad) + .5;
  const c = Math.min(len, (x1 - x0) * .35, (y1 - y0) * .35);
  ctx.strokeStyle = col || LIME; ctx.globalAlpha = a; ctx.lineWidth = 1.5; ctx.beginPath();
  for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { ctx.moveTo(px + sx * c, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * c); }
  ctx.stroke(); ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.globalAlpha = a * .45; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]); ctx.globalAlpha = 1;
  return [x0, y0, x1, y1];
}

/* a line of mono runs: segs [[text, colour], ...] (uppercase, .05em). -> end x */
export function runs(ctx, x, y, segs, o) {
  o = o || {};
  const px = o.size || 11.5, sp = px * .05;
  ctx.font = `${o.weight || 400} ${px}px ${MONO}`; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = o.a === undefined ? 1 : o.a;
  let cx = x;
  if (o.align === 'right' || o.align === 'center') {
    let W = 0; for (const [s] of segs) W += measure(ctx, String(s).toUpperCase(), px) * (o.weight && o.weight !== 400 ? 1 : 1);
    cx = o.align === 'right' ? x - W : x - W / 2;
  }
  for (const [s, col] of segs) {
    const S = String(s).toUpperCase();
    ctx.font = `${o.weight || 400} ${px}px ${MONO}`;
    ctx.fillStyle = col; txt(ctx, S, Math.round(cx), Math.round(y), sp);
    cx += measure(ctx, S, px);
  }
  ctx.globalAlpha = 1;
  return cx;
}
/* sans text (title / note), optional wrap width -> lines drawn */
export function sans(ctx, x, y, s, o) {
  o = o || {};
  const px = o.size || 14;
  ctx.font = `${o.weight || 400} ${px}px ${SANS}`; ctx.fillStyle = o.col || WHITE; ctx.globalAlpha = o.a === undefined ? 1 : o.a;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = (o.ls || 0) + 'px';
  const lines = [];
  if (o.wrap) {
    let cur = '';
    for (const w of s.split(' ')) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > o.wrap && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
  } else lines.push(s);
  lines.forEach((l, i) => ctx.fillText(l, Math.round(x), Math.round(y + i * (o.lh || px * 1.42))));
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.globalAlpha = 1;
  return lines.length;
}
/* the kicker: lime square + mono words (films' .kick) */
export function kick(ctx, x, y, s, a) {
  ctx.globalAlpha = a === undefined ? 1 : a;
  ctx.fillStyle = LIME; ctx.fillRect(x, y - 8, 7, 7);
  ctx.globalAlpha = 1;
  runs(ctx, x + 19, y, [[s, 'rgba(255,255,255,.62)']], { size: 12.5, a });
}
/* key chips along a row (films' .keys): [[key, words], ...] centred at x -> width */
export function keys(ctx, x, y, list, a) {
  const px = 11, sp = px * .05, U = s => String(s).toUpperCase();
  ctx.font = `500 ${px}px ${MONO}`;
  const ws = list.map(([k, w]) => { const kw = measure(ctx, U(k), px) + 10, ww = measure(ctx, U(w), px); return { kw, ww, W: 6 + kw + 8 + ww + 10 }; });
  const total = ws.reduce((s, q) => s + q.W, 0) + 8 * (list.length - 1);
  let cx = Math.round(x - total / 2);
  ctx.globalAlpha = a === undefined ? 1 : a; ctx.textBaseline = 'alphabetic';
  list.forEach(([k, w], i) => {
    const q = ws[i], h = 24;
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.strokeRect(cx + .5, y + .5, q.W - 1, h - 1);
    ctx.fillStyle = 'rgba(11,12,10,.6)'; ctx.fillRect(cx + 1, y + 1, q.W - 2, h - 2);
    ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.fillRect(cx + 6, y + 5, q.kw, h - 10);
    ctx.fillStyle = BG; ctx.font = `500 ${px}px ${MONO}`; txt(ctx, U(k), cx + 11, y + 16, sp);
    ctx.fillStyle = 'rgba(255,255,255,.36)'; txt(ctx, U(w), cx + 6 + q.kw + 8, y + 16, sp);
    cx += q.W + 8;
  });
  ctx.globalAlpha = 1;
  return total;
}
/* the confidence bars (films' .bars): rows [[name, p]], the top one lime -> box */
export function bars(ctx, x, y, rows, a) {
  const px = 10.5, sp = px * .05, U = s => String(s).toUpperCase();
  ctx.font = `500 ${px}px ${MONO}`;
  const wn = Math.max(...rows.map(([n]) => measure(ctx, U(n), px)));
  const W = 9 + wn + 9 + 64 + 9 + 34 + 10, H = 8 + rows.length * 16 - 6 + 8;
  ctx.globalAlpha = a; ctx.fillStyle = 'rgba(11,12,10,.72)'; ctx.fillRect(Math.round(x), Math.round(y), W, H);
  let best = 0; rows.forEach(([, p], i) => { if (p > rows[best][1]) best = i; });
  rows.forEach(([n, p], i) => {
    const yy = Math.round(y + 8 + i * 16), top = i === best && p > .5;
    ctx.fillStyle = top ? WHITE : 'rgba(255,255,255,.36)'; ctx.textBaseline = 'alphabetic';
    txt(ctx, U(n), Math.round(x + 9), yy + 8, sp);
    const bx = Math.round(x + 9 + wn + 9);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(bx, yy + 3, 64, 4);
    ctx.fillStyle = top ? LIME : 'rgba(255,255,255,.75)'; ctx.fillRect(bx, yy + 3, Math.round(64 * sat(p)), 4);
    ctx.fillStyle = top ? LIME : 'rgba(255,255,255,.75)'; ctx.textAlign = 'right';
    txt(ctx, p.toFixed(2), bx + 64 + 9 + 34, yy + 8, sp); ctx.textAlign = 'left';
  });
  ctx.globalAlpha = 1;
  return [x, y, x + W, y + H];
}
/* a dotted scale bar: len px for label */
export function scaleBar(ctx, x, y, len, label, a) {
  ctx.globalAlpha = a; ctx.fillStyle = 'rgba(255,255,255,.7)';
  for (let i = 0; i <= len; i += 3) ctx.fillRect(Math.round(x + i), Math.round(y), 1, 1);
  ctx.fillRect(Math.round(x), Math.round(y - 4), 1, 9); ctx.fillRect(Math.round(x + len), Math.round(y - 4), 1, 9);
  ctx.globalAlpha = 1;
  runs(ctx, x + len + 10, y + 4, [[label, 'rgba(255,255,255,.5)']], { size: 10.5, a });
}
/* the calm gradient behind the readout corner (films) */
export function calmCorner(ctx, a) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 640);
  g.addColorStop(0, `rgba(11,12,10,${.62 * a})`); g.addColorStop(1, 'rgba(11,12,10,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 660, 440);
}
export function calmBottom(ctx, W, H, a) {
  const g = ctx.createLinearGradient(0, H, 0, H - 150);
  g.addColorStop(0, `rgba(11,12,10,${.7 * a})`); g.addColorStop(1, 'rgba(11,12,10,0)');
  ctx.fillStyle = g; ctx.fillRect(0, H - 150, W, 150);
}
