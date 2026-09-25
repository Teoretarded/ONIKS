/* Map preview panel for the setup and briefing screens: a hairline frame sized to the map's aspect, the
   caption above it (name, size), readouts below. Draws through mapsrc.preview (world/preview.js when present). */
import { h, esc } from './dom.js';
import * as MS from './mapsrc.js';

const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';

export function previewPanel(o = {}) {
  const BW = o.w || 700, BH = o.h || 620;
  const el = h('div.pv', { style: `width:${BW}px;height:${BH + 90}px;` + (o.style || '') });
  const frame = h('div.frame'), fl = h('div.fl'), cv = h('canvas'), wt = h('div.wait');
  const facts = h('div.facts.ro');
  frame.append(fl, cv, wt);
  el.append(frame, facts);
  let cur = null, token = 0, stop = null;

  /* o: { extra(f) -> html above the readout, weather, time (mission overrides), sites: false hides the objective count } */
  async function show(id, o) {
    o = typeof o === 'function' ? { extra: o } : (o || {});
    const extra = o.extra;
    const t = ++token;
    cur = id;
    const meta = MS.byId(id);
    const sz = meta.size || [1, 1], asp = sz[0] / sz[1];
    let w = BW, hh = Math.round(BW / asp);
    if (hh > BH) { hh = BH; w = Math.round(BH * asp); }
    frame.style.cssText = `width:${w}px;height:${hh}px;`;
    // draw at the pixels the stage really shows (stage scale x device pixels), text and marks scaled to match
    const k = Math.max(.5, Math.min(2, pixelScale()));
    cv.width = Math.round(w * k); cv.height = Math.round(hh * k); cv.style.width = w + 'px'; cv.style.height = hh + 'px';
    facts.style.top = (hh + 18) + 'px';
    fl.innerHTML = `<span>Map · ${esc(meta.name)}</span><span class="sp"></span><i>${esc(sizeText(sz))}</i>`;
    wt.style.display = '';
    if (stop) { stop(); stop = null; }
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    facts.innerHTML = extra ? extra(null) : '';
    const f = await MS.facts(id);
    if (t !== token) return;
    fl.innerHTML = `<span>Map · ${esc(f.name)}</span><span class="sp"></span><i>${esc(f.size)}</i>`;
    const bits = [`Weather <b>${esc(cap(o.weather || f.weather))}</b>`];
    if (o.time || f.time) bits.push(`Time <b>${esc(cap(o.time || f.time))}</b>`);
    if (f.objectives != null && o.sites !== false) bits.push(`Objectives <b>${f.objectives}</b>`);
    facts.innerHTML = (extra ? extra(f) : '') + `<div>${bits.join(' · ')}</div>`;
    const img = await MS.previewImage(id, cv.width, cv.height, { dpr: k });
    if (t !== token) return;
    wt.style.display = 'none';
    stop = MS.scanReveal(cv, img);
  }
  return { el, show, frame, get id() { return cur; } };
}

export function pixelScale() {
  const st = document.getElementById('stage'), r = st && st.getBoundingClientRect();
  return (r && r.width ? r.width / 1920 : 1) * (window.devicePixelRatio || 1);
}

function sizeText(sz) { return sz && sz[0] ? `${Math.round(sz[0] / 1000)} × ${Math.round(sz[1] / 1000)} km` : ''; }
