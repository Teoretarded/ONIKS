/* Top corners. Left: the ONIKS mark, one kick line (mode · map), the objectives with a lime tick when done, the map's
   sites as a row of squares by owner. Right: the time rate (click: faster, right-click: slower, wraps; PAUSED,
   bullet time), the sim clock, supply and income, the player's side, the auto x1 blip. */
import { clockL, esc } from './fmt.js';

const MARK = '<svg viewBox="0 0 24 24"><path d="M12 2 20.5 22h-4.1L12 11.4 7.6 22H3.5z" fill="#fff"/><circle cx="12" cy="18.2" r="1.7" fill="#C6F432"/></svg>';
const TICK = '<svg viewBox="0 0 10 10"><path d="M1.2 5.4 4 8.1 8.9 1.9" fill="none" stroke="#C6F432" stroke-width="1.6"/></svg>';
const SIDE = { coast: 'Coast · Bastion-P', fleet: 'Fleet · CSG' };

export function createTop(game, hud) {
  const { sim } = game;
  const tl = hud.div('h-tl');
  const mode = game.mode === 'campaign' ? '' : game.mode === 'combat' ? 'Combat' : 'Sandbox';
  const m = game.mission;
  const kick = m ? `${String(m.n).padStart(2, '0')} · ${m.title} · ${game.map.name || game.map.id}` : `${mode} · ${game.map.name || game.map.id}`;
  tl.innerHTML = `<div class="h-logo">${MARK}<span>ONIKS</span></div><div class="kick"><i></i><span>${esc(kick)}</span></div><div class="h-obj"></div><div class="h-sites"></div>`;
  const objEl = tl.querySelector('.h-obj'), sitesEl = tl.querySelector('.h-sites');

  const tr = hud.div('h-tr');
  tr.innerHTML = `<div class="read"><i class="sq"></i><span class="rate hit" title=""></span><span class="sep">·</span><span class="clk"></span><span class="cine"></span></div>
    <div class="ro sup"></div><div class="blip"></div>`;
  const sq = tr.querySelector('.sq'), rateEl = tr.querySelector('.rate'), clkEl = tr.querySelector('.clk'), supEl = tr.querySelector('.sup'), blipEl = tr.querySelector('.blip'), cineEl = tr.querySelector('.cine');
  const RATES = [1, 2, 4, 8, 16, 32];
  rateEl.addEventListener('mousedown', e => {
    e.stopPropagation(); e.preventDefault();
    if (game.paused) { game.pause(false); return; }
    const i = RATES.indexOf(game.timeRate), n = RATES.length;
    game.setRate(RATES[e.button === 2 ? (i - 1 + n) % n : (i + 1) % n]);
    hud.click();
  });
  rateEl.addEventListener('contextmenu', e => e.preventDefault());

  let blip = -99, blipWhy = '';
  game.bus.on('autoslow', d => { blip = game.realT; blipWhy = d.why === 'launch' ? 'Launch' : 'New contact'; });

  let objKey = '', siteKey = '', rateKey = '', clkKey = '', supKey = '', blipKey = '', cineKey = '';
  function objectives() {
    const L = game.objectives || [];
    let key = '';
    for (const o of L) key += o.state + o.text + o.prog + (o.optional ? 1 : 0) + '|';
    if (key === objKey) return;
    objKey = key;
    let html = '', hinted = false;
    for (const o of L) {
      const st = o.state === 'done' ? 'done' : o.state === 'failed' ? 'fail' : '';
      // the HQ objectives' progress is that HQ's hit points: say whose
      let prog = o.prog;
      if (prog && (o.kind === 'combat_hq' || o.kind === 'protect_hq')) {
        const hq = sim.hq(o.kind === 'combat_hq' ? game.enemy : game.side);
        if (hq) prog = `${hq.def.cls} ${prog}`;
      }
      html += `<div class="ob ${st}"><i>${o.state === 'done' ? TICK : ''}</i><span class="t">${esc(o.text)}${o.optional ? ' <em>optional</em>' : ''}</span>${prog ? `<span class="p">${esc(prog)}</span>` : ''}</div>`;
      if (!hinted && o.state === 'active' && o.hint && game.mode === 'campaign') { html += `<div class="hint">${esc(o.hint)}</div>`; hinted = true; }
    }
    objEl.innerHTML = html;
  }
  function sites() {
    const O = sim.objectives;
    if (!O || !O.length) { if (siteKey !== '-') { siteKey = '-'; sitesEl.innerHTML = ''; } return; }
    let key = '', mine = 0, theirs = 0;
    for (const o of O) { key += (o.owner || '-')[0]; if (o.owner === game.side) mine++; else if (o.owner) theirs++; }
    key += game.side;
    if (key === siteKey) return;
    siteKey = key;
    let cells = '';
    for (const o of O) cells += `<i class="${o.owner === game.side ? 'own' : o.owner ? 'en' : ''}" title="${esc(o.id + ' · ' + o.name)}"></i>`;
    sitesEl.innerHTML = `<span class="lbl">Sites</span>${cells}<span class="n"><b>${mine}</b> held · <b class="c">${theirs}</b> enemy</span>`;
  }

  return {
    update() {
      objectives(); sites();
      // rate
      const r = game.timeRate, bt = r < 1;
      const rk = game.paused ? 'P' : r + '';
      if (rk !== rateKey) {
        rateKey = rk;
        rateEl.textContent = game.paused ? 'Paused' : bt ? `×${r} · bullet time` : '×' + r;
        rateEl.className = 'rate hit' + (game.paused ? ' paused' : r > 1 || bt ? ' l' : '');
        sq.className = 'sq' + (game.paused ? ' paused' : '');
      }
      const ck = 'T+' + clockL(game.t);
      if (ck !== clkKey) { clkKey = ck; clkEl.textContent = ck; }
      const ci = game.cinematic ? 'c' : '';
      if (ci !== cineKey) { cineKey = ci; cineEl.innerHTML = ci ? '<span class="sep">·</span><span class="l">Cinematic</span>' : ''; }
      const S = sim.sides[game.side];
      const sk = Math.floor(S.supply) + '|' + Math.round(S.income * 60) + game.side;
      if (sk !== supKey) {
        supKey = sk;
        supEl.innerHTML = `Sup <b>${Math.floor(S.supply)}</b> · <span class="l">+${Math.round(S.income * 60)}/min</span> · ${SIDE[game.side]}`;
      }
      const k = game.realT - blip;
      const bk = k < 3 ? blipWhy : '';
      if (bk !== blipKey) { blipKey = bk; blipEl.innerHTML = bk ? `<i></i>${bk} · ×1` : ''; }
    },
  };
}
