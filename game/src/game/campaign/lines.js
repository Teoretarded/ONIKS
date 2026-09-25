/* The mission's voice on screen, in the films' language: one short mono line at a time, bottom centre above the
   command card (a lime square, or a key chip for an instruction), typed in; and tags in the world pinned to a
   subject (id chip + label, dotted leader), as the films tag what they show.

   const L = createLines(game)
   L.say(text, { tone: 'lime'|'coral'|'white', key, hold })   a line; queued, one at a time (real seconds)
   L.prompt(text, { key }) / L.prompt(null)                   the standing instruction, shown when no line is
   L.mark(id, target, { chip, label, kind, until })          a tag on a unit / point / fn -> [x, y, z]; L.unmark(id)
   L.area(id, [x, z], r, { kind, until, label })               a dotted ring on the sea / ground (where to look); L.unarea(id)
   L.update(), L.draw3d(), L.draw2d(ov), L.clear(), L.dispose()
   `key` is a string ('T', 'Right-click') or an array of them (['W', 'A', 'S', 'D']). */

const CSS = `
#cmp { position: absolute; left: 0; right: 0; height: 0; display: flex; justify-content: center; pointer-events: none; }
#cmp .ln { position: absolute; bottom: 0; display: inline-flex; align-items: center; gap: 12px; white-space: nowrap;
  font: 400 13px/1 var(--mono); letter-spacing: .06em; text-transform: uppercase; color: rgba(255,255,255,.92);
  text-shadow: 0 0 2px #0B0C0A, 0 0 6px rgba(11,12,10,.95), 0 0 14px rgba(11,12,10,.8); transform-origin: 50% 100%; }
#cmp .ln i.sq { width: 7px; height: 7px; background: var(--lime); flex: none; }
#cmp .ln.coral i.sq { background: var(--coral); }
#cmp .ln.coral .t { color: var(--coral); }
#cmp .ln.white i.sq { background: #fff; }
#cmp .ln .k { display: inline-flex; gap: 4px; }
#cmp .ln .k b { background: #fff; color: #0B0C0A; padding: 5px 7px 4px; font: 500 11.5px/1 var(--mono); letter-spacing: .05em; text-shadow: none; }
#cmp .ln.prompt .k b { background: var(--lime); }
#cmp .ln.prompt .t { color: #fff; }`;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;

export function createLines(game) {
  if (!document.getElementById('oniks-cmp-css')) {
    const s = document.createElement('style'); s.id = 'oniks-cmp-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  const root = document.createElement('div'); root.id = 'cmp';
  (game.uiRoot || document.body).appendChild(root);
  const queue = [];            // { text, tone, key, hold }
  let cur = null;              // { el, item, t0, until, kind: 'line'|'prompt' }
  let prompt = null;           // { text, key }
  let promptKey = '';
  const marks = new Map();     // id -> { target, chip, label, kind, until, t0 }
  const areas = new Map();     // id -> { c: [x, z], r, kind, until, t0, label }
  const RGB = { lime: [198, 244, 50], coral: [255, 106, 61], white: [238, 238, 228] };
  const q = [0, 0, 0];

  function keyHtml(key) {
    if (!key) return '';
    const ks = Array.isArray(key) ? key : [key];
    return `<span class="k">${ks.map(k => `<b>${esc(k)}</b>`).join('')}</span>`;
  }
  function build(item, kind) {
    const el = document.createElement('div');
    el.className = `ln in ${kind === 'prompt' ? 'prompt' : item.tone || 'lime'}`;
    el.innerHTML = (item.key ? keyHtml(item.key) : '<i class="sq"></i>') + `<span class="t">${esc(item.text)}</span>`;
    el.style.transform = `scale(${scale()})`;
    el.lastChild.style.clipPath = 'inset(0 100% 0 0)';
    root.appendChild(el);
    return el;
  }
  const leaving = [];          // { el, t0 } fading out on the game's clock
  function drop(c) {
    if (!c) return;
    leaving.push({ el: c.el, t0: game.realT });
  }
  function scale() {
    const hs = parseFloat(getComputedStyle(document.body).getPropertyValue('--hs'));
    return isFinite(hs) && hs > 0 ? hs : Math.max(.8, Math.min(1.6, Math.min(innerWidth / 1920, innerHeight / 1080)));
  }
  /* above the command card (and the toasts over it) */
  let placeAt = -1;
  function place() {
    if (game.realT - placeAt < .5) return;
    placeAt = game.realT;
    const card = document.querySelector('#hud .h-cmd');
    let bottom = 230 * scale();
    if (card) { const r = card.getBoundingClientRect(); if (r.height > 0) bottom = innerHeight - r.top + 64 * scale(); }
    root.style.bottom = Math.round(bottom) + 'px';
    root.style.top = 'auto';
  }

  function holdOf(item) {
    if (item.hold) return item.hold;
    const n = item.text.length;
    return Math.max(2.6, Math.min(6.5, 1.6 + n * .055));
  }

  const L = {
    say(text, o) {
      if (!text) return;
      o = o || {};
      queue.push({ text, tone: o.tone, key: o.key, hold: o.hold });
      // a backlog reads faster
      if (queue.length > 3) queue.splice(0, queue.length - 3);
    },
    prompt(text, o) {
      if (!text) { prompt = null; return; }
      o = o || {};
      prompt = { text, key: o.key };
    },
    get busy() { return !!(cur && cur.kind === 'line') || queue.length > 0; },
    mark(id, target, o) {
      o = o || {};
      marks.set(id, { target, chip: o.chip || '', label: o.label || '', kind: o.kind || 'lime', until: o.until ? game.realT + o.until : 1e18, t0: game.realT, dx: o.dx, dy: o.dy });
    },
    unmark(id) { if (id === undefined) marks.clear(); else marks.delete(id); },
    area(id, c, r, o) {
      o = o || {};
      const old = areas.get(id);
      areas.set(id, { c, r, kind: o.kind || 'white', until: o.until ? game.realT + o.until : 1e18, t0: old && old.kind === (o.kind || 'white') ? old.t0 : game.realT, label: o.label || '' });
    },
    unarea(id) { if (id === undefined) areas.clear(); else areas.delete(id); },
    draw3d() {
      if (!areas.size) return;
      const fx = game.R.fx;
      for (const [id, A] of areas) {
        if (game.realT > A.until) { areas.delete(id); continue; }
        const a = sat((game.realT - A.t0) / .6) * (A.until < 1e17 ? sat((A.until - game.realT) / .8) : 1);
        fx.ring([A.c[0], 0, A.c[1]], A.r, { rgb: RGB[A.kind] || RGB.white, a: .95 * a, step: 6, size: 2, drape: true, lift: 4, mode: 'over' });
      }
    },
    clear() { queue.length = 0; prompt = null; drop(cur); cur = null; promptKey = ''; },
    update() {
      place();
      const now = game.realT;
      // the current transient line ends
      if (cur && cur.kind === 'line' && now >= cur.until) { drop(cur); cur = null; }
      if ((!cur || cur.kind === 'prompt') && queue.length) {
        if (cur) { drop(cur); cur = null; promptKey = ''; }
        const item = queue.shift();
        const hold = holdOf(item) * (queue.length > 1 ? .7 : 1);
        cur = { el: build(item, 'line'), item, t0: now, until: now + hold, kind: 'line' };
      }
      // the prompt shows when no line does; a changed prompt replaces the shown one
      const pk = prompt ? prompt.text + '|' + (prompt.key || '') : '';
      if (!cur && prompt) { cur = { el: build(prompt, 'prompt'), item: prompt, t0: now, until: 1e18, kind: 'prompt' }; promptKey = pk; }
      else if (cur && cur.kind === 'prompt' && pk !== promptKey) { drop(cur); cur = null; promptKey = ''; if (prompt) { cur = { el: build(prompt, 'prompt'), item: prompt, t0: now, until: 1e18, kind: 'prompt' }; promptKey = pk; } }
      for (const [id, mk] of marks) if (now > mk.until) marks.delete(id);
      for (let i = leaving.length - 1; i >= 0; i--) {
        const x = leaving[i], k = (now - x.t0) / .3;
        if (k >= 1 || now < x.t0) { x.el.remove(); leaving.splice(i, 1); } else x.el.style.opacity = (1 - k).toFixed(2);
      }
      // typed in (the films' typein, driven by the game's clock so it is the same in stills)
      if (cur && !cur.typed) {
        const p = Math.min(1, (now - cur.t0) / .5), t = cur.el.lastChild;
        t.style.clipPath = p >= 1 ? '' : `inset(0 ${(100 - Math.floor(p * 24) / 24 * 100).toFixed(1)}% 0 0)`;
        if (p >= 1) cur.typed = true;
      }
    },
    draw2d(ov) {
      const cam = game.camera, sim = game.sim;
      for (const A of areas.values()) {
        if (!A.label) continue;
        const p = [A.c[0] + Math.sin(-.6) * A.r, 10, A.c[1] + Math.cos(-.6) * A.r];
        if (!cam.project(p, q)) continue;
        ov.tag(q[0] + 6, q[1] - 22, '', A.label, '', { kind: A.kind === 'coral' ? 'coral' : 'ghost', a: .85, size: 10.5 });
      }
      if (!marks.size) return;
      for (const mk of marks.values()) {
        let p = null, t = mk.target;
        if (typeof t === 'function') p = t();
        else if (Array.isArray(t)) p = t;
        else if (t && t.pos) {
          const u = t;
          if (u.alive === false && u.dying >= 1) continue;
          if (u.side !== game.side) {
            const v = game.vis(u);
            if (!v) continue;
            const c = sim.contact(game.side, u.id);
            p = v === 'track' ? game.unitPose(u).pos : c ? c.pos : null;
          } else p = game.unitPose(u).pos;
          if (p) { q[0] = p[0]; q[1] = p[1] + Math.min(40, (u.def.size[2] || 4) * .6); q[2] = p[2]; p = q; }
        }
        if (!p || !cam.project(p, q)) continue;
        const x = q[0], y = q[1];
        if (x < -50 || y < -50 || x > ov.W + 50 || y > ov.H + 50) continue;
        const a = sat((game.realT - mk.t0) / .35) * (mk.until < 1e17 ? sat((mk.until - game.realT) / .5) : 1);
        const col = mk.kind === 'coral' ? '#FF6A3D' : mk.kind === 'white' ? '#FFFFFF' : '#C6F432';
        const dx = mk.dx !== undefined ? mk.dx : 34, dy = mk.dy !== undefined ? mk.dy : -46;
        ov.mark(x, y, 6, col, a, false);
        ov.leader(x + Math.sign(dx) * 5, y + Math.sign(dy) * 5, x + dx, y + dy, col, .8 * a);
        ov.tag(x + dx + (dx < 0 ? -2 : 2), y + dy - 10, mk.chip, mk.label, '', { kind: mk.kind, a, size: 11, align: dx < 0 ? 'right' : 'left' });
      }
    },
    dispose() { root.remove(); },
  };
  return L;
}
