/* SETTINGS: every setting as a row of choices (saved on change to localStorage oniks.settings), in two tabs:
   General (graphics, sound, controls, the menu film; the keybinds reference on the right) and Camera (the cinematic
   camera and the kill cam, in two columns). Tab / Q E switch tabs (or click them). Changing the menu film swaps the
   film behind, live. */
import { h, esc, keysHtml } from '../dom.js';
import { sfx } from '../sfx.js';
import { Form } from '../form.js';
import { SETTINGS, KEYBINDS, NOTES, TABS, tabOf, getSettings, setSetting } from '../../../data/settings.js';

const BLURB = NOTES;   // one true line per setting (data/settings.js; the in-game panel shows the same)

export function settingsScreen(app) {
  const el = h('section.scr#scr-settings');
  const kick = h('div.kick', h('i'), h('span', '04 · Settings'));
  const tabsEl = h('div.stabs');
  const formEl = h('div.form.compact', { style: 'top:196px' });
  const blurb = h('div.sblurb');
  const binds = h('div.binds');
  const keys = h('div.keys.skeys', { html: keysHtml([['Tab', 'Camera / General'], ['↑↓', 'Select'], ['←→', 'Change'], ['Esc', 'Back']]) });
  el.append(kick, tabsEl, formEl, blurb, binds, keys);
  let form = null, tab = 'general', focusOf = {};

  // three columns (the in-game help's order): Camera, View and time | Select, Inspect | Orders, Sandbox; a row that
  // belongs to one side or to the sandbox says so
  const COLS = [['Camera', 'View and time'], ['Select', 'Inspect'], ['Orders', 'Sandbox']];
  const grp = g => `<div class="g"><div class="lbl">${esc(g.group)}</div>${g.binds.map(([k, t, o]) => `<div class="b"><span>${esc(t)}${o && o.side ? ` <em>${esc(o.side)}</em>` : ''}</span><b>${esc(k)}</b></div>`).join('')}</div>`;
  binds.classList.add('c3');
  binds.innerHTML = COLS.map(c => `<div class="col">${c.map(n => KEYBINDS.find(g => g.group === n)).filter(Boolean).map(grp).join('')}</div>`).join('')
    + KEYBINDS.filter(g => !COLS.flat().includes(g.group)).map(grp).join('');

  function tabsHtml() {
    tabsEl.innerHTML = TABS.map(([id, t], i) => `<span class="t${id === tab ? ' sel' : ''}" data-t="${id}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="tx">${esc(t)}</span></span>`).join('');
    tabsEl.querySelectorAll('[data-t]').forEach(q => q.addEventListener('click', () => setTab(q.dataset.t)));
  }
  function setTab(t) {
    if (t === tab) return;
    if (form) focusOf[tab] = form.i;
    tab = t; sfx.tick(); build();
  }
  function build() {
    const s = getSettings();
    tabsHtml();
    formEl.innerHTML = '';
    const cam = tab === 'camera';
    formEl.classList.toggle('cam', cam);
    binds.style.display = cam ? 'none' : '';
    const rows = [];
    let grp = null;
    for (const d of SETTINGS) {
      if (tabOf(d) !== tab) continue;
      if (d.group !== grp) { grp = d.group; rows.push({ group: grp }); }
      rows.push({ id: d.key, label: d.label, choices: d.choices, value: s[d.key], meter: d.meter, cycle: d.cycle, multi: d.multi, blurb: BLURB[d.key],
        off: d.key === 'cineMix' || d.key === 'cineMixEvery' ? f => f.value('cineMode') !== 'mix' : undefined });
    }
    rows.push({ gap: true }, { id: 'back', label: 'Back', action: true, blurb: 'Settings are saved as you change them.' });
    form = new Form(formEl, {
      rows, blurb, enter: 'cycle', start: focusOf[tab],
      onChange(id, v) {
        setSetting(id, v);
        if (id === 'menuFilm') app.menuFilmChanged(v);
      },
      onAction() { sfx.back(); app.go('menu', { focus: 3 }); },
    });
    // the Camera tab: its two groups side by side (the kill cam's column starts at its heading)
    if (cam) { const g = formEl.querySelectorAll('.grp'); if (g[1]) g[1].classList.add('colbreak'); }
    placeBlurb();
  }
  function placeBlurb() { blurb.style.top = (196 + formEl.offsetHeight + 26) + 'px'; }

  return {
    id: 'settings', el, mode: 'sub', shade: 'full',
    enter() { build(); requestAnimationFrame(placeBlurb); },
    key(e) {
      if (e.key === 'Escape') { sfx.back(); app.go('menu', { focus: 3 }); return true; }
      if (e.key === 'Tab' || e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E' || e.key === 'PageUp' || e.key === 'PageDown') {
        const i = TABS.findIndex(t => t[0] === tab), d = e.key === 'q' || e.key === 'Q' || e.key === 'PageUp' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1;
        setTab(TABS[(i + d + TABS.length) % TABS.length][0]);
        e.preventDefault && e.preventDefault();
        return true;
      }
      return form ? form.key(e) : false;
    },
  };
}
