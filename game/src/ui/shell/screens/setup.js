/* SANDBOX and COMBAT setup: rows of choices on the left, the live map preview on the right, Start below.
   Sandbox -> play.html?mode=sandbox&map=<id>&side=<coast|fleet>&fog=<0|1>&weather=<kind>
   Combat  -> play.html?mode=combat&map=<id>&side=<coast|fleet>&ai=<easy|normal|hard>&win=<hq|obj>&fog=1[&timer=<s>] */
import { h, esc, keysHtml, fmtTime } from '../dom.js';
import { sfx } from '../sfx.js';
import { Form } from '../form.js';
import { previewPanel } from '../preview.js';
import * as MS from '../mapsrc.js';

const SIDE_BLURB = {
  coast: 'Bastion battery: TELs, radar, Pantsir, drones. Rounds are finite; reload from the transloader.',
  fleet: 'Strike group: destroyers and a carrier with its aircraft. Ships reload only at the replenishment point.',
};
const WEATHER_BLURB = {
  calm: 'Clear air, flat sea.',
  haze: 'Short visual range. Radar is not affected.',
  rain: 'Rain squalls clutter the radar.',
  storm: 'Storm. Lightning flashes the cloud and briefly shows hidden units.',
};
const AI_BLURB = {
  easy: 'The enemy is slow to react and fires single rounds.',
  normal: 'The enemy scouts, masses its fire and moves after it shoots.',
  hard: 'The enemy coordinates salvos, hides its radars and strikes first.',
};
const WIN_BLURB = {
  hq: 'Destroy the enemy command post, or its carrier.',
  obj: 'Hold more objectives than the enemy when the timer runs out.',
};
const WEATHERS = [['calm', 'Calm'], ['haze', 'Haze'], ['rain', 'Rain'], ['storm', 'Storm']];

function remember(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('oniks.setup.' + k) || 'null'); localStorage.setItem('oniks.setup.' + k, JSON.stringify(v)); } catch (e) { return null; } }

export function setupScreen(app, mode) {
  const combat = mode === 'combat';
  const el = h('section.scr#scr-' + mode);
  const kick = h('div.kick', h('i'), h('span', combat ? '02 · Combat' : '01 · Sandbox'));
  const formEl = h('div.form', { style: 'top:250px' });
  const blurb = h('div.sblurb');
  const keys = h('div.keys.skeys', { html: keysHtml([['↑↓', 'Select'], ['←→', 'Change'], ['Enter', 'Start'], ['Esc', 'Back']]) });
  const pv = previewPanel({ w: 700, h: 600 });
  const deb = h('div.debrief');
  el.append(kick, deb, formEl, blurb, pv.el, keys);
  let form = null, weatherTouched = false, mapsLive = null;

  function build() {
    formEl.innerHTML = '';
    const maps = MS.list();
    mapsLive = MS.live();
    const saved = remember(mode) || {};
    const mapId = maps.some(m => m.id === saved.map) ? saved.map : maps[0].id;
    const rows = [
      { id: 'map', label: 'Map', cycle: true, choices: maps.map(m => [m.id, m.name]), value: mapId, blurb: v => MS.byId(v).blurb || '' },
      { id: 'side', label: 'Side', choices: [['coast', 'Coast'], ['fleet', 'Fleet']], value: saved.side || 'coast', blurb: v => SIDE_BLURB[v] },
    ];
    if (combat) {
      rows.push(
        { id: 'ai', label: 'Enemy', choices: [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], value: saved.ai || 'normal', blurb: v => AI_BLURB[v] },
        { id: 'win', label: 'Victory', choices: [['hq', 'Destroy HQ'], ['obj', 'Objectives']], value: saved.win || 'hq', blurb: v => WIN_BLURB[v] },
        { id: 'timer', label: 'Timer', choices: [[900, '15 min'], [1800, '30 min'], [2700, '45 min']], value: saved.timer || 1800,
          off: f => f.value('win') !== 'obj', blurb: v => `The match ends at ${fmtTime(v)}; the side holding more objectives wins.` },
      );
    } else {
      rows.push(
        { id: 'fog', label: 'Fog of war', choices: [[1, 'On'], [0, 'Off']], value: saved.fog != null ? saved.fog : 0, blurb: v => v ? 'You see only what your sensors report.' : 'Every unit on the map is visible.' },
        { id: 'weather', label: 'Weather', choices: WEATHERS, value: MS.byId(mapId).weather || 'calm', blurb: v => WEATHER_BLURB[v] },
      );
    }
    rows.push({ gap: true }, { id: 'start', label: 'Start', action: true, blurb: combat ? 'Fog of war is on. The enemy is awake.' : 'Both rosters in the spawn palette; the red force waits for you.' });
    form = new Form(formEl, {
      rows, blurb, enter: 'start',
      onChange(id, v, user) {
        if (id === 'map') { showMap(v); if (!combat && !weatherTouched) form.set('weather', MS.byId(v).weather || 'calm'); }
        if (id === 'weather' && user) weatherTouched = true;
        if (id === 'win') form.refresh();
        remember(mode, form.values());
      },
      onAction: start,
    });
    blurb.style.top = (250 + formEl.offsetHeight + 34) + 'px';
    showMap(form.value('map'));
  }
  const factsExtra = () => combat ? '<div>Fog of war <b>On</b></div>' : '';
  /* show the map, then load its neighbours in the list so the next preview is instant */
  function showMap(id) {
    pv.show(id, factsExtra).then(() => {
      const ids = MS.list().map(m => m.id), k = ids.indexOf(id);
      MS.warm([ids[(k + 1) % ids.length], ids[(k + ids.length - 1) % ids.length]]);
    });
  }

  function start() {
    const v = form.values(), q = new URLSearchParams({ mode, map: v.map, side: v.side });
    if (combat) { q.set('ai', v.ai); q.set('win', v.win); q.set('fog', '1'); if (v.win === 'obj') q.set('timer', v.timer); }
    else { q.set('fog', v.fog ? '1' : '0'); q.set('weather', v.weather); }
    remember(mode, v);
    app.launch('play.html?' + q.toString(), MS.byId(v.map).name);
  }

  return {
    id: mode, el, mode: 'sub', shade: 'sub',
    async enter(p) {
      await MS.refresh();
      if (!form || mapsLive !== MS.live()) { weatherTouched = false; build(); }
      else { form.focus(0, true); showMap(form.value('map')); }
      if (p && p.result) app.debrief(deb, p.result); else deb.classList.remove('on');
      requestAnimationFrame(() => { blurb.style.top = (250 + formEl.offsetHeight + 34) + 'px'; });
    },
    key(e) {
      if (e.key === 'Escape') { sfx.back(); app.go('menu', { focus: combat ? 1 : 0 }); return true; }
      return form ? form.key(e) : false;
    },
  };
}
