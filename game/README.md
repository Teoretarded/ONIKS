# ONIKS

A real-time strategy game on a coast, drawn entirely in the language of the reference films: a coastal battery
against a naval task group, every object a cloud of LiDAR returns.

## Run it

Double-click `run_game.bat` in the repo root, or:

```bash
python tools/serve_game.py
```

then open http://localhost:8771/game/index.html (Chrome or Edge; WebGL2).

## Modes

- **Sandbox**: any map, both sides, place anything (P), wake the enemy (K), fog (G), weather (N), switch the side
  you command (M), the anatomy museum (Shift+I).
- **Combat**: a skirmish against the AI as the Coast or the Fleet. Destroy the enemy HQ (command post / carrier) or
  hold the objectives.
- **Campaign**: six missions on the Coast side, each opened by one of the films. Grades S-D; rounds carry over.

## Controls (F1 in game shows them all)

| | |
|---|---|
| Camera | WASD / edges / middle-drag pan · right-drag or Q E rotate 360° · wheel zoom (20 m to 150 km) · PgUp PgDn pitch · F follow |
| Select | click · Shift-click · drag a box · double-click all of a type · Ctrl/Alt 1-9 groups · Tab |
| Orders | right-click move / attack · H weapons free / hold fire · T deploy · R reload · X scan · Y radar on/off · L drone (coast) or strike package (fleet) · U helo · O dive / come up · B reinforcements · Z stop |
| Views | I inspect (E exploded, X x-ray) · V radar view · C cinematic camera · J replay the last hit · F10 hide the UI |
| Time | Space pause · + − rate (x1 ... x32, always on screen) |
| Film maker | F9 panel · K key · Shift+K follow key · Shift+F9 play · F8 still |

## The signature things

- **Scan (X)**: a lime lightning bolt that forks to every hull in the ring, X-rays it and names its parts.
- **Inspect (I)**: the Anatomy films as gameplay: X-ray slice through hulls and containers, exploded views.
- **Hit replay**: a decisive hit plays in slow motion with the X-ray sweep and the damaged parts named in coral.
- **Radar picture**: contacts are clouds that firm up into ships; radars paint the sea; sonar rings find submarines.
- **Zoom out past ~40 km**: the dots dissolve into the Orbital films' hairline map.
- **Storms**: lightning lights the world and briefly reveals both sides.

## For developers

Design: `DESIGN.md` · contracts: `ARCHITECTURE.md` · systems: `src/game/README.md` · engine: `src/engine/README.md`
· sim: `src/sim/README.md` · maps: `src/world/README.md` · tests: `tests.html` · balance runs: `balance.html` ·
viewers: `maps.html`, `models.html`, `fx.html`, `audio.html` · what happened overnight: `NIGHT_LOG.md` · reviews:
`reviews/`.
