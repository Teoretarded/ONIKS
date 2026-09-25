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

## 06:35 · Gameplay fixes and balance done
- The player now fires first: your launchers start with weapons held (H toggles weapons free / hold fire);
  defensive fire (Pantsir, SM-6, Phalanx) stays automatic. As the fleet you can now launch the carrier's air wing
  (L strike package, U helo, or right-click a track with the carrier selected). Out-of-reach scans are handed to
  another scanner in reach or refused ("OUT OF REACH · 106 / 85 KM") instead of driving the radar away. HUD
  collisions fixed, alerts clickable, and near the ground you can tilt the camera up to watch a round climb.
- Balance: spawns moved to 89-114 km apart; every map now 40-58% coast wins over 48 AI-vs-AI matches (was 0-73%);
  `game/balance.html` runs the batches.
- Started: first-run polish (F1 help overlay, loading screen, model warm-up, in-game settings) and a units expansion:
  E-2D Hawkeye (turning rotodome, flying radar), Virginia and Kilo submarines (hidden under the sea, found by sonar
  rings on the water), Bal coastal launcher.
- `run_game.bat` in the repo root starts the server and opens the game.

## 06:45 · Scan payoff done
The scan is now the signature move: the bolt forks to every hull in the ring (chain lightning, nearest first), the
area flashes lime, lime tendrils race over each struck hull, the X-ray flickers on (VLS canisters, turbines, the
rounds in a TEL's containers), fitted 3D part boxes pop in order with labels decoding out of glyph noise, the tag
counts up to 0.97 and settles coral. When the target is a speck, a magnified inset opens beside the log with the
cutaway turning under a lime slice. Storm lightning forks in white to everything near the strike, both sides.
Stills: `game/shots/final_1_forks.png` ... `final_7_close.png`.

## 06:55 · Campaign pacing fixed
Every mission's first beat now comes within minutes; a passive player loses every mission except the tutorial;
each was won on the first try by a scripted player (grades S/A). M2 has a hide-and-seek structure (their helicopter
takes off at 6:00 and its radar gives you a bearing), M5 is fire-and-move with a depot ring to refill Pantsirs,
M6's storm cell is how you get rounds through to the carrier. Results only count in unlock order.

## 07:05 · First-run polish done
A loading screen in the menu's style with the real steps (MAP, TERRAIN, FORCES, SYSTEMS, MODELS) that fades into the
opening shot; every model pre-sampled at load (the 40 ms close-up stalls are gone); F1 help lists every control from
the real bindings; quit/continue fade to black; the pause menu's Settings row opens live settings; a render-style
setting (Point Cloud / Orbital) is in Settings. The dev server now answers on the IPv6 loopback too, so the game
loads in ~3 s instead of ~14 s on Windows. Film maker agent started (compose camera takes over a live match).

## 07:10 · Cinematic camera and hit replay done
C: the camera always frames the action: launch from the side, chase from just behind the plume, a cross to the
target's side 4.6 s before impact, holds on the hit, low orbits of the sinking. No cuts. **Hit replay**: when a
heavy round is about to hit something you can see, time eases to x0.25, the camera glides in low, the lime X-ray
front reaches the impact point at the moment of impact, damaged parts flash coral with their names
("04 DECKHOUSE · AN/SPY-1D(V) ×4 · OUT"), a destroyed hull drifts apart along its explode offsets, then the camera
pulls back to the sinking. J replays the last hit; Esc skips. Stills: `final_rep*.png`, `fin_*.png`.

## 07:20 · Orbital layer done
Zoom out past ~36 km and the dots drop away one by one into the Orbital films' language: pure black, the coastline
and contours as white hairlines, a 10 km grid, the map frame, catalog labels (square, name, barcode, true status),
range rings labelled by what reaches, and one yellow: your salvo in flight with "3M55 ×4 · Mach 2.2 · 36 km to go".
Zoom back in and the dots re-condense. The whole game can also be played in the Orbital style (Settings → Graphics
→ Render style, or `?style=orbital`): hairline models, wire swell rows, contour terrain. Stills: `orb_*.png`.
Review 2 started.

## 07:50 · Polish pass 2 done
World tags now scale with the HUD (1440p/4K look like 1080p, larger), sensor tags never run off screen, the Effects
quality setting really changes the effect budget, a hit-replay setting, combat grades reflect play (a win with
nothing destroyed is C at best), inspect labels no longer collide, sandbox side switch moved to M (J = replay).

## 08:00 · Film maker done
F9 opens a film panel in the films' style: K sets a camera key at the current view, Shift+K a key that follows the
selected unit or the next round, rate ramps (x1 -> x0.25 -> x8) blend like the films' warps, captions ("Fig. 2 Over
the sea"). Shift+F9 plays the take clean over the live match with the films' readout and timeline bar; F8 saves a
full-res still, Shift+F8 a 30 fps PNG sequence. Built-in takes on any map: a dusk orbit of the battery, a chase of
the next round off the rail, a climb from the sea to 60 km (it dissolves into the Orbital map on the way up).

## 08:15 · Units expansion done
Four new units with film-quality models and X-ray interiors:
- **E-2D Hawkeye** (fleet): the 7.3 m rotodome turns once every 10 s; a flying radar launched from the carrier.
- **Virginia SSN** (fleet) and **Kilo 636.3 SSK** (coast): run submerged, drawn as a ghost of the hull under the
  water; invisible to radar, scans and lightning; found only by **sonar** (lime pulses over the water from ships,
  boats and the MH-60R's dipping sonar, white rings where a boat is heard); come up to periscope depth to fire
  (O dive / come up, Shift+O surface). X-ray shows launch cells, torpedo rooms, reactor / battery and diesels.
- **Bal** (coast): 8 Kh-35U in a pack that tilts up, faster to deploy than the TEL, shorter range.
Rounds now terrain-follow with look-ahead (no more flying into the fjord cliffs). 17/17 sim tests pass.

## 08:25 · Review 2: 7.5 / 10 (passes)
`game/reviews/review_2.md`. Up from 6.5. Best: the hit replay ("the Anatomy film happening to your enemy"), the
scan payoff, campaign mission 4 ("the best 10 minutes in the game", won with grade S), the Orbital map, Inspect (9/10).
Weakest: skirmish Combat is thin without scripts (attack orders fire once, the coast AI doesn't press), storms read as
static and natural lightning is a small lime squiggle, big hulls saturate into white slabs up close, a few bugs.
Wave 3 launched: combat depth (attack orders persist, salvo size, "in reach" alerts, a coast AI that presses),
storm fronts crossing the map with white lightning lighting a dot cloud ceiling, a bugfix sweep. Next: hull dot
saturation and the mid-altitude sea, and a salvo board (the Salvo film's lanes when rounds are in the air).
`game/README.md` is the player's guide.

## 09:10 · Bugfix sweep done; wave 3 running
Right-clicking a "?" contact now says "NOT TRACKED · SCAN IT (X)" and names the scanner in reach; the fjord battery
spawns on the mainland and units never stack; the replay survives units being removed; the cinematic camera frames
round and target mid-course and holds the last kill through the end screen; tags never sit on HUD panels; true slice
labels (CHASSIS / HULL); the main menu is titles only (no subtext); R explains why nothing reloads.
Running: combat depth, storm fronts + white lightning, look pass 2 (hull dot saturation, mid-altitude sea, haze),
the salvo board, and the debrief film (a Combat match is recorded and re-simulated exactly, then its best moments play
as one continuous take ending in the Orbital map).

## 09:45 · Storms done
Storms are now dot thunderstorms: a flat dark base at ~1.3 km, towers to ~10 km with an anvil, lit from inside on
every flash; white lightning (lime stays the player's scan) with a stepped leader and 2-4 return strokes, readable
at 40 km, attracted to masts; rain as slanted streaks inside the cells only; the sea rougher under them. In Combat a
squall line of 5-8 cells crosses the map every 8-12 game-minutes: inside a cell radars see less, strikes reveal both
sides, and a player scan fired into a cell reaches up to x1.5 farther. Stills: `game/shots/storm/final_*.png`.

## 09:50 · Salvo board done
When two or more rounds of a salvo are in the air, a strip opens above the command card like the Salvo film: one
lane per round on a shared time-to-impact axis (`R1 3M55 … T–0:11 M 2.2 7.8 KM`), interceptor ticks rising under each
round, lanes ending HIT / DOWN (`SM-6 · 25 KM`) / MISS / SPENT; incoming raids in coral with their targets
(`RAID 01 · 4 × TLAM · → SAM 06`). Click a lane to ride behind that round. Stills: `game/shots/salvo_board/`.

## 10:00 · Combat depth done
Attack orders now keep firing volley after volley (each volley watched until its rounds are down), hold when the
track is lost ("TRK 22 · LOST · HOLDING 5:00") and resume when it comes back; salvo size 1 / 2 / ALL (`~` key or the
Salvo row); "IN REACH" alerts when a classified track comes within reach of your weapons (click to fly there, drops
to x1). The coast AI now presses in skirmish (an idle fleet on the strait: 34 rounds, two destroyers and the carrier
sunk by T+60, where it used to fire 8 rounds and stall). 20/20 tests. Balance swung (two maps now favour the coast),
so a numbers-only balance pass is running.

## 10:05 · Look pass 2 done; review 3 started
Model dots are now capped by spacing on screen (1.8 px at 1080p), so big hulls keep their dot texture up close (the
carrier deck at 420 m is no longer a solid slab) with a camera fill light like the Anatomy · Ship film; the sea reads
as rows from 5-20 km and no longer looks like stars; haze fades with distance instead of blacking out the near sea;
the Orbital hairlines start fading in at 22 km so the zoom never passes through an empty band.
Started: review 3, and a film-quality Nimitz (island with turning radars, angled deck, catapults, elevators,
sponsons, below-waterline shafts and propellers; an X-ray/exploded anatomy).

## 10:10 · Debrief film done
Every Combat or Sandbox match is recorded (setup + your commands with their ticks; the sim is deterministic, checked
by state hashes every 30 s). On the end screen, **Debrief** (D) re-simulates the match and films it as one continuous
take (~60 s): Fig. 1 first salvo side-on, Fig. 2 the chase, Fig. 3 the hit's X-ray replay, a time jump up through the
Orbital map with the true rate on screen, the decisive round, the wreck, and Fig. 7: a climb to 130 km where every
round's track draws on in launch order with the tally ("3M55 Oniks · 8 fired · 2 hit · 4 down"). V opens a replay
viewer with a scrub bar. Stills: `game/shots/debrief/final/`.
Note: `game/shots/` (gitignored) holds ~2.3 GB of the agents' test stills; safe to clear.

## 10:25 · Sound 2 done
Sonar pings with a ringing decay and a faint echo after the true round trip at 1,500 m/s, torpedo launches and runs,
submarine vents/blow/surfacing, the E-2D's turboprop beat, Bal and sub-launched missile sounds, distant in-cloud
rumbles, rain and wind that follow the storm cells, and a slow-motion treatment for the hit replay (everything lower
and longer, a double sub pulse, a boom at impact). Rate-change blips no longer spam during replays and film takes.
Selecting units and giving orders now click (the sounds existed but nothing triggered them). Measured peaks stay
under -1 dBFS in every stress test.

## 10:35 · Effects 2 done
Bal launches (a hot flash at the pack's rear, efflux rolling over the cab, the booster dropping off, then a faint
turbofan shimmer), submarine missile launches (the sea domes up, a water column, the booster lighting just above the
waves, spray falling back in rings), torpedo launches from ships (arcing out of the tube) and helicopters (under a
small parachute), bubble lines on the surface, torpedo hits as a slow 110 m white water column along the hull instead
of a fireball, wakes that follow a boat's depth (none deep, a feather at periscope depth), water pouring off the sail
when a boat surfaces, E-2D prop discs.

## 11:05 · Review 3: 8.0 / 10
`game/reviews/review_3.md`. Up from 7.5. Combat is now a real game (the reviewer won a full Coast match on Krasnaya
Kosa, grade B, and the AI pressed hard in every match); storms look like the Storm film; no more white slabs; the
debrief film is "lovely"; campaign M5 and M6 won S, M3 lost then won A; 2-5 ms per frame, no console errors.
Keeping it from 9: the salvo board covers the picture in the busiest moments, the opening shots and the open sea,
the debrief missed the winning kill (fixed), the finale is too easy, the fleet struggles to find the land.
Final wave launched: HUD fixes (salvo board capped and collapsing, strip mode in cinematic/replay/radar view,
lightning log as one line, victory ticks, backing veils, first Esc opens the menu), first impressions (matches open
60-120 m off your HQ or carrier and pull out; scan reach rings while aiming, out-of-reach said in the log), the finale
(the carrier stays out of reach until the storm covers it, counter-fire after each salvo), a radar-scope minimap
(lime sweep at the real rate, "?" clouds firming into coral ticks, emitters as bearing lines), look 3 (X-ray
interiors no longer saturate, no stall after camera jumps, stronger swell rows).

## 11:25 · The Nimitz
A film-quality carrier replaces the old far-view one: 332.8 m, the 9° angled deck with markings, four catapults with
blast deflectors, arresting wires, four elevators, the island with Pri-Fly glazing and turning SPS-48E / SPS-49, NSSM,
RAM and Phalanx as closed shapes, the underwater hull with four shafts and 6.4 m screws. Inspect it (I, E, X): the
radars go first, the island rises level by level, the flight deck lifts off, the hangar rises out of the hull with
eight F/A-18Es and two E-2Ds inside, the reactor spaces and magazines as closed volumes, the hull splits in three.
Stills: `game/shots/cvn_inspect_*.png`, `mus_cv_*.png`.

## 11:40 · Balance 3 done
Over 192 AI-vs-AI seeds per map every map is now 48-58% coast wins with median matches of 30-53 min, and only
3 of 1,152 matches ended in under 10 minutes. The coast AI holds fire on the carrier for the opening (5 min on normal,
3 on hard); three fleet spawns, four depots and three replenishment points moved.

## 11:45 · Orbital style everywhere
With Render style = Orbital, every layer now speaks the Orbital films: the radar beam as a hairline edge, contacts
as hairline returns with dashed uncertainty ellipses, the scan bolt and part boxes as white hairlines with catalog
placards, smoke as scalloped puff outlines, fireballs as opening rings, wakes as V arms, the HUD in Inter / DM Mono
with the one yellow on your selection or your salvo in flight. Point Cloud is unchanged.

## 11:40 · HUD fixes done; scaling up
Salvo board capped at two groups of four lanes, finished groups collapse to one line, a strip in cinematic / radar
view, "DESTROYED" for land targets; combat victories tick their objectives; lightning logs one line; round names
consistent; drone launches aimed from the minimap; tags keep off the title band.
With usage to spare, nine agents now: first impressions, the finale, the radar-scope minimap, look 3, fleet sensing +
rebalance, two new maps (an Arctic coast with sea ice, and rias or a harbour city), museum mode + film rewatch from
the menus, an amphibious expansion (LHD, LCAC hovercraft, landing vehicles, beach defence), save/continue built on the
deterministic recorder + kill stills on the end screen.

## 11:55 · Radar-scope minimap
The minimap is now a radar scope by default (click the header for the map): centred on your main radar, a lime sweep
turning at the real antenna rate (Monolith-B 12 rpm), sea and rain clutter lighting as the beam passes, "?" clouds
collapsing into coral ticks with "TRK 41 · 0.99", emitter bearing lines, white sonar rings, rounds, your units in lime.

## 12:05 · First impressions done; physics and performance
Matches now open close on your command post (84 m out) or carrier (582 m, from the port quarter), hold a beat, and
pull out over 5 s to the play view with no cut. While aiming a scan (X), every scanner's reach is a labelled lime ring;
out-of-reach says so in a toast and the log; "IN WEAPON REACH · NOT SCANNED" alerts tell you when to move a radar.
Started on request: a physics pass (acceleration and turning circles, ships heeling and riding the same waves the
renderer draws, aircraft banking with energy, flooding-based sinking with list and trim, debris ballistics, no
overlapping units) and a performance guard (a stress suite over the worst scenes, spike fixes, and automatic quality
scaling so the game holds 60 fps).

## 12:15 · Look 3 done; your request: physics, not dice
X-ray interiors and wings no longer saturate into white slabs (inside parts thinned on screen, highlights roll off
like the Anatomy · Ship film); the stall after camera jumps is gone (model detail is sampled a few primitives per
frame inside a 5 ms budget; the worst 30-frame average after a jump fell from 26-34 ms to 10 ms); the near sea
shows world-fixed swell rows.
Per your note (no dice rolls; rigid bodies; the gun stream that makes a missile spin out and shed its modules):
- **Hit physics**: every hit-chance roll is being replaced by collision tests: gun bursts as real rounds with
  dispersion, gravity and drag flown against the target's moving body; interceptors and missiles with simple
  turn-rate-limited steering that hit only when their path meets the body; damage lands on the part the impact
  point is in. A missile grazed but not destroyed loses control and spins out.
- **Rigid-body break-ups**: when something is hit, its modules (nose, body sections, wings, fins, booster, rotor
  blades, masts, radar arrays) separate as rigid bodies with mass, spin, drag and splashes, burning pieces trailing
  smoke; a spun-out round tumbles and sheds fins, then wings, then the booster, until it hits the sea.
