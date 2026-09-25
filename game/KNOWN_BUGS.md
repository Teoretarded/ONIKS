# Known bugs

From the user's play-test (2026-09-25), plus what the agents reported at the end of the overnight build.
Screenshots of several of these were shared in the chat. Start the next session here.

## From the user's play-test

1. **Zooming speeds up the radars.** *Fixed (2026-09-25, ce48778): `=`/`-` now zoom, `]`/`[` set the time rate.* Cause: every antenna, rotor,
   dome and scope sweep is already a pure function of sim time (`antA + antW (t - antT)` in `data/units.js`,
   `ui/sensors/radar.js`, `ui/hud/scope/ppi.js`, `hud/minimap.js`; measured: `game.t` advances exactly with real
   time while wheel-zooming). What speeds them up is the time rate: **`=` / `-` (and numpad `+` / `-`) are the time
   rate keys** (`game/time.js` takes them from the camera, whose own `=`/`-` zoom in `engine/camera.js` is dead code),
   so a player zooming with them steps x1 → x2 → x4 ... and every radar spins that much faster. Fix: give zoom and
   rate distinct keys (e.g. `=`/`-` zoom, `[`/`]` or `,`/`.` rate) in `time.js`, `camera.js` and the KEYBINDS help
   (`data/settings.js`); the controls agent owns those files. At x16/x32 fast antennas also strobe (a few frames per
   turn), which reads as erratic speed; the scope already switches to its "fast" rendering there.

2. ~~**Selecting units feels buggy; double-click should focus.**~~ *Fixed 2026-09-25.* Double-click spectates a unit
   or round (camera.spectate: flies in, follows tightly; left / right drag orbits, wheel zooms, Esc or a click on empty
   ground leaves; the unit stays selected for orders); Ctrl+double-click selects all of the type; Inspect no longer
   opens on a double-click (Alt+click / I). Box select counts units by centre or a third of their drawn box, drags
   under 8 px are clicks, a lost release drops the box; with no unit in the box it selects the rounds in flight
   (C cinematic / B bullet time on them). `game/src/game/select.js`, `game/src/engine/camera.js`.

3. ~~**Scale feels wrong.**~~ *Audited 2026-09-25.* Models are drawn at true size: no minimum on-screen size or
   enlargement anywhere in the engine (`models.js` draws every part at its real transform; a model under 0.7 px
   radius is one 1-px dot, `speck`; dot size is 1-3 px from the sample spacing, never scaled with distance), nor in
   `render.js`. Checked in stills: a DDG is ~38 px long at 6 km and ~10 px at 20 km (155 m at 40° FOV). What read
   as "too big" was the FX: the head marker of a round far off (`fx/lib/plume.js drawHead`) was a lime disc up to
   56 px, several times the round; it is now a 3-26 px marker (a few px at play range). Far units stay findable by
   that marker, the HUD tags and the Orbital glyphs (2D, not the model). Speeds follow `research/info` (below), and
   the time rate now shows on screen even with the UI hidden (top right, `render.js`). Still open: the HUD's tags and
   brackets (not audited here) may add to the feel.

4. ~~**Missile motion is not realistic, SM-6 launches especially.**~~ *Fixed 2026-09-25.* Every round's speed is
   now a closed-form thrust curve in its age (`sim/weapons.js speedAt`, PROJ `ign boost vb sepAt sus cd vMin`):
   hot launch at full thrust (SM-6 out of the cell at 40 m/s, ~12 g rising to ~20 g), the Mk 72 to 960 m/s at 6 s,
   separation, the Mk 104 lit at 6.4 s to Mach 3.5 (1190 m/s) by 9.5 s, held to 18 s, then a drag coast (v =
   v1 / (1 + cd v1 t)): 57E6 1300 -> 780 m/s over 18 km as sourced, ESSM Mach 3.8, 48N6 1700, AIM-120 pulls ahead
   of the jet in 1-2 s. Vertical rounds rise straight for P.vert, then the pitch-over eases in over P.po at P.poRate
   (SM-6: 2.3 s, a gentle arc over ~6 s to a ~5 km loft; ESSM snaps over after 0.6 s; Tomahawk rises 3 s, tips
   hard to a dive, booster off and wings out at 10 s, then the near-invisible turbofan; SLAM-ER falls 1 s off the
   pylon, wings snapping out, before its turbojet lights; RAM leaves its trained Mk 49 box near level; 48N6 and
   Kalibr are thrown out cold and light 0.5 / 0.15 s up). Flight time to max range is within a few seconds of the
   old model (balance).

5. ~~**SM-6 modules and flame are wrong after the booster phase.**~~ *Fixed 2026-09-25.* The FX phases follow the
   sim's motor timings (`fx/index.js profile`, `motorOf`): Mk 72 flame and thick column to 6 s, the casing drops
   (`booster_sep`, tumbling `mk72` model), a beat of nothing, then the Mk 104's own smaller flame at the sustainer
   nozzle (`PLUME.mk104`, 1.7 m behind the origin: the old sustain plume sat where the booster had been, which is
   what read as "the booster flame stays") and a thinner trail, then the coast with only the head marker. Checked
   in stills at 5.5 / 6.25 / 6.7 s.

   Also 2026-09-25 (same pass): **gun tracers** are drawn from the sim's own rounds (`fx/lib/guns.js GunStream`
   over `sim.bursts`; the sim records per round whether and where it struck, `B.hk / ef / te`), with the real rounds
   between two representative ones strung in as a rope, so the rounds seen to reach the target are the ones that
   kill it; the mount walks its fire in from slightly low over the first 0.2 s (`w.walk`); misses fly on into the
   sea, the 30 mm's burst at tracer burnout (sparkle). **Break-ups vary with the hit** (`game/debris.js`): struck
   near the nose it snaps (the nose cartwheels off, the long rear flies on and noses over, burning); at the tail the
   motor section tumbles away burning; a fin / tail hit often first sends the round rolling and corkscrewing off its
   line for 0.6-1.4 s, shedding, before it comes apart; a burst close by blows it apart; a crossing blow throws the
   pieces sideways, a head-on one strings them along the path. Seeded per event (deterministic).

6. ~~**Dark circle under selected aircraft.**~~ *Fixed 2026-09-25.* The renderer's subject list (the world-dimming
   pool, `engine/renderer.js` `_subjects`) skips anything whose centre is more than ~1.2 radii above the ground or sea
   (aircraft, helos, rounds, jets on a deck; `d.noDim` opts out), so no pool or screen backdrop follows a jet.

7. ~~**TEL reloading is "telepathic".**~~ *Fixed 2026-09-25.* The transloader now drives (rounding the TEL if it
   comes from ahead) to a point 80 m, then 40 m, behind its spot, creeps the last stretch on its own turning circle
   and parks at `TZM.TEL_AT` from the TEL (same heading, TEL's left side; the right if the ground there is bad) to
   ~0.2 m / 2° (`sim/orders.js` parkBy); it then lowers its stabilisers (4 s, `u.dep`), the TEL lowers its launcher,
   and each round is a full crane cycle (`TRANSLOADER.reloadPose`, now fed the TEL's true relative pose `st.telRel`
   and turning the TLC to the TEL's yaw); the round becomes the TEL's only when the crane sets it on the tube (.64 of
   the cycle), and a reload ends only between cycles (`sim/mech.js` reloadStep). Depot refills also set the
   stabilisers first and only while the transloader has no errand. The S-400 (units3) restocks at a depot like the
   Pantsir: no vehicle is involved, nothing to fix there.

## Reported by agents at the end of the build

- **Balance** was re-tuned after the switch to collision-based hits: every map 42-58% coast wins over 24 seeds,
  defences stop ~43% of Oniks (target ~45%). Kh-35 (58%) and Kalibr (64%) are still stopped a bit more than
  intended. Per-map numbers carry about ±10 points of seed noise. Tool: `game/balance.html`.
- **Big battles at x32 are CPU-heavy**: a 200-unit battle runs 30-70 ms per frame (smoke trails, debris, the sim
  and its event handlers). Normal play is 2-6 ms. Tools: `ONIKS.perf()`, `game/perf.html`, `game.profile = true`.
- **Tests:** the 200-unit perf test fails whenever the machine is loaded (re-run on a quiet machine); the two new
  hit-physics tests (interceptor turn limit, tumbling axis) were failing and may have been re-thresholded by the
  balance pass. `game/tests.html`.
- **Four cloud branches are pushed but NOT merged** into `game-v1`: `cloud/simperf` (Node harness `tools/sim.mjs`
  + sim speed-ups with a determinism proof), `cloud/units3` (Ticonderoga, LCS, S-400 + 92N6E, A-222 Bereg),
  `cloud/audit` (bug fixes), `cloud/validate` (`tools/validate.mjs` data cross-checks). They branch from an older
  `game-v1` (8960317), so expect conflicts in `units.js`, `models.js`, `anatomy.js`, `sensors.js`, `weapons.js`.
  Merge one at a time, re-run tests and look at the game after each.
- The hit replay (J) does not re-show debris; the Orbital style's clip plane doesn't cut the rear section of a
  broken missile.
- On a cold first open the Combat screen could list only six maps (fixed in the fallback list; watch for it).
- Saves made with older code are refused on Continue (by design: the sim changed).
- Campaign missions override some HP values (M5, M6); re-check campaign difficulty after the balance changes.
- Two untracked files, `game/src/data/models_u3kit.js` and `units_u3.js`, are partial work from a local agent that
  was stopped (the same four units were then built on `cloud/units3`). Not imported anywhere; delete or ignore them
  when merging `cloud/units3`.

## From the user's second play-test (2026-09-25, evening)

- Radar spin-up bug still happens right after loading into sandbox (maybe other modes).
- DDG radar: SPY-1D is four fixed faces, it must not show a rotating sweep; recheck all ship radars and rates.
- Selection/tracking brackets on the F/A-18 (maybe others) broken again.
- Pantsir rarely kills missiles: check blast/proximity physics; interceptors miss a lot (SM-6, ESSM 1/12).
- F/A-18 launches at odd angles right after take-off; should ingress fast/low, launch inside a sensible envelope.
- Scale still feels wrong (ships/missiles look huge; a 64 km leg doesn't read as 64 km): prove with measured stills.
- Bullet-time slowdown near an intercept starts too late and stutters; cinematic / terminal camera needs a redesign
  (missile in view along its line of sight; pull back when it's being engaged so the interceptors are seen).
- Ship wake outline stays long after the ship stops; dark "displacement" discs under ships (and near the F/A-18).
- **To plan: damage system rework** — how vehicles and their modules look after hits, by what hit them.
- Requests: "Launch missiles" at a map point from any selected unit that carries them; time rates below x1 ([: 0.5, 0.2).
