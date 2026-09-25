# Known bugs

From the user's play-test (2026-09-25), plus what the agents reported at the end of the overnight build.
Screenshots of several of these were shared in the chat. Start the next session here.

## From the user's play-test

1. **Zooming speeds up the radars.** While zooming around the map, radar sweeps (and possibly other
   animations) spin much faster. Likely the sweep / antenna animation is driven by frame time (or the time rate
   applied to frame time) instead of sim time. Check: `game/src/data/units.js` modelState `ant`/`dome`, the radar
   sweep in `game/src/ui/sensors/radar.js`, the scope in `game/src/ui/hud/scope/ppi.js`, and whether the camera's
   zoom changes `game.timeRate` or the frame dt.

2. **Selecting units feels buggy; double-click should focus.** Expected: double-clicking a unit (e.g. an F/A-18E)
   flies the camera close and orbits / follows it. Today double-click selects all units of that type.
   Proposal: double-click = fly to + orbit/follow; Ctrl+click (or Ctrl+double-click) = select all of that type.
   Files: `game/src/game/select.js`, `game/src/engine/camera.js` (follow/orbit), KEYBINDS in `game/src/data/settings.js`.

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

6. **Dark circle under selected aircraft.** Selecting an F/A-18E shows a dark disc on the sea under it, which then
   stops and a smaller circle comes out of it and follows the jet. It is the ground-dimming pool the engine puts
   around units so they stand out (`game/src/engine/terrain.js` "subjectDim", fed by the renderer with units on
   screen) plus possibly the selection's ground ring. Air units should not dim the ground, and nothing should
   detach or slide. Files: `game/src/engine/renderer.js` / `terrain.js` (subject list), `game/src/game/select.js`.

7. **TEL reloading is "telepathic".** The transloader does not drive up to the TEL and park alongside; the crane
   swings a container from a distance and the round transfers anyway. Expected: the transloader drives to a
   parking spot beside the TEL (within a few metres, the right side), deploys, the crane pose uses the TEL's real
   relative position (`TRANSLOADER.reloadPose` in `game/src/data/models.js`), and only then does the round move.
   Files: `game/src/sim/mech.js` (reload), `game/src/sim/orders.js`, `game/src/data/units.js` modelState
   (transloader), `game/src/game/render.js`.

## Reported by agents at the end of the build

- **Balance is off after the switch to collision-based hits.** Last runs: the coast won ~17% of AI-vs-AI matches;
  defences stop 83-91% of coast missiles. A numbers-only balance pass was running at handover (see git log for its
  final commit). Archipelago also dropped to ~29% coast wins after the fleet-sensing change (the E-2D's ESM range
  is the lever). Tool: `game/balance.html`.
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
