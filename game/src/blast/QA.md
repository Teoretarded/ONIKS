# Blast QA: in-game ship hits (visual / performance)

Battery: `game/src/dev/blast_qa.js` (play.html?mode=sandbox&intro=0, 1600x900; `Q.start(ONIKS, { only })`, `Q.table()`).
Each case: fresh unit, the hit through the sim's own path with the sim's damage, 60 Hz game frames GPU-synced and timed,
stills at 1 s (`1s_a60`, `1s_b60`) and settled = solve done + 3 s (`set_a60`, `set_b60`, `set_d25`, `set_e12`,
`set_w300`) in `game/shots/qa/<case>_<tag>.png` (gitignored), from an exact eye / look view off the unit's pose.
Floating-dot check: `game/src/blast/qa.js` `check(O, { unit })` on the settled state (column "qa").
Status: OPEN / FIXED? (a fix landed, not re-tested) / PASS / WONTFIX. "run N" = seen again in that run.

## Defects (newest first)

| # | case | still | what's wrong | status |
|---|---|---|---|---|
| D54 | cg_deck | `qa_r26/cg_deck_set_d25`, `_set_e12` | CG broken by a forward deck hit: the torn ends are drawn with long vertical orange streaks (dozens, several m tall) rising from the break like rain / stretched dots, and a bright white sliver of hull (a shell strip) lies along the waterline outside the pieces (`_set_e12`, bottom right) | OPEN; run 27 (efc624d) same (`qa_r27/cg_deck_set_d25`, `_set_e12`) |
| D53 | lcs_side (run 25) | (exception) | Intermittent crash in a frame: `TypeError: undefined is not iterable` at engine/terrain.js `rangeOver` (`const [w, h] = P.dims[k]`), from Terrain.prepare / Renderer.begin, during a still of lcs_side (the ship lost and breaking up). A NaN rectangle gives `k = NaN` (Math.ceil(Math.log2(NaN))) and `P.dims[NaN]` is undefined: a NaN camera or frustum from a pose. A re-run of the case did not repeat it. Suggest a guard in rangeOver (non-finite input -> the full range) and finding the NaN pose (structure pieces?) | OPEN (engine / break-up); FIXED? (blast implementer): Terrain.rangeOver returns the full height range for a rectangle with a NaN in it (no throw), and blast_qa's exact view refuses a pose with a NaN (no NaN eye from the QA); the NaN pose itself (a unit lost as it breaks up: game.unitPose / structure.poseAt) is not traced |
| D52 | ddg_stern | `qa_r22/ddg_stern_set_d25`, `_set_e12` | Stern quarter: the side plating round the hole is drawn as a flat translucent salmon-pink sheet (a large shaded quad through which the interior shows), with a row of black squares along its lower edge: a flap / patch surface drawn wrong | OPEN |
| D51 | ddg_spy | (numbers), `qa_r21/ddg_spy_set_e12` | Regression at 65c0e09: the sim now books a 2.1 m2 hole for the SPY-face Oniks hit (r20: 41.6) while the picture tears 44 m2 (the bridge front blown open): the flooding / systems side under-counts; qa.js 5 resting-air | PASS; run 22 (1a69db6): ddg_spy sim 41.6 / picture 46.1 again |
| D50 | ddg_bow | `qa_r20/ddg_bow_set_d25`, `_set_e12` | Bow side (Oniks inside): the picture tears 5.5 m2 (runs 12-20) against the sim's 33.5: the side shows dented, faceted plating and fires on the deck edge but only a small opening at the top; the sim floods through a hole the player cannot see | PASS; run 22 (1a69db6): ddg_bow picture 36.3 / sim 33.5: a large ragged hole with scorched rim and the frames inside (`qa_r22/ddg_bow_set_e12`) |
| D49 | ddg_mid | `qa_r20/ddg_mid_set_d25`, `_set_e12` | Regression with c7c9d89 (the shorter solves): ddg_mid's picture tears 11.2 m2 (runs 15-19: 21.4) against the sim's ~21: the hole is a small dark smudge under a lattice of interior lines, barely readable from 25 m, while two flame columns stand on the deck edge above intact plating | OPEN; run 21 (65c0e09): ddg_mid picture 12.4 m2 vs sim 8.0: now the sim's hole is smaller too; the hole is still a small dark patch under a lattice of interior lines (`qa_r21/ddg_mid_set_e12`); run 22 (1a69db6): ddg_mid picture 57 m2 vs sim 8.9: now the picture is 6x the sim's hole, a wide opening across two deck levels (`qa_r22/ddg_mid_set_e12`); run 24: ddg_mid 52 / 8.3, ddg_fdeck 125 / 43, ddg_stern 90 / 48, ddg_spy 82 / 42, ddg_sheer 78 / 16, cg_deck 132 / 33: the picture larger than the sim on every big inside hit |
| D48 | ddg_wl | `qa_r19/ddg_wl_set_d25`, `_set_e12` | The waterline hole (17 m2) reads as a lattice of bright horizontal / vertical interior lines (decks, frames) over a dark patch, its outline soft and faint: from 25 m it is hard to see that the side is open | PASS; run 25 (25433c7): the waterline hole reads from 25 m: a dark ragged arch with a light torn rim, water inside it (`qa_r25/ddg_wl_set_d25`, `_set_e12`); run 27 (c804402): white churn at the waterline hole's lower lip, water pouring in (`qa_r27/ddg_wl_set_e12`): reads well |
| D47 | ddg_sheer | `qa_r18/ddg_sheer_set_d25`, `_set_e12` | The new sheer-strake case: long salmon-pink wedges (petals / the deck edge's sheer line) splay out 8-10 m from the hole along the hull like fans of stretched dots; the deck edge beyond reads as a pink bar, not plating | REOPENED; QA confirm run 23 (c9eb75c): fewer, but thin bright rays still leave the hole's left rim along the deck edge (`qa_r23/ddg_sheer_set_e12`); run 24 (e03b0c4): the fan along the deck edge is mostly gone, one thin ray left off the hole's left rim (`qa_r24/ddg_sheer_set_e12`); a jagged glowing orange outline now traces the lower hole |
| D46 | cvn_island | `qa_r16/cvn_island_set_d25`, `_set_e12` | Island hit (5c3f8e3 superstructure scantlings): the island's lower wall is cut into straight-edged rectangular panels with black gaps between them and a clean rectangular window onto an interior grid; the flight deck strip beside the island is tinted bright lime (the own-side / scan colour on plain deck). Torn area still 0.8 m2 against the sim's 28 | PARTIAL; run 18: the panels read as torn now (ragged rim), but the lime tint on the flight deck strip by the island remains (`qa_r18/cvn_island_set_d25`, `_set_e12`); implementer: the salmon strips are the island part itself: present on an unhit carrier (`qa51/fresh`), gone only with the `island` part hidden (`qa51/hide_island`); not damage (model/lighting) |
| D45 | ddg_vls | `qa14/ddg_vls_set_a60`, `_set_b60` | A whole deckhouse block (~10 x 6 m, clean faces and square edges) has tipped over the starboard side and hangs against the hull at ~40 deg, its lower edge at the waterline, 3 s after the solve: an intact box rather than torn structure; does it fall in and sink? | OPEN; run 15 (58e08ec crumpled facets): the block now lies flat on the water against the hull (`qa15/ddg_vls_set_b60`), faceted but still a whole box, not sinking 3 s on; implementer: the block was debris.js throwing the whole `stacks` module over a solved patch; parts over a blast patch are no longer thrown whole (only the blast system tears them): run qa41 ddg_vls has only the boats module left; run 17 (8d1c2e7): still a whole box (~10 x 6 m) hanging against the starboard side at ~40 deg (`qa_r17/ddg_vls_set_a60`, `_set_b60`): if this is the boats module (RHIB + davit block), it is drawn as a closed box the size of a deckhouse and should read as a boat / davit, or break and sink; run 18 same: the ~10 x 6 m box still hangs against the starboard side (`qa_r18/ddg_vls_set_a60`, `_set_b60`); run 21 (65c0e09): the box still hangs against the starboard side (`qa_r21/ddg_vls_set_a60`); new: a tall bright-white clean slab (a stack face?) stands up out of the hole (`qa_r21/ddg_vls_set_d25`, `_set_e12`) |
| D44 | ddg_hangar | `qa11/ddg_hangar_set_d25`, `_set_e12` | New with the petals (7516007 / 618c6d9): long straight hairlines radiating outward from the hangar opening in a fan over both sides and the sky (tens of rays, 5-15 m long): stretched petal dots / splats flung to far positions. Also ddg_spy's bridge shows a few such straight streaks (`qa11/ddg_spy_set_e12`, upper right) | PARTIAL; run 19 (4d84aaa): the hangar's petals now short, crumpled and scorched round a ragged opening (`qa_r19/ddg_hangar_set_e12`); one straight curved ribbon still reaches from the port rim to the left edge of the frame |
| D43 | ddg_mid, cvn_side | `qa8/ddg_mid_set_e12`, `qa8/cvn_side_set_e12` | The holes the sim now opens on the skin (618660a) are filled with a regular lattice of dark crosses with orange rims (a grid ~0.5 m pitch) instead of an open hole with the interior behind: reads as a mesh screen / pattern; the outline is a cell staircase. ddg_mid also draws 42 m2 against the sim's 21 | PASS; run 14 (d198830): no lattice; a dark ragged opening, soft-edged (`qa14/ddg_mid_set_e12`); implementer: handed to the close-up agent (sub-texel fill / corner boxes) |
| D42 | cvn_side | `qa8/cvn_side_set_e12`, `_set_d25` | Round the carrier's side hole a regular lattice of short glowing orange dashes (frame and longitudinal lines lit in a grid ~2 m pitch) over intact plating, reaching ~15 m from the hole: reads as a pattern, not heat or scorch | PASS; QA confirm run 23 (c9eb75c): ragged scorched hole, no dash grid (`qa_r23/cvn_side_set_e12`) |
| D41 | ddg_wl_ff | `qa7/ddg_wl_ff_hud.png` | Engagement log lines run past the panel's right edge and are cut mid-word ('HOLED BELOW TH', 'REFRIGERATED STOR', 'SCAN SONAR C') | PASS; QA re-check run 20 (c7c9d89): log lines wrap (`qa_r20/ddg_wl_ff_hud.png`) |
| D40 | ddg_wl_ff | `qa7/ddg_wl_ff_xray.png` | X-ray after a hit forward (z +20, REF6 / BTH6 / AMR1 flooding, GTG1, SWBD1 out): the view frames the stern; the tags list STERN · FLIGHT DECK and SHAFTS x2 as DESTROYED (the sim has neither out) and nothing of the flooded spaces or the systems out; three tags are garbled glyph runs ('UPTA x x x.x . - . \|. \| \|', '7 : : - -', 'LM250 = = \ \ \ + + +', 'MK 41 VLS . =+') | OPEN (systems / interior UI); run 8 same: X-ray frames the stern and tags 'STERN · - \|- \| \| REOPENED; QA re-check run 20 (c7c9d89): the X-ray still frames the aft half (flight deck, VLS aft, shafts) after the forward hit, the hurt forward spaces untagged; garbled tags 'UPTA x x x', '7 : : -', 'LM250 = = \ \' still there (`qa_r20/ddg_wl_ff_xray.png`); FIXED? (framing; structure agent): Inspect frames a hurt ship from the side she was holed on, a quarter view from the end nearer the damage (abeam for a hit amidships), the fit measured from there, and the X-ray slice runs from the end nearer the damage (a fore-half hit opens from the bow): ddg_wl_ff opens on the starboard bow, tags CIC / VLS FWD / Mk 45 / magazines / bow (`qa_d40/ddg_wl_ff_xray`); ddg_stern still from the stern (`qa_d40/ddg_stern_xray`). The garbled tags are not touched; structure agent (2): the garbled tags were the reveal's condense (0.9 s a tag), shot while the slice was still running; no stuck state. blast_qa.js now leaves the X-ray on (X only if it is off), waits for the slice to finish plus 1.25 s: all tags read (UPTAKES x2, LM2500 x4, the flooded spaces) (`qa_d10e/ddg_wl_ff_xray`) |
| D39 | ddg_mid | `qa5/ddg_mid_set_d25`, `_set_e12` | Oniks inside amidships (120 kg TNT-eq, delayed fuze) now tears 2.7 m2: a thin horizontal slit ~12 m long along a longitudinal, with the frames glowing through: reads as a crack, not the blown-out hole the sim books (11 m2) and the charge makes (run 4: 59 m2) | OPEN; run 6: ddg_mid now tears 0 (no slit either); CLOSED (implementer): ddg_mid erodes 21 m2 and bends 94 m2 open, a blown-out hole (`qa48/ddg_mid_set_d25`) |
| D38 | ddg_vls | `qa5/ddg_vls_set_a60`, `_set_b60`, `_set_d25` | Black silhouettes: after the aft-VLS deck hit, the stacks and deckhouse blocks by the hole are drawn as flat black shapes with no dots (their depth kept, their dots dropped), hiding what is behind them. qa.js: 107 `big-piece` flags (ddg_vls), 26 on lcs_side | REOPENED; QA re-check run 20 (c7c9d89): the two stacks still drawn near-black from the b60 angle (`qa_r20/ddg_vls_set_b60`); implementer (`qa63/vls_on` vs `vls_noblast`): the dark stack face is its shadow side at night, the same as the deckhouse faces beside it with the blast off; lighting, not damage; implementer (`qa66/vls_unhit` vs `qa66/vls_on`, same view): the stack is as dark on an unhit ship: night shading, not damage; CLOSED |
| D37 | all DDG cases | `qa5/ddg_wl_set_a60`, `_1s_b60`, `qa5/ddg_mid_1s_a60` | New since the interiors (b044a49 / b959230): a grid of thin white lines on the intact hull side (verticals every few frames, a horizontal at the 4th deck / waterline) and on the deckhouse: the interior's bulkheads, decks and outfit drawn through intact plating (Inspect off, X-ray off); in `qa5/ddg_mid_set_d25` they hang below the waterline under the hull. Also a davit-like upright piece standing in the water against the hull (`qa5/ddg_wl_set_e12`) | REOPENED; QA re-check run 20 (c7c9d89): interior deck / frame lines still cross the intact side round ddg_mid's hole (`qa_r20/ddg_mid_set_e12`); run 21 (65c0e09): same round ddg_mid; implementer (`qa66/mid_wide`): intact side round ddg_mid's hole shows no interior lines; the interior is seen only through the hole; CLOSED |
| D36 | ddg_wl_ff | `qa4/ddg_wl_ff_inspect.png`, `_hud.png` | Systems not reported: 180 s after the hit (9 systems out incl. engine room 1, GTG1, SWBD1, fire pumps; 6 spaces wet, sink 1.1 m, speed cap) the Inspect panel shows only the class card (speed 0.0 kn, mass, no damage, no systems out, no flooding, no list); the HUD likewise. (The systems agent's ui/inspect.js and hud/log.js are still uncommitted: re-check when they land.) Also `inspect.close()` left Inspect open for the plain HUD still | PASS; run 8 (a7bfd3e): Inspect's readout lists hull / spaces / WT bulkheads / Zebra / doors, water 2105 m3 in 3, sink .95 m, list 1.0, trim -0.7, GM, power SB1x, speed 18 kn, systems 70 / lit 52 / out 16 with the names and causes, capabilities lost (`qa8/ddg_wl_ff_inspect.png`) |
| D35 | ddg_wl_ff | (sim state, 180 s after) | Systems: fires listed burning in REF6 (Refrigerated stores) while REF6 is 100 % flooded; `system engF out why 'frag'` and an AMR1 'fire' + 'fireout' in the same tick ~80 s after the only hit (no new hit event): a late fragment knock-out / fire flicker from nothing | PASS; run 5: no fire left in flooded spaces, no late knock-outs in 180 s |
| D34 | ddg_below, ddg_wl_ff | (sim state) | Flooding spread: PASS on the sim's side. ddg_wl_ff: sea holes in REF6 / BTH6 / AMR1, water reaches only the spaces behind torn boundaries (REF6>FO6, >ST5, AMR1>REF6, BTH6>REF6) and MER1 later (43 %), 53 doors open at the hit, 9 after general quarters; sink 1.14 m, trim -0.9 deg after 180 s; ddg_below: MER2 holed 37.8 m2 at y -1.1, floods to 65 % in 180 s and stays in MER2, engines, GTG2, SWBD2, lube, CPP out | PASS (sim) |
| D33 | ddg_below, ddg_wl_ff, all side hits | `qa4/ddg_below_set_d25`, `qa4/ddg_wl_ff_set_e12` | Sim and picture disagree: the sim's ship model makes a 37.8 m2 sea hole (ddg_below) and three sea holes 10-19 m2 (ddg_wl_ff) while the blast solver tears 0 m2 there and the side is intact in the stills. The player sees an intact hull flooding. Either the solver has to tear what the sim holes (the same charge on the same plating) or the sim's hole should come from the solver (structure.refine) | PASS; run 18 (f9aaf5a): cvn_island now 27 / 28 m2: every case's picture matches the sim |
| D32 | ddg_wl_ff | `qa4/ddg_wl_ff_ff180_w300` | (battery) after 180 s run ahead the unit is gone (hp 30, flood .046 before): sunk by the flooding, or taken by the sandbox's own enemies during the fast-forward? Need a quiet map spot / AI off for the flooding cases | FIXED in battery: the spot is now 3 km beyond the fleet ship furthest from the coast side; the ship lives the 180 s |
| D31 | ddg_below | `qa4/ddg_below_set_d25`, `_ff180_a60` | Flooding case: aimed 1.2 m under the water, lands at y 0.1 (good), but the Oniks tears nothing (torn 0, below 0) and the side shows no hole; the sim still floods (.05 -> .11 over 180 s) and engF / engA 100 %: flooding and machinery loss with no hole to show for it, and nothing for the torn-bulkhead / open-door spread to work from | PASS; QA re-check run 20 (c7c9d89): ddg_below picture 21.4 / sim ~20 m2, a hole under the waterline |
| D30 | ddg_vls | `qa4/ddg_vls_set_a60`, `_set_b60` | A clean box module (sharp edges, flat faces) sits at the waterline against the starboard side beside the deck hole 3 s after the solve: debris module (boats?) not sinking or not torn | REOPENED; QA re-check run 20 (c7c9d89): the box against the starboard side is still there (same as D45, `qa_r20/ddg_vls_set_a60`); run 21 (65c0e09): same as D45 |
| D29 | ddg_stern | `qa4/ddg_stern_set_a60`, `_set_d25`, `_set_e12` | Aimed at the starboard quarter (9, 3, -70), the round lands on the flight deck centreline (0.3, 5.8, -54.9); one Oniks and the ship is lost (torn 0, a big orange glow over the stern). The flight deck's plating is smeared into long bright streaks flowing aft (stretched dots) | OPEN; CLOSED (implementer): lands where aimed (8.7, 3.2, -70.1), side hole with a curled flap and interior (`qa48/ddg_stern_set_d25`), no aft streaks |
| D28 | lhd_deck | `qa3/lhd_deck_set_d25`, `_set_e12` | Oniks into the 20 mm flight deck: 9.4 m2 torn shows as three small square pits with flat-topped fire columns, arranged in a row: brittle, square cell holes, no petals, no lifted / dished deck round them | OPEN; implementer: no square pits in a row in `qa48/lhd_deck_set_d25` (petals); the hole is dim at d25; CLOSED for the pits |
| D27 | ddg_30mm | `qa3/ddg_30mm_set_e12` | PASS: 30 mm burst leaves ringed pockmarks at the hits, nothing floating | PASS |
| D26 | ddg_vls | (numbers) | Stutter: the aft-VLS hit that chains to a cook-off and loses the ship solves 15.5 s with frame p95 42.8 ms (p50 11.5); every other case p95 <= 26 ms | OPEN; run 4: the aft-VLS hit no longer chains a cook-off (resolve 2.25 s, p95 7.9 ms): PASS for this case; the forward cook-off case solves 7.3 s at p95 18 ms; run qa36 (petals on, loaded machine): ddg_vls 4.55 s, ddg_cookoff 5.25 s, qa ok |
| D25 | ddg_hangar | `ddg_hangar_set_a60`, `_set_b60` | The round lands on the flight deck (hit point [0, 5.7, -60.3]; the hangar face is at z -53) and the whole flight-deck block aft of the hangar (~20 m of the ship: deck, transom, both sides) comes away as one clean box, displaced aft and down with a gap to the rest: loose-piece logic (support.js?) takes the stern as unsupported. qa.js: 20 floating dots (hull, [8.75, .43, -51.9]) | PASS; QA confirm run 23 (c9eb75c): new case ddg_fdeck (Oniks diving onto the flight deck at z -62, viewed from astern): the deck is blown into a pit with ragged curled edges and fires inside, the stern block stays on (`qa_r23/ddg_fdeck_set_a60`, `_set_d25`); qa.js ok. Picture 125 m2 vs sim 42.9 (as D49: the picture larger than the sim's hole); a lime tint on the port hull side by the hole (`_set_a60`, as D46) |
| D24 | ddg_hangar | `ddg_hangar_set_e12` | The hangar front shows dark vertical streaks / curtains from the roof down (dots stretched or strips left standing) | OPEN; CLOSED (implementer, `qa48/ddg_hangar_set_e12`): no vertical curtains; the dark blocks inside the hangar are the close-up agent's (depth splats) |
| D23 | ddg_mid, ddg_breakup, lcs_kh35 | `ddg_mid_set_e12` (crop), `ddg_breakup_set_d25`, `lcs_kh35_set_d25` | Pieces of superstructure over / beside the hole stay as clean flat-shaded panels and boxes with ruler-straight edges (a folded pair of white panels with a curled ribbon standing on the deck edge in ddg_mid; a pristine small deckhouse over the hole in ddg_breakup; a staircase-notched black cut in the LCS bridge block): read as cardboard / model parts, not torn steel | REOPENED; QA confirm run 23 (c9eb75c): still a clean white vertical slab standing on the deck edge over ddg_mid's hole, upper right of `qa_r23/ddg_mid_set_e12`; run 24 same: the white slab still stands on the deck edge over the hole, now with a stepped / notched edge (`qa_r24/ddg_mid_set_e12`); run 26 (1b1a5ee): the white slab still stands on the deck edge over ddg_mid's hole (`qa_r26/ddg_mid_set_e12`) |
| D22 | ddg_mid, ddg_breakup, lcs_kh35 | `ddg_mid_set_e12`, `ddg_breakup_set_e12`, `lcs_kh35_set_d25` | Floating dots missed by qa.js: the deck edge (the pink sheer line of dots) runs straight across the top of the hole with no plating under it (qa.js: ok) | PASS; QA confirm run 23 (c9eb75c): the sheer strake stands intact over ddg_mid's side hole with the deck behind it (`qa_r23/ddg_mid_set_d25`): no plating-less line now |
| D21 | ddg_gundeck | `ddg_gundeck_set_d25`, `_set_e12` | Deck hole by the gun: a large clean parallelogram, straight edges, black void under it (no deck below, no frames, no interior); the bow beyond stands with a clean vertical cut face | OPEN; CLOSED (implementer, `qa48/ddg_gundeck_set_d25`): a ragged torn deck hole with wreck and interior under it, no clean parallelogram |
| D20 | cvn_deck | `cvn_deck_set_d25` | Four flame tongues burn on intact flight deck (no hole, no dent, no scorch): damage not readable | OPEN (with D16); FIXED? (structure agent): the flames were the scars fire's first seats, set from the pre-solve estimate on a rim 1.2-1.45 x the estimated radius (~5 m out on intact deck round a ~3 m hole); scars.js now draws a solved mark's seats in onto the torn rim once the torn area is known (never on the plating round the hole) and puts the fire out when the solve tore no skin (`qa_d20a/cvn_deck_set_d25` before, `qa_d20c/cvn_deck_set_d25` after); note (structure agent): the second small fire on the carrier (bow, z 151) is a sim hole: sim/ship.js books a 1.3 m2 hole in GALF at (0, 19.3, 151), a boundary of the same long gallery-deck space 72 m from the hit, and blast/system.js simHoles paints it via scars.holeAt with a side normal (1, 0, 0) on the flight deck: owner sim/ship.js (a hole that far from the charge should not be booked) / blast simHoles (normal) |
| D19 | cvn_side | `cvn_side_set_a60` | (battery) the side case hit the open elevator bay (the round lands on the hangar deck inside): moved to z 110 | FIXED in battery |
| D18 | ddg_bow, ddg_wl, ddg_mid, ddg_hangar | `ddg_bow_set_b60`, `ddg_bow_set_d25`, `ddg_wl_set_d25` | Identified D6: long rods / poles in the sea by the hull, some upright with a bulb at the bottom (ddg_bow b60: a pole standing vertical in the water 20 m off the bow; d25: a rod leaning from the water onto the bow), U-shaped frames hanging under the waterline (ddg_wl d25): debris bodies (the round's sections or the jackstaff / davits?) standing or hovering at the waterline, not sinking. qa.js does not flag them | PASS; run 19 (7911a6d): no davit / machinery standing in the sea under the ddg_wl or ddg_mid holes (`qa_r19/ddg_wl_set_d25`) |
| D17 | all side cases | (hit points) | Hits move up the side: aimed at y 0.8 / 4 / 5 / 6 on the DDG, they land at y 3.2 / 6.4 / 6.7 / 6.5 (the deck edge is ~7): `ddg_wl` is never a waterline hit, nothing tears under the water (`below` 0 in every case, so no hole ever floods). scars.js carrying the hit onto the sampled surface, or the battery's `from`? The impact tester's waterline preset should be checked the same way | PASS; QA confirm run 23 (c9eb75c): hits land where aimed (ddg_wl y 0.8 -> 0.8, ddg_doors_* y -1.2 -> -1.2, ddg_stern 3.2) |
| D16 | cvn_side, cvn_deck, cvn_island | `cvn_island_set_d25`, `_set_e12` | Carrier: an Oniks (120 kg TNT-eq, inside) makes no hole anywhere: torn 0 on the side (22 mm), the flight deck (45 mm) and the island's face (10 mm), set 0.09-0.34 m; the island face is untouched while fires burn on its roof. At least the island and the side should tear | PASS; run 18: the island tears (27 m2, a ragged scorched hole at its base, `qa_r18/cvn_island_set_e12`) |
| D15 | battery | - | (tool) the orbit camera rides its target on the sea surface and tilts up when low: close stills were aimed at the waterline / horizon (run 1's `d25`, `e12`, and the carrier's views are not usable). Stills now use an exact eye / look view from the unit's pose | FIXED in battery |
| D14 | all Oniks / Kh-35 cases | (numbers) | Systems: every Oniks hit sets sim flooding to 0.32 (Kh-35 0.14) whatever the hole: `ddg_mid`, `ddg_bow`, `ddg_spy` (a hit on the deckhouse at 14 m up) all flood the same, while the solved torn area below the waterline (`below`) is 0 in every case, `ddg_wl` included. Flooding does not come from holes under the water. | PASS; QA confirm run 23 (c9eb75c): new cases ddg_doors_open / ddg_doors_shut (the same Oniks 1.2 m under the water into MER2, every door forced open / shut, 180 s run ahead): doors shut: water stays in MER2 (71 %), sink 0.85 m, list 3.1 deg; doors open: 17 spaces wet (AMR1 / AMR2, MER1, double bottoms DB5P-DB10P, VLSA, stores, berthing), sink 2.0 m, list 6.1 deg. Spread through open doors, held by shut ones |
| D13 | ddg_breakup | `ddg_breakup_set_a60`, `_set_d25` | An Oniks hit that kills the ship (dmg 999) leaves no hole at all: blast `torn` 0, `set` 0.48 m, plating intact at the hit 12 s later; no break-up by then either | run 2 (settle 40 s): a hole now (42.9 m2), the ship sits low, still no break-up at 40 s (dieTime 60). Hole part PASS; a pristine box over the hole: D23 |
| D12 | ddg_wl | `ddg_wl_set_d25`, `_set_e12` | Oniks (120 kg TNT-eq, delayed fuze) at the waterline: torn 0.06 m2, set 0.52 m; the side shows no hole, only an orange cross of frame lines glowing through intact plating, and flames standing on the deck edge above an intact side. Not plausible for the charge; damage not readable | PASS; run 8: a hole at the waterline now (18.9 m2) |
| D11 | ddg_cookoff | `ddg_cookoff_set_a60` (top middle), `_set_b60` (right of the deckhouse) | After the break at the forward VLS, a comb of charred / flame-lit vertical spikes hangs in the air where the patch was, detached from both hull pieces: the blast's inner-structure dots (or its fire seats) do not follow the structure pieces | PASS; run 26 (1b1a5ee): the cook-off now holds together (bow bent down at the break, not separated, by 20 s): no flame combs hanging over the water (`qa_r26/ddg_cookoff_set_b60`); the CG broken by a deck hit shows none either (`qa_r26/cg_deck_set_b60`) |
| D10 | ddg_cookoff | `ddg_cookoff_set_d25`, `_set_e12` | The torn ends of the two hull pieces are a very regular sawtooth (equal triangles), reads artificial next to the solver's ragged holes | PASS; run 26 (1b1a5ee): no sawtooth end in view (the bow did not separate within the settle window); the torn edge at the bend is ragged plating (`qa_r26/ddg_cookoff_set_d25`) |
| D9 | ddg_vls | `ddg_vls_set_a60`, `_set_b60`, `_set_d25` | Oniks into the aft VLS chains a cook-off and the ship is lost: a whole deckhouse block (clean box, intact edges) rests on the sea apart from the hull pieces, flat and level, not sinking | OPEN; run 2 same, plus inverted-U frames (davits?) standing in the air over the water with nothing under them (`ddg_vls_set_d25` top right, `_set_b60`) and the charred-spike combs of D11 beside the pieces |
| D8 | ddg_hangar | `ddg_hangar_set_a60`, `_set_d25`, `_set_e12` | Hangar face (aluminium, 120 kg TNT-eq): reads as lace, a scribble of orange-rimmed small holes with islands of intact plating between them, no blown-in door, no bent petals; the hangar behind is black (nothing inside) | run 2: superseded by D24 / D25 (the hit lands on the flight deck); run 4: the round now lands on the hangar face (z -52.9): 4-5 separate cell-shaped windows with vertical strips of intact plating between them (`qa4/ddg_hangar_set_e12`): the lace look is back; run 11: the hangar face is blown open, the hangar's interior (the helo, racks, deck) visible behind it (`qa11/ddg_hangar_set_e12`): lace look PASS; see D44 |
| D7 | ddg_hangar | `ddg_hangar_set_d25` | Thin vertical lines hang from the transom into the sea, and a small upright object stands on the water behind her | see D18 |
| D6 | ddg_mid, ddg_wl, ddg_spy | `ddg_mid_set_d25` (left, at the waterline), `ddg_wl_set_d25` (under the hit), `ddg_spy_set_a60` (left) | An upright thin object (a pole with a lamp-like head, a few m tall) stands on the water next to the hull under / near the hit in every side case, still there when settled: debris (the round's body?) hovering upright on the water | see D18 |
| D5 | ddg_gundeck | `ddg_gundeck_1s_a60` | Deck hole at 1 s is a clean rectangle (straight edges, square corners, orange outline): cell-shaped, brittle look; no petals turned up | OPEN; run 2 same at 1 s, settled: D21; run 11: see D21; implementer: petals on by default (flaps curl during the solve) |
| D4 | ddg_mid | `ddg_mid_set_d25`, `ddg_mid_set_a60` | A pristine block of the deckhouse's lower wall (bright, flat-shaded, sharp edges) sits over the hole with nothing under it: the deckhouse plating is not part of the patch and stays whole while the hull plating it stands on is gone | run 2: the block now comes down as loose panels, see D23 |
| D3 | ddg_mid, ddg_bow | `ddg_mid_set_d25`, `ddg_bow_set_e12` | Through the hole the sea / horizon is seen (blue-grey sea dots at the bottom of the hole): the model's surfaces across the pocket are culled and the far side of the hull goes with them: see-through ship | PASS; QA confirm run 23 (c9eb75c): no sea through any hole (`qa_r23/ddg_mid_set_e12`, `ddg_bow_set_e12`) |
| D2 | ddg_bow, ddg_mid | `ddg_bow_set_a60` (crop), `ddg_bow_set_e12`, `ddg_mid_set_e12` | Hole outline is a set of separate rounded-rectangle windows with strips of intact plating between them (cell-shaped holes, blocky orange rims); grey plating dots still cover much of the hole over the lit interior; fire-lit deck floors inside are hard-edged bright rectangles | OPEN; run 2: ddg_bow a scatter of small square windows along glowing frame lines (`ddg_bow_set_e12`); ddg_mid / cg_side / lcs_kh35 outlines are cell staircases with orange blobs on every step; run 4 same (`qa4/ddg_mid_set_e12`, `qa4/ddg_house_set_e12`: black rectangular slots in the deckhouse roof with bright flat panels between them); run 5: ddg_stern a row of small square / round holes strung along a glowing longitudinal (`qa5/ddg_stern_set_e12`); run 10: ddg_stern still separate square windows strung along a glowing longitudinal (`qa10/ddg_stern_set_e12`); implementer: d8c4198 (hole outline from the interpolated torn field, ragged); petals on by default (618c6d9 / 678b2a4); REOPENED (implementer, `qa44/bow_noint`): on ddg_bow the large bent flap is peppered with sharp dark ~0.5 m squares; the skin texels show no isolated torn cells there (1 of 190), so they are not holes: likely the petal splits drawn from one texel per node (cells on either side of a crack share the texel) or the close-up depth splats; handed to the close-up agent / next round |
| D1 | battery | - | (tool) 25 m / 12 m close views aimed at the patch origin (`spec.frame.O`), which is not the hole: now aimed at `scars.last(id)` | FIXED in battery |

## Open items (implementer pass after run qa67, owners)

| # | what | owner | note |
|---|---|---|---|
| D2 | dark squares on bent flaps (ddg_bow) | close-up agent | petal drawing / depth splats |
| D43 | lattice / sub-texel fill in holes | close-up agent | |
| D44 | a long curved ribbon from the hangar's port rim; tent-like flaps with straight ribs (`qa67/ddg_hangar_set_d25`) | close-up agent | petal flap drawing (the solver's reach is capped at ~3 m drawn) |
| D47 | thin ray from ddg_sheer's flap rim | close-up agent | petal edge drawn along its stretch |
| D52 | ddg_stern flap drawn as a shaded quad with black squares | close-up agent | |
| D10, D11, D40 | break-end tear, break-up fires, X-ray framing | break-up / inspect agent | |
| D45 | white slab standing out of ddg_vls's hole (run 21, 65c0e09) | blast (me) | FIXED? rechecked at HEAD (qa69 / qa70 `ddg_vls_set_d25`, `_a60`, `_b60`): no slab, no tipped block |
| D48 | waterline hole faint from 25 m | blast (me) | FIXED? the sea now pours in while the space fills (blast/system.js drawInrush: from the sim's head across the hole, sea outside over S.H inside; a white churn at the opening, a foaming sheet over the lip falling inward, spray where it lands; gone once the levels meet), `qa71/ddg_wl_set_d25`, `_e12`; earlier: the cold torn rim is a light bare-steel line (a plateau 0.3 m wide, not a fade), soot greys the plating round it instead of blacking it out; the sim hole (19 m2, y 1.1) is mostly below the waterline, so from 25 m it is the upper rim that reads (`qa69` vs `qa70c/ddg_wl_set_d25`) |
| D49 | ddg_mid picture 57 m2 vs sim 8.9 | blast (me) | the solver's own tear (walls and decks now solved) is larger than the sim's; sim hole is the minimum shown, not a cap |
| D46 | salmon strips on the carrier island's top faces | engine / model lighting | present on an unhit carrier; not damage |
| D20 | flames on an intact carrier flight deck | scars fire (break-up / fx agent) |; note (structure agent): the second small fire on the carrier (bow, z 151) is a sim hole: sim/ship.js books a 1.3 m2 hole in GALF at (0, 19.3, 151), a boundary of the same long gallery-deck space 72 m from the hit, and blast/system.js simHoles paints it via scars.holeAt with a side normal (1, 0, 0) on the flight deck: owner sim/ship.js (a hole that far from the charge should not be booked) / blast simHoles (normal); FIXED? (blast implementer): the far hole was the entry punch put in L.pair(space, AIR), which is any one of the space's boundaries to the air (here GALF's forward end); sim/ship.js now puts a hole in the space's outside boundary nearest the point (outK: the entry punch, the struck skin, a tear running on into the next space), the gas splits boundaries only within SHIPK.gasReach (4 m/kg^1/3) of the charge, tapering, and a space's shell hole goes in the nearest failed boundary; simHoles gives a deck-type sim hole an up/down normal. cvn_deck now books one hole, GALF (0, 18, 80) 28 m2, one fire at the hit (`qa72b/cvn_deck_set_w300`); tests.html 48/48 |
| D25 | flight-deck hit behind the hangar not in the battery | QA | needs a case |
| D14 | flooding spread through doors untested | systems / QA | |
| FIXED? | D3 D17 D22 D23 D42 D47 | QA to confirm | |

## Runs

### Run 27 (HEAD efc624d: loose pieces rest only on what holds them; c804402 the sea pours in at a waterline hole)

31 cases, qa.js ok on all, no errors. Resolve 0.9-2.8 s; synced p95 8.8-18.3 ms. The waterline hole now shows a white
churn of inflow. Open by eye: D23 (white slab), D49 (the picture larger than the sim), D54 (orange streaks at the CG's
break), D40 (X-ray framing), D44 / D52 (close-up petal drawing), D46 (lime tint).


### Run 26 (HEAD 1b1a5ee: torn faces show a web-frame cage; cb70475 slivers between torn cells tear away; b39c4eb halves settle at a real pace)

31 cases, qa.js ok on all, no errors. Resolve 0.9-2.95 s; synced p95 8.5-17.3 ms. D10, D11 PASS (the cook-off's bow now
bends down and holds within 20 s). New D54 (vertical orange streaks at the CG's break). D23, D49 unchanged.


### Run 25 (HEAD 25433c7: cold torn rims light, soot greys; 1b68f3c shell follows a thrown plate <= 0.4 m; 2a82be8 torn faces)

31 cases, qa.js ok on 30; lcs_side threw once in the renderer (D53; its re-run was clean, qa ok). Resolve 0.85-2.8 s;
synced p95 9.3-20 ms. D48 PASS. D49 / D23 unchanged.


### Run 24 (HEAD e03b0c4: skin stretch counted in every direction; f335672 orphans flown as pieces)

31 cases, qa.js ok on all. Resolve 0.95-2.8 s; synced p95 9.5-24.4 ms (ddg_hangar 24.4). D47 nearly gone (one ray);
D23 and D49 as before.


### Run 23 (HEAD c9eb75c: deckhouse walls solved as plates, break fires on the torn ends) + new cases

31 cases (ddg_fdeck, ddg_doors_open, ddg_doors_shut added); qa.js ok on all. Resolve 0.9-2.8 s; synced p95 7.7-18.7 ms.
FIXED? confirmed: D3, D17, D22, D42 PASS; D23, D47 reopened. D25 and D14 cases added and pass. D49 (the picture larger
than the sim: ddg_mid 69 / 8.2, ddg_fdeck 125 / 43, ddg_stern 84 / 48) is the main mismatch left.


- run qa73 (implementer: resting pieces must sit on something, D53 guard; 31 cases): 31/31 qa.js ok. Resolve 1.05-4.4 s, solve p95 11.8-25.1 ms (cg_deck 4.4 s / 25.1, cvn_island 24.2; other agents running). The ddg_spy flake (a small piece at rest 0.47 m over the deck, wedged on an edge): blast/support.js tryRest: a piece comes to rest (a slow landing, wedged, or held still half a second) only where its lowest points are within 0.25 m of the surface under them (the same measure as qa.js); held up on a thin edge it slides and tips off toward its free side, and one still caught after 1.5 s breaks up (under 400 dots) or settles onto what is under it. ddg_spy x2, house, gundeck, vls, hangar ok. Balance (sim/ship.js gas reach, nearest boundary): balance.html n=32 seed=17: coast 54% of 256 (50 / 41 / 53 / 56 / 69 / 41 / 56 / 63 by map), median 49.3 min.

- run qa72 (implementer: inrush, back faces culled away from patches, sim hole placement; 31 cases): 29/31 qa.js ok, ddg_spy 12 dots resting-air 0.47 m (the wedged-piece flake seen in qa64; ok on the rerun), lcs_side threw in engine/terrain.js rangeOver (D53; ok on the rerun, 5.15 s resolve). Resolve 1.1-4.4 s; solve p95 9.6-24.3 ms. cg_deck re-bench: resolve 2.65 s, p95 16.1 ms (was 4.2-5.05 s, 30-32 ms): a holed ship drew all its back faces (models.js skipped the back-face cull for any instance with a patch); now only within 40 m of a patch (post-solve cg_deck frame 16 -> 8.7 ms p50).

- run qa70 (implementer, D48 rim / soot change, 31 cases): 31/31 qa.js ok; resolve 1.15-3.8 s (cg_deck 5.05 under load), solve p95 11.7-24.1 ms (cg_deck 32.1, loaded: three other agents running). D45: no slab in `ddg_vls_set_*`.

- run qa68 (implementer): orphans flown as pieces after the support pass (settleSupport queues their columns): ddg_house, ddg_gundeck, ddg_cookoff qa.js ok with no orphans.

- run qa67 (implementer, f778b7e, petals on, 26 cases): 26/26 qa.js ok (orphans only: house 8); resolve 1.15-3.9 s; solve p95 11.2-24.6 ms (loaded).

- run qa64 (implementer, petals on, 26 cases, deckhouse walls as plates): 25/26 qa.js ok, ddg_spy 8 dots resting-air 0.48 m (small pieces wedged on an edge: now pushed off or broken up; qa65 ddg_spy ok); resolve 1.35-3.8 s.

### Run 22 (HEAD 1a69db6: sim holes painted whole on the patch's shell plate)

28 cases, qa.js ok on all. Resolve 0.9-2.75 s; synced p95 8.8-21.2 ms. D50 PASS (bow 36 / 33.5), D51 PASS (the SPY sim hole
back to 41.6). D49 flipped: ddg_mid draws 57 m2 against the sim's 8.9. New D52 (pink translucent sheet at the stern hole).


### Run 21 (HEAD 65c0e09: d29f474 hang safety, 631e2b5 structure past a deck plate's edge goes with it, 65c0e09 steep-bend tear-off)

28 cases; qa.js ok on 27, ddg_spy 5 resting-air. Resolve 0.95-2.7 s; synced p95 7.6-19.4 ms. Re-judged in the integration
agent's order: D30/D45 open (plus a clean white slab standing in the hole), D11 open, D49 open (the sim's own hole
shrank to 8 m2), D50 open, D37 open, D47 better but open, D48 not re-shot close (as r20), D10 open, D38 / D40 as r20. New
D51: the SPY hit's sim hole dropped to 2.1 m2.


- run qa58 (implementer, steep-bend tear/buckle rule, petals on, loaded machine: baselines 5.5-30 ms): 26/26 qa.js ok, no flags; resolve 1.1-3.8 s except cvn_island 14.2 (its baseline p95 29.8 ms: the frame guard backed off).

### Run 20 (HEAD c7c9d89: the frame guard cuts the solver back only on missed frames)

28 cases, qa.js ok on all. Resolve roughly halved: 0.85-2.65 s (run 19: 1.1-5.3) at the same frame cost (synced p95
8.8-18 ms, baseline 3.7-12). One regression: ddg_mid tears half what it did (D49). Otherwise as run 19.


- run qa54 (implementer, petals on, 26 cases, after the frame-guard fix): 26/26 qa.js ok (orphans only: gundeck 32, cookoff 5, stern 1); resolve 0.85-2.7 s (the guard cut the solver to 0.3 whenever frames ran past 17 ms, i.e. on vsync jitter: now only past ~24 ms); solve p95 7.7-16.5 ms (cvn_island 17.1).

### Run 19 (HEAD 4d84aaa: flaps crumple and scorch; 7911a6d interior under the water hidden outside a patch)

28 cases, qa.js ok on all. Resolve 1.1-4.3 s (lcs_side 5.3); synced p95 7.9-17 ms (baseline 3.3-13). D18 PASS, D44 better;
D47 worse (rays at the sheer strake); D48 new (waterline hole reads as a line lattice).


### Run 18 (HEAD f9aaf5a: interior hiding mirrored on the CPU, interior dots near a patch culled; ddg_sheer case added by the integration agent)

28 cases, qa.js ok on all. Resolve 1.2-4.3 s (lcs_side 5.2); synced p95 8-26 ms (baseline 3.6-12). Picture and sim
holes now agree on every case (the island 27 / 28: D33, D16 PASS). Still seen: D11 (spikes under the cook-off's torn end),
D37 (fewer interior lines), D45 (box on the side), D46 lime tint; new D47 (pink fans at the sheer strake).


- run qa50 (implementer): ddg_house, cvn_island (sim hole 28 m2 shown), lhd_deck (solve p95 12.1 ms, baseline 3.7): qa ok.

- run qa48 (implementer, e983fd8 + CPU interior-hiding mirror, petals on, 26 cases with ddg_sheer): 26/26 qa.js ok (orphans only: gundeck 5); resolve 1.15-4.45 s; solve p95 7.4-12.4 ms except cvn_island 17.7 and lhd_deck 21.9 (baselines 11.6 / 7.9).

### Run 17 (HEAD 02741f0: interior parts never ride as shell, hidden behind held plating; 8d1c2e7 debris not thrown whole over a patch)

qa.js ok on all 27. Resolve 1.2-4.3 s (cg_deck 5.8); synced p95 7.8-18.8 ms while solving (baseline 3.6-16.8). Holes
unchanged from run 16. D45 and D37 still seen.


### Run 16 (HEAD a73295e: superstructure scantlings, debris fill capped, buckled structure on bent decks; quiet)

qa.js ok on all 27. Resolve 1.1-4.3 s (cg_deck 5.8); synced p95 8-18.5 ms while solving (baseline 3.6-10.6). Deckhouse
hit opens onto its decks (`qa_r16/ddg_house_set_e12`). New: D46 (island cut into clean panels, lime-tinted deck).


- run qa40 (implementer, a73295e, petals on): 25/25 qa.js ok (orphans only: gundeck 7, cookoff 4); resolve 1.35-4.9 s except cvn_island 5.85 and lcs_side 5.6; cvn_island erodes 0.8 m2, bends 12 m2 (superstructure scantlings, 5c3f8e3).

### Run 15 (HEAD 54d89dc: wet spaces behind a hole shown, crumpled detached pieces, Inspect flies to holes)

(Another agent also writes `game/shots/qa15`: from run 16 the battery's folders are named `qa_rNN`.) qa.js ok on all 27.
GPU load from other tabs heavy (baselines p95 up to 29 ms; lhd_side p95 70 ms while solving). Resolve 1.3-4.5 s (cg_deck
6.0). The waterline hole reads well (a ragged arch open onto the flooded space, `qa15/ddg_wl_set_d25`). Open: D2, D11,
D16/D33 (island), D22, D23, D37, D38, D40, D41, D44, D45; D18 debris standing in the water.


- run qa36 (implementer, 58e08ec, petals v2 on, a loaded machine: baseline p95 7-1359 ms): 25/25 qa.js ok; resolve 1.45-5.25 s except lcs_side 6.05 (two patches) and cvn_island 7.7; torn (eroded) and flapM2 (bent open) now reported apart.

### Run 14 (HEAD 08960ea: detached pieces show damage, Inspect toward holes; a05fb7d cutaway tags; 340fada lit pieces; d198830 close-up splats)

qa.js ok on all 27. Resolve 1.2-4.4 s (cg_deck 5.8); synced p95 9-19.5 ms (baselines up to 29: load). D43 PASS, D40 and
D38 partial; D45 new (a whole deckhouse block tipped over the side). Run 13 (a05fb7d, just before 08960ea) looked the same.


### Run 12 (HEAD 1f403c9: petals v2, stiffener scorch)

qa.js ok on all 27. Resolve 1.2-4.4 s (cg_deck 5.8); synced p95 8.6-16 ms on the DDG / CG, 24-33 ms on lcs_kh35, lhd_side,
lhd_deck, cvn_island (their baselines 8-30: load). D42 PASS; D44 partial (the fan gone, over-long curled shreds instead).


### Run 11 (HEAD 618c6d9: petals ported and on)

qa.js ok on all 27 (cg_deck clean). Resolve 1-4.6 s (cookoff 7.6); synced p95 8.5-17.7 ms except ddg_vls 25.3 and
ddg_cookoff 28.6 while solving (two outlier baselines from other tabs: kh35, cvn_deck). Holes read better: ddg_mid opens
onto frames and a deck, the hangar face is blown open (D8 PASS, D43 partial); new fan of radiating hairlines round the
hangar hole (D44). Areas: spy 110.6 / 41.6, hangar 136.4 / 40.7 (the picture now well over the sim's).


### Run 10 (HEAD 632ff40: bench 03813d8 port, ragged hole outline, small edge splats; quiet machine)

Numbers as run 9 (resolve 1.2-4.6 s, cg_deck 8.5; synced p95 7.5-15 ms while solving, baseline 3.5-11). qa.js ok on 26,
cg_deck 2 floating. Picture / sim areas agree except cvn_island. No visual change to D43 (lattice fill), D2 (ddg_stern
windows), D22 (sheer line over the hole), D11, D37, D38 at this commit.


### Run 9 (HEAD 9fae471: analytic scar holes where no patch covers a sim hole; quiet machine)

Frames on a quiet machine: synced p95 7-20 ms while a hit solves (baseline 4-10), the cook-off 15 ms; resolve 1.3-4.4 s
(cg_deck 8.6). qa.js: ok on 26, cg_deck 9 `resting-air`. Picture / sim holes agree on 25 of 26 hull cases (D33: the carrier
island left). Open by eye: D2 / D43 (lattice-filled cell holes), D11 (flames in the air after a break), D22, D23, D30,
D37, D38, D40, D41, D42.

| case | resolve s | p50/p95 (base p95) | torn m2 picture / sim | qa |
|---|---|---|---|---|
| ddg_bow | 3.10 | 6.2/18.2 (15.9) | 23.6 / 33.5 | ok |
| ddg_mid | 2.85 | 6.4/19.9 (21.3) | 21.2 / 20.8 | ok |
| ddg_wl | 4.10 | 5.8/7.2 (4.6) | 19.0 / 19.3 | ok |
| ddg_gundeck | 2.65 | 5.5/8.8 (4.0) | 97.3 / 33.4 | ok |
| ddg_spy | 4.25 | 6.1/9.4 (4.6) | 73.4 / 41.6 | ok |
| ddg_house | 2.10 | 6.0/8.1 (4.4) | 28.6 / 23.3 | ok |
| ddg_mast | 1.25 | 5.2/9.3 (4.6) | 0.06 / 0 | ok |
| ddg_vls | 3.60 | 5.9/9.2 (6.3) | 195.3 / 16.6 | ok |
| ddg_hangar | 3.05 | 6.4/8.8 (5.6) | 60.5 / 40.6 | ok |
| ddg_stern | 2.40 | 5.5/7.4 (3.7) | 22.6 / 47.8 | ok |
| ddg_kh35 | 2.70 | 6.5/7.6 (5.3) | 13.5 / 14.6 | ok |
| ddg_sm6 | 1.50 | 5.3/9.1 (5.5) | 0.88 / 0 | ok |
| ddg_127 | 1.25 | 4.8/9.1 (4.5) | 0 / 0 | ok |
| ddg_30mm | - | 6.4/8.9 (7.6) | - | ok |
| ddg_cookoff | 4.40 | 11.0/15.3 | 241.7 / (lost) | ok |
| ddg_breakup | 3.15 | 5.1/7.7 (6.9) | 11.9 / 19.8 | ok |
| ddg_below | 3.55 | 6.4/8.1 (4.4) | 19.6 / 19.8 | ok |
| ddg_wl_ff | 3.40 | 8.4/10.1 (7.6) | 16.1 / 23.2 | ok |
| cg_side | 2.80 | 6.8/8.4 (7.1) | 11.7 / 13.3 | ok |
| cg_deck | 8.60 | 11.5/14.4 (6.1) | 173.5 / 29.2 (lost) | 9 resting-air |
| cvn_side | 3.50 | 9.1/11.3 (8.7) | 8.9 / 8.8 | ok |
| cvn_deck | 3.25 | 7.7/9.3 (8.8) | 28.1 / 28.5 | ok |
| cvn_island | 2.30 | 11.5/15.6 (10.4) | 0 / 28 | ok |
| lcs_side | 2.25 | 9.7/12.3 (8.8) | 55.1 / 37.1 (lost) | ok |
| lcs_kh35 | 2.15 | 7.2/9.3 (7.8) | 82.0 / 36.7 | ok |
| lhd_side | 3.15 | 8.0/10.8 (7.7) | 11.3 / 15.3 | ok |
| lhd_deck | 2.90 | 10.1/12.8 (10.2) | 11.7 / 19.6 | ok |


### Run 8 (HEAD 618660a: the sim's holes opened on the patch skin; a7bfd3e Inspect readout)

qa.js: ok on 26, cg_deck 2 floating. The load from other agents was extreme on the first cases (baseline p95 76-163 ms:
frame numbers meaningless there; later cases p95 9-13 ms at baseline 3.5-7.7). Holes now match the sim above and below the
waterline (D33 partial: carrier island, Kh-35 left); D12 and D36 PASS. New: D42.

| case | resolve s | torn m2 picture / sim | qa |
|---|---|---|---|
| ddg_bow | 3.15 | 10.4 / 33.5 | ok |
| ddg_mid | 2.85 | 42.4 / 21.1 | ok |
| ddg_wl | 3.90 | 18.9 / 19.2 | ok |
| ddg_gundeck | 2.80 | 97.3 / 33.4 | ok |
| ddg_spy | 4.30 | 73.3 / 41.6 | ok |
| ddg_house | 1.80 | 28.7 / 23.3 | ok |
| ddg_vls | 3.70 | 202.2 / 16.6 | ok |
| ddg_hangar | 3.10 | 60.8 / 40.4 | ok |
| ddg_stern | 3.00 | 20.3 / 47.8 | ok |
| ddg_kh35 | 2.80 | 6.5 / 14.2 | ok |
| ddg_below | 3.70 | 18.5 / 19.9 | ok |
| ddg_wl_ff | 3.30 | 16.3 / 24.2 | ok |
| ddg_breakup | 3.10 | 20.8 / 22.1 | ok |
| cg_side / cg_deck | 2.05 / 8.40 | 27.1 / 25.4, 173.5 / 29.2 | ok / 2 floating |
| cvn_side / deck / island | 3.55 / 3.35 / 2.50 | 9.4 / 9.3, 28.1 / 28.5, 0 / 28 | ok |
| lcs_side / lcs_kh35 | 2.80 / 2.25 | 76.5 / 37.1, 83.1 / 36.7 | ok |
| lhd_side / lhd_deck | 3.25 / 3.00 | 9.4 / 15.0, 11.7 / 17.5 | ok |


### Run 7 (HEAD 58d4627: systems UI log lines, one shell tear per space, counter-flooding)

Heavy GPU load from other agents all run (baselines p95 up to 94 ms: frame numbers not comparable). qa.js ok on all 27.
The picture now matches the sim's hole on ddg_mid, hangar, spy; still not below the waterline or on the carrier / LHD (D33).
Battery: systems cases now play as the struck ship's side and take the HUD 1 s after, the HUD, Inspect and X-ray settled.


### Run 6 (HEAD 75bf3a2: interior parts in the support map; 4dd386f entry holes, tears into the next level)

Solves much shorter (resolve 0.8-3.3 s), but the synced frame p95 jumped on several DDG cases while the hit solves
(ddg_wl 39, gundeck 51, spy 52, mast 38 ms) with other agents' tabs loading the GPU (baselines p95 up to 66 ms: noisy,
re-bench quietly). qa.js ok on all 27. Same open: D2, D30, D33 (the picture tears far less than the sim), D36, D37, D38.
Better: ddg_spy (a readable ragged hole, the bridge's interior behind it).

| case | resolve s | p50/p95 (base) | torn m2 | sim holes m2 | qa |
|---|---|---|---|---|---|
| ddg_bow | 1.15 | 6.3/14.8 (3.4/13.7) | 9.6 | 52.9 | ok |
| ddg_mid | 1.35 | 6.8/21.8 (3.4/10.3) | 0 | 10.2 | ok |
| ddg_wl | 1.70 | 18.3/39.4 (3.5/4.3) | 0.31 | 27.9 sea | ok |
| ddg_gundeck | 0.90 | 6.6/50.6 (17.7/20.7) | 111 | 47.0 | ok |
| ddg_spy | 1.90 | 9.3/51.6 (16.7/66.2) | 35.4 | 41.6 | ok |
| ddg_house | 1.00 | 8.5/19.2 | 16.6 | 23.3 | ok |
| ddg_mast | 1.00 | 5.4/38.0 | 0 | - | ok |
| ddg_vls | 1.85 | 7.4/26.8 | 224.8 | 16.6 | ok |
| ddg_hangar | 1.45 | 6.4/19.9 | 0 | 35.4 | ok |
| ddg_stern | 1.25 | 5.5/19.5 | 46.9 | 70.1 | ok |
| ddg_kh35 | 1.20 | 6.6/19.0 | 0 | 13.5 | ok |
| ddg_sm6 | 0.85 | 5.5/16.5 | 0.75 | - | ok |
| ddg_127 | 0.80 | 5.2/15.0 | 0.25 | - | ok |
| ddg_cookoff | 3.25 | 11.6/23.3 | 241.7 | (lost) | ok |
| ddg_breakup | 1.45 | 5.8/9.1 | 0.25 | 21.0 (lost) | ok |
| ddg_below | 1.55 | 7.2/13.6 | 0 | 28.6 sea | ok |
| ddg_wl_ff | 1.70 | 9.4/13.3 | 0 | 21.1 | ok |
| cg_side | 1.20 | 7.6/10.7 | 2.6 | 13.2 | ok |
| cg_deck | 2.90 | 13.6/17.4 | 173.5 | 48.2 (lost) | ok |
| cvn_side / deck / island | 1.3 / 1.45 / 1.0 | 8.5/11.7, 7.5/11.1, 12.2/14.9 | 0 / 0 / 0 | 17.0 / 42.2 / 55.2 | ok |
| lcs_side / lcs_kh35 | 2.15 / 1.70 | 9.9/13.3, 7.8/10.6 | 91.9 / 69.2 | 75.6 (lost) / 91.1 | ok |
| lhd_side / lhd_deck | 1.35 / 1.25 | 9.9/12.3, 13.0/15.4 | 0.88 / 12.1 | 15.1 / 36.9 | ok |


### Run 5 (HEAD 4fa59c1: sim/ship.js compartments + systems, 24ef151 narrow-first snap and interior parts, b959230 outfit)

27 cases. qa.js: new `big-piece` flags on ddg_vls (107) and lcs_side (26), ok elsewhere. Resolve 0.9-6.2 s, frame p95
7.9-21 ms. Hits land where aimed (D17 PASS); flooding follows the sim's holes and torn boundaries (D34), fires no longer burn
in flooded spaces (D35 PASS). The picture now tears much less than the sim (D33, D39), interior lines show through the hull
(D37), black silhouettes after a deck hit (D38); the Inspect / HUD still say nothing of systems or flooding (D36).

| case | at | resolve s | p50/p95 | torn m2 (picture) | sim holes | systems out | qa |
|---|---|---|---|---|---|---|---|
| ddg_bow | 3.7,4,59.9 | 2.05 | 5.5/9.8 | 11.7 | BTH2 51.0, ST2 0.1 | 6 | ok |
| ddg_mid | 9.7,3.8,-0.4 | 3.80 | 7.3/10.8 | 2.7 | GAL8 9.4, MER1 1.8 | 4 | ok |
| ddg_wl | 9.1,0.8,-9.9 | 4.55 | 9.0/10.2 | 0 | MER2 30.2 sea | 10 | ok |
| ddg_gundeck | 2.5,8.6,60.7 | 1.60 | 4.9/10.4 | 132.1 | BTH2 51.0 | 6 | ok |
| ddg_spy | 7.2,13.4,27.1 | 3.85 | 5.4/10.8 | 32.1 | SPY02 40.8, SPY01 8.2 | 5 | ok |
| ddg_house | 6,10.2,-5.5 | 1.70 | 5.2/8.8 | 13.0 | MH 22.9 | 0 | ok |
| ddg_mast | 1.2,30.4,19.8 | 0.90 | 5.1/7.9 | 0.25 | - | 1 | ok |
| ddg_vls | -0.3,6.1,-25.9 | 2.20 | 6.3/10.6 | 219.8 | VLSA 15.8 | 18 | 107 big-piece |
| ddg_hangar | 0,7.7,-52.9 | 4.10 | 8.7/11.6 | 0 | HGC 5.1, HGP 15.5, HGS 15.5 | 2 | ok |
| ddg_stern | 8.7,3.2,-70.1 | 2.75 | 6.3/13.5 | 20.2 | STR 68.6 sea, APK 1.3 | 6 | ok |
| ddg_kh35 | -9.1,4.9,29.9 | 3.45 | 7.6/11.9 | 2.3 | BTH5 13.1 | 2 | ok |
| ddg_sm6 | 9.9,5.6,10.2 | 1.15 | 5.3/11.3 | 0.75 | - | 0 | ok |
| ddg_127 | 9.7,4.7,20 | 1.00 | 8.8/14.4 | 0.06 | - | 0 | ok |
| ddg_30mm | 10,6.4,6.5 | - | 7.7/13.6 | - | - | 0 | ok |
| ddg_cookoff | - | 5.60 | 11.1/19.0 | 236.4 | (lost) | - | ok |
| ddg_breakup | 9.5,2.6,-4.8 | 4.65 | 6.1/12.9 | 0 | MER1 20.1 sea | 7 (lost) | ok |
| ddg_below | 9,0.1,-12.1 | 4.75 | 8.8/15.3 | 0 | MER2 30.9 sea | 9; +180 s: MER2 83 %, sink 1.0 m, list 8.5 deg | ok |
| ddg_wl_ff | 9.1,2.3,19.9 | 4.65 | 10.7/17.7 | 0 | REF6 14.5 sea, BTH6 1.4 | 6; +180 s: 6 spaces wet, sink 1.1 m, trim -0.8 deg | ok |
| cg_side | 8.3,3.9,-10.1 | 3.85 | 8.7/14.6 | 5.8 | MER1 19.5, SP8-5 1.9 | 7 | ok |
| cg_deck | -0.1,7.7,62.4 | 5.20 | 15.5/21.1 | 172.1 | SP4-5 49.1 (lost) | - | ok |
| cvn_side | 17.4,7.5,109.4 | 4.35 | 10.9/16.6 | 0 | D24-5 19.2 | 4 | ok |
| cvn_deck | -0.3,19.5,79.4 | 4.45 | 10.4/16.5 | 0 | GALF 46.3 | 1 | ok |
| cvn_island | 25.3,35.2,-30.1 | 3.20 | 13.6/21.7 | 0 | ISL 65.4 | 1 | ok |
| lcs_side | 4,4.6,39.8 | 6.15 | 11.7/17.8 | 115.9 | 5 holes (lost) | 7 | 26 big-piece |
| lcs_kh35 | 15.5,7.4,0.2 | 2.95 | 8.2/15.7 | 93.6 | BAYS 61.7, 36.3 | 1 | ok |
| lhd_side | 15.9,10.6,29.9 | 4.70 | 9.4/13.2 | 1.06 | SP7-3 14.3 | 0 | ok |
| lhd_deck | 0.1,18.3,60.3 | 3.80 | 12.7/17.3 | 26.4 | O25-4 18.1 x2 | 2 | ok |


### Run 4 (HEAD 33a06a7: 882692c faster shell runs, d462efa shell edges, interiors 1452150)

qa.js ok on all 25. Faster solves: resolve 1-5.5 s, frame p95 8-18 ms (was up to 26; the VLS chain gone). Better: the
deckhouse now tears (ddg_house 14.7 m2), flooding only from holes. Same: D2, D3?, D8, D10, D11, D16, D17, D22, D23. New: D29, D30.

| case | at | resolve s | wall ms | p50/p95 (base) | torn m2 | set mm | frames | flood | qa |
|---|---|---|---|---|---|---|---|---|---|
| ddg_bow | 4.5,6.2,59 | 2.15 | 2949 | 5.3/11.3 (3.8/7.6) | 18.9 | 3459 | 5 | 0 | ok |
| ddg_mid | 10,6.4,-0.1 | 3.05 | 2903 | 5.3/9.4 (3.8/4.5) | 59.0 | 4283 | 5 | 0 | ok |
| ddg_wl | 9.4,2.3,-10.5 | 2.50 | 2382 | 5.4/10.3 (3.6/4.8) | 0.06 | 431 | 4 | .026 | ok |
| ddg_gundeck | 3.8,9.8,63 | 2.20 | 2257 | 4.6/8.2 (2.5/3.0) | 129 | 6165 | 8 | 0 | ok |
| ddg_spy | 7.8,11,26.9 | 2.90 | 3075 | 5.4/9.0 (3.7/4.9) | 41.3 | 5341 | 6 | 0 | ok |
| ddg_house | 6.1,11.7,-4.5 | 2.05 | 2023 | 5.1/9.8 (3.2/3.9) | 14.7 | 1831 | 4 | 0 | ok |
| ddg_mast | 5.2,31,18.5 | 1.00 | 1370 | 5.1/9.0 | 0.25 | 40 | 0 | 0 | ok |
| ddg_vls | -0.3,6.1,-25.9 | 2.25 | 2064 | 4.7/7.9 | 220 | 6405 | 6 | 0 | ok |
| ddg_hangar | 0.1,9.2,-52.9 | 2.65 | 2695 | 5.2/10.2 | 31.6 | 2509 | 7 | 0 | ok |
| ddg_stern | 0.3,5.8,-54.9 | 6.50 | 6940 | 11.7/14.2 | 0 | 724 | 0 | lost | ok |
| ddg_kh35 | -9.3,5.8,29.7 | 3.10 | 3306 | 7.0/10.8 | 0.19 | 117 | 0 | 0 | ok |
| ddg_sm6 | 10,6.2,9.8 | 1.10 | 1350 | 5.1/11.4 | 0.56 | 92 | 0 | 0 | ok |
| ddg_127 | 9.9,6.5,19.9 | 1.10 | 1525 | 5.9/11.0 | 0.25 | 85 | 0 | 0 | ok |
| ddg_30mm | 10,6.5,6.9 | - | - | 8.0/10.2 | - | - | - | 0 | ok |
| ddg_cookoff | 0,18.3,29.9 | 7.25 | 7617 | 11.9/18.0 | 236 | 8816 | 9 | lost | ok |
| ddg_breakup | 9.9,5.6,-4.7 | 2.30 | 2297 | 8.1/11.9 | 39.2 | 4295 | 5 | lost | ok |
| cg_side | 8.4,5.2,-10.1 | 3.50 | 3781 | 10.5/12.3 | 7.3 | 892 | 5 | 0 | ok |
| cg_deck | 3.2,7.5,60 | 2.20 | 2252 | 6.6/10.4 | 136 | 8677 | 9 | 0 | ok |
| cvn_side | 18.4,9.7,109.9 | 4.15 | 4654 | 9.2/13.2 | 0 | 81 | 0 | 0 | ok |
| cvn_deck | -0.2,19.5,81.9 | 4.35 | 4344 | 10.4/12.4 | 0 | 341 | 0 | 0 | ok |
| cvn_island | 23.7,33.4,-29.9 | 3.65 | 5894 | 13.0/16.6 | 0 | 158 | 0 | 0 | ok |
| lcs_side | 4.8,6.6,39.4 | 5.50 | 5700 | 8.5/11.4 | 64.3 | 6083 | 9 | lost | ok |
| lcs_kh35 | 15.8,9.1,-0.2 | 2.95 | 3190 | 8.4/11.9 | 54.1 | 2344 | 8 | 0 | ok |
| lhd_side | 15.9,11.8,29.6 | 4.35 | 4697 | 9.7/12.2 | 1.06 | 735 | 4 | 0 | ok |
| lhd_deck | 0.9,18.3,61.2 | 4.10 | 4047 | 8.0/12.3 | 19.0 | 1308 | 2 | 0 | ok |


### Run 3 (HEAD 3eefc23; the machine loaded by other agents: baselines p95 up to 54 ms)

qa.js: ok on all 25 cases (it no longer flags ddg_hangar / lcs_kh35), while D3, D11, D22, D23, D25 are still seen by eye.
Numbers close to run 2 (resolve 1-5.6 s, the aft-VLS chain 15.4 s with p95 62 ms under load); no new defects.


### Run 2 (2026-09-27, HEAD d1d7c2c + the integration agent's uncommitted system.js / support.js / shell runner; exact camera views)

qa.js flags only ddg_hangar (20 floating, hull) and lcs_kh35 (3 floating, cross); every other case "ok", though D18, D22,
D23, D9, D11 show floating / unsupported pieces by eye. Hit point "at" = where scars.js put it (model frame).

| case | round | at | resolve s | solver wall ms | frame p50/p95 ms (base) | torn m2 | set mm | frames | flood / damaged modules | qa |
|---|---|---|---|---|---|---|---|---|---|---|
| ddg_bow | oniks | 4.5, 5.8, 58.6 | 2.75 | 3649 | 5.4/9.1 (3.7/7.8) | 30.4 | 833 | 5 | .32 / gun 41 %, mag5 4 % | ok |
| ddg_mid | oniks | 10, 6.4, -0.1 | 4.40 | 4368 | 5.6/12.0 (3.7/4.3) | 67.4 | 5765 | 6 | .32 / engF 39 % | ok |
| ddg_wl | oniks | 9.6, 3.2, -9.8 | 3.95 | 4153 | 5.5/12.7 (3.8/12.4) | 0.13 | 446 | 3 | .32 / engF 69 %, engA 80 % | ok |
| ddg_gundeck | oniks | 3.6, 9.9, 64 | 3.85 | 3854 | 4.2/8.7 (2.7/3.3) | 126.2 | 9016 | 8 | .32 / gun, mag5 9 % | ok |
| ddg_spy | oniks | 7.5, 12.9, 26.9 | 4.75 | 4862 | 6.0/10.8 (3.7/4.5) | 9.1 | 1594 | 5 | .32 / spyF, spyA, bridge, mast, ciwsF | ok |
| ddg_house | kh-35 | 6.1, 12.1, -4.5 | 3.70 | 3951 | 6.5/10.9 (3.4/4.4) | 0 | 176 | 0 | .14 / - | ok |
| ddg_mast | 127 mm | 4.8, 30.8, 18.7 | 1.00 | 1141 | 4.9/8.8 (3.6/4.2) | 0.06 | 41 | 0 | .02 / mast 40 % | ok |
| ddg_vls | oniks | -0.1, 15.2, -34.6 | 15.55 | 20083 | 11.5/42.8 (2.7/3.3) | 253.0 | 886 | 6 | lost / vlsA | ok |
| ddg_hangar | oniks | 0, 5.7, -60.3 | 5.15 | 6199 | 5.6/12.1 (3.5/5.6) | 281.9 | 4276 | 9 | .32 / shafts, hangar, jp5, ciwsA | 20 floating |
| ddg_stern | oniks | 9, 4.7, -68.9 | 2.30 | 2476 | 5.9/10.9 (3.9/20.6) | 55.8 | 5139 | 5 | .32 / shafts | ok |
| ddg_kh35 | kh-35 | -9.3, 6.2, 29.7 | 2.60 | 2818 | 7.5/13.0 (3.7/10.0) | 4.9 | 476 | 2 | .14 / - | ok |
| ddg_sm6 | sm-6 | 10, 6.5, 10.2 | 1.00 | 1274 | 5.2/12.5 (3.4/11.4) | 1.06 | 135 | 0 | .06 / - | ok |
| ddg_127 | 127 mm | 9.9, 6.7, 19.2 | 0.95 | 1213 | 5.0/12.4 (3.8/10.2) | 0 | 12 | 0 | .02 / - | ok |
| ddg_30mm | 30 mm x10 | 10, 6.4, 6.5 | - | - | 6.4/8.6 (4.2/12.7) | - | - | - | .04 / - | ok |
| ddg_cookoff | VLS fwd | - | 7.00 | 7676 | 10.4/16.9 (2.8/3.4) | 238.0 | 9570 | 9 | lost / vlsF | ok |
| ddg_breakup | oniks, dmg 999 | 9.9, 5.6, -4.7 | 2.45 | 2649 | 7.3/12.9 (5.8/7.8) | 42.9 | 2128 | 5 | lost | ok |
| cg_side | oniks | 8.3, 5, -10.4 | 2.70 | 3179 | 14.8/26.0 (11.7/17.6) | 51.8 | 2339 | 5 | .29 / engF 50 %, engA 20 % | ok |
| cg_deck | oniks | 3.2, 7.5, 60 | 3.95 | 4401 | 11.3/20.7 (8.1/11.5) | 158.9 | 11317 | 9 | .28 / vlsF, gunF, magF | ok |
| cvn_side | oniks | 21.3, 8.2, 58.5 (bay) | 4.85 | 4839 | 8.4/13.7 (4.6/9.8) | 0 | 91 | 0 | .09 / - | ok |
| cvn_deck | oniks | -0.2, 19.5, 81.9 | 4.20 | 4372 | 9.3/17.9 (4.0/4.9) | 0 | 341 | 0 | .09 / hangar 45 %, catsBow | ok |
| cvn_island | oniks | 23.7, 33.4, -29.9 | 3.40 | 3653 | 12.1/19.5 (9.5/17.2) | 0 | 162 | 0 | .09 / prifly | ok |
| lcs_side | oniks | 4.7, 6.3, 39.1 | 5.95 | 6219 | 6.3/13.5 (3.7/9.6) | 116.2 | 479 | 8 | lost / gun, mag57 | ok |
| lcs_kh35 | kh-35 | 15.4, 7.1, 0.1 | 4.10 | 4408 | 6.7/15.0 (3.7/10.0) | 131.8 | 6202 | 12 | .26 / bridge 16 % | 3 floating |
| lhd_side | oniks | 15.9, 11.9, 30.1 | 3.70 | 4003 | 8.3/15.8 (3.8/10.0) | 0.63 | 532 | 5 | .18 / nssm 68 % | ok |
| lhd_deck | oniks | 1.1, 18.3, 61.7 | 4.05 | 4184 | 7.3/15.1 (3.0/8.1) | 12.7 | 1226 | 3 | .18 / flight 73 %, nssm | ok |


### Run 1 (2026-09-27, HEAD ae3abf6 + uncommitted shell/ gpu changes in the tree; shell solver, WebGPU; 1600x900)

Resolve = game seconds from the hit to the solve's end; frames = GPU-synced ms during the solve (baseline before the hit).

| case | round | resolve s | solver wall ms | frame p50/p95 ms (base) | torn m2 | set mm | frames torn | hp / flood / damaged modules |
|---|---|---|---|---|---|---|---|---|
| ddg_bow | oniks | 3.85 | 3995 | 10.1/16.0 (8.3/12.9) | 30.4 | 2510 | 6 | 30 / .32 / gun 41 %, mag5 4 % |
| ddg_mid | oniks | 4.35 | 4705 | 10.2/15.7 (4.7/6.6) | 66.6 | 3338 | 6 | 30 / .32 / engF 39 % |
| ddg_wl | oniks | 4.40 | 4655 | 9.9/15.5 (4.0/6.2) | 0.06 | 519 | 3 | 30 / .32 / engF 69 %, engA 80 % |
| ddg_gundeck | oniks | 3.75 | 4137 | 9.6/15.0 (4.4/5.7) | 118.4 | 1632 | 8 | 30 / .32 / gun, mag5 9 % |
| ddg_spy | oniks | 4.25 | 4473 | 10.8/16.6 (4.7/6.1) | 31.7 | 1745 | 1 | 30 / .32 / spyF, spyA 52 %, bridge, mast 56 %, ciwsF |
| ddg_house | kh-35 | 2.20 | 2487 | 7.1/16.1 (4.0/6.0) | 5.4 | 591 | 3 | 75 / .14 / - |
| ddg_mast | 127 mm | 0.90 | 1249 | 5.7/13.9 (3.8/6.6) | 0 | 56 | 0 | 104 / .02 / mast 40 % |
| ddg_vls | oniks | 15.4 | 16650 | 16.5/20.8 (4.4/5.5) | 252.6 | 1136 | 7 | lost / .60 / vlsA |
| ddg_hangar | oniks | 2.85 | 3138 | 7.7/15.7 (8.9/10.5) | 51.3 | 2825 | 4 | 30 / .32 / shafts 20 %, hangar, jp5, ciwsA |
| ddg_stern | oniks | 2.25 | 2432 | 10.9/16.4 (4.5/6.6) | 16.6 | 1103 | 6 | 30 / .32 / shafts |
| ddg_kh35 | kh-35 | 2.90 | 3135 | 10.8/16.4 (8.7/10.7) | 3.6 | 488 | 4 | 75 / .14 / - |
| ddg_sm6 | sm-6 | 1.15 | 1399 | 9.8/13.4 (4.4/5.5) | 0.75 | 151 | 0 | 95 / .06 / - |
| ddg_127 | 127 mm | 0.90 | 1118 | 6.1/11.4 (4.5/6.4) | 0.06 | 111 | 0 | 104 / .02 / - |
| ddg_30mm | 30 mm x10 | - (no patch) | - | 7.6/9.2 (4.7/7.3) | - | - | - | 100 / .04 / - |
| ddg_cookoff | VLS fwd | 5.30 | 6261 | 15.1/21.0 (4.4/6.1) | 236.9 | 10303 | 9 | lost / .53 / vlsF |
| ddg_breakup | oniks, dmg 999 | 4.65 | 4971 | 12.7/19.4 (6.6/8.6) | 0 | 482 | 0 | lost / .57 / engF, engA |

Frame budget: p95 16-21 ms while a hit solves (the README's figure); the VLS chain and the cook-off solve longest (15.4 s,
5.3 s) with p50 15-16 ms.
