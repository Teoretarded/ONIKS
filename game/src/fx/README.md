# fx

The game-trailer spectacle, in the films' Point Cloud look: launches, plumes, smoke that lingers and drifts,
intercepts, hits, fires, splashes, wakes, tracers, lightning, rain. Plain ES modules, renderer-agnostic: every
effect draws into a **sink**. Test bench: `game/fx.html` (http://localhost:8771/game/fx.html).

Rules kept from the films: every particle is an analytic function of its age plus a seeded per-particle index
(no `Math.random` in drawing, no per-particle state). The only records kept are emission data: where a smoke puff,
a wake row or a smoke-column parcel was laid, and when. Colours are the films': white, lime `#C6F432` for hot gas
and own, grey smoke; coral is never used by FX (hostile marks belong to the sensors). Real scales and timings.

## System

```js
import { createFx } from './fx/index.js';
game.addSystem(createFx(game, { budget: 150000, wakes: true, fog: true }));   // name 'fx', priority 5
```

| | |
|---|---|
| `onEvent(ev)` | spawns one-shot effects from sim events (table below) |
| `update(dtReal, dtSim)` | keeps the persistent ones fed from `game.sim`: projectile trails (puffs laid along `p.pos` since the last frame), wakes of moving ships, fires on damaged and dying units, sinking slicks, aircraft trailing smoke, wreck fires on the ground |
| `draw3d(frame)` | draws everything into `frame.sink` at `frame.t` (the interpolated sim time), in three layers: flashes, heads and flames first (never cut), then debris, splashes and tracers, then smoke, wakes and weather |
| `stats` | `{ dots, q, effects, trails, ms }` of the last frame (`q` is the thinning factor, 1 = full) |
| `wakes` | true: the render system leaves ship wakes to FX (it reads `game.getSystem('fx').wakes`) |
| `ownTrails` | true: FX draws the Kh-35U / Kalibr plumes and smoke (the render system's stop-gap trail for those kinds can go) |
| `budget` | dots per frame (default 150 000), also the hard cap. Over 85% of it, `q` drops for the next frame (every effect scales its dot counts by `q`); a spike frame that still reaches the cap loses its last-drawn smoke, never a flash or a head (drawn first). `q` recovers slowly when under. |

What it reads: `game.sim` (`t`, `DT`, `units`, `projectiles`, `weather.{kind, wind, squalls}`, `visible()`,
`projVisible()`), `game.side` (fog: only what the player's side sees gets effects), `game.map.h`,
`game.ground(x, z)` (else `renderer.terrain.heightAt`, else the map), `game.unitPose(u, alpha)`,
`frame.{sink, t, alpha, realT, R}`. Flames and muzzle flicker run on real time (`frame.realT`) so a time-lapse
never strobes them; everything else runs on sim time, so the picture is right at any rate (x32 ages smoke 32x
faster, as it should).

## Sink

Colours 0..255, alpha 0..1. Sizes > 0 are px at 1080p, < 0 metres. World metres, X east, Y up, Z north.

```js
sink.dot(x, y, z, size, r, g, b, a)          // REQUIRED  film dot: square, MAX blend, depth tested
sink.add(x, y, z, size, r, g, b, a)          // additive square dot (hot cores, sparks, the dotted halo of light)
sink.glow(x, y, z, radius, r, g, b, a)       // soft additive disc (1 - d^2/R^2)^2 (blooms)
sink.light(x, y, z, r, g, b, intensity, radiusM)   // dynamic light: dots within radiusM brighten
                                                     //   by rgb * intensity * (1 - d^2/r^2)^2; 1 = a strong flash
sink.lift(v, r, g, b)                        // full-frame additive lift (lightning), v 0..1
sink.model(key, pos, R9, alpha) -> bool      // optional: queue a model instance (R9 3x3 row-major); false if unknown
sink.cam = { eye, f, r, u, fl /* px at 1080p */, tanX, tanY, near }   // REQUIRED for LOD and culling
```

`game/src/game/game.js` provides exactly this as `frame.sink` over `R.fx` / `R.light` (dot = `R.fx.dotXYZ(...,
'max')`, add = `'add'`, glow = `R.fx.glow`). `sink.model` is optional: without it FX queues the tumbling booster
casings (`oniksBooster`, `mk72`) through `frame.R.draw` when the engine knows the key, else draws a cylinder of dots.
A minimal sink with only `dot` / `glow` works too: `glow` is then taken as the additive dot and discs become
additive dots. Without `frame.sink`, `engineSink(renderer)` (exported) builds one from the engine.

Light intensities are tuned to the engine's rule (`rgb * intensity * w`, added to dots, then `* .9` on terrain):
flashes use .4 - 1.4, fires .3, plumes .1 - .35.

## Events -> effects

| Event | Effect |
|---|---|
| `launch` kind `oniks` | **ColdLaunch** at `pos` along `hdg/pitch`: gas out of the tube mouth, the front cap blown off and tumbling, the booster lighting .38 s later a dozen metres up (flash, lime halo of dots, light on the launcher and pad, a bright ring where the jet hits the pad), the jet's smoke rolling out along the ground and rising as a column |
| `launch` `sm6` / `tlam` from a ship | **VlsLaunch**: cell flash and light, the exhaust rolling over the deck, rising, drifting aft |
| `launch` `uran` (Kh-35U, Bal) | **BalLaunch** at the container's mouth along the raised pack: the booster lighting in its container (a flash lighting the pack, the vehicle and the ground), the efflux out of the container's front end rolling over the cab and onto the ground (a ring where it hits), the jet splashing off the pack, smoke and dust under the first twenty metres of the climb. Then the 2 s booster (plume `khBoost`, a short dense column `STAGE.kh`), `booster_sep` drops the 0.6 m casing, and the turbofan: no flame, a faint shimmer behind the tail (`fanKh`) and a faint thread of trail (`STAGE.fan`) |
| `launch` `kalibr` (Kilo's tubes), `tlam` from a submerged boat (Virginia's payload tubes) | **SubLaunch** on the sea over the tube: the dome of water heaving up as the round breaches, a column of water dragged up and falling back (drops flicking off the sea where they land), the booster lighting 0.15 s later a few metres up (flash, lime dotted halo, light on the water, a ring blasted across it), a cloud of steam rolling out over the sea and rising, the spray coming down in three rings, foam. The motor's plume and smoke start at the ignition (the tracker's `ig`). Kalibr: 5 s booster (`kalBoost`, the Oniks-grade column), then the turbofan (`fanKal`); the terminal stage's rocket (`PLUME.dash` at its own nozzle, `STAGE.sustain`) only when the sim flies a dash (`p.dash` or phase `'dash'`; the game's sim has none yet, the bench flies one) |
| `launch` `mk54` / `mk48` / `t53` | **TorpLaunch**: from a ship's deck tubes a puff of air, the closed round arcing out outboard (carrying the ship's speed) and a small splash clear of the hull; from a helicopter the round falling nose-down under its drogue chute at 18 m/s (the sim's fall) and a splash under the helicopter, the chute lying on the water a moment; from a boat's bow tubes nothing, or a faint boil when it runs shallow |
| (every torpedo, from `sim.projectiles`) | **Bubbles**: a faint line of bubbles breaking on the surface over the run (a record every 0.25 s; they reach the surface 0.8 s late, flicker, spread, fade in 24 s; fainter the deeper it runs). Only where the player's side sees the torpedo |
| `launch` `shell` | **GunBlast** (5"/62): white core, a pear of fire out along the bore, the blast ring, the pressure ring on the water, gun smoke drifting off |
| `launch` `sam` / `pdms` / `hellfire` / other | **HotLaunch**: flash, smoke blown back out of the tube and forward with the round |
| (every projectile, from `sim.projectiles`) | **Trail**: puffs laid along the flight from the nozzle; white-hot at birth, lime for a moment, then pale smoke that spreads with the square root of age, rises, drifts downwind (more with height) and fades (booster 75 s, sustainer 20 s, glide 9 s). Oniks after separation: the ramjet's lime line of air. Tomahawk / SLAM cruise: a faint heat shimmer. **Plume** at the nozzle every frame: a jet of dots pinched into shock diamonds (rings of dots close up), white core, lime halo, a light on what is near; interceptors far off are a white point in a lime halo |
| `booster_sep` | **BoosterSep**: a pop of light and gas, the spent casing (HD `oniksBooster` / `mk72` model) tumbling away and falling; a **Splash** where it meets the sea |
| `intercept` by a missile | **Burst**: white core and flash, dotted lime halo, a light streak across the lens, the fireball (lobes cooling white -> lime -> smoke), sparks, fragments carrying both rounds' momentum, burning brands trailing dots, a splash column and ring for each fragment that reaches the sea, the smoke ball drifting and thinning |
| `intercept` by `ciws` / `gun30` | the same, big and heavy, the round's momentum carrying its debris on toward the ship |
| `gunfire` | **TracerStream** (Phalanx 75 rds/s; 2A38M two guns 2 x 40 rds/s): every round's firing time, direction and water entry from its index, lime streaks a frame and a half long, walking onto the round; the rest fly on into the sea with small splashes. **Muzzle**: flickering white point and flame, glow, light, gun smoke |
| `hit` by a torpedo (`under`) on a ship | **TorpedoHit**: no fireball. A pale light under the water and a shock ring flicking across the sea, the water heaving up along the hull and a white column climbing on both sides of it (Mk 48 / 533 mm ~110 m, Mk 54 ~45 m), slow, its heads cauliflowering, coming down in curtains (linear drag with gravity inside it: ~10 s up and down), a base surge of spray rolling out low, mist hanging and drifting downwind, foam round the hull for a minute. The ship's **Fire** starts 3 s later where the hull broke (amidships) |
| `hit` by a torpedo on a submerged boat | the same, as a dome of spray and a boil, smaller the deeper it went off; no fire |
| `hit` on a ship | **Blast**: flash lighting hull and water, the fireball swelling, lifting off the hull and cooling white -> lime -> smoke, dotted lime halo, lens streak, hot fragments arcing with tails, water thrown off the waterline. The ship starts to **Fire** (below) |
| `hit` on land | Blast + **Dirt** (dust and clods in a cone, the dust column and base surge, a ground ring), the unit starts to burn |
| `hit` on an aircraft | a small **Burst**; the aircraft trails smoke (a Trail on the unit) |
| `hit` by a gun (`ciws`, `gun30`) | small Blast, no fire |
| `splash` in the air (`air`, self-destruct, miss) | a smaller Burst |
| `splash` on water | **Splash**: column (hollow jet and crown), ring (lime for a moment), mist drifting off, foam; plus a small Blast for a warhead |
| `splash` on land | Dirt (+ Blast for a warhead); an aircraft crash on land leaves a burning wreck |
| `destroyed` ship | a second, bigger Blast; the fire at full; **Sinking**: bubbles boiling round the hull, a slick spreading and drifting downwind, steam where the hot hull goes under |
| `destroyed` boat under the water | no blast, no fire: the air of the hull coming up in a boil 2.5 s later, Sinking without the steam |
| `destroyed` land unit | Blast; the wreck burns on (Fire; kept on the ground after `removed` for 75 s, its smoke longer) |
| `destroyed` aircraft | Burst; a thick smoke trail as it falls |
| `lightning` | **Lightning**: the leader stepping down, a jagged channel (midpoint displacement) with branches and strokes in the cloud base, white-lime core with a lime breath, flicker with dips between return strokes, sparks at the strike, a light over kilometres and a frame lift; freezes the rain |
| `takeoff` fighter | afterburner for 7 s (**drawJet**: lime-white cones with shock diamonds, heat shimmer) and a puff at the catapult |
| `takeoff` E-2D | the catapult's breath of steam (HotLaunch `steam`: white, no flash) |
| (boats, every frame) | a boat marks the sea only as near the surface as it runs: wake rows carry a strength (1 surfaced, 0.15 at periscope depth: a slight scar with feathered arms, 0 deep), so the wake it left fades on its own when it dives; at periscope depth its raised masts leave a small **feather** (a mast's Kelvin wake, a bow wave off the mast and a plume of spray thrown up and back). **SubWater** from the depth crossing the thresholds: the sail breaking the surface (water pouring off its top and sides, foam round its foot), the casing breaking it (water streaming down the hull's sides, the blow boiling white along both sides, fountains of spray from the flood holes); diving, spray jetting from the vents along the casing and its mist drifting off, two lines of foam closing over the deck, a swirl where the sail goes under |
| (E-2D, every frame) | **drawProps**: the two eight-bladed props as shimmering discs (a new scatter every frame, the tips' path a brighter ring), faint heat wavering out of the T56 exhaust stubs |
| (units, every frame) | **Wake** behind every ship from speed and heading (Kelvin arms at 19.47 deg with feathered crests, churned centre, prop wash boiling astern, bow wave rolling off the stem, spray at speed); **Fire** on damaged units (flame tongues rising and dying at their own heights, white-hot to lime, a light, a smoke column rising fast, spreading under its ceiling and leaning downwind with height; a destroyer's column tops out at 400-900 m); **Downwash** under a helicopter below ~40 m (a ring of spray on water, dust on land); jet heat shimmer |
| weather `rain` / `storm` | near rain: a world lattice of drops round the lens, streaked by their fall (short while lightning freezes them); rain shafts under the squalls far off |

## Files

| | |
|---|---|
| `index.js` | the system, event and state wiring, flight profiles, the budget, `engineSink` |
| `lib/core.js` | colours, seeded tables (gaussian, ball, disc), hash, noise, `View` (LOD, culling), ballistic tables, `yDrag` / `dropTime` (linear drag with gravity inside it: water that hangs and comes down slowly), dotted halo, lens streak |
| `lib/smoke.js` | `Trail` and its stages |
| `lib/plume.js` | `drawPlume` (motors, ramjet, afterburner), `drawHead` |
| `lib/launch.js` | `ColdLaunch`, `VlsLaunch`, `HotLaunch`, `GunBlast`, `BalLaunch`, `SubLaunch`, `TorpLaunch` |
| `lib/burst.js` | `Burst` (air bursts), `BoosterSep` |
| `lib/impact.js` | `Splash`, `Dirt`, `Blast`, `Fire`, `Sinking`, `TorpedoHit` |
| `lib/guns.js` | `TracerStream`, `Muzzle` |
| `lib/water.js` | `Wake` (with row strength and the mast `feather`), `Downwash`, `Bubbles`, `SubWater` |
| `lib/air.js` | `drawJet`, `drawProps` (E-2D) |
| `lib/weather.js` | `Lightning`, `drawRain`, `drawShafts` |
| `bench/*` | the bench: the films' CPU renderer as a sink (`cpu.js`), a coast with HD models (`scene.js`), a stand-in sim (`sim.js`), the page logic (`main.js`) |

Each effect is `new X(opts)` with `t0` and `dur`, and `draw(C, age)`; `C` is the frame context (`C.dot/glow/halo/
light/lift/model`, `C.V` the view, `C.t`, `C.tr` real time, `C.q` thinning, `C.wind`, `C.ground`).

## Bench

`game/fx.html`: a button per effect (scheduled at the current time; the script replays exactly on a scrub; the new
units' buttons: Kh-35 · Bal, Kalibr · Kilo, Tomahawk · SSN, Torpedo · DDG, Torpedo · helo, Torpedo hit, Torpedo · boat,
Kilo surface / periscope / deep, E-2D, Catapult · E-2D; focus bal, kilo, ssn, aew),
**Salvo** (4 launches from the battery, 4 more rounds inbound, 6 stopped: 4 by SM-6, 2 by the Phalanx, 2 hits, the
ship sinking), a timeline to scrub every age, focus and distance buttons (20 m .. 30 km), drag to orbit, wheel to
zoom, `space` play/pause, `,` `.` one tick, `j` `l` one second. Readout: FX ms, dots, `q`, frame ms.
URL: `?do=salvo@1,cold@3&t=19&focus=ship&dist=1200&yaw=-35&pitch=5&budget=40000`.
Console: `FXB.go(t)`, `FXB.set({ focus, dist, yaw, pitch })`, `FXB.shot(name[, crop, k])` saves
`game/shots/fx/<name>.png`, `FXB.bench(n)`.

Measured (bench, 1920x1080, steady state): the worst salvo moment 60-96k dots, 4-4.5 ms FX CPU; 30 km over the
whole salvo 21k dots, 1.7 ms; a single launch or hit 5-40k dots, 0.5-3 ms. Forced `budget=20000` holds 20k with
`q` .12 and still reads. In the WebGL game a launch + hit sequence ran 21k dots at 2.4 ms.

New units (bench, 1920x1080, steady, CPU): a Bal launch 15-27k dots 1.4-2 ms for its first seconds; a Kalibr
out of the sea 30-36k dots 1.5-2.5 ms at 100 m, 3k at 1 km, 2k at 10 km; a torpedo column 17-26k dots 0.8-1.3 ms at
110 m, 10-12k 0.6 ms at 1 km, 1.3k at 10 km. Always on: two boats' wakes, feathers and surfacing water 0.05 ms, the
E-2D's props 0.09 ms close (nothing past a few hundred metres). In the WebGL game a Kalibr launch ran 30k dots 1.7 ms
(high), 24k 1.3 ms (medium), 12k 0.6 ms (low).

## Known gaps

- Trails are fed once per frame: at high time rates (x16, x32) a fast round moves 0.5-1.2 km between frames and
  the trail is a chain of straight segments.
- Smoke is not occluded by terrain in the CPU bench (it is in the engine, by the depth mesh), and puffs are not
  shaded by the moon (the films do not shade them either).
- The Phalanx / 30 mm streams are drawn from the gun's muzzle event position; mounts do not slew in FX (the
  render system owns the model state).
- A round launched and killed within one frame (possible at x32) gives its burst no momentum.
- The Kalibr's supersonic dash is drawn only if the sim flies one (`p.dash`); its plume sits at the terminal stage's
  own nozzle, so the render system should then draw that stage alone.
- Torpedoes are not drawn under the water (only their bubble line, and a dropped one while it falls).
