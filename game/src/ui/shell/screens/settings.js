/* SETTINGS: every setting as a row of choices (saved on change to localStorage oniks.settings), the keybinds
   reference on the right. Changing the menu film swaps the film behind, live. */
import { h, esc, keysHtml } from '../dom.js';
import { sfx } from '../sfx.js';
import { Form } from '../form.js';
import { SETTINGS, KEYBINDS, getSettings, setSetting } from '../../../data/settings.js';

const BLURB = {
  renderScale: v => v < 1 ? `Draws at ${Math.round(v * 100)}% of the screen's pixels and scales up. Faster.` : 'Draws at the full resolution of the screen.',
  dotDensity: v => ({ low: 'Fewer dots per model and per square of ground. Fastest.', medium: 'A lighter cloud.', high: 'The films\' density.', ultra: 'Denser than the films. Needs a strong GPU.' }[v]),
  effects: v => ({ low: 'Flashes and trails only.', medium: 'Smoke and sparks, fewer lights.', high: 'Smoke, debris, sparks and dynamic light, as in the films.' }[v]),
  showFps: v => v ? 'Frame time in the corner of the screen.' : 'No frame counter.',
  volume: v => `Master volume ${Math.round(v * 100)}%. Films, interface and battle.`,
  uiSound: v => v ? 'Clicks and blips on the menus and the HUD.' : 'Silent menus and HUD.',
  edgePan: v => v ? 'The camera pans when the pointer touches a screen edge.' : 'Pan with W A S D or the middle button only.',
  invertRotate: v => v ? 'Right-drag and Q E turn the camera the other way.' : 'Right-drag and Q E turn the camera as the pointer moves.',
  timeRate: v => `Matches start at x${v}. Launches and new contacts drop to x1.`,
  menuFilm: v => v === 'random' ? 'A different favourite film behind the menu each time.' : 'This film plays behind the menu.',
};

export function settingsScreen(app) {
  const el = h('section.scr#scr-settings');
  const kick = h('div.kick', h('i'), h('span', '04 · Settings'));
  const formEl = h('div.form.compact', { style: 'top:176px' });
  const blurb = h('div.sblurb');
  const binds = h('div.binds');
  const keys = h('div.keys.skeys', { html: keysHtml([['↑↓', 'Select'], ['←→', 'Change'], ['Esc', 'Back']]) });
  el.append(kick, formEl, blurb, binds, keys);
  let form = null;

  binds.innerHTML = KEYBINDS.map(g => `<div class="g"><div class="lbl">${esc(g.group)}</div>${g.binds.map(([k, t]) => `<div class="b"><span>${esc(t)}</span><b>${esc(k)}</b></div>`).join('')}</div>`).join('');

  function build() {
    const s = getSettings();
    formEl.innerHTML = '';
    const rows = [];
    let grp = null;
    for (const d of SETTINGS) {
      if (d.group !== grp) { grp = d.group; rows.push({ group: grp }); }
      rows.push({ id: d.key, label: d.label, choices: d.choices, value: s[d.key], meter: d.meter, cycle: d.cycle, blurb: BLURB[d.key] });
    }
    rows.push({ gap: true }, { id: 'back', label: 'Back', action: true, blurb: 'Settings are saved as you change them.' });
    form = new Form(formEl, {
      rows, blurb, enter: 'cycle',
      onChange(id, v) {
        setSetting(id, v);
        if (id === 'menuFilm') app.menuFilmChanged(v);
      },
      onAction() { sfx.back(); app.go('menu', { focus: 3 }); },
    });
    blurb.style.top = (176 + formEl.offsetHeight + 26) + 'px';
  }

  return {
    id: 'settings', el, mode: 'sub', shade: 'full',
    enter() { build(); requestAnimationFrame(() => { blurb.style.top = (176 + formEl.offsetHeight + 26) + 'px'; }); },
    key(e) {
      if (e.key === 'Escape') { sfx.back(); app.go('menu', { focus: 3 }); return true; }
      return form ? form.key(e) : false;
    },
  };
}
