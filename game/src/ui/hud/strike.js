/* The Launch picker (G): while the orders system's 'strike' mode is armed, a small panel over the command card lists
   the selection's rounds, one row per round: the key (1-9), the name, what the launchers carry and how many rounds
   will fire. Each row is judged at the point under the cursor (orders.strikeInfo): a round that cannot hit what is
   there is greyed with the reason (AIR TARGETS ONLY, SEA TARGETS ONLY, OUT OF RANGE · 130 / 110 KM, NEEDS A TRACK).
   Click a row (or its key) to pick it, again for one more round; the − / + and the wheel over a row set the count,
   Shift+key one fewer. The world click (or a minimap click) fires; Esc or G closes. */
import { esc } from './fmt.js';

export function createStrike(game, hud, parent) {
  const el = document.createElement('div'); el.className = 'h-buy h-strike'; el.style.display = 'none'; parent.appendChild(el);
  addStyle();
  let key = '', last = -1, shown = false;
  const O = () => game.getSystem('orders');

  el.addEventListener('mousedown', e => {
    e.stopPropagation(); e.preventDefault();
    const o = O(); if (!o || !o.strikePick) return;
    const d = e.target.closest('[data-d]'), r = e.target.closest('[data-i]');
    if (e.target.closest('[data-x]')) { o.setMode(null); hud.click(); return; }
    if (!r) return;
    o.strikePick(+r.dataset.i, d ? +d.dataset.d : e.button === 2 ? -1 : 0);
    hud.click(); last = -1;
  });
  el.addEventListener('wheel', e => {
    e.preventDefault(); e.stopPropagation();
    const o = O(), r = e.target.closest('[data-i]');
    if (o && o.strikePick && r) { o.strikePick(+r.dataset.i, e.deltaY < 0 ? 1 : -1); last = -1; }
  }, { passive: false });

  function render(info) {
    const rows = info.rows;
    let h = `<div class="hd"><span class="kick"><i></i>Launch</span><span class="sup">click the map · minimap too</span></div><div class="rows">`;
    for (const r of rows) {
      const cls = 'it hit' + (r.ok ? '' : ' off') + (r.n ? ' on' : '');
      const right = r.ok || !r.why
        ? `<span class="c">${r.stock} / ${r.full}</span><span class="ct"><b data-d="-1">−</b><u>${r.n || '·'}</u><b data-d="1">+</b></span>`
        : `<span class="why">${esc(r.why)}</span>`;
      h += `<div class="${cls}" data-i="${r.i}"><span class="n">${r.i < 9 ? r.i + 1 : ''}</span><i class="sq"></i><span class="lab">${esc(r.name)}<em>${esc(r.cls)}</em></span>${right}</div>`;
    }
    h += `</div><div class="keys"><span><b>1–${Math.min(9, rows.length)}</b>Pick · again +1</span><span><b>Shift</b>−1 · keep aiming</span><span class="hit" data-x="1"><b>Esc</b>Close</span></div>`;
    return h;
  }

  return {
    update() {
      const o = O(), m = o && o.mode;
      const on = !!(m && m.kind === 'strike' && o.strikeInfo);
      if (on !== shown) { shown = on; el.style.display = on ? '' : 'none'; key = ''; }
      if (!on || game.realT - last < .12) return;
      last = game.realT;
      const A = m.aim && m.aim.w ? m.aim.w : null;
      const info = o.strikeInfo(A);
      const h = render(info);
      if (h !== key) { key = h; el.innerHTML = h; }
    },
  };
}

function addStyle() {
  if (document.getElementById('oniks-strike-css')) return;
  const s = document.createElement('style'); s.id = 'oniks-strike-css';
  s.textContent = `
  .h-strike { width: 560px; }
  .h-strike .hd .sup { text-transform: none; letter-spacing: 0; font: 400 13px/1 var(--sans); color: var(--faint); }
  .h-strike .it { grid-template-columns: 16px 9px 1fr 70px 92px; }
  .h-strike .it .lab em { font: 400 11px/1 var(--mono); font-style: normal; letter-spacing: .05em; text-transform: uppercase; color: var(--faint); margin-left: 10px; }
  .h-strike .it .ct { display: flex; justify-content: flex-end; align-items: center; gap: 8px; font: 400 12px/1 var(--mono); }
  .h-strike .it .ct b { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; color: rgba(255,255,255,.55); border: 1px solid var(--hair); font-weight: 400; }
  .h-strike .it .ct b:hover { color: #0B0C0A; background: var(--lime); border-color: var(--lime); }
  .h-strike .it .ct u { text-decoration: none; min-width: 18px; text-align: center; color: rgba(255,255,255,.5); font-variant-numeric: tabular-nums; }
  .h-strike .it.on { color: #fff; }
  .h-strike .it.on .n { color: var(--lime); }
  .h-strike .it.on .sq { transform: scale(1); }
  .h-strike .it.on .ct u { color: var(--lime); }
  .h-strike .it .why { grid-column: 4 / 6; justify-self: end; font: 400 11px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: rgba(255,106,61,.75); }
  .h-strike .it.off.on .lab { color: rgba(255,255,255,.4); }
  .h-strike .keys { display: flex; gap: 18px; font: 400 11px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: var(--faint); }
  .h-strike .keys b { font: 500 10.5px/1 var(--mono); color: #0B0C0A; background: rgba(255,255,255,.78); padding: 3px 5px 2px; margin-right: 7px; }
  .h-strike .keys .hit { cursor: pointer; }`;
  document.head.appendChild(s);
}
