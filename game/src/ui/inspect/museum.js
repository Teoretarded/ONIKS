/* The Anatomy browser (sandbox): every model key, units first, then munitions and structures, shown one at a
   time in dark space in the Inspect view, like a museum walk. attachPaletteRow() adds an "Anatomy" row to the
   sandbox palette (game/sandbox.js re-renders its DOM, so the row is put back whenever it goes). */

export const MUSEUM = [
  ['Coast', ['tel', 'transloader', 'radar', 'pantsir', 'drone', 'catapult', 'hq']],
  ['Fleet', ['destroyer', 'carrier', 'helo', 'fighter']],
  ['Munitions', ['oniks', 'tlc', 'oniks_booster', 'pantsir_missile', 'sm6', 'mk72', 'mk41_can', 'strike_missile', 'essm', 'slam', 'hellfire', 'aam', 'shell']],
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
