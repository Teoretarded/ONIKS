/* Match flow: the result (the sim's HQ / objectives / time rule, or the campaign objectives), the grade and the
   short stats, localStorage `oniks.lastResult` = { mode, mission, win, grade, stats }, the end overlay in the
   films' style over the live battle (it keeps playing behind, the cinematic camera takes it), the pause menu
   (Esc: resume / auto x1 / settings / restart / quit to the menu).
   While the end block or the pause menu is up the stage is theirs: body.oniks-veiled hides the HUD, the sandbox
   palette, the reinforcement list and the mission lines, and the world tags under the block are wiped from the
   overlay (the block's own dark gradient, so nothing reads through it). */
import { PRI } from './game.js';
import { GRADES } from '../data/campaign.js';

const MAPNAME = id => id ? id.replace(/_/g, ' ') : '';

export function createMatchFlow(game) {
  const { sim } = game;
  let menuEl = null, endEl = null, menuOpen = false, wasPaused = false, endShown = false, forced = null, endAt = 0;
  const back = () => 'index.html' + (game.mode === 'campaign' ? '#campaign' : game.mode === 'combat' ? '#combat' : '#sandbox');
  addStyle();

  /* the campaign objectives (or anything else) can end the match: { win, reason } */
  game.endMatch = r => { if (!game.result && !forced) forced = r; };

  function stats() {
    const S = sim.sides[game.side], E = sim.sides[game.enemy];
    const own = sim.alive(game.side);
    const tel = own.filter(u => u.type === 'tel'), tl = own.filter(u => u.type === 'transloader');
    return {
      t: Math.round(sim.t), kills: S.kills, lost: S.lost, fired: S.fired, enemyFired: E.fired,
      units: own.length, supply: Math.round(S.supply),
      objectives: game.objectives ? { done: game.objectives.filter(o => o.state === 'done').length, total: game.objectives.length } : null,
      ammo: { tel: tel.reduce((a, u) => a + (u.ammo.oniks || 0), 0), telCap: tel.length * 2, cargo: tl.reduce((a, u) => a + (u.cargo || 0), 0), cargoCap: tl.length * 2 },
    };
  }
  function grade(win, st) {
    if (!win) return 'D';
    let p = 2;
    const objs = game.objectives || [];
    const opt = objs.filter(o => o.optional);
    if (opt.length && opt.every(o => o.state === 'done')) p++;
    else if (!opt.length && st.lost === 0) p++;
    const start = game.startCount || Math.max(1, st.units + st.lost);
    if (st.lost === 0) p++;
    else if (st.lost > start * .5) p--;
    return GRADES[Math.max(0, Math.min(4, 4 - p))];
  }
  function finish(win, reason) {
    const st = stats(), g = grade(win, st);
    game.result = { win, reason, grade: g, stats: st, t: sim.t };
    const out = { mode: game.mode, mission: game.mission ? game.mission.n : undefined, win, grade: g, stats: st };
    try { if (game.mode !== 'sandbox') localStorage.setItem('oniks.lastResult', JSON.stringify(out)); } catch (e) { /* */ }
    game.bus.emit('result', game.result);
    endAt = game.realT + 3.5;             // let the last hit play out, then the overlay
    if (game.timeRate > 1) game.setRate(1, 'end');
  }

  function showEnd() {
    endShown = true;
    const r = game.result, st = r.stats, m = game.mission;
    endEl = document.createElement('div');
    endEl.className = 'oniks-end hit always';
    const title = m ? `${String(m.n).padStart(2, '0')} · ${m.title}` : (game.mode === 'combat' ? 'Combat' : 'Sandbox') + ' · ' + (game.map.name || MAPNAME(game.map.id));
    const why = { hq: r.win ? 'Enemy command destroyed' : 'Command lost', destroyed: r.win ? 'Enemy force destroyed' : 'Force destroyed', objectives: r.win ? 'Objectives held' : 'Objectives lost',
      time: r.win ? 'Ahead at the time limit' : 'Behind at the time limit', mission: r.win ? 'Objectives complete' : 'Mission failed' }[r.reason] || '';
    const objs = (game.objectives || []).map(o => `<div class="ob ${o.state}"><i></i><span>${o.text}${o.optional ? ' <em>optional</em>' : ''}</span></div>`).join('');
    const fmt = game.fmtTime || (t => Math.round(t) + ' s');
    endEl.innerHTML = `
      <div class="blk">
        <div class="kick"><i></i>${title}</div>
        <div class="res ${r.win ? 'w' : 'l'}">${r.win ? 'Victory' : 'Defeat'}</div>
        <div class="why">${why}</div>
        ${r.win ? `<div class="gr"><span class="lbl">Grade</span><b>${r.grade}</b></div>` : ''}
        <div class="ro">Time <b>${fmt(st.t)}</b> · Kills <b>${st.kills}</b> · Lost <b>${st.lost}</b> · Fired <b>${st.fired}</b>${st.ammo.telCap ? ` · Rounds left <b>${st.ammo.tel + st.ammo.cargo}</b>` : ''}</div>
        ${objs ? `<div class="obs">${objs}</div>` : ''}
        <div class="acts">
          <span class="btn on" data-a="continue"><i class="sq"></i><span class="lab">Continue</span></span>
          <span class="btn" data-a="watch"><i class="sq"></i><span class="lab">Watch</span></span>
          <span class="btn" data-a="restart"><i class="sq"></i><span class="lab">Replay</span></span>
        </div>
        <div class="keys"><span><b>Enter</b>Continue</span><span><b>W</b>Watch</span><span><b>R</b>Replay</span></div>
      </div>`;
    endEl.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) act(b.dataset.a); });
    endEl.querySelectorAll('.btn').forEach(b => b.addEventListener('mouseenter', () => { endEl.querySelectorAll('.btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); }));
    game.uiRoot.appendChild(endEl);
    const dir = game.getSystem('director');
    if (dir && dir.set) dir.set(true);
  }
  function act(a) {
    if (a === 'continue') location.href = back();
    else if (a === 'restart') location.reload();
    else if (a === 'watch') { if (endEl) endEl.classList.toggle('min'); }
    else if (a === 'resume') openMenu(false);
    else if (a === 'settings') window.open('index.html#settings', 'oniks-settings');   // another tab: the match stays, settings apply live
    else if (a === 'quit') location.href = back();
    else if (a === 'auto') { game.setAutoSlow(!game.autoSlow); renderMenu(); }
  }

  /* arrows move the lime square, Enter takes the row */
  function nav(root, e) {
    if (!root) return;
    const bs = [...root.querySelectorAll('.btn')];
    let i = bs.findIndex(b => b.classList.contains('on'));
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      i = (i + (e.code === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length;
      bs.forEach((b, k) => b.classList.toggle('on', k === i));
    } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && bs[i]) act(bs[i].dataset.a);
  }
  function openMenu(on) {
    if (on === menuOpen) return;
    menuOpen = on;
    if (on) { wasPaused = game.paused; game.pause(true); renderMenu(); menuEl.style.display = ''; }
    else { if (menuEl) menuEl.style.display = 'none'; if (!wasPaused) game.pause(false); }
  }
  function renderMenu() {
    if (!menuEl) {
      menuEl = document.createElement('div');
      menuEl.className = 'oniks-menu hit always';
      menuEl.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) act(b.dataset.a); });
      game.uiRoot.appendChild(menuEl);
    }
    const m = game.mission;
    const title = m ? `${String(m.n).padStart(2, '0')} · ${m.title}` : (game.mode === 'combat' ? 'Combat' : 'Sandbox') + ' · ' + (game.map.name || MAPNAME(game.map.id));
    const row = (a, lab, v) => `<span class="btn${a === 'resume' ? ' on' : ''}" data-a="${a}"><i class="sq"></i><span class="lab">${lab}</span>${v ? `<span class="v">${v}</span>` : ''}</span>`;
    menuEl.innerHTML = `<div class="blk"><div class="kick"><i></i>${title} · Paused</div>
      <div class="list">${row('resume', 'Resume')}${row('auto', 'Auto ×1', game.autoSlow ? 'On' : 'Off')}${row('settings', 'Settings')}${row('restart', 'Restart')}${row('quit', 'Quit to menu')}</div>
      <div class="keys"><span><b>Esc</b>Resume</span></div></div>`;
    menuEl.querySelectorAll('.btn').forEach(b => b.addEventListener('mouseenter', () => { menuEl.querySelectorAll('.btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); }));
  }

  /* the end block or the pause menu has the stage */
  let veiled = false;
  const endUp = () => endShown && endEl && !endEl.classList.contains('min');
  function veil() {
    const v = menuOpen || endUp();
    if (v !== veiled) { veiled = v; document.body.classList.toggle('oniks-veiled', v); }
  }

  /* high: while the menu or the end screen is up, it takes the keys */
  const menu = {
    name: 'menu', priority: PRI.menu, always2d: true,
    onKey(e) {
      if (endShown && endEl && !endEl.classList.contains('min')) {
        if (e.type !== 'keydown') return true;
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Enter' || e.code === 'NumpadEnter') { nav(endEl, e); return true; }
        else if (e.code === 'KeyW' || e.code === 'Escape') act('watch');
        else if (e.code === 'KeyR') act('restart');
        return true;
      }
      if (endShown && endEl && endEl.classList.contains('min') && e.type === 'keydown' && (e.code === 'Escape' || e.code === 'Enter')) { endEl.classList.remove('min'); return true; }
      if (!menuOpen) return false;
      if (e.type === 'keydown' && e.code === 'Escape') openMenu(false);
      else if (e.type === 'keydown') nav(menuEl, e);
      return true;
    },
    onPointer(ev) { return menuOpen || (endShown && endEl && !endEl.classList.contains('min') && ev.type !== 'move'); },
    update() {
      if (!game.result) {
        if (forced) finish(forced.win, forced.reason);
        else if (sim.result && game.mode !== 'sandbox') {
          // a campaign is won by its objectives (the sim's "enemy destroyed" can come before the last one)
          const win = sim.result.winner === game.side;
          if (!(game.mode === 'campaign' && win && game.objectives && game.objectives.length)) finish(win, sim.result.reason);
        }
        else if (sim.result && game.mode === 'sandbox' && !game._sandboxResultSeen) { game._sandboxResultSeen = true; game.bus.emit('toast', { text: (sim.result.winner === game.side ? 'WON · ' : 'LOST · ') + sim.result.reason.toUpperCase() }); }
      } else if (!endShown && game.realT >= endAt) showEnd();
      veil();
    },
    /* drawn last: wipe the world tags under the block (same fall-off as its gradient) */
    draw2d(ov) {
      veil();
      if (!veiled) return;
      const c = ov.ctx, w = ov.W * .72;
      c.save();
      c.globalCompositeOperation = 'destination-out';
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.6, 'rgba(0,0,0,.92)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, ov.H);
      c.restore();
    },
    dispose() { document.body.classList.remove('oniks-veiled'); },
  };
  /* low: Esc that nobody else wanted opens the pause menu */
  const esc = {
    name: 'escape', priority: 2,
    onKey(e) {
      if (e.type !== 'keydown' || e.code !== 'Escape') return false;
      if (game.selection.size) { game.clearSelection(); return true; }
      openMenu(true);
      return true;
    },
  };
  game.startCount = sim.alive(game.side).length;
  return [menu, esc];
}

function addStyle() {
  if (document.getElementById('oniks-match-css')) return;
  const s = document.createElement('style'); s.id = 'oniks-match-css';
  s.textContent = `
  .oniks-end, .oniks-menu { position: absolute; inset: 0; display: flex; align-items: center; background: linear-gradient(90deg, rgba(11,12,10,.9) 0%, rgba(11,12,10,.7) 38%, rgba(11,12,10,0) 72%); }
  .oniks-end .blk, .oniks-menu .blk { margin-left: 9vw; max-width: 560px; }
  .oniks-end .res { font: 300 76px/1 var(--sans); letter-spacing: -.02em; margin: 26px 0 10px; }
  .oniks-end .res.w { color: #fff; } .oniks-end .res.l { color: var(--coral); }
  .oniks-end .why { font: 400 13px/1 var(--mono); letter-spacing: .06em; text-transform: uppercase; color: var(--dim); margin-bottom: 30px; }
  .oniks-end .gr { display: flex; align-items: baseline; gap: 16px; margin-bottom: 18px; }
  .oniks-end .gr b { font: 300 54px/1 var(--sans); color: var(--lime); }
  .oniks-end .obs { margin: 22px 0 6px; }
  .oniks-end .ob { display: flex; gap: 12px; align-items: center; font: 400 12px/2 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: var(--dim); }
  .oniks-end .ob i { width: 8px; height: 8px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.4); flex: none; }
  .oniks-end .ob.done i { background: var(--lime); box-shadow: none; } .oniks-end .ob.done { color: #fff; }
  .oniks-end .ob.failed i { background: var(--coral); box-shadow: none; } .oniks-end .ob.failed { color: var(--coral); }
  .oniks-end .ob em { font-style: normal; color: var(--faint); }
  .oniks-end .acts, .oniks-menu .list { display: flex; flex-direction: column; gap: 22px; margin: 34px 0 34px; font: 400 26px/1 var(--sans); }
  .oniks-menu .list { margin-top: 40px; }
  .oniks-menu .btn .v { font: 400 12px var(--mono); letter-spacing: .06em; text-transform: uppercase; color: var(--lime); margin-left: 8px; }
  .oniks-end.min { background: none; pointer-events: none; }
  .oniks-end.min .blk { display: none; }
  body.oniks-veiled #hud, body.oniks-veiled .oniks-sbx, body.oniks-veiled .oniks-buy, body.oniks-veiled #cmp { opacity: 0 !important; }
  body.oniks-veiled #hud *, body.oniks-veiled .oniks-sbx, body.oniks-veiled .oniks-sbx *, body.oniks-veiled .oniks-buy, body.oniks-veiled .oniks-buy * { pointer-events: none !important; }`;
  document.head.appendChild(s);
}
