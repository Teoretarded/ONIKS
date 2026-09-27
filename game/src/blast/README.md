# blast: ship hits solved on the GPU

The blast bench's structural models (`game/concepts/blast`) running in the game, render side. The headless sim (hp, modules, flooding) stays authoritative and deterministic; this decides what the plating looks
like and feeds game/structure's flooding and girder.

## Two solvers (swappable: same spec, same snapshots)

| Solver | Bench commit | Model | Cost (RX 9070 XT) | In game |
|---|---|---|---|---|
| `shell` (`shell/`) | 882692c (petals prototype not ported) | shell FE (CST membranes, J2 + strain-dependent Cowper-Symonds, hinges; stiffeners as shear-limited beams on their own line with web-end ties into the plates they meet; GL mesh-scaled erosion, absorbing edges, water backing and a waterline burst's water shock, products inflow through openings, hole/image sources that cannot focus, contact, fragments), 0.25 m, dt ~12 us (9 us on a carrier's plating), no mass scaling | WebGPU (`gpu_wgpu.js`, in the worker: 200 steps a command buffer, mapAsync read backs) or WebGL2 (`gpu.js`, ~30 calls a step). Bench box: P-800 contact 13.6k steps 1.1 s, inside 32.6k steps 1.9 s of full GPU | **default** where the browser has WebGPU: a 6 ms slice a frame (`cfg.gpuMsShell`, 8 in slow motion), ~80-150 steps a frame. In play (60 Hz frames, the GPU shared with another game tab): 5-inch 0.9 s, SM-6 1.4-2.4 s, Kh-35 / Oniks side inside 3.8-4.2 s, waterline 4.9 s, LCS 3.3 s, a carrier 4.6 s, a deck hit 3.3-6.8 s (10.8 under heavy load), a VLS cook-off 6.4 s; the synced frame p50 +5-6 ms, p95 16-21 ms while a hit solves |
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

## In the game

- **Which hits**: a ship (not a submerged boat), a blast charge (not gun rounds: those are penetration, scars.js
  pockmarks; not torpedoes under the keel). game/scars.js hands them over (`game.blast.accepts` / `hit` / `cook`) and
  keeps the mark's bookkeeping, fire and hooks; its analytic carve and interior are left out while the patch stands.
- **The patch**: the plating round the hit as a flat grid tangent to the model surface (side: vertical, normal
  horizontal and outward; deck: horizontal), half-width 2.5 W^(1/3) m (3-10 m, 14 m over ~300 kg), up to the deck over
  the hit at that station (a skin plate too) and down as far, 6 m inboard at most; decks at the class's levels, the
  nearest transverse bulkhead, gas spaces between them up to the far side (nearest the charge first, 7 at most); edges
  fixed. Plating (mm) by class and zone (`HULL`: DDG/CG side 10 HSLA, belt 12, deck 9, superstructure 6 aluminium; Nimitz
  side 22, flight deck 45; LHD side 12, flight deck 20; LCS aluminium 7; craft 5), frames 2.4 m (carrier 1.8, LCS 1.2),
  longitudinals 0.75 m.
- **The charge**: TNT equivalent of the round (`phys.js TNT`); a delayed fuze (Oniks, Kalibr, Kh-35, Tomahawk, SLAM-ER,
  a bomb) 1.6 m in along its path, a contact or stand-off burst outside (blast-frag SAMs at 80 %: scars.js adds their
  fragment pockmarks). A cook-off: the module's `contents` (data/modules.js: explosive that detonates, the rest and the
  propellant burning as gas ~0.25 TNT-eq, fuel vapour capped ~0.8 MPa), in the upper part of the module's space.
- **Time**: the worker never runs past the physical time the game shows since the hit: at x0.1 / x0.02 (the impact
  tester) the plate tears in step with the fireball; at x1 it runs as fast as its GPU share allows (3 ms a frame, 5 in
  slow motion, less when the game's own frame is heavy): an outside hit settles in ~0.2-1 s, an inside one in ~2-4 s.
- **Drawn**: the model's own dots follow the skin plates (engine/models.js `blastAt`: the atlas texture, 6 patches an
  instance); the inner structure near a hole (decks, the bulkhead, the frames' webs) as charred dots lit by the fire;
  fires re-seated on the torn rim and the deck inside when it settles; ejecta when the plating tears. The final state
  stays for the match, in the model frame: it rides game/structure's pieces (`poseAt`) when the ship breaks.
- **Fed back**: `game.structure.refine(id, t, { A, below, frames, work, ... })`: the solved torn area (its share
  under the water floods) and the frames torn / plastic work (the girder).

Console: `ONIKS.game.blast` (`stats`, `patches`, `last(id)`, `await solverStats()`, `cfg`), stills:
`(await import('/game/src/blast/lab.js')).stage(ONIKS, { type, loc, kind, from, rate, view, shots })`, the port against
the bench's section: `(await import('/game/src/blast/check.js')).run({ kg, fuze })`.
