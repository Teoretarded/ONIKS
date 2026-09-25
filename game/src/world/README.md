# world/: the six maps

```js
import { MAPS, loadMap } from './world/maps.js'
import { renderPreview } from './world/preview.js'
```

## `MAPS`

Static, no generation: `[{ id, name, blurb, size: [W, H] }]` in menu order.

| id | name | size (km) | cell | weather · time |
|---|---|---|---|---|
| `krasnaya_kosa` | Krasnaya Kosa | 140 × 150 | 100 m | calm · night |
| `fjord` | Dolgaya Guba | 140 × 120 | 100 m | haze · dusk |
| `strait` | Proliv Uzky | 120 × 140 | 100 m | rain · day |
| `archipelago` | Belye Shkhery | 140 × 140 | 100 m | calm · day |
| `delta` | Ust-Solyonaya | 130 × 110 | 100 m | haze · dusk |
| `caldera` | Chyortova Past | 100 × 100 | 100 m | storm · night |

## `await loadMap(id, opts?) -> Map`

Deterministic. Runs in a module Worker (`worker.js`, up to 3 at once; falls back to the main thread).
Cached per page by `id@cell` (a second call returns the same promise/object) and in IndexedDB
(`oniks-maps`, keyed `id@cell#GEN_VERSION`): a later visit loads a map in 10-200 ms. Generation
0.7-1.1 s per map (see `map.timing`; `map.cached` says which path was taken); the first call also pays
for the worker start and, for Krasnaya Kosa, fetching `reference/menus/common/theatre.js` (780 KB).
**Whoever changes what `world/` generates must bump `GEN_VERSION` in `defs.js`**, or pages keep
loading the cached maps.

`opts.cell`: output cell in metres (e.g. `400` for a quick low-res copy for a thumbnail; the layout,
places, objectives, spawns and roads are identical at every cell). `opts.worker: false`: stay on the
main thread. `opts.cache: false`: skip IndexedDB.

The Map is exactly the contract in `game/ARCHITECTURE.md`:

- `W, H` metres; x ∈ [-W/2, W/2] (east), z ∈ [-H/2, H/2] (north); sea level y = 0.
- `cell, cols, rows, heights`: node grid, `cols = W / cell + 1`; node (i, j) is at
  `x = -W/2 + i*cell, z = -H/2 + j*cell`; row 0 = south edge, col 0 = west edge; `heights[j*cols + i]`.
- `h(x, z)`: bilinear, clamps outside. About 20-25 ns per random-access call; safe to call a lot.
- `water(x, z)`: `h < 0`. There are no inland water bodies above sea level.
- `slope(x, z)`: tan of the ground slope from the cell's bilinear gradient, capped at 1 (45°). 0 flat.
- `places: [{ name, x, z, kind }]`, kind ∈ town, village, cape, bay, fjord, strait, island, peak, port,
  spit, lagoon, channel, bar, ridge.
- `objectives: [{ id: 'OBJ 01', name: 'Port · Rybachy', x, z, r, kind }]`, kind ∈ port, depot,
  radar_hill, airfield, lighthouse. 5-6 per map. The ground under each is levelled (a pad); ports sit on
  the shoreline (a small quay is filled if the point was in the water).
- `spawns: { coast: { x, z, r, hdg }, fleet: { x, z, r, hdg } }`: coast on land, fairly flat, near the
  shore, with higher ground within ~9 km, `hdg` facing the nearest open water; fleet in open water
  (deeper than 25-100 m, clear of land by ≥ 4.5 km), `hdg` towards the coast. Heading: radians,
  0 = north (+z), π/2 = east.
- `replenish: { x, z, r }`: open water near a map edge.
- `roads: [[[x, z], ...], ...]`: polylines on land linking towns, objectives and the coast spawn,
  A* over slope on a 500 m grid, simplified and smoothed. Short bridges over shallow water (delta
  channels, sounds) are allowed; roads never cross open sea.
- `weather: { kind: 'calm'|'haze'|'rain'|'storm', wind: [dx, dz] m/s, sea: 0..1 }`, `time`.
- Extras (not in the contract): `genMs` (wall time of this load), `timing: { plan, layout, fine, total }` ms
  of the generation, `cached` (true when it came from IndexedDB).

Heights are true metres (no vertical exaggeration): Krasnaya Kosa's plateau is 120-180 m behind a
25-55 m clay bluff; the fjord's fjell reaches ~1000 m with fjords 150-460 m deep; the delta plain is
0.3-5 m; the caldera rim 400-700 m around a lagoon 300-480 m deep.

## `renderPreview(map, canvas, opts?) -> { scale, ox, oy, toCanvas(x, z), toWorld(px, py) }`

Top-down dot picture in the Point Cloud look, drawn at the canvas's pixel size (set `canvas.width/height`
to CSS size × dpr first). 5-40 ms at 640×360. Options:
`fit: 'contain'|'cover'`, `pad` (css px, 12), `dpr` (1), `labels: true|false|'full'` (objective ids, or
ids + names), `places` (false), `roads` (false), `objectives` (true), `spawns` (true), `contours` (true),
`view: [x0, z0, x1, z1]` (world box to frame), `fontSize` (10), `density` (1).

## Files

| file | what |
|---|---|
| `maps.js` | public API, worker pool, the Map object |
| `defs.js` | the six maps: names, sizes, seeds, weather, time |
| `gen.js` | pipeline: plan grid (250 m, large shapes) → layout → fine grid (map cell) → pads |
| `gens/*.js` | one generator per map (`plan`, `fine`, `layout`, optional `shape`) |
| `theatre.js` | loads the real seed-1337 DEM without running the script (Worker-safe) |
| `noise.js`, `grid.js`, `lines.js`, `analyze.js` | noise, grids (cubic, blur, distance, flow, carving), line fields, site search and roads |
| `preview.js` | `renderPreview` |
| `worker.js` | the module Worker |

Viewer: `http://localhost:8771/game/maps.html` (click a map; wheel zooms, drag pans; `?only=fjord`
loads one map and opens it; `?nocache` regenerates).
