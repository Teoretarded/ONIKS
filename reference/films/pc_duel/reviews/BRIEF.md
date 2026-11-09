# Review brief (each round, each reviewer)

You are reviewing one stretch of the film pc_duel (project ONIKS, C:\Users\Teo\Documents\projects\ONIKS): a Point Cloud
game-trailer film, one continuous take (~650 s). Read CLAUDE.md (style tokens, "How the films work", "Direction") and
reference/films/pc_duel/LOOP.md first (it holds the user's latest vision; their sketches and reference frames are
reviews/user_sketch_strike_*.png and reviews/user_ref_hit_*.png — judge the strikes against them). Work lean: grep and
offset reads, Python for the CSV, no whole-file dumps. The user is demanding and visual: they want it to look and move like a real,
expensive production, true to how these systems really look (real sizes, speeds, timings; any time compression shown
on screen; labels true; boxes fitting their objects). Be diligent and honest; don't flatter.

## Inputs (round N: review_rN)
- reference/films/renders/pc_duel/review_rN/sheets/s_*.jpg: 3x3 contact sheets, one frame every 0.5 s, time stamped
  (sheet k covers film time 4.5k .. 4.5k+4). READ EVERY SHEET IN YOUR STRETCH.
- review_rN/frames/f_<ms>.jpg: the same frames at 1280 px; open any you need closer. For full resolution of one
  moment: ffmpeg -ss <t> -i reference/films/renders/pc_duel/pc_duel_1080p30.mp4 -frames:v 1 <scratch>.png
  (ffmpeg: see tools/serve.py find_ffmpeg).
- review_rN/camera.csv: the camera every 0.1 s (eye, target, distance, speed m/s, acceleration, view turn rate deg/s,
  fov and its rate, roll, frame brightness / lit / clipped / lime / coral fractions, HUD kicker and readout, tags on
  screen, subjects in frame and out of frame). Analyse ALL rows of your stretch with Python (pandas is fine) and
  relate the numbers to the frames: what the camera is doing, what it's looking at, how fast it moves and turns,
  zooms, what is visible and what isn't, when the subject leaves frame.
  Note: in the orbit -> sea cross-fade (round 2: 591.08-592.48) the logged camera switches world; speeds/turns there
  are not real. In the orbital act the camera often rides fast subjects: use rel_speed and turn, not raw speed.
- review_rN/flags.md, review_rN/chapters.md: automatic flags and per-chapter camera stats.
- reference/films/renders/pc_duel/pc_duel_1080p30.markers.json: chapters and named sound cues.
- The page itself, if you need to check a moment live: http://127.0.0.1:8770/films/pc_duel/pc_duel.html?t=<s>&hq=1
  (one browser tab, closed at the end; don't edit code).

## Judge (decimal scores 1-10; 1-4 bad, 4-6 rough beta, 6-8 good but improvable, 8+ amazing)
models (accuracy, proportions, real parts) · detail (density, small parts, close-ups hold up) · rendering (dots,
density, LOD pops, flicker, blown-out or muddy frames, readability, clutter) · animation (motion, physics plausibility,
easing, timing of mechanisms and effects) · camera (framing, composition, holds long enough, smoothness, turn rates,
subject in frame, no jerks, purposeful moves) · pacing (dead air, rushed beats, too long/short) · flow/story (is it
clear what's happening and why; seams; continuity: one destroyer, one damage state, one clock) · labels/HUD (true,
readable, held >= 2.5 s, not overlapping, boxes fit) · realism · sound (only if your brief says so) · overall.

## Output
Write reference/films/pc_duel/reviews/roundN_<part>.md:
1. Score table (each area + overall) with one line of why per score.
2. What works (keep list).
3. Numbered fixes, most important first: time range, severity (P1 must / P2 should / P3 nice), what's wrong (what you
   saw: frame refs and camera numbers), what to do concretely (numbers where possible: hold 4 s, turn <= 20 deg/s,
   fov 35->28, density x2, move the tag left...), and the file likely responsible:
   pc_duel_film.js (act-1 timeline, camera keys, readouts, the inserts' placement), pc_duel_engine.js (engine rooms),
   pc_duel_bank.js (power room), pc_duel_parts.js (ship, mount, dot passes, the hull break pass runXB),
   pc_duel_magazine.js (magazine / fabrication insert), pc_duel_shot.js (bore, muzzle, sabot),
   proto/intercept_act.js / intercept_sea.js / intercept_orbit.js (act 2), proto/intercept_dmg.js (damage),
   proto/strike_orbit.js / strike_sea.js / strike_sea_fx.js / strike_film.js (act 3).
Reply with the overall score and your top 5 fixes.
