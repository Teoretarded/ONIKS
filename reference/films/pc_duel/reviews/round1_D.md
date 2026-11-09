# pc_duel review, round 1, part D: 585-649.4 s + the sound of the whole film

Fall (end), Terminal, Strike on the destroyer, Dive, Cavity, Bubbles, Surface, Sink.
Inputs: sheets s_130..s_144 (every one read), camera.csv rows 585-649.4 (all 644 analysed; tags and lime/coral
columns ignored as asked), flags.md, chapters.md, markers.json, stills from the 1080p MP4 at 586 / 588.6 / 591 /
592.6 / 603 / 609 / 616.5 / 628 / 649, act-1 frames for the ship (0, 292-297, 447).
Sound: review_r1/audio (summary, events.csv), the stems in renders/pc_duel/sound/ (measured per chapter and in
0.25 s windows with numpy), report.json, tools/sound_lab/soundtracks/pc_duel.py + pc_duel_score.py, orchestra.py,
foley.py, timeline.py, the refs MANIFEST.

## 1. Scores (picture: 585-649.4; sound: the whole film)

| area | score | why |
|---|---|---|
| models | 6.0 | Same silhouette as act 1 (lattice mast, two stacks, aft hangar, the mount forward), the 18 m rod, two real halves. But the mount reads as a thin strut at ~65 deg, not the act-1 coil barrel (84 deg at the lay, ~75 deg at the shot), and the halves are clean rigid blocks with no torn ends in view. |
| detail | 5.2 | Act-1 density is gone: at 140-150 m (590.5-595.5) the ship is a sparse dot box. The debris field is uniform specks, the fire is warm-tinted dots, the bubble cloud is hundreds of hairline circles (616.5). |
| rendering | 4.6 | 598.5-611.0 is near-black (mean 0.041-0.047, lit 0.016-0.045). The cavity is a faint ghost at 607-611. Two dark grey solid crescents sit centre-low in every frame 634-649 (849-990 px, y 810-860: something rendered as solid, not dots). The strike flash is good (lit 1.0 for 0.1 s, clip 0.005). The ending frame is dim and small. |
| animation | 5.6 | Good: the rod's dive, ablation and slowing (4.79 -> 0 km/s over 77 m), the V-fold of the halves, the slow settle. Weak: the hull break happens off-camera (we dive at 595.6, the keel only notches); no spray dome or water column; the fire does not move like fire. |
| camera | 5.0 | The dive whips at 596.9-597.8 (turn 30-49 deg/s, 101 m/s, fov +9 deg/s). The rod's end (605.0-605.6) lands on the bottom edge of the frame. Cavity holds 3 s on black (607.5-611). Surface + Sink is 26 s of one drifting wide (623-649, 1-7 m/s, turn <= 6 deg/s). Bubbles -> Surface rise 621.2-622.5 is fast (61 m/s, fov -13.5 deg/s, jerks). |
| pacing | 5.0 | The money shot, the Strike, gets 3.7 s; then 16 s of a glowing dot in black (Dive + Cavity); then 27 s of a nearly unchanging wide. |
| flow/story | 5.5 | The order reads (impact, dive, steam cavity, bubbles, surface, sinking), but the break itself is never seen: we leave at a notched keel and come back to a finished V. |
| labels/HUD | 5.8 | The readouts are honest and the compression is always shown (x1, x0.3, x0.02, x0.003, x0.05, x4, x8). Tags are drawn at ~25 % opacity and are unreadable (ship tag 590.5-591.9, only 1.4 s; BOW / STERN SECTION 626-649). The ladder puts the rod's nose below "0 KM" at 19.2 km and 6.3 km (586, 588.6). The rise rate says 1.5 m/s while the depth falls at ~1.0 m/s. |
| realism | 5.6 | Checked and good: 24.6 t at 4.85 km/s = 289 GJ (~69 t TNT); eroding penetration ~L*sqrt(rho_W/rho_water) = 18*4.4 = 79 m vs 77 m shown; cavity pinch-off at T+0.2 s; settling 0.12-0.16 m/s. Missing: a 69 t TNT release under the keel throws a spray dome in tens of ms and a water column hundreds of metres high within seconds. None is shown, and the hull barely reacts. |
| sound (whole film) | 5.0 | Real recordings, clean -14.1 LUFS, and two great contrasts (the shot and strike 1). But the second strike, the film's climax, is buried under the fall roar. The mix is dark and muddy, the score is synthesized (with a sawtooth eighth-note pulse), the music often sits over the foley, and there are underwater routing bugs. |
| overall | **5.2** | The physics is honest and the sequence is clear, but the climax does not land in picture or in sound, and the last minute is mostly dark and static. |

**Key questions**
- **Same destroyer as act 1?** Mostly (6/10). The silhouette, the mast, the stacks and the forward mount match. But the mount is a thin strut at ~65 deg where act 1 left the bulky coil barrel at ~75-84 deg (447 s still; 296-297 s at ELEV 84 deg). It has no coil rings or lime, and the hull is far sparser than act 1. At 591 it reads as a crane, not the railgun.
- **Do the split, fire, secondaries, dive, cavity, vaporising rod, bubbles and aftermath look real and enormous?**
  - Split: no. A notch at the keel and some sparkles (592.5-595.5), then we leave.
  - Fire: weak, warm dots only.
  - Secondaries: tiny sparkles along the decks.
  - Dive: yes, it is the best part. The rod shrinking (ABLATING 17.4 -> 2.5 m), the cone behind it and the honest speeds all work.
  - Cavity: reads as stacked wobbly rings (a slinky), not a smooth, glassy steam cavity. Its collapse is barely visible.
  - Vaporising rod: framed off the bottom edge at 605-605.6.
  - Bubbles: hairline circles, plus a few spherical-cap domes. The domes are physically right, but too small to read.
  - Aftermath: the V of the halves, the debris ring and the faint smoke read (628-632), but small and dim.
  - Enormous: no. Nothing shows the scale of 69 t TNT.
- **Is the ending strong?** No (4/10). 26 s of the same wide, with the wreck in the lower middle at ~45 % width and mean brightness 0.055. Nothing happens (the halves tilt 29 -> 40 deg). The grey crescents sit in the foreground. The music fades over the last 2 s.

## 2. What works (keep)
- The physics and its readouts: penetration and ablation (DEPTH 0.3 -> 77 m, 4.79 -> 0.22 km/s, ABLATING 17.4 -> 1.5 m), "ROD · GONE AT 77 M", "CAVITY · PINCHED OFF" at T+0.2 s, settling, and the clock always shown (x0.003 frozen at T+62:03.0 through the dive, then x0.05, x4, x8).
- The fall's ride beside the rod with the plasma head (585-589.5) and the Terminal approach. The ship and the rod in one frame at 590.5-591.8 with the coral bracket fitting the hull (220-1160 px).
- The impact flash: brief, no grey-out (mean 0.207 for one sample, back to 0.12 within 0.3 s).
- The V of the two halves with a bow 29 -> 40 deg and stern 23 -> 32 deg, the debris ring on the water, the cook-off flash at 628, the smoke streaks.
- The waterline crossing at 622.0 (a crisp horizontal surface cutting the halves).
- Sound: the shot (447.5): -28.5 dB of held breath, then -7.5 dB. Strike 1 (475.05): -35.9 -> -7.6 dB. The quiet of the coast (-33.6 dB). -14.1 LUFS integrated, LRA 7.8, no clipped samples, mono-safe. Every sound a real recording. Named cues land exactly in the WAV (the shot at 447.500, strike 1 at 475.054 and strike 2 placed at rod_impact 591.954).

## 3. Fixes (picture), most important first

1. **591.9-622 · P1 · Show the break and the column (the climax is off-camera).** What we get: the keel notches (592.5-595.5) and the camera dives at 595.6. We come back at 622 to a finished V. A 289 GJ release under the keel is the classic keel-breaker: the hull hogs up, then sags and parts, and a spray dome and a water column rise hundreds of metres. Do this: after the cavity pinch-off (T+0.25 s, ~611), bring the lens up and out at x1/20 -> x1 by T+1-3 s, not T+40 s.
   - From a 250-400 m side wide, show the halves parting and folding, the spray dome and the column rising and falling back (column 150-300 m tall at x1 over ~3-6 s).
   - Then cut the bubble chapter to ~5 s, as the cloud reaching the surface as boiling whitewater.
   - Keep the Strike wide at least 6 s before the dive (it is 3.7 s now).
   - Files: proto/strike_sea.js (RK time keys, lookS camera), strike_sea_fx.js (dome/column), pc_duel_parts.js runXB (hull break).
2. **605.0-611.8 · P1 · The rod's end and the cavity are framed off and in the dark.** At 605.0-605.6 the rod's last 2.5 m and its glow sit on the bottom edge (y ~ 1060/1080). The camera is pulling back (26-33 m/s, fov 52 -> 62). Then 607.5-611 holds still on a frame that is ~95 % black (mean 0.046).
   - Keep the rod's end in the lower third (y <= 760) and hold 2 s on it.
   - Give it a final vapour flash, a white-hot burst lighting the cavity walls for 0.5 s.
   - Make the cavity wall a brighter, smooth sheet (x2 density, lit >= 0.1) whose collapse visibly pinches.
   - Files: strike_sea.js (camera v ~21-24), strike_sea_fx.js (cavity, rod end).
3. **596.6-598.0 · P1 · The dive whip.** Turn 30-49 deg/s, 101 m/s, fov 42 -> 51.4 in 1 s, mean brightness falling 0.112 -> 0.052 as we break the surface at 597.05.
   - Stretch it to 3 s with turn <= 25 deg/s and fov rate <= 5 deg/s.
   - Show the surface as we go through: a dotted waterline sheet and a ring of spray around the rod's entry.
   - File: strike_sea.js.
4. **598.5-611 · P2 · Underwater readability.** The scene is just black.
   - Add sparse suspended particulate (backscatter dots) that parallax with the lens.
   - Add the burning surface above as a faint warm Snell's window, and the rod's glow lighting the cavity from inside.
   - Keep mean >= 0.07.
   - File: strike_sea_fx.js.
5. **612-622 · P2 · Bubbles as hairline circles.** Draw each bubble as a bright specular point with a faint rim. Sizes from mm to metres, the big ones as spherical caps (keep the domes, scale them up). Make them brighter where lit from the fire above. File: strike_sea_fx.js.
6. **632.8-649.4 · P2 · The ending.** 26 s of an unchanging wide. Give it a last beat:
   - The bow section rising to near vertical and sliding under with an air burst and a foam ring, the stern following (raise the compression to x20-30 and show it).
   - A slow push from 200 to ~120 m, then a 4 s hold on the burning slick where the ship was.
   - Remove the two grey solid crescents in the foreground (634-649, ~850-990 px, y 810-860).
   - Files: strike_sea.js, strike_sea_fx.js.
7. **590-595.5 · P2 · Make it the act-1 ship.** Use the act-1 mount and barrel (the RGP parts: the coil barrel with its rings) at the act-1 elevation (~80 deg, as laid at 296 s and fired at 447 s). Double the dot density in the 140-150 m wides. Draw a waterline (a thin foam/dot line where the hull meets the sea). Files: pc_duel_parts.js, strike_sea.js.
8. **585-592, 626-649 · P2 · Tags and ladder.**
   - The ship tag "ARLEIGH BURKE · FLIGHT IIA · 155 M" (true) is at ~25 % opacity and on screen only 1.4 s (590.5-591.9). The chips of BOW / STERN SECTION are unreadable. Use full-opacity text and hold >= 2.5 s.
   - The destroyer is our ship (lime in act 1), so give it a white or lime tag and box. Coral reads hostile. Keep coral for the incoming rod.
   - The altitude ladder shows the rod's nose below "0 KM" at 19.2 km and 6.3 km (586, 588.6), and relabels from 10 km to 1 km steps at 588.5-589. Anchor the ladder so the tick at the current altitude is level with the nose, and fade between scales over 0.5 s.
   - Files: strike_sea.js, pc_duel_film.js.
9. **612-622 · P2 · Rise rate and depth.** "RISING · 1.5 M/S" while the depth goes 50 -> 27 m between T+62:06.7 and T+62:30.7 (0.96 m/s). The depth also jumps 43 -> 54 m at 612.0-612.5. Make the readout the measured rate, and start the cloud depth at the pinch-off depth. File: strike_sea.js.
10. **621.1-622.5 · P2 · The rise to the surface.** 61 m/s, fov 62 -> 49 at -13.5 deg/s, two jerks (|acc| > 40). Ease it over 3 s with fov rate <= 5 deg/s. File: strike_sea.js.
11. **622-649 · P3 · Fire and smoke.** Add flickering flame tongues (dense warm dots in rising, licking sheets), smoke columns lit from below drifting downwind, and burning fuel patches on the water. File: strike_sea_fx.js.
12. **585-589.5 · P3 · The plasma tube.** The sheath is a ~60 m wide dotted cylinder around a 0.3 m rod. A real hypersonic wake is a bright head and a narrow incandescent trail that widens slowly; narrow it to a few metres at the nose.
    - The speed loss also looks too large: 5.24 -> 4.87 km/s over the last 24 km. A 24.6 t, 0.3 m rod has a ballistic coefficient of ~2-3e6 kg/m2, so it should lose only tens of m/s. Say "ablating" if that is the intent, or lower the loss.
    - File: proto/strike_sea.js / strike_orbit.js.

## 4. Sound (whole film)

Measured (stem RMS per chapter, dB; music minus foley):

| chapter | mix | music | music - foley | note |
|---|---|---|---|---|
| Helium 125.6 | -19.9 | -35.9 | -15.9 | 70 % of the energy above 4 kHz (a loud hiss, -11.6 LUFS-M) |
| Banks 144.5 | -18.5 | -20.8 | +1.8 | the pulse starts (157 s) |
| Coils 224.5 | -17.2 | -20.1 | +0.1 | pulse at 2.53 Hz is the music's main modulation |
| Radar 277.3 | -18.8 | -19.4 | **+8.0** | foley barely there |
| Circuit 325.3 | -18.2 | -19.7 | +4.1 | |
| Fire 446.0 | -12.7 | -27.4 | -20.2 | the shot: -28.5 -> -7.5 dB, great |
| Coast 465.3 | -33.6 | -33.9 | +10.7 | the "silence" is a near-pure 880 Hz tone |
| Strike 474.8 | -15.2 | -22.2 | -8.8 | -35.9 -> -7.6 dB, great |
| Build 538.1 | -17.4 | -19.5 | +1.9 | pulse again |
| Fall 576.0 | -19.6 | -21.7 | +2.0 | |
| Terminal 589.6 | **-10.8** | -19.4 | -12.4 | the loudest stretch of the film |
| Strike 591.9 | -11.6 | -38.2 | -31.9 | no rise over Terminal |
| Dive / Cavity / Bubbles | -15.7 / -17.2 / -17.0 | -26 / -26 / -25 | -8..-11 | |
| Sink 632.8 | -16.3 | -23.7 | -7.1 | -12.0 LUFS-M at 632-640: the epilogue is louder than the film's average |

Overall: centroid 457 Hz, 85 % rolloff 703 Hz. 2-20 kHz holds only 5.8 % of the energy, and sub+bass+low-mid hold 74 %. The music stem is 83-88 % under 500 Hz and ~1 % above 2 kHz. Limiter max gain reduction 9.6 dB. True peak -0.8 dBTP after AAC.

Fixes, most important first:

S1. **589.5-592.5 · P1 · The second strike is buried.**
   - The problem: the fall roar's envelope ends at 0 dB exactly at the impact (`fall_and_strike`: `env=[... (L*0.85, -6), (L, 0)]`, plus jet_engine and welding at 0 dB). The impacts stem is already at 0 to +5 dB from 591.0. The mix sits at -10 dB from 589.25 and peaks flat-top at -1.1 dBFS for 4 s (588.75-592.5). The strike composite at 591.954 adds only ~2 dB, and no onset is detectable. (The analysis's "-91 ms" boom at 591.876 is roar fluctuation, not the strike.)
   - The fix: the picture slows x1 -> x0.003 across Terminal (589.55-591.9), so the sound should too.
     - Varispeed the roar from rate 1.0 to 0.25 over 589.6-591.5 and fade it to -30 dB.
     - Leave a 0.3-0.4 s hole at <= -35 dB short-term before 591.954, the way the shot does (-28.5 dB before 447.5).
     - Lower the fall roar's peak from 0 to -8 dB.
     - Target: the same +25 dB jump as strike 1.
   - In `pc_duel_score.build(... stop=ts - 0.4)` keep the music cut, and cut the foley with it.
S2. **Whole film · P1 · Dark, muddy mix.**
   - Music: in `orchestra.section`, fc = (1900 + 5200*vel)*(1 - 0.35*tasto) gives ~3 kHz at vel 0.24. Raise it to ~4000 + 9000*vel and drop tasto to 0.15 for the chords.
   - In `pc_duel.build_mixer` remove or narrow the music buses' 3.2 kHz -3 dB dip (there is little 2-5 kHz energy left to protect).
   - Add a -3 dB bell at 300 Hz (Q 1) on the m_* and amb buses, and a +2 dB shelf above 6 kHz on the master.
   - Target: centroid ~800-1200 Hz, 85 % rolloff >= 2.5 kHz.
S3. **Whole film · P1 · The score is synthesized, and the pulse reads as a synth ostinato.**
   - `orchestra.py` builds the strings, piano, brass and timpani additively (sawtooth bowed voices). That is exactly the "synthetic" the user rejected.
   - `pc_duel_score.pulse` writes the 370 m_pulse events: 0.32 s notes on D3/D4 (root + octave), 20 ms attack, 3 players, every eighth at 76 bpm (2.53 Hz). They run 157-255 s and 517-558 s. Their vibrato never starts (delay 0.35-0.65 s is longer than the note), so each note is a static buzz. In those windows it is the strongest modulation of the music stem. Expect it to be heard as a bleeping synth pulse, not strings.
   - Replace the instruments with real sampled ones through `sound_lab.samples` (e.g. a CC0 orchestral sample set such as VSCO 2 Community Edition: spiccato strings, timpani, piano; add it to MANIFEST.md with its licence).
   - Or drop the pulse for low percussion on the beat (real bass drum/taiko hits) under a sampled cello line.
   - For "cool, wide-appeal": a hybrid-trailer arc (a real-string ostinato building, braams/low hits on the shot and the strikes, one clear theme) rather than the restrained pedal-and-piano.
S4. **Whole film · P2 · Music over foley.** Music minus foley: Radar +8.0, Coast +10.7, Circuit +4.1, Banks +1.8, Build +1.9, Fall +2.0 dB. The user asked for realistic foley first. In `build_mixer` change the duck to depth -10, thresh -40, and lower the m_* entries in BUS_DB by 3 dB. In the machinery chapters keep the music 4-8 dB under the foley.
S5. **465-474 · P2 · Space "silence" is a sine-like whine.** The mix there is dominated by 880 Hz (A5 of the (74, 77, 81) chord; 64 dB above its neighbours). Use a lower, airier chord (D4/A4, flautando, with bow noise) at -40 dB, or plain silence with deep_ocean_rumble at -50. (`pc_duel_score.compose` section 5.)
S6. **595.5-622.5 · P2 · Underwater routing.**
   - `fire_bed` goes to `amb`, which is not muffled. Its welding crackle (hp 120, lp 5 kHz) plays dry while the camera is under water. Route it to `mech`, or give `amb` the `muffle` post.
   - The muffle window starts at the Dive chapter (595.55), but the lens goes under at 597.05. Add film cues `lens_under` (597.05) and `lens_up` (622.25) in strike_sea.js and use them in `underwater_windows`.
   - The splash fires at Dive - 0.05 (595.5), but the rod hits the water at the `water_entry` cue (592.97). Use `T.cue('water_entry')`.
S7. **599.95-615.4 · P2 · The secondaries are out of sync.** `sb = cue('secondary_blasts') - 4.1` spreads five blasts over 15 s of film. In the picture the clock is frozen at x0.003 (0.04 s of real time) and the hull's secondary flashes are at 592.5-595.5. Place them at 592.4-595.4 (above water, unmuffled), shorter and closer together.
S8. **595.5-622 · P2 · Synthetic bubbles.** `foley.bubbles` is decaying sine chirps (0.5-3.3 kHz) at 60-140/s, and the water bus adds +3 dB at 3 kHz. That combination can read as bloops/beeps. Blend in, or replace with, a real hydrophone bubbling recording (none in refs: fetch a CC0 one), and drop the high shelf.
S9. **Whole film · P2 · Mastering.** The limiter hits 9.6 dB of gain reduction, the true peak is -0.8 dBTP after AAC, and the gain is +6 dB. Master to -1.5 dBTP before AAC. Get the loudness from lower beds and music rather than from the limiter, so the shot and strikes keep 3-4 dB more crest.
S10. **632-649 · P2 · Epilogue too loud, abrupt end.** 632-640 measures -12.0 LUFS-M; the machinery stem is at -18 dB RMS from the groans (`metallic_groan` -20, `ship_creak` -22). Drop those 5-6 dB and let the piano theme carry. End on the theme's last note with a 4-6 s natural tail, not a 2 s fade.
S11. **126-136 · P3 · The helium hiss is harsh** (-11.6 LUFS-M, 70 % of the energy above 4 kHz). -6 dB and a low-pass at 9 kHz.
S12. **P3 · Fire is welding crackle plus rocket rumble.** Fetch a real large-fire recording (CC0). Where the WAV/FLAC originals are reachable, use them instead of the MP3 previews in refs (the previews cap the top end).

## 5. Top 5
1. S1: un-bury the second strike. Slow the roar down with the clock, leave a hole, then hit (589.5-592.5, pc_duel.py fall_and_strike).
2. Picture 1: show the hull break and the water column from above, and keep the Strike wide >= 6 s (strike_sea.js / strike_sea_fx.js / runXB).
3. Picture 2 + 3: frame the rod's end and its vapour flash and light the cavity; slow the dive whip to <= 25 deg/s.
4. S3 + S2: real sampled instruments in place of the additive orchestra and its sawtooth pulse; open the top end of the mix.
5. Picture 6 + 8: give the ending a last beat (the bow going under, a push-in, a hold on the slick), remove the grey crescents, and make the tags readable (the ship white/lime, held >= 2.5 s).
