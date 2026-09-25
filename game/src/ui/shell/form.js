/* Rows of choices, drawn like the films' menus: index number, lime square on the focused row, the chosen
   value with the dotted underline (Orbital: the highlighter). Keyboard: ↑↓/WS focus, ←→/AD change,
   Enter acts. Mouse: hover focuses, click chooses.

   new Form(el, { rows, onChange(id, v), onAction(id), enter: 'start' | 'cycle' | null, blurb: el })
   row = { id, label, choices: [[v, text]], value, blurb?(v), off?() , meter?, cycle?, note? }
       | { id, label, action: true, aside? }   | { gap: true } | { group: 'Graphics' } */
import { h, esc, pad2, swipe, replay } from './dom.js';
import { sfx } from './sfx.js';

const same = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b;

export class Form {
  constructor(el, o) {
    this.el = el; this.o = o; this.rows = []; this.i = -1; this.busy = false;
    let n = 0;
    for (const r of o.rows) {
      if (r.gap) { el.append(h('div.gap')); continue; }
      if (r.group) { el.append(h('div.grp', r.group)); continue; }
      const row = { ...r, k: this.rows.length };
      row.el = h('div.row' + (r.action ? '.act' : ''));
      row.el.dataset.id = r.id;
      if (!r.noIndex) n++;
      const num = r.noIndex ? '' : pad2(n);
      if (r.action) {
        row.el.innerHTML = `<span class="n">${num}</span><i class="sq"></i><span class="lab">${swipe('act' + r.id)}<span class="tx">${esc(r.label)}</span></span>` + (r.aside ? `<span class="aside">${esc(r.aside)}</span>` : '');
        row.el.addEventListener('click', () => { this.focus(row.k, true); this.act(row); });
      } else {
        row.el.innerHTML = `<span class="n">${num}</span><i class="sq"></i><span class="k">${esc(r.label)}</span><span class="vals"></span>` + (r.note ? `<span class="note">${esc(r.note)}</span>` : '');
        row.vals = row.el.querySelector('.vals');
        this.build(row);
      }
      row.el.addEventListener('mouseenter', () => { if (!this.busy && this.focusable(row)) this.focus(row.k); });
      el.append(row.el);
      this.rows.push(row);
    }
    this.refresh();
    const first = this.rows.findIndex(r => this.focusable(r));
    this.focus(o.start != null ? o.start : first, true);
  }

  build(row) {
    const v = row.value, ch = row.choices;
    if (row.meter) {
      const k = ch.findIndex(c => same(c[0], v));
      row.vals.innerHTML = `<span class="meter">${ch.slice(1).map((c, i) => `<i data-k="${i + 1}" class="${i + 1 <= k ? 'f' : ''}${i + 1 === k ? ' top' : ''}"></i>`).join('')}</span><span class="mv">${esc(ch[k] ? ch[k][1] : '')}</span>`;
      row.vals.querySelectorAll('.meter i').forEach(q => q.addEventListener('click', e => { e.stopPropagation(); this.focus(row.k); const kk = +q.dataset.k; this.set(row.id, ch[kk === k ? 0 : kk][0], true); }));
      row.vals.querySelector('.meter').addEventListener('dblclick', e => e.preventDefault());
      return;
    }
    if (row.cycle) {
      const k = Math.max(0, ch.findIndex(c => same(c[0], v)));
      row.vals.innerHTML = `<span class="cyc"><span class="c sel">${swipe('cy' + row.id + k)}<span class="tx">${esc(ch[k][1])}</span></span><span class="ar" data-d="-1">‹</span><span class="cnt">${pad2(k + 1)} / ${pad2(ch.length)}</span><span class="ar" data-d="1">›</span></span>`;
      row.vals.querySelector('.c').addEventListener('click', e => { e.stopPropagation(); this.focus(row.k); this.step(row, 1); });
      row.vals.querySelectorAll('.ar').forEach(a => a.addEventListener('click', e => { e.stopPropagation(); this.focus(row.k); this.step(row, +a.dataset.d); }));
      return;
    }
    row.vals.innerHTML = ch.map((c, i) => `<span class="c${same(c[0], v) ? ' sel' : ''}${row.dis && row.dis(c[0]) ? ' dis' : ''}" data-k="${i}">${swipe(row.id + i)}<span class="tx">${esc(c[1])}</span></span>`).join('');
    row.vals.querySelectorAll('.c').forEach(q => q.addEventListener('click', e => { e.stopPropagation(); if (!this.focusable(row)) return; this.focus(row.k); this.set(row.id, ch[+q.dataset.k][0], true); }));
  }

  focusable(r) { return r && !(r.off && r.off(this)); }
  row(id) { return this.rows.find(r => r.id === id); }
  value(id) { const r = this.row(id); return r && r.value; }
  values() { const o = {}; for (const r of this.rows) if (!r.action) o[r.id] = r.value; return o; }

  set(id, v, user) {
    const r = this.row(id); if (!r) return;
    if (same(r.value, v)) return;
    r.value = v; this.build(r);
    if (user) sfx.tick();
    this.o.onChange && this.o.onChange(id, v, user);
    this.refresh();
    if (this.rows[this.i] === r) this.blurb();
  }
  setChoices(id, choices, value) { const r = this.row(id); if (!r) return; r.choices = choices; if (value !== undefined) r.value = value; this.build(r); this.refresh(); }

  refresh() {
    for (const r of this.rows) {
      r.el.classList.toggle('off', !this.focusable(r));
      if (r.choices && r.dis && !r.meter && !r.cycle) r.vals.querySelectorAll('.c').forEach(q => q.classList.toggle('dis', r.dis(r.choices[+q.dataset.k][0])));
    }
  }

  focus(k, quiet) {
    if (k < 0 || k >= this.rows.length) return;
    const changed = k !== this.i;
    this.i = k;
    this.rows.forEach((r, j) => r.el.classList.toggle('on', j === k));
    if (changed && !quiet) sfx.move();
    if (changed || quiet) this.blurb();
    this.o.onFocus && this.o.onFocus(this.rows[k].id);
  }
  blurb() {
    const el = this.o.blurb, r = this.rows[this.i]; if (!el || !r) return;
    const t = r.blurb ? (typeof r.blurb === 'function' ? r.blurb(r.value) : r.blurb) : '';
    if (el.textContent !== t) { el.textContent = t; replay(el, 'in'); }
  }
  move(d) {
    let k = this.i;
    for (let n = 0; n < this.rows.length; n++) {
      k = (k + d + this.rows.length) % this.rows.length;
      if (this.focusable(this.rows[k])) { this.focus(k); return; }
    }
  }
  step(r, d) {
    if (!r || r.action) return;
    const ch = r.choices, k0 = ch.findIndex(c => same(c[0], r.value));
    if (r.meter) { const k = Math.max(0, Math.min(ch.length - 1, k0 + d)); if (k !== k0) this.set(r.id, ch[k][0], true); else sfx.deny(); return; }
    let k = k0;
    for (let n = 0; n < ch.length; n++) {
      k = (k + d + ch.length) % ch.length;
      if (!(r.dis && r.dis(ch[k][0]))) break;
    }
    if (k !== k0) this.set(r.id, ch[k][0], true);
  }
  act(r) {
    if (this.busy || !r || !r.action) return;
    if (r.id && this.o.canAct && !this.o.canAct(r.id)) { sfx.deny(); return; }
    r.el.classList.add('go');
    setTimeout(() => r.el.classList.remove('go'), 700);
    this.o.onAction && this.o.onAction(r.id);
  }

  key(e) {
    if (this.busy) return false;
    const k = e.key, r = this.rows[this.i];
    if (k === 'ArrowUp' || k === 'w' || k === 'W') { this.move(-1); return true; }
    if (k === 'ArrowDown' || k === 's' || k === 'S') { this.move(1); return true; }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { this.step(r, -1); return true; }
    if (k === 'ArrowRight' || k === 'd' || k === 'D') { this.step(r, 1); return true; }
    if (k === 'Enter' || k === ' ') {
      if (r && r.action) this.act(r);
      else if (this.o.enter === 'cycle') this.step(r, 1);
      else if (this.o.enter) this.act(this.row(this.o.enter));
      return true;
    }
    return false;
  }
}
