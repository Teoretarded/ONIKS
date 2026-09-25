/* CUTSCENE: the mission's film plays full screen, with its own tracked tags and captions, from film.from to
   film.to, under a small title card in the film's style; Space, Enter, Esc or a click skips.
   BRIEFING: the film plays on, darkened; the mission's lines, objectives, forces and map; Begin launches
   play.html?mode=campaign&mission=<n>. */
import { h, esc, pad2, keysHtml, replay } from '../dom.js';
import { sfx } from '../sfx.js';
import { Form } from '../form.js';
import { previewPanel } from '../preview.js';
import { MISSIONS, getMission, getProgress } from '../../../data/campaign.js';
import * as MS from '../mapsrc.js';

const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';

export function cutsceneScreen(app) {
  const el = h('section.scr#scr-cutscene');
  const card = h('div.card');
  const ck = h('div.kick', h('i'), h('span'));
  const ct = h('div.t');
  const cs = h('div.s.ro');
  card.append(ck, ct, cs);
  const keys = h('div.keys.cutkeys', { html: keysHtml([['Space', 'Skip']]) });
  const bar = h('div.cutbar', h('i'));
  el.append(card, keys, bar);
  let m = null, raf = 0, tms = [], done = false, t0 = 0, active = false;
  const clear = () => { cancelAnimationFrame(raf); tms.forEach(clearTimeout); tms = []; };

  function end() {
    if (done || !m) return; done = true;
    clear();
    app.go('briefing', { mission: m.n });
  }
  el.addEventListener('click', () => { if (active) { sfx.back(); end(); } });

  function watch() {
    const w = app.bd.win();
    if (!w || !w.FILM) { raf = requestAnimationFrame(watch); return; }
    const D = w.FILM.duration, span = Math.max(1, m.film.to - m.film.from);
    let d = ((w.FILM.T - m.film.from) % D + D) % D;
    if (d > span + 2) d = 0;          // not yet at `from` (seek pending)
    bar.firstChild.style.width = (Math.min(1, d / span) * 100).toFixed(2) + '%';
    if (d >= span - .04 && performance.now() - t0 > 1500) { end(); return; }
    raf = requestAnimationFrame(watch);
  }

  return {
    id: 'cutscene', el, mode: 'cut', shade: 'card',
    async enter(p) {
      clear(); done = false; active = false;
      m = getMission(p.mission);
      card.classList.remove('on'); keys.classList.remove('on'); bar.classList.remove('on');
      bar.firstChild.style.width = '0';
      await app.film(m.film.id, { at: m.film.from, veil: true });
      if (done || app.cur !== this) return;
      active = true; t0 = performance.now();
      const meta = MS.byId(m.map);
      ck.lastChild.textContent = `Mission ${pad2(m.n)} / ${pad2(MISSIONS.length)}`;
      ct.textContent = m.title;
      cs.innerHTML = `${esc(meta.name)} · <b>${esc(cap(m.time))}</b> · ${esc(cap(m.weather))}`;
      tms.push(setTimeout(() => { card.classList.add('on'); replay(ct, 'in'); }, 900));
      tms.push(setTimeout(() => card.classList.remove('on'), 8200));
      tms.push(setTimeout(() => { keys.classList.add('on'); bar.classList.add('on'); }, 1400));
      tms.push(setTimeout(() => keys.classList.remove('on'), 9000));
      raf = requestAnimationFrame(watch);
    },
    leave() { clear(); active = false; card.classList.remove('on'); keys.classList.remove('on'); bar.classList.remove('on'); },
    key(e) {
      if (!active) return true;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') { sfx.back(); end(); return true; }
      keys.classList.add('on');
      return false;
    },
  };
}

export function briefingScreen(app) {
  const el = h('section.scr#scr-briefing');
  const kick = h('div.kick', h('i'), h('span'));
  const title = h('div.sub-title');
  const brief = h('div.brief');
  const lines = h('div.lines');
  const objSec = h('div.sec'), objs = h('div');
  objSec.append(h('div.lbl', 'Objectives'), objs);
  brief.append(lines, objSec);
  const formEl = h('div.form', { style: 'bottom:150px' });
  const pv = previewPanel({ w: 700, h: 470 });
  const forces = h('div.brief.forcesb');
  const keys = h('div.keys.skeys', { html: keysHtml([['↑↓', 'Select'], ['Enter', 'Begin'], ['Esc', 'Back']]) });
  el.append(kick, title, brief, formEl, pv.el, forces, keys);
  let m = null, form = null;

  function forceTags(list, cls) {
    return list.map(([t, n]) => `<span class="tag sm ${cls}"><b>${n}</b><i>${esc(MS.unitName(t))}</i></span>`).join('');
  }

  return {
    id: 'briefing', el, mode: 'sub', shade: 'full',
    async enter(p) {
      m = getMission(p.mission);
      await MS.refresh();
      const meta = MS.byId(m.map);
      kick.lastChild.textContent = `Mission ${pad2(m.n)} / ${pad2(MISSIONS.length)} · ${meta.name}`;
      title.textContent = m.title;
      lines.innerHTML = m.brief.map(s => `<p>${esc(s)}</p>`).join('');
      objs.innerHTML = m.objectives.map(o => `<div class="obj${o.optional ? ' opt' : ''}"><i></i><span>${esc(o.text)}</span>${o.optional ? '<span class="o">Optional</span>' : ''}</div>`).join('');
      const prog = getProgress();
      const carry = m.carry && prog.carry && prog.carry.after === m.n - 1 ? '<div class="ro" style="margin-top:12px">Rounds carried over from the last battle</div>' : '';
      forces.innerHTML = `<div class="sec" style="margin-top:0"><div class="lbl">Own forces</div><div class="forces">${forceTags(m.forces.coast, 'lime')}</div>${carry}</div>`
        + `<div class="sec" style="margin-top:22px"><div class="lbl">Expected</div><div class="forces">${forceTags(m.forces.fleet, 'coral')}</div></div>`;
      const place = () => { const fr = pv.frame; forces.style.top = (196 + fr.offsetHeight + 78) + 'px'; forces.style.left = (1920 - parseFloat(getComputedStyle(el).getPropertyValue('--lx') || 88) - fr.offsetWidth) + 'px'; forces.style.width = Math.max(560, fr.offsetWidth) + 'px'; };
      pv.show(m.map, { weather: m.weather, time: m.time, sites: false }).then(place);
      place();
      formEl.innerHTML = '';
      form = new Form(formEl, {
        rows: [{ id: 'begin', label: 'Begin', action: true }, { id: 'back', label: 'Back', action: true }],
        onAction(id) {
          if (id === 'begin') app.launch(`play.html?mode=campaign&mission=${m.n}&map=${m.map}&side=${m.side}`, m.title);
          else { sfx.back(); app.go('campaign', { focus: m.n }); }
        },
      });
    },
    key(e) {
      if (e.key === 'Escape') { sfx.back(); app.go('campaign', { focus: m.n }); return true; }
      return form ? form.key(e) : false;
    },
  };
}
