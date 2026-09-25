/* Command card (bottom centre): the orders of the game's orders system as rows in the film menu's style (the key
   where the menu has its index number, the lime square and the dotted underline on hover), greyed when the
   selection cannot do them now, clickable (same as the key), with one true line of help on hover. The keys are the
   orders system's own (game/src/game/orders.js): Z H T R X Y L (U for the fleet), and B for reinforcements.
   H reads "Weapons held" / "Weapons free" (lime) for the selection's offensive weapons; defence is always automatic.
   The coast card has T Deploy and L Drone; the fleet's has U Helo and L Launch (the strike package off the deck).
   O Depth (the sonar system's key, game/sonar.js) shows while the side has a submarine: deep boats come up to
   periscope depth, others go deep; Shift+O surfaces. T Land (the fleet's; game/amphib.js): LCACs to a beach with their
   ACVs, Unload / Dock / Board by what is selected. ~ Salvo (the key left of 1): rounds per volley of the
   selection's attacks, 1 / 2 / ALL (the row reads the value; Shift+~ steps back). */
import { scanBlocked } from '../../sim/sensors.js';
import { isSub, depthName } from '../../sim/subs.js';
import { offensive } from '../../game/labels.js';
import { esc, dur } from './fmt.js';

const ROWS = [
  { k: 'Z', id: 'stop', lab: 'Stop' },
  { k: 'H', id: 'weapons', lab: 'Weapons' },
  { k: '~', id: 'salvo', lab: 'Salvo' },
  { k: 'T', id: 'deploy', lab: 'Deploy', side: 'coast' },
  { k: 'T', id: 'land', lab: 'Land', side: 'fleet' },
  { k: 'U', id: 'helo', lab: 'Helo', side: 'fleet' },
  { k: 'R', id: 'reload', lab: 'Reload' },
  { k: 'X', id: 'scan', lab: 'Scan' },
  { k: 'Y', id: 'radar', lab: 'Radar' },
  { k: 'L', id: 'launch', lab: 'Drone' },
  { k: 'O', id: 'dive', lab: 'Dive', boats: true },
  { k: 'B', id: 'buy', lab: 'Reinforce' },
];

export function createCommands(game, hud, parent) {
  const { sim } = game;
  const el = document.createElement('div'); el.className = 'h-cmd'; parent.appendChild(el);
  el.innerHTML = `<div class="rows">${ROWS.map(r => `<div class="it hit" data-c="${r.id}"><span class="n">${r.k}</span><i class="sq"></i><span class="lab">${r.lab}</span><span class="x"></span></div>`).join('')}</div><div class="hint"></div>`;
  const items = new Map([...el.querySelectorAll('.it')].map(n => [n.dataset.c, { el: n, lab: n.querySelector('.lab'), x: n.querySelector('.x'), cls: '', labT: '', xT: '', shown: true }]));
  const hintEl = el.querySelector('.hint');
  let hover = null, hintKey = '', animKey = '', state = {}, last = -1, mode = null;
  game.bus.on('mode', m => { mode = m && m.mode; last = -1; });

  el.addEventListener('mouseover', e => { const it = e.target.closest('[data-c]'); hover = it ? it.dataset.c : null; last = -1; });
  el.addEventListener('mouseleave', () => { hover = null; last = -1; });
  el.addEventListener('mousedown', e => {
    const it = e.target.closest('[data-c]');
    if (!it) return;
    e.stopPropagation(); e.preventDefault();
    run(it.dataset.c);
  });

  function run(id) {
    const s = state[id];
    if (!s || !s.ok) { hud.click(true); return; }
    if (id === 'buy') { hud.toggleBuy(); hud.click(); return; }
    if (id === 'dive') { const so = game.getSystem('sonar'); if (so && so.dive) so.dive(false); hud.click(); last = -1; return; }
    if (id === 'land') { const am = game.getSystem('amphib'); if (am && am.hotkey) am.hotkey(false); hud.click(); last = -1; return; }
    const o = game.getSystem('orders');
    if (o && o.hotkey) o.hotkey(id);
    hud.click();
    last = -1;
  }

  /* what the selection can do now: { ok, lab?, x? (a short value), hint } per row */
  function evaluate() {
    const us = game.selected().filter(u => !u.aboard || u.def.domain === 'air');
    const side = sim.sides[game.side], any = us.length > 0;
    const S = {};
    S.stop = { ok: any, hint: any ? 'Clear the orders and halt' : 'Select units first' };
    // weapons free / hold fire (the sim's hold flag): offensive weapons only
    const arm = us.filter(offensive);
    if (arm.length) {
      const free = arm.every(u => u.hold), some = arm.some(u => u.hold);
      S.weapons = { ok: true, on: free, x: free ? 'free' : some ? 'mixed' : 'held',
        hint: free ? 'Hold fire · offensive weapons fire only on your order · defence stays automatic'
          : 'Weapons free · launchers engage tracks in reach on their own · defence is always automatic' };
    } else S.weapons = { ok: false, x: '', hint: any ? 'No offensive weapons · defensive fire is always automatic' : 'Select launchers first · they fire only on your order until weapons free' };
    // salvo size of the selection's attacks (the orders system cycles it: 1 -> 2 -> ALL)
    const ord0 = game.getSystem('orders');
    if (arm.length && ord0 && ord0.salvoText) {
      const v = ord0.salvoText(arm);
      S.salvo = { ok: true, x: v === 'MIXED' ? 'mixed' : v,
        hint: v === '1' ? 'One round a volley · the next when it is down · shoot, look, shoot'
          : v === 'ALL' ? 'Every round in hand in one volley · the heaviest blow, then reload'
          : `${v} rounds a volley · the next when they are down · ~ cycles 1 / 2 / all` };
    } else S.salvo = { ok: false, x: '', hint: 'Rounds per volley of an attack · select launchers first' };
    const dep = us.filter(u => u.type === 'tel' || u.type === 'bal' || u.type === 'radar');
    if (dep.length) {
      const up = dep.every(u => u.type !== 'radar' ? (u.dep > 0 || u.depT > 0 || u.elevT > 0) : (u.mast > 0 || u.mastT > 0));
      const blocked = dep.every(u => u.off.deploy);
      S.deploy = { ok: !blocked, lab: up ? 'Stow' : 'Deploy', x: blocked ? 'out' : '',
        hint: up ? 'Bring it down to drive' : dep[0].type === 'tel' ? 'Jacks 10 s · erect 15 s · cannot move while up' : dep[0].type === 'bal' ? 'Jacks 6 s · pack up 8 s · cannot move while up' : 'Mast up 15 s · needed to radiate' };
    } else S.deploy = { ok: false, lab: 'Deploy', hint: 'TEL, Bal and Monolith-B only' };
    const rl = us.filter(u => u.type === 'tel' || u.type === 'transloader' || u.def.domain === 'sea' || u.type === 'pantsir' || u.type === 'bal' || u.type === 'kornet');
    if (rl.length) {
      const need = rl.some(u => u.type === 'transloader' ? u.cargo < u.def.cargo : Object.keys(u.def.weapons).some(w => u.ammo[w] < u.def.weapons[w].ammo));
      const off = rl.every(u => u.off.reload);
      S.reload = { ok: need && !off, x: off ? 'out' : need ? '' : 'full',
        hint: rl[0].type === 'tel' ? 'A transloader alongside (45 s a round) or a depot (90 s)' : rl[0].type === 'transloader' ? 'Refill the TLCs at a depot' : rl[0].def.domain === 'sea' ? (rl[0].side === 'coast' && rl[0].def.sub ? 'Back to base off the coast to restock' : 'Sail to the replenishment point') : rl[0].type === 'bal' ? 'Refill the containers at a depot (40 s a round)' : 'Refill at a depot' };
    } else S.reload = { ok: false, hint: 'TEL, Bal, transloader, Pantsir or ship' };
    // scan: the selection's scanners, else any on the side (the orders system does the same)
    let sc = us.filter(u => u.def.scan);
    if (!sc.length) sc = sim.alive(game.side).filter(u => u.def.scan && !u.aboard);
    if (sc.length) {
      const why = sc.map(u => scanBlocked(sim, u));
      const ready = why.includes('');
      const cd = Math.max(side.scanCd, Math.min(...sc.map(u => u.cooldowns.scan || 0)));
      S.scan = { ok: ready, on: mode === 'scan', x: ready ? '' : why.includes('cooldown') ? dur(cd) : why.includes('radar') ? 'mast' : 'out',
        hint: ready ? 'Lightning scan · click the area · identifies what is inside' : why.includes('cooldown') ? `Recharging · ${dur(cd)} sim` : why.includes('radar') ? 'Monolith-B must radiate first (mast up, Y)' : 'No scanner can reach' };
    } else S.scan = { ok: false, hint: 'Needs a radar, drone, helo, DDG or the command post' };
    const rs = us.filter(u => u.def.sensors && u.def.sensors.radar);
    if (rs.length) {
      const on = rs.some(u => u.radarOn);
      S.radar = { ok: !rs.every(u => u.off.radar), lab: on ? 'EMCON' : 'Radar on', x: rs.every(u => u.off.radar) ? 'out' : '',
        hint: on ? 'Go quiet · a radiating radar can be heard' : 'Radiate · the radar can be heard while on' };
    } else S.radar = { ok: false, lab: 'Radar', hint: 'Units with a radar only' };
    const ord = game.getSystem('orders');
    if (!ord || !ord.droneContext || ord.droneContext()) {
      let cs = us.filter(u => u.type === 'catapult');
      if (!cs.length) cs = sim.alive(game.side).filter(u => u.type === 'catapult');
      const drones = cs.reduce((a, u) => a + (u.off.launch ? 0 : u.drones), 0);
      S.launch = cs.length ? { ok: drones > 0, lab: 'Drone', on: mode === 'drone', x: String(drones), hint: drones ? 'Orlan-10 off the rail · click the patrol point' : 'No drones on the rails' }
        : { ok: false, lab: 'Drone', hint: 'Needs an Orlan-10 catapult' };
    } else {
      // the strike package: the selected deck aircraft, else the F/A-18Es on the selected (or any) deck
      const pk = ord.pkg('launch'), n = pk.units.length, wait = pk.units.filter(u => u.rearmT > sim.t);
      S.launch = { ok: n > 0, lab: 'Launch', on: mode === 'launch', x: n ? String(n) : '',
        hint: !n ? (pk.why === 'NO F/A-18E ON DECK' ? 'No F/A-18E on deck · all airborne or lost' : 'Everything on deck is already launching')
          : (pk.picked ? `Launch the selected aircraft` : `Strike package · F/A-18E ×${n}`) + ' · click a track to strike, a point to patrol' + (wait.length ? ` · ${wait.length} rearming` : '') };
    }
    if (ord && ord.pkg && game.side === 'fleet') {
      const hp = ord.pkg('helo'), n = hp.units.length;
      let onDeck = 0; for (const v of sim.alive(game.side)) if (v.type === 'helo' && v.aboard) onDeck++;
      S.helo = { ok: n > 0, on: mode === 'helo', x: onDeck ? String(onDeck) : '', hint: n ? 'MH-60R off the deck · click a search point, or a track for Hellfire' : 'No MH-60R on deck' };
    } else S.helo = { ok: false, hint: 'Needs an MH-60R on a deck' };
    // submarines: the depth order (O); the row shows the selection's depth
    const bs = us.filter(u => isSub(u));
    if (bs.length) {
      const anyDeep = bs.some(u => u.dive === 2), now = depthName(bs[0]);
      S.dive = { ok: true, lab: anyDeep ? 'Periscope' : 'Dive', x: now === 'PERISCOPE' ? 'PD' : now === 'SURFACED' ? 'surf' : 'deep',
        hint: anyDeep ? 'Up to periscope depth · masts up, missiles can fire · a radar close by can see the masts · Shift+O surfaces'
          : 'Go deep · no radar or camera sees the boat, only sonar close by · missiles need periscope depth · Shift+O surfaces' };
    } else S.dive = { ok: false, lab: 'Dive', hint: 'Submarines only · deep, periscope depth or surfaced' };
    // the landing force (game/amphib.js): T Land / Unload / Dock / Board for the selection
    const am = game.getSystem('amphib');
    S.land = am && am.card ? am.card(us) : { ok: false, hint: 'LHD, LCAC or ACV · the landing force' };
    const cheap = game.UNITS && Object.values(game.UNITS).filter(d => d.side === game.side && d.cost > 0).reduce((a, d) => Math.min(a, d.cost), 1e9);
    S.buy = { ok: cheap < 1e9, on: hud.buyOpen, x: side.queue.length ? String(side.queue.length) : '', hint: 'Buy units with supply · they arrive at your spawn' };
    return S;
  }

  return {
    run,
    update() {
      if (game.realT - last < .15) return;
      last = game.realT;
      state = evaluate();
      const hasBoat = sim.alive(game.side).some(u => isSub(u));
      for (const r of ROWS) {
        const s = state[r.id], it = items.get(r.id);
        // the side's own rows: coast T Deploy, fleet U Helo; O Depth while the side has a boat
        const shown = (!r.side || r.side === (game.side === 'fleet' ? 'fleet' : 'coast')) && (!r.boats || hasBoat);
        if (shown !== it.shown) { it.shown = shown; it.el.style.display = shown ? '' : 'none'; }
        const cls = 'it hit' + (s.ok ? '' : ' off') + (s.on ? ' on' : '');
        if (cls !== it.cls) { it.cls = cls; it.el.className = cls; }
        const lab = s.lab || r.lab;
        if (lab !== it.labT) { it.labT = lab; it.lab.textContent = lab; }
        const x = s.x || '';
        if (x !== it.xT) { it.xT = x; it.x.textContent = x; }
      }
      let h = '';
      if (hover && state[hover]) h = `<b>${ROWS.find(r => r.id === hover).k}</b>${esc(state[hover].hint)}`;
      else {
        // what a right-click does for this selection (the orders system's rules), and I when it can be inspected
        const us = game.selected();
        if (us.length) {
          const deck = us.some(u => u.aboard && u.def.domain === 'air');
          const parts = [deck ? 'Launch to a point' : us.some(u => u.def.speed > 0) ? 'Move' : ''];
          if (us.some(u => Object.values(u.def.weapons).some(w => !w.gun && !(w.auto && !w.salvo)))) parts.push(deck ? 'on a track: strike' : 'on a track: attack');
          else if (us.some(u => u.type === 'carrier')) parts.push('on a track: air strike');
          if (us.some(u => u.type === 'transloader')) parts.push('on a TEL: reload');
          if (us.some(u => u.def.domain === 'air' && u.type !== 'drone' && !u.aboard)) parts.push('on the carrier: land');
          const txt = parts.filter(Boolean).join(' · ');
          h = `<b>RMB</b>${txt ? txt[0].toUpperCase() + txt.slice(1) : 'No orders'}`;
          const ins = game.inspect;
          if (us.length === 1 && ins && ins.can && ins.can(us[0])) h += '<b class="k2">I</b>Inspect';
        }
      }
      if (h !== hintKey) {
        hintKey = h; hintEl.innerHTML = h;
        // the help line types in like the films' menu blurb (when another row is pointed at, not on a countdown tick)
        const ak = (hover || '') + (h ? 1 : 0);
        if (ak !== animKey) { animKey = ak; hintEl.classList.remove('in'); void hintEl.offsetWidth; if (h) hintEl.classList.add('in'); }
      }
    },
  };
}
