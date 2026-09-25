/* Debug: a full-resolution still of the game WITH the DOM HUD (ONIKS.hudShot(name) -> game/shots/<name>.png).
   The GL and overlay canvases are copied, then the #ui layer is painted element by element (backgrounds, 1 px
   borders and outlines, inset hairlines, canvases, inline SVG, text with its font, spacing and case, the gradient
   veils: linear / radial backgrounds and ::before calms). Other pseudo-element ornaments (the dotted underlines) are
   left out. For review only; never called by the game. */

export async function hudShot(name, o) {
  o = o || {};
  const gl = document.getElementById('gl'), ov = document.getElementById('ov'), ui = document.getElementById('ui');
  const W = innerWidth, H = innerHeight, k = o.scale || (window.devicePixelRatio || 1);
  const cv = document.createElement('canvas'); cv.width = Math.round(W * k); cv.height = Math.round(H * k);
  const c = cv.getContext('2d');
  c.fillStyle = '#0B0C0A'; c.fillRect(0, 0, cv.width, cv.height);
  // render one frame now and copy it in the same task (the GL buffer is only valid until the page composites)
  if (window.ONIKS && window.ONIKS.advance) window.ONIKS.advance(o.dt || 1e-4, 1);
  if (gl) c.drawImage(gl, 0, 0, cv.width, cv.height);
  if (ov) c.drawImage(ov, 0, 0, cv.width, cv.height);
  c.scale(k, k); K = k;
  if (ui && getComputedStyle(ui).display !== 'none') await paint(c, ui, 1);
  const url = cv.toDataURL('image/png');
  const r = await fetch('/save?path=game/shots/' + name + '.png', { method: 'POST', body: url });
  return r.status;
}

let K = 1;
const col = s => s && s !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(s);

/* the calming gradients: radial-gradient(Wpx Hpx at X% Y%, stops...) layers over the element's box */
function radials(c, bg, r, a, z) {
  const parts = bg.split(/radial-gradient\(/).slice(1);
  for (const p of parts) {
    // (the computed value drops a centred position: "at 50% 50%" is optional)
    const m = p.match(/^(?:ellipse\s+)?([\d.]+)px\s+([\d.]+)px(?:\s+at\s+([\d.]+)%\s+([\d.]+)%)?,\s*(.*)\)\s*,?\s*$/);
    if (!m) continue;
    const px = m[3] === undefined ? 50 : +m[3], py = m[4] === undefined ? 50 : +m[4];
    const W = m[1] * z, H = m[2] * z, cx = r.left + r.width * px / 100, cy = r.top + r.height * py / 100;
    const stops = m[5].split(/,(?![^(]*\))/).map(s => s.trim());
    c.save(); c.translate(cx, cy); c.scale(1, H / W);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, W);
    stops.forEach((s, i) => { const mm = s.match(/^(rgba?\([^)]*\)|#\w+)\s*([\d.]+%)?$/); if (mm) g.addColorStop(mm[2] ? parseFloat(mm[2]) / 100 : i / Math.max(1, stops.length - 1), mm[1]); });
    c.globalAlpha = a; c.fillStyle = g; c.fillRect(-W, -W, 2 * W, 2 * W);
    c.restore();
  }
}

/* linear-gradient(<angle | to side>, stops...) layers over a box [x0, y0, x1, y1] */
const SIDE = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 };
function linears(c, bg, b, a) {
  let i = 0;
  while ((i = bg.indexOf('linear-gradient(', i)) >= 0) {
    // the arguments up to the matching parenthesis
    let j = i + 16, d = 1;
    for (; j < bg.length && d; j++) { if (bg[j] === '(') d++; else if (bg[j] === ')') d--; }
    const args = bg.slice(i + 16, j - 1).split(/,(?![^(]*\))/).map(s => s.trim());
    i = j;
    let ang = 180;
    if (/^-?[\d.]+deg$/.test(args[0])) ang = parseFloat(args.shift());
    else if (SIDE[args[0]] !== undefined) ang = SIDE[args.shift()];
    const w = b[2] - b[0], h = b[3] - b[1];
    if (w <= 0 || h <= 0 || !args.length) continue;
    const t = ang * Math.PI / 180, dx = Math.sin(t), dy = -Math.cos(t), L = Math.abs(w * dx) + Math.abs(h * dy);
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const g = c.createLinearGradient(cx - dx * L / 2, cy - dy * L / 2, cx + dx * L / 2, cy + dy * L / 2);
    args.forEach((s, k) => { const m = s.match(/^(rgba?\([^)]*\)|#\w+|transparent)\s*([\d.]+%)?$/); if (m) g.addColorStop(Math.min(1, Math.max(0, m[2] ? parseFloat(m[2]) / 100 : k / Math.max(1, args.length - 1))), m[1] === 'transparent' ? 'rgba(0,0,0,0)' : m[1]); });
    c.save(); c.globalAlpha = a; c.fillStyle = g; c.fillRect(b[0], b[1], w, h); c.restore();
  }
}

async function paint(c, el, alpha) {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return;
  const a = alpha * (+cs.opacity);
  if (a <= .01) return;
  const r = el.getBoundingClientRect();
  if (el.id === 'perf' && !el.textContent) return;
  c.globalAlpha = a;
  const pb = getComputedStyle(el, '::before'), zz = el.currentCSSZoom || 1;
  // the element's own gradient veil (the help's, the pause menu's), then its ::before calm (radial) or veil (linear:
  // the film maker's), in the pseudo-element's own box
  if (/linear-gradient/.test(cs.backgroundImage)) linears(c, cs.backgroundImage, [r.left, r.top, r.right, r.bottom], a);
  if (pb.content !== 'none' && /radial-gradient/.test(pb.backgroundImage)) radials(c, pb.backgroundImage, r, a, zz);
  if (pb.content !== 'none' && /linear-gradient/.test(pb.backgroundImage)) {
    const px = v => { const n = parseFloat(v); return isFinite(n) ? n * zz : 0; };
    linears(c, pb.backgroundImage, [r.left + px(pb.left), r.top + px(pb.top), r.right - px(pb.right), r.bottom - px(pb.bottom)], a * (+pb.opacity || 1));
  }
  if (col(cs.backgroundColor)) { c.fillStyle = cs.backgroundColor; c.fillRect(r.left, r.top, r.width, r.height); }
  // borders
  const B = [['Top', r.left, r.top, r.width, 0], ['Bottom', r.left, r.bottom, r.width, 0], ['Left', r.left, r.top, 0, r.height], ['Right', r.right, r.top, 0, r.height]];
  for (const [s, x, y, w, h] of B) {
    const bw = parseFloat(cs['border' + s + 'Width']);
    if (bw > 0 && cs['border' + s + 'Style'] !== 'none' && col(cs['border' + s + 'Color'])) {
      c.fillStyle = cs['border' + s + 'Color'];
      c.fillRect(s === 'Right' ? x - bw : x, s === 'Bottom' ? y - bw : y, w || bw, h || bw);
    }
  }
  const ow = parseFloat(cs.outlineWidth);
  if (ow > 0 && cs.outlineStyle !== 'none' && col(cs.outlineColor)) { c.strokeStyle = cs.outlineColor; c.lineWidth = ow; c.strokeRect(r.left - ow / 2, r.top - ow / 2, r.width + ow, r.height + ow); }
  const bs = cs.boxShadow;
  if (bs && bs !== 'none' && /inset/.test(bs)) {
    const m = bs.match(/(rgba?\([^)]*\))/);
    if (m) { c.strokeStyle = m[1]; c.lineWidth = 1; c.strokeRect(r.left + .5, r.top + .5, r.width - 1, r.height - 1); }
  }
  if (el.tagName === 'CANVAS' && el.width) { try { c.drawImage(el, r.left, r.top, r.width, r.height); } catch (e) { /* */ } return; }
  if (el.tagName === 'svg' || el.tagName === 'SVG') {
    const s = new XMLSerializer().serializeToString(el);
    const img = new Image();
    await new Promise(res => { img.onload = res; img.onerror = res; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.includes('xmlns') ? s : s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')); });
    c.globalAlpha = a; try { c.drawImage(img, r.left, r.top, r.width, r.height); } catch (e) { /* */ }
    return;
  }
  const z = el.currentCSSZoom || 1;
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      let s = n.textContent; if (!s.trim()) continue;
      if (cs.textTransform === 'uppercase') s = s.toUpperCase();
      const rg = document.createRange(); rg.selectNodeContents(n);
      const rs = rg.getClientRects(); if (!rs.length) continue;
      const fs = parseFloat(cs.fontSize) * z;
      c.font = `${cs.fontStyle === 'italic' ? 'italic ' : ''}${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
      c.letterSpacing = (cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) * z) + 'px';
      c.fillStyle = cs.color; c.globalAlpha = a; c.textBaseline = 'middle';
      const q = rs[0], txt = s.replace(/\s+/g, ' '), y = q.top + q.height / 2 + fs * .04;
      if (cs.textShadow && cs.textShadow !== 'none') { c.shadowColor = 'rgba(11,12,10,1)'; c.shadowBlur = 4 * z * K; c.shadowOffsetX = 20000 * K; c.fillText(txt, q.left - 20000, y); c.fillText(txt, q.left - 20000, y); c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowColor = 'transparent'; }
      c.fillText(txt, q.left, y);
      c.letterSpacing = '0px';
    } else if (n.nodeType === 1) await paint(c, n, a);
  }
}
