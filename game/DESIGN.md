# ONIKS: game design (v1)

A real-time strategy game on a coast, drawn entirely in the visual language of `reference/films`.
The default look is **Point Cloud**: graphite `#0B0C0A`, white LiDAR dots (max blend), lime `#C6F432` for
own forces, scans and identification, coral `#FF6A3D` for hostile, sparingly. Geist + Geist Mono.
**Orbital** (black, white hairline wireframe, one yellow `#F4D23C`) is a later, optional render mode.

The title is just **ONIKS**. No taglines, subtitles or flavour lines anywhere. Labels are short, true, and
diegetic (designation · class · value), like the films. Nothing that looks like a website template; no bright
or white panels.

## The fantasy

You command one side of a coastal war and you *see it the way the films do*: every object is a cloud of
returns. What you know is what your sensors have told you. The map is a live radar picture you can fly
through in 360°, from a metre off a missile's skin to 150 km up.

## Sides

| Side | Colour (when it is yours) | Units |
|---|---|---|
| **Coast** (Bastion coastal battery) | lime | Command post (HQ), K340P TEL (2 × 3M55 Oniks), Monolith-B radar, Pantsir-S1, Orlan-10 drone + catapult truck, transloader (reload crane truck); S-400 (5P85SM2-01 launcher + 92N6E radar), A-222 Bereg 130 mm gun |
| **Fleet** (naval strike group) | lime when played; coral when enemy | Arleigh Burke DDG (SM-6 interceptors, strike missiles, 5" gun, 2 × Phalanx), Nimitz carrier (HQ; launches F/A-18E and MH-60R), MH-60R Seahawk, F/A-18E Super Hornet; Ticonderoga CG (air defence), Independence LCS (fast scout) |

The opposing side is always coral; unknown contacts are white.

Real dimensions and speeds (DDG 155 m, 30 kn; Oniks 8.9 m, ~Mach 2.5; F/A-18E ~250 m/s; MH-60R ~70 m/s;
Orlan-10 ~30 m/s; trucks 15-20 m/s off-road less). Weapon ranges are scaled down to fit the maps and say so
nowhere they would be false; the time rate is always on screen.

## Time

Real speeds on 80-160 km maps are slow, so **time compression is part of play**: pause, x1, x2, x4, x8, x16,
x32. Default x4. The current rate is always shown ("x8"). The game auto-drops to x1 (with a lime blip) when a
launch or a new hostile contact happens, like a naval sim, so the spectacle is watched at real speed.

## Core loop

1. **Find**: sensors build the picture. Radars paint sweeps, drones and helos look, ships' radars search.
   Contacts start as white uncertainty clouds `? 0.31` and firm up hit by hit into classified tracks
   `DDG · Arleigh Burke 0.89` (the p5 Confidence look). Only tracks above a confidence threshold can be
   engaged. Emitting radars can be detected by the enemy (a radiating unit shows as a bearing line / rough
   position): switch radars on and off (EMCON) to hide.
2. **Scan** (signature mechanic, the lime lightning): the radar, drone, helo and HQ carry a SCAN ability. A
   branching lime lightning bolt strikes the target area; the scan front sweeps through everything there
   and *identifies* it instantly: part boxes, designations, confidence 0.97. Cooldown. Scanning reveals you
   for a moment. In a storm, real lightning also briefly lights up hidden units.
3. **Strike and defend**: launches look like the films (cold ejection, booster, pitch-over, plume with shock
   diamonds, booster ejection, wings unfolding). Interceptors, gun tracers and CIWS streams meet incoming
   rounds; intercepts and hits flash, smoke, spark and throw debris; ships list and settle when sunk, trucks
   burn. Everything is visible from any angle.
4. **Sustain**: missiles are finite. TELs are reloaded by a transloader truck (crane swings a fresh TLC onto
   the TEL; the X-ray shows the next round inside). Transloaders refill at depots. Ships refill only at their
   replenishment point on the map edge. Supply points (SUP) come from holding objectives (ports, depots,
   radar hills, airfields) and pay for reinforcements, which arrive at your spawn.

## Views and signature features

- **360° camera**: orbit around any point, yaw a full 360°, pitch from near-horizontal to straight down,
  zoom from 20 m to 150 km, pan with WASD / edge / middle-drag, follow a unit (F), frame selection.
- **Inspect / Anatomy** (I, or double-click a unit): the camera flies close, the scene dims, the lime X-ray
  scan passes *through* the hull or container and shows what is inside (rounds in tubes, the ramjet, the
  booster), parts are tagged with their real designations and sizes, **E** blows the model into an exploded
  view that floats apart and back, damaged parts show coral. Enemy units can only be inspected once they
  have been identified by a scan.
- **Radar view** (R): the world becomes the scope: sea-clutter height field, the rotating beam with its lime
  edge, range rings, tracks.
- **Cinematic camera** (C): an auto-director that picks the most interesting thing happening (a launch, an
  intercept, a hit) and flies the camera like the films. **H** hides the UI.
- **Dynamic light**: flashes, plumes, muzzle fire and lightning light up nearby dots (terrain, hulls, smoke).
- **Weather**: calm, haze, rain squalls (radar clutter), storms with lightning that flash the whole cloud.

## Modes

- **Sandbox**: any map, both sides' full rosters in a spawn palette, place anything anywhere, command either
  side, the red force stays passive until you wake it (AI toggle), fog on/off, weather and time controls,
  Inspect everything. The toybox.
- **Combat**: skirmish on a chosen map vs the AI: choose side, map, enemy strength, fog of war on. Win by
  destroying the enemy HQ (command post / carrier) or holding objectives until the timer. After-action report.
- **Campaign**: six escalating battles on the Coast side, each opened by one of the reference films as the
  cutscene (the story), then a briefing, the mission with objectives, and a debrief with a grade. Ammunition
  carries over between missions; every grade is kept.

## Maps (every one different in shape, mood and play)

1. **Krasnaya Kosa**: the real seed-1337 coast from `theatre.js` (a ~140 km window around the battery bluff).
2. **Fjord**: long, steep, narrow inlets; ships must thread the channels, batteries hide on the cliffs.
3. **Strait**: two coasts facing each other across a narrow strait with an island in the middle.
4. **Archipelago**: dozens of islands; lots of radar shadow; drones matter.
5. **Delta**: a flat river delta with sandbars and channels; low ground, long radar lines.
6. **Caldera**: a drowned volcano ring; one gap into a central lagoon.

Each map: real-looking DEM, bathymetry contours, named places, objectives, spawn zones, a weather preset.

## Menus

The menu sits over a live cinematic: one of the favourite films plays behind (Anatomy, Anatomy · Ship,
Anatomy · Battery, Engagement, Aegis), with the menu laid out as in that film. Entries: Sandbox, Combat,
Campaign, Settings, Quit.
