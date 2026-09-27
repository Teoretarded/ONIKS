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
| D39 | ddg_mid | `qa5/ddg_mid_set_d25`, `_set_e12` | Oniks inside amidships (120 kg TNT-eq, delayed fuze) now tears 2.7 m2: a thin horizontal slit ~12 m long along a longitudinal, with the frames glowing through: reads as a crack, not the blown-out hole the sim books (11 m2) and the charge makes (run 4: 59 m2) | OPEN |
| D38 | ddg_vls | `qa5/ddg_vls_set_a60`, `_set_b60`, `_set_d25` | Black silhouettes: after the aft-VLS deck hit, the stacks and deckhouse blocks by the hole are drawn as flat black shapes with no dots (their depth kept, their dots dropped), hiding what is behind them. qa.js: 107 `big-piece` flags (ddg_vls), 26 on lcs_side | OPEN |
| D37 | all DDG cases | `qa5/ddg_wl_set_a60`, `_1s_b60`, `qa5/ddg_mid_1s_a60` | New since the interiors (b044a49 / b959230): a grid of thin white lines on the intact hull side (verticals every few frames, a horizontal at the 4th deck / waterline) and on the deckhouse: the interior's bulkheads, decks and outfit drawn through intact plating (Inspect off, X-ray off); in `qa5/ddg_mid_set_d25` they hang below the waterline under the hull. Also a davit-like upright piece standing in the water against the hull (`qa5/ddg_wl_set_e12`) | OPEN (interior agent) |
| D36 | ddg_wl_ff | `qa4/ddg_wl_ff_inspect.png`, `_hud.png` | Systems not reported: 180 s after the hit (9 systems out incl. engine room 1, GTG1, SWBD1, fire pumps; 6 spaces wet, sink 1.1 m, speed cap) the Inspect panel shows only the class card (speed 0.0 kn, mass, no damage, no systems out, no flooding, no list); the HUD likewise. (The systems agent's ui/inspect.js and hud/log.js are still uncommitted: re-check when they land.) Also `inspect.close()` left Inspect open for the plain HUD still | OPEN (systems agent); run 5 (4fa59c1 landed): Inspect still shows only the class card, nothing of 6-9 systems out, 5 spaces wet, 1.1 m sinkage (`qa5/ddg_wl_ff_inspect.png`) |
| D35 | ddg_wl_ff | (sim state, 180 s after) | Systems: fires listed burning in REF6 (Refrigerated stores) while REF6 is 100 % flooded; `system engF out why 'frag'` and an AMR1 'fire' + 'fireout' in the same tick ~80 s after the only hit (no new hit event): a late fragment knock-out / fire flicker from nothing | PASS; run 5: no fire left in flooded spaces, no late knock-outs in 180 s |
| D34 | ddg_below, ddg_wl_ff | (sim state) | Flooding spread: PASS on the sim's side. ddg_wl_ff: sea holes in REF6 / BTH6 / AMR1, water reaches only the spaces behind torn boundaries (REF6>FO6, >ST5, AMR1>REF6, BTH6>REF6) and MER1 later (43 %), 53 doors open at the hit, 9 after general quarters; sink 1.14 m, trim -0.9 deg after 180 s; ddg_below: MER2 holed 37.8 m2 at y -1.1, floods to 65 % in 180 s and stays in MER2, engines, GTG2, SWBD2, lube, CPP out | PASS (sim) |
| D33 | ddg_below, ddg_wl_ff, all side hits | `qa4/ddg_below_set_d25`, `qa4/ddg_wl_ff_set_e12` | Sim and picture disagree: the sim's ship model makes a 37.8 m2 sea hole (ddg_below) and three sea holes 10-19 m2 (ddg_wl_ff) while the blast solver tears 0 m2 there and the side is intact in the stills. The player sees an intact hull flooding. Either the solver has to tear what the sim holes (the same charge on the same plating) or the sim's hole should come from the solver (structure.refine) | OPEN (integration + systems); run 5: worse now the hits land low: ddg_wl sim hole MER2 30.2 m2 at the waterline, picture torn 0 (intact side); ddg_mid sim 11.2 m2, picture 2.7 m2 (a thin slit); ddg_hangar sim 36 m2 in 3 spaces, picture 0; carrier side / deck / island sim 19 / 46 / 65 m2, picture 0 on all three |
| D32 | ddg_wl_ff | `qa4/ddg_wl_ff_ff180_w300` | (battery) after 180 s run ahead the unit is gone (hp 30, flood .046 before): sunk by the flooding, or taken by the sandbox's own enemies during the fast-forward? Need a quiet map spot / AI off for the flooding cases | FIXED in battery: the spot is now 3 km beyond the fleet ship furthest from the coast side; the ship lives the 180 s |
| D31 | ddg_below | `qa4/ddg_below_set_d25`, `_ff180_a60` | Flooding case: aimed 1.2 m under the water, lands at y 0.1 (good), but the Oniks tears nothing (torn 0, below 0) and the side shows no hole; the sim still floods (.05 -> .11 over 180 s) and engF / engA 100 %: flooding and machinery loss with no hole to show for it, and nothing for the torn-bulkhead / open-door spread to work from | OPEN |
| D30 | ddg_vls | `qa4/ddg_vls_set_a60`, `_set_b60` | A clean box module (sharp edges, flat faces) sits at the waterline against the starboard side beside the deck hole 3 s after the solve: debris module (boats?) not sinking or not torn | OPEN; run 5 same (`qa5/ddg_vls_set_b60`) |
| D29 | ddg_stern | `qa4/ddg_stern_set_a60`, `_set_d25`, `_set_e12` | Aimed at the starboard quarter (9, 3, -70), the round lands on the flight deck centreline (0.3, 5.8, -54.9); one Oniks and the ship is lost (torn 0, a big orange glow over the stern). The flight deck's plating is smeared into long bright streaks flowing aft (stretched dots) | OPEN |
| D28 | lhd_deck | `qa3/lhd_deck_set_d25`, `_set_e12` | Oniks into the 20 mm flight deck: 9.4 m2 torn shows as three small square pits with flat-topped fire columns, arranged in a row: brittle, square cell holes, no petals, no lifted / dished deck round them | OPEN |
| D27 | ddg_30mm | `qa3/ddg_30mm_set_e12` | PASS: 30 mm burst leaves ringed pockmarks at the hits, nothing floating | PASS |
| D26 | ddg_vls | (numbers) | Stutter: the aft-VLS hit that chains to a cook-off and loses the ship solves 15.5 s with frame p95 42.8 ms (p50 11.5); every other case p95 <= 26 ms | OPEN; run 4: the aft-VLS hit no longer chains a cook-off (resolve 2.25 s, p95 7.9 ms): PASS for this case; the forward cook-off case solves 7.3 s at p95 18 ms |
| D25 | ddg_hangar | `ddg_hangar_set_a60`, `_set_b60` | The round lands on the flight deck (hit point [0, 5.7, -60.3]; the hangar face is at z -53) and the whole flight-deck block aft of the hangar (~20 m of the ship: deck, transom, both sides) comes away as one clean box, displaced aft and down with a gap to the rest: loose-piece logic (support.js?) takes the stern as unsupported. qa.js: 20 floating dots (hull, [8.75, .43, -51.9]) | OPEN; run 3 same; qa.js now reports ok for it (`qa3/ddg_hangar_set_a60`, `_set_b60`); an upright rectangular slab (hangar door?) stands in the gap (`qa3/ddg_hangar_set_e12`); run 4: not reproduced (the hit now lands on the hangar face, not the flight deck); keep open until a flight-deck hit is checked |
| D24 | ddg_hangar | `ddg_hangar_set_e12` | The hangar front shows dark vertical streaks / curtains from the roof down (dots stretched or strips left standing) | OPEN |
| D23 | ddg_mid, ddg_breakup, lcs_kh35 | `ddg_mid_set_e12` (crop), `ddg_breakup_set_d25`, `lcs_kh35_set_d25` | Pieces of superstructure over / beside the hole stay as clean flat-shaded panels and boxes with ruler-straight edges (a folded pair of white panels with a curled ribbon standing on the deck edge in ddg_mid; a pristine small deckhouse over the hole in ddg_breakup; a staircase-notched black cut in the LCS bridge block): read as cardboard / model parts, not torn steel | OPEN; run 3 same (`qa3/ddg_mid_set_e12`); run 4 same (`qa4/ddg_mid_set_e12`: the folded white panel pair with a curled ribbon) |
| D22 | ddg_mid, ddg_breakup, lcs_kh35 | `ddg_mid_set_e12`, `ddg_breakup_set_e12`, `lcs_kh35_set_d25` | Floating dots missed by qa.js: the deck edge (the pink sheer line of dots) runs straight across the top of the hole with no plating under it (qa.js: ok) | OPEN; run 3 same (`qa3/ddg_mid_set_e12`, `qa3/ddg_hangar_set_e12`: the sheer line spans the whole gap aft of the hangar); run 4 same (`qa4/ddg_mid_set_d25`) |
| D21 | ddg_gundeck | `ddg_gundeck_set_d25`, `_set_e12` | Deck hole by the gun: a large clean parallelogram, straight edges, black void under it (no deck below, no frames, no interior); the bow beyond stands with a clean vertical cut face | OPEN |
| D20 | cvn_deck | `cvn_deck_set_d25` | Four flame tongues burn on intact flight deck (no hole, no dent, no scorch): damage not readable | OPEN (with D16) |
| D19 | cvn_side | `cvn_side_set_a60` | (battery) the side case hit the open elevator bay (the round lands on the hangar deck inside): moved to z 110 | FIXED in battery |
| D18 | ddg_bow, ddg_wl, ddg_mid, ddg_hangar | `ddg_bow_set_b60`, `ddg_bow_set_d25`, `ddg_wl_set_d25` | Identified D6: long rods / poles in the sea by the hull, some upright with a bulb at the bottom (ddg_bow b60: a pole standing vertical in the water 20 m off the bow; d25: a rod leaning from the water onto the bow), U-shaped frames hanging under the waterline (ddg_wl d25): debris bodies (the round's sections or the jackstaff / davits?) standing or hovering at the waterline, not sinking. qa.js does not flag them | Identified: debris.js module bodies (in ddg_bow the Mk 45 mount, `type mod`, names ['gun']) that fell in the sea and sink at 1.5-2 m/s, barrel standing straight up, still at the surface 5 s later: not hovering. Minor: a mount would sink mount-first and go under in ~2 s; the upright barrel reads as a pole planted in the water. The U frames in the air in ddg_vls (D9) are still open |
| D17 | all side cases | (hit points) | Hits move up the side: aimed at y 0.8 / 4 / 5 / 6 on the DDG, they land at y 3.2 / 6.4 / 6.7 / 6.5 (the deck edge is ~7): `ddg_wl` is never a waterline hit, nothing tears under the water (`below` 0 in every case, so no hole ever floods). scars.js carrying the hit onto the sampled surface, or the battery's `from`? The impact tester's waterline preset should be checked the same way | PASS; run 5 (24ef151): hits land where aimed (ddg_wl y 0.8, ddg_mid 3.8, ddg_below 0.1, ddg_stern 8.7, 3.2, -70.1) |
| D16 | cvn_side, cvn_deck, cvn_island | `cvn_island_set_d25`, `_set_e12` | Carrier: an Oniks (120 kg TNT-eq, inside) makes no hole anywhere: torn 0 on the side (22 mm), the flight deck (45 mm) and the island's face (10 mm), set 0.09-0.34 m; the island face is untouched while fires burn on its roof. At least the island and the side should tear | OPEN; run 3 same, side moved off the bay: two faint fire patches on intact 22 mm plating (`qa3/cvn_side_set_a60`); run 4 same (torn 0 on side, deck and island) |
| D15 | battery | - | (tool) the orbit camera rides its target on the sea surface and tilts up when low: close stills were aimed at the waterline / horizon (run 1's `d25`, `e12`, and the carrier's views are not usable). Stills now use an exact eye / look view from the unit's pose | FIXED in battery |
| D14 | all Oniks / Kh-35 cases | (numbers) | Systems: every Oniks hit sets sim flooding to 0.32 (Kh-35 0.14) whatever the hole: `ddg_mid`, `ddg_bow`, `ddg_spy` (a hit on the deckhouse at 14 m up) all flood the same, while the solved torn area below the waterline (`below`) is 0 in every case, `ddg_wl` included. Flooding does not come from holes under the water. | OPEN (systems agent); run 2 same; run 4: hits above the water now flood 0 (ddg_wl .026 from its 0.06 m2): PASS for 'no flooding without a hole below'; no case yet makes a hole below the water (D17), so spreading through doors / torn bulkheads is untested |
| D13 | ddg_breakup | `ddg_breakup_set_a60`, `_set_d25` | An Oniks hit that kills the ship (dmg 999) leaves no hole at all: blast `torn` 0, `set` 0.48 m, plating intact at the hit 12 s later; no break-up by then either | run 2 (settle 40 s): a hole now (42.9 m2), the ship sits low, still no break-up at 40 s (dieTime 60). Hole part PASS; a pristine box over the hole: D23 |
| D12 | ddg_wl | `ddg_wl_set_d25`, `_set_e12` | Oniks (120 kg TNT-eq, delayed fuze) at the waterline: torn 0.06 m2, set 0.52 m; the side shows no hole, only an orange cross of frame lines glowing through intact plating, and flames standing on the deck edge above an intact side. Not plausible for the charge; damage not readable | OPEN; run 2 same (torn 0.13, hit landed at y 3.2: D17); run 3: torn 0; run 4: hit at y 2.3, torn 0.06; run 5: at the true waterline (y 0.8) torn 0, the side intact (`qa5/ddg_wl_set_d25`) while the sim floods MER2 through a 30 m2 hole: see D33 |
| D11 | ddg_cookoff | `ddg_cookoff_set_a60` (top middle), `_set_b60` (right of the deckhouse) | After the break at the forward VLS, a comb of charred / flame-lit vertical spikes hangs in the air where the patch was, detached from both hull pieces: the blast's inner-structure dots (or its fire seats) do not follow the structure pieces | OPEN; run 2 same (`ddg_cookoff_set_b60`, `_set_d25`: the comb hangs under the break over the water); run 3 (3eefc23): the comb now rides the bow piece, but hangs downward from the torn end like icicles over the water (`qa3/ddg_cookoff_set_b60`, `_set_d25`, `_set_e12`): flames / charred dots drawn pointing down on a pitched piece?; run 4 same |
| D10 | ddg_cookoff | `ddg_cookoff_set_d25`, `_set_e12` | The torn ends of the two hull pieces are a very regular sawtooth (equal triangles), reads artificial next to the solver's ragged holes | OPEN (minor); run 4 same |
| D9 | ddg_vls | `ddg_vls_set_a60`, `_set_b60`, `_set_d25` | Oniks into the aft VLS chains a cook-off and the ship is lost: a whole deckhouse block (clean box, intact edges) rests on the sea apart from the hull pieces, flat and level, not sinking | OPEN; run 2 same, plus inverted-U frames (davits?) standing in the air over the water with nothing under them (`ddg_vls_set_d25` top right, `_set_b60`) and the charred-spike combs of D11 beside the pieces |
| D8 | ddg_hangar | `ddg_hangar_set_a60`, `_set_d25`, `_set_e12` | Hangar face (aluminium, 120 kg TNT-eq): reads as lace, a scribble of orange-rimmed small holes with islands of intact plating between them, no blown-in door, no bent petals; the hangar behind is black (nothing inside) | run 2: superseded by D24 / D25 (the hit lands on the flight deck); run 4: the round now lands on the hangar face (z -52.9): 4-5 separate cell-shaped windows with vertical strips of intact plating between them (`qa4/ddg_hangar_set_e12`): the lace look is back |
| D7 | ddg_hangar | `ddg_hangar_set_d25` | Thin vertical lines hang from the transom into the sea, and a small upright object stands on the water behind her | see D18 |
| D6 | ddg_mid, ddg_wl, ddg_spy | `ddg_mid_set_d25` (left, at the waterline), `ddg_wl_set_d25` (under the hit), `ddg_spy_set_a60` (left) | An upright thin object (a pole with a lamp-like head, a few m tall) stands on the water next to the hull under / near the hit in every side case, still there when settled: debris (the round's body?) hovering upright on the water | see D18 |
| D5 | ddg_gundeck | `ddg_gundeck_1s_a60` | Deck hole at 1 s is a clean rectangle (straight edges, square corners, orange outline): cell-shaped, brittle look; no petals turned up | OPEN; run 2 same at 1 s, settled: D21 |
| D4 | ddg_mid | `ddg_mid_set_d25`, `ddg_mid_set_a60` | A pristine block of the deckhouse's lower wall (bright, flat-shaded, sharp edges) sits over the hole with nothing under it: the deckhouse plating is not part of the patch and stays whole while the hull plating it stands on is gone | run 2: the block now comes down as loose panels, see D23 |
| D3 | ddg_mid, ddg_bow | `ddg_mid_set_d25`, `ddg_bow_set_e12` | Through the hole the sea / horizon is seen (blue-grey sea dots at the bottom of the hole): the model's surfaces across the pocket are culled and the far side of the hull goes with them: see-through ship | OPEN; run 2 same (`ddg_mid_set_e12`, `lcs_kh35_set_e12`: black void or sea through the hole); run 3 (3eefc23 dark far wall): still sea dot rows seen through the lower hole in `qa3/ddg_mid_set_e12` |
| D2 | ddg_bow, ddg_mid | `ddg_bow_set_a60` (crop), `ddg_bow_set_e12`, `ddg_mid_set_e12` | Hole outline is a set of separate rounded-rectangle windows with strips of intact plating between them (cell-shaped holes, blocky orange rims); grey plating dots still cover much of the hole over the lit interior; fire-lit deck floors inside are hard-edged bright rectangles | OPEN; run 2: ddg_bow a scatter of small square windows along glowing frame lines (`ddg_bow_set_e12`); ddg_mid / cg_side / lcs_kh35 outlines are cell staircases with orange blobs on every step; run 4 same (`qa4/ddg_mid_set_e12`, `qa4/ddg_house_set_e12`: black rectangular slots in the deckhouse roof with bright flat panels between them); run 5: ddg_stern a row of small square / round holes strung along a glowing longitudinal (`qa5/ddg_stern_set_e12`) |
| D1 | battery | - | (tool) 25 m / 12 m close views aimed at the patch origin (`spec.frame.O`), which is not the hole: now aimed at `scars.last(id)` | FIXED in battery |

## Runs

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
