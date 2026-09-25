/* The Anatomy browser: every model key, units first, then munitions and structures, shown one at a time in dark
   space in the Inspect view, like a museum walk. In a sandbox: Shift + I, or the "Anatomy" row attachPaletteRow()
   adds to the spawn palette (game/sandbox.js re-renders its DOM, so the row is put back whenever it goes). From the
   menu: play.html?mode=museum, the walk on its own (MUSEUM_MODE below). */

export const MUSEUM = [
  ['Coast', ['tel', 'transloader', 'radar', 'pantsir', 'drone', 'catapult', 'hq', 'bal', 'ssk', 's400', 's400r', 'bereg']],
  ['Fleet', ['destroyer', 'carrier', 'helo', 'fighter', 'aew', 'ssn', 'cg', 'lcs']],
  ['Munitions', ['oniks', 'tlc', 'oniks_booster', 'pantsir_missile', 'sm6', 'mk72', 'mk41_can', 'strike_missile', 'essm', 'slam', 'hellfire', 'aam', 'shell', 'kh35', 'kalibr', 'torpedo533', 'vpt_can', 's400_msl', 'rim116', 'shell130', 'shell57']],
  ['Structures', ['depot', 'port', 'lighthouse', 'radar_hill', 'airfield']],
];
export const MUSEUM_KEYS = MUSEUM.flatMap(g => g[1]);
export const groupOf = key => { const g = MUSEUM.find(q => q[1].includes(key)); return g ? g[0] : ''; };

/* keep an "Anatomy" row in the sandbox palette's tool grid; onClick() opens the browser. -> stop() */
export function attachPaletteRow(root, onClick) {
  if (!root || typeof MutationObserver === 'undefined') return () => {};
  const inject = () => {
    const pal = root.querySelector('.oniks-sbx');
    if (!pal) return;
    const tools = pal.querySelector('.tools');
    if (!tools || tools.querySelector('[data-inspect]')) return;
    const row = document.createElement('div');
    row.className = 't'; row.dataset.inspect = '1';
    row.innerHTML = '<b>⇧I</b><span>Anatomy</span><em>walk</em>';
    row.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); onClick(); });
    tools.appendChild(row);
  };
  const mo = new MutationObserver(() => inject());
  mo.observe(root, { childList: true, subtree: true });
  inject();
  return () => mo.disconnect();
}

/* ---------------------------------------------------------------- play.html?mode=museum
   The walk on its own, opened from the menu (Sandbox · Anatomy, Campaign · Anatomy). main.js registers the Inspect
   system alone (no match, no HUD, no sound: an empty sim over the map, which the museum dims to dark space), warms the
   cutaways in walk order (MUSEUM_MODE.warm) and calls MUSEUM_MODE.start(game) once the systems are in: the camera
   waits in the dark and the first exhibit flies in under the loading screen's fade. ← → walk, E / X as in Inspect,
   Esc (or I) goes back to the screen it came from: ?from=sandbox | campaign; ?key=<model key> starts the walk there. */
const MUSEUM_Y = 9000;                    // inspect.js puts the exhibits this high above the map
const fromOf = () => (new URLSearchParams(location.search).get('from') === 'campaign' ? 'campaign' : 'sandbox');

/* every model with an anatomy walks: the list above first, then any newer anatomy entry (a new unit, round or site)
   beside its kin (NEAR) or at the end of its group; a key whose model is not registered is left out, so the walk
   never stops on one */
const NEAR = { lhd: 'carrier', lcac: 'lhd', acv: 'lcac', kornet: 'pantsir', kornet_msl: 'pantsir_missile' };
let completed = null;
function complete(game) {
  if (!completed) completed = (async () => {
    const A = (await import('../../data/anatomy.js')).ANATOMY, DM = game.models || {}, M = game.R.models;
    const INFO = DM.MODEL_INFO || {}, UNITS = game.UNITS || {};
    const seen = new Set(MUSEUM_KEYS.map(k => A[k]).filter(Boolean));
    let fresh = [];
    for (const k of Object.keys(A)) {
      const a = A[k];
      if (!a || seen.has(a)) continue;                          // an alias (tomahawk, sam57e6, aim120) of one listed
      seen.add(a); fresh.push(k);
    }
    // beside their kin first (a kin may itself be new: a few passes), the rest at the end of their group
    for (let pass = 0; pass < 4 && fresh.length; pass++) {
      fresh = fresh.filter(k => {
        const g = NEAR[k] && MUSEUM.find(q => q[1].includes(NEAR[k]));
        if (g) g[1].splice(g[1].indexOf(NEAR[k]) + 1, 0, k);
        return !g;
      });
    }
    for (const k of fresh) {
      const kind = (INFO[k] && INFO[k].kind) || '', u = Object.values(UNITS).find(d => d.model === k);
      const group = u ? (u.side === 'fleet' ? 'Fleet' : 'Coast') : kind === 'munition' ? 'Munitions' : kind === 'unit' ? 'Coast' : 'Structures';
      MUSEUM.find(g => g[0] === group)[1].push(k);
    }
    for (const g of MUSEUM) g[1] = g[1].filter(k => A[k] && M.has(A[k].model || k));
    MUSEUM_KEYS.length = 0;
    MUSEUM_KEYS.push(...MUSEUM.flatMap(g => g[1]));
    return A;
  })();
  return completed;
}
const startKey = () => { const k = new URLSearchParams(location.search).get('key'); return MUSEUM_KEYS.includes(k) ? k : MUSEUM_KEYS[0]; };

export const MUSEUM_MODE = {
  /* the optional systems it keeps (main.js OPTIONAL keys); the game's own systems (match, orders, HUD...) stay out */
  systems: ['inspect'],

  /* what the loading screen pre-samples: the first exhibit's cutaway (and what its X-ray finds) now, the rest in
     walk order in idle time (the next exhibits first, the one before next) */
  async warm(game) {
    const A = await complete(game), M = game.R.models, load = [], idle = [], seen = new Set();
    const models = k => { const a = A[k]; return a ? [a.model || k, ...(a.xray || []).map(x => x.model)] : []; };
    const add = (arr, key, lods) => { if (key && M.has(key) && !seen.has(key)) { seen.add(key); arr.push({ key, lods, st: null }); } };
    const n = MUSEUM_KEYS.length, i0 = Math.max(0, MUSEUM_KEYS.indexOf(startKey()));
    for (const m of models(MUSEUM_KEYS[i0])) add(load, m, [3, 2, 1, 0]);
    const order = [1, -1];
    for (let d = 2; d < n; d++) order.push(d);
    for (const d of order) for (const m of models(MUSEUM_KEYS[(i0 + d + n) % n])) add(idle, m, [1, 0]);
    return { load, idle };
  },

  /* open the walk; -> the museum system (Esc back to the menu) or null */
  async start(game) {
    await complete(game);
    const I = game.inspect;
    if (!I || !I.museum) { console.error('museum: the Inspect system is not there'); return null; }
    const from = fromOf();
    let leaving = false, open = false;
    function leave() {
      if (leaving) return;
      leaving = true;
      const v = document.createElement('div');
      v.className = 'oniks-fade';
      document.body.appendChild(v);
      requestAnimationFrame(() => v.classList.add('on'));
      setTimeout(() => { location.href = 'index.html#' + from; }, 380);
      addEventListener('pageshow', e => { if (e.persisted) { v.remove(); leaving = false; } }, { once: true });
    }
    const sys = game.addSystem({
      name: 'museum', priority: 105,
      /* Esc and I leave the walk for the menu (in a match they close Inspect); everything else is Inspect's */
      onKey(e) {
        if (e.code !== 'Escape' && e.code !== 'KeyI') return false;
        if (e.type === 'keydown' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) leave();
        return true;
      },
      /* the walk closed some other way: back to the menu too */
      update() { if (open && !leaving && !I.active) leave(); },
    });
    // the camera waits in the dark just short of the first exhibit, which flies in as the loading screen fades
    const cam = game.camera;
    cam.set({ target: [0, MUSEUM_Y, 0], dist: 140, yaw: .5, pitch: .3 });
    open = !!I.museum(startKey());
    if (!open) console.error('museum: the first exhibit did not open');
    // already in the dark: the map below never shows (in a match the world dims as Inspect opens)
    else if (I.state) I.state.worldK = 1;
    return sys;
  },
};
