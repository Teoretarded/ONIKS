# Smoothness: why the dots pop, and what fixes it

Concept page: `http://127.0.0.1:8771/game/concepts/smoothness.html` (not linked into the game; nothing in `game/src`
changed). It runs the engine as it is (NOW: the live `Renderer`, `ModelLib`, `Terrain`) against the fixes (NEW:
`smoothness_models.js`, `smoothness_terrain.js`, `smoothness_shaders.js`). An automatic dolly goes from 20 km down
to 30 m on a DDG (70 m on the Nimitz) and back. Chips switch every fix. **Split** puts NOW on the left and NEW on the
right, with the seam through the ship. **Difference** shows only what changed since the last frame (x6): a pop lights
up a whole part at once. The chart plots the subject's brightness against log distance, so a pop is a step. **Bench**
runs every configuration on the same path. Keys: Space dolly, 1 / 2 NOW / NEW, S split, D difference, M models mode,
F fade-in, R prefetch, A box filter, W sea fade, N DDG / Nimitz, P still, B bench, H hide the panel.
Console: `SM.bench({frames})`, `SM.jump()` (cold camera cut), `SM.seaTest({dist})`.

All numbers were measured at 1920 x 1080, DPR 1, on this machine, while other agents were running.

## What pops, and why

Ranked by how much of the jumping each one causes.

1. **Model level switches replace every dot of a part** (`models.js` `draw()`, `_seed(P, lod)`). A part has 4 levels
   (DDG 0.3 / 0.7 / 2 / 5 m, Nimitz 0.4 / 1 / 2.6 / 6.5 m), and each level is sampled on its own with its own seed.
   When a part changes level, all of its dots move to new places at once. Parts under ~70 px of radius are not thinned
   (`kSmall`), so their dot count also jumps 5-8x (the level ratio of 2.3-2.9, squared). Measured:
   - On a 900-frame dolly from 20 km to 30 m, the DDG's brightness steps 5 times, by up to 12 %.
   - On a fast 300-frame zoom, the steps reach 21 %. In the brightness chart, NOW is a sawtooth.
   - In the real game (`play.html`, strait, DDG 11), one 20 s dolly triggered 48 part-level switches.
2. **No hysteresis on the level choice.** A distance that rests near a threshold makes the level flicker back and
   forth. Damped zoom, a ship heaving, or a slow orbit are enough.
3. **Each part picks its level from its own distance.** One ship shows several levels at once, so the density is
   patchy: in stills, some superstructure blocks are denser and brighter than the ones next to them (`smooth_ddg400_now`).
   The parts also switch at different moments, so a dolly becomes a stream of small pops instead of one.
4. **The per-pixel density cap thins with a white-noise hash per level** (`u01(hash1(hid ^ ...)) > keep`). The kept
   subset changes completely at every switch. Random thinning of a jittered grid also leaves clumps and holes, which
   reads as speckle rather than an even LiDAR texture. The cap's floor `(sp / spMax)^2` also depends on the current
   level, so it jumps too.
5. **Dots snap to the pixel grid** (`FS_POINT`: crisp 1-3 px squares, MAX blend). A dot that moves by less than a
   pixel stays still and then jumps a whole pixel. Two dots that land in one pixel merge, and one of them vanishes.
   This is the sea's crawl and the shimmer on dense faces. Test: camera still at 600 m over the sea, ships hidden,
   90 frames. 328 pixels per Mpx per frame changed by more than 48 grey levels. With box-filtered dots, 16.
6. **The swell rows cull a sea return on and off** as a crest passes (`terrain.js`, the `seaRowKeep` cull). This is
   real but small: 328 blinks per Mpx became 307 with a fade instead of the cull. Most of the sea's blinking is item 5.
7. **Late levels** (budget 5 ms per frame, coarse to fine). On a cold camera cut from 20 km to 70 m, NOW fills the
   DDG in within 3 frames, with one 8 % step. That is minor for a ship. It is larger for towns and piers (see the
   engine README). While sampling, the intermediate levels show one after another.
8. **The auto-quality guard changes the render scale** (`perfguard.js`: 1 -> .85 -> .75 -> .67 -> .5) while the canvas
   uses `image-rendering: pixelated`. A non-integer nearest-neighbour upscale draws each 1 px dot 1 or 2 px wide
   depending on where it lands, so moving dots pulse. Each guard step also changes the whole frame's resolution at
   once, and the dot-density steps (terrain x .8 / .65) change the whole ground at once. This is the likely cause of
   "the picture could be clearer" on a loaded GPU. It is not measured here: the guard stayed at level 0 in these
   tests. The page's **Scale .75** chip shows the effect.
9. **Not a problem: clipmap rings.** The difference of consecutive frames during a dolly (3 km and 8 km) shows even
   motion with no ring or square band. The lattice is world-snapped, thinning is ordered, and the band dissolve works.
   Geomorphing the rings is not needed.
10. **Not addressed: `dyn` parts** (radars, guns) use angle steps per level (72 / 48 / 24 / 12). A spinning array's step
    count changes with the level.

## The fixes (on the page)

- **Nested levels** (`F.mode 'nested'`, the default NEW). Each part is sampled as the engine does. Each finer level
  keeps only the samples that fill gaps left by the coarser ones: a grid elimination in half-octave passes, seeded by
  the dots already there. So every coarser level is a subset of the finer one. Every dot stores the spacing at which
  it comes in, and the part's buffer is sorted by that spacing. A view draws one prefix of the buffer, and each dot
  fades in over half an octave of zoom from its own rank. There are no level switches: density, brightness and dot
  size follow the distance continuously. The per-pixel cap, the facing floor and the small-part rule are the
  engine's, applied per dot. A cold jump samples only the level the view needs; the coarser ones are prefixes of it.
  Memory is about one finest level plus 15 % (DDG 119 k dots against 102 k at the engine's finest), at 20 B per dot
  instead of 16. The engine keeps all 4 levels.
- **Cross-fade** (`'xfade'`). The engine's levels, plus ±12 % hysteresis and a 0.35 s cross-dissolve: the old level's
  dots go out one by one while the new level's come in. It switches only once the new level is ready, and prefetches
  it one level ahead.
- **Fade-in 0.3 s**: a late layer fades in instead of appearing.
- **Prefetch**: sample one level ahead of the view.
- **Box filter**: the dot's true centre and size go to the fragment shader, and each pixel takes the share of the
  dot's square that covers it, raised to `gamma` .6 to make up for MAX blending.
- **Sea row fade**: the trough thinning fades a return over about 0.1 of its hash range instead of culling it.

## Measured

Synced frame times at 1920 x 1080 (`readPixels` after each frame). The scene is 2 ships, sea and sky. Frame times are
the second pass (caches warm). "Pops" are brightness steps of the subject over 3 % and over 4x the local median.

| path | config | avg ms | p95 ms | max ms | pops | largest step |
|---|---|---|---|---|---|---|
| DDG, 900 frames (slow) | now | 1.5 | 2.1 | 2.9 | 5 | 12 % |
| | xfade | 1.7 | 2.4 | 9.8 | 2 | 4 % |
| | nested | 1.8 | 2.7 | 39 * | 2 | 4 % |
| | nested + box filter | 1.8 | 2.4 | 8.4 | 0 | 0 |
| DDG, 300 frames (fast) | now | 3.0 | 4.8 | 120 * | 3 | 21 % |
| | xfade | 2.3 | 3.7 | 7.3 | 3 | 8 % |
| | nested | 2.3 | 3.6 | 10 | 1 | 3 % |
| Nimitz, 300 frames | now | 1.7 | 2.6 | 3.9 | 2 | 8 % |
| | xfade / nested / nested + box | 1.8-2.0 | 2.4-3.0 | 4.4-28 | 0 | 0 |

\* One-off hitches. The engine's 120 ms is noise from the shared machine. Nested's 39 ms is its last build step (the
sort, the append and one `bufferData`), which is not time-sliced in this concept.

The residual nested pops at 36-51 m are at the very end of the path, as the lens reaches the hull and the sea
(present in every configuration).

- **Cold cut** (fresh caches, 20 km -> 70 m):
  - NOW is at 86 % of final brightness in the first frame and settled in 3 frames, with a largest step of 8 %.
  - Cross-fade starts at 45 % and fades in over 21 frames (largest step 7 %).
  - Nested starts at 45 % and fades in over 25 frames (largest step 5 %).
  - Nested samples more slowly: GEO.sample for every primitive plus the elimination passes.
- **Sea, still camera, 600 m**, blinks per Mpx per frame: NOW 328, sea fade 307, box filter 16, both 0. The mean
  change is the same (0.043) in all four; it is only spread into small steps instead of jumps.

## Ranking (visible gain against cost and risk)

1. **Nested levels.** Highest gain. It removes item 1 and item 3 outright and item 4 in passing (the thinning becomes
   an even, stratified set), and the density no longer changes by part. Frame cost is the same (±0.3 ms), and memory
   is lower than keeping 4 levels. Risk is medium:
   - The sampler becomes a two-stage job (sample, then eliminate), which needs time-slicing through the final step or
     a worker, and warming in idle time so cold cuts do not wait.
   - Cutaways and x-ray keep the engine's per-part uniforms, so they carry over.
   - `dyn` parts stay on the old levels.
   - Touches: `engine/models.js` (sampler, `draw()`, the VS: an `aSig` attribute and the per-dot rule, `warm()` /
     `idle()`), and `engine/README.md` (Models).
   - Checks: `models.html`, the Inspect / exploded views and the hit replay (cutaway density), `perf.html`.
2. **Cross-fade with hysteresis and prefetch.** Most of the gain for a fraction of the work: steps drop from 12-21 %
   to 4-8 %, and the flicker at thresholds goes. It still swaps whole point sets (softened over 0.35 s), and it draws
   both levels during a change, about 2x points for that part for 0.35 s (max 9.8 ms against 2.9 ms on the slow path).
   Risk is low. Touches `engine/models.js` `draw()` (state per instance and part), plus one uniform in the VS. This is
   the one to ship first if nested waits.
3. **Keep the render scale integer, or smooth, under the auto-quality guard.** Probably the biggest "clearer" win on a
   loaded machine, and cheap:
   - Step the dot density before the scale.
   - Jump straight to .5 (an exact 2x upscale).
   - Or drop `image-rendering: pixelated` for non-integer scales.

   Touches `game/src/game/perfguard.js` and `game/play.html` (CSS). Not measured here (the guard never stepped).
4. **Box-filtered dots.** A large temporal gain: sea blinks go from 328 to 16, and the last pops go too. But it trades
   crispness: 1 px returns straddling pixels turn into softer grey pairs, and the ship reads greyer
   (`smooth_a_nestedaa_600`). The user likes the crisp LiDAR dots, so this should be judged by eye. The best compromise
   is probably to use it only on the sea (where the crawl is) and on moving units, with gamma about .5. Cost: +0-0.5 ms
   (a `discard` in the fragment shader). Touches `engine/shaders.js` (FS_POINT, a `vDot` varying), the point VS in
   `models.js`, `terrain.js`, `fx.js`, and the uniforms in `renderer.js`.
5. **Fade-in 0.3 s for late layers.** It turns a cold cut's refinement into a fade, but it only matters with nested or
   cross-fade (the engine's own cold fill is already 3 frames). Trivial with nested (one uniform).
6. **Sea row fade.** Correct but small (-6 % of the sea blinks). One line in `terrain.js`. Cheap, so worth folding in.
7. **Clipmap geomorphing.** Not needed: no seams measured.

## Files

- `smoothness.html`, `smoothness_page.js`: the page, the dolly, the measurements, the bench.
- `smoothness_models.js`: `SmoothModels extends ModelLib`, with the nested levels, the cross-fade and the frozen copy of
  the point VS.
- `smoothness_terrain.js`: a copy of `engine/terrain.js` with the sea row fade and the box filter (a frozen copy; the
  NOW side keeps using the live one).
- `smoothness_shaders.js`: the box-filtered dot (`AA_GLSL`, `FS_AA`).

Stills are in `game/shots/smooth_*.png` (gitignored).
