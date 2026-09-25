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

## 02:40 · Menus done
`game/index.html`: a favourite Point Cloud film plays live behind the menu, laid out like that film's own menu.
Sandbox / Combat setup screens with live map previews, Campaign screen (six missions, each opens with one of your
favourite films as the cutscene, then a briefing), Settings (saved), Quit ("stand the battery down": the film plays on).

## 02:50 · Maps done
Six maps, each 0.7-1.0 s to generate, cached after the first load: Krasnaya Kosa (the real seed-1337 coast),
Dolgaya Guba (fjords), Proliv Uzky (strait with a mid-channel island), Belye Shkhery (archipelago),
Ust-Solyonaya (river delta), Chyortova Past (drowned caldera). Viewer: `game/maps.html`.

## 03:00 · Sound and effects started early
Both are built against the contract so they don't wait for the engine: synthesized positional sound (thunder and
far explosions arrive late at the speed of sound) and the film effects library (launch, plume, intercept, hits,
splashes, wakes, lightning), each with its own test page (`game/audio.html`, `game/fx.html`).

## 03:20 · Engine done
WebGL2 renderer in the films' dot look: 1.5-3 ms per frame at 1920x1080 (budget 16 ms), ~700k ground dots in a
busy scene. Terrain and sea are a point clipmap that holds from 20 m to 150 km up, with the Earth's curvature
(ships go hull-down), a moving swell, a radar sweep that paints the sea, lime scan fronts, x-ray, exploded view,
per-part damage, dynamic lights. 360° camera. All HD models draw with turning rotors, fans and radars.
Integration started: the playable game (selection, orders, time rate, match flow, sandbox palette, cinematic camera).

## 03:30 · Sim done
The rules: 11 unit types with real sizes and speeds, land/sea pathfinding, fog of war built from sensors (radar
horizon, contacts that firm up into classified tracks, radars that can be heard, go-silent), the SCAN mechanic,
weapons, per-part damage, reloads by transloader, supply from objectives, reinforcements, weather, and an AI for each
side that only knows what its own sensors know. 16/16 tests pass; a 200-unit battle costs ~5 ms per frame at x32.
First balance runs: the fleet wins most maps, so a balance agent is now tuning it.

## 03:55 · Sound done; integration wave running
Positional synthesized sound (thunder after lightning at the speed of sound, doppler on missiles, loops for rotors
and fires), measured never to clip. Now running in parallel: game integration, HUD (minimap, command card, event log
like the Ring film), sensors (radar picture, contacts condensing into hulls, the lime lightning SCAN, radar view,
storms), Inspect (X-ray + exploded view in-game, the Anatomy films as gameplay), effects, world look polish, balance.

## 04:10 · It plays
All three modes start real matches from the menus: select (click, box, double-click, groups), right-click orders,
hotkeys (Z stop, H hold, T deploy, R reload, X scan, Y radar, L drone, B reinforce, Space pause, C cinematic camera,
F10 hide UI), time rate x1..x32 shown on screen, win/lose screens, campaign results back to the menu, and a sandbox
palette (P: place any unit, G fog, K wake the enemy AI, J switch side, N weather). Ships list and sink, vehicles
burn and wreck, aircraft sit on the carrier deck and bank in turns. The cinematic camera chases missiles like the films.
Agent retries used so far: 1 of 100 (the balance agent tripped the safety filter; relaunched as a pure numbers job).

## 04:25 · HUD, effects, Inspect done
- HUD in the films' type: objectives, rate/clock/supply, an engagement log laid out like the Ring film's, INCOMING
  alerts, selection panel, command card, minimap, reinforcements (B), tooltips.
- Effects from the films in the game: cold launch (gas, cap tumbling, booster lighting), plumes with shock diamonds,
  trails that drift with the wind, booster casings tumbling into the sea, intercept bursts, CIWS / 30 mm tracer
  streams, 5" gun blast, ship fireballs and leaning smoke columns, sinking, splashes, wakes, rotor downwash, lightning.
- **Inspect (I)**: the Anatomy films as gameplay. The camera flies in, the world dims, a lime X-ray slice runs along
  the unit and shows what's inside (rounds in the TEL's containers, the Pantsir's 57E6s, 96 VLS canisters, the
  destroyer's turbines and shafts below the waterline), tags condense in clean columns, E explodes it (parts leave in
  order and come home in reverse, the films' timing), damage shows coral per part. Click a missile in flight:
  bullet time (x0.05) and orbit the round. Sandbox: Shift+I opens an anatomy museum of all 29 models.
  Stills: `game/shots/final_*.png`.

## 05:30 · Sensors and campaign done
- **Radar picture**: radars paint the sea with a lime-edged sweep; contacts are clouds of dots taken from the
  unit's own model around the *estimated* position, pulled tighter on each radar hit, snapping onto the hull with a
  lime flash when classified (`TRK 22 · DDG · ARLEIGH BURKE 0.97`, coral). Heard radars show as coral bearing fans.
- **Lightning SCAN (X, click)**: aiming reticle with the contacts it would catch, then a branching lime bolt comes
  down, flickers, lights the world, and a lime front sweeps the radius; every enemy it passes lights up in tendrils,
  is X-rayed for a moment (rounds in the containers, VLS canisters) and gets part placards. Enemy scans on you show
  coral-white. **Radar view (V)**: the world becomes the scope (clutter height field, rings, bearing ticks, tracks).
- **Campaign**: a mission-script system (camera openings, one line at a time, triggered beats, raids, weather) and six
  crafted missions: 1 Inside (guided tutorial), 2 Scale (hide and find with drones, radars silent), 3 Battery (air
  raids, radar discipline), 4 Engagement (the big salvo, the cinematic camera takes it), 5 Ring (fire and move under
  counter-fire, hold 15 min), 6 Strike (a storm cell over the lagoon hides your rounds; lightning reveals both
  sides). Grades S-D, rounds carry over between missions.
- Running now: world look polish, balance, landmark set pieces per map, first scored review.

## 05:40 · Review 1: 6.5 / 10
`game/reviews/review_1.md`. Best: Inspect/Anatomy (8.5), the lime scan bolt, the radar picture, engagement
moments, performance (2-5 ms/frame, no console errors anywhere). Weakest: the RTS layer takes decisions away
(the opening salvo fired by itself, the fleet couldn't launch its aircraft), first contact comes too late, two
missions didn't fight back, and the scan's payoff happens on a speck.
Fix wave launched: gameplay fixes (player fires first, weapons free/hold fire, carrier air wing launch, scans out of
reach refused, HUD collisions, clickable alerts, look up at launches), scan payoff (chain lightning that forks to
every contact, part boxes and decoding labels on the hulls in the normal view, a magnified EO inset like the films),
campaign pacing and threat. The world-look agent also got the "units must pop over the ground" note.

## 06:10 · World look done
The sea now lies in world-fixed bands like the Engagement film (measured against it: same dot spacing and brightness
at the same framing), land reads as LiDAR with crisp cliffs, coastlines and contour lines from high up, fields and
marsh on the flat maps, a horizon band with sparse stars. The ground dims around units so ships and trucks stand out.
Before/after: `game/shots/look_before_after.png`, `look_film_vs_game.png`. Director + hit replay agent started
(the cinematic camera frames the action; a decisive hit plays as a slow-motion Anatomy moment with the X-ray sweep).

## 06:15 · Landmarks done
Each map now has set pieces and life: Krasnaya Kosa's steaming mud volcanoes, fishing camp on the red spit, TV mast;
the fjord's suspension bridge (430 m span), car ferry, hydro station, waterfalls; a 4.2 km cable-stayed bridge across
the strait; wrecks on the archipelago's reefs with small lighthouses; gas platforms with flares that light the sea
in the delta; the caldera cone's steam plume leaning with the storm wind. Towns with lit windows at night, lighthouse
beams sweeping the sea, buoys blinking in real patterns, cargo ships and trawlers at real speeds. Stills: `lm_*.png`.
Orbital agent started: past ~50 km altitude the picture dissolves into the Orbital films' hairline language
(black, white contours, yellow for your salvo, catalog labels) and re-condenses into dots as you zoom back in.
