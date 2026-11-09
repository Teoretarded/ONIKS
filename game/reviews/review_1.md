# Review 1

Reviewer 1 · 2026-09-25 · branch `game-v1` (working tree with agents still active). Played at 1920×1080 in the
Browser pane (hidden pane, so stills were taken with `hudShot`; they are in `game/shots/review1/`, gitignored).
Session: menu and campaign screen; campaign missions 1 (menu, full win), 2, 3 (first raid), 4 (six-round salvo),
5, 6; Sandbox on Dolgaya Guba, Krasnaya Kosa and Chyortova Past (palette, K wake, V radar view, N weather to
storm, lightning, Shift+I anatomy walk, 20 m to 150 km); Combat as Coast on Proliv Uzky (played to defeat) and as
Fleet on Belye Shkhery (~70 min game time).

## Score: 6.5 / 10

It looks like the films: graphite, white returns, lime for own forces and scans, coral for hostiles, film-style tags,
the real HD models. The Inspect view (X-ray, exploded, 16 real part labels, the scan front) is close to the Anatomy
films and is the best thing here. The lime bolt of the SCAN is striking. Performance is excellent and I saw no
console errors in the whole session. The game layer is what holds it back.
- Combat as Coast is decided before you touch anything: every TEL fires both rounds within 10 s of the start,
  SM-6 and Phalanx shoot all of them down, and you then watch the HQ die 24 min later.
- As Fleet, the carrier's six aircraft can never be selected or launched.
- The tutorial's contact takes ~42 game-minutes to become scannable.
- Missions 5 and 6 never fight back. Mission 5 gives grade A with no input.
- The payoff of the bolt happens on a speck 12 km away.

This is "not bad, could clearly be more interesting". The visual base is 7–8 material; the RTS is not yet.

## Rubric scores

| # | Line | Score | Why |
|---|---|---|---|
| 1 | Looks like the films | 7 | Palette, fonts, tags, HD models and intercept trails are right. At play altitudes the terrain and sea dots drown the units: the M1 opening HQ is a grey smudge; in the Strait opening the DDG is unreadable. Frames are often empty. |
| 2 | Real RTS | 5 | Select, order, fight, win and lose all work, the AI fires back (158 rounds against my 44), and the rate is always on screen. But the opening salvo is automatic, Fleet can't use its air wing, first contact comes late, and two missions are passive. |
| 3 | 360° camera | 8 | 20 m to 150 km, full yaw, pitch 3–89°, smooth fly-to, follow (F), frame, minimap. Minimum pitch 3° means you can't look up at climbing rounds. |
| 4 | Favourite effects as gameplay | 7 | The bolt, the radar view (V), SAM and 30 mm intercepts, the hit flash, the sinking ship turning coral, the reload crane and storm lightning are all there. The scan's identify moment is tiny in the world view, and the cinematic camera often misses the action. |
| 5 | Anatomy / Inspect | 8.5 | X-ray, exploded view that floats apart, scan front, true part names and sizes (LM2500 ×4 · 100 000 shp, Mk 41 64 cells, tyres 1500×600-635), enemy inspect gated on identification, and a 29-model walk (Shift+I). A few labels overlap. |
| 6 | Maps unique, three modes | 6.5 | Six clearly different maps: fjord inlets, strait with a central island, skerries, delta meanders, caldera ring, the real coast. All three modes start from the menu with intros. But M5 and M6 are non-events and M2 takes 38 game-min to find the group. |
| 7 | Realism | 7 | Real names, sizes and speeds, and the ×rate is shown. "H · Hold" actually means *weapons free*. |
| 8 | Performance | 9 | `benchSync(120)` at 1080p: 2.3 ms far view, 2.9 ms carrier at 6 km, 4.9 ms TEL at 120 m, 4.7 ms (p95 5.3) during a 31-round raid on 23 units. No console errors or warnings in any mode. |
| 9 | Polish | 5.5 | The end overlay collides with the objectives panel, tags clip off the top edge, alert chips can't be clicked, and the campaign screen shows missions passed after locked ones. |

## The 5 best things

1. **Inspect / Anatomy** (`src/ui/inspect.js`). The DDG X-ray with the scan front ("Z +62.5 M · BOW · AN/SQS-53C"),
   16 numbered parts with true specs, an exploded view with bracket boxes, and the TEL X-ray showing both 3M55
   rounds inside their TLCs. The Shift+I museum walk through 29 models is a gift for this user.
2. **The lime SCAN bolt** (`src/ui/sensors/bolt.js`, `scan.js`). A branching lime bolt from the sky onto the
   contact, a draped lime ring, "SCAN 01 · STRIKE 4.0 KM", and the track snaps from 0.59 to 0.98 (DDG · Arleigh Burke).
3. **The radar picture and radar view (V).** Contacts condense from "? 0.44" clouds with UNKNOWN/CVN/DDG
   probability bars into coral tracks, you get EMITTER bearings, and the scope view shows tracks with circles. It
   feels like the Ring and Confidence films.
4. **Engagement moments.** Pantsir 57E6 trails climbing in lime, "INTERCEPTED · 30 MM", the Oniks closing low with its
   plume, the hit flash on a coral-lit DDG, "SUNK", and the reload crane swinging a TLC onto the TEL. The
   engagement log reads like the films (VAMP, KILL, DOWN, RELD).
5. **Performance and stability.** A few ms per frame for up to ~1 M ground dots, and not one console error across
   every mode, map and mission I opened.

## The 10 highest-impact fixes (ranked)

1. **Give the player the first shot (Combat).**
   - What's wrong: in `play.html?mode=combat&map=strait&side=coast`, all four TELs fired at the DDG tracks at
     T+00:10 ("3M55 TEL 06 · 1 round away"). Every round was shot down, and the rest of the match was spectating (lost
     HQ at 24:00, 1 kill). The cause: TELs and DDGs start on `hold`, which here means *weapons free*.
   - The fix: start on hold fire, rename the command to "Weapons free / Hold fire", and let the first salvo be the
     player's decision.
   - Where: `src/game/setup.js:56`; `src/game/orders.js` `hotkey('hold')`; `src/ui/hud/commands.js` labels;
     `src/sim/weapons.js offensive()`.
   - Effort S. Parallel: yes (tell the balance agent; their numbers change).
2. **Fleet can't use its air wing.**
   - What's wrong: aboard aircraft are skipped by every selection path, so after 70 min: "Air 6 on deck · 0 up".
     `pickUnit`, box select, Tab and double-click all skip `u.aboard`, and there is no Launch command.
   - The fix: add a carrier command (e.g. `A` launch strike / `L` launch helo), make the selection panel's Air row
     clickable to select deck aircraft, and let right-click with the carrier selected send the strike package.
   - Where: `src/game/select.js:18-35, 80, 111, 128`; `src/ui/hud/selection.js:79-83`; `src/game/orders.js`;
     `src/ui/hud/commands.js`.
   - Effort M. Parallel: yes.
3. **SCAN beyond reach drives the scanner away.**
   - What's wrong: in M1 I pressed X and clicked the contact at ~80 km (radar reach 70 km). The Monolith-B stowed its
     mast and drove ~6.7 km toward the sea (speed 7.7 m/s, 4-node path) without any order to move. For the player
     it just "doesn't work".
   - The fix: player scans should never move a unit. Refuse with "OUT OF REACH · 82 / 70 KM" in the targeting
     overlay, or pick another scanner.
   - Where: `src/sim/orders.js:292-301` (the `d > sc.reach` branch); `src/game/orders.js:176-182` (pass
     `stay: true` from the player's click and show the reason).
   - Effort S. Parallel: yes.
4. **Pacing: engagements come too late.**
   - What's wrong: M1's destroyer is first heard at T+17:07 (emitter, 85 km), evaluated at 33:37 (0.59), and
     classifiable by radar only inside ~60 km (~T+42 min). Contacts sat at 0.44–0.45 for over 30 game-min, even
     with auto-slow to ×1 on every new contact. M2 needed T+38 min to find the task group (drone camera 5 km in
     haze).
   - The fix: start the enemy closer and make classification firm up faster with range. Tutorial beats should come
     within 2–3 real minutes at ×4.
   - Where: `src/game/campaign/m1_inside.js`, `m2_scale.js` (spawns); `src/sim/sensors.js` (confidence growth);
     `src/data/campaign.js` (par).
   - Effort M. Parallel: yes (campaign agent).
5. **Make the scan's payoff visible where you play.**
   - What's wrong: the bolt lands, but the scanned DDG is a 40-px speck at 12 km, and the "cool shit after the hit"
     (part boxes, labels decoding, the X-ray sweep) only exists inside Inspect.
   - The fix: after `scan hit`, draw the film-style part boxes and decoding labels on each identified hull for ~3 s
     in the world view, and open a small auto-framed inset (like the Scale/Salvo splits) when the target is under
     ~60 px. This is the feature the user named.
   - Where: `src/ui/sensors/scan.js`, `tags.js`; reuse part rects from `src/ui/inspect/overlay.js`;
     `src/engine/overlay.js`.
   - Effort M–L. Parallel: yes (sensors agent).
6. **The cinematic camera misses the action.**
   - What's wrong: with C on after a launch, the frame was empty star field with one coral line (shot `m1_cine1`).
     On Victory it looked at empty sea and a smoke column while the DDG sank off frame (shot `m1_sink1`).
   - The fix: keep the tracked round and its target inside a framing box with lead; on `destroyed` or `result`,
     frame the dying unit at the films' low angle.
   - Where: `src/game/director.js:50-111`; `src/game/match.js` (`showEnd` / director take).
   - Effort M. Parallel: yes.
7. **Campaign missions 5 and 6 don't fight back.**
   - What's wrong: M5 "Ring" with zero input ended *Victory, grade A* at T+15:55 (enemy fired 6 rounds, nothing
     lost). In M6 "Strike" nothing had been fired by T+20:00.
   - The fix: script the raids and make a passive player lose. Grade A should need kills.
   - Where: `src/game/campaign/m5_ring.js`, `m6_strike.js`, `grade.js`; `src/game/match.js grade()`.
   - Effort M. Parallel: yes (campaign agent, in progress).
8. **Play-view readability (world look).**
   - What's wrong: at 300 m to 3 km the terrain and sea returns are as bright and dense as the models. The M1
     opening shot is a grey field with an unreadable HQ, and the Strait opening DDG is a smudge. The films keep the
     ground dim and sparse, with models and the sea's orderly rows bright (`pe_aegis`, `pd_engagement`).
   - The fix: add a unit brightness lift and terrain dimming around units, reduce ground density at mid altitude,
     and give the opening shot a subject that fills about a third of the frame.
   - Where: `src/engine/terrain.js` (depthFade, dot density, `uSeaP`); `src/engine/renderer.js`;
     `src/main.js openingShot()`.
   - Effort M. Parallel: yes (world-look agent).
9. **HUD layout collisions.**
   - What's wrong:
     - The Victory/Defeat block is drawn over the objectives panel ("01 · INSIDE" on top of "SINK THE DESTROYER",
       shot `m1_sink1`).
     - The command card stays visible under the end screen.
     - Selection brackets and tags clip off the top edge (TEL erect: "02 K340P TEL · ERECT · 2 RD" cut at y=0).
     - The classification card "TRK 22 ? 0.45" sits over the mission title (M6).
   - The fix: hide the HUD blocks at the end, and clamp world tags to a safe rect that avoids the HUD panels.
   - Where: `src/game/match.js showEnd/addStyle`; `src/engine/overlay.js` (tag clamp);
     `src/ui/sensors/contacts.js`, `tags.js`.
   - Effort S. Parallel: yes.
10. **Alert chips can't be clicked.**
    - What's wrong: `.h-al` rows sit inside `#hud` (pointer-events: none) and lack the `hit` class, so
      `elementsFromPoint` on "CONTACT 5 NEW TRACKS" returns `canvas#gl`. The file header promises "Click one: the
      camera flies there."
    - The fix: add `hit` to the slot divs.
    - Where: `src/ui/hud/alerts.js:13-17`; `styles/hud.css:12`.
    - Effort S. Parallel: yes.

Worth the tokens: fixes 1, 2, 3, 9 and 10 are small and fix real breakage, so do them now. Fixes 4, 5 and 7 are
where the score moves. Fix 8 is a taste pass that needs stills after every step.

## Everything broken

1. **Alerts unclickable.** In M1, wait for the right-hand "CONTACT" chip and click it: nothing happens (the click
   lands on `canvas#gl`). `src/ui/hud/alerts.js`.
2. **Scan out of reach moves the radar.** In M1 with the radar up, press X and click a contact beyond 70 km: the
   Monolith-B packs up and drives off; its order stays `scan`.
3. **Fleet aircraft unselectable.** Open `play.html?mode=combat&map=archipelago&side=fleet`. Clicking a jet on the
   deck selects the carrier, and Tab / box / double-click skip aircraft. The selection panel reads "Air 6 on deck ·
   0 up" for the whole match.
4. **Auto salvo at start.** Open `play.html?mode=combat&map=strait&side=coast&ai=normal&win=hq&fog=1` and do nothing:
   by T+00:11 every TEL reads 3M55 0/2. The "H · Hold" button is lit while it means weapons free.
5. **M5 won by idling.** Open `play.html?mode=campaign&mission=5`, run ×8 (or `ONIKS.ff`) with no input: at 15:55
   the result is Victory, grade A, kills 0.
6. **M6 idle.** Open `play.html?mode=campaign&mission=6` and run to T+20:00 with no input: no enemy fire.
7. **End overlay overlaps the objectives panel, and the command card stays under it.** Win M1 to see it.
8. **Tags clip at screen edges.** Zoom on an erect TEL at 40 m with it selected: its tag runs off the top. The M6
   start shows the contact card over the title.
9. **Campaign screen out of order.** "Battery · B · Passed" and "Ring · A · Passed" show while "Scale" is Next and
   "Engagement" is Locked, after missions are opened by URL. Results should respect unlock order (or it's shared
   localStorage from other agents; check `src/ui/shell/screens`, `src/data/campaign.js`).
10. **Inspect label collisions.** In the DDG X-ray, "X-RAY · DDG-51 ARLEIGH BURKE · HULL Z +62.5 M" overlaps the
    "TACAN" tag. Stills can catch labels mid-decode ("MK 45 MO- / - /- / :/"). The "OBJ IN VLS FWD 0.37 ·
    EMPTY/INERT/MK 41" card on a friendly-looking VLS reads like noise; drop it or explain it.
11. **Pause menu over the sandbox palette.** Esc in Sandbox: the menu text sits on the palette rows. It's dimmed,
    but it's still a collision.
12. **Menu film can't show in a hidden tab.** With the tab hidden, the film iframe stays at opacity 0.01, because
    `backdrop.show()` waits on the film's `requestAnimationFrame`. With the opacity forced, the menu over Anatomy ·
    Ship looks right. This only affects captures, not players.
13. **Sound not judged.** The pane was hidden. The audio context reported running at 48 kHz and there were no
    errors.

## 3 bold ideas

1. **The kill replay is an Anatomy film.** When an Oniks hits, drop to ×0.25 and fly (no cut) into the target:
   - the lime X-ray front sweeps the hull at the moment of impact;
   - the parts that fail (the per-part damage already exists) flash coral with their true names ("LM2500 ×4 ·
     OUT");
   - the exploded view drifts apart as the ship breaks, then the camera pulls back to the sinking hull.

   Every hit becomes a scene from the user's favourite film. Reuse `inspect.js` and `damage.js`.
2. **Chain-lightning scan.** The bolt forks to every contact inside the ring. Each fork ends in a tag that decodes
   letter by letter from "? 0.31" to "DDG · ARLEIGH BURKE 0.97", with part boxes blinking on each hull and the whole
   squall lit lime for one frame. The same bolt, white, is how storms reveal both sides. Lightning becomes the
   game's signature verb, and it scales with how many ships you catch.
3. **Orbital as the strategic layer.** Past ~60 km altitude the picture cross-fades from Point Cloud into the
   Orbital language: black, white hairline coastline and range rings, one yellow for your salvo in flight, catalog
   labels from `orb.js`. Zooming back in re-condenses the dots. Both film languages live in one continuous zoom,
   20 m to orbit, with no mode switch.
