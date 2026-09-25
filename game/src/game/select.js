/* Selection: click, Shift-click add / remove, drag a box, double-click (every unit of that type on screen),
   Ctrl 1-9 set a group, 1-9 recall (twice quickly: fly to it), Tab / Shift-Tab cycle own units, F follow.
   Draws lime brackets that fit the object (R.screenBox) with a short tag, hover highlight, the drag box. Tags stay on
   screen and out of the HUD panels (ov.fitBox), with a leader back to the object when they had to move.
   Aircraft parked on a deck are picked by a click on them (close enough to tell them apart) or a double-click (that
   deck's aircraft of the type), and from the selection panel's Air row; box select and Tab leave them on the deck.
   Enemy tracks can be selected alone (for their readout); they are never ordered.
   The Orbital render style (R.style 'orbital'): the same marks through the Orbital overlay (ui/sensors/orb.js): hairline
   corners and catalog labels; your own selection in the one yellow while it has it (game.orbital.yellow ===
   'selection': the orbital system paints its models yellow too), a selected track white with its coral square; while
   the strategic layer has the screen (game.orbital.k > .5) the marks give way to its glyphs. */
import { PRI } from './game.js';
import { unitTag, SHORT } from './labels.js';
import { ammoFull } from '../sim/mech.js';
import { orbOn, orbOverlay, OHI } from '../ui/sensors/orb.js';

const LIME = '#C6F432', CORAL = '#FF6A3D';
const TS = 10.5;                 // tag size (px at 1080p)

export function createSelect(game) {
  const { sim, R } = game, cam = R.camera;
  let box = null;              // { x0, y0, x1, y1, add }
  let lastRecall = { n: 0, t: 0 };
  let followId = 0;
  const q = [0, 0, 0], placed = [];

  /* where a unit is drawn: aircraft on a deck sit at their parking spot, not at the carrier's centre */
  function posOf(u) {
    if (u.aboard) { const d = game.drawn.get(u.id); if (d) return d.T; }
    return game.unitPose(u).pos;
  }
  game.unitScreenPos = posOf;
  /* an own aircraft parked under (x, y), when the deck is close enough to tell them apart */
  function pickParked(x, y) {
    let best = null, bd = 1e18;
    for (const u of sim.alive(game.side)) {
      if (!u.aboard) continue;
      const d = game.drawn.get(u.id); if (!d) continue;
      if (!cam.project(d.T, q)) continue;
      const e = R.models.has(d.key) ? R.models.get(d.key) : null;
      const rpx = e ? cam.fl * e.radius / q[2] : 0;
      if (rpx < 4) continue;
      const dd = (q[0] - x) ** 2 + (q[1] - y) ** 2, r = Math.max(7, rpx * .9);
      if (dd < r * r && dd < bd) { bd = dd; best = u; }
    }
    return best;
  }
  /* the unit under a screen point: drawn instances first, then own units' specks and tracks by their screen point */
  function pickUnit(x, y) {
    const d = R.pick(x, y);
    if (d && d.id !== undefined && sim.units.has(d.id)) {
      const u = sim.units.get(d.id);
      // a jet parked on the deck wins over the carrier under it
      if (u.def.air && u.side === game.side) { const p = pickParked(x, y); if (p) return p; }
      return u;
    }
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

  /* an unclassified contact's cloud under a screen point: the cloud is drawn round the ESTIMATE (never the truth), so
     it is picked there, within its dense core (about 1 sigma + the hull; 14 to 120 px, so a big cloud does not swallow
     every move order near it) -> { u, c, at } | null */
  const cq = [0, 0, 0];
  function pickContact(x, y) {
    const sens = game.getSystem('sensors'), clouds = sens && sens.contacts ? sens.contacts.vis : null;
    let best = null, bs = 1;
    for (const u of sim.list()) {
      if (u.side === game.side || u.aboard || !u.alive || game.vis(u) !== 'contact') continue;
      const c = sim.contact(game.side, u.id); if (!c || !c.pos) continue;
      const cv = clouds ? clouds.get(u.id) : null;
      const P = cv && cv.state !== 'lost' ? cv.ctr : c.pos;
      if (!cam.project(P, cq) || cq[0] < -40 || cq[1] < -40 || cq[0] > cam.W + 40 || cq[1] > cam.H + 40) continue;
      const L = Math.max(u.def.size[0], 1), sig = cv && cv.sig ? cv.sig : Math.min(Math.max(Math.min(c.err || 0, 5000) * 1.15 * (1.12 - c.conf), L * .06), 3500);
      const rpx = Math.min(120, Math.max(14 * (game.overlay ? game.overlay.ui || 1 : 1), (sig * 1.2 + L * .5) * cam.fl / Math.max(1, cq[2])));
      const s = Math.hypot(cq[0] - x, cq[1] - y) / rpx;
      if (s < bs) { bs = s; best = { u, c, at: [P[0], P[1], P[2]] }; }
    }
    return best;
  }
  game.pickContact = pickContact;

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

  const selection = {
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
        if (i < 0 && e.shiftKey) i = 0;                  // none current: Shift+Tab lands on the last
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
        // on a deck: that deck's aircraft of the type; else every one of the type on screen (not the parked ones)
        const ids = u.aboard ? sim.alive(game.side).filter(v => v.type === u.type && v.aboard === u.aboard).map(v => v.id)
          : sim.alive(game.side).filter(v => v.type === u.type && !v.aboard && onScreen(v)).map(v => v.id);
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
    draw2d(ov0) {
      // the Orbital style: the Orbital overlay, the yellow for your own selection while it has it
      const orb = orbOn(R), O = game.orbital, ov = orb ? orbOverlay(ov0) : ov0, ctx = ov.ctx;
      hiSel = orb && !!O && O.yellow === 'selection';
      const muted = orb && !!O && O.k > .5;
      // hover
      if (!muted && game.hover && !game.selection.has(game.hover)) {
        const u = sim.units.get(game.hover);
        if (u && (u.alive || u.dying < 1)) mark(ov, u, false, .55);
      }
      let n = 0;
      placed.length = 0;
      const many = game.selection.size > 12;
      if (!muted) for (const id of game.selection) {
        const u = sim.units.get(id);
        if (!u) continue;
        mark(ov, u, true, 1, n++ < 24, many);
      }
      // the drag box: dotted lime (the Orbital style: a white hairline box and corners)
      if (box && box.live) {
        const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1), y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1);
        ov.box([x0, y0, x1, y1], LIME, orb ? .5 : .9, [2, 3]);
        ctx.globalAlpha = .9; ctx.strokeStyle = orb ? '#F6F5F2' : LIME; ctx.lineWidth = orb ? 1.2 : 1.5; ctx.beginPath();
        const k = Math.min(10, (x1 - x0) / 3, (y1 - y0) / 3);
        for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { ctx.moveTo(px + sx * k, py + .5); ctx.lineTo(px + .5, py + .5); ctx.lineTo(px + .5, py + sy * k); }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
    },
  };

  /* ---------- answers the orders system does not give (just above it, so it sees the input first) ----------
     - a right-click on an unclassified contact's cloud is an attack the sensors cannot aim yet: it says so (the
       same words as a click on an unaimable track) and which scanner reaches the cloud, instead of a move order to
       the sea under it;
     - R with nothing that can happen (all full, the transloaders empty or none): a short line, not silence. */
  const notes = [];            // { lines: [[text, col]], sx, sy, t0, dur }
  let hiSel = false;           // the Orbital style: your selection has the yellow this frame
  const say = (lines, sx, sy) => { notes.length = 0; notes.push({ lines, sx, sy, t0: game.realT, dur: 1.9 }); };
  const bad = () => { const a = game.getSystem('audio'); if (a && a.ui) try { a.ui('invalid'); } catch (e) { /* */ } };
  const pad2 = n => String(n).padStart(2, '0');
  const kmTxt = m => (m < 10000 ? (m / 1000).toFixed(1) : String(Math.round(m / 1000)));
  const domOf = u => u.def.domain === 'air' ? 'air' : u.def.domain === 'sea' ? 'sea' : 'land';
  function contactClick(hit, sx, sy) {
    const us = game.selected().filter(u => !u.aboard || u.def.domain === 'air');
    const dom = hit.c.dom === 'sub' ? 'sub' : domOf(hit.u);
    const armed = us.some(u => Object.values(u.def.weapons || {}).some(w => !w.gun && w.vs && w.vs.includes(dom) && !(w.auto && !w.salvo)))
      || us.some(u => u.type === 'carrier');
    const orders = game.getSystem('orders');
    if (orders && orders.marks) orders.marks.push({ kind: 'no', at: hit.at, t0: game.realT, dur: 1.2 });
    bad();
    if (!armed) { say([['NO WEAPON FOR ' + dom.toUpperCase(), CORAL]], sx, sy); return; }
    // who can scan it: the selection's scanners first, then any on the side; the one that reaches it, else the nearest
    const pool = u => u.alive && u.def.scan && !u.off.scan && !u.aboard;
    let sc = null, near = null;
    for (const list of [us.filter(pool), sim.alive(game.side).filter(pool)]) {
      for (const u of list) {
        const d = Math.hypot(u.pos[0] - hit.at[0], u.pos[2] - hit.at[2]), k = d / u.def.scan.reach;
        if (k <= 1 && (!sc || k < sc.k)) sc = { u, d, k };
        if (!near || k < near.k) near = { u, d, k };
      }
      if (sc) break;
    }
    const line2 = sc ? [`${sc.u.def.cls} ${pad2(sc.u.id)} IN REACH · ${kmTxt(sc.d)} / ${kmTxt(sc.u.def.scan.reach)} KM`, LIME]
      : near ? [`OUT OF REACH · ${kmTxt(near.d)} / ${kmTxt(near.u.def.scan.reach)} KM`, CORAL] : ['NO SCANNER', CORAL];
    say([['NOT TRACKED · SCAN IT (X)', CORAL], line2], sx, sy);
  }
  /* R: what the reload order will find (the sim's reload rule), said only when it comes to nothing or to less */
  function reloadNote() {
    const us = game.selected().filter(u => !u.aboard);
    if (!us.length) return;
    const r = us.filter(u => u.type === 'tel' || u.type === 'bal' || u.type === 'transloader' || u.def.domain === 'sea' || u.type === 'pantsir');
    if (!r.length) { game.bus.emit('toast', { text: 'NOTHING TO RELOAD', bad: true }); return; }
    const full = u => u.type === 'transloader' ? u.cargo >= u.def.cargo
      : ammoFull(u) && (!u.mag || Object.keys(u.mag).every(k => u.mag[k] >= u.def.magazine[k]));
    const need = r.filter(u => !full(u));
    if (!need.length) { game.bus.emit('toast', { text: 'FULL · NOTHING TO RELOAD', bad: true }); return; }
    const tels = need.filter(u => u.type === 'tel' && !u.reloader);
    if (!tels.length) return;
    const loaders = sim.alive(game.side).filter(v => v.type === 'transloader' && !v.off.reload);
    if (loaders.some(v => v.cargo > 0 && !v.busy)) return;            // a transloader comes to the TEL
    const text = !loaders.length ? 'NO TRANSLOADER · TEL TO DEPOT' : loaders.every(v => v.cargo <= 0) ? 'TLV EMPTY · REFILL AT DEPOT' : 'TLV BUSY · TEL TO DEPOT';
    game.bus.emit('toast', { text, bad: true });
  }
  const orderNotes = {
    name: 'order-notes', priority: PRI.orders + 5,
    onKey(e) {
      if (e.type === 'keydown' && e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) reloadNote();
      return false;          // the orders system still gives the order
    },
    onPointer(ev) {
      if (ev.type !== 'click' || ev.button !== 2 || !game.selected().length) return false;
      if (pickUnit(ev.x, ev.y)) return false;                            // a unit or a track: the orders system's
      const hit = pickContact(ev.x, ev.y);
      if (!hit) return false;
      contactClick(hit, ev.x, ev.y);
      return true;
    },
    update() { for (let i = notes.length - 1; i >= 0; i--) if (game.realT - notes[i].t0 > notes[i].dur) notes.splice(i, 1); },
    draw2d(ov0) {
      // below and right of the click (the cloud's own tag and class bars sit above it), each line on its dark strip
      // (the Orbital style: catalog lines, a coral square where it says no, a white one where it says yes)
      const orb = orbOn(R), ov = orb ? orbOverlay(ov0) : ov0;
      const k = ov.ui || 1;
      for (const n of notes) {
        const a = Math.max(0, Math.min(1, (n.dur - (game.realT - n.t0)) / .5));
        let y = n.sy + 16 * k;
        for (const [text, col] of n.lines) {
          const b = orb ? ov.tag(n.sx + 14 * k, y, text, '', '', { kind: col === LIME ? 'lime' : 'coral', a, size: 10.5, fit: true })
            : ov.tag(n.sx + 14 * k, y, '', '', text, { kind: 'coral', valCol: col, a, size: 10.5, fit: true });
          y = (b ? b[3] : y + 20 * k) + 2 * k;
        }
      }
    },
  };
  return [selection, orderNotes];

  /* a tag goes up only where it does not cover another (a crowded selection keeps its marks). It stays on screen and
     out of the HUD panels; when it had to move away from its place, a leader runs back to the object (anchor). */
  /* at = { x, y, ax, ay (the object's point the tag belongs to), lead: short leader [x0, y0, x1, y1] }; alt = the same
     below the object, used when there is no room above */
  function tagFree(ov, tg, kind, at, alt) {
    const sz = ov.tagSize(tg.id, tg.label, tg.value, { size: TS }), w = sz[0], h = sz[1];
    let p = at;
    if (alt && (at.y < ov.margin || hits(ov.avoid, at.x, at.y, w, h))) p = alt;
    const f = ov.fitBox(p.x, p.y, w, h);
    for (const b of placed) if (f[0] < b[2] && f[0] + w > b[0] && f[1] < b[3] && f[1] + h > b[1]) return false;
    const moved = Math.abs(f[0] - p.x) > 1 || Math.abs(f[1] - p.y) > 1;
    // the short leader of a small mark when the tag sits where it belongs, else a leader from the object to the tag
    if (p.lead && !moved) ov.leader(p.lead[0], p.lead[1], p.lead[2], p.lead[3], 'rgba(255,255,255,.7)', .8);
    const b = ov.tag(f[0], f[1], tg.id, tg.label, tg.value, { kind, size: TS, anchor: moved ? [p.ax, p.ay] : null, leadMin: 8 });
    if (b) placed.push(b);
    return true;
  }
  function hits(av, x, y, w, h) { if (av) for (const r of av) if (x < r[2] && x + w > r[0] && y < r[3] && y + h > r[1]) return true; return false; }
  /* bracket + tag on one unit (or a mark, a leader and the tag when it is small on screen) */
  function mark(ov, u, sel, a, full, many) {
    const P = posOf(u), own = u.side === game.side;
    if (!cam.project(P, q)) return;
    if (q[0] < -60 || q[1] < -60 || q[0] > cam.W + 60 || q[1] > cam.H + 60) return;
    const hi = own && hiSel, col = hi ? OHI : own ? LIME : CORAL, kind = hi ? 'hi' : own ? 'lime' : 'coral';
    const d = game.drawn.get(u.id);
    const e = R.models.has(u.def.model) ? R.models.get(u.def.model) : null;
    const rpx = e ? cam.fl * e.radius / q[2] : 0;
    const tg = unitTag(game, u), k = ov.ui || 1;
    // a unit just off the edge keeps its mark on the edge
    const sx = Math.max(5, Math.min(cam.W - 5, q[0])), sy = Math.max(5, Math.min(cam.H - 5, q[1]));
    if (!sel) {
      // hover: thin white corners, the name only
      if (d && rpx > 16) { const b = ov.clampBox(R.screenBox(d), 6); if (b) ov.bracket(b, 'rgba(255,255,255,.8)', a, 5, 9); }
      else ov.mark(sx, sy, 9, 'rgba(255,255,255,.85)', a);
      ov.text(Math.max(8 * k, Math.min(sx + 10 * k, cam.W - 12 * k - tg.label.length * 7.2 * k)), Math.max(18 * k, sy - 12 * k), tg.label, { size: 10.5, col: '#fff', a: .75 });
      return;
    }
    if (full !== false && d && rpx > 16) {
      const b = ov.clampBox(R.screenBox(d), 6);
      if (b) {
        ov.bracket(b, col, a, 5, 12);
        // above the top-left corner; below the bracket when the top is off screen or under a panel
        tagFree(ov, tg, kind, { x: b[0] - 5 * k, y: b[1] - 26 * k, ax: b[0] - 5 * k, ay: b[1] - 5 * k }, { x: b[0] - 5 * k, y: b[3] + 9 * k, ax: b[0] - 5 * k, ay: b[3] + 5 * k });
        return;
      }
    }
    ov.mark(sx, sy, 8, col, a);
    if (full === false || (many && placed.length >= 12)) return;
    tagFree(ov, tg, kind, { x: sx + 16 * k, y: sy - 35 * k, ax: sx + 4 * k, ay: sy - 4 * k, lead: [sx + 4 * k, sy - 4 * k, sx + 16 * k, sy - 16 * k] },
      { x: sx + 16 * k, y: sy + 16 * k, ax: sx + 4 * k, ay: sy + 4 * k, lead: [sx + 4 * k, sy + 4 * k, sx + 16 * k, sy + 16 * k] });
  }
}

export { SHORT };
