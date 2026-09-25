/* Orders: right-click (ground / sea: move in formation; hostile track: attack; own TEL with a transloader selected:
   reload; own carrier with aircraft selected: return), Shift queues. Hotkeys (none of them the camera's):
   Z stop · H hold · T deploy / undeploy · R reload · X scan (click a point) · Y radar on / off · L launch drone
   (click a point) · B reinforcements. Feedback in the world: a dotted lime path and marker for moves, a coral
   dotted line for attacks, fading; the remaining route of selected units; weapon range of the selection.
   Targeting modes (scan, drone) run as a second system above the selection. */
import { PRI } from './game.js';
import { SHORT } from './labels.js';
import { buyable } from '../data/units.js';

const LIME = [198, 244, 50], CORAL = [255, 106, 61], WH = [238, 238, 228];
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;

export function createOrders(game) {
  const { sim, R } = game, cam = R.camera, T = R.terrain;
  const marks = [];            // feedback: { kind: 'move'|'attack'|'scan'|'no', pts, at, t0, dur, ids, target }
  let mode = null;             // targeting: { kind: 'scan'|'drone', units }
  let buyOpen = false, buyEl = null;
  const q = [0, 0, 0];

  const own = () => game.selected().filter(u => !u.aboard || u.def.domain === 'air');
  const canGo = (u, x, z) => {
    const h = game.map.h(x, z), dom = u.def.domain;
    if (dom === 'air') return true;
    if (dom === 'land') return h > .5 && game.map.slope(x, z) < (u.def.slopeMax || .4) + .15;
    return h < -(u.def.draught || 5) - 2;
  };
  const say = (text, x, y) => marks.push({ kind: 'say', text, sx: x, sy: y, t0: game.realT, dur: 1.4 });

  /* ---------- the orders ---------- */
  function moveTo(x, z, queue, sx, sy) {
    const us = own().filter(u => u.def.speed > 0 && !u.aboard || (u.aboard && u.def.domain === 'air'));
    if (!us.length) return false;
    const land = [], sea = [], airMove = [], airOrbit = [];
    for (const u of us) {
      if (!canGo(u, x, z)) continue;
      if (u.def.domain === 'land') land.push(u.id);
      else if (u.def.domain === 'sea') sea.push(u.id);
      else if (u.type === 'helo') airMove.push(u.id);
      else airOrbit.push(u.id);
    }
    const all = land.concat(sea, airMove, airOrbit);
    if (!all.length) { marks.push({ kind: 'no', at: [x, T.heightAt(x, z), z], t0: game.realT, dur: 1.2 }); say('NO ROUTE', sx, sy); return true; }
    if (land.length) game.order(land, { kind: 'move', x, z, queue });
    if (sea.length) game.order(sea, { kind: 'move', x, z, queue });
    if (airMove.length) game.order(airMove, { kind: 'move', x, z, queue });
    if (airOrbit.length) game.order(airOrbit, { kind: 'patrol', x, z, r: 1500, queue });
    marks.push({ kind: 'move', at: [x, Math.max(0, T.heightAt(x, z)), z], ids: all, t0: game.realT, dur: 2.6 });
    return true;
  }
  const domOf = u => u.def.domain === 'air' ? 'air' : u.def.domain === 'sea' ? 'sea' : 'land';
  function attack(t, queue, sx, sy) {
    const dom = domOf(t);
    const us = own().filter(u => Object.values(u.def.weapons).some(w => !w.gun && w.vs.includes(dom) && !(w.auto && !w.salvo)));
    if (!us.length) { say('NO WEAPON FOR ' + dom.toUpperCase(), sx, sy); return true; }
    // weapons need a classified track from the side's own sensors (fog off shows everything, it does not aim)
    const c = sim.contact(game.side, t.id);
    if (!c || c.conf < game.CLASSIFY) { say('NOT TRACKED · SCAN IT (X)', sx, sy); marks.push({ kind: 'no', at: game.unitPose(t).pos.slice(), t0: game.realT, dur: 1.2 }); return true; }
    game.order(us.map(u => u.id), { kind: 'attack', target: t.id, queue });
    marks.push({ kind: 'attack', target: t.id, ids: us.map(u => u.id), t0: game.realT, dur: 2.6 });
    return true;
  }
  function reloadOn(tel, queue) {
    const tl = own().filter(u => u.type === 'transloader');
    if (!tl.length) return false;
    game.order(tl.map(u => u.id), { kind: 'reload', target: tel.id, queue });
    marks.push({ kind: 'move', at: game.unitPose(tel).pos.slice(), ids: tl.map(u => u.id), t0: game.realT, dur: 2.2 });
    return true;
  }
  function hotkey(kind) {
    const us = own();
    if (!us.length && kind !== 'scan' && kind !== 'drone' && kind !== 'buy') return false;
    switch (kind) {
      case 'stop': game.order(us.map(u => u.id), { kind: 'stop' }); return true;
      case 'hold': { const on = !us.every(u => u.hold); game.order(us.map(u => u.id), { kind: 'hold', on }); game.bus.emit('toast', { text: on ? 'HOLD' : 'HOLD OFF' }); return true; }
      case 'deploy': {
        const dep = us.filter(u => u.type === 'tel' || u.type === 'radar');
        if (!dep.length) return true;
        for (const u of dep) {
          const up = u.type === 'tel' ? (u.dep > 0 || u.depT > 0 || u.elevT > 0) : (u.mast > 0 || u.mastT > 0);
          game.order([u.id], { kind: up ? 'undeploy' : 'deploy' });
        }
        return true;
      }
      case 'reload': { const r = us.filter(u => u.type === 'tel' || u.type === 'transloader' || u.def.domain === 'sea' || u.type === 'pantsir'); game.order(r.map(u => u.id), { kind: 'reload' }); return true; }
      case 'radar': {
        const rs = us.filter(u => u.def.sensors && u.def.sensors.radar);
        if (!rs.length) return true;
        const on = !rs.some(u => u.radarOn);
        game.order(rs.map(u => u.id), { kind: 'radar', on });
        // the Monolith-B needs its mast up to radiate
        if (on) for (const u of rs) if (u.type === 'radar' && u.mast < 1 && u.mastT < 1) game.order([u.id], { kind: 'deploy', queue: true });
        game.bus.emit('toast', { text: on ? 'RADAR ON' : 'EMCON' });
        return true;
      }
      case 'scan': {
        let sc = us.filter(u => u.def.scan && !u.off.scan);
        if (!sc.length) sc = sim.alive(game.side).filter(u => u.def.scan && !u.off.scan && !u.aboard);
        if (!sc.length) { say('NO SCANNER', game.mouse.x, game.mouse.y); return true; }
        setMode({ kind: 'scan', units: sc });
        return true;
      }
      case 'drone': {
        let cs = us.filter(u => u.type === 'catapult' && u.drones > 0);
        if (!cs.length) cs = sim.alive(game.side).filter(u => u.type === 'catapult' && u.drones > 0 && !u.off.launch);
        if (!cs.length) { say('NO DRONE', game.mouse.x, game.mouse.y); return true; }
        setMode({ kind: 'drone', units: cs });
        return true;
      }
    }
    return false;
  }
  function setMode(m) { mode = m; game.bus.emit('mode', m ? { mode: m.kind } : { mode: null }); }

  /* the best scanner for a point: in reach, off cooldown, nearest */
  function scanner(x, z, list) {
    let best = null, bd = 1e18;
    for (const u of list) {
      if (!u.alive || u.off.scan) continue;
      const d = Math.hypot(u.pos[0] - x, u.pos[2] - z), reach = u.def.scan.reach, cd = u.cooldowns.scan || 0;
      const score = d / reach + cd * .05 + (d > reach && u.def.speed === 0 ? 100 : 0);
      if (score < bd) { bd = score; best = u; }
    }
    return best;
  }

  /* ---------- reinforcements (B) ---------- */
  function buyList() { return buyable(game.side).map(t => ({ type: t, def: game.UNITS[t] })); }
  function toggleBuy(on) {
    buyOpen = on === undefined ? !buyOpen : on;
    if (!buyEl) {
      buyEl = document.createElement('div');
      buyEl.className = 'oniks-buy hit';
      buyEl.addEventListener('mousedown', e => { const r = e.target.closest('[data-t]'); if (r) { buy(r.dataset.t); e.stopPropagation(); } });
      game.uiRoot.appendChild(buyEl);
    }
    buyEl.style.display = buyOpen ? '' : 'none';
    if (buyOpen) renderBuy();
  }
  function renderBuy() {
    const S = sim.sides[game.side];
    const rows = buyList().map((b, i) => {
      const ok = S.supply >= b.def.cost;
      return `<div class="row${ok ? '' : ' off'}" data-t="${b.type}"><b>${i + 1}</b><span class="n">${SHORT[b.type] || b.def.name}</span><span class="v">${b.def.cost}</span><span class="d">${Math.round(b.def.buildTime)} S</span></div>`;
    }).join('');
    const qn = S.queue.length ? `<div class="q">EN ROUTE ${S.queue.map(x => SHORT[x.type] || x.type).join(' · ')}</div>` : '';
    buyEl.innerHTML = `<div class="hd"><span class="kick"><i></i>Reinforce</span><span class="sup">SUP <b>${Math.floor(S.supply)}</b></span></div>${rows}${qn}<div class="keys"><span><b>1-${buyList().length}</b>Buy</span><span><b>B</b>Close</span></div>`;
  }
  function buy(type) {
    const ok = sim.buy(game.side, type);
    game.bus.emit('toast', { text: ok ? `${SHORT[type] || type} · EN ROUTE` : 'NOT ENOUGH SUPPLY', bad: !ok });
    game.bus.emit('buy', { type, ok });
    renderBuy();
  }
  addStyle();

  /* ---------- the targeting system (above selection) ---------- */
  const targeting = {
    name: 'targeting', priority: PRI.targeting,
    onKey(e) {
      if (e.type !== 'keydown') return false;
      if (buyOpen) {
        if (e.code === 'Escape' || e.code === 'KeyB') { toggleBuy(false); return true; }
        const n = /^Digit[1-9]$/.test(e.code) ? +e.code.slice(5) : 0, L = buyList();
        if (n && L[n - 1]) { buy(L[n - 1].type); return true; }
      }
      if (mode && e.code === 'Escape') { setMode(null); return true; }
      return false;
    },
    onPointer(ev) {
      if (!mode) return false;
      if (ev.type === 'click' && ev.button === 2) { setMode(null); return true; }
      if (ev.type === 'click' && ev.button === 0) {
        const w = cam.pickGround(ev.x, ev.y);
        if (!w) return true;
        if (mode.kind === 'scan') {
          const u = scanner(w[0], w[2], mode.units);
          if (!u) { setMode(null); return true; }
          const side = sim.sides[game.side];
          if (side.scanCd > 0 || (u.cooldowns.scan || 0) > 0) { say(`SCAN · ${Math.ceil(Math.max(side.scanCd, u.cooldowns.scan || 0))} S`, ev.x, ev.y); return true; }
          game.order([u.id], { kind: 'scan', x: w[0], z: w[2] });
          marks.push({ kind: 'scan', at: w, ids: [u.id], t0: game.realT, dur: 2 });
        } else if (mode.kind === 'drone') {
          const cs = mode.units.filter(u => u.alive && u.drones > 0);
          const c = cs.sort((a, b) => Math.hypot(a.pos[0] - w[0], a.pos[2] - w[2]) - Math.hypot(b.pos[0] - w[0], b.pos[2] - w[2]))[0];
          if (c) { game.order([c.id], { kind: 'launch_drone', x: w[0], z: w[2] }); marks.push({ kind: 'move', at: w, ids: [c.id], t0: game.realT, dur: 2.4 }); }
        }
        if (!ev.shift) setMode(null);
        return true;
      }
      return ev.type === 'down' || ev.type === 'up';
    },
    draw3d() {
      if (!mode) return;
      const w = game.mouse.in ? cam.pickGround(game.mouse.x, game.mouse.y) : null;
      if (mode.kind === 'scan') {
        const u = w ? scanner(w[0], w[2], mode.units) : mode.units[0];
        if (u) {
          const p = game.unitPose(u).pos;
          R.fx.ring([p[0], 0, p[2]], u.def.scan.reach, { rgb: LIME, a: .45, step: 6, drape: true, lift: 2, mode: 'over' });
          if (w) {
            R.fx.ring(w, u.def.scan.r, { rgb: LIME, a: .8, step: 4, drape: true, lift: 2, mode: 'over' });
            R.fx.line([p[0], p[1] + 10, p[2]], [w[0], w[1] + 30, w[2]], { rgb: LIME, a: .5, step: 7, mode: 'over' });
          }
        }
      } else if (mode.kind === 'drone' && w) {
        R.fx.ring(w, 1500, { rgb: LIME, a: .7, step: 5, drape: true, lift: 2, mode: 'over' });
      }
    },
    draw2d(ov) {
      if (buyOpen) { if (game.frameN % 15 === 0) renderBuy(); }
      if (!mode || !game.mouse.in) return;
      const x = game.mouse.x, y = game.mouse.y;
      const txt = mode.kind === 'scan' ? 'SCAN · CLICK THE AREA' : 'ORLAN-10 · CLICK THE PATROL POINT';
      ov.mark(x, y, 11, '#C6F432', 1);
      ov.dline(x - 18, y, x - 8, y, 3, 1, '#C6F432', 1); ov.dline(x + 8, y, x + 18, y, 3, 1, '#C6F432', 1);
      ov.dline(x, y - 18, x, y - 8, 3, 1, '#C6F432', 1); ov.dline(x, y + 8, x, y + 18, 3, 1, '#C6F432', 1);
      ov.tag(x + 16, y + 14, mode.kind === 'scan' ? 'X' : 'L', txt, '', { kind: 'lime', size: 10 });
      if (mode.kind === 'scan') {
        const cd = sim.sides[game.side].scanCd;
        if (cd > 0) ov.text(x + 16, y + 48, `SIDE COOLDOWN ${Math.ceil(cd)} S`, { size: 10, col: '#FF6A3D' });
      }
    },
  };

  /* ---------- the orders system ---------- */
  const orders = {
    name: 'orders', priority: PRI.orders,
    get mode() { return mode; },
    marks, setMode, hotkey, toggleBuy,
    onKey(e) {
      if (e.type !== 'keydown' || e.ctrlKey || e.metaKey || e.altKey) return false;
      const K = { KeyZ: 'stop', KeyH: 'hold', KeyT: 'deploy', KeyR: 'reload', KeyX: 'scan', KeyY: 'radar', KeyL: 'drone' }[e.code];
      if (K) return hotkey(K);
      if (e.code === 'KeyB') { toggleBuy(); return true; }
      return false;
    },
    onPointer(ev) {
      if (ev.type !== 'click' || ev.button !== 2) return false;
      if (!game.selected().length) return false;
      const t = game.pickUnit ? game.pickUnit(ev.x, ev.y) : null;
      if (t && t.side !== game.side && game.vis(t) === 'track') return attack(t, ev.shift, ev.x, ev.y);
      if (t && t.side === game.side) {
        if (t.type === 'tel' && reloadOn(t, ev.shift)) return true;
        if (t.type === 'carrier') { const air = own().filter(u => u.def.domain === 'air' && u.type !== 'drone'); if (air.length) { game.order(air.map(u => u.id), { kind: 'return' }); return true; } }
        if (t.type === 'catapult') { const dr = own().filter(u => u.type === 'drone'); if (dr.length) { game.order(dr.map(u => u.id), { kind: 'return' }); return true; } }
      }
      const w = cam.pickGround(ev.x, ev.y);
      if (!w) return true;
      return moveTo(w[0], w[2], ev.shift, ev.x, ev.y);
    },
    update() {
      for (let i = marks.length - 1; i >= 0; i--) if (game.realT - marks[i].t0 > marks[i].dur) marks.splice(i, 1);
    },
    draw3d() {
      const now = game.realT;
      // routes of the selected units (what they will actually drive / sail)
      let n = 0;
      for (const u of game.selected()) {
        if (n++ > 30) break;
        const p = game.unitPose(u).pos;
        if (u.path && u.wi < u.path.length) {
          const pts = [[p[0], p[1], p[2]]];
          for (let i = u.wi; i < u.path.length; i++) pts.push([u.path[i][0], 0, u.path[i][1]]);
          R.fx.path(pts, { rgb: LIME, a: .6, step: 6, size: 1.5, drape: u.def.domain !== 'air', lift: 1.5, mode: 'over' });
        } else if (u.def.domain === 'air' && u.goal) {
          R.fx.line(p, [u.goal[0], p[1], u.goal[1]], { rgb: LIME, a: .35, step: 8, mode: 'over' });
        }
        // offensive reach of a small selection, faint (a crowd of rings says nothing)
        if (game.selection.size <= 6) for (const k in u.def.weapons) {
          const w = u.def.weapons[k];
          if (w.gun || w.auto || w.range < 3000) continue;
          R.fx.ring([p[0], 0, p[2]], w.range, { rgb: LIME, a: .16, step: 9, drape: true, lift: 3 });
        }
      }
      // fading feedback
      for (const m of marks) {
        const k = (now - m.t0) / m.dur, a = sat(1 - k);
        if (m.kind === 'move' || m.kind === 'scan') {
          // a marker ~24 px across whatever the zoom, opening as it fades
          const de = Math.hypot(m.at[0] - cam.eye[0], m.at[1] - cam.eye[1], m.at[2] - cam.eye[2]);
          const r = 22 * de / cam.fl * (1 + k * .5);
          R.fx.ring(m.at, r, { rgb: LIME, a: a, step: 4, size: 1.5, drape: true, lift: 1, mode: 'over' });
          R.fx.ring(m.at, r * .3, { rgb: LIME, a: a * .8, step: 3, size: 1.5, drape: true, lift: 1, mode: 'over' });
          if (m.ids) for (const id of m.ids) {
            const u = sim.units.get(id); if (!u) continue;
            const p = game.unitPose(u).pos;
            R.fx.line(p, m.at, { rgb: LIME, a: a * .85, step: 5, size: 1.5, drape: u.def.domain !== 'air', lift: 1.5, mode: 'over' });
          }
        } else if (m.kind === 'attack') {
          const t = sim.units.get(m.target); if (!t) continue;
          const tp = game.unitPose(t).pos;
          const de = Math.hypot(tp[0] - cam.eye[0], tp[1] - cam.eye[1], tp[2] - cam.eye[2]);
          R.fx.ring(tp, Math.max(t.def.size[0] * .7, 26 * de / cam.fl), { rgb: CORAL, a: a, step: 4, size: 1.5, lift: 2, mode: 'over' });
          for (const id of m.ids) {
            const u = sim.units.get(id); if (!u) continue;
            const p = game.unitPose(u).pos;
            R.fx.line([p[0], p[1] + 4, p[2]], [tp[0], tp[1] + 6, tp[2]], { rgb: CORAL, a: a * .85, step: 5, size: 1.5, mode: 'over' });
          }
        } else if (m.kind === 'no') {
          const r = 12 * Math.hypot(m.at[0] - cam.eye[0], m.at[1] - cam.eye[1], m.at[2] - cam.eye[2]) / cam.fl;
          R.fx.line([m.at[0] - r, m.at[1] + 1, m.at[2] - r], [m.at[0] + r, m.at[1] + 1, m.at[2] + r], { rgb: CORAL, a, step: 3, drape: true, lift: 1, mode: 'over' });
          R.fx.line([m.at[0] - r, m.at[1] + 1, m.at[2] + r], [m.at[0] + r, m.at[1] + 1, m.at[2] - r], { rgb: CORAL, a, step: 3, drape: true, lift: 1, mode: 'over' });
        }
      }
    },
    draw2d(ov) {
      for (const m of marks) if (m.kind === 'say') {
        const a = sat(1 - (game.realT - m.t0) / m.dur);
        ov.text(m.sx + 14, m.sy - 10, m.text, { size: 10.5, col: '#FF6A3D', a });
      }
    },
  };
  return [targeting, orders];
}

function addStyle() {
  if (document.getElementById('oniks-orders-css')) return;
  const s = document.createElement('style'); s.id = 'oniks-orders-css';
  s.textContent = `
  .oniks-buy { position: absolute; left: 24px; bottom: 150px; width: 330px; padding: 14px 16px 12px; background: var(--panel); font: 400 11.5px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: var(--dim); }
  .oniks-buy .hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .oniks-buy .sup b { color: var(--lime); font-weight: 400; }
  .oniks-buy .row { display: flex; align-items: center; gap: 10px; padding: 6px 0; cursor: pointer; color: rgba(255,255,255,.8); }
  .oniks-buy .row:hover { color: #fff; }
  .oniks-buy .row b { background: rgba(255,255,255,.78); color: #0B0C0A; padding: 3px 5px 2px; font-weight: 500; }
  .oniks-buy .row .n { flex: 1; }
  .oniks-buy .row .v { color: var(--lime); }
  .oniks-buy .row .d { color: var(--faint); width: 44px; text-align: right; }
  .oniks-buy .row.off { color: var(--ghost); }
  .oniks-buy .row.off .v { color: var(--ghost); }
  .oniks-buy .q { margin-top: 8px; color: var(--lime); line-height: 1.5; }
  .oniks-buy .keys { margin-top: 12px; }`;
  document.head.appendChild(s);
}
