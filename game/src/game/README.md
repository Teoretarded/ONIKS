# game: the running match

`game/src/game/game.js` owns the match. `main.js` builds the map, renderer, sim and `game`, then registers the
systems: the game's own first (`OWN`, in this order), then the optional ones. Other agents plug in by exporting a
factory from their module; `main.js` imports it if the file exists (a missing file is skipped, a broken one is logged)
and calls `game.addSystem(await createX(game, ctx))`:

| Module | Export | Name (priority): what it is |
|---|---|---|
| `render.js` | `createRender(game, DM)` | `render` (10): units, projectiles, wakes, sites (registered first, directly) |
| `select.js` | `createSelect` | `selection` (40): click / box / groups / follow, brackets and tags; `order-notes` (55): a right-click on an unclassified contact's cloud answers "NOT TRACKED · SCAN IT (X)" and which scanner reaches it (no move order), R says why nothing reloads |
| `orders.js` | `createOrders` | `orders` (50) + `targeting` (80): right-click and hotkey orders, the scan / launch aim modes |
| `amphib.js` | (via `createOrders`) | `amphib` (55): the landing force: T Land (LHD / LCAC: click a beach or inland), Unload / Dock / Board by the selection; right-click board / dock / land; landing events to the HUD log and alerts |
| `time.js` | `createTime` | `time` (30): Space, + / -, F10; rate readout and toasts without a HUD |
| `director.js` | `createDirector` | `director` (20): the cinematic camera (C; it also takes the picture when the match ends, holding the last kill to the result screen); also loads `replay.js` and returns both |
| `replay.js` | `createReplay` (via director) | `replay` (110): a decisive hit in slow motion with the X-ray sweep; J the last one again, Shift J (or the Hit replay setting) auto on / off |
| `objectives.js` | `createObjectives` | `objectives` (3; + the campaign script, `campaign/`): objectives, waves |
| `match.js` | `createMatchFlow` | `menu` (120) + `escape` (2): result, grade, end overlay, pause menu |
| `sandbox.js` | `createSandbox` | `sandbox` (60): spawn palette and tools (sandbox only) |
| `sonar.js` | `createSonar` | `sonar` (14): sonar rings, heard contacts, torpedo tracks; O dive (boats) |
| `src/fx/index.js` | `createFx(game, ctx)` | `fx` (5): launches, plumes, trails, hits, fires, wakes, weather; detail = the Effects setting |
| `src/ui/sensors.js` or `src/ui/sensors/index.js` | `createSensors(game, ctx)` | `sensors` (15): radar picture, contacts, the SCAN, radar view (V), storms |
| `src/ui/inspect.js` or `src/ui/inspect/index.js` | `createInspect(game, ctx)` | `inspect` (100): Inspect / Anatomy (I), X-ray, exploded view |
| `src/audio/index.js` | `createAudio(game, ctx)` | `audio` (1) |
| `src/ui/hud/index.js` or `src/ui/hud.js` | `createHud(game, ctx)` | `hud` (70) |
| `landmarks.js` | `createLandmarks(game, ctx)` | `landmarks` (12): each map's set pieces, civilian ships, nav lights, plumes, flares; detail = the Effects setting |
| `orbital.js` | `createOrbital(game)` | `orbital` (16) + `orbital-pre` (14): past ~40 km the picture fades into the Orbital hairlines; the Orbital render style |
| `src/ui/help/index.js` | `createHelp(game)` | `help` (130): F1 controls (from `KEYBINDS`), the pause menu's in-game settings, settings applied live |
| `filmmaker.js` | `createFilmmaker(game)` | `filmmaker` (125): F9 compose a camera take over the live match and play it clean; F8 stills |
| `debris.js` + `debris/` | `createDebris(game)` | `debris` (11): hit things come apart as rigid bodies: a round stopped in the air snaps at the hit into two sections, its fins and wings tumble off, the struck part shatters into shards; a round knocked out of control (`spinout`, `p.ctrl === false`) is drawn tumbling (plume and smoke swinging round with it) and sheds fins, wings, then its tail section; an aircraft shot down comes apart as it falls (rotor, wings, tails; the fuselage sinks or lies where it fell); a ship or vehicle destroyed throws off masts (toppling over the side), arrays, mounts, turrets, cranes, boats (pieces strike hulls, land on decks, splash, skip, sink, float, bounce and rest as wreck pieces). Deterministic from the event, cap 400 bodies. Bullet time on a spectacular break-up near the camera (the Hit replay setting). Render hooks `game.debris.unit(u, d)` / `proj(p, d)`, FX hook `head(p, t, out)`, replay hook `gone(id)`, bus `breakup`; console `game.debris.demo(kind, { mode: 'breakup' \| 'spin' })` |
| `perfguard.js` | `createPerfGuard(game)` | `perfguard` (0, registered last: it wraps `game.frame`): Auto quality (Settings): the frame-time watchdog that holds 60 fps. It times each frame (main thread and GPU), sets `game.stepBudgetMs` to what drawing leaves of 14 ms, and above 14 ms for a second steps the effects budget, then (only while the GPU carries the frame) the dot density and the render scale down, back up with headroom, never oscillating. `game.quality` (level, label for the FPS readout, log); the perf suite holds it (`game.quality.hold`) |

A factory may return one system, an array of systems, a Promise of either, or null. `ctx = { DM /* data/models.js */,
params, mission, match }`. `?nosys=fx,audio` skips optional systems (debugging).

## The `game` object

```js
game = {
  sim, map, renderer /* = R */, R, camera, overlay /* R.overlay */, uiRoot /* #ui DOM layer */, models /* data/models.js */,
  side,                 // the player's side ('coast' | 'fleet'); read it every frame: sandbox can switch it (bus 'side')
  enemy,                // getter: the other side
  settings,             // data/settings.js getSettings() (kept live)
  mode, params, mission,// 'sandbox' | 'combat' | 'campaign'; parsed URL (game/setup.js parseParams); campaign mission or null
  selection: Set<unitId>, hover /* unit id or null */, groups /* {1..9: [ids]} */,
  timeRate /* 1 2 4 8 16 32 */, paused, autoSlow /* drop to x1 on launch / new contact */,
  alpha,                // render interpolation 0..1 between the sim's last two ticks
  t,                    // interpolated sim time (what is drawn)
  seaT,                 // swell clock (terrain.seaAt(x, z, game.seaT)); runs at min(rate, 2)
  realT, frameN, dtReal, dtSim, stepsLast, stepMs,
  ui: { hidden }, cinematic, mouse: { x, y, in, down },
  drawn: Map<unitId, instance>,   // what the render system queued this frame: R.screenBox(game.drawn.get(id))
  sink,                 // the FX sink (below)
  bus,                  // on(name, fn) -> unsubscribe, off, emit(name, data)
  DT, ENEMY, CLASSIFY, UNITS, PROJ,
  weather,              // { kind: 'calm'|'haze'|'rain'|'storm', wind: [dx, dz], sea } in force (bus 'weather' on change)
  ground(x, z),         // the drawn ground height (0 over water)
  objectives,           // [{ kind, text, hint, optional, state: 'active'|'done'|'failed', prog }] (objectives.js)
  result,               // null, then { win, reason, grade, stats, t } (match.js)
  match, models, cinematic,

  addSystem(sys) -> sys, removeSystem(sys), getSystem(name),
  unit(id), vis(u) /* 'own'|'track'|'contact'|null for the player */, commandable(u), selected() /* own alive */,
  select(ids, { add, toggle }), clearSelection(),
  order(ids, order) -> bool      // sim.order for the player's own units + bus 'order'
  unitPose(u) -> { pos, hdg, pitch, roll, speed }   // the drawn pose: interpolated, land on the drawn ground,
                                                     // ships on the swell (and sinking), aircraft banked; cached per frame
                                                     // (game/pose.js: vehicles on their wheel stations + springs, ships'
                                                     // closed-form response to the drawn waves (sim/sea.js) + heel,
                                                     // squat, list, trim; aircraft on a deck in the ship's frame)
  projPose(p) -> { pos, hdg, pitch }                 // interpolated, along the velocity
  setRate(r), stepRate(±1), pause(on?), setAutoSlow(on), slowFor(why, event) /* auto x1 now, if the setting is on */,
  setUiHidden(on?), setSide(side),
  frame(dtReal), attachInput(canvas), dispatchEvents(),
  // added by the game's own systems
  pickUnit(sx, sy) -> unit | null     // what a click there would pick (selection)
  pickContact(sx, sy) -> { u, c, at } | null   // an unclassified contact's cloud there, picked at its estimate (selection)
  unitScreenPos(u) -> [x, y, z]       // where the unit is drawn (aircraft on a deck: their parking spot) (selection)
  follow(unit | null), frameUnits(units)   // camera helpers (selection)
  endMatch({ win, reason })           // end now (objectives use it; match.js does the rest)
  fmtTime(s) -> 'mm:ss'               // (time)
}
```

## Systems

```js
system = { name, priority,
  init?(game),                    // after addSystem
  update?(dtReal, dtSim),         // every frame, before the camera and the 3D pass (high priority first)
  draw3d?(frame),                 // between R.frame() and R.end(): R.draw, R.fx, R.light, R.setScan, frame.sink (low priority first)
  draw2d?(ov, frame),             // after R.end() on the overlay: ov = R.overlay (tag, bracket, box, leader, mark, text,
                                  //   dline; raw 2D context at ov.ctx). Skipped while the UI is hidden unless always2d.
  onEvent?(simEvent),             // every sim event (all systems, in priority order), right after the sim steps
  onKey?(e) -> handled,           // keydown AND keyup DOM events (check e.type); first true stops the chain
  onPointer?(ev) -> handled,      // { type: 'down'|'move'|'up'|'click'|'dblclick'|'wheel', x, y, button, shift, ctrl,
                                  //   alt, sx, sy (press point), drag (px), world (ground under x, y; lazy), raw }
  always2d?, dispose?() }
frame = { game, R, cam, fx /* R.fx */, sink, t, alpha, dt, dtSim, realT, seaT }
```

Priorities (`PRI` in game.js; input goes high to low, drawing low to high):
help 130 · filmmaker 125 · menu 120 · replay 110 · inspect 100 · targeting 80 · hud 70 · sandbox 60 · order-notes 55 · orders 50 · selection 40 ·
time 30 · director 20 · orbital 16 · sensors 15 · sonar / orbital-pre 14 · landmarks 12 · render 10 · fx 5 · objectives 3 ·
escape 2 · audio 1 · perfguard 0. The camera takes its own keys (WASD / arrows pan, Q E rotate, PageUp / PageDown pitch, wheel zoom,
right-drag rotate, middle-drag pan) below everything; a system that needs the keys for itself sets
`game.camera.keys = false` while it is active.

## FX sink

`frame.sink` (also `game.sink`), the FX agent's interface over `R.fx` / `R.light`. Colours 0..255, alpha 0..1;
sizes > 0 are px at 1080p, < 0 metres.

```js
sink.dot(x, y, z, size, r, g, b, a)      // film dot, max blend, depth tested
sink.add(x, y, z, size, r, g, b, a)      // additive dot (fire, sparks)
sink.over(...) / sink.top(...)           // alpha-over dot (lime over bright dots) / never hidden
sink.glow(x, y, z, radius, r, g, b, a)   // soft additive disc
sink.light(x, y, z, r, g, b, intensity, radiusM)   // dynamic light (max 16 a frame; 1 = a strong flash)
sink.lift(v, r, g, b)                    // full-frame additive lift (lightning)
sink.cam = { eye, f, r, u, fl /* px at 1080p */, tanX, tanY, near, W, H, dist }
```

## Bus events

| name | data |
|---|---|
| `event` | every sim event (same as `onEvent`) |
| `select` | the selection Set |
| `order` | `{ ids, order }` (a player order; orders feedback, audio, objectives) |
| `rate` | `{ rate, paused, why: 'user'|'auto' }` |
| `autoslow` | `{ why: 'launch'|'contact'|'engage', event }` (the lime blip) |
| `engageable` | `{ unit, track, cls, conf, units, text, pos }` a hostile track first classified and within reach of the side's weapons (orders.js; alert + auto x1) |
| `mode` | `{ mode: 'scan'|'move'|'attack'|'place'|null, ... }` (a targeting mode in the orders / sandbox systems) |
| `inspect` | `{ id, on }`: **the Inspect system emits this** when it opens / closes on a unit (campaign objective) |
| `cinematic` | `{ on }` |
| `side` | new side (sandbox side switch) |
| `ui` | `{ hidden }` |
| `result` | `{ win, grade, stats, reason }` when the match ends |
| `objectives` | the objective list (campaign) after a change |
| `frame` | the frame info, after the overlay |
| `ready` | the game, once every system is registered (main.js) |
| `toast` | `{ text, bad }` a short line for the player (the HUD shows it; time.js does without a HUD) |
| `group` | `{ n, ids }` a group was set |
| `buy` / `spawned` | `{ type, ok }` reinforcement ordered / `{ unit, type, side }` placed in the sandbox |
| `weather` | the new weather (sandbox) |
| `breakup` | `{ t, pos, id, kind, key, L, heavy, spin, side, w, px, dist, onScreen, unit? }` something came apart (debris.js): a round broken up or knocked out of control, an aircraft shot down; the director weighs the moment by `w` |
| `bullet` | `{ on, b }` a break-up's bullet time starts / ends (debris/slowmo.js: x0.25, the rate emitted with why 'bullet'; `game.bulletTime.take()` hands a replay starting meanwhile the rate to return to) |

A HUD that draws the objectives itself sets `drawsObjectives: true` on its system (objectives.js then stays off
screen); while a system named `hud` exists, time.js and director.js leave the rate readout, toasts and the
cinematic caption to it, and its B key takes over from the orders system's reinforcement list.

## Controls (the game's own systems)

Camera: WASD / arrows pan, Q E rotate, wheel zoom, right-drag rotate, middle-drag pan, PageUp / PageDown pitch (close to
the ground PageUp goes on past level: the view tilts up to 13 deg above the horizon to watch a climbing round).
Select: click, Shift-click add / remove, drag a box, double-click (all of that type on screen; on a deck: that deck's
aircraft of the type), Ctrl / Alt 1-9 set a group, 1-9 recall (twice: fly to it), Tab cycle, F follow. Aircraft parked
on a deck: click one (close in), or the selection panel's Air row of the carrier (its counts are links).
Orders: right-click (ground / sea: move in formation; hostile track: attack, and with a carrier selected its F/A-18Es
launch on it; a TEL with a transloader selected: reload; deck aircraft: launch toward the point / track), Z stop,
H weapons free / hold fire (offensive fire starts held: nothing launches until you order an attack or go weapons free;
defence is always automatic), ~ salvo size of the selection's attacks 1 / 2 / ALL (Shift: back; an attack persists,
volley after volley, until the target is destroyed, the launcher is empty or its track has been lost for 5 min), T deploy / undeploy, R reload, X scan (then click; the nearest scanner in reach fires, a
point beyond every reach is refused, nothing drives), Y radar on / off, L launch (coast: the Orlan-10; fleet: the
strike package off the deck, then click a track to strike or a point to patrol), U launch an MH-60R (fleet),
B reinforcements, Esc cancel / pause menu.
Time: Space pause, + / - rate. View: C cinematic camera, J replay the last decisive hit (Shift J: automatic replays on /
off), F10 hide the UI, I inspect (Inspect system), V radar view (Sensors system), F1 every control (help; the list is
`KEYBINDS` in data/settings.js: keep it true when a key changes). Sandbox: P palette, G fog, K enemy AI, M switch side,
N weather, Del delete.

2D overlay: world tags and labels scale with the HUD (`ov.ui`: 1 at 1080p, never below .8); sizes given to
`ov.tag` / `ov.text` are px at 1080p, a caller's own offsets are multiplied by `ov.ui` (engine/overlay.js).
An `ov.tag` that would sit on a HUD panel (`game.hudRects`) is moved off it (`fit: false` opts out), and while the
pause menu or the end block is up (`body.oniks-veiled`) everything drawn through `ov.*` fades out (`ov.worldA`;
a system drawing on `ov.ctx` itself multiplies its alpha by it).

Loading (`src/ui/loading`): play.html shows the loading screen from its first paint; main.js reports the real steps
(map, terrain, forces, systems, models), pre-samples every level of the models in play (`warmLists`), renders two
frames under it, then fades it over the opening shot; the Inspect cutaways are sampled later in idle time.

## Files

`game.js` (the object, systems, time, input, sink) · `setup.js` (URL params, starting forces, campaign forces and
waves, sandbox AI wake / sleep) · `render.js` (units, projectiles, wakes, sites) · `select.js` · `orders.js` ·
`time.js` · `director.js` (cinematic camera) · `replay.js` (hit replay) · `objectives.js` (campaign objectives, combat /
sandbox summary) · `match.js` (end overlay, pause menu, result, combat grade) · `sandbox.js` (spawn palette and tools) ·
`sonar.js` · `landmarks.js` · `orbital.js` · `filmmaker.js` + `filmmaker/` · `debris.js` + `debris/` (rigid-body debris: `world.js` the solver, `plans.js` how each model comes apart, `geom.js` module boxes and masks, `shards.js`, `slowmo.js` bullet time, `math.js`) · `labels.js` (designations) · `campaign/`.
