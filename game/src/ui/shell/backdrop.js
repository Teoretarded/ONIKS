/* The live film behind the shell. Each film is its own same-origin page (reference/films/<id>.html?clean) in a
   full-window iframe that never takes focus or pointer events. The shell hides the film's own menu, blurb, key
   hints, wordmark and subtitle by injecting a style sheet, keeps its tracked tags and captions, and drives it
   through its FILM API (seek, time, uiHidden). Switching films cross-dissolves; the film behind never cuts.

   backdrop.show(id, { at, chapter }) -> Promise<rec>   load (or keep) a film; at = film seconds, chapter = 'random'
   backdrop.mode(m)                     'menu' | 'sub' | 'bare' | 'cut'
   backdrop.time() / duration() / seek(t) / win() */
import { filmUrl } from './films.js';
import { sfx } from './sfx.js';

const INJECT = `
  #menu, #blurb, #stage .keys, #stage .foot, #stage .veil, #stage .logo, #stage .ui > .sub, #tag { display: none !important; }
  #stage .ui { transition: opacity .5s ease; }
  #o { transition: opacity .5s ease; }
  html.sh-sub #stage .ui, html.sh-bare #stage .ui { opacity: 0; }
  html.sh-sub #o { opacity: .45; }
  #filmbar { display: none !important; }
`;

const wait = ms => new Promise(r => setTimeout(r, ms));
const frames = (w, n) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : w.requestAnimationFrame(f)); w.requestAnimationFrame(f); });

export class Backdrop {
  constructor(host) { this.host = host; this.cur = null; this.m = 'menu'; this.token = 0; this.pending = null; sfx.onUnlock = () => this.cur && this.audio(this.cur); }

  async show(id, o = {}) {
    if (this.cur && this.cur.id === id && !o.reload) {
      if (this.pending) { this.token++; this.pending.f.remove(); this.pending = null; }   // a newer request wins
      if (o.at != null) this.seek(o.at);
      return this.cur;
    }
    const token = ++this.token;
    if (this.pending) { this.pending.f.remove(); this.pending = null; }
    const f = document.createElement('iframe');
    f.tabIndex = -1; f.setAttribute('aria-hidden', 'true'); f.setAttribute('title', '');
    f.src = filmUrl(id);
    const rec = { id, f, w: null };
    this.pending = rec;
    this.host.appendChild(f);
    await new Promise(r => f.addEventListener('load', r, { once: true }));
    if (token !== this.token) { f.remove(); return this.cur; }
    const w = rec.w = f.contentWindow, d = f.contentDocument;
    const st = d.createElement('style'); st.textContent = INJECT; d.head.appendChild(st);
    this.cls(rec);
    // the film is ready once FILM.run has started
    const t0 = performance.now();
    while (!(w.STAGE && w.STAGE.ready && w.FILM && w.FILM.duration > 1)) {
      if (performance.now() - t0 > 20000 || token !== this.token) break;
      await wait(30);
    }
    if (token !== this.token || !(w.FILM && w.STAGE && w.STAGE.ready)) {
      if (token === this.token) console.warn('shell: film did not start:', id);
      f.remove(); if (this.pending === rec) this.pending = null;
      return this.cur;
    }
    let at = o.at;
    if (at == null && o.chapter === 'random' && w.FILM.chapters.length) {
      const ch = w.FILM.chapters; at = ch[Math.floor(Math.random() * ch.length)].t;
    }
    if (at != null) w.FILM.seek(at);
    w.FILM.playing = true;
    w.FILM.uiHidden = this.m === 'bare';
    this.audio(rec);
    await frames(w, 3);
    if (token !== this.token) { f.remove(); return this.cur; }
    // keys never reach the film: its own handlers (P pause, J/L seek, H...) only fire on its window
    f.classList.add('on');
    const old = this.cur; this.cur = rec; this.pending = null;
    this.cls(rec);
    if (old) setTimeout(() => old.f.remove(), 1000);
    return rec;
  }

  cls(rec) {
    if (!rec || !rec.f.contentDocument) return;
    const de = rec.f.contentDocument.documentElement;
    ['menu', 'sub', 'bare', 'cut'].forEach(k => de.classList.toggle('sh-' + k, k === this.m));
    if (rec.w && rec.w.FILM) rec.w.FILM.uiHidden = this.m === 'bare';
  }
  mode(m) { this.m = m; this.cls(this.cur); this.cls(this.pending); }

  audio(rec) {
    if (!sfx.ac || !rec || !rec.w || !rec.w.STAGE) return;
    const S = rec.w.STAGE.SFX;
    S.ac = sfx.ac; S.master = sfx.film; S.on = true;
  }

  win() { return this.cur && this.cur.w; }
  time() { const w = this.win(); return w && w.FILM ? w.FILM.T : 0; }
  duration() { const w = this.win(); return w && w.FILM ? w.FILM.duration : 1; }
  seek(t) { const w = this.win(); if (w && w.FILM) w.FILM.seek(t); }
  get id() { return this.cur && this.cur.id; }
}
