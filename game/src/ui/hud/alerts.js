/* Alerts (right column, under the engagement log, clear of the horizon where the tracks sit): rounds inbound on own
   units (coral, blinking softly, with the bearing and the range of the nearest), a new hostile contact, an own unit
   hit or lost. Click one: the camera flies there. Toasts (the game's short confirmations, bus 'toast') fade in the
   bottom centre, above the command card. */
import { unitRef, esc, brg, km, dur } from './fmt.js';

export function createAlerts(game, hud, parent, toastParent) {
  const { sim } = game, cam = game.camera;
  const el = document.createElement('div'); el.className = 'h-al'; parent.appendChild(el);
  const tEl = document.createElement('div'); tEl.className = 'h-toasts'; toastParent.appendChild(tEl);
  const list = [];                 // transient: { key, chip, text, cls, pos, unit, t0, dur, n }
  const toasts = [];
  let inc = null, lastInc = -1, tKey = '';
  const slots = [0, 1, 2].map(i => {
    const d = document.createElement('div'); d.dataset.i = i; d.style.display = 'none';
    d.innerHTML = '<b></b><i></i>'; el.appendChild(d);
    return { el: d, b: d.firstChild, i: d.lastChild, on: false, cls: '', chip: '', text: '' };
  });

  el.addEventListener('mousedown', e => {
    const a = e.target.closest('[data-i]');
    if (!a) return;
    e.stopPropagation(); e.preventDefault();
    const i = +a.dataset.i, it = shown[i];
    if (!it) return;
    const d = game.getSystem('director'); if (d && d.on && d.set) d.set(false);
    let p = it.pos;
    if (it.unit) { const u = sim.units.get(it.unit); if (u && (u.alive || u.dying < 1)) p = game.unitPose(u).pos; }
    if (it.track) { const c = sim.contact(game.side, it.track); if (c) p = c.pos; }
    if (p) cam.flyTo([p[0], undefined, p[2]], { dist: it.dist || Math.min(Math.max(cam.goal.dist, 2500), 9000) });
    hud.click();
  });
  game.bus.on('side', () => { list.length = 0; inc = null; lastInc = -1; });
  game.bus.on('toast', d => { toasts.push({ text: d.text, bad: !!d.bad, t0: game.realT }); if (toasts.length > 3) toasts.shift(); });

  function push(k, chip, text, cls, o) {
    let a = list.find(x => x.key === k && game.realT - x.t0 < (x.merge || 0));
    if (a) { a.n++; a.t0 = game.realT; if (o.textN) a.text = o.textN(a.n); Object.assign(a, o.upd || {}); return; }
    a = Object.assign({ key: k, chip, text, cls, t0: game.realT, dur: 6, n: 1 }, o);
    list.unshift(a);
    if (list.length > 6) list.pop();
  }
  const ownRef = () => { const h = sim.hq(game.side) || sim.alive(game.side).find(u => !u.aboard); return h ? h.pos : null; };

  function onEvent(e) {
    const me = game.side;
    if (e.type === 'detect' && e.side === me && e.unit !== undefined) {
      const o = ownRef(), where = o ? ` · ${brg(e.pos[0] - o[0], e.pos[2] - o[2])}° · ${km(Math.hypot(e.pos[0] - o[0], e.pos[2] - o[2]))}` : '';
      push('contact', 'Contact', `${e.track}${where}`, 'w', { pos: e.pos.slice(), track: e.unit, merge: 5, dist: 12000,
        textN: n => `${n} new tracks${where}` });
    } else if (e.type === 'destroyed' && e.side === me) {
      const u = sim.units.get(e.unit);
      push('lost' + e.unit, 'Lost', u ? `${unitRef(u)} · ${u.def.name}` : 'Unit', 'c', { pos: e.pos.slice(), dur: 9, dist: 3000 });
      for (let i = list.length - 1; i >= 0; i--) if (list[i].key === 'hit' + e.unit) list.splice(i, 1);
    } else if (e.type === 'hit') {
      const t = sim.units.get(e.target);
      if (t && t.side === me && t.alive) push('hit' + t.id, 'Hit', `${unitRef(t)} · ${Math.round(100 * t.hp / t.hpMax)}%`, 'c', { unit: t.id, merge: 6, dist: Math.max(1500, t.def.size[0] * 12),
        upd: { text: `${unitRef(t)} · ${Math.round(100 * t.hp / t.hpMax)}%` } });
    }
  }

  /* rounds in the air toward own units, as far as own sensors see them */
  function incoming() {
    const me = game.side, per = new Map();
    let n = 0, best = null, bd = 1e18;
    for (const p of sim.projectiles.values()) {
      if (!p.alive || p.side === me || p.tk !== 'unit' || !p.P || !p.P.threat) continue;
      const t = sim.units.get(p.target);
      if (!t || t.side !== me || !sim.projVisible(me, p)) continue;
      n++;
      per.set(t.id, (per.get(t.id) || 0) + 1);
      const d = Math.hypot(p.pos[0] - t.pos[0], p.pos[2] - t.pos[2]);
      if (d < bd) { bd = d; best = { p, t, d }; }
    }
    if (!n) return null;
    const { p, t, d } = best;
    const eta = d / Math.max(50, Math.hypot(p.vel[0], p.vel[2]));
    const on = per.size === 1 ? unitRef(t) : `${per.size} units`;
    return { n, unit: t.id, text: `${n} on ${on} · ${brg(p.pos[0] - t.pos[0], p.pos[2] - t.pos[2])}° · ${km(d)} · T–${dur(eta)}` };
  }

  let shown = [];
  return {
    onEvent,
    update() {
      if (game.realT - lastInc > .2) { lastInc = game.realT; inc = incoming(); }
      for (let i = list.length - 1; i >= 0; i--) if (game.realT - list[i].t0 > list[i].dur) list.splice(i, 1);
      shown = [];
      if (inc) shown.push({ chip: 'Incoming', text: inc.text, cls: 'c blink', unit: inc.unit, dist: 5000 });
      for (const a of list) { if (shown.length >= 3) break; shown.push(a); }
      // three fixed slots, patched in place (a rebuilt node would restart the blink)
      for (let i = 0; i < 3; i++) {
        const s = slots[i], a = shown[i];
        if (!a) { if (s.on) { s.on = false; s.el.style.display = 'none'; } continue; }
        if (!s.on) { s.on = true; s.el.style.display = ''; }
        const cls = 'al hit ' + a.cls;
        if (s.cls !== cls) { s.cls = cls; s.el.className = cls; }
        if (s.chip !== a.chip) { s.chip = a.chip; s.b.textContent = a.chip; s.el.classList.remove('in'); void s.el.offsetWidth; s.el.classList.add('in'); }
        if (s.text !== a.text) { s.text = a.text; s.i.textContent = a.text; }
      }
      // toasts
      let tk = '';
      for (let i = toasts.length - 1; i >= 0; i--) { const age = game.realT - toasts[i].t0; if (age > 2.4) toasts.splice(i, 1); else tk += toasts[i].text + (age > 1.9 ? 'f' : '') + '|'; }
      if (tk !== tKey) {
        tKey = tk;
        tEl.innerHTML = toasts.map(t => `<div class="${t.bad ? 'c' : 'l'}${game.realT - t.t0 > 1.9 ? ' out' : ''}">${esc(t.text)}</div>`).join('');
      }
    },
  };
}
