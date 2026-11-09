/* Reinforcements (B): the side's roster as rows (key, designation, cost in SUP, time to arrive) and the queue of what
   is on its way with its progress. Bought through sim.buy; a row is greyed while supply is short. Keys 1-n buy while
   the panel is open, B / Esc close it. */
import { buyable } from '../../data/units.js';
import { esc, dur, dots, sat } from './fmt.js';

const SHORTN = { tel: 'K340P TEL', radar: 'Monolith-B radar', pantsir: 'Pantsir-S1', catapult: 'Orlan-10 catapult', drone: 'Orlan-10 UAV',
  transloader: 'K342P transloader', ddg: 'DDG-51 Arleigh Burke', helo: 'MH-60R Seahawk', fighter: 'F/A-18E Super Hornet',
  bal: 'Bal · 3K60 launcher', ssk: 'Kilo 636.3 · SSK', aew: 'E-2D Advanced Hawkeye', ssn: 'Virginia · SSN',
  lhd: 'LHD Wasp · 3 LCAC · 8 ACV', lcac: 'LCAC · into an LHD', acv: 'ACV-1.1 · into an LHD', kornet: 'Kornet-EM · Tigr-M',
  s400: 'S-400 · 5P85SM2-01 launcher', s400r: 'S-400 · 92N6E radar', bereg: 'A-222 Bereg · 130 mm', cg: 'CG-47 Ticonderoga', lcs: 'LCS-2 Independence' };

export function createReinforce(game, hud, parent) {
  const { sim } = game;
  const el = document.createElement('div'); el.className = 'h-buy'; el.style.display = 'none'; parent.appendChild(el);
  let open = false, key = '', last = -1;

  el.addEventListener('mousedown', e => {
    e.stopPropagation(); e.preventDefault();
    const r = e.target.closest('[data-t]');
    if (r) buy(r.dataset.t);
    else if (e.target.closest('[data-x]')) toggle(false);
  });
  const list = () => buyable(game.side);

  function buy(type) {
    const ok = sim.buy(game.side, type), d = game.UNITS[type];
    // the landing force boards an LHD: refused when none has room (the supply is not the reason)
    const why = !ok && d && d.embark && sim.sides[game.side].supply >= d.cost ? 'No room aboard an LHD' : 'Not enough supply';
    game.bus.emit('toast', { text: ok ? `${SHORTN[type] || type} · on the way` : why, bad: !ok });
    game.bus.emit('buy', { type, ok });
    hud.click(!ok);
    last = -1;
  }
  function toggle(on) {
    open = on === undefined ? !open : !!on;
    el.style.display = open ? '' : 'none';
    last = -1;
    return open;
  }

  function render() {
    const S = sim.sides[game.side], L = list();
    let h = `<div class="hd"><span class="kick"><i></i>Reinforce</span><span class="sup">Sup <b>${Math.floor(S.supply)}</b></span></div><div class="rows">`;
    L.forEach((t, i) => {
      const d = game.UNITS[t], ok = S.supply >= d.cost;
      h += `<div class="it hit${ok ? '' : ' off'}" data-t="${t}"><span class="n">${i + 1}</span><i class="sq"></i><span class="lab">${esc(SHORTN[t] || d.name)}</span><span class="c">${d.cost}</span><span class="tm">${dur(d.buildTime)}</span></div>`;
    });
    h += '</div>';
    if (S.queue.length) {
      h += '<div class="q"><div class="lbl">On the way</div>';
      const q = S.queue.slice().sort((a, b) => a.at - b.at);
      for (const e of q.slice(0, 6)) {
        const k = sat((sim.t - e.ordered) / Math.max(1, e.at - e.ordered));
        h += `<div class="qr"><span class="lab">${esc(SHORTN[e.type] || e.type)}</span>${dots(k, 16, 'l')}<span class="tm">${dur(e.at - sim.t)}</span></div>`;
      }
      if (q.length > 6) h += `<div class="qr"><span class="lab">+${q.length - 6} more</span></div>`;
      h += '</div>';
    }
    h += `<div class="keys"><span><b>1–${L.length}</b>Buy</span><span class="hit" data-x="1"><b>B</b>Close</span></div>`;
    return h;
  }

  return {
    get open() { return open; },
    toggle,
    onKey(e) {
      if (!open || e.type !== 'keydown') return false;
      if (e.code === 'Escape' || e.code === 'KeyB') { toggle(false); return true; }
      const n = /^Digit[1-9]$/.test(e.code) && !e.ctrlKey && !e.metaKey ? +e.code.slice(5) : 0, L = list();
      if (n && L[n - 1]) { buy(L[n - 1]); return true; }
      return false;
    },
    update() {
      if (!open || game.realT - last < .2) return;
      last = game.realT;
      const h = render();
      if (h !== key) { key = h; el.innerHTML = h; }
    },
  };
}
