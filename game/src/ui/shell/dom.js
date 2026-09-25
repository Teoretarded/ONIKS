/* Small DOM helpers for the shell. */

export const $ = id => document.getElementById(id);

/* h('div.row.on#id', { data-x: 1, onclick }, ...children) */
export function h(sel, attrs, ...kids) {
  const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, k, v) => { if (k === '.') el.classList.add(v); else el.id = v; });
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const pad2 = n => String(n).padStart(2, '0');

/* the Orbital highlighter swipe (ORB.swipe from the kit), empty when the kit is missing */
export const swipe = seed => (window.ORB ? window.ORB.swipe(seed, { a: 1 }) : '');

/* key hint chips: [['↑↓', 'Select'], ['Esc', 'Back']]; the ones that name a single key can also be clicked */
const CHIP_KEY = { Enter: 'Enter', Esc: 'Escape', Space: ' ', G: 'g', F: 'f', H: 'h', P: 'p' };
export const keysHtml = list => list.map(([k, t]) => `<span${CHIP_KEY[k] ? ` data-key="${esc(CHIP_KEY[k])}"` : ''}><b>${esc(k)}</b>${esc(t)}</span>`).join('');

/* stage fit: identical to STAGE.fit in the films, so the menu sits exactly over the film's layout */
export function fitStage() {
  const st = $('stage'), s = Math.min(innerWidth / 1920, innerHeight / 1080);
  st.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
  return s;
}

/* restart a CSS animation class */
export function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

export const fmtTime = s => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };

/* the row a screen was left from for play.html (the museum), to come back onto it: keepFocus('campaign', 'anatomy')
   before the launch, takeFocus('campaign') -> 'anatomy' once when the screen opens again */
const FOCUS_KEY = 'oniks.shell.focus';
export function keepFocus(screen, row) { try { sessionStorage.setItem(FOCUS_KEY, screen + ':' + row); } catch (e) { /* */ } }
export function takeFocus(screen) {
  try { const v = sessionStorage.getItem(FOCUS_KEY); if (v && v.startsWith(screen + ':')) { sessionStorage.removeItem(FOCUS_KEY); return v.slice(screen.length + 1); } } catch (e) { /* */ }
  return null;
}
