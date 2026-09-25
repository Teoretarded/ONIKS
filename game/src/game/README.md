# game: the running match

`game/src/game/game.js` owns the match. `main.js` builds the map, renderer, sim and `game`, then registers the
systems. Other agents plug in by exporting a factory from their module; `main.js` imports it if the file exists
(a missing file is skipped, a broken one is logged) and calls `game.addSystem(await createX(game, ctx))`:

| Module | Export | Name |
|---|---|---|
| `src/fx/index.js` | `createFx(game, ctx)` | `fx` |
| `src/ui/sensors.js` or `src/ui/sensors/index.js` | `createSensors(game, ctx)` | `sensors` |
| `src/ui/inspect.js` or `src/ui/inspect/index.js` | `createInspect(game, ctx)` | `inspect` |
| `src/audio/index.js` | `createAudio(game, ctx)` | `audio` |
| `src/ui/hud/index.js` or `src/ui/hud.js` | `createHud(game, ctx)` | `hud` |

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
  projPose(p) -> { pos, hdg, pitch }                 // interpolated, along the velocity
  setRate(r), stepRate(±1), pause(on?), setAutoSlow(on), setUiHidden(on?), setSide(side),
  frame(dtReal), attachInput(canvas), dispatchEvents(),
  // added by the game's own systems
  pickUnit(sx, sy) -> unit | null     // what a click there would pick (selection)
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
menu 120 · inspect 100 · targeting 80 · hud 70 · sandbox 60 · orders 50 · selection 40 · time 30 · director 20 ·
sensors 15 · render 10 · fx 5 · audio 1. The camera takes its own keys (WASD / arrows pan, Q E rotate, PageUp /
PageDown pitch, wheel zoom, right-drag rotate, middle-drag pan) below everything; a system that needs the keys
for itself sets `game.camera.keys = false` while it is active.

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
| `autoslow` | `{ why: 'launch'|'contact', event }` (the lime blip) |
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

A HUD that draws the objectives itself sets `drawsObjectives: true` on its system (objectives.js then stays off
screen); while a system named `hud` exists, time.js and director.js leave the rate readout, toasts and the
cinematic caption to it, and its B key takes over from the orders system's reinforcement list.

## Controls (the game's own systems)

Camera: WASD / arrows pan, Q E rotate, wheel zoom, right-drag rotate, middle-drag pan, PageUp / PageDown pitch.
Select: click, Shift-click add / remove, drag a box, double-click (all of that type on screen), Ctrl / Alt 1-9 set a group,
1-9 recall (twice: fly to it), Tab cycle, F follow. Orders: right-click (ground / sea: move in formation; hostile
track: attack; a TEL with a transloader selected: reload), Z stop, H hold, T deploy / undeploy, R reload,
X scan (then click), Y radar on / off, L launch drone (then click), B reinforcements, Esc cancel / pause menu.
Time: Space pause, + / - rate. View: C cinematic camera, F10 hide the UI, I inspect (Inspect system), V radar view
(Sensors system).

## Files

`game.js` (the object, systems, time, input, sink) · `setup.js` (URL params, starting forces, campaign forces and
waves, sandbox AI wake / sleep) · `render.js` (units, projectiles, wakes, sites) · `select.js` · `orders.js` ·
`time.js` · `director.js` (cinematic camera) · `objectives.js` (campaign objectives, combat / sandbox summary) ·
`match.js` (end overlay, pause menu, result) · `sandbox.js` (spawn palette and tools).
