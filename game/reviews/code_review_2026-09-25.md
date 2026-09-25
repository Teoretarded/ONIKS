# Code review, 2026-09-25 (game/src + game/*.html)

This review covered stability, cleanliness and integration. Balance and sim behaviour are unchanged. `tests.html` passes 41 of 42. The one failure is `perf: 200 units`, which measured 10.4 to 11.3 ms against a 10 ms budget. It also failed before these changes, and the machine was loaded by other agents. Sandbox and a combat match at x32 for about 10 sim-minutes ran with no console errors.
The sim is clean. It has no `Math.random` or `Date` calls, `performance.now` appears only in profiling, and it imports only `data/units.js`. `sim/rand.js` falls back to the same mulberry32 as `M3.rng`.

## Fixed (one commit each)
- `586311c` **Auto x1 had two sources.** `game.js` read and wrote the legacy `oniks.autoSlow` key. The value from `data/settings.js` only took effect because `ui/help` reconciled the two on init, so with `?nosys=help` the menu's Off was ignored. The settings are now the only source.
- `42e0d10` The time-rate table `[1..32]` was copied into audio, replay, save and hud/top. Those four now import `RATES` from `game/game.js`.
- `2823808` In `game.js`, `poses` / `pposes` gained an entry for every unit and every round ever drawn. They are now pruned every 256 frames.
- `d586903` The `main.js` header now lists the real console API (`ff`, `hudShot`). The comment for `still` had been attached to `perf`.
- `c7b3684` Removed 10 dead exports that nothing imports, checked by grep over game/ and tools/. They were `rgbaTex`, `dsz`, `isHover`, `LIME_S`/`CORAL_S`, `stackTags`, `styledOverlay`, `discW`, `entryToward`, `unitShort` and `fillGrid`.
- `81bb5ea` `terrain.detail()` allocated two arrays on every `heightAt` / `groundAt` call, which run thousands of times a frame. It now uses scratch arrays.
- `0570cf4` In fx, `hitAt` / `abUntil` were never pruned, and `lnch` leaked rounds that were fired and gone between two frames (x32, `ff`).
- `5d80468` The salvo board trimmed a lane's ticks but left them in the `ticks` id map.
- `041f38a` In render, a removed carrier kept its own `deckSlots` map.
- `0b98b84` Removed per-frame garbage: orbital's `[...trails.values()].some()` and render's nozzle-glow arrays.

## Found, left (ranked)
1. `sim/damage.js:97`: a `recovered` unit is deleted without clearing the sides' contacts and without emitting `removed`, unlike the path at :116-118. Unifying the two changes sim behaviour and what listeners see, so the sim owner should decide.
2. `game/campaign/index.js:141`: `runTimers` walks backwards, so timers due in the same frame run in reverse registration order (`S.at(t,a); S.at(t,b)` runs b first). Flipping it could change mission scripts that rely on the current order, so they need checking first.
3. `sim/ai.js:528-531`: `waitT` is never pruned, and a re-acquired target keeps its old timestamp, which skips the salvo wait. This is AI behaviour and would affect balance.
4. `engine/models.js:497+` `draw()` allocates per instance and per part (`Tp`, `pc`, `off`, `mul3` results, `[px,py,pz]`). This is the largest remaining source of per-frame garbage. `screenBox()` (~:602) allocates per sampled point.
5. `engine/terrain.js:916,934`: `rangeOver()` returns a new `[lo,hi]` per block, and `prepare()` builds a new `hb` per level every frame.
6. `fx/index.js:574`: `C.halo` skips the `C.n < C.cap` budget check that `dot` / `glow` have. Adding it could thin halos in heavy scenes, which the player would notice.
7. `engine/renderer.js:168` `_ubo()` builds about 45 array literals per frame; `sim/weapons.js:603` allocates `dead = []` per tick.
8. `game/sonar.js:91` calls `concat` per torpedo per frame. `game/campaign/index.js:175` runs `flights.filter` every frame, and `ui/hud/minimap.js:152` builds its corner array every frame.
9. `ui/hud/index.js:121`: `hudShot` attaches by polling `window.ONIKS` every 500 ms, forever if boot fails. `main.js` should publish ONIKS first, or emit a bus event.
10. Dead code nobody calls: `campaign/world.js:168` `fleetAnswer` and `:298` `addSquall`, `campaign/camera.js:89` `camKey`, `director.js:76` `eyeOf`, `debris/math.js` `qLerp` / `mtv`, and `select.js:564` `export { SHORT }`. They may be unfinished features, so their owners should decide.
11. About 15 sim constants and helpers are exported but used only in their own file (`killProj`, `roughContact`, `ROSTER`, `SEA_DEPTH`...). `world/maps.js` `mapFromResult` is documented as an API but has no caller.

## Structural recommendations
1. **A shared `src/lib/` (maths + tokens).** Helpers are copied everywhere: `clamp` in 16 files, `TAU` in 25, `DEG` in 20, `wrapPi` in 10 (two formulas), and `LIME` / `CORAL` in about 19 files as hex strings, 0..255 triples and GLSL. None has drifted yet. Move files over as their owners touch them; a single sweeping pass would conflict with the other agents' edits.
2. **Replace the directory-listing probe in `main.js` with a static system list.** `exists()` scrapes the server's HTML listing to find optional systems. That design dates from the parallel-build phase, and every system now exists. A fixed import list, with `?nosys` kept, would make boot deterministic and able to run under any static server.
3. **Systems talk through bus events, not `window` globals and polling.** Examples are `window.ONIKS` polling in the HUD, `window.DEBRIEF`, and the `game.debris.*` / `game.quality` hooks that other systems probe. Document each hook in `game/README.md`, or turn it into events.
4. **Allocation-free engine hot paths** (`models.draw`, `terrain.prepare`, `renderer._ubo`). Give them a scratch-vector convention like the one `sim/` already follows, and add a perf test that counts allocations per frame.
5. **Split the 800-1400 line modules by responsibility:** `game/debris.js`, `game/replay.js`, `game/orders.js`, `ui/inspect.js`, `sim/ai.js` and `sim/weapons.js`. The `ui/sensors/` and `game/ground/` folders are the pattern to follow. Pair this with a node `validate.mjs` check that sim/ imports only sim/ and data/.
