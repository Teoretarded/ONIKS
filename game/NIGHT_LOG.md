# Night log

What happened while you slept, newest last. Times are local.

## 02:00 · Stack and plan

**Stack: stay in the browser. Plain JavaScript + WebGL2, no engine, no build step.**

Why not Unity / Unreal / Godot / C++ / Python:
- Everything that makes ONIKS look like ONIKS already exists as JavaScript: the dot renderer (max-blend squares),
  the hairline renderer, the HD models (TEL, radar, Pantsir, destroyer, carrier, helo, fighter...), the lightning
  scan, the X-ray and exploded views, the synth sound, the real seed-1337 map. A game engine would mean rebuilding
  all of it, and its default rendering fights this look (it wants lit triangles, not LiDAR dots).
- WebGL2 has `MAX` blending, which reproduces the films' dot look exactly on the GPU, so the game can draw
  millions of dots at 60 fps instead of the films' few hundred thousand on the CPU.
- Python (the old game) is too slow for this many dots and made the game heavy to change.
- The menus can literally be the films (same page tech), which the look requires.
- Later it can be wrapped as a desktop app (Tauri or Electron) without changing the game code.

Layout: `game/` (the game), `reference/` stays read-only (the films and the kit are loaded from it).
Run: `python tools/serve_game.py` then open http://localhost:8771/game/index.html

Plan:
1. Foundation (5 agents in parallel): WebGL point-cloud engine + 360° RTS camera; headless sim (units,
   sensors/fog of war, weapons, damage, reloads, economy, AI); six unique maps; menus over live films; extra
   models (command post, transloader, depot, port...) + anatomy data for the Inspect view.
2. Integration: the playable game (selection, orders, HUD, minimap), effects from the films (launches,
   intercepts, hits), the radar picture + lime lightning SCAN, Inspect / X-ray / exploded view, sound.
3. Modes: Sandbox, Combat (skirmish vs AI), Campaign (six missions, films as cutscenes).
4. Review agent every ~2 h scoring 1-10, fixes, polish, performance.
