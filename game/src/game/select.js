/* Selection: click, Shift-click add / remove, drag a box, double-click (every unit of that type on screen),
   Ctrl 1-9 set a group, 1-9 recall (twice quickly: fly to it), Tab / Shift-Tab cycle own units, F follow.
   Draws lime brackets that fit the object (R.screenBox) with a short tag, hover highlight, the drag box.
   Enemy tracks can be selected alone (for their readout); they are never ordered. */
import { PRI } from './game.js';
import { unitTag, SHORT } from './labels.js';

const LIME = '#C6F432', CORAL = '#FF6A3D';

export function createSelect(game) {
  const { sim, R } = game, cam = R.camera;
  let box = null;              // { x0, y0, x1, y1, add }
  let lastRecall = { n: 0, t: 0 };
  let followId = 0;
  const q = [0, 0, 0], placed = [];

  /* the unit under a screen point: drawn instances first, then own units' specks and tracks by their screen point */
  function pickUnit(x, y) {
    const d = R.pick(x, y);
    if (d && d.id !== undefined && sim.units.has(d.id)) return sim.units.get(d.id);
    let best = null, bd = 12 * 12;
    for (const u of sim.list()) {
      if (u.aboard) continue;
      const v = game.vis(u); if (v !== 'own' && v !== 'track') continue;
      if (cam.project(game.unitPose(u).pos, q)) {
        const dd = (q[0] - x) ** 2 + (q[1] - y) ** 2;
        if (dd < bd) { bd = dd; best = u; }
      }
      // a track is also where the picture puts it (the sensors draw it at the estimate)
      if (v === 'track') {
        const c = sim.contact(game.side, u.id);
        if (c && c.pos && cam.project(c.pos, q)) { const dd = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (dd < bd) { bd = dd; best = u; } }
      }
    }
    return best;
  }
  game.pickUnit = pickUnit;

  function onScreen(u) {
    if (!cam.project(game.unitPose(u).pos, q)) return false;
    return q[0] >= 0 && q[1] >= 0 && q[0] <= cam.W && q[1] <= cam.H;
  }
  function frameUnits(us) {
    if (!us.length) return;
    const pts = us.map(u => game.unitPose(u).pos.slice());
    const r = Math.max(...us.map(u => Math.max(u.def.size[0], 30)));
    if (pts.length === 1) cam.flyTo(pts[0], { dist: Math.max(cam.goal.dist * .6 < r * 4 ? r * 4 : Math.min(cam.goal.dist, r * 14), r * 4) });
    else cam.frame(pts, { pad: 1.6 });
  }
  function follow(u) {
    if (!u) { cam.follow(null); followId = 0; return; }
    followId = u.id;
    cam.follow(() => { const v = sim.units.get(followId); return v && (v.alive || v.dying < 1) ? game.unitPose(v).pos : null; }, false);
  }
  game.follow = follow;
  game.frameUnits = frameUnits;

  return {
    name: 'selection', priority: PRI.selection,
    onKey(e) {
      if (e.type !== 'keydown') return false;
      const k = e.code;
      if (/^Digit[1-9]$/.test(k)) {
        const n = +k.slice(5);
        // Ctrl 1-9 sets a group (Alt 1-9 too: some browsers keep Ctrl 1-8 for their tabs)
        if (e.ctrlKey || e.metaKey || e.altKey) {
          game.groups[n] = game.selected().map(u => u.id);
          game.bus.emit('group', { n, ids: game.groups[n] });
          return true;
        }
        const ids = (game.groups[n] || []).filter(id => game.commandable(sim.units.get(id)));
        if (!ids.length) return true;
        if (e.shiftKey) game.select(ids, { add: true }); else game.select(ids);
        const now = performance.now();
        if (lastRecall.n === n && now - lastRecall.t < 400) frameUnits(ids.map(id => sim.units.get(id)));
        lastRecall = { n, t: now };
        return true;
      }
      if (k === 'Tab') {
        const own = sim.alive(game.side).filter(u => !u.aboard).sort((a, b) => a.id - b.id);
        if (!own.length) return true;
        const cur = game.selected()[0];
        const pool = cur && game.selection.size === 1 ? own : own;
        let i = cur ? pool.findIndex(u => u.id === cur.id) : -1;
        i = (i + (e.shiftKey ? -1 : 1) + pool.length) % pool.length;
        game.select([pool[i].id]);
        frameUnits([pool[i]]);
        return true;
      }
      if (k === 'KeyF' && !e.ctrlKey) {
        const us = [...game.selection].map(id => sim.units.get(id)).filter(Boolean);
        if (followId && (!us.length || us[0].id === followId)) { follow(null); return true; }
        if (us.length) { follow(us[0]); if (cam.goal.dist > 20000) cam.goal.dist = Math.max(us[0].def.size[0] * 6, 600); }
        return true;
      }
      return false;
    },
    onPointer(ev) {
      if (ev.type === 'move') {
        if (box) { box.x1 = ev.x; box.y1 = ev.y; return true; }
        if (game.mouse.down < 0) { const u = pickUnit(ev.x, ev.y); game.hover = u ? u.id : null; }
        return false;
      }
      if (ev.type === 'down' && ev.button === 0) { box = { x0: ev.x, y0: ev.y, x1: ev.x, y1: ev.y, add: ev.shift, live: false }; return false; }
      if (ev.type === 'up' && ev.button === 0 && box) {
        const b = box; box = null;
        if (ev.drag < 5) return false;               // a click: handled below
        const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
        const ids = [];
        for (const u of sim.alive(game.side)) {
          if (u.aboard) continue;
          if (!cam.project(game.unitPose(u).pos, q)) continue;
          if (q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1) ids.push(u.id);
        }
        if (ids.length || !b.add) game.select(ids, { add: b.add });
        return true;
      }
      if (ev.type === 'click' && ev.button === 0) {
        const u = pickUnit(ev.x, ev.y);
        if (!u) { if (!ev.shift) game.clearSelection(); return true; }
        if (u.side !== game.side) { game.select([u.id]); return true; }
        if (ev.shift) game.select([u.id], { toggle: true }); else game.select([u.id]);
        return true;
      }
      if (ev.type === 'dblclick' && ev.button === 0) {
        const u = pickUnit(ev.x, ev.y);
        if (!u || u.side !== game.side) return false;
        const ids = sim.alive(game.side).filter(v => v.type === u.type && !v.aboard && onScreen(v)).map(v => v.id);
        game.select(ids, { add: ev.shift });
        return true;
      }
      return false;
    },
    update() {
      // drop the dead from the selection and the groups
      let ch = false;
      for (const id of game.selection) { const u = sim.units.get(id); if (!u || !u.alive || (u.side !== game.side && game.vis(u) !== 'track')) { game.selection.delete(id); ch = true; } }
      if (ch) game.bus.emit('select', game.selection);
      if (followId && !sim.units.has(followId)) follow(null);
      if (box && box.x0 !== undefined) box.live = Math.abs(box.x1 - box.x0) + Math.abs(box.y1 - box.y0) > 5;
    },
    draw2d(ov) {
      const ctx = ov.ctx;
      // hover
      if (game.hover && !game.selection.has(game.hover)) {
        const u = sim.units.get(game.hover);
        if (u && (u.alive || u.dying < 1)) mark(ov, u, false, .55);
      }
      let n = 0;
      placed.length = 0;
      const many = game.selection.size > 12;
      for (const id of game.selection) {
        const u = sim.units.get(id);
        if (!u) continue;
        mark(ov, u, true, 1, n++ < 24, many);
      }
      // the drag box: dotted lime
      if (box && box.live) {
        const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1), y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1);
        ov.box([x0, y0, x1, y1], LIME, .9, [2, 3]);
        ctx.globalAlpha = .9; ctx.strokeStyle = LIME; ctx.lineWidth = 1.5; ctx.beginPath();
        const k = Math.min(10, (x1 - x0) / 3, (y1 - y0) / 3);
        for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { ctx.moveTo(px + sx * k, py + .5); ctx.lineTo(px + .5, py + .5); ctx.lineTo(px + .5, py + sy * k); }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
    },
  };

  /* a tag goes up only where it does not cover another (a crowded selection keeps its marks) */
  function tagFree(ov, x, y, tg, kind, lead) {
    const s = 10.5, w = (tg.id.length + tg.label.length + String(tg.value).length) * s * .66 + 50, h = 20;
    for (const b of placed) if (x < b[2] && x + w > b[0] && y < b[3] && y + h > b[1]) return false;
    if (lead) ov.leader(lead[0], lead[1], lead[2], lead[3], 'rgba(255,255,255,.7)', .8);
    const b = ov.tag(x, y, tg.id, tg.label, tg.value, { kind, size: s });
    if (b) placed.push(b);
    return true;
  }
  /* bracket + tag on one unit (or a mark, a leader and the tag when it is small on screen) */
  function mark(ov, u, sel, a, full, many) {
    const p = game.unitPose(u), own = u.side === game.side;
    if (!cam.project(p.pos, q)) return;
    if (q[0] < -60 || q[1] < -60 || q[0] > cam.W + 60 || q[1] > cam.H + 60) return;
    const col = own ? LIME : CORAL, kind = own ? 'lime' : 'coral';
    const d = game.drawn.get(u.id);
    const e = R.models.has(u.def.model) ? R.models.get(u.def.model) : null;
    const rpx = e ? cam.fl * e.radius / q[2] : 0;
    const tg = unitTag(game, u);
    if (!sel) {
      // hover: thin white corners, the name only
      if (d && rpx > 16) { const b = R.screenBox(d); if (b) ov.bracket(b, 'rgba(255,255,255,.8)', a, 5, 9); }
      else ov.mark(q[0], q[1], 9, 'rgba(255,255,255,.85)', a);
      ov.text(q[0] + 10, q[1] - 12, tg.label, { size: 10.5, col: '#fff', a: .75 });
      return;
    }
    if (full !== false && d && rpx > 16) {
      const b = R.screenBox(d);
      if (b) {
        ov.bracket(b, col, a, 5, 12);
        tagFree(ov, b[0] - 5, b[1] - 5 - 21, tg, kind, null);
        return;
      }
    }
    ov.mark(q[0], q[1], 8, col, a);
    if (full === false || (many && placed.length >= 12)) return;
    tagFree(ov, q[0] + 16, q[1] - 16 - 19, tg, kind, [q[0] + 4, q[1] - 4, q[0] + 16, q[1] - 16]);
  }
}

export { SHORT };
