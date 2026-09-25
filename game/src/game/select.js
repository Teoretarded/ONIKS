/* Selection: click, Shift-click add / remove, drag a box (own units whose centre or drawn box is in it; with no unit
   in it, the rounds in flight in it; drags under 8 px are clicks), double-click spectates (the camera flies in to a
   close orbit and follows the unit or round; left- or right-drag orbits, wheel zooms, Esc or a click on empty ground
   leaves; the unit stays selected for orders), Ctrl double-click (every unit of that type on screen),
   Ctrl 1-9 set a group, 1-9 recall (twice quickly: fly to it), Tab / Shift-Tab cycle own units, F follow.
   Rounds: a click on one (or a box round some) selects rounds (game.selProj, projectile ids; never mixed with units).
   With rounds selected C hands them to the cinematic camera and B runs bullet time (x0.1) on them, the camera on
   them; again: the next round of the group (one round: off). Esc leaves the spectate / bullet time / round selection.
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
import { orbOn, orbOverlay, OHI } from '../ui/sensors/orb.js';
import { PNAME } from '../ui/hud/fmt.js';

const LIME = '#C6F432', CORAL = '#FF6A3D';
const TS = 10.5;                 // tag size (px at 1080p)
const BOX_MIN = 8;               // px: a shorter drag is a click
const BT_RATE = .1;              // bullet time on selected rounds
const BT_HOLD = 4, BT_POST = .5;  // s (real) the break-up is held after the last round is down, easing to x0.5
const DEG = Math.PI / 180;

export function createSelect(game) {
  const { sim, R } = game, cam = R.camera;
  let box = null;              // { x0, y0, x1, y1, add }
  let lastRecall = { n: 0, t: 0 };
  let followId = 0;
  let spec = null;             // spectating: { kind: 'unit' | 'proj', id, fn, name }
  let orbitDrag = null;        // a left-drag orbiting the spectated subject: { x, y }
  let bt = null;               // bullet time on selected rounds: { rate0, ids, end }
  const selProj = game.selProj = new Set();
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
  function pickUnit(x, y, noTag) {
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
    // a click on a track's tag (it may sit well away from the track, e.g. pinned under the top band) picks the track
    if (!best && !noTag) {
      const sens = game.getSystem && game.getSystem('sensors'), a = sens && sens.tagAt ? sens.tagAt(x, y) : null;
      if (a) return pickUnit(a[0], a[1], true);
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

  /* ---------- rounds in flight ---------- */
  const projSeen = p => p && p.alive && sim.projVisible(game.side, p);
  const projName = p => PNAME[p.kind] || (game.PROJ[p.kind] && game.PROJ[p.kind].name) || p.kind.toUpperCase();
  function projUnder(x, y, r) {
    let best = null, bd = (r || 18) ** 2;
    for (const p of sim.projectiles.values()) {
      if (!projSeen(p) || !cam.project(game.projPose(p).pos, q)) continue;
      const d = (q[0] - x) ** 2 + (q[1] - y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  game.pickProj = projUnder;
  function selectProj(ids, add) {
    if (!add) selProj.clear();
    for (const id of ids) selProj.add(id);
    if (selProj.size && game.selection.size) game.clearSelection();
    game.bus.emit('selectProj', selProj);
  }
  function clearProj() { if (!selProj.size) return; selProj.clear(); game.bus.emit('selectProj', selProj); }
  game.selectProj = selectProj;
  // a unit selection drops the rounds (and the other way round, above)
  game.bus.on('select', () => { if (game.selection.size && selProj.size) clearProj(); });

  /* ---------- spectate: fly in to a close orbit, then follow ---------- */
  function spectate(kind, id) {
    let L, name;
    const fn = kind === 'unit'
      ? () => { const v = sim.units.get(id); return v && (v.alive || v.dying < 1) ? posOf(v) : null; }
      : () => { const p = sim.projectiles.get(id); return p && p.alive ? game.projPose(p).pos : null; };
    if (kind === 'unit') { const u = sim.units.get(id); if (!u) return false; L = Math.max(u.def.size[0], 8); name = unitTag(game, u).label; }
    else { const p = sim.projectiles.get(id); if (!p) return false; L = 10; name = projName(p); }
    if (!fn()) return false;
    const d = game.getSystem('director'); if (d && d.on) d.set(false);
    follow(null);
    cam.spectate(fn, { dist: Math.min(2500, Math.max(kind === 'proj' ? 70 : 60, L * 3.2 + 30)), pitch: (kind === 'proj' ? 8 : 16) * DEG });
    spec = { kind, id, fn, name };
    return true;
  }
  function unspectate() { if (!spec) return; if (cam.followFn === spec.fn) cam.follow(null); if (cam.fly && cam.fly.track === spec.fn) cam.fly = null; spec = null; }
  game.spectate = spectate;
  Object.defineProperty(game, 'spectating', { get: () => spec, configurable: true });

  /* what a click at (x, y) selects: a unit, else a round, else nothing (while spectating: leaves the spectate first) */
  function clickAt(x, y, shift) {
    const u = pickUnit(x, y);
    if (!u) {
      const p = projUnder(x, y);
      if (p) { selectProj([p.id], shift); return; }
      if (spec) { unspectate(); return; }
      if (!shift) { game.clearSelection(); clearProj(); }
      return;
    }
    if (u.side !== game.side) { game.select([u.id]); return; }
    if (shift) game.select([u.id], { toggle: true }); else game.select([u.id]);
  }
  /* own units in a screen box: the centre inside, or (drawn large enough to have one) a third of the drawn box in it */
  function inBox(x0, y0, x1, y1) {
    const ids = [];
    for (const u of sim.alive(game.side)) {
      if (u.aboard) continue;
      const P = game.unitPose(u).pos;
      if (!cam.project(P, q)) continue;
      let hit = q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1;
      if (!hit) {
        const d = game.drawn.get(u.id);
        const e = d && R.models.has(d.key) ? R.models.get(d.key) : null;
        if (e && cam.fl * e.radius / q[2] > 16) {
          const b = R.screenBox(d);
          if (b) { const ix = Math.min(b[2], x1) - Math.max(b[0], x0), iy = Math.min(b[3], y1) - Math.max(b[1], y0); hit = ix > 0 && iy > 0 && ix * iy >= (b[2] - b[0]) * (b[3] - b[1]) / 3; }
        }
      }
      if (hit) ids.push(u.id);
    }
    return ids;
  }
  function projInBox(x0, y0, x1, y1) {
    const ids = [];
    for (const p of sim.projectiles.values()) {
      if (!projSeen(p) || !cam.project(game.projPose(p).pos, q)) continue;
      if (q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1) ids.push(p.id);
    }
    return ids;
  }

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
        // a lost release (another system took it): the box goes
        if ((box || orbitDrag) && game.mouse.down !== 0) { box = null; orbitDrag = null; }
        if (orbitDrag) {
          const dx = ev.x - orbitDrag.x, dy = ev.y - orbitDrag.y; orbitDrag.x = ev.x; orbitDrag.y = ev.y;
          if (ev.drag >= 4) { cam.goal.yaw += dx * .0055 * (cam.invert ? -1 : 1); cam.goal.pitch = Math.max(cam.pitchMin(cam.goal.dist), Math.min(cam.maxPitch, cam.goal.pitch + dy * .0045)); }
          return true;
        }
        if (box) { box.x1 = ev.x; box.y1 = ev.y; box.live = ev.drag >= BOX_MIN; return true; }
        if (game.mouse.down < 0) { const u = pickUnit(ev.x, ev.y); game.hover = u ? u.id : null; }
        return false;
      }
      if (ev.type === 'down' && ev.button === 0) {
        // spectating: a left-drag orbits the subject (a click still selects)
        if (spec) { orbitDrag = { x: ev.x, y: ev.y }; box = null; return false; }
        box = { x0: ev.x, y0: ev.y, x1: ev.x, y1: ev.y, add: ev.shift, live: false }; orbitDrag = null; return false;
      }
      if (ev.type === 'up' && ev.button === 0 && orbitDrag) { orbitDrag = null; return ev.drag >= 5; }
      if (ev.type === 'up' && ev.button === 0 && box) {
        const b = box; box = null;
        if (ev.drag < 5) return false;               // a click: handled below
        if (ev.drag < BOX_MIN) { clickAt(ev.x, ev.y, ev.shift); return true; }   // a shaky click
        const x0 = Math.min(b.x0, ev.x), x1 = Math.max(b.x0, ev.x), y0 = Math.min(b.y0, ev.y), y1 = Math.max(b.y0, ev.y);
        const ids = inBox(x0, y0, x1, y1);
        if (ids.length) { game.select(ids, { add: b.add && !selProj.size }); return true; }
        // no unit: the rounds in flight in the box
        const ps = projInBox(x0, y0, x1, y1);
        if (ps.length) { selectProj(ps, b.add); return true; }
        if (!b.add) { game.clearSelection(); clearProj(); }
        return true;
      }
      if (ev.type === 'click' && ev.button === 0) { clickAt(ev.x, ev.y, ev.shift); return true; }
      if (ev.type === 'dblclick' && ev.button === 0) {
        const u = pickUnit(ev.x, ev.y);
        if (ev.ctrl) {
          // Ctrl double-click: on a deck, that deck's aircraft of the type; else every one of the type on screen
          if (!u || u.side !== game.side) return false;
          const ids = u.aboard ? sim.alive(game.side).filter(v => v.type === u.type && v.aboard === u.aboard).map(v => v.id)
            : sim.alive(game.side).filter(v => v.type === u.type && !v.aboard && onScreen(v)).map(v => v.id);
          game.select(ids, { add: ev.shift });
          return true;
        }
        if (u && (u.side === game.side || game.vis(u) === 'track')) {
          if (!game.selection.has(u.id)) game.select([u.id], { add: ev.shift && u.side === game.side });
          spectate('unit', u.id);
          return true;
        }
        const p = projUnder(ev.x, ev.y, 22);
        if (p) { if (!selProj.has(p.id)) selectProj([p.id], ev.shift); spectate('proj', p.id); return true; }
        return false;
      }
      return false;
    },
    update() {
      // drop the dead from the selection and the groups
      let ch = false;
      for (const id of game.selection) { const u = sim.units.get(id); if (!u || !u.alive || (u.side !== game.side && game.vis(u) !== 'track')) { game.selection.delete(id); ch = true; } }
      if (ch) game.bus.emit('select', game.selection);
      if (followId && !sim.units.has(followId)) follow(null);
      // rounds that are down leave the selection
      let chP = false;
      for (const id of selProj) if (!projSeen(sim.projectiles.get(id))) { selProj.delete(id); chP = true; }
      if (chP) game.bus.emit('selectProj', selProj);
      // the spectate ends when the camera is taken (pan, a fly elsewhere, Inspect, the cinematic) or the subject is gone
      if (spec && cam.followFn !== spec.fn && !(cam.fly && cam.fly.track === spec.fn)) spec = null;
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
      // own units too small to make out at this range (true size: a TEL is ~1 px at 6 km, lost in the ground's dots): the
      // films' small contact square on each, so the force stays findable between close range and the Orbital glyphs
      if (!muted) {
        const col = orb ? 'rgba(246,245,242,.9)' : LIME, sq = 7;
        for (const u of sim.alive(game.side)) {
          if (u.aboard || game.selection.has(u.id) || game.hover === u.id) continue;
          if (!cam.project(posOf(u), q) || q[0] < 0 || q[1] < 0 || q[0] > cam.W || q[1] > cam.H) continue;
          if (cam.fl * Math.max(u.def.size[0], u.def.size[1]) * .5 / q[2] >= 4) continue;
          ov.mark(q[0], q[1], sq, col, .75);
        }
      }
      let n = 0;
      placed.length = 0;
      const many = game.selection.size > 12;
      if (!muted) for (const id of game.selection) {
        const u = sim.units.get(id);
        if (!u) continue;
        mark(ov, u, true, 1, n++ < 24, many);
      }
      // selected rounds: a mark and the round's name (the first few; C or B on the one the camera is on)
      if (!muted && selProj.size) {
        let np = 0;
        const k = ov.ui || 1, w = watchedId();
        for (const id of selProj) {
          const p = sim.projectiles.get(id); if (!p || !cam.project(game.projPose(p).pos, q)) continue;
          if (q[0] < -40 || q[1] < -40 || q[0] > cam.W + 40 || q[1] > cam.H + 40) continue;
          const own = p.side === game.side, col = own ? (hiSel ? OHI : LIME) : CORAL;
          const sx = Math.max(5, Math.min(cam.W - 5, q[0])), sy = Math.max(5, Math.min(cam.H - 5, q[1]));
          ov.mark(sx, sy, 8, col, 1);
          if (np++ < 8) tagFree(ov, { id: w === id ? (bt ? 'B' : 'C') : '', label: projName(p), value: '' }, own ? (hiSel ? 'hi' : 'lime') : 'coral',
            { x: sx + 14 * k, y: sy - 30 * k, ax: sx + 4 * k, ay: sy - 4 * k, lead: [sx + 4 * k, sy - 4 * k, sx + 14 * k, sy - 14 * k] }, null);
        }
      }
      // spectating: one line at the top centre
      if (spec) {
        const k = ov.ui || 1;
        ov.tag(cam.W / 2, 34 * k, 'SPECTATE', spec.name, 'DRAG ORBIT · WHEEL ZOOM · ESC', { kind: orb ? 'white' : 'lime', size: 10.5, align: 'center', fit: false });   // in the top safe band (world tags are kept off it)
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
  const orderNotes = {
    name: 'order-notes', priority: PRI.orders + 5,
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

  /* ---------- the selected rounds: C cinematic on them, B bullet time on them; Esc steps back ---------- */
  const director = () => game.getSystem('director');
  function watchedId() { const d = director(); const w = d && d.on && d.watching; return w ? w.id : 0; }
  const liveProj = () => [...selProj].filter(id => projSeen(sim.projectiles.get(id)));
  const sameSet = (a, b) => a.length === b.length && a.every(id => b.includes(id));
  /* hand the rounds to the director: the first time the first one; again (same rounds): the next; one round: off */
  function watchRounds(ids, kind) {
    const d = director(); if (!d || !d.watch) return false;
    const w = d.on && d.watching;
    if (w && sameSet(w.ids, ids)) {
      if (ids.length < 2) return false;                     // the caller turns it off
      d.watch(w.ids, (w.i + 1) % w.ids.length);
    } else { unspectate(); d.watch(ids, 0); }
    const v = d.watching; if (!v) return false;
    const p = sim.projectiles.get(v.id);
    game.bus.emit('toast', { text: `${kind} · ${p ? projName(p) : 'ROUND'}${v.ids.length > 1 ? ` · ${v.i + 1} / ${v.ids.length}` : ''}` });
    return true;
  }
  function btStart(ids) {
    if (!bt) {
      const r0 = game.paused ? 1 : game.timeRate < 1 ? 1 : game.timeRate;
      bt = { rate0: r0, ids, end: 0 };
      if (game.bulletTime && game.bulletTime.active) game.bulletTime.take();
      game.paused = false; game.timeRate = BT_RATE;
      game.bus.emit('rate', { rate: BT_RATE, paused: false, why: 'bullet' });
      game.bus.emit('bullet', { on: true, rounds: ids });
    }
    bt.ids = ids;
  }
  function btStop(restore) {
    if (!bt) return;
    if (restore && (Math.abs(game.timeRate - BT_RATE) < 1e-6 || (bt.end > 0 && game.timeRate < 1))) { game.timeRate = bt.rate0; game.bus.emit('rate', { rate: game.timeRate, paused: game.paused, why: 'bullet' }); }
    bt = null;
    game.bus.emit('bullet', { on: false });
  }
  // the player's own rate ([ / ], Space) ends it where it is
  game.bus.on('rate', d => { if (bt && d && d.why === 'user') btStop(false); });
  const watch = {
    name: 'rounds', priority: PRI.hud + 5,
    onKey(e) {
      if (e.type !== 'keydown' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
      if (e.code === 'Escape') {
        if (spec) { unspectate(); return true; }
        if (bt) { btStop(true); const d = director(); if (d && d.on) d.set(false); return true; }
        if (selProj.size) { clearProj(); return true; }
        return false;
      }
      if (e.code !== 'KeyC' && e.code !== 'KeyB') return false;
      const ids = liveProj();
      if (!ids.length) {
        // C with nothing selected: the director's own (below); B: reinforcements (the HUD's)
        return false;
      }
      if (e.code === 'KeyC') {
        if (bt) btStop(true);
        if (!watchRounds(ids, 'CINEMATIC')) { const d = director(); if (d) d.set(false); game.bus.emit('toast', { text: 'CINEMATIC OFF' }); }
        return true;
      }
      // B
      if (bt && ids.length < 2) { btStop(true); const d = director(); if (d && d.on) d.set(false); game.bus.emit('toast', { text: 'BULLET TIME OFF' }); return true; }
      if (!watchRounds(ids, 'BULLET TIME')) return true;
      btStart(ids);
      return true;
    },
    update(dtReal) {
      if (!bt) return;
      if (game.replay && game.replay.active) return;
      // the rounds are down: the break-up plays out slowed (the rate eases from x0.1 to x0.5 over BT_HOLD s), then time
      // comes back
      const live = bt.ids.some(id => projSeen(sim.projectiles.get(id)));
      if (live) { bt.end = 0; if (Math.abs(game.timeRate - BT_RATE) > 1e-6 && !game.paused) btStop(false); return; }
      if (!game.paused) bt.end += dtReal;
      if (bt.end > BT_HOLD) { btStop(true); return; }
      if (!game.paused && bt.end > 0) game.timeRate = BT_RATE * Math.pow(BT_POST / BT_RATE, bt.end / BT_HOLD);
    },
  };
  return [selection, orderNotes, watch];

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
