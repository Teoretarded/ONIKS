/* FILMS (Campaign · Films): the favourite films as the menu's big words. The film behind follows the focused row
   (after a short pause, veiled when the look changes), clean, at full brightness; Enter watches it.
   WATCH: the film full screen from its start, its own UI hidden (H brings its captions back), with the films'
   timeline bar (film.js #filmbar, rebuilt here because the shell loads the films ?clean): it shows on a mouse move or
   a key and fades; click or drag the track to seek. Keys as in the films: P / Space pause, J L ±5 s (Shift ±1 s),
   , . chapter, 0-9 jump, T pin the bar, [ ] the film before / after; Esc back to the list. The films loop. */
import { h, esc, pad2, swipe, keysHtml, replay, fmtTime } from '../dom.js';
import { sfx } from '../sfx.js';
import { FILMS, WATCH } from '../films.js';
import { MISSIONS } from '../../../data/campaign.js';

const EDITION = { pc: 'Point Cloud', orb: 'Orbital' };
const missionOf = id => MISSIONS.find(m => m.film.id === id);
/* the films' own time format (film.js): 01:07.4 */
const fmt = s => { s = Math.max(0, s); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`; };

export function filmsScreen(app) {
  const el = h('section.scr#scr-films');
  const kick = h('div.kick', h('i'), h('span', '03 · Campaign · Films'));
  const list = h('div.form.mlist.flist');
  const ro = h('div.ro.fro');
  const keys = h('div.keys.skeys', { html: keysHtml([['↑↓', 'Select'], ['Enter', 'Watch'], ['Esc', 'Back']]) });
  el.append(kick, list, ro, keys);
  let i = 0, rows = [], busy = false, tm = 0, raf = 0, facts = '';

  function build() {
    list.innerHTML = '';
    rows = WATCH.filter(id => FILMS[id]).map((id, k) => {
      const f = FILMS[id], m = missionOf(id);
      const r = h('div.row');
      r.dataset.id = id;
      r.innerHTML = `<span class="n">${pad2(k + 1)}</span><i class="sq"></i><span class="lab">${swipe('fw' + k)}<span class="tx">${esc(f.name)}</span></span>`
        + `<span class="st"><span class="ct">${esc(EDITION[f.theme] || '')}</span>${m ? `<span class="lk">${pad2(m.n)} · ${esc(m.title)}</span>` : ''}</span>`;
      r.addEventListener('mouseenter', () => { if (!busy) set(k); });
      r.addEventListener('click', () => { set(k, true); watch(); });
      list.append(r);
      return r;
    });
  }
  const idOf = k => rows[k] && rows[k].dataset.id;

  function set(k, quiet) {
    k = (k + rows.length) % rows.length;
    const changed = k !== i || !rows[k].classList.contains('on');
    i = k;
    rows.forEach((r, j) => r.classList.toggle('on', j === k));
    if (!changed) return;
    if (!quiet) sfx.move();
    // the film behind follows the row after a short pause (moving through the list does not load every film)
    clearTimeout(tm);
    const id = idOf(k);
    if (id !== app.filmId) tm = setTimeout(() => { if (app.cur === scr && idOf(i) === id) app.film(id, { chapter: 'random', veil: 'auto' }); }, 650);
    facts = ''; ro.innerHTML = '';
  }
  /* the focused film's length and chapters, once it is the one behind */
  function tick() {
    raf = requestAnimationFrame(tick);
    const id = idOf(i), w = app.bd.win();
    if (!id || app.bd.id !== id || !w || !w.FILM) return;
    const F = w.FILM, t = `Length <b>${fmtTime(F.duration)}</b> · ${F.chapters.map(c => esc(c.title)).join(' · ')}`;
    if (t !== facts) { facts = t; ro.innerHTML = t; replay(ro, 'in'); }
  }

  function watch() {
    if (busy) return;
    busy = true; sfx.enter();
    const r = rows[i]; r.classList.add('go');
    clearTimeout(tm);
    setTimeout(() => { r.classList.remove('go'); busy = false; app.go('watch', { id: idOf(i) }); }, 380);
  }

  const scr = {
    id: 'films', el, mode: 'bare', shade: 'list',
    enter(p) {
      busy = false;
      build();
      // the row of the film asked for, else the film already behind, else the first
      let k = WATCH.indexOf(p && p.focus);
      if (k < 0) k = WATCH.indexOf(app.filmId);
      i = -1; set(Math.max(0, k), true);
      ro.style.top = (236 + list.offsetHeight + 30) + 'px';
      cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    },
    leave() { clearTimeout(tm); cancelAnimationFrame(raf); },
    key(e) {
      if (busy) return true;
      const k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') set(i - 1);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') set(i + 1);
      else if (k === 'Enter' || k === ' ') watch();
      else if (k === 'Escape') { sfx.back(); app.go('campaign', { row: 'films' }); }
      else return false;
      return true;
    },
  };
  return scr;
}

export function watchScreen(app) {
  const el = h('section.scr#scr-watch');
  const card = h('div.card');
  const ck = h('div.kick', h('i'), h('span'));
  const ct = h('div.t');
  card.append(ck, ct);
  el.append(card);
  // the timeline bar, outside the stage like the films' own: it spans the window, whatever its shape
  const bar = h('div#watchbar', { html:
    `<div class="row"><span class="tt"></span><span class="ch"></span><span class="sp"></span><span class="hk">P pause · J L ±5 s · , . chapter · H captions · T pin · [ ] films · Esc back</span></div>
     <div class="track"><div class="line"></div><div class="done"></div><div class="ticks"></div><div class="head"></div></div>` });
  document.body.append(bar);
  const q = s => bar.querySelector(s);
  const tt = q('.tt'), chEl = q('.ch'), track = q('.track'), done = q('.done'), head = q('.head'), ticksEl = q('.ticks');
  let id = null, raf = 0, active = false, pinned = false, shownAt = -1e9, captions = false, ticksFor = null, drag = false, tms = [], switching = false;
  const W = () => { const w = app.bd.win(); return w && w.FILM && app.bd.id === id ? w : null; };
  const clear = () => { tms.forEach(clearTimeout); tms = []; };

  function show() { if (switching) return; shownAt = performance.now(); bar.classList.add('on'); }
  function update() {
    raf = requestAnimationFrame(update);
    const w = W();
    if (!w) return;
    const F = w.FILM, D = F.duration || 1;
    if (ticksFor !== w) {
      ticksFor = w;
      ticksEl.innerHTML = F.chapters.map((c, k) => `<div class="tick" data-i="${k}" style="left:${(c.t / D * 100).toFixed(3)}%"><span>${esc(c.title)}</span></div>`).join('');
    }
    const f = F.T / D;
    tt.textContent = `${fmt(F.T)} / ${fmt(D)}${F.playing ? '' : ' · paused'}`;
    chEl.textContent = F.chapter ? F.chapter.title : '';
    done.style.width = (f * 100).toFixed(3) + '%';
    head.style.left = (f * 100).toFixed(3) + '%';
    const ci = F.chapters.indexOf(F.chapter);
    for (const t of ticksEl.children) t.classList.toggle('cur', +t.dataset.i === ci);
    if (!pinned && !drag && performance.now() - shownAt > 2600) bar.classList.remove('on');
  }

  /* seeking on the track (the films' rule: click or drag anywhere on it) */
  const at = e => { const r = track.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  track.addEventListener('pointerdown', e => { const w = W(); if (!w || !active) return; drag = true; track.setPointerCapture(e.pointerId); w.FILM.seek(at(e) * w.FILM.duration); show(); });
  track.addEventListener('pointermove', e => { const w = W(); if (drag && w) w.FILM.seek(at(e) * w.FILM.duration); });
  track.addEventListener('pointerup', () => { drag = false; show(); });
  addEventListener('mousemove', () => { if (active) show(); });

  function setCaptions(on) { captions = on; app.bd.mode(on ? 'cut' : 'bare'); }
  function titleCard() {
    clear();
    const k = WATCH.indexOf(id), f = FILMS[id];
    ck.lastChild.textContent = `Film ${pad2(k + 1)} / ${pad2(WATCH.length)} · ${EDITION[f.theme] || ''}`;
    ct.textContent = f.name;
    card.classList.remove('on');
    tms.push(setTimeout(() => { card.classList.add('on'); replay(ct, 'in'); }, 700));
    tms.push(setTimeout(() => card.classList.remove('on'), 5200));
  }
  async function open(next, veil) {
    id = next; ticksFor = null; switching = true;
    card.classList.remove('on'); bar.classList.remove('on');
    await app.film(id, { at: 0, veil });
    switching = false;
    if (app.cur !== scr || id !== next) return;
    const w = W(); if (w) { w.FILM.playing = true; w.FILM.seek(0); }
    setCaptions(captions);
    titleCard();
    show();
  }
  /* [ ]: the film before / after in the list */
  function step(d) {
    if (switching) return;
    const k = WATCH.indexOf(id);
    sfx.move();
    open(WATCH[(k + d + WATCH.length) % WATCH.length], 'auto');
  }

  const scr = {
    id: 'watch', el, mode: 'bare', shade: null, logo: false,
    async enter(p) {
      active = true; captions = false; pinned = false;
      bar.classList.add('live');
      cancelAnimationFrame(raf); raf = requestAnimationFrame(update);
      await open(p.id, 'auto');
    },
    leave() {
      active = false; drag = false; clear();
      cancelAnimationFrame(raf);
      bar.classList.remove('on', 'live'); card.classList.remove('on');
      const w = W(); if (w) w.FILM.playing = true;
    },
    key(e) {
      if (!active) return true;
      const k = e.key, w = W(), F = w && w.FILM;
      if (k === 'Escape' || k === 'Backspace') { sfx.back(); app.go('films', { focus: id }); return true; }
      if (k === '[' || k === ']') { step(k === ']' ? 1 : -1); return true; }
      if (!F) return true;
      const D = F.duration, ci = F.chapters.indexOf(F.chapter);
      if (k === 'p' || k === 'P' || k === 'k' || k === 'K' || k === ' ') F.playing = !F.playing;
      else if (k === 'j' || k === 'J') F.seek(F.T - (e.shiftKey ? 1 : 5));
      else if (k === 'l' || k === 'L') F.seek(F.T + (e.shiftKey ? 1 : 5));
      else if (k === ',') { const c = F.chapters[ci]; F.seek(c && F.T - c.t > 1.5 ? c.t : (F.chapters[(ci - 1 + F.chapters.length) % F.chapters.length] || { t: 0 }).t); }
      else if (k === '.') F.seek((F.chapters[(ci + 1) % F.chapters.length] || { t: 0 }).t);
      else if (/^[0-9]$/.test(k)) F.seek(+k / 10 * D);
      else if (k === 'h' || k === 'H') setCaptions(!captions);
      else if (k === 't' || k === 'T') { pinned = !pinned; if (!pinned) shownAt = performance.now(); }
      else return false;
      show();
      return true;
    },
  };
  return scr;
}
