# blast: ship hits solved on the GPU

The blast bench's structural models (`game/concepts/blast`) running in the game, render side. The headless sim (hp, modules, flooding) stays authoritative and deterministic; this decides what the plating looks
like and feeds game/structure's flooding and girder.

## Two solvers (swappable: same spec, same snapshots)

| Solver | Bench commit | Model | Cost (RX 9070 XT) | In game |
|---|---|---|---|---|
| `shell` (`shell/`) | 03813d8, petals v2 from 3f115d5 | shell FE (CST membranes, J2 + strain-dependent Cowper-Symonds, hinges; stiffeners as shear-limited beams on their own line with web-end ties into the plates they meet; GL mesh-scaled erosion, absorbing edges, water backing and a waterline burst's water shock, products inflow through openings, hole/image sources that cannot focus, contact, fragments), 0.25 m, dt ~12 us (9 us on a carrier's plating), no mass scaling | WebGPU (`gpu_wgpu.js`, in the worker: 200 steps a command buffer, mapAsync read backs) or WebGL2 (`gpu.js`, ~30 calls a step). Bench box: P-800 contact 13.6k steps 1.1 s, inside 32.6k steps 1.9 s of full GPU | **default** where the browser has WebGPU: a 6 ms slice a frame (`cfg.gpuMsShell`, 8 in slow motion), ~80-150 steps a frame. In play (60 Hz frames, the GPU shared with another game tab): 5-inch 0.9 s, SM-6 1.4-2.4 s, Kh-35 / Oniks side inside 3.8-4.2 s, waterline 4.9 s, LCS 3.3 s, a carrier 4.6 s, a deck hit 3.3-6.8 s (10.8 under heavy load), a VLS cook-off 6.4 s; the synced frame p50 +5-6 ms, p95 16-21 ms while a hit solves |
| `fast` (`fast/`, prototype) | none | rules on the 0.25 m texel grid (Kinney-Graham impulse + the space's gas as a membrane load; tear by membrane stretch or punch speed; flaps, debris, a seeded fragment fan), worked out once at the hit, then a pure function of time | the whole hit in ~3.5 ms (Rust/WebAssembly, `fast/rs` -> `fast/fast_core.wasm`) or ~5.7 ms (JS `fast/core.js`, same output) in the worker; done 35 ms after the hit | `?blast=fast`: same messages as the shell runner (`fast/runner.js`), so the drawing, debris, fires, sim holes and structure are unchanged |
| `lattice` (`patch.js`, `gpu.js`, `runner.js`) | 1596bde | elastic-plastic lattice, velocity tear-out, running cracks, x64 mass scaling once only gas acts | ~52 us a step for 36k nodes; Oniks contact 3.6k steps, inside 8.2k | without WebGPU, the main-thread fallback, `?blast=lattice`: an outside hit settles in 0.2-1 s, an inside one in 2-4 s at 3 ms of GPU a frame |

The shell port matches the bench (e00312c) on its own test box at 0.25 m (`shell/check.js` beside the bench's
`runCaseAsync` in the same page, WebGPU both): P-800 contact side 3.31 m² / second deck 0.31 (bench 3.31 / 0.25; WebGL2
3.31 / 0.25), 13.4k steps (13.6k); P-800 inside weather deck 9.75, decks 57.6 / 57.5, bulkheads 48.2 / 33.9 (bench 9.63,
55.3 / 62.9, 50.9 / 36.1; its torn-cell reads are asynchronous, so runs differ by a few %). The runner feeds both backends
the same way: loads, gas and impulses set every 25 steps, torn cells and nodes read back asynchronously (once a pump on
WebGL2: a fence polled or a buffer read there is a round trip to Chrome's GPU process, busy with the game). The bench
moves on; re-port `shell/model.js` and copy `shell/gpu.js`, `shell/gpu_wgpu.js` from its next commit (the one change in
each: gravity on free pieces along the patch's up axis).

The shell solver's patch (spec.js `big`): the bench's Burke sizing, a box of half-size clamp(3 + 1.5 W^(1/3), 3, 14) m
joined with the compartment the blast works in (both its bulkheads and its decks; a deck hit also models the side
shells its deck meets), on the bench's graded grid (S within 1.5 + 0.6 W^(1/3) m of the hit and the charge, 2 S beyond;
skins resampled to a uniform S for the atlas), the displacement eased to nothing over the last 1.5 m before anchored
edges, and a seeded +-15 % scatter of the steel's failure strain (`cfg.scatter`; off in the parity check) so tears start
at weak spots instead of whole panels letting go at once (seeded from the impact's geometry: the same hit on the same
class tears the same way). Openings (spec.js `ventsOf`, condition Zebra: shut until the pressure across them passes
their failure pressure, then open): a hatch between decks 1 m² at 50 kPa, a watertight door 1.3 m² at 100 kPa, ventilation
trunks to the weather ~1 m² at 30 kPa, a weather door 1.5 m² at 70 kPa (coarse public figures); the shell model opens them
in its gas step (`M.SHUT`; the bench's vents are always open). Read-backs are tagged with their step and used a fixed latency later (the bench's A6: `cfg.latMs`, 5 ms in the
game, where WebGPU's mappings take a frame or two; the bench uses 1 ms: the box check agrees within its own WebGL/WebGPU
spread at either): the same spec gives the same result on WebGPU and WebGL2. Drawn: pieces that come loose fly on in the solve, then leave
as debris dots (linear drag, gravity; they land on the deck, or on the deck under a hole, or sink); torn cells' plating
hangs off its corners ragged and curled the way it went; dented plating is lit along its bent face (at most ~50 deg)
with sub-grid buckle facets; the structure behind a hole as jittered charred dots, the fire inside lighting it.

| File | What |
|---|---|
| `phys.js` | Kinney-Graham shock, reflection, arrival, quasi-static gas, fireball; materials; the charges' TNT equivalents (`TNT`, public figures, coarse) |
| `patch.js` | `buildPatch(spec)`: the lattice for any set of axis-aligned plates in a local frame (bonds, cells, frames and ties, plastic bending, tear-out speeds, gas spaces, fixed edges); `loadPatch(P, charge)`: shock per node, line of sight, soot, gas sources, crack starts; `gasStep`, `sources`, `tearCells` |
| `gpu.js` | `createPool(gl)`: the bench's three passes (bonds, nodes, cells) with a patch dimension: up to 8 patches share one set of RGBA32F textures and one set of passes a step; async snapshot and cell readbacks |
| `runner.js` | `createRunner(gl)`: patches from spec to final state; never runs past the time shown (`target`); snapshots (skin plates as displacement + flags grids, the inner structure near a hole as dots, the numbers); results (plastic work, frames torn, the torn rim, the hole's middle) |
| `spec.js` | a hit on a ship -> spec (`hitSpec`: side or deck patch aligned to the model surface, the class's plating, decks, frame spacing, a bulkhead, the spaces, the charge by fuze); a cook-off (`cookSpec`: the module's contents at the deck over it, no decks inside its box) |
| `worker.js` | the solver in a Web Worker on an OffscreenCanvas WebGL2 context, one slice of steps per game frame (the game's tick carries the GPU time it can spare) |
| `client.js` | the game's side: the worker, else the runner on the main thread with its own offscreen context, else nothing (the analytic marks stand) |
| `system.js` | `createBlast(game)`: the game system `blast` (main.js optional list) |
| `shell/model.js`, `shell/gpu.js`, `shell/gpu_wgpu.js`, `shell/runner.js` | the shell solver: the bench's build / loads / sources / gas / fragments from a spec (`sceneOf`: plates -> pieces, open edges on the patch's fixed faces, the up axis), its GPU passes on WebGL2 and WebGPU (copied; gravity along the up axis), a runner with the lattice runner's interface (grid 0.25 m) |
| `lab.js`, `check.js`, `shell/check.js` | dev: staged hits with stills; each bench's test section through this module's runners |

## In the game (how the whole system works now)

### The path of a hit
1. **Hand-over.** game/scars.js keeps a mark's bookkeeping and asks `game.blast.accepts(u, kind)`: a ship (not a boat
   under water), a blast charge (gun rounds stay scars.js pockmarks, torpedoes under the keel stay sim/ship.js
   `undex`). `hit` / `cook` build a spec (`spec.js`), queue it for the worker and draw nothing new until the first
   snapshot; the analytic carve stands meanwhile.
2. **The spec** (`spec.js hitSpec` / `cookSpec`): a patch frame on the model surface (side, deck, or a deckhouse wall
   found by `wallNear`: x-binned search for the outermost wall within reach, taken as a superstructure plate), the
   class's plating and scantlings by zone (hull, belt, deck, superstructure aluminium or HTS on the carrier), decks,
   the nearest bulkhead, gas spaces, openings (`ventsOf`), the charge by fuze (delayed 1.6 m in, contact, stand-off;
   a cook-off from the module's `contents`), the seeded failure-strain scatter. Up to 3 skin plates a patch.
3. **The solve** (`worker.js` -> `shell/runner.js`, WebGPU `shell/gpu_wgpu.js`, else WebGL2 `shell/gpu.js`; the
   lattice `runner.js` only without either): the shell FE on a 0.25 m graded grid, never past the time the game shows
   since the hit, in a GPU slice a frame (`cfg.gpuMsShell` 8 ms, 10 in slow motion; divided 1.6x for each extra patch
   running). Bench ports: 1.4x step, the burn ends below 20 kPa, loose cells gas-off, pinned pieces detach; petals v2:
   two twin nodes a node, the CPU applies the GPU's crack splits (CRK / CRK2), the flaps' effective stiffness during
   the solve (`effK`) and their vents (`flapVents`). Read-backs are tagged with their step and used `cfg.latMs` later.
4. **Snapshots and the end**: skin plates as displacement + flags grids (texel w: 1 torn, 2 gone, 4 torn edge, 8
   unsupported, fraction: soot) uploaded to one atlas (`upTexels` a frame), the interior near a hole as dots, the
   numbers (torn m2, flap m2, frames torn, plastic work). At the end: the solver's loose pieces become bodies (below),
   the result is fed back (`game.structure.refine`) and the sim's holes are painted (`simHoles`).

### What is drawn
- **The model's own dots** follow the skin plates in the vertex shader (engine/models.js `blastAt`, `BTMAX` patches an
  instance): the smooth ragged torn field (three-scale domain-warped noise against a threshold, `mk` / `thr`), torn
  cells' plating curled off its corners (petals), dents lit along their bent face, a stretch limit (a cell pulled past
  ~2.2-3x tears, its last stretch a hot edge), columns of structure dropped where their plating went (torn, gone,
  unsupported, thrown > 0.8 m, a deck sloped past 0.47; beyond a deck plate's edge within ~3 m), model lines on
  plating bent past ~30 deg dropped, interior parts hidden behind held plating or under the sea outside the plates.
  The torn rim: hot (warm white to amber, flickering) then a light bare-steel line; soot greys the plating round it.
  Back faces are culled except within 40 m of a patch (seen through a hole, the far side shows).
- **The inner structure** near a hole (`drawInner`): decks, bulkheads, frames' webs as charred dots, the fire inside
  lighting them; the floodwater at the sim's water level in each flooded space behind the hole (`drawWater`); at a
  waterline hole while the space fills, the sea pouring in (`drawInrush`: from the sim's head, sea outside over
  `S.H` inside; white churn at the opening, a foaming sheet over the lip, spray where it lands).
- **Loose pieces** (`support.js createBodies`, `drawBodies`): the solver's fragments and every column of the model's
  dots the shader drops (`detachScan` / `detachWork`, a time budget a frame; `settleSupport` after the solve, orphans
  included) fly as clumps (crumpled, ragged foot, facets, a hard landing squashes them) or dot sprays; they land on
  the deck (`floorAt`: the model's columns, the solved plates), sink in the sea, rest only where their lowest points
  are within 0.25 m of what is under them (`tryRest`: held up on an edge they slide and tip off; still caught after
  1.5 s a small one breaks up, a large one settles).
- **The CPU mirror**: `support.js classify` replays the shader's rules on the CPU copy of the texels (the same
  `wreckHash`, the same thresholds), so what the shader drops is exactly what the bodies carry. Change one, change
  both.
- The final state stays for the match, in the model frame; it rides game/structure's pieces (`poseAt`) when she breaks.

### The sim's holes (authoritative)
sim/ship.js `u.ship.holes` floods her. A hole goes in the outside boundary of its space nearest the point (`outK`: the
entry punch, the struck skin, a tear running into the next space); the gas splits plating only within
`SHIPK.gasReach` (4 m/kg^1/3) of the charge, tapering; a space's shell hole is the nearest failed boundary.
`simHoles` opens the patch's shell plate (plate 0 only) to at least the sim's outline (12 ragged lobes and a per-texel
bite), rechecked every second as holes grow; a hole no patch covers becomes a scars.js analytic hole
(`game.scars.holeAt`) with its boundary's own normal (a deck faces up). The solved tear may be larger than the sim's
hole (D49): the sim hole is the minimum shown, not a cap.

### Fallbacks and guards
- No WebGPU: WebGL2 shell in the worker; no worker: the main-thread runner; no GPU context: nothing, the analytic
  scars.js marks stand. `?blast=lattice` / `?blast=off`.
- Failed maps resolve empty; the runner's stall watchdog (6 s, 8 s for the last read); device-lost recovery in the
  worker; a main-side patch watchdog (12 s, 90 s in slow motion) fails a patch that stops reporting.
- Frame guard (`frameScale`): the solver's share drops toward 0.3 while game frames run past ~24 ms, and recovers
  below ~20 ms; the WebGPU queue is kept 2 deep at a small share. Several patches split the budget.
- Each ship class's CPU dot cloud (~35 ms a cruiser) is built ahead on a frame with no solve running, one class a
  second, once its model is sampled (`dotsReady`), so a first hit does not pay for it. The WebGPU shaders read the
  patch's sizes and buffer offsets from a small uniform (binding 7, `CDEF` / `szData` in shell/gpu_wgpu.js) instead
  of having them baked in, and the pipelines are cached per device by their source: only the feature switches
  (petals, up axis...) make variants, compiled once a session (~0.4 s each: in practice a side and a deck variant);
  every later hit starts stepping in ~35 ms.
- cg_deck's 4.5-5 s runs are not a warm-up: the first cg_deck after a page load draws the sim's magazine cook-off
  (magF, W 90) with the hit, two patches solving at once; later runs (another point in the sim's random stream) do
  not.

### QA tools
- `game/lab.html` (`src/dev/lab`): one hit at a time, by hand or from the console (`window.LAB`): any target, any round,
  overrides (TNT, fuze, delay, standoff, speed), frame steps held until the solve reaches the time shown, step back by
  a re-run, the patch / charge / shock front / sim holes / pieces over the view, the plates' texels as maps, captures
  to contact sheets and `report.json`. The battery's cases load as aim presets (`lab.html?case=ddg_mid`).
- `dev/blast_qa.js`: the battery (31 cases: DDG side / deck / sheer / waterline / superstructure / VLS cook-off /
  break-up / doors / flooding, CG, CVN, LCS, LHD). In the game page console:
  `(await import('/game/src/dev/blast_qa.js')).start(ONIKS, { only, dir, keep })`, results in `window.QA.rows`
  (resolve s, solve p50 / p95 ms, torn m2, flap m2, the sim's systems, qa.js flags), stills at 1 s and settled from
  60 / 25 / 12 / 300 m to `game/shots/<dir>/`. The tab must stay visible (a hidden page stalls; keep each poll < 45 s).
- `qa.js check()`: floating, hovering, resting-air, hanging, big-piece (hard), orphan (info).
- `QA.md`: the reviewers' defect list (Dn), the open-items table with owners, every run's numbers.
- `check.js` / `shell/check.js`: the bench's test sections through these runners (parity). `lab.js`: staged hits.
- `game/balance.html?n=32&seed=17`: AI-vs-AI batches (a sim change to holes or gas moves the win rates).

Console: `ONIKS.game.blast` (`stats`, `patches`, `byUnit`, `cfg`, `await solverStats()`, `floorAt`, `taken`).
