/* SCAN · RAILGUN heat sink: the heat exchangers under the hull (window.RGK, window.RGKD, window.RGKR).
   RGK = { build(ctx), drawBase(T, ctx) } draws the sink in the base take (base time T); RGKD (deployed as the rails
   charge) and RGKR (the heat dumped into the sea on the way home) are inserts (see the insert contract in
   pc_scan_railgun_film.js). len 0: not spliced in. */
(function () {
'use strict';
window.RGKD = { len: 0 };
window.RGKR = { len: 0 };
})();
