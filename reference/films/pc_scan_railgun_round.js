/* SCAN · RAILGUN round: the long-rod probe (window.RGR). Shared by the magazine (fabrication), the loader, the bore,
   the flight and the shatter. Not set (no window.RGR.draw): the film draws its old short round.
   Spec (round frame: +Z the nose, origin at the middle of the rod; metres):
     ROD_LEN 2.0, ROD_R .0125 (tungsten long rod, 19 kg), fins at the tail (span .07), a nose cone .12 long;
     SAB_LEN 1.1, SAB_R .14 (three segments round the middle of the rod, z -.62 .. .48: they fill the bore between the
     rails, ±.14), the armature on the sabot's rear face (z -.62 .. -.70, its pads on the rail faces);
     LEN 2.0 overall (the rod), REAR -1.0 (the tail), NOSE 1.0.
   API: RGR.build(rctx); RGR.draw(Lw, Ls, e, o, glow, rctx) (e: the exploded view 0..1, o: drawX options, glow: the
   circuit lines lit 0..1); RGR.LINES (the engraved circuit lines as polylines in the round frame, for FX). */
(function () {
'use strict';
window.RGR = { ROD_LEN: 2.0, ROD_R: .0125, SAB_LEN: 1.1, SAB_R: .14, SAB_Z0: -.62, SAB_Z1: .48, LEN: 2.0, REAR: -1.0, NOSE: 1.0, LINES: [] };
})();
