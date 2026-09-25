# Review 2

Reviewer 2 · 2026-09-25 · branch `game-v1` (the units-expansion commit `0274df0` landed during the session). Played at
1920×1080 in a hidden Browser pane on http://127.0.0.1:8771. Stills were taken with `hudShot` and are in
`game/shots/review2/` (gitignored, ~300 files; the names below refer to them).

What I played:
- The reference films first: Anatomy, Anatomy · Ship, Engagement, Aegis, Scale, and the p1 Strike menu.
- The menu, the campaign screen and the M1 cutscene.
- **Sandbox** on Krasnaya Kosa (palette, fog, V radar view, X scan, attack, C cinematic camera, J, N storm, I Inspect with
  E and X, Shift+I museum, zoom from 60 m to 150 km, `benchSync`), on Ust-Solyonaya as Fleet (placed a Kilo, K woke the
  AI, the sub fight, the F9 film maker, the pause menu and its settings), and on Chyortova Past in the Orbital render
  style.
- **Combat**:
  - as Coast on Dolgaya Guba, played to Defeat;
  - as Fleet on Belye Shkhery (L launched the strike package, U the helo, a DDG strike on the command post);
  - as Fleet on Proliv Uzky (60 game-min idle);
  - as Fleet on Chyortova Past (hard, Defeat).
- **Campaign**: M4 played to Victory, grade S. M1 through its scan beat. M2, M3, M5 and M6 run with no input to see
  whether they fight back.

## Score: 7.5 / 10

It passes. The big change since review 1 (6.5) is that the moments the user named are now in the game, not just in
Inspect:
- **The scan.** The lime bolt forks to every hull. Fitted part boxes pop onto the ships, labels decode out of glyph noise,
  and a magnified EO inset shows the cutaway with real placards.
- **The hit replay.** A decisive hit drops to x0.25 on screen ("X0.25 · SLOW MOTION"), and the X-ray front crosses the
  impact. The damaged parts turn coral with true names: "04 DECKHOUSE · AN/SPY-1D(V) ×4 · OUT", "09 LM2500 ×4 ·
  REDUCTION GEARS ×2 · DMG 58 %".
- **The Orbital layer.** Pulling out past ~60 km dissolves the dots into the Orbital films' hairline map.

The review-1 breakages are fixed:
- The player fires first ("WEAPONS HELD · FIRES ON YOUR ORDER").
- The carrier launches its air wing.
- Out-of-reach scans are refused ("OUT OF REACH · 101 / 60 KM").
- M1's first contact comes at T+01:05 instead of ~T+42.
- M2, M3, M5 and M6 punish a passive player with grade D.

Mission 4 is now the best 10 minutes in the game. You get a scan, then "SIX IN THE AIR · ONE SALVO". A cinematic chase
follows an Oniks skimming toward three Burkes under the strait bridge, SM-6 intercepts it, and the Anatomy replay plays
on the hit. Then comes the crane reload, a second salvo, and grade S. Performance is still 3–4 ms a frame.

What keeps it below 8–9 is uneven play:
- **Combat outside the scripted missions is thin.** The Coast AI sat through 60 game-minutes against an idle fleet. An
  attack order fires one round per ship and ends. My Coast match was lost with 0 kills.
- **The visuals fail in a few places.** Big hulls saturate into flat white slabs up close. Haze empties the near sea.
  The sea from 5–20 km reads as a star field. A storm reads as TV static, and natural lightning is a small squiggle.
- **Fresh bugs:** units stacked on one spot at the fjord spawn, a right-click on a contact answering "NO ROUTE", and
  console errors from the replay.

## Rubric scores

| # | Line | R1 | R2 | Why |
|---|---|---|---|---|
| 1 | Looks like the films | 7 | **8** | Hit replay, the M4 salvo, the scan inset and the Orbital map are film-grade, and the ground now dims around units. The weak spots: the carrier deck at 420 m is a solid white slab (`de_carrier`), haze leaves the near sea black (`de_sub_7`), the sea from 5–20 km reads as stars (`kk_scan_b3`, `m4_end_c`), and the storm is speckle (`kk_storm_3`). |
| 2 | Real RTS | 5 | **6.5** | Player-first fire, the air wing (L, U), TLV reloads, supply and B reinforcements (Radar, Pantsir, Bal and Kilo arrived) all work. But the Coast AI does not press a passive fleet (Proliv Uzky: 8 launches in 60 min, no result), an attack order is one round per ship, you cannot target a contact cloud, and the fjord spawn stacks units. |
| 3 | 360° camera | 8 | **8.5** | 20 m to 150 km, flowing into the Orbital map, plus the F9 film-maker takes (the "Climb · sea to 60 km" take works). One weak band: 36–60 km is nearly empty, with the dots gone and the hairlines not yet in (`kk_z45km`). |
| 4 | Favourite effects as gameplay | 7 | **8.5** | Chain-lightning scan, part boxes, decoding labels, the EO inset, the hit replay, reloads, the radar view (V) and SM-6/57E6 intercepts. Natural storm lightning is a tiny lime squiggle at 20 km with no lit cloud (`kk_bolt_a`). |
| 5 | Anatomy / Inspect | 8.5 | **9** | New units come with real part lists: Bal ("CONTAINERS ×8 · KH-35U 6.3 M", "YAMZ-846 · V12 DIESEL 500 HP") and Kilo ("PROPELLER · 7 BLADES · SKEWED Ø 3.1 M"). The museum has 37 entries, and the hit replay carries Anatomy into combat. One oddity: the X-ray slice tag reads "CARRIER" on a Pantsir and on the Kilo. |
| 6 | Unique maps, three modes | 6.5 | **7.5** | The campaign now fights back. First beats: M1 contact T+01:05, M2 T+06:03, M3 raid T+03:53. With no input, M2, M3, M5 and M6 end in D. M4 won S by play. Combat works for both sides. Minus the fjord spawn stack and the Proliv Uzky stalemate. |
| 7 | Realism | 7 | **7.5** | Real speeds (an Orlan at 30 m/s takes 42 min to fly 75 km), the time rate is always shown (including x0.25), and "Weapons HELD" is now true. Minus the "CARRIER" slice tag and the menu line calling the enemy "the red force" (it is coral). |
| 8 | Performance | 9 | **9** | See the table below. The replay system logged 3 console errors; everything else was clean. |
| 9 | Polish | 5.5 | **6.5** | Loading steps, fades, F1 help, pause-menu settings and a clean end screen. Still wrong: world tags draw over the log and objectives, and over the Defeat block (`fj_end_b`); R with nothing to reload is silent; the menu has a subtext line. |

**Benchmarks** (`ONIKS.benchSync`, 1920×1080):

| Scene | avg ms | p95 ms |
|---|---|---|
| Krasnaya Kosa at 2.5 km | 3.1 | 3.7 |
| TEL at 60 m | 3.5 | 3.9 |
| 30 km | 3.0 | – |
| Orbital at 120 km | 2.8 | – |
| Fleet fight, 19 units, 10 rounds, 6 km | 3.4 | 4.4 |
| Carrier at 400 m | 4.0 | 4.4 |
| Orbital render style at 25 km | 3.4 | 6.3 |

## The 5 best things

1. **The hit replay** (`src/game/replay.js`). Two examples:
   - M4 (`m4_rep_03`, `m4_rep_08`): a Burke at x0.25, the flash, the lime X-ray front, "04 DECKHOUSE · AN/SPY-1D(V) ×4 ·
     OUT" and "09 LM2500 ×4 · REDUCTION GEARS ×2 · DMG 58 %" in coral, bracket boxes, the hull tinted coral.
   - Chyortova Past (`ca_fleet_late`): "CVN · Nimitz class · HP 0 / 300 · SINKING" with the flight deck gone coral.

   This is the Anatomy film happening to your enemy. The user will love it.
2. **The scan payoff** (`src/ui/sensors/chain.js`, `inset.js`, `decode.js`). The bolt forks to both Burkes, and the tags
   decode from "ARLEI/C :/- /" to "DDG · ARLEIGH BURKE 0.97". The inset "SCAN 01 · TRK 24 · ×13 · 17.8 KM" turns the
   cutaway with "01 BOW · AN/SQS-53C SONAR DOME", "03 MK 41 VLS · FORWARD · 32 CELLS" and "09 LM2500 ×4 · 100 000 SHP"
   (`kk_scan_b3`, `m1_scan_c`). The user's named feature, done right.
3. **Mission 4, Engagement** (`m4_cine_02`, `m4_cine_22`): six plumes climbing, "SIX IN THE AIR · ONE SALVO", then the
   camera low behind a sea-skimming Oniks with two coral-tagged Burkes under the cable-stayed bridge. The reload is a
   crane swinging a TLC onto the TEL (`m4_crane2_4`), then a second salvo and Victory S.
4. **The Orbital strategic layer** (`src/game/orbital.js`; `ar_scan_far`). The archipelago becomes white contour
   hairlines, place names (Ostrov Bolshoy, Guba Tikhaya, Keret), range rings and the refusal "OUT OF REACH · 101 / 60
   KM". It is the Orbital films as the strategic map.
5. **Inspect keeps growing and stays fast.** Bal and Kilo have X-ray and true placards (`insp_bal`, `insp_kilo`), the
   DDG explodes into labelled assemblies in the museum, and all of this runs at 3–4 ms a frame.

## The 10 highest-impact fixes (ranked)

1. **Make Combat produce the M4 moment by itself.**
   - Seen:
     - Combat as Fleet on Proliv Uzky, idle: 60 game-minutes, 8 Coast launches in total, no result.
     - Combat as Fleet on Belye Shkhery: the DDG attack order on the command post fired one TLAM per ship, all three
       were shot down ("DOWN · TLAM · 57E6"), and the order ended. The track then decayed to "? 0.45" and could not be
       re-attacked.
     - Combat as Coast on Dolgaya Guba: the radar classified the DDGs to 0.97 between T+05 and T+13 with nothing
       telling me they were engageable. The fleet's first TLAM wave then killed the radar, two Pantsirs and two TELs.
       I lost with 0 kills.
   - What to do:
     - The Coast AI should mass salvos when it holds a firm track.
     - An attack order should keep engaging until the target is dead or the magazine is empty.
     - Add a salvo size on the command card (1 / 2 / all).
     - When a track first becomes engageable, slow to x1 and raise an alert: "TRK 25 · DDG 0.90 · IN REACH OF 4 TEL".
   - Where: `src/sim/ai.js` (Coast offence), `src/sim/orders.js` (attack completion), `src/game/orders.js` and
     `src/ui/hud/commands.js` (salvo size), `src/game/game.js` autoSlow and `src/ui/hud/alerts.js` (the engageable
     alert). Re-run `balance.html`.
   - Effort M–L. Parallel: yes (AI and balance in one agent; alert and UI in another).
2. **Make the storm a film and lightning a spectacle.**
   - Seen: with N set to Storm on Krasnaya Kosa, the frame is uniform white speckle that reads as TV static
     (`kk_storm_3`). A natural strike seen from 20 km is a small lime squiggle with no cloud lit up (`kk_bolt_a`), and
     it is lime while the night log says white.
   - What to do: a cloud ceiling of dots over each squall, lit from inside on every flash (the oh_storm film); white
     branching bolts to sea and land that are big enough to read at 20–40 km; a full-frame lift; rain as slanted
     streaks, not speckle.
   - Where: `src/ui/sensors/weather.js` (PAL.glow is LIME), `src/fx/lib/weather.js`, the rain in
     `src/engine/terrain.js`.
   - Effort M. Parallel: yes. The user asked for lightning by name.
3. **Stop close-range dot saturation on big hulls.**
   - Seen: at 420 m the Nimitz flight deck is a solid white polygon and the hull side a grey gradient (`de_carrier`);
     the F/A-18 in the cinematic chase is close to a solid fill (`ar_cine_6`). The films keep visible dot structure on
     hulls at any framing.
   - What to do: cap the dot density per projected screen area (sample spacing in pixels, not metres) and dim
     large flat faces the way the films do.
   - Where: `src/engine/models.js` (level choice and sampling), `src/engine/renderer.js`.
   - Effort M. Parallel: yes (a world-look agent, judging stills against `pe_aegis` and `pc_anatomy_ship`).
4. **Let the player target contact clouds.**
   - Seen: in Combat on Dolgaya Guba at T+22, with 2 TELs selected, I right-clicked the "TRK 25 ? 0.48" cloud. It
     became a move order to the sea and answered "NO ROUTE" (`fj_attack_click`).
   - What to do: `pickUnit` should hit the drawn contact cloud at its estimated position, so the right-click reaches
     `attack()` and its "NOT TRACKED · SCAN IT (X)" message. Better still, also show which scanner would reach it.
   - Where: `src/game/select.js` (pickUnit), `src/game/orders.js:88-120`.
   - Effort S. Parallel: yes.
5. **The fjord spawn stacks units.**
   - Seen: in `play.html?mode=combat&map=fjord&side=coast`, TELs 3, 4, 5 and 6 all spawn at (-43000, 3, -28000), on a
     2.5 m shoreline, and Pantsirs 8 and 9 share (-43750, 32, -26250) (`fj_tels_stacked`). When all 60 tries fail,
     `findSpot` falls back to `nav.nearestOpen` of the spawn cell, which is the same cell for every unit, and nothing
     checks for occupancy.
   - What to do: search outward with a minimum spacing (e.g. 60 m for vehicles), and on the fjord move the Coast
     spawn onto the plateau.
   - Where: `src/sim/economy.js:81-94`, `src/game/setup.js:109-133`, `src/world/gens/fjord.js` (spawn).
   - Effort S. Parallel: yes.
6. **Hit replay throws when its unit is gone.**
   - Seen: sandbox on Ust-Solyonaya after the Kilo/Kalibr fight, the console logged "system replay update: Cannot read
     properties of null (reading 'after')" and "system replay draw2d: … reading 'type'".
   - The cause: `strike()` calls `invFromRec(subj, V.rec)` when `V.u` is gone and `V.rec` is null (live or after
     mode), and the title code reads `V.rec.type`.
   - What to do: keep the unit's type and parts when the replay starts, and fall back to them.
   - Where: `src/game/replay.js:329`, `:718`, `:723`.
   - Effort S. Parallel: yes.
7. **The cinematic camera still ends up on empty frames.**
   - Seen:
     - Sandbox, C after a 2-TEL salvo: the frames are empty sea and stars between the launch and the hit (`kk_cine_*`).
     - M4 after the second kill: the view was an empty speckle field for the whole wait before Victory (`m4_end_c`).
     - The fjord Defeat block: behind it, a lone Orlan and a far horizon (`fj_end_b`).
   - What to do: hold the last subject (the sinking hull, the smoke column) until the result screen, and frame both the
     round and its target during mid-course.
   - Where: `src/game/director.js`, `src/game/match.js` (showEnd).
   - Effort M. Parallel: yes.
8. **The sea at mid altitude and in haze.**
   - Seen: from 5 to 20 km the sea is uniform speckle, indistinguishable from the star field, so scan frames look
     like space (`kk_scan_b3`, `m1_scan_c`). In haze the near sea goes black while a far band stays bright
     (`de_carrier`, `de_sub_7`). The 36–60 km dissolve band is nearly empty (`kk_z45km`).
   - What to do: keep the Engagement film's swell rows readable at 5–20 km, fade haze with distance and not near the
     camera, and bring the hairline contours in earlier (or keep the coastline dots longer) so the band is never empty.
   - Where: `src/engine/terrain.js` (sea density, haze), `src/game/orbital.js` (`from: 36000, to: 60000`).
   - Effort S–M. Parallel: yes (with fix 3).
9. **World tags over HUD panels.**
   - Seen: "TRK 22 · DDG" drawn over the engagement log and "TRK 23" over "THE NARROWS" (`m4_crane2_4`); "138
     MONOLITH-B · RADIATING" drawn over the Defeat screen (`fj_end_b`). The veil covers only the left 72 %.
   - What to do: clamp world tags to a safe rect that excludes the HUD panels, and during the end screen fade all world
     tags, not just those on the left.
   - Where: `src/engine/overlay.js`, `src/ui/sensors/tags.js`, `src/game/match.js` draw2d.
   - Effort S. Parallel: yes.
10. **Small truth and taste fixes.**
    - The X-ray slice tag names the subject's frame "CARRIER": "PANTSIR-S1 · CARRIER Z -4.77 M" in the replay and
      "KILO CLASS · CARRIER Z +29.0 M" in Inspect. With a real aircraft carrier in the game this reads wrong; use
      HULL or CHASSIS. Where: `src/ui/inspect/overlay.js` and `src/data/anatomy.js`.
    - The menu has a subtext line: "Free war sandbox. Everything unlocked; the red force stays passive until you wake
      it." Drop it, or cut it to two words. Where: `src/ui/shell/screens/menu.js`.
    - R with TELs selected and the transloaders empty is silent. Say "TLV EMPTY · REFILL AT DEPOT".
    - Effort S. Parallel: yes.

Worth the tokens:
- **Do now:** fixes 4, 5, 6, 9 and 10. They are small and fix real breakage.
- **Where the score moves:** fixes 1 and 2. Fix 1 decides whether Combat is a game; fix 2 is the user's own word
  "lightning".
- **Taste passes:** fixes 3 and 8. Each needs stills after every step, measured against the films.

## Everything broken

1. **Replay console errors.**
   - Repro: open `play.html?mode=sandbox&map=delta&side=fleet`, P, press 9 (Kilo), click near the carrier, K, x8 for
     about 2 game-minutes.
   - Result: the console logs "system replay update … reading 'after'" and "draw2d … reading 'type'" (`replay.js:329`,
     `:718`).
2. **Fjord Coast spawn stacked.**
   - Repro: open `play.html?mode=combat&map=fjord&side=coast&ai=normal&win=hq&fog=1`.
   - Result: four TELs on one spot and two Pantsirs on one spot.
3. **"NO ROUTE" on a contact.**
   - Repro: in the same match, select the TELs and right-click an unclassified "?" cloud at sea.
   - Result: a move order and "NO ROUTE" instead of the tracking message.
4. **Combat stalemate.**
   - Repro: open `play.html?mode=combat&map=strait&side=fleet&ai=normal&win=hq&fog=1` and do nothing for 60 game-min.
   - Result: no result. The Coast fired 8 rounds, reinforced from 15 to 24 units, and never pressed. By contrast,
     `map=caldera&ai=hard` sank the idle carrier at T+31.
5. **The fleet attack order ends after one round.**
   - Repro: Combat as Fleet on Belye Shkhery, launch the strike package (L) to find the command post, then select the
     3 DDGs and right-click it.
   - Result: each DDG fires 1 TLAM ("strike 7 → 6"), and all are intercepted. The orders clear and the track decays, so
     there is no follow-up.
6. **Storm lightning is lime.** With N set to Storm, the natural bolt draws lime-tinted (`kk_bolt_a`), but the design
   and the night log say white.
7. **The "CARRIER" slice label on non-carriers.** Inspect a Kilo or a Pantsir: see fix 10.
8. **Silent R.** In M4 after the salvo, select the TELs while both TLVs are empty and press R: nothing, and no message.
9. **Tags on top of the Defeat screen.** Lose a Combat match with a radar alive: its tag draws over the block.
10. **Resolved during the session, not scored.**
    - J was still "Command · switch side" in the Krasnaya Kosa sandbox palette (the log showed "CMD · COMMAND ·
      COAST" when I pressed J for a replay). A later load shows it on M, and J replays.
    - The hidden pane throttles `requestAnimationFrame`, so the campaign cutscene film crawled (T-01:04.8 → T-01:04.4 in
      8 s). This affects captures only.

## 3 bold ideas

1. **The salvo board** (the Salvo and Ring films). When 2 or more heavy rounds are in the air, a thin strip opens along
   the bottom:
   - one lane per round, each with time-to-go and "Mach 2.2";
   - interceptor ticks rising against the lanes, and each lane ending in "HIT" or "DOWN";
   - the hit replay taking over at the first impact.

   It turns every salvo into the Salvo film, makes the one-salvo-of-six decision legible, and costs little (the
   projectiles and events already exist).
2. **Storm fronts as the rhythm of Combat.** Every 8–12 game-minutes a squall line crosses the map, drawn like oh_storm:
   a dot cloud ceiling lit from inside, white forks to the sea.
   - Inside it: radar clutter hides your TELs, but a player scan fired into a storm chains through the cloud to every
     hull within 10 km.
   - Natural strikes briefly reveal both sides (the mechanic exists).

   Lightning becomes the game's clock and its best gamble, the way M6 already uses it.
3. **The debrief is a film.** At the end of a match the film maker assembles the match's own takes (`game.film`, the
   replay records) into one continuous 30–40 s take, with no cuts:
   - the opening salvo from the side;
   - the chase;
   - each hit replay's X-ray moment;
   - a climb out into the Orbital map showing the tracks of every round fired, with the "Fig." captions and the time
     rate on screen.

   The campaign already opens with the films; ending each battle with your own film closes the loop. F8 or Shift+F8
   saves it.
