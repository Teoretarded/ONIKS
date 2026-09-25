/* Help (F1) and the in-game settings panel.

   F1 (or the small F1 HELP key chip at the bottom of the HUD): every control, grouped as in data/settings.js KEYBINDS
   (the real bindings of camera.js, select.js, orders.js, time.js, director.js, sensors, inspect, sandbox.js), laid
   out like the films' key hints: mono rows, key chips, thin rules, over the dimmed live game (the pause menu's
   gradient, the battle still moving on the right). Rows for the other side and for the sandbox only are left out.
   Combat and campaign pause while it is up (sandbox runs on). F1 or Esc closes it; a click on its key chips too.

   The pause menu's Settings row opens openSettings(): the key settings (render scale, dot density, effects, auto quality, show FPS,
   master volume, edge pan, auto x1, hit replay) as the Settings screen's rows, applied live and saved through
   data/settings.js (effects: the FX and landmarks systems read game.settings each frame; hit replay: replay.js).
   This system also applies them live for everyone: render scale (R.renderScale), dot density (the terrain's dot
   budget), auto x1 (game.setAutoSlow, kept in step with the pause menu's own row); show FPS, edge pan and volume are
   applied by main.js and the audio system.

   createHelp(game) -> the 'help' system (priority 130: above the pause menu, so its keys are its own while open).
   help.open(on?), help.openSettings({ onClose }), help.active */
import { KEYBINDS, SETTINGS, NOTES, DOT_DENSITY, getSettings, setSetting, onSettings } from '../../data/settings.js';

const PRI_HELP = 130;
const IN_GAME = ['renderScale', 'dotDensity', 'effects', 'autoQuality', 'showFps', 'volume', 'edgePan', 'autoSlow', 'hitReplay'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad2 = n => String(n).padStart(2, '0');
const same = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b;
const SIDE = { coast: 'Coast', fleet: 'Fleet' };

/* the graphite veil behind the help: dark under the three columns (the rows never sit on bright terrain or a model),
   easing out to the right where the battle goes on (over styles/game.css's lighter one); the campaign's mission lines
   step back with the HUD */
const VEIL = `.oniks-help { background: linear-gradient(90deg, rgba(11,12,10,.95) 0%, rgba(11,12,10,.91) 46%, rgba(11,12,10,.78) 66%, rgba(11,12,10,.46) 86%, rgba(11,12,10,.34) 100%); }
body.hud-orbital .oniks-help { background: linear-gradient(90deg, rgba(0,0,0,.95) 0%, rgba(0,0,0,.91) 46%, rgba(0,0,0,.78) 66%, rgba(0,0,0,.46) 86%, rgba(0,0,0,.34) 100%); }
body.oniks-helping #cmp { opacity: 0; }`;

export function createHelp(game) {
  const root = game.uiRoot || document.body;
  if (!document.getElementById('oniks-help-veil')) {
    const st = document.createElement('style'); st.id = 'oniks-help-veil'; st.textContent = VEIL; document.head.appendChild(st);
  }
  const Q = new URLSearchParams(location.search);
  const cam = game.camera;
  let helpEl = null, setEl = null, chipEl = null, open = false, setOpen = null, wasPaused = false, camKeys = true;

  const snd = name => { const a = game.getSystem('audio'); if (a && a.ui) try { a.ui(name); } catch (e) { /* */ } };
  /* the HUD's scale: 1 at 1080p, never below .8, up to 1.6 */
  const scale = () => Math.max(.8, Math.min(1.6, Math.min(innerWidth / 1920, innerHeight / 1080)));
  function fit(el) {
    if (!el) return;
    const s = scale(), inner = el.firstElementChild;
    inner.style.zoom = s; inner.style.width = (innerWidth / s) + 'px'; inner.style.height = (innerHeight / s) + 'px';
  }

  /* ------------------------------------------------------------ the F1 chip */
  chipEl = document.createElement('div');
  chipEl.className = 'oniks-f1';
  chipEl.innerHTML = '<div class="keys"><span class="hit"><b>F1</b>Help</span></div>';
  chipEl.querySelector('span').addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); toggle(true); snd('tick'); });
  root.appendChild(chipEl);

  /* ------------------------------------------------------------ help */
  function rowsFor(g) {
    return g.binds.filter(b => { const o = b[2] || {}; return (!o.side || o.side === game.side) && (!o.mode || o.mode === game.mode); });
  }
  function buildHelp() {
    if (!helpEl) {
      helpEl = document.createElement('div');
      helpEl.className = 'oniks-help hit always';
      helpEl.addEventListener('mousedown', e => {
        const k = e.target.closest('[data-k]');
        e.preventDefault();
        if (k) { toggle(false); snd('back'); }
      });
      helpEl.addEventListener('wheel', e => e.preventDefault(), { passive: false });
      helpEl.addEventListener('contextmenu', e => e.preventDefault());
      root.appendChild(helpEl);
    }
    const groups = KEYBINDS.filter(g => !g.mode || g.mode === game.mode).map(g => ({ g, rows: rowsFor(g) })).filter(x => x.rows.length);
    // three columns, the groups kept whole, filled in the table's order to the shortest column
    const cols = [[], [], []], hgt = [0, 0, 0];
    const order = ['Camera', 'Select', 'Orders', 'View and time', 'Inspect', 'Sandbox'];
    groups.sort((a, b) => (order.indexOf(a.g.group) + 99) % 99 - (order.indexOf(b.g.group) + 99) % 99);
    groups.forEach((x, i) => { const c = i < 3 ? i : hgt.indexOf(Math.min(...hgt)); cols[c].push(x); hgt[c] += x.rows.length + 2; });
    let n = 0;
    const idx = new Map();
    cols.forEach(c => c.forEach(x => idx.set(x, ++n)));
    const col = list => `<div class="col">${list.map(x => `<div class="g"><div class="gl"><span class="n">${pad2(idx.get(x))}</span><span>${esc(x.g.group)}</span></div>
      <div class="rows">${x.rows.map(([k, t]) => `<div class="r"><b>${esc(k)}</b><span>${esc(t)}</span></div>`).join('')}</div></div>`).join('')}</div>`;
    const where = game.mission ? `${pad2(game.mission.n)} · ${game.mission.title}` : `${game.mode === 'combat' ? 'Combat' : 'Sandbox'} · ${game.map.name || game.map.id}`;
    helpEl.innerHTML = `<div class="hp-in"><div class="blk">
      <div class="kick"><i></i><span>Controls · ${esc(SIDE[game.side] || game.side)} · ${esc(where)}</span></div>
      <div class="cols">${cols.map(col).join('')}</div>
      <div class="keys"><span data-k="F1"><b>F1</b>Close</span><span data-k="Esc"><b>Esc</b>Close</span></div>
    </div></div>`;
    fit(helpEl);
  }
  function toggle(on) {
    on = on === undefined ? !open : !!on;
    if (on === open) return;
    if (on && setOpen) closeSettings();
    open = on;
    if (on) {
      buildHelp();
      helpEl.style.display = '';
      // combat and campaign wait while the player reads; the sandbox runs on
      wasPaused = game.paused;
      if (game.mode !== 'sandbox' && !game.paused) game.pause(true);
      camKeys = cam.keys; cam.keys = false;
    } else {
      if (helpEl) helpEl.style.display = 'none';
      if (game.mode !== 'sandbox' && !wasPaused && game.paused && !menuUp()) game.pause(false);
      cam.keys = camKeys;
    }
    document.body.classList.toggle('oniks-helping', open);
  }
  const menuUp = () => { const m = document.querySelector('.oniks-menu'); return !!(m && m.style.display !== 'none'); };

  /* ------------------------------------------------------------ in-game settings */
  const specs = IN_GAME.map(k => SETTINGS.find(s => s.key === k)).filter(Boolean);
  let focus = 0, onClose = null;
  function buildSettings() {
    if (!setEl) {
      setEl = document.createElement('div');
      setEl.className = 'oniks-set hit always';
      setEl.addEventListener('mousedown', e => {
        e.preventDefault();
        if (e.target.closest('[data-kk]')) { closeSettings(); snd('back'); return; }
        const row = e.target.closest('[data-row]');
        if (!row) return;
        const i = +row.dataset.row;
        const c = e.target.closest('[data-v]');
        if (i >= specs.length) { closeSettings(); snd('back'); return; }
        setFocus(i, true);
        if (c) choose(i, +c.dataset.v);
      });
      setEl.addEventListener('mouseover', e => { const row = e.target.closest('[data-row]'); if (row && +row.dataset.row !== focus) setFocus(+row.dataset.row); });
      setEl.addEventListener('wheel', e => e.preventDefault(), { passive: false });
      setEl.addEventListener('contextmenu', e => e.preventDefault());
      root.appendChild(setEl);
    }
    const s = getSettings(), m = game.mission;
    const title = m ? `${pad2(m.n)} · ${m.title}` : (game.mode === 'combat' ? 'Combat' : 'Sandbox') + ' · ' + (game.map.name || game.map.id);
    const row = (d, i) => {
      const v = s[d.key];
      let vals;
      if (d.meter) {
        const k = d.choices.findIndex(c => same(c[0], v));
        vals = `<span class="meter">${d.choices.slice(1).map((c, j) => `<i data-v="${j + 1}" class="${j + 1 <= k ? 'f' : ''}${j + 1 === k ? ' top' : ''}"></i>`).join('')}</span><span class="mv">${esc(d.choices[k] ? d.choices[k][1] : '')}</span>`;
      } else vals = d.choices.map((c, j) => `<span class="c${same(c[0], v) ? ' sel' : ''}" data-v="${j}"><span class="tx">${esc(c[1])}</span></span>`).join('');
      return `<div class="row${i === focus ? ' on' : ''}" data-row="${i}"><span class="n">${pad2(i + 1)}</span><i class="sq"></i><span class="k">${esc(d.label)}</span><span class="vals">${vals}</span></div>`;
    };
    const back = `<div class="row act${focus === specs.length ? ' on' : ''}" data-row="${specs.length}"><span class="n"></span><i class="sq"></i><span class="lab">Back</span></div>`;
    setEl.innerHTML = `<div class="hp-in"><div class="blk">
      <div class="kick"><i></i><span>${esc(title)} · Settings</span></div>
      <div class="list">${specs.map(row).join('')}<div class="gap"></div>${back}</div>
      <div class="note"></div>
      <div class="keys"><span><b>↑↓</b>Select</span><span><b>←→</b>Change</span><span data-kk="Esc"><b>Esc</b>Back</span></div>
    </div></div>`;
    fit(setEl);
    note();
  }
  function note() {
    const el = setEl && setEl.querySelector('.note'); if (!el) return;
    const d = specs[focus], v = d ? getSettings()[d.key] : null;
    const t = d ? (NOTES[d.key] ? NOTES[d.key](v) : '') : 'Everything else is on the Settings screen of the main menu.';
    if (el.textContent !== t) { el.textContent = t; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
  }
  function setFocus(i, quiet) {
    const n = specs.length + 1;
    i = (i + n) % n;
    if (i === focus) return;
    focus = i;
    setEl.querySelectorAll('[data-row]').forEach(r => r.classList.toggle('on', +r.dataset.row === i));
    note();
    if (!quiet) snd('move');
  }
  function choose(i, j) {
    const d = specs[i]; if (!d || !d.choices[j]) return;
    const v = d.choices[j][0];
    if (same(getSettings()[d.key], v)) return;
    setSetting(d.key, v);            // applied live by the onSettings listeners (below, main.js, audio)
    snd('tick');
    buildSettings();
  }
  function step(i, dir) {
    const d = specs[i]; if (!d) return;
    const k = d.choices.findIndex(c => same(c[0], getSettings()[d.key]));
    let j = k + dir;
    if (d.meter) { if (j < 0 || j >= d.choices.length) { snd('deny'); return; } }
    else j = (j + d.choices.length) % d.choices.length;
    choose(i, j);
  }
  function openSettings(o) {
    if (open) toggle(false);
    onClose = o && o.onClose;
    focus = 0;
    setOpen = true;
    buildSettings();
    setEl.style.display = '';
    camKeys = cam.keys; cam.keys = false;
    document.body.classList.add('oniks-helping');
  }
  function closeSettings() {
    if (!setOpen) return;
    setOpen = null;
    if (setEl) setEl.style.display = 'none';
    cam.keys = camKeys;
    document.body.classList.remove('oniks-helping');
    const f = onClose; onClose = null;
    if (f) f();
  }

  /* ------------------------------------------------------------ settings, live */
  const qScale = +Q.get('scale') || 1;
  function apply(s, key) {
    const R = game.R;
    if (!key || key === 'renderScale') { const v = qScale * (s.renderScale || 1); if (Math.abs(R.renderScale - v) > 1e-6) R.renderScale = v; }
    if (!key || key === 'dotDensity') {
      const d = DOT_DENSITY[s.dotDensity] || 1;
      if (R.terrain) { R.terrain.densNear = 140 * d; R.terrain.densFar = 380 * d; }
    }
    if ((!key || key === 'autoSlow') && s.autoSlow !== undefined && !!s.autoSlow !== game.autoSlow) game.setAutoSlow(!!s.autoSlow);
  }
  const offSettings = onSettings(apply);
  // the pause menu's Auto x1 row (game.setAutoSlow) saves through the settings as well
  const offAuto = game.bus.on('autoslow_setting', on => { if (getSettings().autoSlow !== on) setSetting('autoSlow', on); });

  const onResize = () => { fit(helpEl); fit(setEl); };
  addEventListener('resize', onResize);

  return {
    name: 'help', priority: PRI_HELP, always2d: true,
    get active() { return open || !!setOpen; },
    open: toggle, openSettings, closeSettings,
    init() {
      // the stored auto x1 wins over the game's old key (they agree after the first change)
      const s = getSettings();
      if (s.autoSlow !== undefined && !!s.autoSlow !== game.autoSlow) game.setAutoSlow(!!s.autoSlow);
    },
    onKey(e) {
      const down = e.type === 'keydown';
      if (setOpen) {
        if (!down) return true;
        const k = e.code;
        if (k === 'Escape') { closeSettings(); snd('back'); }
        else if (k === 'ArrowUp' || k === 'KeyW') setFocus(focus - 1);
        else if (k === 'ArrowDown' || k === 'KeyS') setFocus(focus + 1);
        else if (k === 'ArrowLeft' || k === 'KeyA') step(focus, -1);
        else if (k === 'ArrowRight' || k === 'KeyD') step(focus, 1);
        else if (k === 'Enter' || k === 'NumpadEnter' || k === 'Space') { if (focus === specs.length) { closeSettings(); snd('back'); } else if (!specs[focus].meter) step(focus, 1); }
        return true;
      }
      if (open) {
        if (down && !e.repeat && (e.code === 'F1' || e.code === 'Escape')) { toggle(false); snd('back'); }
        return true;
      }
      if (down && e.code === 'F1' && !e.repeat) { toggle(true); snd('tick'); return true; }
      return e.code === 'F1';      // never the browser's help
    },
    onPointer() { return open || !!setOpen; },
    /* drawn last: the world tags under the dark side of the help fade out with its gradient (as under the pause menu) */
    draw2d(ov) {
      if (!open) return;
      const c = ov.ctx, w = ov.W * .8;
      c.save();
      c.globalCompositeOperation = 'destination-out';
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.62, 'rgba(0,0,0,.94)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, ov.H);
      c.restore();
    },
    update() {
      // the chip steps back with the HUD (hidden UI, the pause menu, the end block)
      const hide = game.ui.hidden || document.body.classList.contains('oniks-veiled') || open || !!setOpen;
      if (hide !== chipEl.classList.contains('off')) chipEl.classList.toggle('off', hide);
    },
    dispose() {
      offSettings(); offAuto(); removeEventListener('resize', onResize);
      [helpEl, setEl, chipEl].forEach(el => el && el.remove());
      document.body.classList.remove('oniks-helping');
    },
  };
}
export default createHelp;
