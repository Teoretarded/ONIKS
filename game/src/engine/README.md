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
| `draw(d)` | queue a model instance for this frame; returns `d`. `d.key` model key; `d.T` world position; `d.hdg`, `d.pitch` (+ nose up), `d.roll` (+ right wing down) or `d.R` (3x3 row-major); `d.st` model state (`part.xf(st)`, `show(st)`, dyn parts); `d.tint` `'own'` (lime silhouette) · `'hostile'` (coral) · `'unknown'` · `'neutral'` · `[r,g,b]` 0..1; `d.tintK` strength at the silhouette (default .6), `d.tintFace` on the faces (own .05, hostile .22); `d.alpha`; `d.bright`; `d.xray` 0..1 (shell thins to a ghost, far wall shows); `d.partAlpha`, `d.partXray` `{part: v}`; `d.damage {part: 0..1}` (coral, burnt-through dropout); `d.explode` 0..1 (assemblies float apart along their offsets); `d.partX {part: {R, T}}` extra per-part transform (part space); `d.dissolve` 0..1 (random dot dropout); `d.noBack` (drop back faces); `d.lodBias` (+1 coarser); `d.dotSpacing` (this instance's dots-per-pixel cap, px; 0 off); `d.id` (for `pick`). The caller's fields are not modified (resolved values go in `d._rgb`, `d._k`, `d._face`, `d.R`, `d.speck`). |
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
sm6 mk72 satellite` (the `HD.*` models). Sampled per part at 4 levels of detail (spacing from the model size, finest
`L/380`, big ships `L/1000`) as `GEO.sample` does it (boxes, the commonest primitive, straight into the GPU layout
with no garbage; the other primitives through `GEO.sample`), uploaded on first use. **No frame stalls on sampling**:
a static part's level is sampled a few primitives at a time within a 5 ms per frame budget (`budgetMs`), refining
one level at a time from what it has (a part with nothing sampled gets its coarsest level at once, a few hundred
points); meanwhile the nearest sampled level shows. A camera jump into a town it has never seen costs a few frames of
coarser dots instead of one 100-900 ms frame. `dyn` parts are cached per quantized state (dependencies found by a
Proxy; angle keys wrap, 96/48/24/12 steps per level), LRU of 64 states per part and level.

**Dots per pixel, not per metre.** Close up, a big hull must keep the films' visible dot structure (never a solid
white slab or a grey gradient). In the shader the kept dots never pack closer than `dotSpacing` px on screen: a
sample survives with probability `(spacing_px^2 x facing) / dotSpacing^2` (a hash per sample; never below the density
of the model's coarsest level). Faces seen edge-on are counted by their facing (floor `grazing`) only on parts large on
screen (from ~140 px of part radius), so a deck seen low or a hull side thins like a face turned to the lens, while
small parts keep their silhouette's pile-up (wings, masts: crisp edges). Parts small on screen (under ~70 px radius)
are never thinned: a unit at play range stays the dense bright silhouette that pops over the ground; a thin plate
(a wing, a fin, a deck: most of its samples face one way) is capped sooner (from ~30-110 px). A fill light
fixed to the view (behind the lens, over its left shoulder; the moon stays the key) keeps the faces the camera sees
from going black from the wrong heading, as the films frame their hulls lit.

**Cutaways** (a draw with `d.gate`, `d.partXray` or `d.xray`: Inspect, the museum, the hit replay, the scan's x-ray)
are drawn like the Anatomy films once the model fills the frame (~110-260 px of radius): every part but the smallest
is capped, the parts that are not x-rayed shells (the interior, the named assemblies) at `dotSpacingCut` (2.2 px),
counting the walls a line of sight crosses (a bank of VLS cells, stacked decks: the part's sampled area over four
times its bounds' mean projected area), and the highlights go on a knee toward 0.9 (parts brightened over 1 keep
their shading): dotted grey volumes with visible structure, never white blocks. In a cutaway frame a full-frame
flash (`fx.lift`) lights the returns (mostly multiplicative) instead of greying the black.

| | |
|---|---|
| `registerModel(key, factory, opts)` | add a model in the GEO/HD part format. `opts.lods` spacings, `opts.quant {stateKey: step}`, `opts.angles [keys]`, `opts.deps {part: [keys]}`. |
| `registerAll(table, info)` | e.g. `registerAll(EXTRA_MODELS, MODEL_INFO)` from `data/models.js` (`info[k].s` = spacings). |
| `get(key)` | entry: `{ model, parts, lods, L, center, radius }` (`model` keeps the factory's anchors). |
| `warm(key, lods)` | pre-sample the given levels now; without `lods`: the coarsest level now, the next one queued (sampled within the following frames' budget, `idle()`, which the renderer calls after the models). |
| `partWorld(d, name)` | world `{R, T}` of a part of an instance (muzzles, tubes, hubs). |
| `lodPx`, `budgetMs` | level choice (coarsest whose spacing is under this many px at 1080p, 2.8) and sampling budget (5 ms a frame). |
| `dotSpacing`, `grazing`, `dotSpacingCut` | dots per pixel: least on-screen spacing of the kept dots (1.8 px at 1080p; 0 off), the facing floor for large parts (.3), and the spacing of a cutaway's interior (2.2). |
| `fill`, `fillAz`, `fillEl` | the view's fill light on the models: strength (.6; 0 off), bearing off the view heading (pi - .6 rad: behind, left), elevation (.44 rad). |

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
- **Sea**: the films' sea: seen low, a constant horizontal spacing on screen, banded like Engagement's (rows of
  density receding to the horizon); each kept dot is jittered by at most `seaJitter` of the *kept* spacing (not of its
  own coarser pattern's), so what survives is an orderly lattice whose rows and files read, never speckle; near and
  mid range (wherever they resolve on screen, ~0.3-9 km) the long swell's crests print as world-fixed rows walking
  downwind (`seaSwellRows`: crest rows kept and bright, troughs thinned and dark; weaker in a storm); seen steeply (from a few hundred metres up) a screen area per return
  (`seaArea`), denser and dimmer returns, so from 2-20 km the sea reads as a fine surface and never as a star field.
  Brightness from the swell height and the faces turned to the lens, the films' flicker, wind rows; from a few km up
  the swell prints as rows (`seaRows`: its crests keep their returns and brighten, the troughs thin; where the swell
  is too fine on screen, its trains do), no glints aloft; whitecaps in a rough sea, a glassy sparse sea in a calm;
  the last returns pile up into a bright horizon line. Hull-down with the Earth's curvature as before.
- **Haze** (`kind: 'haze'`, or `haze` in m): the returns fade with the range toward `hazeFloor` (near sea and ground
  as they are, the far field and the horizon band going out); the haze is a layer (`hazeTop`), so from high above the
  view down stays clear.
- **Sky**: dots at infinity: a band of returns riding the dipped horizon (glowing toward one azimuth) and sparse,
  dim stars (a third fewer and dimmer than before: the sky never reads like the sea), set by the weather and
  `map.time`.
- **Units pop**: at play altitudes the ground and sea stay dimmer and sparser than the models, and every frame the
  renderer hands the terrain the biggest instances on screen (up to 12, from the draw queue): the world dims in a
  soft pool round each (a few model radii, never under ~34 px) and behind it on screen (the films keep the ground
  dim round their models). Knobs `subjectDim` (.5) and `subjectBack` (.55); 0 turns them off. A unit that fills the
  frame (over ~260-700 px of radius), or with the lens inside its pool, gets no pool (the near sea stays).

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
| options (all live: set `R.terrain.x` at run time) | `grid` (640), `densNear` / `densFar` (lens height / finest spacing, 140 / 380), `jitter` (.75 of the pattern spacing), `rowK` (1: subtle scan rows 2^rowK apart; 0 an even lattice), `rowJitter` (.25, across the rows), `areaNear` / `areaFar` (land px^2 per dot near / high, 56 / 22), `grazing` (.1, floor of the land's facing), `landBright` (.8), `landHigh` (1.15, brighter from high up), `lightFollow` (1: the view's light, 0: `R.sun`), `lightAz` (-2 rad off the camera heading), `lightEl` (32 deg), `relief` (auto from the map's slopes), `reliefHigh` (2, extra exaggeration from high up), `prominence` (.22), `contours` (1), `fields` (1), `marsh` (1), `beach` (.6), `seaPx` (16, horizontal px between sea returns), `seaBands` (.7, 0 even .. 1 Engagement's bands), `seaHigh` ([.5, .45]: the sea thins and dims from high up), `seaNear` (1200 m, sea dots 2 px nearer), `seaDot2` (3.4), `seaArea` (12 px^2 per return seen steeply, before bands and rows thin it), `seaRecede` (.5: 1 an even density on screen seen steeply, less denser far off), `seaSteepB` (.65, brightness of the steep sea's returns), `seaMidBright` (.15, the sea brightens from the lens to a few km up), `seaRows` (1, the swell's trains from high up; 0 off), `seaJitter` (.6 of the kept spacing), `seaSwellRows` (1, the long swell's crest rows near and mid range; 0 off), `seaRowKeep` (.3, share of the returns kept in a trough), `seaRowDark` (.42, brightness in a trough), `seaRowCrest` (1.05, added on a crest), `haze` (null: from the weather kind, haze 9000 m; 0 none), `hazeFloor` (.22), `hazeTop` (1500 m), `coastPx` (.34 waterline dots per px), `dotPx` ([4.2, 15, 22]: land 2 px / 3 px / dim thresholds, on-screen spacing). `subjectDim` (.5), `subjectBack` (.55). `seaKeep` is ignored (kept for old callers). |

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
UI scale: `ui` = the HUD's (`uiScaleOf(W, H)`: 1 at 1080p, never below .8, up to 1.6; `uiScale` pins it). Tag, text,
mark and bracket sizes are px at 1080p multiplied by it (`o.raw` draws at the size given); `tagSize`, `fitBox` agree.
Callers multiply their own offsets by `ov.ui`.

## Hairlines: the Orbital language (`R.wire`, engine/wire.js, orbital.js, wire_models.js, wire_sea.js)

The Orbital films' wireframe (`reference/menus/common/wire.js`, `geo.js`) on the GPU. Every segment is an instanced
screen-space quad, 1 px at 1080p (scaled with the canvas), antialiased across, near-clipped, curved like the dots,
optionally depth-faded (fog) and near-faded; **MAX blending** (joints never bead, crossings never burn, order-free).

| | |
|---|---|
| `R.wire.seg(ax, ay, az, bx, by, bz, r, g, b, a)` | a world segment for this frame (colour 0..1). `path(pts, o)`, `ring(cx, y, cz, r, { rgb, a, n, a0, a1, dash: [on, off] })`. |
| `R.wire.batch(f32 [ax, ay, az, bx, by, bz, ...], cols?)` | a static batch (world m), uploaded once. `R.wire.add(B, { rgb, a, width, fog: [full, none], near, depth, scan, lights })` queues it for this frame (`scan`: the lime scan fronts light the lines; `lights`: the dynamic lights brighten them). |
| `R.wire.modelBatch(f32)` / `R.wire.model(B, { R, T, rgb, a, back, gen, genBack, sil, depth })` | facing-aware model segments (14 floats: a, b, n1 + weight, n2 + mode; modes: 0 plain, 1 edge (front when either face turns to the lens), 2 lathe generator, 4 exact lathe silhouette, found per frame in the shader). |
| `R.wire.flush({ exclude })` | draws what is queued. The renderer flushes at the end of `end()` unless `R.wire.auto = false` (the strategic layer flushes after its veil). `exclude`: a CSS px rect left untouched (the EO inset). |
| `R.veil(a, exclude, rgb, dissolve)` | after `end()`: darken the finished frame toward black by `a`; `dissolve` 0..1 makes the returns go out one by one (hash dither) instead of dimming. |
| `R.pcOff` | skip the point passes (black background, no terrain / model / effect dots): set by the strategic layer at k = 1. |
| `R.orbitalMap()` | the map's hairline picture (engine/orbital.js `OrbitalMap`, built once, contours in a worker ~0.1-0.3 s): coast (the 0 m line, .82), land contours at a nice interval (index lines brighter, plateaus avoided), soundings (-20 / -50 / -100 / -200 m), a 10 km graticule, the map frame with corner brackets. `draw(k, { a, depth, scan, lights, grid })` queues the layers, staggered by k. `ready`, `levels`, `layers`, `frame`. |
| `R.style` | `'pointcloud'` (default) or `'orbital'`: the whole frame in hairlines (below). |

`contours.js`: `extractContours({ heights, cols, rows, cell, x0, z0, levels, tol, tolCoast, blur, blurCoast, smooth,
minLen, minLenCoast })` (marching squares with block skipping, saddles by the cell centre, chained, Douglas-Peucker,
Chaikin), pure; `contours_worker.js` runs it off the main thread.

**The full Orbital style** (`R.style = 'orbital'`; the game sets it from Settings `renderStyle`, or `?style=orbital`).
`end()` draws the occluders (hills and the sea surface hide what is behind and below them), then: every queued model as
hairlines (`wire_models.js`: GEO primitives converted once per part and level, dyn parts per quantized state, part
transforms, explode, partX, damage in coral, `d._orbRgb` overrides the colour (the selection in yellow); the scan
fronts light them lime), the map's contours (depth-tested), the sea as the films' swell rows (`wire_sea.js`: rows
across the view heading in 30 degree steps cross-faded, world-fixed, thinned with range by ordered levels so they stay
~9 px apart on screen, riding the engine's swell, breaking at the coast and round the hulls on the water, gone above
~5 km), a horizon line, survey crosses on land round the target (close up only), then the effect dots.
`R.orbitalLook = { sea, map, models }` scales the layers; `R.worldBright` dims the world as in the point frame. With
`R.wire.auto = false` the second half (`R.orbitalPost(exclude, { fx })`, `R.drawFx(exclude)`) is left to the owner,
who draws it after a veil over the point passes other systems draw after `end()`.

The strategic layer that drives all this is the system `game/src/game/orbital.js` (its header documents it):
past ~36-60 km of camera distance the point picture dissolves into this language (`game.orbital = { k, kMap, from, to,
mapFrom, map, yellow, veil }`), with range rings, unit glyphs, catalog labels, the rounds' tracks and place names. The
map's hairlines lead: coast, contours and soundings come in from `mapFrom` (22 km) over the dots (`kMap`), so the
36-60 km band is never empty.

## Other

`gl.js` (`createGL`, `program`, textures) · `shaders.js` (the per-frame uniform block and the shared GLSL: dot
size rule, depth fade, lights, scan, sweep) · `stubmap.js` (`stubMap()`, a procedural coast that follows the Map
contract).

`play.html` debug: `?map=<id>|stub`, `?scale=`, `?bench=1` (logs `BENCH {...}` after 6 s), `?t=` (freeze),
`?cam=x,z,dist,yawDeg,pitchDeg`, `?ui=0`; console `ONIKS.benchSync(n)` (GPU-synced ms per frame),
`ONIKS.still(name)` (saves `game/shots/<name>.png`), `ONIKS.advance(sec)`; keys 1-9 fly to the showcase units.

**The stress suite** (`src/perf.js`): `await ONIKS.perf({ only: ['battle'], scale })` in play.html, or `game/perf.html`
(every map at three heights, every scenario on the first, the Debrief film; open it at 1920 x 1080). Frames back to
back at a fixed dt, each GPU-synced, per frame the main thread (`cpu`), the synced cost (`sync`), the GPU's own time
(timer query) and every system's time (`game.profile`); avg / p95 / p99 / max per scenario, the worst frames and where
their time went. `o.events` times each system's onEvent (otherwise counted in `sim`); `o.probe(ctx)` wraps any object's
methods (`ctx.probe(R.terrain, 'T', ['prepare'])`). Budget: 16.7 ms p99 and max, 8 ms average. The auto-quality guard
(`game/perfguard.js`) is held at full quality while it runs. Costs to know: a 2D canvas resize goes through the GPU
process (up to ~0.9 s behind a busy GPU: size canvases once, clear them with `ctx.reset()`); a hidden page runs its
timers once a second (the suite yields through messages).
