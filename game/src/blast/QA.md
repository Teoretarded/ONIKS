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
| D26 | ddg_vls | (numbers) | Stutter: the aft-VLS hit that chains to a cook-off and loses the ship solves 15.5 s with frame p95 42.8 ms (p50 11.5); every other case p95 <= 26 ms | OPEN |
| D25 | ddg_hangar | `ddg_hangar_set_a60`, `_set_b60` | The round lands on the flight deck (hit point [0, 5.7, -60.3]; the hangar face is at z -53) and the whole flight-deck block aft of the hangar (~20 m of the ship: deck, transom, both sides) comes away as one clean box, displaced aft and down with a gap to the rest: loose-piece logic (support.js?) takes the stern as unsupported. qa.js: 20 floating dots (hull, [8.75, .43, -51.9]) | OPEN |
| D24 | ddg_hangar | `ddg_hangar_set_e12` | The hangar front shows dark vertical streaks / curtains from the roof down (dots stretched or strips left standing) | OPEN |
| D23 | ddg_mid, ddg_breakup, lcs_kh35 | `ddg_mid_set_e12` (crop), `ddg_breakup_set_d25`, `lcs_kh35_set_d25` | Pieces of superstructure over / beside the hole stay as clean flat-shaded panels and boxes with ruler-straight edges (a folded pair of white panels with a curled ribbon standing on the deck edge in ddg_mid; a pristine small deckhouse over the hole in ddg_breakup; a staircase-notched black cut in the LCS bridge block): read as cardboard / model parts, not torn steel | OPEN |
| D22 | ddg_mid, ddg_breakup, lcs_kh35 | `ddg_mid_set_e12`, `ddg_breakup_set_e12`, `lcs_kh35_set_d25` | Floating dots missed by qa.js: the deck edge (the pink sheer line of dots) runs straight across the top of the hole with no plating under it (qa.js: ok) | OPEN |
| D21 | ddg_gundeck | `ddg_gundeck_set_d25`, `_set_e12` | Deck hole by the gun: a large clean parallelogram, straight edges, black void under it (no deck below, no frames, no interior); the bow beyond stands with a clean vertical cut face | OPEN |
| D20 | cvn_deck | `cvn_deck_set_d25` | Four flame tongues burn on intact flight deck (no hole, no dent, no scorch): damage not readable | OPEN (with D16) |
| D19 | cvn_side | `cvn_side_set_a60` | (battery) the side case hit the open elevator bay (the round lands on the hangar deck inside): moved to z 110 | FIXED in battery |
| D18 | ddg_bow, ddg_wl, ddg_mid, ddg_hangar | `ddg_bow_set_b60`, `ddg_bow_set_d25`, `ddg_wl_set_d25` | Identified D6: long rods / poles in the sea by the hull, some upright with a bulb at the bottom (ddg_bow b60: a pole standing vertical in the water 20 m off the bow; d25: a rod leaning from the water onto the bow), U-shaped frames hanging under the waterline (ddg_wl d25): debris bodies (the round's sections or the jackstaff / davits?) standing or hovering at the waterline, not sinking. qa.js does not flag them | OPEN |
| D17 | all side cases | (hit points) | Hits move up the side: aimed at y 0.8 / 4 / 5 / 6 on the DDG, they land at y 3.2 / 6.4 / 6.7 / 6.5 (the deck edge is ~7): `ddg_wl` is never a waterline hit, nothing tears under the water (`below` 0 in every case, so no hole ever floods). scars.js carrying the hit onto the sampled surface, or the battery's `from`? The impact tester's waterline preset should be checked the same way | OPEN (triage) |
| D16 | cvn_side, cvn_deck, cvn_island | `cvn_island_set_d25`, `_set_e12` | Carrier: an Oniks (120 kg TNT-eq, inside) makes no hole anywhere: torn 0 on the side (22 mm), the flight deck (45 mm) and the island's face (10 mm), set 0.09-0.34 m; the island face is untouched while fires burn on its roof. At least the island and the side should tear | OPEN |
| D15 | battery | - | (tool) the orbit camera rides its target on the sea surface and tilts up when low: close stills were aimed at the waterline / horizon (run 1's `d25`, `e12`, and the carrier's views are not usable). Stills now use an exact eye / look view from the unit's pose | FIXED in battery |
| D14 | all Oniks / Kh-35 cases | (numbers) | Systems: every Oniks hit sets sim flooding to 0.32 (Kh-35 0.14) whatever the hole: `ddg_mid`, `ddg_bow`, `ddg_spy` (a hit on the deckhouse at 14 m up) all flood the same, while the solved torn area below the waterline (`below`) is 0 in every case, `ddg_wl` included. Flooding does not come from holes under the water. | OPEN (systems agent); run 2 same |
| D13 | ddg_breakup | `ddg_breakup_set_a60`, `_set_d25` | An Oniks hit that kills the ship (dmg 999) leaves no hole at all: blast `torn` 0, `set` 0.48 m, plating intact at the hit 12 s later; no break-up by then either | run 2 (settle 40 s): a hole now (42.9 m2), the ship sits low, still no break-up at 40 s (dieTime 60). Hole part PASS; a pristine box over the hole: D23 |
| D12 | ddg_wl | `ddg_wl_set_d25`, `_set_e12` | Oniks (120 kg TNT-eq, delayed fuze) at the waterline: torn 0.06 m2, set 0.52 m; the side shows no hole, only an orange cross of frame lines glowing through intact plating, and flames standing on the deck edge above an intact side. Not plausible for the charge; damage not readable | OPEN; run 2 same (torn 0.13, hit landed at y 3.2: D17) |
| D11 | ddg_cookoff | `ddg_cookoff_set_a60` (top middle), `_set_b60` (right of the deckhouse) | After the break at the forward VLS, a comb of charred / flame-lit vertical spikes hangs in the air where the patch was, detached from both hull pieces: the blast's inner-structure dots (or its fire seats) do not follow the structure pieces | OPEN; run 2 same (`ddg_cookoff_set_b60`, `_set_d25`: the comb hangs under the break over the water) |
| D10 | ddg_cookoff | `ddg_cookoff_set_d25`, `_set_e12` | The torn ends of the two hull pieces are a very regular sawtooth (equal triangles), reads artificial next to the solver's ragged holes | OPEN (minor) |
| D9 | ddg_vls | `ddg_vls_set_a60`, `_set_b60`, `_set_d25` | Oniks into the aft VLS chains a cook-off and the ship is lost: a whole deckhouse block (clean box, intact edges) rests on the sea apart from the hull pieces, flat and level, not sinking | OPEN; run 2 same, plus inverted-U frames (davits?) standing in the air over the water with nothing under them (`ddg_vls_set_d25` top right, `_set_b60`) and the charred-spike combs of D11 beside the pieces |
| D8 | ddg_hangar | `ddg_hangar_set_a60`, `_set_d25`, `_set_e12` | Hangar face (aluminium, 120 kg TNT-eq): reads as lace, a scribble of orange-rimmed small holes with islands of intact plating between them, no blown-in door, no bent petals; the hangar behind is black (nothing inside) | run 2: superseded by D24 / D25 (the hit lands on the flight deck) |
| D7 | ddg_hangar | `ddg_hangar_set_d25` | Thin vertical lines hang from the transom into the sea, and a small upright object stands on the water behind her | see D18 |
| D6 | ddg_mid, ddg_wl, ddg_spy | `ddg_mid_set_d25` (left, at the waterline), `ddg_wl_set_d25` (under the hit), `ddg_spy_set_a60` (left) | An upright thin object (a pole with a lamp-like head, a few m tall) stands on the water next to the hull under / near the hit in every side case, still there when settled: debris (the round's body?) hovering upright on the water | see D18 |
| D5 | ddg_gundeck | `ddg_gundeck_1s_a60` | Deck hole at 1 s is a clean rectangle (straight edges, square corners, orange outline): cell-shaped, brittle look; no petals turned up | OPEN; run 2 same at 1 s, settled: D21 |
| D4 | ddg_mid | `ddg_mid_set_d25`, `ddg_mid_set_a60` | A pristine block of the deckhouse's lower wall (bright, flat-shaded, sharp edges) sits over the hole with nothing under it: the deckhouse plating is not part of the patch and stays whole while the hull plating it stands on is gone | run 2: the block now comes down as loose panels, see D23 |
| D3 | ddg_mid, ddg_bow | `ddg_mid_set_d25`, `ddg_bow_set_e12` | Through the hole the sea / horizon is seen (blue-grey sea dots at the bottom of the hole): the model's surfaces across the pocket are culled and the far side of the hull goes with them: see-through ship | OPEN; run 2 same (`ddg_mid_set_e12`, `lcs_kh35_set_e12`: black void or sea through the hole) |
| D2 | ddg_bow, ddg_mid | `ddg_bow_set_a60` (crop), `ddg_bow_set_e12`, `ddg_mid_set_e12` | Hole outline is a set of separate rounded-rectangle windows with strips of intact plating between them (cell-shaped holes, blocky orange rims); grey plating dots still cover much of the hole over the lit interior; fire-lit deck floors inside are hard-edged bright rectangles | OPEN; run 2: ddg_bow a scatter of small square windows along glowing frame lines (`ddg_bow_set_e12`); ddg_mid / cg_side / lcs_kh35 outlines are cell staircases with orange blobs on every step |
| D1 | battery | - | (tool) 25 m / 12 m close views aimed at the patch origin (`spec.frame.O`), which is not the hole: now aimed at `scars.last(id)` | FIXED in battery |

## Runs

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
