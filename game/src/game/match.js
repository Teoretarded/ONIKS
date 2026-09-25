/* Match flow: the result (the sim's HQ / objectives / time rule, or the campaign objectives), the grade (combat:
   gradeCombat below; campaign: campaign/grade.js rewrites it) and the short stats, localStorage `oniks.lastResult` =
   { mode, mission, win, grade, stats }, the end overlay in the films' style over the live battle (it keeps playing
   behind, the cinematic camera takes it), the pause menu (Esc: resume / auto x1 / settings / restart / quit to the
   menu).
   While the end block or the pause menu is up the stage is theirs: body.oniks-veiled hides the HUD, the sandbox
   palette, the reinforcement list and the mission lines, and the world tags under the block are wiped from the
   overlay (the block's own dark gradient, so nothing reads through it).
   Save (the pause menu, Combat and Sandbox): the match's record and the tick into the one slot (save.js); the row
   shows what the slot holds (map · side · T+), then Saved. A match continued from a save restarts from its beginning.
   Kill stills: each hit replay's peak frame (replay.js 'replay-peak': the X-ray open, the broken parts named in coral) is
   composed at the end of that frame as the still path composes one (the 3D, the overlay over it) and kept in memory:
   a 480 × 270 thumbnail (data URL) and the full frame (a JPEG blob). The end screen shows the match's best three beside
   the result, captioned as the films caption a figure (Fig. 3 · DDG-51 · 04 DECKHOUSE · OUT · T+13:57); a click (or 1-3)
   opens one full size (← → the others, Esc back). F8 is still the film maker's full-resolution still. */
import { PRI } from './game.js';
import { GRADES } from '../data/campaign.js';

const MAPNAME = id => id ? id.replace(/_/g, ' ') : '';
const SIDENAME = { coast: 'Coast', fleet: 'Fleet' };
const KEEP = 4;                 // kill stills kept in memory (the best three shown, one to spare)
const TH_W = 480, TH_H = 270;   // the thumbnail
const PAR_T = 35 * 60;          // s of game time: a combat won inside it was fast
/* what a unit is worth to the side that loses it (the sim's own kill value: sim/damage.js kill()) */
const worth = u => u.def.hq ? 3000 : (u.def.cost || 100);

/* Combat grade from how the battle was fought (a won match; a lost one is D):
     +1  the sim decided it (enemy command destroyed, force destroyed, objectives or the time rule), not a forced end
     +1 / +2  a quarter / half of the enemy's worth destroyed (their command counts 3000, as in the sim's score)
     +1  no losses (5 % of your worth: a spent drone does not count); -1 for losing over 40 % of it
     +1  won inside 35 game-minutes; -1 beyond three times that
   S 5+ · A 4 · B 2-3 · C below; nothing destroyed at all is C at best (a battle sat out never grades well). */
export function gradeCombat(g) {
  if (!g.win) return 'D';
  const kr = g.enemyWorth > 0 ? g.destroyed / g.enemyWorth : 0, lr = g.ownWorth > 0 ? g.lostWorth / g.ownWorth : 0;
  let p = g.decided ? 1 : 0;
  if (kr >= .5) p += 2; else if (kr >= .25) p++;
  if (lr <= .05) p++; else if (lr > .4) p--;
  if (g.t <= PAR_T) p++; else if (g.t > PAR_T * 3) p--;
  let gr = p >= 5 ? 'S' : p === 4 ? 'A' : p >= 2 ? 'B' : 'C';
  if (g.destroyed <= 0) gr = 'C';
  return gr;
}

export function createMatchFlow(game) {
  const { sim } = game;
  let menuEl = null, endEl = null, menuOpen = false, wasPaused = false, endShown = false, forced = null, endAt = 0;
  const back = () => 'index.html' + (game.mode === 'campaign' ? '#campaign' : game.mode === 'combat' ? '#combat' : '#sandbox');
  /* Restart / Replay: the same page again; a match continued from a save (restore=1) starts over from its beginning */
  const again = () => {
    const q = new URLSearchParams(location.search);
    if (q.get('restore') !== '1') return null;
    q.delete('restore'); q.delete('cam');
    return 'play.html?' + q.toString();
  };
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
  /* the worth destroyed on each side: the sim's own tally (sim.sides[x].value, the HQ at 3000) against what is left */
  function worthOf(side) { let v = 0; for (const u of sim.alive(side)) v += worth(u); return v; }
  function grade(win, st) {
    if (!win) return 'D';
    if (game.mode === 'combat') {
      const S = sim.sides[game.side], E = sim.sides[game.enemy];
      const destroyed = S.value || 0, lostWorth = E.value || 0;
      return gradeCombat({ win, decided: !forced && !!sim.result, t: sim.t, destroyed, enemyWorth: destroyed + worthOf(game.enemy), lostWorth, ownWorth: lostWorth + worthOf(game.side) });
    }
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
    // the objectives achieved are ticked before anything reads them (the end block, the stats, the HUD's list)
    const os = game.getSystem('objectives');
    if (os && os.settle) try { os.settle(win, reason); } catch (e) { console.error('objectives settle', e); }
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
    // the Debrief (game/debrief.js): the match filmed again from its record, when there is one
    const dbf = !!(game.debrief && game.debrief.available && game.debrief.available());
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
          ${dbf ? '<span class="btn" data-a="debrief"><i class="sq"></i><span class="lab">Debrief</span></span>' : ''}
          <span class="btn" data-a="watch"><i class="sq"></i><span class="lab">Watch</span></span>
          <span class="btn" data-a="restart"><i class="sq"></i><span class="lab">Replay</span></span>
        </div>
        <div class="keys"><span><b>Enter</b>Continue</span>${dbf ? '<span><b>D</b>Debrief</span>' : ''}<span><b>W</b>Watch</span><span><b>R</b>Replay</span></div>
      </div>
      <div class="stl"></div>`;
    endEl.addEventListener('click', e => {
      const f = e.target.closest('figure[data-k]');
      if (f) { openStill(+f.dataset.k); return; }
      const b = e.target.closest('[data-a]'); if (b) act(b.dataset.a);
    });
    endEl.querySelectorAll('.btn').forEach(b => b.addEventListener('mouseenter', () => { endEl.querySelectorAll('.btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); }));
    game.uiRoot.appendChild(endEl);
    renderStills();
    const dir = game.getSystem('director');
    if (dir && dir.set) dir.set(true);
  }
  function act(a) {
    if (a === 'continue') leave(back());
    else if (a === 'restart') leave(again());
    else if (a === 'save') saveNow();
    else if (a === 'watch') { if (endEl) endEl.classList.toggle('min'); }
    else if (a === 'debrief') { if (game.debrief && game.debrief.open) game.debrief.open(); }
    else if (a === 'resume') openMenu(false);
    else if (a === 'settings') settings();
    else if (a === 'quit') leave(back());
    else if (a === 'auto') { game.setAutoSlow(!game.autoSlow); renderMenu(); }
  }
  /* the pause menu's Settings: the in-game panel (ui/help) over the paused battle, back to this menu after; without
     it, the Settings screen in another tab (the settings apply live across tabs) */
  function settings() {
    const h = game.getSystem('help');
    if (!h || !h.openSettings) { window.open('index.html#settings', 'oniks-settings'); return; }
    const blk = menuEl && menuEl.querySelector('.blk');
    if (blk) blk.style.visibility = 'hidden';
    h.openSettings({ onClose() { if (menuOpen) { renderMenu(); focusRow('settings'); } } });
  }
  function focusRow(a) { if (!menuEl) return; menuEl.querySelectorAll('.btn').forEach(b => b.classList.toggle('on', b.dataset.a === a)); }
  /* leave the match through black: the sound and the picture fade out together, then the menu (or the same match
     again) fades in from black */
  let leaving = false;
  function leave(url) {
    if (leaving) return;
    leaving = true;
    const au = game.getSystem('audio');
    if (au && au.mute) try { au.mute(true); } catch (e) { /* */ }
    const v = document.createElement('div');
    v.className = 'oniks-fade';
    document.body.appendChild(v);
    requestAnimationFrame(() => v.classList.add('on'));
    setTimeout(() => { if (url) location.href = url; else location.reload(); }, 380);
    // back here through the browser's page cache: the picture and the sound return
    addEventListener('pageshow', e => { if (!e.persisted) return; v.remove(); leaving = false; if (au && au.mute) try { au.mute(false); } catch (err) { /* */ } }, { once: true });
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
  let camKeys = true;
  function openMenu(on) {
    if (on === menuOpen) return;
    menuOpen = on;
    // the menu has the keys and the pointer: the camera neither pans (W A S D, the screen edges) nor turns under it
    if (on) { wasPaused = game.paused; game.pause(true); renderMenu(); menuEl.style.display = ''; camKeys = game.camera.keys; game.camera.keys = false; }
    else { if (menuEl) menuEl.style.display = 'none'; if (!wasPaused) game.pause(false); game.camera.keys = camKeys; }
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
    const row = (a, lab, v, cls) => `<span class="btn${a === 'resume' ? ' on' : ''}" data-a="${a}"><i class="sq"></i><span class="lab">${lab}</span>${v ? `<span class="v${cls ? ' ' + cls : ''}">${v}</span>` : ''}</span>`;
    menuEl.innerHTML = `<div class="blk"><div class="kick"><i></i>${title} · Paused</div>
      <div class="list">${row('resume', 'Resume')}${saveRow(row)}${row('auto', 'Auto ×1', game.autoSlow ? 'On' : 'Off')}${row('settings', 'Settings')}${row('restart', 'Restart')}${row('quit', 'Quit to menu')}</div>
      <div class="keys"><span><b>Esc</b>Resume</span></div></div>`;
    menuEl.querySelectorAll('.btn').forEach(b => b.addEventListener('mouseenter', () => { menuEl.querySelectorAll('.btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); }));
  }

  /* ---------- Save (save.js): the row shows what the slot holds, then what was just saved */
  let saved = null;               // the last Save from this menu: { ok, slot | why }
  const slotLine = sl => `${sl.mapName} · ${SIDENAME[sl.side] || sl.side} · ${sl.tl}`;
  function saveRow(row) {
    const S = game.save;
    if (!S || game.mode === 'campaign' || game.result) return '';
    if (saved && saved.ok) return row('save', 'Save', 'Saved · ' + slotLine(saved.slot));
    if (saved) return row('save', 'Save', saved.why, 'bad');
    if (!S.available()) return row('save', 'Save', 'Not recorded', 'dim');
    const sl = S.slot();
    return row('save', 'Save', sl && !sl.stale ? slotLine(sl) : '', 'dim');
  }
  function saveNow() {
    if (!game.save) return;
    saved = game.save.save();
    renderMenu(); focusRow('save');
  }

  /* ---------- kill stills */
  const stills = [];              // { n, score, t, d, thumb, full, w, h }
  let wantShot = null, lbEl = null, lbK = -1;
  if (!new URLSearchParams(location.search).get('debrief')) {
    game.bus.on('replay-peak', d => { if (d && !wantShot) wantShot = d; });
    // after this frame's overlay: the picture as the player sees it
    game.bus.on('frame', () => {
      if (!wantShot) return;
      const d = wantShot; wantShot = null;
      try { grab(d); } catch (e) { console.warn('stills: ' + (e && e.message)); }
    });
  }
  /* a kill over a hit, the last blow over all, an enemy hull over the player's own, its worth, the parts it lost */
  function scoreOf(d) {
    let outs = 0; for (const g of d.tags) if (g.v >= .99) outs++;
    return (d.fin ? 400 : 0) + (d.dead ? 200 : 0) + (d.own ? 0 : 120) + Math.min(60, (d.worth || 100) / 50) + outs * 12 + d.tags.length * 4;
  }
  /* the frame is copied now (a GPU copy, the drawing buffer is only there until this frame is shown); the thumbnail and
     the full-size JPEG are made from the copy in idle time (a readback of ~10 ms kept off the replay's frames) */
  const idle = fn => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 700 }) : setTimeout(fn, 30));
  const better = (n, sc) => {
    const same = stills.find(s => s.n === n);
    if (same) return same.score < sc;                                          // this replay has a better one
    return stills.length < KEEP || stills.some(s => s.score < sc);
  };
  function grab(d) {
    const g = document.getElementById('gl'), o = document.getElementById('ov');
    if (!g || !g.width || !g.height) return;
    const sc = scoreOf(d);
    if (!better(d.n, sc)) return;
    const W = g.width, H = g.height;
    const full = document.createElement('canvas'); full.width = W; full.height = H;
    const c = full.getContext('2d');
    c.fillStyle = '#0B0C0A'; c.fillRect(0, 0, W, H);
    c.drawImage(g, 0, 0);
    if (o && o.width) c.drawImage(o, 0, 0, o.width, o.height, 0, 0, W, H);
    idle(() => {
      if (!better(d.n, sc)) return;
      // the thumbnail: 16:9 round the hull and its placards (at least half the frame wide), else the middle of the frame
      const th = document.createElement('canvas'); th.width = TH_W; th.height = TH_H;
      const tc = th.getContext('2d');
      tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = 'high';
      const [cx, cy, cw, ch] = cropOf(d.box, W, H);
      tc.drawImage(full, cx, cy, cw, ch, 0, 0, TH_W, TH_H);
      const st = { n: d.n, score: sc, t: d.t, d, thumb: th.toDataURL('image/jpeg', .88), full: null, w: W, h: H };
      const same = stills.find(s => s.n === d.n);
      if (same) drop(same);
      stills.push(st);
      while (stills.length > KEEP) { let lo = stills[0]; for (const x of stills) if (x.score < lo.score) lo = x; drop(lo); }
      if (full.toBlob) full.toBlob(b => { if (b && stills.includes(st)) { st.full = URL.createObjectURL(b); if (stillOpen()) showStill(lbK); } }, 'image/jpeg', .92);
      renderStills();
    });
  }
  function cropOf(b, W, H) {
    const wMax = Math.min(W, H * 16 / 9);
    if (!b) return [(W - wMax) / 2, (H - wMax * 9 / 16) / 2, wMax, wMax * 9 / 16];
    const x0 = b[0] * W, y0 = b[1] * H, x1 = b[2] * W, y1 = b[3] * H;
    const w = Math.min(wMax, Math.max((x1 - x0) * 1.18, (y1 - y0) * 1.3 * 16 / 9, W * .5)), h = w * 9 / 16;
    const cl = (v, a, z) => v < a ? a : v > z ? z : v;
    return [cl((x0 + x1) / 2 - w / 2, 0, W - w), cl((y0 + y1) / 2 - h / 2, 0, H - h), w, h];
  }
  function drop(s) { const i = stills.indexOf(s); if (i >= 0) stills.splice(i, 1); if (s.full) URL.revokeObjectURL(s.full); s.full = null; }
  /* the best three, in the order they happened */
  const best = () => stills.slice().sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.t - b.t);
  /* DDG-51 Arleigh Burke -> DDG-51 (a hull number says it); K340P TEL, Pantsir-S1 as they are */
  const desig = s => { const w = String(s || '').split(' '); return /^[A-Z]{2,}-\d+$/.test(w[0]) ? w[0] : String(s || ''); };
  const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function caption(s, i) {
    const d = s.d, fmt = game.fmtTime || (t => Math.round(t) + ' s');
    let top = null; for (const g of d.tags) if (!top || g.v > top.v + 1e-3) top = g;
    const sea = !!(game.UNITS[d.type] && game.UNITS[d.type].domain === 'sea');
    const rest = [desig(d.short || d.title)];
    // the part's name, not its particulars (Erector ram, not Erector ram · 3-stage hydraulic)
    if (top) rest.push(`${top.id} ${String(top.label).split(' · ')[0]}`, top.v >= .99 ? 'Out' : `Dmg ${Math.round(top.v * 100)} %`);
    else rest.push(d.dead ? (sea ? 'Sunk' : 'Destroyed') : 'Hit');
    rest.push('T+' + fmt(d.t));
    return `<b>Fig. ${i}</b> · ${escH(rest.join(' · ').toUpperCase())}`;
  }
  function renderStills() {
    const el = endEl && endEl.querySelector('.stl');
    if (!el) return;
    const B = best();
    el.innerHTML = B.map((s, i) => `<figure data-k="${i}"><img src="${s.thumb}" alt=""><figcaption>${caption(s, i + 1)}</figcaption></figure>`).join('');
    el.classList.toggle('on', B.length > 0);
    // the key chip for them: 1 (or 1–2, 1–3) Fig.
    const keys = endEl.querySelector('.blk .keys');
    let chip = keys && keys.querySelector('[data-st]');
    if (keys && B.length && !chip) { chip = document.createElement('span'); chip.dataset.st = '1'; keys.appendChild(chip); }
    if (chip) { if (B.length) chip.innerHTML = `<b>${B.length > 1 ? '1–' + B.length : '1'}</b>Fig.`; else chip.remove(); }
  }
  /* one still full size over the end screen */
  function openStill(k) {
    if (!best()[k]) return;
    if (!lbEl) {
      lbEl = document.createElement('div');
      lbEl.className = 'oniks-still hit always';
      lbEl.addEventListener('click', e => { const a = e.target.closest('[data-d]'); if (a) stepStill(+a.dataset.d); else closeStill(); });
      game.uiRoot.appendChild(lbEl);
    }
    lbEl.classList.add('on');
    showStill(k);
  }
  function showStill(k) {
    const B = best(), s = B[k];
    if (!s || !lbEl) return;
    lbK = k;
    const src = s.full || s.thumb;
    const img = lbEl.querySelector('img');
    if (img && img.dataset.k === String(k) && img.getAttribute('src') === src) return;
    const nav = B.length > 1 ? `<span data-d="-1"><b>←</b></span><span data-d="1"><b>→</b>Fig.</span>` : '';
    lbEl.innerHTML = `<img data-k="${k}" src="${src}" alt=""><div class="cap">${caption(s, k + 1)}</div><div class="keys">${nav}<span><b>Esc</b>Back</span></div>`;
  }
  function stepStill(d) { const n = best().length; if (n) showStill((lbK + d + n) % n); }
  function closeStill() { if (lbEl) lbEl.classList.remove('on'); lbK = -1; }
  const stillOpen = () => !!(lbEl && lbEl.classList.contains('on'));

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
      if (stillOpen()) {
        if (e.code === 'F8') return false;                 // the film maker's still, as ever
        if (e.type !== 'keydown') return true;
        if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') closeStill();
        else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') stepStill(-1);
        else if (e.code === 'ArrowRight' || e.code === 'ArrowDown') stepStill(1);
        else if (/^Digit[1-3]$/.test(e.code)) showStill(+e.code.slice(5) - 1);
        return true;
      }
      if (endShown && endEl && !endEl.classList.contains('min')) {
        if (e.type !== 'keydown') return true;
        if (/^Digit[1-3]$/.test(e.code) && best()[+e.code.slice(5) - 1]) { openStill(+e.code.slice(5) - 1); return true; }
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Enter' || e.code === 'NumpadEnter') { nav(endEl, e); return true; }
        else if (e.code === 'KeyW' || e.code === 'Escape') act('watch');
        else if (e.code === 'KeyR') act('restart');
        else if (e.code === 'KeyD' && endEl.querySelector('[data-a="debrief"]')) act('debrief');
        return true;
      }
      if (endShown && endEl && endEl.classList.contains('min') && e.type === 'keydown' && (e.code === 'Escape' || e.code === 'Enter')) { endEl.classList.remove('min'); return true; }
      if (!menuOpen) return false;
      if (e.type === 'keydown' && e.code === 'Escape') openMenu(false);
      else if (e.type === 'keydown') nav(menuEl, e);
      return true;
    },
    onPointer(ev) { return menuOpen || stillOpen() || (endShown && endEl && !endEl.classList.contains('min') && ev.type !== 'move'); },
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
    dispose() { document.body.classList.remove('oniks-veiled'); for (const x of stills.slice()) drop(x); if (lbEl) lbEl.remove(); },
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
  .oniks-menu .btn .v.dim { color: var(--faint); } .oniks-menu .btn .v.bad { color: var(--coral); }
  .oniks-end .stl { display: none; flex-direction: column; gap: 22px; margin-left: 76px; width: 288px; flex: none; }
  .oniks-end .stl.on { display: flex; }
  .oniks-end .stl figure { margin: 0; cursor: zoom-in; }
  .oniks-end .stl img { display: block; width: 288px; height: 162px; box-shadow: 0 0 0 1px var(--hair); transition: box-shadow .2s; }
  .oniks-end .stl figure:hover img { box-shadow: 0 0 0 1px var(--lime); }
  .oniks-end .stl figcaption { margin-top: 10px; font: 400 10.5px/1.55 var(--mono); letter-spacing: .05em; color: var(--dim); }
  .oniks-end .stl figcaption b, .oniks-still .cap b { font-weight: 500; color: #fff; }
  .oniks-end.min .stl { display: none; }
  .oniks-still { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 20px; background: rgba(11,12,10,.95); cursor: zoom-out; }
  .oniks-still.on { display: flex; }
  .oniks-still img { display: block; max-width: 86vw; max-height: 78vh; box-shadow: 0 0 0 1px var(--hair); }
  .oniks-still .cap { font: 400 12px/1 var(--mono); letter-spacing: .06em; color: var(--dim); }
  .oniks-still .keys span { cursor: pointer; }
  .oniks-end.min { background: none; pointer-events: none; }
  .oniks-end.min .blk { display: none; }
  body.oniks-veiled #hud, body.oniks-veiled .oniks-sbx, body.oniks-veiled .oniks-buy, body.oniks-veiled #cmp { opacity: 0 !important; }
  body.oniks-veiled #hud *, body.oniks-veiled .oniks-sbx, body.oniks-veiled .oniks-sbx *, body.oniks-veiled .oniks-buy, body.oniks-veiled .oniks-buy * { pointer-events: none !important; }`;
  document.head.appendChild(s);
}
