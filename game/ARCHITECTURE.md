# ONIKS: architecture and contracts

Read `game/DESIGN.md` first. This file is the contract between modules; keep it true when you change an interface.

## Stack

- Browser game: **plain JavaScript ES modules + WebGL2**, no build step, no npm, no frameworks.
- The film kit is reused read-only from `reference/` (classic scripts that set globals):
  `/reference/menus/common/m3.js` (M3), `geo.js` (GEO), `/reference/films/common/hd_land.js` +
  `hd_sea_air.js` (HD), `/reference/menus/common/theatre.js` (THEATRE, 780 KB: load only for the real map).
  **Never edit anything under `reference/`.** If you need a variant, copy it into `game/` and change the copy.
- Served from the repo root by `python tools/serve_game.py` on **port 8771** (already running; do not start
  servers). Game: `http://localhost:8771/game/index.html`; play directly: `http://localhost:8771/game/play.html`.
  POST a PNG data URL to `/save?path=game/shots/<name>.png` to write a full-res still (gitignored).
- No Node on this machine. Tests run in the browser: `game/tests.html`.

## World conventions

- Metres. **X east, Y up, Z north** (M3 is left-handed this way; see `M3.Cam`).
- Heading `hdg` in radians, 0 = north (+Z), π/2 = east (+X): forward = `[sin hdg, 0, cos hdg]`, which is
  what `M3.R.y(hdg)` applied to model +Z gives. Model space: +Z forward, +Y up (GEO/HD convention).
- A map spans x ∈ [-W/2, W/2], z ∈ [-H/2, H/2]. Sea level is y = 0; land heights > 0; seabed < 0.
- Sim time in seconds. Fixed sim step `DT = 0.05` s. Rendering interpolates between the previous and
  current tick.

## Directory and ownership

```
game/
  index.html            shell: main menu over a live film, setup screens, campaign screen   (SHELL)
  play.html             the game page; loads the kit, then src/main.js                     (ENGINE, then GAME)
  tests.html            in-browser test runner for the sim                                  (SIM)
  styles/               game.css (Point Cloud tokens from reference/menus/common/pc.css)    (SHELL; others append sections)
  src/
    main.js             boots play.html: reads URL params, loads map, creates sim, renderer, UI, loop
    engine/             WebGL2 renderer, RTS camera, terrain + sea points, model point caches, overlay 2D   (ENGINE)
    sim/                pure logic, no DOM, no GL: world state, movement, sensors, weapons, damage, AI   (SIM)
    data/units.js       unit type table: stats + which HD model + sim->model state mapping          (SIM)
    world/              maps: generators, the real map, previews                                    (MAPS)
    fx/                 visual effects driven by sim events (launch, trails, hits, intercepts, scan, weather)
    ui/                 HUD, selection, command card, minimap, inspect/anatomy, mode screens
    audio/              synth sound (extends STAGE.SFX ideas)
```

A module folder has one owner at a time. Touch other folders only through their public API; if you need a
change there, add the smallest hook and note it in your report.

## Map contract (`game/src/world/`)

`import { MAPS, loadMap } from './world/maps.js'`

```js
MAPS: [{ id, name, blurb /* <= 6 words */, size: [W, H] /* m */ }]
await loadMap(id) -> Map
Map = {
  id, name,
  W, H,                       // metres (80-160 km)
  cell,                       // heightfield cell size, m (e.g. 100)
  cols, rows,                 // heightfield dims; row 0 = south edge (z = -H/2), col 0 = west (x = -W/2)
  heights: Float32Array,      // rows*cols metres, sea < 0
  h(x, z) -> metres           // bilinear, clamps outside
  water(x, z) -> bool         // h < 0
  slope(x, z) -> 0..1         // for land movement cost
  places: [{ name, x, z, kind }],          // 'town' | 'cape' | 'bay' | 'island' | 'peak' | 'port' ...
  objectives: [{ id, name, x, z, r, kind }], // 'port' | 'depot' | 'radar_hill' | 'airfield' | 'lighthouse'
  spawns: { coast: { x, z, r, hdg }, fleet: { x, z, r, hdg } },  // coast spawn on land, fleet spawn at sea
  replenish: { x, z, r },     // fleet reload point at sea, near the map edge
  roads: [[[x, z], ...], ...] // optional polylines on land (trucks move faster on roads)
  weather: { kind: 'calm'|'haze'|'rain'|'storm', wind: [dx, dz], sea: 0..1 },
  time: 'night' | 'dusk' | 'day'           // tints only; the look stays graphite
}
```

## Sim contract (`game/src/sim/`)

```js
import { Sim } from './sim/sim.js'
const sim = new Sim(map, { seed, fog: true, mode: 'sandbox'|'combat'|'campaign', aiSides: ['fleet'] })
sim.spawn(type, side, x, z, { hdg }) -> unit
sim.order(unitIds, order)          // order = { kind: 'move'|'attack'|'stop'|'hold'|'deploy'|'undeploy'|'reload'
                                    //   |'scan'|'radar'|'launch_drone'|'patrol'|'return', x?, z?, target?, on? , queue? }
sim.step()                         // advance one DT; call from the loop as often as the time rate needs
sim.t                              // sim seconds
sim.units: Map<id, Unit>
sim.projectiles: Map<id, Proj>
sim.sides: { coast: SideState, fleet: SideState }
sim.drainEvents() -> Event[]       // events since the last drain (FX, audio, UI consume them)
sim.visible(side, unit) -> 'own' | 'track' | 'contact' | null   // what `side` may draw of `unit`
```

```js
Unit = { id, type, side, pos: [x, y, z], prev: [x, y, z], hdg, prevHdg, pitch, roll, speed,
         hp, hpMax, alive, dying /* 0..1 death animation progress */, st /* HD model state: elev, dep, ant, yaw, ... */,
         orders: [], ammo: { <weapon>: n }, cooldowns: {}, radarOn, deployed, parts /* {partName: 0..1 damage} */ }
Proj = { id, kind, side, pos, prev, vel, from, target, phase, t0, alive, st }
SideState = { supply, contacts: Map<unitId, Contact>, scanCd, ... }
Contact = { track /* 'TRK 21' */, unitId, conf /* 0..1 */, cls /* null until classified */, pos /* estimate */,
            err /* m, uncertainty radius */, lastSeen, identified /* by scan */, emitting }
Event = { type, t, pos?, ... }   // 'launch' 'booster_sep' 'intercept' 'hit' 'splash' 'destroyed' 'detect'
                                  // 'classify' 'scan' 'reload_start' 'reload_done' 'deploy' 'gunfire'
                                  // 'lightning' 'reinforce' 'objective' 'radar'
```

Rules: deterministic (seeded `M3.rng` streams, never `Math.random` in the sim), no DOM/GL imports, cheap
enough for x32 with 200 units (sensors at a few Hz, not every tick). Combat is game abstraction: ranges,
speeds, reload times, hit chances, HP. Keep weapons as short game-stat entries; no guidance or
countermeasure logic.

## Unit table (`game/src/data/units.js`)

```js
UNITS[type] = { type, side, name /* 'K340P' */, cls /* 'TEL' */, label /* 'K340P TEL · Bastion-P' */,
  domain: 'land'|'sea'|'air', model: 'tel'|'radar'|'pantsir'|'drone'|'catapult'|'destroyer'|'carrier'|'helo'|'fighter'|..., 
  modelState(unit, t) -> st,       // maps sim state to the HD model's state object
  speed, hp, sensors: {...}, weapons: {...}, cost, buildTime, ... }
```

## Engine (`game/src/engine/`)

Owner documents the public API in `game/src/engine/README.md`. Required capabilities:
- WebGL2 point renderer that reproduces the film dots: square points, **max blending** (`gl.MAX`) over a
  graphite vignette background, an additive pass for glows/flashes, facing-aware dimming, distance fade.
- Terrain and sea as a **point clipmap** around the camera target (nested grids, spacing doubling per level,
  snapped to the grid, stable hash jitter, heights from a float texture), so it works from 20 m to 150 km.
- Model point caches: `GEO.sample` of HD models per part at 2-3 LODs, uploaded once; per-part rigid
  transforms (`part.xf(st)`); `dyn` parts cached at quantized states. Per-draw tint (own lime / hostile
  coral / unknown white), alpha, x-ray, scan band, per-part damage tint.
- Dynamic lights (up to 16): nearby dots brighten (flashes, plumes, lightning).
- World-space dotted lines and rings (range rings, radar sweep, tracks, paths).
- RTS camera: 360° orbit, pitch 3°-89°, zoom 20 m - 150 km, pan (WASD, edges, middle-drag), rotate (right-drag,
  Q/E), smooth damping, follow, fly-to, picking (screen -> ground ray, screen -> unit).
- 2D overlay canvas helpers in the Point Cloud style (tags, dotted boxes, leaders, brackets).

## Style tokens

`#0B0C0A` background, white dots, lime `#C6F432`, coral `#FF6A3D`, text white at 0.5-0.9 alpha.
Fonts: Geist, Geist Mono (Google Fonts link as in the films). UI is tags (lime/white id chip + dark label),
dotted boxes and underlines, thin leaders, small mono readouts. No filled bright panels, no rounded
"cards", no drop shadows, no gradients except the dark calming gradient behind menus.

## Verifying your work

Open your own browser tab (`tabs_create`), navigate it to your page, `read_console_messages` for errors,
screenshot and look, fix, repeat. Close your tab when done. Performance target: 60 fps (< 16 ms/frame) at
1920x1080 with a busy scene.
