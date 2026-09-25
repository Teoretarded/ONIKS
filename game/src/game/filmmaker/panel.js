/* Film maker DOM: the editing panel (bottom strip over the live game: the take's name, the films' timeline with key ticks
   and rate marks, the keys, the rate ramps, the take's options, key chips) and the play bar (film.js's timeline, on
   mouse move, never in a still). Talks to the film maker only through `fm` (see filmmaker.js). */
import { fmtT, fmtRate } from './path.js';

const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad2 = n => String(n).padStart(2, '0');
const scale = () => Math.max(.8, Math.min(1.6, Math.min(innerWidth / 1920, innerHeight / 1080)));
const secs = s => (Math.round(s * 10) / 10).toFixed(1);

export function createPanel(game, fm) {
  const root = document.createElement('div');
  root.className = 'oniks-film always';
  (game.uiRoot || document.body).appendChild(root);
  root.innerHTML = `
    <div class="fm-panel" style="display:none">
      <div class="fm-hd">
        <div class="kick"><i></i><span>Film</span></div>
        <input class="fm-name" data-f="name" spellcheck="false" maxlength="40">
        <span class="sp"></span>
        <div class="ro" data-el="ro"></div>
        <span class="fm-ch nk" data-a="fold" data-el="fold">Fold</span>
        <span class="fm-ch" data-a="close"><b>F9</b>Close</span>
      </div>
      <div class="fm-row"><span class="tt" data-el="tt"></span><span class="ch" data-el="ch"></span><span class="sp"></span>
        <span class="fm-mono">Click the line to preview · drag a tick to retime · , . keys</span></div>
      <div class="fm-track" data-el="track"><div class="line"></div><div class="done" data-el="done"></div><div data-el="ticks"></div><div class="head" data-el="head"></div></div>
      <div class="fm-body">
        <div class="fm-keys">
          <div class="fm-k hd"><span>#</span><span>T s</span><span>Eye</span><span>Look</span><span>Fov</span><span>Follow</span><span>Caption</span><span></span></div>
          <div class="list" data-el="keys"></div>
        </div>
        <div class="fm-side">
          <div class="fm-sec"><span class="fm-lbl">Time rate</span><span class="sp"></span></div>
          <div data-el="rates"></div>
          <div class="fm-opts" data-el="opts"></div>
        </div>
      </div>
      <div class="fm-ft">
        <span class="fm-ch" data-a="key"><b>K</b>Key</span>
        <span class="fm-ch" data-a="fkey"><b>⇧K</b>Follow key</span>
        <span class="fm-ch go" data-a="play"><b>Enter</b>Play</span>
        <span class="fm-ch" data-a="playhead"><b>⇧Enter</b>From head</span>
        <span class="fm-ch" data-a="still"><b>F8</b>Still</span>
        <span class="fm-ch" data-a="seq"><b>⇧F8</b>Sequence</span>
        <span class="fm-msg out" data-el="msg"></span>
        <span class="sp"></span>
        <span class="fm-ch nk" data-a="save">Save</span>
        <span class="fm-ch nk" data-a="takes">Takes</span>
        <span class="fm-ch nk" data-a="export">Export</span>
        <span class="fm-ch nk" data-a="import">Import</span>
        <span class="fm-ch nk" data-a="new">New</span>
      </div>
      <div class="fm-io" data-el="io"></div>
    </div>
    <div class="oniks-film-bar" data-el="bar">
      <div class="row"><span class="tt" data-el="btt"></span><span class="ch" data-el="bch"></span><span class="sp"></span>
        <span>Esc stop · P pause · J L ±5 s · , . key · H captions · T pin · F8 still</span></div>
      <div class="track" data-el="btrack"><div class="line"></div><div class="done" data-el="bdone"></div><div data-el="bticks"></div><div class="head" data-el="bhead"></div></div>
    </div>`;
  const $ = k => root.querySelector(`[data-el="${k}"]`);
  const panel = root.querySelector('.fm-panel'), nameEl = root.querySelector('.fm-name');
  const E = { ro: $('ro'), tt: $('tt'), ch: $('ch'), track: $('track'), done: $('done'), ticks: $('ticks'), head: $('head'), keys: $('keys'), rates: $('rates'),
    opts: $('opts'), msg: $('msg'), io: $('io'), bar: $('bar'), btt: $('btt'), bch: $('bch'), btrack: $('btrack'), bdone: $('bdone'), bticks: $('bticks'), bhead: $('bhead') };
  let io = '', msgT = 0, fitW = 0, fitH = 0, curKey = -2, barOn = false, barT = 0, barPinned = false;
  try { if (localStorage.getItem('oniks.films.fold') === '1') { panel.classList.add('fold'); root.querySelector('[data-el="fold"]').textContent = 'Unfold'; } } catch (e) { /* */ }
  const last = { tt: '', ro: '', ch: '', btt: '', bch: '', head: -1, bhead: -1 };

  function fit() {
    const s = scale();
    root.style.zoom = s; root.style.width = (innerWidth / s) + 'px'; root.style.height = (innerHeight / s) + 'px';
    fitW = innerWidth; fitH = innerHeight;
  }
  fit();

  /* ------------------------------------------------------------ building */
  const T = () => fm.take;
  function describeEye(k) {
    if (k.follow) {
      const f = k.follow, d = Math.hypot(f.eye[0], f.eye[1], f.eye[2]);
      return `Off <b>${fmtM(d)}</b> · ${f.eye[1] >= 0 ? '+' : '−'}${fmtM(Math.abs(f.eye[1]))}`;
    }
    const g = Math.max(0, game.ground(k.eye[0], k.eye[2]));
    const rng = Math.hypot(k.look[0] - k.eye[0], k.look[1] - k.eye[1], k.look[2] - k.eye[2]);
    return `Alt <b>${fmtM(k.eye[1] - g)}</b> · ${fmtM(rng)}`;
  }
  function fmtM(m) { return m >= 10000 ? (m / 1000).toFixed(0) + ' km' : m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m'; }
  function followTxt(k) {
    const f = k.follow;
    if (!f) return '<span class="fm-cyc off" data-a="follow">—</span>';
    if (f.kind === 'round') return '<span class="fm-cyc on" data-a="follow">Next round</span>';
    return `<span class="fm-cyc on" data-a="follow">${esc(f.name || (f.kind === 'unit' ? 'Unit ' + f.id : 'Round'))}${f.frame === 'body' ? ' · body' : ''}</span>`;
  }
  function renderKeys() {
    const t = T(), cur = fm.curKey();
    if (!t.keys.length) {
      E.keys.innerHTML = `<div class="fm-empty fm-mono">Fly the camera, then <b>K</b> for a key at the head · <b>⇧K</b> to follow the selected unit or the round in view</div>`;
      return;
    }
    E.keys.innerHTML = t.keys.map((k, i) => `<div class="fm-k${i === cur ? ' cur' : ''}" data-i="${i}">
      <span class="n" data-a="goto">${pad2(i + 1)}</span>
      <input class="num" data-f="t" value="${secs(k.t)}" spellcheck="false">
      <span class="go" data-a="goto">${describeEye(k)}</span>
      <span class="go" data-a="goto">${esc(fm.lookName(k))}</span>
      <input class="num" data-f="fov" value="${Math.round(k.fov)}" spellcheck="false">
      <span>${followTxt(k)}</span>
      <input data-f="cap" value="${esc(k.cap)}" placeholder="Caption" maxlength="64" spellcheck="false">
      <span class="x"><i class="re" data-a="rekey" title="Set to the view">↺</i><i data-a="del" title="Remove">×</i></span>
    </div>`).join('');
    curKey = cur;
  }
  function renderRates() {
    const t = T();
    const rows = t.rates.map((r, i) => `<div class="fm-r" data-r="${i}"><span class="n">${pad2(i + 1)}</span>
      <input class="num" data-rf="t" value="${secs(r.t)}" spellcheck="false"><input class="num" data-rf="rate" value="${+r.rate.toFixed(2)}" spellcheck="false">
      <span class="v">${fmtRate(r.rate)}</span><span class="x" data-a="rdel">×</span></div>`).join('');
    E.rates.innerHTML = (rows || `<div class="fm-r"><span></span><span class="fm-mono" style="grid-column: 2 / 5">The game's rate · <b>x${game.timeRate}</b></span></div>`) +
      `<div class="fm-r"><span></span><span class="fm-cyc" data-a="radd" style="grid-column: 2 / 5">+ Rate at the head</span></div>`;
  }
  function renderOpts() {
    const t = T();
    const opt = (k, v, lab) => `<span class="fm-cyc${t[k] === v ? ' on' : ''}" data-a="opt" data-k="${k}" data-v="${v}">${lab}</span>`;
    E.opts.innerHTML = `
      <span>Loop</span><span class="vals">${opt('loop', true, 'On')}${opt('loop', false, 'Off')}</span>
      <span>Start</span><span class="vals">${opt('start', 'now', 'Now')}${opt('start', 'launch', 'Next launch')}</span>
      <span>Sky</span><span class="vals">${opt('sky', '', 'Map')}${opt('sky', 'dusk', 'Dusk')}${opt('sky', 'night', 'Night')}${opt('sky', 'day', 'Day')}</span>
      <span>Hand</span><span class="vals">${opt('hand', true, 'On')}${opt('hand', false, 'Off')}</span>
      <span>Ease</span><span class="vals">${opt('ease', 'clamped', 'Clamped')}${opt('ease', 'film', 'Film')}<span>${t.ease === 'film' ? 'FILM.path tangents as they are' : 'held looks hold · no overshoot'}</span></span>
      <span>Gap</span><span class="vals"><input class="num" data-o="gap" value="${secs(t.gap)}" spellcheck="false"><span>s between keys${t.loop ? ' · closing span' : ''}</span></span>
      <span>Caption</span><span class="vals" style="display:block"><input data-o="caption" value="${esc(t.caption)}" placeholder="Fig. caption for the whole take" maxlength="64" spellcheck="false"></span>`;
  }
  function renderTrack() {
    const t = T(), L = fm.trackLen();
    const cur = fm.curKey();
    let h = '';
    const len = fm.len();
    if (len > 0) h += `<div class="end" style="left:${(len / L * 100).toFixed(3)}%"></div>`;
    t.keys.forEach((k, i) => {
      const lab = k.cap || (k.follow ? (k.follow.kind === 'round' ? 'Round' : (k.follow.name || 'Follow')) : 'K' + (i + 1));
      h += `<div class="tick${i === cur ? ' cur' : ''}${k.follow ? ' fol' : ''}" data-ti="${i}" style="left:${(k.t / L * 100).toFixed(3)}%"><span>${esc(lab)}</span></div>`;
    });
    t.rates.forEach((r, i) => { h += `<div class="rt" data-ri="${i}" style="left:${(r.t / L * 100).toFixed(3)}%"><span>${fmtRate(r.rate)}</span></div>`; });
    E.ticks.innerHTML = h;
    last.head = -1;
  }
  function renderIO() {
    E.io.classList.toggle('on', !!io);
    root.querySelectorAll('.fm-ft [data-a="takes"], .fm-ft [data-a="export"], .fm-ft [data-a="import"]').forEach(el => el.classList.toggle('on', el.dataset.a === io));
    if (!io) { E.io.innerHTML = ''; return; }
    if (io === 'takes') {
      const b = fm.builtins().map(x => `<span class="fm-ch nk" data-a="lb" data-id="${esc(x.id)}">${esc(x.name)}</span>`).join('');
      const s = fm.saved().map(x => `<span class="fm-ch nk" data-a="ls" data-n="${esc(x.name)}">${esc(x.name)} <span class="fm-mono">${x.keys.length} k</span><i data-a="lsdel" title="Delete">×</i></span>`).join('');
      E.io.innerHTML = `<div class="grp"><span class="fm-lbl">Built in</span>${b}</div>
        <div class="grp"><span class="fm-lbl">Saved</span>${s || '<span class="fm-mono">None yet · Save keeps the take in this browser</span>'}</div>`;
    } else if (io === 'export') {
      E.io.innerHTML = `<div class="json"><span class="fm-lbl">JSON</span><input data-el="json" readonly spellcheck="false"><span class="fm-ch nk" data-a="copy">Copy</span></div>`;
      const inp = E.io.querySelector('input'); inp.value = fm.exportJSON();
      setTimeout(() => { if (inp.isConnected) { inp.focus(); inp.select(); } }, 0);
    } else if (io === 'import') {
      E.io.innerHTML = `<div class="json"><span class="fm-lbl">JSON</span><input data-el="json" placeholder="Paste a take here" spellcheck="false"><span class="fm-ch nk" data-a="doimport">Load</span></div>`;
      const inp = E.io.querySelector('input');
      setTimeout(() => { if (inp.isConnected) inp.focus(); }, 0);
    }
  }
  function render(what) {
    if (!what || what === 'all') { nameEl.value = T().name; renderKeys(); renderRates(); renderOpts(); renderTrack(); renderIO(); renderBar(); return; }
    if (what === 'track') { renderTrack(); renderBar(); }
    if (what === 'keys') { renderKeys(); renderTrack(); renderBar(); }
    if (what === 'rates') { renderRates(); renderTrack(); }
    if (what === 'opts') { renderOpts(); renderTrack(); }
    if (what === 'io') renderIO();
  }
  function renderBar() {
    const t = T(), L = Math.max(.1, fm.len());
    E.bticks.innerHTML = t.keys.map((k, i) => `<div class="tick" data-i="${i}" style="left:${(Math.min(k.t, L) / L * 100).toFixed(3)}%"><span>${esc(k.cap || 'K' + (i + 1))}</span></div>`).join('');
    last.bhead = -1;
  }

  /* ------------------------------------------------------------ per frame */
  function tick() {
    if (innerWidth !== fitW || innerHeight !== fitH) fit();
    if (msgT && performance.now() > msgT) { E.msg.classList.add('out'); msgT = 0; }
    if (fm.playing) {
      const p = fm.playInfo();
      const tt = p.armed ? 'Film armed · the take starts at the next launch · Esc disarms' : `${fmtT(p.t)} / ${fmtT(p.len)}${p.paused ? ' · paused' : ''}${p.seq ? ` · sequence ${p.seq}` : ''}`;
      if (tt !== last.btt) { E.btt.textContent = tt; last.btt = tt; }
      if (p.armed !== last.armed) { last.armed = p.armed; E.bar.classList.toggle('armed', p.armed); }
      if (p.cap !== last.bch) { E.bch.textContent = p.cap; last.bch = p.cap; }
      const f = p.len > 0 ? Math.min(1, p.t / p.len) : 0;
      if (Math.abs(f - last.bhead) > 1e-4) { last.bhead = f; E.bdone.style.width = (f * 100).toFixed(3) + '%'; E.bhead.style.left = (f * 100).toFixed(3) + '%'; }
      const on = barPinned || performance.now() - barT < 2600 || p.armed || !!p.seq;
      if (on !== barOn) { barOn = on; E.bar.classList.toggle('on', on); document.body.classList.toggle('fm-idle', !on); }
      return;
    }
    if (panel.style.display === 'none') return;
    const L = fm.trackLen(), h = fm.head;
    const f = Math.min(1, h / L);
    if (Math.abs(f - last.head) > 1e-5) { last.head = f; E.done.style.width = (f * 100).toFixed(3) + '%'; E.head.style.left = (f * 100).toFixed(3) + '%'; }
    const tt = `${fmtT(h)} / ${fmtT(fm.len())}`;
    if (tt !== last.tt) { E.tt.textContent = tt; last.tt = tt; }
    const ck = fm.curKey();
    const ch = ck >= 0 ? `Key ${pad2(ck + 1)}${T().keys[ck].cap ? ' · ' + T().keys[ck].cap : ''}` : fm.preview ? 'Preview' : '';
    if (ch !== last.ch) { E.ch.textContent = ch; last.ch = ch; }
    if (ck !== curKey) {
      curKey = ck;
      E.keys.querySelectorAll('.fm-k').forEach(el => el.classList.toggle('cur', +el.dataset.i === ck));
      E.ticks.querySelectorAll('.tick').forEach(el => el.classList.toggle('cur', +el.dataset.ti === ck));
    }
    const ro = `<span>${game.paused ? 'Paused' : 'x' + (+game.timeRate.toFixed(2))}</span><span>·</span><span>T+<b>${game.fmtTime ? game.fmtTime(game.sim.t) : Math.floor(game.sim.t)}</b></span><span>·</span><span><b>${T().keys.length}</b> keys</span>`;
    if (ro !== last.ro) { E.ro.innerHTML = ro; last.ro = ro; }
  }

  /* ------------------------------------------------------------ events */
  const keyIndex = el => { const r = el.closest('[data-i]'); return r ? +r.dataset.i : -1; };
  panel.addEventListener('mousedown', e => {
    // clicks on the panel are the panel's (never a pick on the map behind it); inputs keep their focus behaviour, and
    // a click anywhere else lets go of a field (the keys are the film maker's again)
    if (e.target.closest('input')) return;
    e.preventDefault();
    const a = document.activeElement;
    if (a && a.tagName === 'INPUT' && root.contains(a)) a.blur();
  });
  panel.addEventListener('contextmenu', e => e.preventDefault());
  panel.addEventListener('click', e => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    const act = a.dataset.a, i = keyIndex(a);
    switch (act) {
      case 'close': fm.close(); break;
      case 'fold': { const f = panel.classList.toggle('fold'); a.textContent = f ? 'Unfold' : 'Fold'; try { localStorage.setItem('oniks.films.fold', f ? '1' : '0'); } catch (err) { /* */ } fm.snd('tick'); break; }
      case 'key': fm.addKey(false); break;
      case 'fkey': fm.addKey(true); break;
      case 'play': fm.play(false); break;
      case 'playhead': fm.play(true); break;
      case 'still': fm.still(); break;
      case 'seq': fm.sequence(); break;
      case 'save': fm.save(); break;
      case 'new': fm.newTake(); break;
      case 'takes': case 'export': case 'import': io = io === act ? '' : act; renderIO(); fm.snd('tick'); break;
      case 'goto': fm.gotoKey(i); break;
      case 'rekey': fm.recordKey(i); break;
      case 'del': fm.removeKey(i); break;
      case 'follow': fm.cycleFollow(i); break;
      case 'radd': fm.addRate(); break;
      case 'rdel': { const r = a.closest('[data-r]'); if (r) fm.removeRate(+r.dataset.r); break; }
      case 'opt': { const v = a.dataset.v; fm.setOpt(a.dataset.k, v === 'true' ? true : v === 'false' ? false : v); break; }
      case 'lb': fm.loadBuiltin(a.dataset.id); break;
      case 'ls': fm.loadSaved(a.dataset.n); break;
      case 'lsdel': { e.stopPropagation(); const c = a.closest('[data-n]'); if (c) fm.deleteSaved(c.dataset.n); renderIO(); break; }
      case 'copy': { const inp = E.io.querySelector('input'); inp.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (err) { /* */ }
        if (navigator.clipboard) navigator.clipboard.writeText(inp.value).then(() => fm.msg('Copied')).catch(() => fm.msg(ok ? 'Copied' : 'Select and copy the line', !ok)); else fm.msg(ok ? 'Copied' : 'Select and copy the line', !ok); break; }
      case 'doimport': { const inp = E.io.querySelector('input'); if (fm.importJSON(inp.value)) { io = ''; renderIO(); } break; }
    }
  });
  // text: live; numbers: on commit
  panel.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.f === 'name') fm.setName(el.value);
    else if (el.dataset.f === 'cap') fm.setKey(keyIndex(el), 'cap', el.value, true);
    else if (el.dataset.o === 'caption') fm.setOpt('caption', el.value, true);
  });
  panel.addEventListener('change', e => {
    const el = e.target, i = keyIndex(el);
    if (el.dataset.f === 't' || el.dataset.f === 'fov') fm.setKey(i, el.dataset.f, parseFloat(el.value));
    else if (el.dataset.rf) { const r = el.closest('[data-r]'); if (r) fm.setRate(+r.dataset.r, el.dataset.rf, parseFloat(el.value)); }
    else if (el.dataset.o === 'gap') fm.setOpt('gap', parseFloat(el.value));
  });
  panel.addEventListener('keydown', e => {
    const el = e.target;
    if (el.tagName !== 'INPUT') return;
    if (e.key === 'Enter') { if (el.closest('.fm-io')) { if (io === 'import') { if (fm.importJSON(el.value)) { io = ''; renderIO(); } } } else el.blur(); e.preventDefault(); }
    else if (e.key === 'Escape') { el.blur(); e.preventDefault(); }
    e.stopPropagation();
  });

  /* the timeline: click to preview, drag the head, drag a key tick or a rate mark to retime it */
  let drag = null;
  const timeAt = (x, el) => { const r = el.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)) * fm.trackLen(); };
  E.track.addEventListener('pointerdown', e => {
    e.preventDefault();
    E.track.setPointerCapture(e.pointerId);
    const tk = e.target.closest('[data-ti]'), rt = e.target.closest('[data-ri]');
    if (tk) drag = { kind: 'key', i: +tk.dataset.ti, x0: e.clientX, moved: false, L: fm.trackLen() };
    else if (rt) drag = { kind: 'rate', i: +rt.dataset.ri, x0: e.clientX, moved: false, L: fm.trackLen() };
    else { drag = { kind: 'head' }; fm.setHead(timeAt(e.clientX, E.track), true); }
  });
  E.track.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.kind === 'head') { fm.setHead(timeAt(e.clientX, E.track), true); return; }
    if (!drag.moved && Math.abs(e.clientX - drag.x0) < 3) return;
    drag.moved = true;
    const r = E.track.getBoundingClientRect(), t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * drag.L;
    const snap = Math.round(t * 10) / 10;
    if (drag.kind === 'key') { fm.moveKey(drag.i, snap); const el = E.ticks.querySelector(`[data-ti="${drag.i}"]`); if (el) el.style.left = (snap / drag.L * 100).toFixed(3) + '%'; }
    else { fm.moveRate(drag.i, snap); const el = E.ticks.querySelector(`[data-ri="${drag.i}"]`); if (el) el.style.left = (snap / drag.L * 100).toFixed(3) + '%'; }
  });
  const endDrag = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'key') { if (d.moved) fm.commitMove(); else fm.gotoKey(d.i); }
    else if (d.kind === 'rate') { if (d.moved) fm.commitMove(); }
  };
  E.track.addEventListener('pointerup', endDrag);
  E.track.addEventListener('pointercancel', endDrag);

  /* the play bar: seek the take (the camera and the rate; the sim runs on) */
  let bdrag = false;
  const bAt = e => { const r = E.btrack.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * fm.len(); };
  E.btrack.addEventListener('pointerdown', e => { e.preventDefault(); bdrag = true; E.btrack.setPointerCapture(e.pointerId); fm.seek(bAt(e)); });
  E.btrack.addEventListener('pointermove', e => { if (bdrag) fm.seek(bAt(e)); });
  E.btrack.addEventListener('pointerup', () => { bdrag = false; });
  E.bar.addEventListener('mousedown', e => e.preventDefault());

  return {
    root,
    render,
    tick,
    show(on) { panel.style.display = on ? '' : 'none'; if (on) { fit(); render('all'); } else if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur(); },
    get shown() { return panel.style.display !== 'none'; },
    get barOn() { return barOn && !E.bar.classList.contains('armed'); },
    playing(on) {
      E.bar.classList.remove('on', 'armed'); barOn = false; last.armed = undefined; last.btt = ''; barT = on ? performance.now() : 0;
      document.body.classList.toggle('fm-playing', on); document.body.classList.remove('fm-idle'); if (on) renderBar();
    },
    wake() { barT = performance.now(); },
    pin() { barPinned = !barPinned; barT = performance.now(); return barPinned; },
    msg(text, bad) { E.msg.textContent = text; E.msg.classList.toggle('bad', !!bad); E.msg.classList.remove('out'); msgT = performance.now() + 2600; },
    closeIO() { if (!io) return false; io = ''; renderIO(); return true; },
    dispose() { root.remove(); document.body.classList.remove('fm-playing', 'fm-idle'); },
  };
}
