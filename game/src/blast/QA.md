# Blast QA: in-game ship hits (visual / performance)

Battery: `game/src/dev/blast_qa.js` (play.html?mode=sandbox&intro=0, 1600x900; `Q.start(ONIKS, { only })`, `Q.table()`).
Each case: fresh unit, the hit through the sim's own path with the sim's damage, 60 Hz game frames GPU-synced and timed,
stills at 1 s (`1s_a60`, `1s_b60`) and settled = solve done + 3 s (`set_a60`, `set_b60`, `set_d25`, `set_e12`,
`set_w300`) in `game/shots/qa/<case>_<tag>.png` (gitignored). Floating-dot check: `game/src/blast/qa.js` when it
lands (not yet: column "qa" n/a). Status: OPEN / FIXED? (a fix landed, not re-tested) / PASS / WONTFIX.

## Defects (newest first)

| # | case | still | what's wrong | status |
|---|---|---|---|---|
| D14 | all Oniks / Kh-35 cases | (numbers) | Systems: every Oniks hit sets sim flooding to 0.32 (Kh-35 0.14) whatever the hole: `ddg_mid`, `ddg_bow`, `ddg_spy` (a hit on the deckhouse at 14 m up) all flood the same, while the solved torn area below the waterline (`below`) is 0 in every case, `ddg_wl` included. Flooding does not come from holes under the water. | OPEN (systems agent) |
| D13 | ddg_breakup | `ddg_breakup_set_a60`, `_set_d25` | An Oniks hit that kills the ship (dmg 999) leaves no hole at all: blast `torn` 0, `set` 0.48 m, plating intact at the hit 12 s later; no break-up by then either (settle window may be short: re-test with 40 s) | OPEN |
| D12 | ddg_wl | `ddg_wl_set_d25`, `_set_e12` | Oniks (120 kg TNT-eq, delayed fuze) at the waterline: torn 0.06 m2, set 0.52 m; the side shows no hole, only an orange cross of frame lines glowing through intact plating, and flames standing on the deck edge above an intact side. Not plausible for the charge; damage not readable | OPEN |
| D11 | ddg_cookoff | `ddg_cookoff_set_a60` (top middle), `_set_b60` (right of the deckhouse) | After the break at the forward VLS, a comb of charred / flame-lit vertical spikes hangs in the air where the patch was, detached from both hull pieces: the blast's inner-structure dots (or its fire seats) do not follow the structure pieces | OPEN |
| D10 | ddg_cookoff | `ddg_cookoff_set_d25`, `_set_e12` | The torn ends of the two hull pieces are a very regular sawtooth (equal triangles), reads artificial next to the solver's ragged holes | OPEN (minor) |
| D9 | ddg_vls | `ddg_vls_set_a60`, `_set_b60`, `_set_d25` | Oniks into the aft VLS chains a cook-off and the ship is lost: a whole deckhouse block (clean box, intact edges) rests on the sea apart from the hull pieces, flat and level, not sinking | OPEN |
| D8 | ddg_hangar | `ddg_hangar_set_a60`, `_set_d25`, `_set_e12` | Hangar face (aluminium, 120 kg TNT-eq): reads as lace, a scribble of orange-rimmed small holes with islands of intact plating between them, no blown-in door, no bent petals; the hangar behind is black (nothing inside) | OPEN |
| D7 | ddg_hangar | `ddg_hangar_set_d25` | Thin vertical lines hang from the transom into the sea, and a small upright object stands on the water behind her | OPEN (identify) |
| D6 | ddg_mid, ddg_wl, ddg_spy | `ddg_mid_set_d25` (left, at the waterline), `ddg_wl_set_d25` (under the hit), `ddg_spy_set_a60` (left) | An upright thin object (a pole with a lamp-like head, a few m tall) stands on the water next to the hull under / near the hit in every side case, still there when settled: debris (the round's body?) hovering upright on the water | OPEN (identify) |
| D5 | ddg_gundeck | `ddg_gundeck_1s_a60` | Deck hole at 1 s is a clean rectangle (straight edges, square corners, orange outline): cell-shaped, brittle look; no petals turned up | OPEN |
| D4 | ddg_mid | `ddg_mid_set_d25`, `ddg_mid_set_a60` | A pristine block of the deckhouse's lower wall (bright, flat-shaded, sharp edges) sits over the hole with nothing under it: the deckhouse plating is not part of the patch and stays whole while the hull plating it stands on is gone | OPEN |
| D3 | ddg_mid, ddg_bow | `ddg_mid_set_d25`, `ddg_bow_set_e12` | Through the hole the sea / horizon is seen (blue-grey sea dots at the bottom of the hole): the model's surfaces across the pocket are culled and the far side of the hull goes with them: see-through ship | OPEN |
| D2 | ddg_bow, ddg_mid | `ddg_bow_set_a60` (crop), `ddg_bow_set_e12`, `ddg_mid_set_e12` | Hole outline is a set of separate rounded-rectangle windows with strips of intact plating between them (cell-shaped holes, blocky orange rims); grey plating dots still cover much of the hole over the lit interior; fire-lit deck floors inside are hard-edged bright rectangles | OPEN |
| D1 | battery | - | (tool) 25 m / 12 m close views aimed at the patch origin (`spec.frame.O`), which is not the hole: now aimed at `scars.last(id)` | FIXED in battery |

## Runs

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
