# engine

WebGL2 point renderer in the films' Point Cloud look. Plain ES modules; the kit (`M3`, `GEO`, `HD`) must be
loaded as classic scripts first (see `game/play.html`).

```js
import { Renderer, TINT, LIME, CORAL, WH, attitude } from './engine/renderer.js';
import { Wake } from './engine/fx.js';
const R = new Renderer({ canvas, overlay /* 2D canvas, optional */, map, renderScale: 1,
                         terrain: { /* Terrain options, below */ }, camera: { /* RTSCamera options */ } });
R.camera.attach(canvas);                      // mouse + keyboard
// every frame
R.frame(dt, t);                               // resize + camera.update(dt) + begin(t)   (t: seconds, drives the sea)
R.draw({ key: 'tel', T: [x, y, z], hdg, st: { elev: 1.2, dep: 1 }, tint: 'own', id: 7 });
R.fx.dot(...); R.light(...); R.setScan(...); R.setSweep(...);
R.end();                                      // renders the frame; then draw on R.overlay
```

Units: metres, X east, Y up, Z north; heading 0 = north (+Z), pi/2 = east. Colours for effects are 0..255.
Everything drawn gets the Earth's curvature drop `d^2 / 2R` from the eye (use `R.camera.project` for overlays:
it applies it too).

## Renderer

| | |
|---|---|
| `draw(d)` | queue a model instance for this frame; returns `d`. `d.key` model key; `d.T` world position; `d.hdg`, `d.pitch` (+ nose up), `d.roll` (+ right wing down) or `d.R` (3x3 row-major); `d.st` model state (`part.xf(st)`, `show(st)`, dyn parts); `d.tint` `'own'` (lime silhouette) · `'hostile'` (coral) · `'unknown'` · `'neutral'` · `[r,g,b]` 0..1; `d.tintK` strength at the silhouette (default .6), `d.tintFace` on the faces (own .05, hostile .22); `d.alpha`; `d.bright`; `d.xray` 0..1 (shell thins to a ghost, far wall shows); `d.partAlpha`, `d.partXray` `{part: v}`; `d.damage {part: 0..1}` (coral, burnt-through dropout); `d.explode` 0..1 (assemblies float apart along their offsets); `d.partX {part: {R, T}}` extra per-part transform (part space); `d.dissolve` 0..1 (random dot dropout); `d.noBack` (drop back faces); `d.lodBias` (+1 coarser); `d.id` (for `pick`). The caller's fields are not modified (resolved values go in `d._rgb`, `d._k`, `d._face`, `d.R`, `d.speck`). |
| `light(p, radius, rgb, intensity)` | a point light for this frame (max 16, weakest dropped): nearby terrain, sea and model dots brighten, facing-aware. `intensity` 1 = a strong flash. |
| `setScan(i, s)` | lime scan front `i` (0, 1), persistent: `{ mode: 'plane' \| 'sphere' \| 'off', origin, normal (plane), front (m along the normal from origin, or sphere radius), width (m, the bright band), decay (m of afterglow behind it), amp, rgb, reveal (0..1 tint left behind) }`. Animate `front` yourself. `setScan(i, null)` clears. Applies to models and ground. |
| `setSweep(s)` | radar beam painting sea and land: `{ origin: [x, z], bearing (rad, clockwise from north), amp, afterglow (rad), range (m), edge (rad) }` or `null`. |
| `screenBox(d)` | tight screen box `[x0, y0, x1, y1]` (CSS px) of an instance, from its points (boxes fit the object). |
| `pick(sx, sy)` | the queued instance (with an `id`) under a screen point, or null. |
| `renderScale` | get/set (0.5 .. 2); dot sizes follow canvas height / 1080. |
| `worldBright`, `modelBright`, `skyBright`, `fadeScale`, `vignette`, `bg`, `sun` | look knobs (dim the world for an inspect view: `worldBright = .35`). |
| `stats` | `{ ms, draws, points }` of the last frame; `terrain.stats` `{ blocks, levels, s0, dots }`. |
| `models`, `terrain`, `camera`, `fx`, `overlay` | the parts below. |

## Models (`R.models`, engine/models.js)

Built-in keys: `tel radar pantsir drone catapult destroyer carrier helo fighter fighterStores oniks oniksBooster
sm6 mk72 satellite` (the `HD.*` models). Sampled with `GEO.sample` per part at 4 levels of detail (spacing from
the model size, finest `L/380`, big ships `L/1000`), uploaded on first use, sampled within a 6 ms per frame
budget (coarser level shown meanwhile). `dyn` parts are cached per quantized state (dependencies found by a
Proxy; angle keys wrap, 96/48/24/12 steps per level), LRU of 64 states per part and level.

| | |
|---|---|
| `registerModel(key, factory, opts)` | add a model in the GEO/HD part format. `opts.lods` spacings, `opts.quant {stateKey: step}`, `opts.angles [keys]`, `opts.deps {part: [keys]}`. |
| `registerAll(table, info)` | e.g. `registerAll(EXTRA_MODELS, MODEL_INFO)` from `data/models.js` (`info[k].s` = spacings). |
| `get(key)` | entry: `{ model, parts, lods, L, center, radius }` (`model` keeps the factory's anchors). |
| `warm(key, lods)` | pre-sample (default the two coarsest levels). |
| `partWorld(d, name)` | world `{R, T}` of a part of an instance (muzzles, tubes, hubs). |
| `lodPx`, `budgetMs` | level choice (coarsest whose spacing is under this many px at 1080p) and sampling budget. |

## Terrain and sea (`R.terrain`, engine/terrain.js)

Point clipmap centred under the eye: 640 x 640 dots per level, spacing doubling per level, world-snapped,
hash-jittered, heights from a float texture of `map.heights`; transitions dissolve (no pops, no swimming).
The films' LiDAR look comes from *which* lattice dots are drawn: ordered thinning keeps whole sub-lattices (every
dot has a pattern rank from its absolute lattice index), so what survives is always an even jittered lattice,
world-fixed and identical in every clipmap level, never random speckle.

- **Land**: a dot budget per screen area of the surface with a grazing floor (faces turned to the lens keep their
  returns: cliffs read as walls; grazing ground packs toward crests and the horizon). Hillshade from an
  exaggerated normal taken at the scale the returns resolve (mip-filtered gradients), lit by a light fixed to the
  view (behind the lens, to the left) so relief reads from any heading; crests bright and gullies dark;
  prominence (hills brighter than the land round about) from high up; beaches; fields and marsh on flat low
  ground; contours snapped into crisp dotted lines from high up (dissolving in with altitude and between
  intervals). The coast is one crisp dotted line (returns snapped onto h = 0) with a surf band walking in.
- **Sea**: the films' sea: a constant horizontal spacing on screen, banded like Engagement's (rows of density
  receding to the horizon), brightness from the swell height and the faces turned to the lens, the films'
  flicker, wind rows, swell trains from high up, glints, whitecaps in a rough sea, a glassy sparse sea in a calm;
  the last returns pile up into a bright horizon line. Hull-down with the Earth's curvature as before.
- **Sky**: dots at infinity: a band of returns riding the dipped horizon (glowing toward one azimuth) and sparse
  stars, set by the weather and `map.time`.
- **Units pop**: at play altitudes the ground and sea stay dimmer and sparser than the models, and every frame the
  renderer hands the terrain the biggest instances on screen (up to 12, from the draw queue): the world dims in a
  soft pool round each (a few model radii, never under ~34 px) and behind it on screen (the films keep the ground
  dim round their models). Knobs `subjectDim` (.5) and `subjectBack` (.55); 0 turns them off.

An invisible depth mesh (ground envelope, then the sea surface) hides what is behind hills and below the horizon.

| | |
|---|---|
| `heightAt(x, z)` | the drawn ground (land with its metre-scale relief; 0 over water). Put land units here. |
| `groundAt(x, z)` | same, but the seabed under water. |
| `mapH(x, z)` | the map's bilinear height (open sea falls off beyond the map edge). |
| `normalAt(x, z)` | drawn ground normal (pitch and roll vehicles to it). |
| `seaAt(x, z, t)` | swell `{ y, gx, gz }` (ships heave, pitch and roll on it). |
| `setWeather(w)` | `{ kind: 'calm' \| 'haze' \| 'rain' \| 'storm', wind: [dx, dz], sea: 0..1 }` (the map's `weather` by default). `kind` sets the look (sea brightness and spacing, glints, stars, band); pass it (without it a sea >= .75 reads as a storm). `sea` sets the swell (longer, higher), roughness and whitecaps. Call it again after changing `seaPx`. |
| `sky` | `{ stars, band, glowAz (rad), glow (0..1) }`, re-derived by `setWeather` from the kind and `time` ('night' \| 'dusk' \| 'day', from `map.time`); change freely between calls (e.g. SENSORS: `stars = 0` under the storm ceiling). `R.skyBright` scales it all. |
| `stats` | `{ blocks, levels, s0, dots }` (dots = lattice slots walked, most are culled). |
| `setSubjects(list)` | called by the renderer each frame (units on screen: `{ c (RTE), r, sx, sy, sr, z }`); not needed by callers. |
| options (all live: set `R.terrain.x` at run time) | `grid` (640), `densNear` / `densFar` (lens height / finest spacing, 140 / 380), `jitter` (.75 of the pattern spacing), `rowK` (1: subtle scan rows 2^rowK apart; 0 an even lattice), `rowJitter` (.25, across the rows), `areaNear` / `areaFar` (land px^2 per dot near / high, 56 / 22), `grazing` (.1, floor of the land's facing), `landBright` (.8), `landHigh` (1.15, brighter from high up), `lightFollow` (1: the view's light, 0: `R.sun`), `lightAz` (-2 rad off the camera heading), `lightEl` (32 deg), `relief` (auto from the map's slopes), `reliefHigh` (2, extra exaggeration from high up), `prominence` (.22), `contours` (1), `fields` (1), `marsh` (1), `beach` (.6), `seaPx` (16, horizontal px between sea returns), `seaBands` (.7, 0 even .. 1 Engagement's bands), `seaHigh` ([.5, .45]: the sea thins and dims from high up), `seaNear` (1200 m, sea dots 2 px nearer), `seaDot2` (3.4), `coastPx` (.34 waterline dots per px), `dotPx` ([4.2, 15, 22]: land 2 px / 3 px / dim thresholds, on-screen spacing). `subjectDim` (.5), `subjectBack` (.55). `seaKeep` is ignored (kept for old callers). |

## Effects (`R.fx`, engine/fx.js) — call between `frame()` and `end()`

| | |
|---|---|
| `dot(p, size, rgb, a, mode)` / `dotXYZ(x, y, z, size, r, g, b, a, mode)` | world dot. `size` > 0 px at 1080p, < 0 metres. `mode`: `'max'` (default, depth-tested, the film dots), `'add'` (glow, fire), `'over'` (alpha over: lime that must read over bright dots), `'top'` (over, never hidden). |
| `glow(p, radius, rgb, a)` | soft additive disc, `(1 - d^2/R^2)^2`; radius > 0 px, < 0 metres. |
| `lift(v, rgb)` | full-frame additive flash (lightning). |
| `path(pts, o)`, `line(a, b, o)`, `ring(c, r, o)`, `arc(c, r, a0, a1, o)` | dotted world lines with even on-screen spacing. `o: { rgb, a, step (px, 5), size, mode, drape (sit on ground / sea), lift (m) }`. Arcs: bearings clockwise from north. |
| `new Wake({ L, B, len, rate })` · `update(pos, hdg, speed, t)` · `draw(fx, a, rgb)` | Kelvin wake of dots left in the water (19.47 degree arms, churned centre, bow wave), fading over `len` m. |

## Camera (`R.camera`, engine/camera.js)

Orbit a ground target: yaw 360 degrees, pitch 3..89 degrees, distance 20 m .. 150 km (exponential zoom toward the
cursor). WASD / arrows / screen edges pan (Shift x3), middle-drag grabs the ground, right-drag rotates, Q / E
yaw, `=` / `-` zoom, PageUp / PageDown pitch. Smooth damping; the lens never goes under the ground.

| | |
|---|---|
| `target`, `yaw`, `pitch`, `dist`, `fov` (vertical, rad), `eye`, `f`, `r`, `u`, `fl` (px), `near`, `far`, `W`, `H` (CSS px) | state (current, damped); `goal` = where it is heading. |
| `set({ target, dist, yaw, pitch })` | jump. |
| `flyTo(target, { dist, yaw, pitch, time })` | animated, pulls back on long moves. |
| `frame(points \| { center, radius }, o)` | fly to fit. |
| `follow(fn, keepOffset)` | track `fn() -> [x, y, z]`; panning or `follow(null)` stops. |
| `zoomAt(sx, sy, k)` | zoom by `k` about the ground under a screen point. |
| `project(p)` | world -> `[sx, sy, depth]` CSS px (with curvature), null behind. |
| `ray(sx, sy)`, `pickGround(sx, sy)` | screen ray; the ground / sea point under the cursor, as drawn. |
| `onClick = (sx, sy, button, event) => {}` | clicks that were not drags. |
| `keys`, `edge`, `bounds`, `minDist`, `maxDist` | switches and limits. |

## Overlay (`R.overlay`, engine/overlay.js) — CSS px, cleared every frame

`tag(x, y, id, label, value, { kind: 'white' | 'lime' | 'coral' | 'ghost', a, size, align })` (returns its box) ·
`bracket(box, col, a, pad, len)` · `box(box, col, a, dash)` · `leader(x0, y0, x1, y1, col, a)` ·
`mark(x, y, size, col, a, fill)` · `text(x, y, s, { size, col, a, align, weight, sans })` ·
`dline(x0, y0, x1, y1, step, size, col, a)`. `COL` has the tokens (lime, coral, dim, faint, hair).

## Other

`gl.js` (`createGL`, `program`, textures) · `shaders.js` (the per-frame uniform block and the shared GLSL: dot
size rule, depth fade, lights, scan, sweep) · `stubmap.js` (`stubMap()`, a procedural coast that follows the Map
contract).

`play.html` debug: `?map=<id>|stub`, `?scale=`, `?bench=1` (logs `BENCH {...}` after 6 s), `?t=` (freeze),
`?cam=x,z,dist,yawDeg,pitchDeg`, `?ui=0`; console `ONIKS.benchSync(n)` (GPU-synced ms per frame),
`ONIKS.still(name)` (saves `game/shots/<name>.png`), `ONIKS.advance(sec)`; keys 1-9 fly to the showcase units.
