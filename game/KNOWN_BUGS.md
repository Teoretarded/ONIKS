# Known bugs

From the user's play-test (2026-09-25), plus what the agents reported at the end of the overnight build.
Screenshots of several of these were shared in the chat. Start the next session here.

## From the user's play-test

1. **Zooming speeds up the radars.** *Cause found (2026-09-25), fix pending in the controls:* every antenna, rotor,
   dome and scope sweep is already a pure function of sim time (`antA + antW (t - antT)` in `data/units.js`,
   `ui/sensors/radar.js`, `ui/hud/scope/ppi.js`, `hud/minimap.js`; measured: `game.t` advances exactly with real
   time while wheel-zooming). What speeds them up is the time rate: **`=` / `-` (and numpad `+` / `-`) are the time
   rate keys** (`game/time.js` takes them from the camera, whose own `=`/`-` zoom in `engine/camera.js` is dead code),
   so a player zooming with them steps x1 → x2 → x4 ... and every radar spins that much faster. Fix: give zoom and
   rate distinct keys (e.g. `=`/`-` zoom, `[`/`]` or `,`/`.` rate) in `time.js`, `camera.js` and the KEYBINDS help
   (`data/settings.js`); the controls agent owns those files. At x16/x32 fast antennas also strobe (a few frames per
   turn), which reads as erratic speed; the scope already switches to its "fast" rendering there.

2. ~~**Selecting units feels buggy; double-click should focus.**~~ *Fixed 2026-09-25.* Double-click spectates a unit
   or round (camera.spectate: flies in, follows tightly; left / right drag orbits, wheel zooms, Esc or a click on empty
   ground leaves; the unit stays selected for orders); Ctrl+double-click selects all of the type; Inspect no longer
   opens on a double-click (Alt+click / I). Box select counts units by centre or a third of their drawn box, drags
   under 8 px are clicks, a lost release drops the box; with no unit in the box it selects the rounds in flight
   (C cinematic / B bullet time on them). `game/src/game/select.js`, `game/src/engine/camera.js`.

3. **Scale feels wrong.** On a ~120-180 km map, the ships and missiles don't feel real in size or speed:
   missiles feel too slow or too big. Audit true dimensions and speeds against the camera FOV, the time rate shown,
   and any minimum on-screen size or enlargement applied to far units (engine `models.js` LOD / dotSpacing,
   `game/src/game/render.js`, the Orbital glyphs). Real: DDG 155 m, carrier 333 m, 3M55 8.9 m at ~Mach 2.5,
   SM-6 6.6 m at ~Mach 3.5.

4. **Missile motion is not realistic, SM-6 launches especially.** Use reference footage: the SM-6 leaves the
   Mk 41 cell vertically, the Mk 72 booster burns ~6 s, the missile pitches over smoothly (long eased rise, gentle
   arc: see `reference/films/_brief/realism.txt`), the Mk 72 separates and falls away, then the Mk 104 sustainer
   burns as a separate phase with its own smaller plume. Files: `game/src/sim/weapons.js` (flight phases),
   `game/src/data/units.js` PROJ `sm6`, `game/src/game/render.js` (projectile model state), `game/src/fx/lib/plume.js`,
   `game/src/fx/index.js`.

5. **SM-6 modules and flame are wrong after the booster phase.** Once the booster is gone there seems to be no
   second (sustainer) phase: the model still shows the old configuration and the booster flame stays visible.
   The model state (`booster: false`) and the plume must switch at booster separation; the dropped Mk 72 should
   tumble away (the debris / FX systems can do it). Same files as 4, plus `game/src/game/debris.js`.

6. ~~**Dark circle under selected aircraft.**~~ *Fixed 2026-09-25.* The renderer's subject list (the world-dimming
   pool, `engine/renderer.js` `_subjects`) skips anything whose centre is more than ~1.2 radii above the ground or sea
   (aircraft, helos, rounds, jets on a deck; `d.noDim` opts out), so no pool or screen backdrop follows a jet.

7. ~~**TEL reloading is "telepathic".**~~ *Fixed 2026-09-25.* The transloader now drives (rounding the TEL if it
   comes from ahead) to a point 80 m, then 40 m, behind its spot, creeps the last stretch on its own turning circle
   and parks at `TZM.TEL_AT` from the TEL (same heading, TEL's left side; the right if the ground there is bad) to
   ~0.2 m / 2° (`sim/orders.js` parkBy); it then lowers its stabilisers (4 s, `u.dep`), the TEL lowers its launcher,
   and each round is a full crane cycle (`TRANSLOADER.reloadPose`, now fed the TEL's true relative pose `st.telRel`
   and turning the TLC to the TEL's yaw); the round becomes the TEL's only when the crane sets it on the tube (.64 of
   the cycle), and a reload ends only between cycles (`sim/mech.js` reloadStep). Depot refills also set the
   stabilisers first and only while the transloader has no errand. The S-400 (units3) restocks at a depot like the
   Pantsir: no vehicle is involved, nothing to fix there.

## Reported by agents at the end of the build

- **Balance** was re-tuned after the switch to collision-based hits: every map 42-58% coast wins over 24 seeds,
  defences stop ~43% of Oniks (target ~45%). Kh-35 (58%) and Kalibr (64%) are still stopped a bit more than
  intended. Per-map numbers carry about ±10 points of seed noise. Tool: `game/balance.html`.
- **Big battles at x32 are CPU-heavy**: a 200-unit battle runs 30-70 ms per frame (smoke trails, debris, the sim
  and its event handlers). Normal play is 2-6 ms. Tools: `ONIKS.perf()`, `game/perf.html`, `game.profile = true`.
- **Tests:** the 200-unit perf test fails whenever the machine is loaded (re-run on a quiet machine); the two new
  hit-physics tests (interceptor turn limit, tumbling axis) were failing and may have been re-thresholded by the
  balance pass. `game/tests.html`.
- **Four cloud branches are pushed but NOT merged** into `game-v1`: `cloud/simperf` (Node harness `tools/sim.mjs`
  + sim speed-ups with a determinism proof), `cloud/units3` (Ticonderoga, LCS, S-400 + 92N6E, A-222 Bereg),
  `cloud/audit` (bug fixes), `cloud/validate` (`tools/validate.mjs` data cross-checks). They branch from an older
  `game-v1` (8960317), so expect conflicts in `units.js`, `models.js`, `anatomy.js`, `sensors.js`, `weapons.js`.
  Merge one at a time, re-run tests and look at the game after each.
- The hit replay (J) does not re-show debris; the Orbital style's clip plane doesn't cut the rear section of a
  broken missile.
- On a cold first open the Combat screen could list only six maps (fixed in the fallback list; watch for it).
- Saves made with older code are refused on Continue (by design: the sim changed).
- Campaign missions override some HP values (M5, M6); re-check campaign difficulty after the balance changes.
- Two untracked files, `game/src/data/models_u3kit.js` and `units_u3.js`, are partial work from a local agent that
  was stopped (the same four units were then built on `cloud/units3`). Not imported anywhere; delete or ignore them
  when merging `cloud/units3`.
