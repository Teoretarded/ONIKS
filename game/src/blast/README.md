# blast: ship hits solved on the GPU

The blast bench's structural models (`game/concepts/blast`) running in the game, render side. The headless sim (hp, modules, flooding) stays authoritative and deterministic; this decides what the plating looks
like and feeds game/structure's flooding and girder.

## Two solvers (swappable: same spec, same snapshots)

| Solver | Bench commit | Model | Cost (RX 9070 XT) | In game |
|---|---|---|---|---|
| `lattice` (`patch.js`, `gpu.js`, `runner.js`) | 1596bde | elastic-plastic lattice, velocity tear-out, running cracks, x64 mass scaling once only gas acts | ~52 us a step for 36k nodes; Oniks contact 3.6k steps, inside 8.2k | **default**: an outside hit settles in 0.2-1 s, an inside one in 2-4 s at 3 ms of GPU a frame |
| `shell` (`shell/`) | ca26a00 | shell FE (CST membranes, J2 + strain-dependent Cowper-Symonds, hinges, stiffener members with their bending on their own nodes, GL mesh-scaled erosion, absorbing edges, water backing, products inflow through openings, hole/image sources that cannot focus, contact, fragments), 0.25 m, no mass scaling (dt ~12 us; 9 us on a carrier's thick plating) | bench box: P-800 contact 13.2k steps 0.86 s, inside 32.6k steps 2.3 s of full GPU (quiet). A step costs ~0.05 ms of GPU plus ~0.07 ms of WebGL calls whatever the patch's size, and the calls run in Chrome's GPU process beside the game's frame | `?blast=shell` (or `ONIKS.game.blast.cfg.solver = 'shell'`). Game patches: outside hits 11-13k steps, inside 20-33k, a carrier 44k; at the lattice's share (3 ms a frame) an inside Oniks took 10-17 s (the lattice 3.4 s, same run); 400 steps a slice brought it to ~4 s but stalled the game's frame (p50 5 -> 49 ms). Not the default until a step costs less |

The shell port matches the bench (ca26a00) on its own test box at 0.25 m (`shell/check.js`, the bench's `runCaseAsync`
beside it in the same page): P-800 contact side 2.75 m² / second deck 0.19 (bench 2.75 / 0.19, 13.2k steps each, dt
12.27 us both); SM-6 contact 0.75 (0.75); 5-inch 0 (0), set 51 mm (51); P-800 inside decks 38 / 56 m², bulkheads 35 / 36
(bench 46-51 / 56-58, 33-37 / 41: its own spread run to run, the torn-cell reads being asynchronous). It carries the
bench's fixes after 446c6a3: hinges yield on the GPU (5916518: a material uniform was left unset), torn cells reach the
hole sources, venting and products inflow in synchronous runs (64558bf). Its read backs are asynchronous once a pump
(every sync, as the bench does, cost ~17 ms a call in the worker: a round trip to the GPU process busy with the game).
The physics agent keeps optimising the bench (a beam element for 0.125 m, overhead): re-port `shell/model.js` and copy
`shell/gpu.js` from the next commit (the one change there: gravity along the patch's up axis).

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
| `shell/model.js`, `shell/gpu.js`, `shell/runner.js` | the shell solver: the bench's build / loads / sources / gas / fragments from a spec (`sceneOf`: plates -> panels, open edges on the patch's fixed faces, the up axis), its GPU passes (copied; gravity along the up axis), a runner with the lattice runner's interface (grid 0.25 m) |
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
