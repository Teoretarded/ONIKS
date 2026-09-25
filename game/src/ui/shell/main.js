/* ONIKS shell: boots game/index.html. The menu over a live film, the setup screens, the campaign, cutscenes
   and settings. Screens dissolve into each other over the film, which never cuts.

   Routes (location.hash): #sandbox #combat #campaign #settings; play.html returns to index.html#campaign etc.
   A match result in localStorage `oniks.lastResult` is shown once on the screen of its mode. */
import { $, h, esc, pad2, fitStage } from './dom.js';
import { Backdrop } from './backdrop.js';
import { FILMS, MENU_POOL, MARKS } from './films.js';
import { sfx } from './sfx.js';
import { getSettings } from '../../data/settings.js';
import { takeLastResult, getMission, getProgress } from '../../data/campaign.js';
import * as MS from './mapsrc.js';
import { menuScreen, quitScreen } from './screens/menu.js';
import { setupScreen } from './screens/setup.js';
import { campaignScreen } from './screens/campaign.js';
import { cutsceneScreen, briefingScreen } from './screens/mission.js';
import { settingsScreen } from './screens/settings.js';

const stage = $('stage'), logo = $('logo'), veil = $('veil');
const wait = ms => new Promise(r => setTimeout(r, ms));

const app = {
  bd: new Backdrop($('films')),
  screens: {}, cur: null, theme: 'pc', layout: 'L-col', filmId: null, menuFilm: null,

  /* the film behind + the theme and layout that go with it */
  async film(id, o = {}) {
    const a = FILMS[this.filmId], b = FILMS[id];
    const veiled = this.filmId !== id && (o.veil === true || (o.veil === 'auto' && a && b && (a.theme !== b.theme || a.layout !== b.layout)));
    if (veiled) { this.veil(true); await wait(520); }
    const rec = await this.bd.show(id, { at: o.at, chapter: o.chapter });
    this.look(id);
    if (veiled) this.veil(false);
    return rec;
  },
  look(id) {
    const f = FILMS[id] || FILMS.pd_engagement;
    this.filmId = id;
    const themeChanged = f.theme !== this.theme, layoutChanged = f.layout !== this.layout;
    this.theme = f.theme; this.layout = f.layout;
    document.body.classList.toggle('th-pc', f.theme === 'pc');
    document.body.classList.toggle('th-orb', f.theme === 'orb');
    stage.className = f.layout;
    logo.innerHTML = MARKS[f.mark] + '<span>ONIKS</span>';
    sfx.kind = f.theme === 'orb' ? 'orb' : 'pc';
    if (themeChanged || layoutChanged || !this.built) { this.screens.menu.build(); this.built = true; }
  },
  pickMenuFilm() {
    const pin = getSettings().menuFilm;
    if (pin && FILMS[pin]) return pin;
    let last = null; try { last = sessionStorage.getItem('oniks.lastMenuFilm'); } catch (e) { /* */ }
    const pool = MENU_POOL.filter(f => f !== last);
    const id = pool[Math.floor(Math.random() * pool.length)];
    try { sessionStorage.setItem('oniks.lastMenuFilm', id); } catch (e) { /* */ }
    return id;
  },
  /* Settings changed the menu film: swap it behind the settings screen after a short pause */
  menuFilmChanged(v) {
    clearTimeout(this._mf);
    this._mf = setTimeout(() => {
      const id = v === 'random' ? (MENU_POOL.includes(this.filmId) ? this.filmId : this.pickMenuFilm()) : v;
      this.menuFilm = id;
      if (id !== this.filmId) this.film(id, { chapter: 'random', veil: 'auto' });
    }, 650);
  },

  go(name, p = {}) {
    const next = this.screens[name]; if (!next) return;
    const prev = this.cur;
    if (prev && prev !== next) { prev.leave && prev.leave(); prev.el.classList.remove('on'); }
    this.cur = next;
    // back on the menu after a mission film: the menu film returns
    if ((name === 'menu') && this.menuFilm && this.filmId !== this.menuFilm) this.film(this.menuFilm, { chapter: 'random', veil: 'auto' });
    this.bd.mode(next.mode);
    for (const d of $('shade').children) d.classList.toggle('on', d.classList.contains(next.shade || '-'));
    $('films').classList.toggle('dim', next.shade === 'sub');
    $('films').classList.toggle('dim2', next.shade === 'full');
    logo.classList.toggle('off', next.logo === false);
    next.el.classList.add('on');
    next.enter && next.enter(p);
    const hash = ['sandbox', 'combat', 'campaign', 'settings'].includes(name) ? '#' + name : '';
    if (location.hash !== hash) history.replaceState(null, '', location.pathname + location.search + hash);
  },

  veil(on, msg) {
    veil.querySelector('span').textContent = msg || '';
    veil.classList.toggle('off', !on);
  },

  launch(url, label) {
    sfx.start();
    this.veil(true, label || '');
    setTimeout(() => { location.href = url; }, 900);
  },

  /* one line after a match: [02] Scale · Passed · Grade B, then the stats */
  debrief(el, r) {
    const m = r.mode === 'campaign' ? getMission(r.mission) : null;
    const id = m ? pad2(m.n) : (r.mode || '').toUpperCase();
    const what = (m ? m.title + ' · ' : '') + (r.win ? (m ? 'Passed' : 'Victory') : (m ? 'Failed' : 'Defeat'));
    const tag = `<span class="tag ${r.win ? 'lime' : 'coral'}"><b>${esc(id)}</b><i>${esc(what)}</i>${r.grade ? `<span class="v">Grade ${esc(r.grade)}</span>` : ''}</span>`;
    const st = r.stats && typeof r.stats === 'object' ? Object.entries(r.stats).filter(([k, v]) => (typeof v === 'number' || typeof v === 'string') && k !== 'ammo').slice(0, 6) : [];
    const fmt = (k, v) => /^(t|time|seconds|duration)$/i.test(k) && typeof v === 'number' ? `${Math.floor(v / 60)}:${pad2(Math.round(v % 60))}` : typeof v === 'number' ? Math.round(v * 100) / 100 : v;
    const lab = k => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    el.innerHTML = tag + (st.length ? `<span class="ro">${st.map(([k, v]) => `${esc(lab(k))} <b>${esc(fmt(k, v))}</b>`).join(' · ')}</span>` : '');
    el.classList.add('on');
  },
};
window.ONIKS_SHELL = app;   // for debugging from the console

/* ---------- screens ---------- */
const S = app.screens;
S.menu = menuScreen(app);
S.quit = quitScreen(app);
S.sandbox = setupScreen(app, 'sandbox');
S.combat = setupScreen(app, 'combat');
S.campaign = campaignScreen(app);
S.cutscene = cutsceneScreen(app);
S.briefing = briefingScreen(app);
S.settings = settingsScreen(app);
for (const s of Object.values(S)) $('screens').append(s.el);

/* ---------- input ---------- */
addEventListener('keydown', e => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (!app.cur || !app.ready) return;
  if (app.cur.key && app.cur.key(e)) e.preventDefault();
});
// key chips double as buttons for the mouse
addEventListener('click', e => {
  const chip = e.target.closest && e.target.closest('.keys span[data-key]');
  if (!chip || !app.cur || !app.ready || !app.cur.key) return;
  e.stopPropagation();
  app.cur.key({ key: chip.dataset.key, preventDefault() {} });
}, true);
addEventListener('resize', fitStage);
fitStage();

/* ---------- boot ---------- */
(async function boot() {
  app.veil(true);
  MS.refresh();
  const result = takeLastResult();
  const route = (location.hash || '').slice(1);
  app.menuFilm = app.pickMenuFilm();
  // after a campaign battle, the mission's own film stays behind the debrief
  let filmId = app.menuFilm, at = null;
  const m = result && result.mode === 'campaign' ? getMission(result.mission) : null;
  if (m && route === 'campaign') { filmId = m.film.id; at = m.film.to; }
  app.look(filmId);
  try { await document.fonts.ready; } catch (e) { /* */ }
  // the film dissolves in when it is ready; the menu does not wait for a slow load
  await Promise.race([app.bd.show(filmId, at != null ? { at } : { chapter: 'random' }), wait(2500)]);
  app.ready = true;
  const target = ['sandbox', 'combat', 'campaign', 'settings'].includes(route) ? route : 'menu';
  const p = result && result.mode === target ? { result, focus: m && target === 'campaign' ? Math.min(6, (getProgress().passed.includes(m.n) ? m.n + 1 : m.n)) : undefined } : {};
  app.go(target, p);
  app.veil(false);
  // the real maps and units may land later: look again now and then while the shell is open
  setInterval(() => MS.refresh(), 15000);
})();

const ROUTES = ['sandbox', 'combat', 'campaign', 'settings'];
addEventListener('hashchange', () => {
  const r = location.hash.slice(1);
  if (app.ready && ROUTES.includes(r) && app.cur !== app.screens[r]) app.go(r);
});
/* back from play.html through the browser's page cache: lift the launch veil, pick up the result */
addEventListener('pageshow', e => {
  if (!e.persisted) return;
  app.veil(false);
  const result = takeLastResult(), r = location.hash.slice(1);
  const target = ROUTES.includes(r) ? r : 'menu';
  app.go(target, result && result.mode === target ? { result } : {});
});
