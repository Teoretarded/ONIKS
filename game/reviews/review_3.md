# Review 3

Reviewer 3 · 2026-09-25 · branch `game-v1` at `3997a5e` (Look 2), with uncommitted sound, effects and debrief work in the
tree. I played at 1920×1080 in a hidden Browser pane on http://127.0.0.1:8771. Stills are in `game/shots/review3/`
(gitignored); the names below refer to them.

What I played:
- The reference films first (`ref_anatship_*`, `ref_eng_*`), then the menu, Settings, the campaign screen, the M6 cutscene
  and briefing, F1 help and the pause menu.
- **Combat**, four matches played to a result:
  - Coast on Krasnaya Kosa: Victory, grade B, at T+57:50. I sank two DDGs and the carrier, and the Debrief film played.
  - Fleet on Proliv Uzky: Defeat, grade D, at T+1:37:22.
  - Coast on Chyortova Past, with a squall line crossing: Defeat, grade D, at T+37:23. The carrier was left at 60 / 300.
  - Fleet on Ust-Solyonaya: 12 min idle, to see how hard the AI presses.
- **Sandbox** on Krasnaya Kosa:
  - zoom from 20 m to 150 km, I / E / X, the Shift+I museum (Kilo, E-2D, Virginia);
  - a Kilo placed and dived, with sonar; K to wake the AI;
  - N to Storm and a scan into a cell; V radar view;
  - F9 with a built-in take, and the Orbital style on Belye Shkhery.
- **Campaign**: M3 lost D and then won A, M5 won S and M6 won S, all played; M2 was left passive to check that it
  fights back.
- `benchSync` in busy moments. `read_console_messages` on every page showed no errors or warnings.

## Score: 8.0 / 10 (R1 6.5 · R2 7.5)

It passes clearly now, and for the first time Combat is a game. On Krasnaya Kosa:
- I launched the Orlan and lost it and a TEL to the first TLAM wave.
- The radar and a scan gave me "IN REACH · TRK 33 · DDG 0.86 · 3 TEL".
- A persistent attack with Salvo 2 put six 3M55s in the air, sank the DDG and played the Anatomy replay.
- I reloaded with the crane, bought a radar, a Bal and more TELs, and killed the second DDG.
- The carrier sat outside scan reach, so I drove the radar forward, scanned it and fired a Salvo ALL.
- Victory at T+57:50.

The AI pressed the whole time. An idle Fleet on Ust-Solyonaya loses a DDG by T+03, and my Fleet and caldera matches
ended in losses.

The other three big review-2 asks landed too:
- **Storms are film-grade.** Dot thunderstorm towers lit from inside, white strokes, rain shafts (`ca_storm_0`,
  `sb_storm_8`), and a scan into a cell reaches ×1.5 ("STRIKE 6.0 KM", `sb_stormscan_2`).
- **The hull slabs are gone.** The carrier at 420 m and the DDG at 200 m hold dot structure (`st_carrier_420`,
  `st_ddg_200`), and the 36–60 km band now has hairline coastlines (`sb_z_42000`).
- **The Debrief film is new and already beautiful.** A deterministic re-simulation (29 hashes checked) plays Fig. 1 First
  salvo, Fig. 2 Chase "M2.2 · ×16", Fig. 3 the hit with decoding placards and Fig. 4 the Orbital map, "Every round · 329
  fired" (`deb_2`, `deb_8`, `deb_16`, `deb_24`).

Every review-2 breakage I rechecked is fixed:
- the slice tag now reads HULL / CHASSIS;
- the menu has no subtext;
- tags fade on the end block;
- R gives feedback;
- no replay errors.

What keeps it from 9:
- **The busiest moments bury the picture.** The salvo board grows to four stacked blocks across the middle of a cinematic
  frame (`kk_cine_3`).
- **First impressions are weak.** Every Combat opening is a 30 px unit on flat speckle (`kk_c_open`, `ca_open`,
  `de_f_open`), and the open sea at 0.3–9 km is still random speckle next to the Engagement film's rows.
- **The Debrief film misses the kill that won the match.**
- **The campaign finale is a walkover.** M6 won S with zero losses.
- **The Fleet side has almost no way to find the land.**

## Rubric scores

| # | Line | R1 | R2 | R3 | Why (R3) |
|---|---|---|---|---|---|
| 1 | Looks like the films | 7 | 8 | **8.5** | Storms, the Debrief, Look 2 hulls and the 36–60 km hairlines are up to the films. Still off: the open sea at 0.3–9 km is random speckle (`kk_sea_minimapjump`, `kk_c_ddg_9km`, `de_f_open` vs `ref_eng_70`); X-ray interiors saturate into white blocks (the LM2500 boxes in `kk_hit_4`, the E-2D wings in `museum_e2d`); the salvo board covers the frame. |
| 2 | Real RTS | 5 | 6.5 | **7.5** | Persistent volleys, Salvo 1 / 2 / ALL, IN REACH alerts, reinforcements, the reload loop and a pressing AI. Minus: the Fleet can't classify the land (the HQ was never above 0.51 in 1 h 37 min on Proliv Uzky); the carrier sits at 86–89 km, beyond the 85 km scan reach but inside the 110 km TEL reach; M6 is too easy. |
| 3 | 360° camera | 8 | 8.5 | **9** | A continuous zoom from 90 km to 150 m averaged 2.3 ms with a worst frame of 8.6 ms, and the dissolve band is filled. Minus: a camera jump (minimap, alert fly-to) stalls 110–200 ms. |
| 4 | Favourite effects as gameplay | 7 | 8.5 | **9** | Chain lightning ("CHAIN · 4 · SWEEP", `ca_scan_4`), the M3 bolt (`m3_scan_3`), the EO inset, replays on DDGs, the carrier and even a transloader, crane reloads, storms and the Debrief. |
| 5 | Anatomy / Inspect | 8.5 | 9 | **9** | TEL X-ray with both 3M55s in their TLCs (`insp_tel_4`), a clean exploded view (`insp_tel_e3`), and museum entries for the Kilo, E-2D and Virginia with true placards. The E-2D wing saturates. |
| 6 | Unique maps, three modes | 6.5 | 7.5 | **8** | Squall lines cross Combat, and Combat has a Debrief. M2 punishes a passive player (D at T+16:55). M3 teaches radar discipline (D without it, A with it). M5 won S. M6 won S with no losses. |
| 7 | Realism | 7 | 7.5 | **8** | True part names, ×0.25 on screen, M2.2 and T-0:48 on the lanes, sizes. Minus: the salvo board says "SUNK" for land units; the Kilo panel says "KLUB 4/4" where its tag says "4 KALIBR"; the M6 cutscene caption reads "Krasnaya Kosa" on a Chyortova Past mission. |
| 8 | Performance | 9 | 9 | **9** | See the table below. No console errors anywhere. The only blemish is the camera-jump stall. |
| 9 | Polish | 5.5 | 6.5 | **7** | Settings, pause, the end rows (Continue / Debrief / Watch / Replay) and the briefing are all clean. Minus: the salvo board clutter; the film-maker panel and F1 help have no backing (`fm_panel`, `help`); tags at the top edge (`m6_open`); lightning log spam; objectives unticked on a Combat Victory. |

**Benchmarks** (`ONIKS.benchSync(120)`, 1920×1080, steady state):

| Scene | avg ms | p95 ms |
|---|---|---|
| TEL at 20 m | 3.4 | 4.2 |
| 1.2 km | 2.0 | 2.7 |
| 15 km | 1.9 | 2.2 |
| 60 km (Orbital) | 1.9 | 2.2 |
| Continuous zoom 90 km → 150 m on the carrier (180 frames) | 2.3 | 3.3 (worst frame 8.6) |
| Sandbox raid: 40 rounds in the air, 18 units, 7 km | 4.8 | 6.3 |
| Orbital render style, archipelago at 30 km | 2.2 | 4.3 |
| The first 30 frames after `cam.set` jumps far → near | 14–26 | 110–196 |

## The 5 best things

1. **Storm fronts** (`src/sim/weather.js`, `src/ui/sensors/weather.js`). On the caldera a squall line of seven cells
   crossed the lagoon at 24 m/s. The dot towers, anvils and inner flashes read exactly like `oh_storm` (`ca_storm_0`,
   `ca_storm_3`). A scan fired into a cell grows to "STRIKE 6.0 KM". This is lightning as a feature.
2. **The Debrief film** (`src/game/debrief*`, `record.js`). You press D on the end screen and your own match plays back as
   a film. The captions, the ×16 warp between moments and the climb into the Orbital map with every round's track are
   the films' language, built from your game (`deb_8`, `deb_24`).
3. **Combat plays like an RTS now.** The scan's EO inset reads "SCAN 01 · TRK 41 · DDG · ×16" with five true placards
   (`kk_scanpay_1`). Then come "IN REACH · TRK 41 · DDG 0.99 · 2 TEL · 1 BAL", Salvo ALL and "SALVO 03 · 4 × 3M55 · 4 ×
   KH-35U · TRK 44 · CVN". Reloads show "RELD · TEL 04 · 1/2". Losses hurt and reinforcements matter.
4. **Scan and hit replay remain the showpiece.** The M3 bolt comes down on the picket (`m3_scan_3`). The carrier replay
   decodes "06 FLIGHT DECK · 9° ANGLED · DMG 21 %" and "07 HULL · CVN NIMITZ · DMG 59 %" (`ca_hit_9`). The DDG replay
   has "04 DECKHOUSE · AN/SPY-1D(V) ×4 · OUT" (`kk_hit_4`).
5. **Look 2 and the new units at 2–5 ms a frame.** The hulls hold dot structure (`st_carrier_420`, `st_ddg_200`). The E-2D
   flies with its rotodome at "180 M · 232 KN" (`st_e2d_c`). The museum has the Kilo ("PROPELLER · 7 BLADES · SKEWED Ø 3.1
   M") and the Virginia ("PUMP-JET PROPULSOR Ø 4.6 M").

## The 10 highest-impact fixes (ranked)

Worth doing in the ~3 hours left: **1, 2, 3a, 6, 8, 10** (all S, independent, one agent each). **4** is M, but it is the
finale, so do it if an agent is free. Leave **5, 7 and 9** for after tonight unless someone is idle: they are
balance-risky or need several rounds of stills.

1. **The salvo board buries the picture at the best moments.** [S–M · parallel · DO NOW]
   - Seen:
     - During Combat on Krasnaya Kosa with C on, SALVO 01 plus RAID 01–03 stack across x 510–1410, y 530–860, over the
       coast and the TELs (`kk_cine_3`).
     - In the sandbox raid it runs to 11 lanes (`sb_raid_bench`).
     - In V radar view it is unreadable over the clutter (`sb_radarview`).
   - What to do:
     - Show at most two groups (your newest salvo and the nearest raid), with at most four lanes each plus a "+7" line.
     - Collapse a finished group to one summary line ("SALVO 01 · 2 HIT · 1 DOWN").
     - During cinematic, replay and radar view, shrink it to a one-line strip at the bottom edge.
     - Give it a faint graphite backing.
   - Where: `src/ui/hud/salvo.js` (`restructure`, `geometry`, `keepRect`).
2. **The Debrief film skips the kill that won the match.** [S · parallel · DO NOW]
   - Seen: Krasnaya Kosa Victory. The film was First salvo T+12:13, then Chase, then Hit on a DDG at T+13:57, then Every
     round. The carrier sinking at T+57:49 never appears.
   - The cause, confirmed by running `makePlan` on the stored record:
     - `plan.js:47` `finalDest` takes the last `dest` before the result. That is the MH-60R parked on the carrier, which
       dies on the same tick (67859), so the carrier kill loses its +100.
     - `XRAY` (`plan.js:19`) lacks `uran` and `kalibr`, although the hit replay already covers both (`84a2cf2`).
   - What to do: pick the win-condition unit's `dest` (carrier or HQ), or the highest-W8 `dest` in the window, and skip
     units aboard. Add `uran` and `kalibr` to `XRAY`.
   - Where: `src/game/debrief/plan.js`.
3. **First impressions: the opening shot and the open sea.**
   - Seen: every Combat opening is a 20–40 px HQ or carrier in the middle of flat speckle (`kk_c_open`, `ca_open`,
     `de_f_open`), and M3's is the same (`m3_b`). The sea from 0.3 to 9 km is random speckle (`kk_sea_minimapjump`,
     `kk_c_ddg_9km`) where the Engagement film has orderly rows (`ref_eng_70`).
   - **3a** [S · DO NOW]: open at 60–120 m on the HQ or carrier, low, looking toward the enemy, with a slow pull-out over
     4–6 s. Where: `src/main.js:250` `openingShot`, `src/game/campaign/camera.js`.
   - **3b** [M · later, stills against `pd_engagement`]: stronger world-fixed swell rows at near and mid range. Where:
     `src/engine/terrain.js`.
4. **M6, the finale, is a walkover.** [M · parallel · if an agent is free]
   - Seen: a plain scan → attack → reload loop won S at T+16:27 with zero losses. "Find the carrier" was done at T+00:24
     by the first scan, so the storm-cell hide never mattered, and the carrier sank at T+08:24.
   - What to do:
     - Keep the carrier outside every scan reach until the cell covers the approach.
     - Answer each salvo with counter-battery SLAM-ERs on the launch point (that is what makes the M5 fire-and-move
       mechanic matter).
     - Make S cost something (time, or rounds per kill).
   - Where: `src/game/campaign/m6_strike.js`, `grade.js`.
5. **The Fleet can't find the land.** [M · numbers agent · later]
   - Seen on Proliv Uzky as the Fleet:
     - the HQ contact never passed 0.51 in 1 h 37 min;
     - the E-2D has no scan and land detection 0.12;
     - the MH-60R, with its 20 km scan, was shot down before it got in reach;
     - the DDG has to close to 60 km, inside the TELs' reach.
   - Seen on Ust-Solyonaya: an idle Fleet loses a DDG at T+03, which is about 45 real seconds at ×4, before the player
     has done anything.
   - What to do:
     - Let the F/A-18E strike package or the E-2D classify emitting radars (ESM) or what it overflies.
     - Let the DDG's radar classify land faster.
     - Hold the Coast AI's first strike for about 5 game-minutes.
     - Re-run `balance.html`.
   - Where: `src/data/units.js` (aew, fighter), `src/sim/sensors.js`, `src/sim/ai.js`.
6. **Scan reach and weapon reach disagree.** [S · DO NOW]
   - Seen on Krasnaya Kosa: the carrier, which is the win condition, sat at 86–89 km for 25 min. That is inside the TELs'
     110 km but outside the radar's 85 km scan reach. The refusal only blinks at the cursor.
   - What to do: draw the scanners' reach ring while X is armed, and say the refusal as a toast and a log line
     ("OUT OF SCAN REACH · 86 / 85 KM · MOVE THE MONOLITH-B"). Add "IN WEAPON REACH · NOT SCANNED" to the IN REACH logic.
   - Where: `src/game/orders.js:333` `scanClick`, `src/ui/hud/alerts.js`.
7. **X-ray interiors and some models still saturate.** [M · look agent · later]
   - Seen: the LM2500 boxes in the DDG replay are solid white rectangles (`kk_hit_4`), the E-2D wing tops in the museum
     are slabs (`museum_e2d`), and the carrier replay frame is washed grey-green (`kk_cv_cine_12`).
   - What to do: extend Look 2's screen-spacing cap to the X-ray and Inspect draws.
   - Where: `src/engine/models.js`, `src/ui/inspect/`.
8. **HUD collisions and panels with no backing.** [S · DO NOW]
   - Seen:
     - the F9 panel's small type sits straight on bright terrain (`fm_panel`);
     - F1 help floats over the world with no dim (`help`);
     - "TRK 24 / TRK 22" and "HEAVY CELL" crowd the top edge beside the title (`m6_open`);
     - the "GROUPS" hint sits on a Pantsir tag (`m3_b`);
     - the EO inset overlaps the CONTACT chip (`kk_scanpay_1`).
   - What to do: a graphite gradient veil behind the film-maker and help panels, a top safe band in `game.hudRects`, and
     the hint line moved below the tags.
   - Where: `src/game/filmmaker/style.js`, `src/ui/help/`, `src/engine/overlay.js`, `src/ui/sensors/inset.js`.
9. **Camera jumps stall.** [M · later]
   - Seen: after a `cam.set` jump (minimap click, alert fly-to) the first 30 frames average 14–26 ms with a p95 of
     110–196 ms, while continuous zoom never passes 8.6 ms.
   - What to do: rebuild the clipmap over several frames, or keep coarse levels warm.
   - Where: `src/engine/terrain.js`.
10. **Small truths and small bugs.** [S · DO NOW]
    - The salvo board ends land targets as "SUNK" (TLV 12, a Pantsir). In `salvo.js:591`, a removed target falls
      through to `'Sunk'`; store the target's domain on the lane.
    - A Combat Victory shows both objectives unticked (`kk_result_c`). Where: `src/game/match.js`.
    - A lightning reveal logs six rows, "NEW · TRK 4034 … 4039 · LIGHTNING · 94 KM", with 40xx numbering. Make it one
      line, "LIGHTNING · 6 CONTACTS · 218° · 93 KM". Where: `src/ui/hud/log.js`, `src/ui/sensors/weather.js`.
    - The Kilo panel says "KLUB 4/4" while its tag says "4 KALIBR". Where: `src/ui/hud/selection.js`,
      `src/game/labels.js`.
    - The Orbital render style keeps a lime HUD instead of the one yellow (`orb_tel`).

## Everything broken

1. **The Debrief skips the decisive kill.**
   - Repro: Combat Coast on Krasnaya Kosa. Sink the carrier (with a helo on deck) with a Kh-35U final blow, then press D.
   - Or, in the console:
     ```js
     (await import('/game/src/game/debrief/plan.js')).makePlan(JSON.parse(localStorage['oniks.lastRecord']), 'coast').beats
     ```
   - Result: no Strike / Hit / Sinking beats for the carrier.
2. **The salvo board covers the centre of the screen.**
   - Repro: Combat Coast on Krasnaya Kosa at about T+12. Attack a DDG with 3 TELs at Salvo 2 while a SLAM-ER raid is
     inbound, then press C.
   - Result: four blocks across x 510–1410, y 530–860.
3. **"SUNK" on a destroyed transloader or Pantsir.** A raid lane on TLV 12 ended "SUNK" after the truck died
   (`kk_carrier_area`).
4. **Combat Victory with unticked objectives.** Win Combat Coast on Krasnaya Kosa by sinking the carrier: both
   "SINK THE CARRIER" and "KEEP THE COMMAND POST" show empty boxes (`kk_result_c`). The campaign ticks correctly.
5. **Drone targeting ignores the minimap.**
   - Repro: Combat Coast, press L, then click the minimap.
   - Result: the camera flies there, the mode stays armed and nothing launches. You have to click the world.
6. **Lightning log spam.** Combat Fleet on Ust-Solyonaya, a squall line at about T+12: six "NEW TRK 403x · LIGHTNING"
   rows fill the engagement log (`pause`).
7. **Camera-jump stall.** Click the minimap far from the camera: 110–200 ms frames for about half a second (fix 9).
8. **Not bugs, but noted:**
   - The first Esc in a match is eaten (it cancels the selection or mode), so the pause menu needs a second press.
   - "Auto ×1" was OFF in this browser's saved settings; another session may have toggled it.

## 3 ideas

1. **A radar-scope minimap** (the Ring and Confidence films; "I really liked the way radar looked"). Replace the dotted
   terrain minimap with a scope:
   - a lime sweep turning at the real Monolith-B rate;
   - range rings;
   - contacts as "?" clouds that firm into coral ticks with "TRK 41 · 0.99";
   - heard emitters as coral bearing lines;
   - a storm as a clutter blob.

   It shows the fog of war where the player looks most. It is cheap, because the contact data, the radar view (V) and the
   sweep already exist.
2. **Kill stills on the end screen.** Every hit replay already frames the Anatomy moment. Save its peak frame (the F8
   still path) and show the match's three best as thumbnails beside Victory / Defeat, each captioned the films' way:
   "Fig. 3 · DDG-51 · 04 DECKHOUSE · OUT · T+13:57". It turns each match into a set of film stills the user will want to
   keep. This is about S–M.
3. **An Anatomy interlude between campaign missions.** After each debrief, the museum opens for 10 s on the unit that
   decided the mission, with that mission's true numbers. For example, after M3: the Pantsir-S1 X-ray with "57E6 ×12 ·
   FIRED 50 · 9 KILLS · RADAR ON 4:10". It ties the favourite films (Anatomy) into the story, and it reuses the museum and
   the replay's part data.
