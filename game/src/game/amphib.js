/* Amphibious orders (the fleet's landing force, sim/amphib.js), a system just above the orders system.

   T (the fleet's card: "Land"; the coast's T stays Deploy):
     LCACs or an LHD selected   the landing mode: click where the landing force should go; each craft (the selected
                                LCACs; with an LHD, the loaded crafts in its well) runs to the beach nearest the click,
                                lands its ACVs and returns to its LHD for more (they drive on to the click when it is
                                inland of the beach). The beach it will use is ringed under the cursor.
     LCACs beached with cargo   unload here, at once.
     empty LCACs                back into the LHD's well (dock).
     ACVs ashore                board the nearest beached LCAC with room (3 km), else refused.
   Right-click: LCACs on own LHD -> dock · ACVs on own LCAC -> board it · loaded LCACs on land -> land there.
   The command card reads card(units) for its T row. The landing's events go to the HUD's log and alerts (its public
   API): crafts out of the well, ACVs ashore, the command post under assault (both sides) and taken. */
import { PRI } from './game.js';
import { beachPoint, carried, room, beached, OVERRUN_T } from '../sim/amphib.js';

const LIME = [198, 244, 50], CORAL = [255, 106, 61];
const km = m => (m < 10000 ? (m / 1000).toFixed(1) : String(Math.round(m / 1000)));

export function createAmphib(game, ord) {
  const { sim, R } = game, cam = R.camera, T = R.terrain;
  let mode = null;                                  // { crafts: [LCAC], aim: { w, bp, f } }
  const marks = ord && ord.marks;

  const own = () => game.selected().filter(u => !u.aboard || u.def.domain === 'air');
  const selAll = () => game.selected();             // an LHD's crafts in the well count through the ship
  const say = (text, bad) => game.bus.emit('toast', { text, bad: !!bad });
  const no = () => { const a = game.getSystem('audio'); if (a && a.ui) try { a.ui('invalid'); } catch (e) { /* */ } };
  const cargo = c => carried(sim, c, 'veh').length;

  /* the crafts a landing sends: the selected LCACs (not docking), else the loaded crafts in the selected LHDs' wells
     (empty ones too when none is loaded but the ship still has vehicles) */
  function craftsOf(us) {
    const sel = us.filter(u => u.def.hover && u.alive);
    if (sel.length) return sel;
    const out = [];
    for (const h of us.filter(u => u.def.well)) {
      const cs = carried(sim, h, 'craft'), full = cs.filter(c => cargo(c) > 0);
      out.push(...(full.length ? full : carried(sim, h, 'veh').length ? cs : []));
    }
    return out;
  }
  /* what T does for this selection: { kind: 'land' | 'unload' | 'dock' | 'embark', units } | { why } */
  function plan(us) {
    const crafts = craftsOf(us);
    if (crafts.length) {
      const free = crafts.filter(c => !c.aboard && !c.dockT);
      if (free.length && free.every(c => beached(sim, c) && cargo(c) > 0)) return { kind: 'unload', units: free };
      if (!crafts.some(c => cargo(c) > 0 || c.aboard) && free.length) return { kind: 'dock', units: free };
      return { kind: 'land', units: crafts };
    }
    const veh = us.filter(u => u.def.embark && !u.def.hover && !u.aboard);
    if (veh.length) return { kind: 'embark', units: veh };
    if (us.some(u => u.def.well)) return { why: 'NO LCAC IN THE WELL' };
    return { why: '' };
  }
  const relevant = us => us.some(u => u.def.well || u.def.hover || (u.def.embark && !u.def.hover));

  /* the nearest beached own LCAC with room for u, within 3 km */
  function boatFor(u) {
    let best = null, bd = 3000;
    for (const c of sim.alive(u.side)) {
      if (!c.def.hover || !beached(sim, c) || !room(sim, c, u.type)) continue;
      const d = Math.hypot(c.pos[0] - u.pos[0], c.pos[2] - u.pos[2]);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function landAt(crafts, w, queue) {
    // the beach nearest the click (from the first craft's water); the vehicles drive on to the click when it is inland
    const ref = crafts.find(c => !c.aboard) || crafts[0], host = ref.aboard ? sim.units.get(ref.aboard) : null;
    const bp = beachPoint(sim, w[0], w[2], host ? { pos: host.pos, def: host.def } : ref);
    if (!bp) { say('NO BEACH IN REACH', true); no(); return false; }
    const inland = Math.hypot(w[0] - bp[0], w[2] - bp[1]) > 400 && game.map.h(w[0], w[2]) > .5;
    const o = { kind: 'land', x: bp[0], z: bp[1], queue };
    if (inland) o.then = { kind: 'move', x: w[0], z: w[2] };
    game.order(crafts.map(c => c.id), o);
    const n = crafts.reduce((a, c) => a + cargo(c), 0);
    say(`LANDING · LCAC ×${crafts.length}${n ? ` · ACV ×${n}` : ''} · BEACH ${km(Math.hypot(bp[0] - ref.pos[0], bp[1] - ref.pos[2]))} KM`);
    if (marks) marks.push({ kind: 'move', at: [bp[0], Math.max(0, T.heightAt(bp[0], bp[1])), bp[1]], ids: crafts.map(c => c.id), t0: game.realT, dur: 2.6 });
    return true;
  }

  function hotkey(shift) {
    const us = own(), p = plan(selAll().filter(u => u.side === game.side));
    if (!p.units) { if (p.why) { say(p.why, true); no(); } return !!p.why || relevant(us); }
    if (p.kind === 'unload') { game.order(p.units.map(u => u.id), { kind: 'unload' }); say(`UNLOAD · LCAC ×${p.units.length}`); return true; }
    if (p.kind === 'dock') {
      game.order(p.units.map(u => u.id), { kind: 'dock' });
      say(`TO THE WELL · LCAC ×${p.units.length}`);
      return true;
    }
    if (p.kind === 'embark') {
      let n = 0;
      for (const v of p.units) { const b = boatFor(v); if (b) { game.order([v.id], { kind: 'embark', target: b.id, queue: shift }); n++; } }
      if (!n) { say('NO LCAC ON THE BEACH WITH ROOM', true); no(); } else say(`BOARD · ACV ×${n}`);
      return true;
    }
    // land: the targeting mode
    if (mode) { setMode(null); return true; }
    if (ord && ord.setMode) ord.setMode(null);
    setMode({ crafts: p.units });
    return true;
  }
  function setMode(m) { mode = m; game.bus.emit('mode', m ? { mode: 'land' } : { mode: null }); }

  /* the command card's T row for the fleet */
  function card(us) {
    const p = plan(game.selected().filter(u => u.side === game.side));
    if (!p.units) return { ok: false, lab: 'Land', hint: p.why ? `${p.why[0]}${p.why.slice(1).toLowerCase()}` : 'LHD, LCAC or ACV · the landing force' };
    if (p.kind === 'unload') return { ok: true, lab: 'Unload', x: String(p.units.reduce((a, c) => a + cargo(c), 0)), hint: 'Ramp down · the ACVs drive ashore' };
    if (p.kind === 'dock') return { ok: true, lab: 'Dock', hint: 'Back into the LHD\'s well deck for more' };
    if (p.kind === 'embark') return { ok: true, lab: 'Board', hint: 'Drive aboard the nearest beached LCAC' };
    const n = p.units.reduce((a, c) => a + cargo(c), 0);
    return { ok: true, lab: 'Land', on: !!mode, x: n ? String(n) : '', hint: `LCAC ×${p.units.length}${n ? ` · ACV ×${n}` : ''} · click where to land · they return to the LHD for more` };
  }

  return {
    name: 'amphib', priority: PRI.orders + 5,
    get mode() { return mode; },
    hotkey, card, plan,
    init() {
      game.bus.on('mode', m => { if (mode && (!m || m.mode !== 'land')) mode = null; });
      game.bus.on('select', () => { if (mode) setMode(null); });
    },
    onKey(e) {
      if (e.type !== 'keydown' || e.ctrlKey || e.metaKey || e.altKey) return false;
      if (mode && e.code === 'Escape') { setMode(null); return true; }
      if (e.code !== 'KeyT') return false;
      if (!relevant(game.selected())) return false;              // the coast's T: Deploy (the orders system)
      return hotkey(e.shiftKey);
    },
    onPointer(ev) {
      if (mode) {
        if (ev.type === 'click' && ev.button === 2) { setMode(null); return true; }
        if (ev.type === 'click' && ev.button === 0) {
          const w = cam.pickGround(ev.x, ev.y), cr = mode.crafts.filter(c => c.alive);
          if (w && cr.length && landAt(cr, w, ev.shift) && !ev.shift) setMode(null);
          return true;
        }
        return ev.type === 'down' || ev.type === 'up';
      }
      if (ev.type !== 'click' || ev.button !== 2) return false;
      const us = own();
      if (!us.length || !relevant(us)) return false;
      const t = game.pickUnit ? game.pickUnit(ev.x, ev.y) : null;
      if (t && t.side === game.side && t.alive) {
        const cr = us.filter(u => u.def.hover);
        if (t.def.well && cr.length) { game.order(cr.map(u => u.id), { kind: 'dock', target: t.id, queue: ev.shift }); say(`TO THE WELL · LCAC ×${cr.length}`); return true; }
        const veh = us.filter(u => u.def.embark && !u.def.hover);
        if (t.def.hover && veh.length) {
          const ok = veh.filter(v => room(sim, t, v.type));
          if (!ok.length) { say('LCAC FULL', true); no(); return true; }
          game.order(ok.map(u => u.id), { kind: 'embark', target: t.id, queue: ev.shift });
          say(`BOARD · ACV ×${ok.length}`);
          return true;
        }
      }
      // loaded crafts sent onto land: a landing there
      const w = !t ? cam.pickGround(ev.x, ev.y) : null, loaded = us.filter(u => u.def.hover && cargo(u) > 0);
      if (w && loaded.length && loaded.length === us.length && game.map.h(w[0], w[2]) > .5) { landAt(loaded, w, ev.shift); return true; }
      return false;
    },
    update() {
      if (mode && !mode.crafts.some(c => c.alive)) setMode(null);
    },
    onEvent(e) {
      const H = game.getSystem('hud'), log = H && H.log && H.log.add ? H.log : null, al = H && H.alerts && H.alerts.push ? H.alerts : null;
      const me = game.side;
      if (e.type === 'well' && e.side === me && e.dir === 'clear' && log) log.add('Well', `LCAC ${String(e.unit).padStart(2, '0')} out of the well`, 'l', 'well');
      else if (e.type === 'unload' && e.side === me) {
        if (al) al.push('ashore', 'Ashore', 'ACV ×1 ashore', 'l', { pos: e.pos.slice(), merge: 30, dur: 8, dist: 3000, textN: n => `ACV ×${n} ashore` });
      } else if (e.type === 'landing' && e.side === me && (e.state === 'nobeach' || e.state === 'noroute')) game.bus.emit('toast', { text: e.state === 'nobeach' ? 'LCAC · NO BEACH IN REACH' : 'LCAC · NO ROUTE TO THE BEACH', bad: true });
      else if (e.type === 'overrun') {
        const own = me === 'coast';
        if (e.state === 'start' && al) al.push('overrun', own ? 'Assault' : 'Assault', own ? `Enemy vehicles at the command post · clear them within ${OVERRUN_T} s` : `The command post is ours in ${OVERRUN_T} s if we hold the ground`, own ? 'c' : 'l', { pos: e.pos.slice(), dur: 14, dist: 5000 });
        if (e.state === 'lost' && log) log.add('Assault', own ? 'Command post cleared' : 'Assault on the command post broken', own ? 'l' : 'c', 'overrun');
        if (e.state === 'taken' && log) log.add('Assault', own ? 'Command post overrun' : 'Command post taken', own ? 'c' : 'l', 'overrun');
      }
    },
    draw3d() {
      if (!mode || !game.mouse.in) return;
      const w = cam.pickGround(game.mouse.x, game.mouse.y);
      if (!w) return;
      // the beach this click would use (cached per cell of the cursor)
      const A = mode.aim, cell = sim.nav.cellOf(w[0], w[2]);
      if (!A || A.cell !== cell) {
        const ref = mode.crafts.find(c => !c.aboard) || mode.crafts[0], host = ref && ref.aboard ? sim.units.get(ref.aboard) : null;
        mode.aim = { cell, bp: ref ? beachPoint(sim, w[0], w[2], host || ref) : null };
      }
      const bp = mode.aim.bp;
      if (!bp) { R.fx.ring(w, 22 * Math.hypot(w[0] - cam.eye[0], w[1] - cam.eye[1], w[2] - cam.eye[2]) / cam.fl, { rgb: CORAL, a: .8, step: 4, drape: true, lift: 1, mode: 'over' }); return; }
      const at = [bp[0], Math.max(0, T.heightAt(bp[0], bp[1])), bp[1]];
      const de = Math.hypot(at[0] - cam.eye[0], at[1] - cam.eye[1], at[2] - cam.eye[2]);
      R.fx.ring(at, Math.max(120, 20 * de / cam.fl), { rgb: LIME, a: .85, step: 4, size: 1.5, drape: true, lift: 1, mode: 'over' });
      R.fx.ring(at, Math.max(40, 7 * de / cam.fl), { rgb: LIME, a: .7, step: 3, drape: true, lift: 1, mode: 'over' });
      if (Math.hypot(w[0] - bp[0], w[2] - bp[1]) > 400 && game.map.h(w[0], w[2]) > .5) R.fx.line([at[0], at[1] + 2, at[2]], [w[0], w[1] + 2, w[2]], { rgb: LIME, a: .5, step: 6, drape: true, lift: 1.5, mode: 'over' });
      for (const c of mode.crafts) {
        if (!c.alive) continue;
        const p = c.aboard ? game.unitPose(sim.units.get(c.aboard) || c).pos : game.unitPose(c).pos;
        R.fx.line([p[0], p[1] + 8, p[2]], [at[0], at[1] + 10, at[2]], { rgb: LIME, a: .45, step: 8, mode: 'over' });
      }
    },
    draw2d(ov) {
      if (!mode || !game.mouse.in) return;
      const x = game.mouse.x, y = game.mouse.y, k = ov.ui || 1, LI = '#C6F432', CO = '#FF6A3D';
      const bp = mode.aim && mode.aim.bp, cr = mode.crafts.filter(c => c.alive), n = cr.reduce((a, c) => a + cargo(c), 0);
      const col = bp ? LI : CO;
      const txt = bp ? `LCAC ×${cr.length}${n ? ` · ACV ×${n}` : ''} · LAND · CLICK THE BEACH OR INLAND` : 'NO BEACH IN REACH';
      ov.mark(x, y, 11, col, 1);
      const r0 = 8 * k, r1 = 18 * k;
      ov.dline(x - r1, y, x - r0, y, 3, 1, col, 1); ov.dline(x + r0, y, x + r1, y, 3, 1, col, 1);
      ov.dline(x, y - r1, x, y - r0, 3, 1, col, 1); ov.dline(x, y + r0, x, y + r1, 3, 1, col, 1);
      ov.tag(x + 16 * k, y + 14 * k, 'T', txt, '', { kind: bp ? 'lime' : 'coral', size: 10, fit: [] });
    },
  };
}
