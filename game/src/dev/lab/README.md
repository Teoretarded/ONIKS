# ONIKS LAB: hits taken apart frame by frame

`game/lab.html` (or `play.html?mode=lab`): an empty range on a calm sea, one target, the game's own systems (the GPU
blast solver, scars, fx, debris, structure, Inspect) and the lab's panels. For a person at the screen and for an agent
at the console (`window.LAB`). Serve with `python tools/serve_game.py`, open http://127.0.0.1:8771/game/lab.html.

| File | What |
|---|---|
| `index.js` | the system `lab` (main.js loads it in lab mode), the panels, the lab camera, the keys, `window.LAB` |
| `core.js` | the range and its spots, the target, the shot (direct / mission), the overrides, the clock synced to the solver, re-runs, telemetry, events, the report |
| `draw.js` | the overlays over the view, the solver's plates as maps, the graphs against tau |
| `capture.js` | recorded filmstrips (a schedule of taus, any views), playback, contact sheets, saving |

## What it does

- **Target**: any unit type (`data/units.js`). Sea targets at a spot ~2.5 km from land (four spots 1.6 km apart: a
  re-run never sees the last shot's smoke or wreck), land units on open ground by the coast side's spawn.
- **Round**: every munition and gun the game has (`ui/inspect/impact.js munitions`), with the charge as the game takes it
  (warhead kg `scars.js WH`, TNT kg `blast/phys.js TNT`, fuze `scars.js FUZE`, the sim's `CHARGE`). Overrides: TNT kg,
  warhead kg, fuze (in / out / frag), the delayed fuze's run in (m, `blast.cfg.delay` -> `spec.js`), standoff (m), speed
  (m/s), sim damage (hp), sim damage off (picture only). Set on the game's tables for the length of the hit, then put
  back.
- **Aim**: presets cast on the model's own dots (side, bow, stern, waterline, below the waterline, superstructure, decks,
  plunging; port or starboard), the blast QA battery's cases for the type (`dev/blast_qa.js CASES`), a click on the
  model (the round comes in along the line of sight), or numbers (model frame: +X starboard, +Y up from the waterline,
  +Z bow; `from` points back along the round's way in).
- **Direct shot**: the game's own hit (`sim.emit('hit')`, `applyDamage`) on a sim tick `preroll` s after FIRE, the round
  drawn on its line at its true speed until then. The sim's damage rolls are reseeded from the shot, the steel's scatter
  is seeded by the impact's geometry: a re-run is the same shot (solver read-backs are asynchronous: within ~0.5 %).
- **Mission shot**: a shooter of the round's own type at a range and bearing (`weapons.js launch`: its flight, guidance,
  the target's defences when "Target defends" is on), the sim run ahead to `lead` s before impact, then live; the
  clock stops at the hit, or the panel says it missed / was intercepted.
- **Clock**: tau = game time since the hit. Frame steps (0.25 ms .. 1 s) run the game at x1 for exactly the step and
  hold until every running patch of the GPU solve has reached the time shown (the solver never runs ahead of it). Step
  back = the same shot re-run to that tau. Play at x1 .. x0.01.
- **Views** (the lab camera: an exact view in the target's frame, so it rides her roll and list): wide 300 m, close
  60 m, detail 25 m, macro 12 m, square-on, along the hull, top, inside (from inside the hull looking out through the
  hit), chase the round. Drag to orbit, shift- or middle-drag to pan, wheel / W S to zoom, A D orbit, Q E pitch,
  double-click a point to centre on it. V hands the camera back to the game.
- **Overlays**: aim and the struck point (part, zone, plating mm, fuze, charge), the solver's patch (box, plates, the
  charge, the fireball's radius, the shock front's radius at tau while it runs), a metre rule and scale bar and the
  model's axes, the sim's holes (what floods her) against the solved tear, the loose pieces, the QA check's flags.
- **Display**: neutral tint (no lime / coral side tint on the target), ghost hull, X-ray, FX off (smoke and fire hidden:
  the plating seen bare), full quality (the perf guard held), the key light's azimuth and elevation.
- **Panels**: tau and the solver's state (SOLVING n ms behind / SYNCED / DONE), the numbers (solved to, steps, GPU wall
  time, torn m2, flaps, under the waterline, set mm, frames torn, pieces, picture against the sim's holes, real frame
  ms), graphs against tau (a log axis: ms and s together), the solver's plates as maps (displacement, signed normal,
  flags: torn / gone / torn edge / unsupported, soot; hover a texel for its numbers), the sim (hp, flooding, holes, wet
  spaces, fires, systems out), the events (the target's and the round's, at their tau).
- **Capture**: a schedule of taus (auto: 0.25 ms steps over the first 2 ms, coarser after) up to `to`, from the chosen
  views, each frame stamped with tau and the numbers; scrub it both ways (← →), contact sheets of 16 frames, Save puts
  the sheets and `report.json` in `game/shots/lab/<name>/`. "4 views" renders now from four views into one image.

## The voxel prototype, the clean view, the damage check

- **Dots (game) / Voxels (prototype)** under Target: the same shot in the game's picture or the voxel lattice
  (`src/vox`, its README). The voxel solve is posted at FIRE, before the round lands.
- **Clean (no smoke / fire)** on by default. **Deformation** (key B): the dots coloured by how far the damage moved
  them: out lime > white > coral, in blue, loose pieces coral, untouched grey.
- **Vectors** overlay: pieces, fragments and the displacement field (rest to now) as arrows.
- **Damage check**: Probe (defects: vanished, floating, hanging, hovering, far side; the field's moved areas, away /
  toward the charge, reach), Record (`data.json` every tau, `field_<ms>.json` vectors), Compare (both pictures,
  recorded). `python tools/lab_analyze.py game/shots/lab/<name>` reads a recording in numbers.
- `probe.js`: `probe`, `field`, `deformStats`, `record`, `drawVectors`.

## For an agent

```js
await LAB.target('ddg')                                     // fresh target, model sampled, first preset aimed
LAB.aim('qa:ddg_mid')                                       // or 'side' 'wl' 'deckF'..., or { loc, from }
LAB.munition('oniks', { tnt: 120 })                         // overrides: tnt wh fuze delay standoff speed dmg simDmg
await LAB.fire()                                            // lands, clock at tau 0
await LAB.to(0.004); await LAB.still('ddg_mid_4ms')         // -> game/shots/lab/ddg_mid_4ms.png
const r = await LAB.capture({ views: ['detail', 'macro'], to: 3, name: 'ddg_mid', save: 'sheets' })
// read game/shots/lab/ddg_mid/sheet_detail_01.png ... and report.json
LAB.report()                                                // charge, patch, sim, picture vs sim, qa, perf, timeline, events
await LAB.qa()                                              // floating / hovering / resting-air / hanging / big-piece flags
LAB.plates()                                                // per plate: max displacement, torn and gone texels
```

URL: `lab.html?target=cg&kind=uran&aim=qa:cg_side&view=detail&fire=1`, or `lab.html?case=ddg_mid` (a battery case).

Keep the page visible while the solver runs: a hidden page's GPU work stalls (the lab still steps, slowly: ~4 s a
frame). JSON and JPEG saves need `tools/serve_game.py` from this commit or later (PNG works with any).
