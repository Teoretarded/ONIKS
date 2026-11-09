/* CAMPAIGN: the six missions as the menu's big words, locked until the one before is passed, each with its
   grade; the selected mission's map, film and objectives on the right. Enter opens its film (the cutscene);
   F on a passed mission plays its film again, whole (the cutscene player, back here after it).
   Below the missions, two more rows: Films (the favourite films, full screen: screens/films.js) and Anatomy (every
   model in dark space: play.html?mode=museum). */
import { h, esc, pad2, swipe, keysHtml, replay, takeFocus, keepFocus } from '../dom.js';
import { sfx } from '../sfx.js';
import { MISSIONS, getProgress, isUnlocked as unlocked, isPassed } from '../../../data/campaign.js';
import { FILMS, WATCH } from '../films.js';
import { MUSEUM } from '../../inspect/museum.js';
import * as MS from '../mapsrc.js';
import { pixelScale } from '../preview.js';

const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
/* index.html?unlock#campaign opens every mission on this screen for this visit, for testing. Nothing of it is saved:
   the URL itself is never written anywhere, and a result that comes back for a mission the real progress still has
   locked is not recorded (data/campaign.js recordResult), so the list below never shows a pass out of order. */
const ALL = new URLSearchParams(location.search).has('unlock');
const isUnlocked = (n, p) => ALL || unlocked(n, p);
/* a mission's film can be watched again once the mission is passed (every one with ?unlock) */
const canWatch = (n, p) => ALL || isPassed(n, p);

const XTRA = [
  { id: 'films', label: 'Films', st: () => `${WATCH.length} films`, blurb: 'Every film, full screen, from the start.' },
  { id: 'anatomy', label: 'Anatomy', st: () => 'All models', blurb: 'Every model, one at a time, in dark space.' },
];

export function campaignScreen(app) {
  const el = h('section.scr#scr-campaign');
  const kick = h('div.kick', h('i'), h('span', ALL ? '03 · Campaign · Test · all open' : '03 · Campaign'));
  const deb = h('div.debrief');
  const list = h('div.form.mlist');
  const blurb = h('div.sblurb');
  const det = h('div.mdet');
  const frame = h('div.frame'), fl = h('div.fl'), cv = h('canvas', { width: 712, height: 400 }), wt = h('div.wait');
  frame.append(fl, cv, wt);
  const grid = h('div.grid');
  det.append(frame, grid);
  grid.addEventListener('click', e => { if (e.target.closest('.wa')) film(); });
  const keys = h('div.keys.skeys');
  el.append(kick, deb, list, blurb, det, keys);
  let i = 0, rows = [], prog = null, token = 0, busy = false, stop = null, keysNow = '';
  const NM = MISSIONS.length;
  const xtraOf = k => (k >= NM ? XTRA[k - NM] : null);

  function build() {
    prog = getProgress();
    list.innerHTML = '';
    rows = MISSIONS.map((m, k) => {
      const open = isUnlocked(m.n, prog), passed = isPassed(m.n, prog), g = prog.grades[m.n];
      const r = h('div.row' + (open ? '' : '.lock'));
      let st = '';
      if (passed) st = `<span class="tag lime sm"><b>${esc(g || '·')}</b><i>Passed</i></span>`;
      else if (open) st = '<span class="nx">Next</span>';
      else st = '<span class="lk">Locked</span>';
      r.innerHTML = `<span class="n">${pad2(m.n)}</span><i class="sq"></i><span class="lab">${swipe('cm' + k)}<span class="tx">${esc(m.title)}</span></span><span class="st">${st}</span>`;
      return r;
    });
    list.append(...rows);
    list.append(h('div.gap'));
    for (const x of XTRA) {
      const r = h('div.row.xtra');
      r.dataset.id = x.id;
      r.innerHTML = `<span class="n"></span><i class="sq"></i><span class="lab">${swipe('cx' + x.id)}<span class="tx">${esc(x.label)}</span></span><span class="st"><span class="ct">${esc(x.st())}</span></span>`;
      list.append(r);
      rows.push(r);
    }
    rows.forEach((r, k) => {
      r.addEventListener('mouseenter', () => { if (!busy) set(k); });
      r.addEventListener('click', () => { set(k, true); play(); });
    });
  }

  function setKeys(list) {
    const html = keysHtml(list);
    if (html !== keysNow) { keysNow = html; keys.innerHTML = html; }
  }

  function set(k, quiet) {
    k = (k + rows.length) % rows.length;
    const changed = k !== i || !rows[k].classList.contains('on');
    i = k;
    rows.forEach((r, j) => r.classList.toggle('on', j === k));
    if (!changed) return;
    if (!quiet) sfx.move();
    const x = xtraOf(k);
    if (x) {
      blurb.textContent = x.blurb;
      replay(blurb, 'in');
      setKeys([['↑↓', 'Select'], ['Enter', 'Open'], ['Esc', 'Back']]);
      xtraDetail(x);
      return;
    }
    const m = MISSIONS[k];
    const open = isUnlocked(m.n, prog);
    blurb.textContent = open ? m.brief[0] : `Pass ${pad2(m.n - 1)} · ${MISSIONS[k - 1].title} to open this battle.`;
    replay(blurb, 'in');
    setKeys(canWatch(m.n, prog) ? [['↑↓', 'Select'], ['Enter', 'Play'], ['F', 'Film'], ['Esc', 'Back']] : [['↑↓', 'Select'], ['Enter', 'Play'], ['Esc', 'Back']]);
    detail(m, open);
  }

  /* Films and Anatomy: no map; what is in them, in the grid's words */
  function xtraDetail(x) {
    ++token;
    if (stop) { stop(); stop = null; }
    det.classList.add('nomap');
    const names = th => WATCH.filter(id => FILMS[id] && FILMS[id].theme === th).map(id => `<b>${esc(FILMS[id].name)}</b>`).join('<br>');
    grid.innerHTML = (x.id === 'films'
      ? [['Point Cloud', names('pc')], ['Orbital', names('orb')]]
      : [['Models', MUSEUM.map(g => `<b>${esc(g[0])}</b>`).join('<br>')], ['Walk', '<b>← →</b>'], ['Exploded', '<b>E</b>'], ['X-ray', '<b>X</b>'], ['Leave', '<b>Esc</b>']]
    ).map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
  }

  async function detail(m, open) {
    const t = ++token;
    det.classList.remove('nomap');
    const meta = MS.byId(m.map), f = FILMS[m.film.id];
    fl.innerHTML = `<span>${pad2(m.n)} · ${esc(meta.name)}</span><span class="sp"></span><i>${esc(cap(m.weather))} · ${esc(cap(m.time))}</i>`;
    const g = prog.grades[m.n];
    // the objectives known before the battle; the hidden ones are revealed by the mission script in play
    const shown = m.objectives.filter(o => !o.hidden);
    const req = shown.filter(o => !o.optional).map(o => esc(o.text)).join('<br>');
    const opt = shown.filter(o => o.optional).map(o => esc(o.text)).join('<br>');
    grid.innerHTML = [
      ['Film', `<b>${esc(f ? f.name : m.film.id)}</b>${canWatch(m.n, prog) ? ' · <span class="wa"><span class="l">F</span> Watch again</span>' : ''}`],
      ['Objectives', `<b>${req}</b>`],
      opt ? ['Optional', opt] : null,
      ['Enemy', `<b>${esc(cap(m.ai))}</b>`],
      ['Grade', g ? `<span class="l">${esc(g)}</span>` : open ? '—' : 'Locked'],
    ].filter(Boolean).map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
    wt.style.display = '';
    if (stop) { stop(); stop = null; }
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
    await MS.refresh();
    if (t !== token) return;
    // letterbox the map into the 712 x 400 frame
    const k = Math.max(.5, Math.min(2, pixelScale()));
    if (cv.width !== Math.round(712 * k)) { cv.width = Math.round(712 * k); cv.height = Math.round(400 * k); cv.style.width = '712px'; cv.style.height = '400px'; }
    const sz = MS.byId(m.map).size || [1, 1], asp = sz[0] / sz[1];
    let ow = Math.round(400 * asp), oh = 400;
    if (ow > 712) { ow = 712; oh = Math.round(712 / asp); }
    const off = await MS.previewImage(m.map, Math.round(ow * k), Math.round(oh * k), { dpr: k });
    if (t !== token) return;
    stop = MS.scanReveal(cv, off, { x: (cv.width - off.width) / 2, y: (cv.height - off.height) / 2, alpha: open ? 1 : .35 });
    const ids = MISSIONS.map(q => q.map);
    MS.warm([ids[(Math.min(i, NM - 1) + 1) % ids.length]]);
    wt.style.display = 'none';
  }

  function play() {
    if (busy) return;
    const x = xtraOf(i);
    if (x) {
      busy = true; sfx.enter();
      const r = rows[i]; r.classList.add('go');
      if (x.id === 'anatomy') { keepFocus('campaign', 'anatomy'); app.launch('play.html?mode=museum&from=campaign', 'Anatomy'); return; }
      setTimeout(() => { r.classList.remove('go'); busy = false; app.go('films'); }, 380);
      return;
    }
    const m = MISSIONS[i];
    if (!isUnlocked(m.n, prog)) { sfx.deny(); return; }
    busy = true; sfx.enter();
    rows[i].classList.add('go');
    setTimeout(() => { rows[i].classList.remove('go'); busy = false; app.go('cutscene', { mission: m.n }); }, 380);
  }
  /* F: the mission's film again, whole */
  function film() {
    if (busy) return;
    const m = xtraOf(i) ? null : MISSIONS[i];
    if (!m || !canWatch(m.n, prog)) { sfx.deny(); return; }
    busy = true; sfx.enter();
    setTimeout(() => { busy = false; app.go('cutscene', { mission: m.n, rewatch: true }); }, 200);
  }

  return {
    id: 'campaign', el, mode: 'sub', shade: 'sub',
    async enter(p) {
      busy = false;
      await MS.refresh();
      build();
      const back = takeFocus('campaign');
      let k = p && p.focus != null ? p.focus - 1 : -1;
      // a result that came back for a locked mission (a test run) does not steer the list onto it
      if (k >= 0 && (!MISSIONS[k] || !isUnlocked(MISSIONS[k].n, prog))) k = -1;
      const row = (p && p.row) || back;
      if (row && XTRA.some(x => x.id === row)) k = NM + XTRA.findIndex(x => x.id === row);
      if (k < 0) { const nx = MISSIONS.findIndex(m => !isPassed(m.n, prog) && isUnlocked(m.n, prog)); k = nx >= 0 ? nx : NM - 1; }
      i = -1; set(k, true);
      requestAnimationFrame(() => { blurb.style.top = (300 + list.offsetHeight + 40) + 'px'; });
      blurb.style.top = (300 + list.offsetHeight + 40) + 'px';
      if (p && p.result) {
        app.debrief(deb, p.result);
        // a result for a mission that is still locked (a test run) is shown but not kept
        if (p.result.ignored) deb.insertAdjacentHTML('beforeend', '<span class="ro">Not recorded · <b>mission locked</b></span>');
      } else deb.classList.remove('on');
    },
    key(e) {
      if (busy) return true;
      const k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') set(i - 1);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') set(i + 1);
      else if (k === 'Enter' || k === ' ') play();
      else if (k === 'f' || k === 'F') film();
      else if (k === 'Escape') { sfx.back(); app.go('menu', { focus: 2 }); }
      else return false;
      return true;
    },
  };
}
