/* MAIN MENU: the five entries in the layout of the film behind (bottom row, left column, Orbital rows),
   and QUIT: the menu stands down, the film plays on alone. */
import { h, esc, pad2, swipe, keysHtml } from '../dom.js';
import { sfx } from '../sfx.js';

/* the entries only: no line of subtext under them (the user's rule: titles, nothing that explains them) */
export const ITEMS = ['Sandbox', 'Combat', 'Campaign', 'Settings', 'Quit'];
const TARGET = ['sandbox', 'combat', 'campaign', 'settings', 'quit'];

export function menuScreen(app) {
  const el = h('section.scr#scr-menu');
  const mm = h('div#mm'), keys = h('div.abs.keys#mmKeys');
  el.append(mm, keys);
  let i = 0, busy = false, items = [];

  function build() {
    const orb = app.theme === 'orb', row = app.layout === 'L-row';
    mm.innerHTML = ITEMS.map((t, k) => `<div class="it" data-k="${k}"><span class="n">${pad2(k + 1)}</span><i class="sq"></i><span class="lab">${swipe('mm' + k)}<span class="tx">${esc(t)}</span></span><span class="go">${orb && app.layout === 'L-orbA' ? '↵' : '→'}</span><i class="bar"></i></div>`).join('');
    items = [...mm.children];
    items.forEach((it, k) => {
      it.addEventListener('mouseenter', () => { if (!busy) set(k); });
      it.addEventListener('click', () => { set(k, true); go(); });
    });
    keys.innerHTML = keysHtml(orb ? [['↑↓', 'Select'], ['Enter', 'Open'], ['G', 'Graphics'], ['Esc', 'Quit']]
      : [[row ? '←→' : '↑↓', 'Select'], ['Enter', 'Open'], ['G', 'Graphics'], ['Esc', 'Quit']]);
    set(i, true);
  }
  function set(k, quiet) {
    k = (k + ITEMS.length) % ITEMS.length;
    if (k === i && !quiet && items[k].classList.contains('on')) return;
    i = k;
    items.forEach((it, j) => it.classList.toggle('on', j === k));
    if (!quiet) sfx.move();
  }
  function go() {
    if (busy) return; busy = true;
    sfx.enter();
    const it = items[i]; it.classList.add('go');
    setTimeout(() => { it.classList.remove('go'); busy = false; app.go(TARGET[i]); }, 420);
  }

  return {
    id: 'menu', el, mode: 'menu', shade: null,
    build,
    enter(p) { busy = false; if (p && p.focus != null) set(p.focus, true); },
    key(e) {
      if (busy) return true;
      const row = app.layout === 'L-row';
      const prev = row ? ['ArrowLeft', 'a', 'A', 'ArrowUp', 'w', 'W'] : ['ArrowUp', 'w', 'W', 'ArrowLeft', 'a', 'A'];
      const next = row ? ['ArrowRight', 'd', 'D', 'ArrowDown', 's', 'S'] : ['ArrowDown', 's', 'S', 'ArrowRight', 'd', 'D'];
      if (prev.includes(e.key)) set(i - 1);
      else if (next.includes(e.key)) set(i + 1);
      else if (e.key === 'Enter' || e.key === ' ') go();
      else if (e.key === 'Escape') { if (i === 4) go(); else set(4); }
      else if (e.key === 'g' || e.key === 'G') { set(3); go(); }
      else return false;
      return true;
    },
  };
}

export function quitScreen(app) {
  const el = h('section.scr#scr-quit');
  const msg = h('div.abs#quitMsg', h('i'), h('span', 'Standing the battery down'));
  const keys = h('div.abs.keys#quitKeys', { html: keysHtml([['Esc', 'Menu']]) });
  el.append(msg, keys);
  let tm = [];
  const clear = () => { tm.forEach(clearTimeout); tm = []; };
  const back = () => { sfx.back(); app.go('menu', { focus: 4 }); };
  el.addEventListener('click', back);
  return {
    id: 'quit', el, mode: 'bare', shade: null, logo: false,
    enter() {
      clear();
      msg.querySelector('span').textContent = app.theme === 'orb' ? 'Stand the battery down.' : 'Standing the battery down';
      msg.classList.add('on'); keys.classList.remove('on');
      tm.push(setTimeout(() => msg.classList.remove('on'), 1700));
      tm.push(setTimeout(() => keys.classList.add('on'), 2300));
      tm.push(setTimeout(() => keys.classList.remove('on'), 6500));
      el.style.pointerEvents = 'auto';
    },
    leave() { clear(); msg.classList.remove('on'); keys.classList.remove('on'); },
    key(e) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { back(); return true; }
      keys.classList.add('on'); clearTimeout(tm[3]); tm[3] = setTimeout(() => keys.classList.remove('on'), 3000);
      return false;
    },
  };
}
