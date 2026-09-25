/* Orders: right-click (ground / sea: move in formation; hostile track: attack, and with a carrier selected its ready
   F/A-18Es launch on it; own TEL with a transloader selected: reload; own carrier with aircraft selected: return;
   aircraft on a deck: they launch toward the point / track), Shift queues. Hotkeys (none of them the camera's):
   Z stop · H weapons free / hold fire · T deploy / undeploy · R reload · X scan (click a point) · Y radar on / off ·
   L launch: the Orlan-10 off its rail (coast), or the strike package off the deck (fleet: the selected deck aircraft,
   else every F/A-18E on the selected / any deck; click a track to strike it, a point to fly a patrol there) ·
   U launch one MH-60R (click a search point or a track) · ~ (the key left of 1) salvo size 1 / 2 / ALL (Shift: back) ·
   B reinforcements.
   Attacks persist (sim/orders.js): volleys of the salvo size, each watched until its rounds are down, until the target
   is destroyed, the weapon is empty with no reload coming, or the track has been lost for 5 min (held meanwhile:
   "TRK 25 · LOST · HOLDING"). A hostile track that is classified and within reach of the side's weapons raises an
   alert once ("TRK 25 · DDG 0.90 · IN REACH OF 4 TEL", bus 'engageable'; auto x1 when that setting is on).
   Weapons: offensive fire (Oniks, TLAM, SLAM-ER, Hellfire, the 5" gun) is the player's decision: units start with
   weapons held and fire on an attack order; H sets weapons free (they pick tracks in reach themselves) and back.
   Defensive weapons (SAM, SM-6, ESSM, Phalanx, 30 mm, AIM-120) always engage incoming rounds and aircraft.
   Scan: the nearest scanner that reaches the point fires (the selection's first, else any on the side); nothing ever
   drives toward a scan point: beyond every scanner's reach the click is refused ("OUT OF REACH · 82 / 70 KM").
   Feedback in the world: a dotted lime path and marker for moves, a coral dotted line for attacks, fading; the
   remaining route of selected units; weapon range of the selection. Targeting modes (scan, drone, launch, helo) run
   as a second system above the selection. */
import { PRI } from './game.js';
import { SHORT, offensive } from './labels.js';
import { buyable } from '../data/units.js';
import { scanBlocked } from '../sim/sensors.js';

const LIME = [198, 244, 50], CORAL = [255, 106, 61], WH = [238, 238, 228];
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const km = m => (m < 10000 ? (m / 1000).toFixed(1) : String(Math.round(m / 1000)));
const pad2 = n => String(n).padStart(2, '0');
const CAP_R = { fighter: 8000, helo: 3000 };      // patrol radius of a launch to a point (m)
const CLS = { tel: 'TEL', bal: 'BAL', ddg: 'DDG', ssn: 'SSN', ssk: 'SSK', fighter: 'F/A-18E', helo: 'MH-60R' };

export function createOrders(game) {
  const { sim, R } = game, cam = R.camera, T = R.terrain;
  const marks = [];            // feedback: { kind: 'move'|'attack'|'scan'|'no'|'say', at, t0, dur, ids, target }
  let mode = null;             // targeting: { kind: 'scan'|'drone'|'launch'|'helo', units }
  let buyOpen = false, buyEl = null, told = false;
  const q = [0, 0, 0];

  const own = () => game.selected().filter(u => !u.aboard || u.def.domain === 'air');
  const canGo = (u, x, z) => {
    const h = game.map.h(x, z), dom = u.def.domain;
    if (dom === 'air') return true;
    if (dom === 'land') return h > .5 && game.map.slope(x, z) < (u.def.slopeMax || .4) + .15;
    return h < -(u.def.draught || 5) - 2;
  };
  const say = (text, x, y) => marks.push({ kind: 'say', text, sx: x, sy: y, t0: game.realT, dur: 1.6 });
  const bad = () => { const a = game.getSystem('audio'); if (a && a.ui) try { a.ui('invalid'); } catch (e) { /* */ } };
  const posOf = u => game.unitScreenPos ? game.unitScreenPos(u) : game.unitPose(u).pos;
  const ref = u => u.def.cls + ' ' + pad2(u.id);

  /* ---------- aircraft on the decks ---------- */
  const ready = u => !u.rearmT || u.rearmT <= sim.t;
  const queued = u => { const cv = sim.units.get(u.aboard); return !!(cv && cv.launchQ && cv.launchQ.includes(u.id)); };
  function onDeck(decks, types) {
    const ids = new Set(decks.map(d => d.id)), out = [];
    for (const u of sim.alive(game.side)) if (u.aboard && ids.has(u.aboard) && (!types || types.includes(u.type))) out.push(u);
    return out;
  }
  /* weapons that can be ordered on a target domain (the sim's attack rule; with rounds aboard now) */
  const strikes = (u, dom) => { const W = u.def.weapons; for (const k in W) { const w = W[k]; if (!w.gun && w.vs.includes(dom) && (!w.auto || dom === 'air') && u.ammo[k] > 0 && !u.off[k]) return true; } return false; };
  /* the aircraft a launch sends: the selected deck aircraft, else (launch) every F/A-18E on the selected decks (or any
     own deck) / (helo) one MH-60R; ready ones first, none already on a launch queue */
  function pkg(kind) {
    const us = own();
    const sel = us.filter(u => u.aboard && u.def.domain === 'air' && (kind !== 'helo' || u.type === 'helo') && !queued(u));
    if (sel.length) return { units: sel, picked: true };
    let decks = us.filter(u => u.def.air);
    if (!decks.length) decks = sim.alive(game.side).filter(u => u.def.air);
    const types = kind === 'helo' ? ['helo'] : ['fighter'];
    const all = onDeck(decks, types);
    const list = all.filter(u => !queued(u)).sort((a, b) => (ready(b) - ready(a)) || a.id - b.id);
    if (!list.length) return { units: [], why: all.length ? 'ALREADY ON THE LAUNCH QUEUE' : kind === 'helo' ? 'NO MH-60R ON DECK' : 'NO F/A-18E ON DECK' };
    return { units: kind === 'helo' ? list.slice(0, 1) : list };
  }
  const pkgName = us => {
    const n = {}; for (const u of us) n[u.type] = (n[u.type] || 0) + 1;
    return Object.keys(n).map(t => `${SHORT[t] || t} ×${n[t]}`).join(' · ');
  };
  /* L: the Orlan-10 when this is the coast's rail, else the deck */
  function droneContext() {
    const us = own();
    if (us.some(u => u.type === 'catapult')) return true;
    if (us.some(u => u.def.air || (u.aboard && u.def.domain === 'air'))) return false;
    const side = sim.alive(game.side);
    if (side.some(u => u.type === 'catapult')) return true;
    return !side.some(u => u.def.air);
  }

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
    const deck = us.filter(u => u.aboard);
    if (deck.length) game.bus.emit('toast', { text: `LAUNCH · ${pkgName(deck)}` });
    marks.push({ kind: 'move', at: [x, Math.max(0, T.heightAt(x, z)), z], ids: all, t0: game.realT, dur: 2.6 });
    return true;
  }
  const domOf = u => u.def.domain === 'air' ? 'air' : u.def.domain === 'sea' ? 'sea' : 'land';
  function attack(t, queue, sx, sy) {
    const dom = domOf(t);
    const us = own().filter(u => Object.values(u.def.weapons).some(w => !w.gun && w.vs.includes(dom) && !(w.auto && !w.salvo)));
    // a carrier's strike weapon is its air wing: its F/A-18Es with rounds for the target go with it
    for (const cv of own().filter(u => u.type === 'carrier')) for (const f of onDeck([cv], ['fighter'])) if (!us.includes(f) && !queued(f) && strikes(f, dom)) us.push(f);
    if (!us.length) { say('NO WEAPON FOR ' + dom.toUpperCase(), sx, sy); bad(); return true; }
    // weapons need a classified track from the side's own sensors (fog off shows everything, it does not aim)
    const c = sim.contact(game.side, t.id);
    if (!c || c.conf < game.CLASSIFY) { say('NOT TRACKED · SCAN IT (X)', sx, sy); bad(); marks.push({ kind: 'no', at: game.unitPose(t).pos.slice(), t0: game.realT, dur: 1.2 }); return true; }
    game.order(us.map(u => u.id), { kind: 'attack', target: t.id, queue });
    const deck = us.filter(u => u.aboard);
    if (deck.length) game.bus.emit('toast', { text: `STRIKE · ${pkgName(deck)} · ${c.track}` });
    else game.bus.emit('toast', { text: `ATTACK · ${c.track} · ${countBy(us)} · SALVO ${salvoText(us)}` });
    marks.push({ kind: 'attack', target: t.id, ids: us.map(u => u.id), t0: game.realT, dur: 2.6 });
    return true;
  }
  /* "3 DDG" / "2 TEL · 1 BAL" */
  function countBy(us) {
    const n = new Map();
    for (const u of us) { const k = CLS[u.type] || u.def.cls; n.set(k, (n.get(k) || 0) + 1); }
    return [...n].map(([k, v]) => `${v} ${k}`).join(' · ');
  }
  /* salvo size: the unit's setting, else its main weapon's own (1, 2, ... ; 0 = all in hand) */
  function salvoOf(u) {
    if (u.salvo !== undefined) return u.salvo;
    const W = u.def.weapons;
    for (const k in W) { const w = W[k]; if (!w.auto && !w.gun && (w.vs.includes('land') || w.vs.includes('sea'))) return w.salvo || 1; }
    return 2;
  }
  function salvoText(us) {
    const arm = us.filter(offensive);
    if (!arm.length) return '';
    const v = salvoOf(arm[0]);
    if (arm.some(u => salvoOf(u) !== v)) return 'MIXED';
    return v === 0 ? 'ALL' : String(v);
  }
  /* the side's units that can put a round on a contact from where they are now (offensive weapons with rounds) */
  function reachOf(c) {
    const out = [];
    for (const u of sim.alive(game.side)) {
      if (u.aboard) continue;
      const W = u.def.weapons;
      for (const k in W) {
        const w = W[k];
        if (w.auto || w.gun || !w.vs.includes(c.dom) || u.ammo[k] <= 0 || u.off[k]) continue;
        const d = Math.hypot(u.pos[0] - c.pos[0], u.pos[2] - c.pos[2]);
        if (d <= w.range * .97 && d >= (w.min || 0)) { out.push(u); break; }
      }
    }
    return out;
  }
  /* a hostile track that is classified and within reach of the side's weapons: one alert per track (bus 'engageable')
     and auto x1; a track that leaves the picture and comes back is new */
  const reachTold = new Map();
  let reachT = -1;
  game.bus.on('side', () => reachTold.clear());
  function checkReach() {
    const S = sim.sides[game.side];
    if (!S || !sim.fog || sim.result) return;
    const t = sim.t;
    for (const id of reachTold.keys()) if (!S.contacts.has(id)) reachTold.delete(id);
    let slowed = false;
    for (const [id, c] of S.contacts) {
      if (reachTold.has(id) || c.dead || c.conf < game.CLASSIFY || c.dom === 'air' || t - c.lastSeen > 30) continue;
      const us = reachOf(c);
      if (!us.length) continue;
      reachTold.set(id, t);
      // already under attack by the side: nothing to tell
      if (sim.alive(game.side).some(u => u.orders[0] && u.orders[0].kind === 'attack' && u.orders[0].target === id)) continue;
      const text = `${c.track} · ${c.cls || '?'} ${c.conf.toFixed(2)} · in reach of ${countBy(us)}`;
      game.bus.emit('engageable', { unit: id, track: c.track, cls: c.cls, conf: c.conf, units: us.map(u => u.id), text, pos: c.pos.slice() });
      if (!slowed && game.slowFor) { slowed = true; game.slowFor('engage', { unit: id }); }
    }
  }

  /* ~: the next salvo size for the selection's launchers: 1 -> 2 -> ALL -> 1 (Shift: back) */
  function cycleSalvo(back) {
    const arm = own().filter(offensive);
    if (!arm.length) return null;
    const CYC = [1, 2, 0], i = CYC.indexOf(salvoOf(arm[0]));
    const next = i < 0 ? (back ? 0 : 1) : CYC[(i + (back ? 2 : 1)) % 3];
    game.order(arm.map(u => u.id), { kind: 'salvo', n: next });
    return { next, arm };
  }
  function reloadOn(tel, queue) {
    const tl = own().filter(u => u.type === 'transloader');
    if (!tl.length) return false;
    game.order(tl.map(u => u.id), { kind: 'reload', target: tel.id, queue });
    marks.push({ kind: 'move', at: game.unitPose(tel).pos.slice(), ids: tl.map(u => u.id), t0: game.realT, dur: 2.2 });
    return true;
  }
  function hotkey(kind, back) {
    const us = own();
    const mx = game.mouse.x, my = game.mouse.y;
    if (kind === 'hold') kind = 'weapons';
    if (kind === 'launch' && droneContext()) kind = 'drone';
    if (!us.length && kind !== 'scan' && kind !== 'drone' && kind !== 'launch' && kind !== 'helo' && kind !== 'buy') return false;
    switch (kind) {
      case 'stop': game.order(us.map(u => u.id), { kind: 'stop' }); return true;
      case 'weapons': {
        // weapons free / hold fire: offensive weapons only (defence is always automatic); units keep their orders
        const arm = us.filter(offensive);
        if (!arm.length) { say('NO OFFENSIVE WEAPONS · DEFENCE IS AUTOMATIC', mx, my); bad(); return true; }
        const free = !arm.every(u => u.hold);
        game.order(arm.map(u => u.id), { kind: 'weapons', free });
        game.bus.emit('toast', { text: free ? 'WEAPONS FREE' : 'HOLD FIRE' });
        return true;
      }
      case 'salvo': {
        const r = cycleSalvo(back);
        if (!r) { say('NO OFFENSIVE WEAPONS · DEFENCE IS AUTOMATIC', mx, my); bad(); return true; }
        game.bus.emit('toast', { text: `SALVO ${r.next === 0 ? 'ALL' : r.next} · ${countBy(r.arm)}` });
        return true;
      }
      case 'deploy': {
        const dep = us.filter(u => u.type === 'tel' || u.type === 'bal' || u.type === 'radar');
        if (!dep.length) return true;
        for (const u of dep) {
          const up = u.type !== 'radar' ? (u.dep > 0 || u.depT > 0 || u.elevT > 0) : (u.mast > 0 || u.mastT > 0);
          game.order([u.id], { kind: up ? 'undeploy' : 'deploy' });
        }
        return true;
      }
      case 'reload': { const r = us.filter(u => u.type === 'tel' || u.type === 'bal' || u.type === 'transloader' || u.def.domain === 'sea' || u.type === 'pantsir'); game.order(r.map(u => u.id), { kind: 'reload' }); return true; }
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
        if (mode && mode.kind === 'scan') { setMode(null); return true; }
        let sc = us.filter(u => u.def.scan && !u.off.scan && !u.aboard);
        if (!sc.length) sc = sim.alive(game.side).filter(u => u.def.scan && !u.off.scan && !u.aboard);
        if (!sc.length) { say('NO SCANNER', mx, my); bad(); return true; }
        setMode({ kind: 'scan', units: sc });
        return true;
      }
      case 'drone': {
        if (mode && mode.kind === 'drone') { setMode(null); return true; }
        let cs = us.filter(u => u.type === 'catapult' && u.drones > 0);
        if (!cs.length) cs = sim.alive(game.side).filter(u => u.type === 'catapult' && u.drones > 0 && !u.off.launch);
        if (!cs.length) { say('NO DRONE', mx, my); bad(); return true; }
        setMode({ kind: 'drone', units: cs });
        return true;
      }
      case 'launch': case 'helo': {
        if (mode && mode.kind === kind) { setMode(null); return true; }
        const pk = pkg(kind);
        if (!pk.units.length) { say(pk.why, mx, my); bad(); return true; }
        setMode({ kind, units: pk.units });
        return true;
      }
    }
    return false;
  }
  function setMode(m) { mode = m; game.bus.emit('mode', m ? { mode: m.kind } : { mode: null }); }

  /* ---------- scan: who reaches the point ---------- */
  /* the best scanner in `list` that reaches (x, z) (ready ones and radars already radiating first, then the nearest),
     and the one that comes closest when none does: { u, near: { u, d } } */
  function scanPick(x, z, list) {
    let best = null, bs = 1e18, near = null, nk = 1e18;
    for (const u of list) {
      if (!u.alive || u.off.scan || u.aboard || !u.def.scan) continue;
      const d = Math.hypot(u.pos[0] - x, u.pos[2] - z), reach = u.def.scan.reach;
      if (d / reach < nk) { nk = d / reach; near = { u, d }; }
      if (d > reach) continue;
      const why = scanBlocked(sim, u);
      const s = d / reach + (u.cooldowns.scan || 0) * .05 + (why === 'radar' ? .6 : 0);
      if (s < bs) { bs = s; best = u; }
    }
    return { u: best, near };
  }
  /* the scanner for a click: the mode's own (the selection's) first, else any other on the side -> { u, alt, near } */
  function scanFor(x, z) {
    const a = scanPick(x, z, mode ? (mode.pref || mode.units) : []);
    if (a.u) return { u: a.u, alt: false, near: a.near };
    const b = scanPick(x, z, sim.alive(game.side));
    if (b.u) return { u: b.u, alt: true, near: b.near };
    return { u: null, alt: false, near: a.near || b.near };
  }
  const reachTxt = n => `OUT OF REACH · ${km(n.d)} / ${km(n.u.def.scan.reach)} KM`;

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

  /* ---------- clicks of the targeting modes; true = done (the mode closes unless Shift) ---------- */
  function scanClick(ev, w) {
    const side = sim.sides[game.side];
    const s = scanFor(w[0], w[2]);
    if (!s.u) {
      // never drive toward it: the cursor tag says why (it blinks), and the mode stays
      if (!s.near) say('NO SCANNER', ev.x, ev.y);
      bad(); mode.flash = game.realT;
      marks.push({ kind: 'no', at: w.slice(), t0: game.realT, dur: 1.2 });
      return false;
    }
    const u = s.u;
    if (side.scanCd > 0 || (u.cooldowns.scan || 0) > 0) { say(`SCAN · ${Math.ceil(Math.max(side.scanCd, u.cooldowns.scan || 0))} S`, ev.x, ev.y); bad(); return false; }
    game.order([u.id], { kind: 'scan', x: w[0], z: w[2], stay: true });
    if (s.alt) game.bus.emit('toast', { text: `SCAN · BY ${ref(u)}` });
    marks.push({ kind: 'scan', at: w, ids: [u.id], t0: game.realT, dur: 2 });
    return true;
  }
  function launchClick(ev, w) {
    const pk = mode.kind === 'launch' && mode.units.length && mode.units.every(u => u.alive && u.aboard && !queued(u)) ? { units: mode.units } : pkg(mode.kind);
    if (!pk.units.length) { say(pk.why || 'NOTHING ON DECK', ev.x, ev.y); bad(); return true; }
    const t = game.pickUnit ? game.pickUnit(ev.x, ev.y) : null;
    if (t && t.alive && t.side !== game.side && game.vis(t) === 'track') {
      const c = sim.contact(game.side, t.id);
      if (!c || c.conf < game.CLASSIFY) { say('NOT TRACKED · SCAN IT (X)', ev.x, ev.y); bad(); return false; }
      const dom = domOf(t), us = pk.units.filter(u => strikes(u, dom));
      if (!us.length) { say(`NO WEAPON FOR ${dom.toUpperCase()} ON DECK`, ev.x, ev.y); bad(); return false; }
      game.order(us.map(u => u.id), { kind: 'attack', target: t.id });
      game.bus.emit('toast', { text: `STRIKE · ${pkgName(us)} · ${c.track}` });
      marks.push({ kind: 'attack', target: t.id, ids: us.map(u => u.id), t0: game.realT, dur: 2.6 });
      return true;
    }
    if (!w) return false;
    // a point: the jets fly a patrol there, the Seahawks search there
    const byR = {};
    for (const u of pk.units) { const r = CAP_R[u.type] || 1500; (byR[r] = byR[r] || []).push(u.id); }
    for (const r in byR) game.order(byR[r], { kind: 'patrol', x: w[0], z: w[2], r: +r });
    game.bus.emit('toast', { text: `LAUNCH · ${pkgName(pk.units)} · ${mode.kind === 'helo' ? 'SEARCH' : 'PATROL'}` });
    marks.push({ kind: 'move', at: w.slice(), ids: pk.units.map(u => u.id), t0: game.realT, dur: 2.6 });
    return true;
  }

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
        let done = true;
        if (mode.kind === 'scan') { if (!w) return true; done = scanClick(ev, w); }
        else if (mode.kind === 'drone') {
          if (!w) return true;
          const cs = mode.units.filter(u => u.alive && u.drones > 0);
          const c = cs.sort((a, b) => Math.hypot(a.pos[0] - w[0], a.pos[2] - w[2]) - Math.hypot(b.pos[0] - w[0], b.pos[2] - w[2]))[0];
          if (c) { game.order([c.id], { kind: 'launch_drone', x: w[0], z: w[2] }); marks.push({ kind: 'move', at: w, ids: [c.id], t0: game.realT, dur: 2.4 }); }
        } else done = launchClick(ev, w);
        if (done && !ev.shift) setMode(null);
        else if (done && mode && (mode.kind === 'launch' || mode.kind === 'helo')) {
          // Shift keeps launching: the next aircraft on deck
          const pk = pkg(mode.kind);
          if (pk.units.length) mode.units = pk.units; else setMode(null);
        }
        return true;
      }
      return ev.type === 'down' || ev.type === 'up';
    },
    update() {
      // scan: the list the other systems read (the sensors' reticle names mode.units[0]) is the scanner this click
      // would use, or the nearest one when none reaches
      if (mode && mode.kind === 'scan') {
        if (!mode.pref) mode.pref = mode.units;
        const w = game.mouse.in ? cam.pickGround(game.mouse.x, game.mouse.y) : null;
        const s = w ? scanFor(w[0], w[2]) : null, u = s && (s.u || (s.near && s.near.u));
        mode.aim = { w, s, f: game.frameN };           // this frame's ground point and scanner (draw3d / draw2d)
        if (u) { if (mode.units.length !== 1 || mode.units[0] !== u) mode.units = [u]; }
        else if (mode.units !== mode.pref) mode.units = mode.pref;
      }
      // a launch mode whose aircraft all went (or died) closes
      if (mode && (mode.kind === 'launch' || mode.kind === 'helo') && game.frameN % 15 === 0) {
        if (!mode.units.some(u => u.alive && u.aboard && !queued(u))) { const pk = pkg(mode.kind); if (pk.units.length) mode.units = pk.units; else setMode(null); }
      }
    },
    draw3d() {
      if (!mode) return;
      const A = mode.kind === 'scan' && mode.aim && mode.aim.f === game.frameN ? mode.aim : null;
      const w = A ? A.w : game.mouse.in ? cam.pickGround(game.mouse.x, game.mouse.y) : null;
      if (mode.kind === 'scan') {
        const s = A && A.s ? A.s : w ? scanFor(w[0], w[2]) : { u: mode.units[0] };
        if (s.u) {
          const p = game.unitPose(s.u).pos;
          R.fx.ring([p[0], 0, p[2]], s.u.def.scan.reach, { rgb: LIME, a: .45, step: 6, drape: true, lift: 2, mode: 'over' });
          if (w) {
            R.fx.ring(w, s.u.def.scan.r, { rgb: LIME, a: .8, step: 4, drape: true, lift: 2, mode: 'over' });
            R.fx.line([p[0], p[1] + 10, p[2]], [w[0], w[1] + 30, w[2]], { rgb: LIME, a: .5, step: 7, mode: 'over' });
          }
        } else if (s.near) {
          // out of reach: the nearest scanner's reach in coral, and the refused point
          const p = game.unitPose(s.near.u).pos;
          R.fx.ring([p[0], 0, p[2]], s.near.u.def.scan.reach, { rgb: CORAL, a: .5, step: 6, drape: true, lift: 2, mode: 'over' });
          if (w) R.fx.ring(w, s.near.u.def.scan.r, { rgb: CORAL, a: .7, step: 4, drape: true, lift: 2, mode: 'over' });
        }
      } else if (mode.kind === 'drone' && w) {
        R.fx.ring(w, 1500, { rgb: LIME, a: .7, step: 5, drape: true, lift: 2, mode: 'over' });
      } else if (mode.kind === 'launch' || mode.kind === 'helo') {
        const t = game.hover ? sim.units.get(game.hover) : null;
        const onTrack = t && t.alive && t.side !== game.side && game.vis(t) === 'track';
        const decks = new Set(mode.units.map(u => u.aboard).filter(Boolean));
        const to = onTrack ? game.unitPose(t).pos : w;
        if (onTrack) {
          const tp = game.unitPose(t).pos, de = Math.hypot(tp[0] - cam.eye[0], tp[1] - cam.eye[1], tp[2] - cam.eye[2]);
          R.fx.ring(tp, Math.max(t.def.size[0] * .7, 26 * de / cam.fl), { rgb: CORAL, a: .9, step: 4, size: 1.5, lift: 2, mode: 'over' });
        } else if (w) {
          const r = mode.units.some(u => u.type !== 'helo') ? CAP_R.fighter : CAP_R.helo;
          R.fx.ring(w, r, { rgb: LIME, a: .6, step: 6, drape: true, lift: 2, mode: 'over' });
        }
        if (to) for (const id of decks) {
          const cv = sim.units.get(id); if (!cv) continue;
          const p = game.unitPose(cv).pos;
          R.fx.line([p[0], p[1] + 25, p[2]], [to[0], to[1] + 40, to[2]], { rgb: onTrack ? CORAL : LIME, a: .5, step: 8, mode: 'over' });
        }
      }
    },
    draw2d(ov) {
      if (buyOpen) { if (game.frameN % 15 === 0) renderBuy(); }
      if (!mode || !game.mouse.in) return;
      const x = game.mouse.x, y = game.mouse.y, LI = '#C6F432', CO = '#FF6A3D';
      let key = 'X', txt = '', col = LI, sub = '', subCol = LI;
      if (mode.kind === 'scan') {
        const A = mode.aim && mode.aim.f === game.frameN ? mode.aim : null;
        const w = A ? A.w : cam.pickGround(x, y), s = A ? A.s : w ? scanFor(w[0], w[2]) : null;
        const out = s && !s.u && s.near;
        txt = out ? reachTxt(s.near) : 'SCAN · CLICK THE AREA';
        if (out) col = CO;
        // the sensors' reticle names the scanner, its range and cooldown under the cursor; without it, say it here
        if (!game.getSystem('sensors')) {
          if (s && s.u && s.alt) sub = `BY ${ref(s.u)} · ${km(Math.hypot(s.u.pos[0] - w[0], s.u.pos[2] - w[2]))} KM`;
          const cd = sim.sides[game.side].scanCd;
          if (cd > 0 && !sub) { sub = `SIDE COOLDOWN ${Math.ceil(cd)} S`; subCol = CO; }
        }
      } else if (mode.kind === 'drone') { key = 'L'; txt = 'ORLAN-10 · CLICK THE PATROL POINT'; }
      else {
        key = mode.kind === 'helo' ? 'U' : 'L';
        const t = game.hover ? sim.units.get(game.hover) : null;
        const onTrack = t && t.alive && t.side !== game.side && game.vis(t) === 'track';
        const c = onTrack ? sim.contact(game.side, t.id) : null;
        txt = `${pkgName(mode.units)} · ${onTrack ? 'STRIKE ' + (c ? c.track : 'TRK') : mode.kind === 'helo' ? 'CLICK A SEARCH POINT OR A TRACK' : 'CLICK A TRACK OR A PATROL POINT'}`;
        if (onTrack) col = CO;
        const wait = mode.units.filter(u => !ready(u));
        if (wait.length) { sub = `${wait.length} REARMING · OFF THE DECK WHEN READY`; subCol = 'rgba(255,255,255,.7)'; }
      }
      const k = ov.ui || 1, r0 = 8 * k, r1 = 18 * k;
      ov.mark(x, y, 11, col, 1);
      ov.dline(x - r1, y, x - r0, y, 3, 1, col, 1); ov.dline(x + r0, y, x + r1, y, 3, 1, col, 1);
      ov.dline(x, y - r1, x, y - r0, 3, 1, col, 1); ov.dline(x, y + r0, x, y + r1, 3, 1, col, 1);
      const fl = mode.flash !== undefined && game.realT - mode.flash < .6 ? (Math.floor((game.realT - mode.flash) * 10) % 2 ? .25 : 1) : 1;
      const b = ov.tag(x + 16 * k, y + 14 * k, key, txt, '', { kind: col === CO ? 'coral' : 'lime', size: 10, fit: [], a: fl });
      if (sub && b) ov.text(b[0], b[3] + 15 * k, sub, { size: 10, col: subCol });
    },
  };

  /* ---------- the orders system ---------- */
  const orders = {
    name: 'orders', priority: PRI.orders,
    get mode() { return mode; },
    marks, setMode, hotkey, toggleBuy, pkg, droneContext, salvoOf, salvoText, reachOf,
    onKey(e) {
      if (e.type !== 'keydown' || e.ctrlKey || e.metaKey || e.altKey) return false;
      const K = { KeyZ: 'stop', KeyH: 'weapons', KeyT: 'deploy', KeyR: 'reload', KeyX: 'scan', KeyY: 'radar', KeyL: 'launch', KeyU: 'helo', Backquote: 'salvo' }[e.code]
        || (e.key === '`' || e.key === '~' ? 'salvo' : null);          // the key left of 1 (by its character when no code comes)
      if (K) return hotkey(K, e.shiftKey);
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
        if (t.def.air) { const air = own().filter(u => u.def.domain === 'air' && u.type !== 'drone' && !u.aboard && t.def.air.types.includes(u.type)); if (air.length) { game.order(air.map(u => u.id), { kind: 'return' }); marks.push({ kind: 'move', at: game.unitPose(t).pos.slice(), ids: air.map(u => u.id), t0: game.realT, dur: 2.2 }); return true; } }
        if (t.type === 'catapult') { const dr = own().filter(u => u.type === 'drone'); if (dr.length) { game.order(dr.map(u => u.id), { kind: 'return' }); return true; } }
      }
      const w = cam.pickGround(ev.x, ev.y);
      if (!w) return true;
      return moveTo(w[0], w[2], ev.shift, ev.x, ev.y);
    },
    update() {
      for (let i = marks.length - 1; i >= 0; i--) if (game.realT - marks[i].t0 > marks[i].dur) marks.splice(i, 1);
      if (sim.t - reachT >= 1 || sim.t < reachT) { reachT = sim.t; checkReach(); }
      // combat: say once, when the opening shot has settled, that the first shot waits for the player
      if (!told && game.mode === 'combat' && game.realT > 3) {
        told = true;
        if (sim.alive(game.side).some(u => offensive(u) && !u.hold)) game.bus.emit('toast', { text: 'WEAPONS HELD · H WEAPONS FREE · RIGHT-CLICK A TRACK TO ATTACK' });
      }
    },
    draw3d() {
      const now = game.realT;
      // routes of the selected units (what they will actually drive / sail)
      let n = 0;
      for (const u of game.selected()) {
        if (n++ > 30) break;
        if (u.aboard) continue;
        const p = game.unitPose(u).pos;
        if (u.path && u.wi < u.path.length) {
          const pts = [[p[0], p[1], p[2]]];
          for (let i = u.wi; i < u.path.length; i++) pts.push([u.path[i][0], 0, u.path[i][1]]);
          R.fx.path(pts, { rgb: LIME, a: .6, step: 6, size: 1.5, drape: u.def.domain !== 'air', lift: 1.5, mode: 'over' });
        } else if (u.def.domain === 'air' && u.goal) {
          R.fx.line(p, [u.goal[0], p[1], u.goal[1]], { rgb: LIME, a: .35, step: 8, mode: 'over' });
        }
        // a standing attack: a faint coral line to the track (sparser while the track is lost and the order holds)
        const o = u.orders[0];
        if (o && o.kind === 'attack') {
          const c = sim.contact(game.side, o.target);
          if (c) { const lost = o.st === 'lost'; R.fx.line([p[0], p[1] + 4, p[2]], [c.pos[0], Math.max(0, c.pos[1]) + 6, c.pos[2]], { rgb: CORAL, a: lost ? .22 : .4, step: lost ? 16 : 9, mode: 'over' }); }
        }
        // offensive reach of a small selection, faint (a crowd of rings says nothing)
        if (game.selection.size <= 6) for (const k in u.def.weapons) {
          const w = u.def.weapons[k];
          if (w.gun || w.auto || w.range < 3000) continue;
          R.fx.ring([p[0], 0, p[2]], w.range, { rgb: LIME, a: u.hold ? .22 : .16, step: 9, drape: true, lift: 3 });
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
            const p = posOf(u);
            R.fx.line(p, m.at, { rgb: LIME, a: a * .85, step: 5, size: 1.5, drape: u.def.domain !== 'air', lift: 1.5, mode: 'over' });
          }
        } else if (m.kind === 'attack') {
          const t = sim.units.get(m.target); if (!t) continue;
          const tp = game.unitPose(t).pos;
          const de = Math.hypot(tp[0] - cam.eye[0], tp[1] - cam.eye[1], tp[2] - cam.eye[2]);
          R.fx.ring(tp, Math.max(t.def.size[0] * .7, 26 * de / cam.fl), { rgb: CORAL, a: a, step: 4, size: 1.5, lift: 2, mode: 'over' });
          for (const id of m.ids) {
            const u = sim.units.get(id); if (!u) continue;
            const p = posOf(u);
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
        const k = ov.ui || 1;
        ov.text(Math.min(m.sx + 14 * k, ov.W - 12 * k - m.text.length * 7.4 * k), Math.max(18 * k, m.sy - 10 * k), m.text, { size: 10.5, col: '#FF6A3D', a });
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
