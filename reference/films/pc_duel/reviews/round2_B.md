# pc_duel review, round 2, part B: 451-664.7 s + the sound of the whole film

What this part covers, in order: Climb, Exit, Coast, the hit on the orbital ship (Strike, Debris, Release, Break),
Rings, Ring, Split, Build, Line, Chamber, Charge, Fire, Fall, Terminal, the strike on the destroyer, Dive, Cavity,
Surface, Bubbles, Sink.

Inputs:
- Sheets s_100..s_147: every one read.
- camera.csv rows 450.5-664.7: all analysed. Per-second stats, every readout and kicker change with its duration, the
  magazine count, and the frame switches at 511.1 and 591.1.
- chapters.md, flags.md, markers.json (cues).
- The user's references: user_ref_hit_1 and _4 (the other five would not load), user_sketch_strike_1 and _2.
- Sound: review_r2/audio/summary.md and the stems in renders/pc_duel/sound/ (mix, music, impacts, machinery, ambience,
  water), measured with numpy in 1 s and 0.1 s windows, with band splits and centroids. report.json.
  tools/sound_lab/soundtracks/pc_duel.py and pc_duel_score.py.
- Round 1: round1_C.md and round1_D.md.

## 1. Scores (picture: 451-664.7; sound: the whole film)

| area | score | r1 C / D | why |
|---|---|---|---|
| models | 6.8 | 6.6 / 6.0 | The orbital ship now really breaks into a V and stays broken. The destroyer is the act-1 ship: barrel mount, dense hull sheet, lattice mast. Two weak spots: the sabot petals at the muzzle are grey solid planes (581.5-582.0), and the surface debris is flat grey cards (630.5-635). |
| detail | 6.4 | 6.0 / 5.2 | Two close-ups hold up: the hull at 36 m during the cut (602-607) and the torn seam of the V. The magazine fireballs are small warm puffs. The rod line is abstract wire: two orange rods, no visible processes. |
| rendering | 5.7 | 5.0 / 4.6 | No blown frames (clip <= 0.03), and the underwater mean is up to 0.08. Still wrong: the Coast is black for 5 s (465.6-470.9, lit 0.00). The bore ride is wire spaghetti (574-581, worse than r1), and so are the entry into the hull (551-553) and the Chamber (564-565). There is a hard dotted shell edge at 590-591.5, and the vignette bands on black (466-470). |
| animation | 6.6 | 6.0 / 5.6 | Good: the furrow travelling along the hull, the incandescent seam, the aft section swinging off the line, the barrel extruding, the cavity pinching off, the 239 m column rising and falling back, and the bow, then the stern, going under. Weak: the magazine chain does not grow (608-615, the clock frozen), and the line's stations do not visibly work. |
| camera | 6.4 | 4.5 / 5.0 | Most whips are gone; turns are mostly 20 deg/s or less. Left: 451.9-452.4 (50 deg/s plus a fov rate of 14 deg/s), 596.6-597.2 (25.9 deg/s) and the dive into the hull at 550-552 (18.5 deg/s through clutter). Static holds: 504-511, 537-544 and 656-664.7. Well framed: the 36 m cut close-up and the surface wide at 630.5-640. |
| pacing | 5.8 | 4.5 / 5.0 | The Strike now gets 12.7 s, and the Line is 12.4 s. Still too long: the Coast black (5 s), the Break hold (24.7 s on one readout), the rebuild (Rings to Build, 511-550 = 39 s; the user asked for "tight"), 16.5 s underwater, and a 9 s static end. |
| flow/story | 6.8 | 5.0 / 5.5 | The story now reads: hit, V-break, crippled, rebuild, shot, fall. The order is cut, keel, magazines, dive, rod gone, back up to the V and the column. The damage carries into every later orbital shot. One seam: the hull break itself is off screen (it is seen from below at 628-630). |
| labels/HUD | 6.0 | 6.0 / 5.8 | Untrue: the cut reads x0.001 but runs at about x0.0004. The column readout flickers RISING / FALLING BACK 11 times (635.8-636.8). Readouts held under 2 s: 521.6 (0.5 s), 568.0 (0.7), 599.0 (0.3), 607.2 (0.6), 562.8 (1.2), 485.2 (1.4). The "Bubbles" chapter shows the surface. The ladder labels double up at 589.5. |
| realism | 6.6 | 6.6 / 5.6 | The numbers check out: 289 GJ; the column at 75, 192 and 237 m at T+0.9, 2.8 and 4.8 s; the magazine chain of 9 in about 15 ms; sunk 4 min 44 s after the hit at x30 (shown); 84 s of flight for 380 km. Still off: the entry speed loss of 5.45 -> 4.87 km/s should be about 20 m/s (r1 D12), and the cut's time label. |
| sound | 6.2 | 5.0 (D) | Better: true space silence, a held breath before the strike, the underwater muffle routed right, a sampled orchestra, and the orbital hit and the shot are huge contrasts. Still wrong: the climax strike is 3 dB *quieter* than the orbital hit, magazines 2-9 are silent, the V-break is silent with rebuild clanks under it, the orbital events are sub-bass only, the end is cut, and the bubbles are still synthetic. |
| overall | **6.3** | 5.2 / 5.2 | A real step up. Every beat the user asked for exists now, and the story reads. But neither big moment is "epic" yet, and the climax is the weakest in both picture and sound. |

## 2. The two big moments, against the user's references

**The orbital hit (474.8-511): good, not epic: 6.5/10.** What matches the "manhole cover" frames:

- The streak tearing along the hull: the flash travels along the starboard shoulder, leaving a white-hot furrow, 51 -> 360 m (475-478).
- A blinding flash with a horizontal anamorphic streak (475.0 and 478.0).
- Incandescent torn seams: the V seam glows white for 25 s.
- The ship broken into a V: the aft section 3° -> 34° off the line (487-500), and it stays broken in every later shot.

What is missing next to ref 4:

- **The comet fan.** Ours is a narrow jet that leaves frame left within about 2 s (479-482). There is no wide, bright fan streaming downrange.
- **Light shafts.** There are none.
- **Big tumbling plates.** The debris is sparse specks plus a few cards.
- **The energy release.** At 482-486 it reads as sparkles on the ring rather than a ship letting go.
- **A sense of scale.** The flash is a round sprite on a 1 km static wide.

It reads as "a hit that breaks the ship". It does not yet read as the meme's annihilation.

**The destroyer strike (598-640): the beats are right, but they don't land: 5.8/10. The surface return at 630.5 reaches 7/10.**

What matches the sketches:
- The rod comes in at about 45° amidships (600-601).
- A close-up from 36 m shows the rod cutting deck after deck. A glowing cone moves down through the hull, and the readout counts the plates (601.6-607.4). This works.
- The magazine band runs low along the keel, from amidships forward, as in sketch 2: nine bursts (607.8-614.2).
- Under the water: the rod boiling, ablating and gone, then back up to the V with a 239 m column, fire and thrown wreckage (630.5-640). That frame is the best of the act.

What does not match:
- **Sketch 1's plasma sheath.** A fat coral comet head becomes a thin needle with a spark at terminal (598-601).
- **The massive hole.** It is a ragged hole the size of a deckhouse.
- **The chain.** It is nine small warm puffs that don't grow. The hull silhouette stays intact, with sparks all over it (609-615).
- **The ship torn apart.** This happens off screen, between 615 and 628.

The clock is held at x0.001-0.003 for 13 s, so nothing evolves. At that rate a detonation front (about 6 km/s) should still grow about 18 m per film-second, so even at this rate the fireballs should visibly balloon.

## 3. What improved since round 1, and what didn't

**Improved:**

| r1 fix | what changed |
|---|---|
| C1 | The hit is no longer a spark: the furrow, flash, streak, seam and V are in (still short of epic). |
| C2 | Debris stays in frame (479-541). |
| C3 | The damage shows in every later orbital shot: the bent hull in Rings, Ring, Split and Build. |
| C5 | The build clock is a steady x200, and the pre-fire checks are merged. |
| C6 | The Build is closer (415-520 m) and the extrusion reads. |
| C7 | Ring and Split are readable. |
| C8 | The 481 whip is gone. |
| C9 | The roll is down from 63° to 15°. |
| C14 | The barrel is 1016 m everywhere. |
| D1 (part) | The Strike wide is held 12.7 s, and the column is shown. |
| D2 | The rod's end is framed with its vapour flash, and the cavity is a smooth sheet that pinches off. |
| D3 | The dive turns at 4.7 deg/s or less. |
| D4 | Underwater mean 0.08. |
| D6 | The ending has its beat (bow, then stern under). |
| D7 | It is the act-1 ship. |
| D9 | The rise rate is consistent. |
| D10 | The rise is eased. |
| S1 (part) | A 0.3 s hole before the strike. |
| S3 | A VSCO sampled orchestra. |
| S5 | Space is silent: no 880 Hz tone. |
| S6 | The fire bed is muffled under water, and lens_under / lens_up come from the camera log. |
| S9 (part) | True peak -1.54 dBTP. |

**Not fixed:**

| r1 fix | what remains |
|---|---|
| C4 | The Coast is still black for 466-470.9. |
| C10 | The bore-ride clutter is worse. |
| C11 | The hard shell edge remains (590-591.5), and the rod tag is faint. |
| C12 | Vignette banding. |
| C13 | The hostile rings are still lime. |
| C15 | The lime column of the camlog still reads 0.000 with lime rings on screen. |
| D1 | The break is still off camera. |
| D8 | The ladder is off. |
| D12 | The entry speed loss. |
| S1 | The strike is still not the loudest moment. |
| S2 | The space act is still dark: music under 2 kHz, the orbital events are sub only. |
| S8 | The synthetic F.bubbles are still in use. |
| S9 | The limiter still takes 9.4 dB. |
| S10 | The end is abrupt. |

## 4. What works (keep)

- **The climb and the limb shots (452-465):** honest altitude, air density and speed. The sheath fades with the air.
- **The target seen at range (469-470.5):** the ship centred with its coral tag, then the rod's approach into a close
  pass of the hull and rings (472-474).
- **The furrow.** A moving white-hot front along the hull with a hard flash streak, and true readouts: 1.3 GJ, 2.5°,
  FURROW 360 M, 1504 PIECES / 48 000 FRAGMENTS.
- **The V.** The white-hot seam, the aft section 34° off the line, and the ship carried broken through the rebuild.
- **The barrel extruding** out of the construction-ring cluster at a steady x200, and the reveal of the full barrel
  with its collars (547-548).
- **The charge** along the barrel (567-573), and the muzzle with the rod and its peeling sabot (582-583).
- **The 36 m side close-up of the cut** (602-607): deck count, plates, a 45° path. It is exactly the sketch's idea.
- **The magazine band** placed low along the keel, from amidships forward.
- **Dive and Cavity.** A smooth steam cone, the rod ablating to nothing with its glow centred low, the pinch-off at
  32 m, and the burning hull seen from below before surfacing (628-630).
- **The surface return** (630.5-640): the V, the column, the fire and the mount thrown (lime-tagged, splashing at 638).
- **The Sink.** The bow rises to vertical and slides under, then the stern; SUNK 4 MIN 44 S at x30.
- **Sound:**
  - Space silence (466-474.9 at -50 dB). The orbital hit: -50 -> -7.6 dB at 475.0, exactly on the flash (475.07).
  - The orbital shot: -31 -> -7.5 dB at 581.7, on the flash (581.67). The trailer brass and drum on the hit.
  - The underwater muffle (617-629: centroid 125 Hz). The underwater chord. The theme at the surface.
  - -14.1 LUFS, LRA 9.5, sync offset -21 ms.

## 5. Fixes (picture), most important first

1. **601.5-615 · P1 · Make the strike "massive"** (strike_sea_fx.js, strike_sea.js, pc_duel_parts.js runXB).
   - **The sheath (598-601.5).** Give the rod a coral-white incandescent head 3-6 m across, and a glowing wake that
     widens to 30-50 m behind it. Let it light the deck for 0.3 s before contact (lit fraction +0.1).
   - **The magazines (607.8-614.2).** Each detonation is a white core that lights the whole frame (0.15 s, mean +0.08).
     It grows at the real front speed at the shown rate: at x0.003, about 18 m per film-second to 30-40 m. Then it goes
     orange with smoke.
   - **The hull.** Push the hull plating out with each burst: plates displaced 2-8 m, the side sheet bulging and tearing
     between frames. Open the entry into a 10-15 m ragged crater with peeled deck edges.
   - **The keel break.** Give the keel a visible crack line under the magazine band by 614.
   - Keep the camera at its 95 m broadside (good). Hold until 614.5 with the HUD's 9 OF 9 visible 2.5 s.
2. **475-486 · P1 · The comet fan and the light shafts** (proto/intercept_dmg.js, intercept_orbit.js).
   - **The fan.** From the exit point, 6-10k dots in a 30-40° half-angle cone streaming downrange (the rod's
     direction), brightest at the hull. At x0.01-0.1 it should fill about 60 % of the frame by 479.
   - **The light shafts.** Radial bright streaks of dots (6-12 rays, 0.5-1.5 s) through the fan, from the flash point.
   - **The plates.** 20-40 large peeled plates (5-20 m) tumbling out of the furrow at 0.5-2 km/s.
   - **The camera.** Hold until the fan has spread, then ease out (no faster than 20 deg/s) so the fan stays in frame
     to 484.
   - **The energy release (482-486).** Make each burst a hull-lighting flash that pushes debris out of the ring. Bring
     ring segments off at R·ω, straight lines, for ever.
3. **465.6-470.9 · P1 · The Coast is still 5 s of black** (lit 0.00; intercept_act.js / intercept_orbit.js).
   - Draw the ship from frame centre the moment the Coast starts: a 4-10 px point with its coral tag. Grow it
     through 466-470.
   - Or keep the limb or the rod's lime trail in frame.
   - Or cut the Coast to 2.5 s.
4. **573.6-581.6 · P1 · Bore-ride spaghetti** (worse than r1; s_128: the whole hull's wire crosses the frame;
   proto/strike_orbit.js / pc_duel_shot.js).
   - Within 80 m of the lens, fade every non-barrel part to 15 %.
   - Keep the round, the sabot, the coils (lime pulse per stage) and the bore liner.
   - The same treatment is needed for the entry into the hull at 550-553 and the Chamber at 563.8-565.5.
5. **511-550 · P2 · Make the rebuild tight** (39 s now; proto/strike_orbit.js).

   | beat | now | target |
   |---|---|---|
   | Rings | 11 s | 6 s |
   | Ring | 3.5 s | 3 s |
   | Split | 8.5 s | 6 s |
   | Build | 16 s | 9-10 s (x350, ramps of 1.5 s or longer) |

   Cut the static 537-544 hold. The Break hold (486.6-511) is 24.7 s on one readout. Trim it to about 14 s, and add a
   second readout at about 495 (the remaining stored energy, the aft section's spin rate).
6. **550-562.5 · P2 · The rod line must read as mass production** (pc_duel_magazine.js / strike_orbit.js).
   - Six stations, each holding a rod at a different stage, indexing one station every 1.5 s (x20): the press
     closing, the sinter glow ramping, the forge hammer, the lathe turning chips, inspect, the sabot.
   - A lime scan pass labelling each station (PRESS · SINTER 2 600 K · FORGE · TURN · INSPECT · SABOT), each tag held
     2.5 s or longer. This is the user's favourite effect.
   - Then the arm lifts the finished round.
7. **630.5-641 · P2 · Surface clutter and artefacts** (strike_sea_fx.js).
   - The debris is flat grey cards: make it dot-sampled plates.
   - The rod's entry trail is a straight, constant, about 60 m wide dotted slab across the upper right, for 10 s:
     taper it to a few metres and fade it over 3-5 s of real time.
   - The column readout toggles RISING / FALLING BACK every 0.1 s at the apex (635.8-636.8). Add hysteresis (switch
     once, when the height falls 2 m or more below its peak).
8. **601.6-607.4 · P2 · True time label in the cut.** The depth runs 0.4 -> 11.4 m in 5.6 s of film at 4.85 km/s,
   which is x0.0004, but the label says x0.001. Either run x0.001 (2.3 s for the 11 m) or show x0.0004.
   Also hold 2ND / 3RD DECK and INNER BOTTOM for at least 2 s each (now 1.8, 1.6 and 0.6 s).
9. **581.5-582.0 · P2 · Muzzle petals are grey solid quads** filling a third of the frame (s_129). Draw them as
   dot-sampled petals, as at 582.5-583.
10. **589.4-591.6 · P2 · Fall seams.**
    - The shell's hard dotted edge is still there: feather it over 2-5 km.
    - The altitude ladder doubles during the world switch ("50 KM" twice, overlapping, at 589.5-590). Fade it across
      the switch, and anchor the current tick to the nose.
    - The rod's coral tag (585-588) is tiny and dim: full alpha, held 2.5 s.
11. **532-541 · P2 · Coral and lime arrowheads around the ring** read as debug velocity vectors (s_114/115). If these
    are ring segments flying off, draw them as dot debris with no arrow glyphs.
    At 511.1, the hand-over between worlds also pops in this lime and coral streak debris. Fade it in over 1 s.
12. **451.9-452.4 · P3 · The last whip.** 50 deg/s with fov 14 deg/s. Ease to 25 deg/s or less over 1.5 s.
13. **614-630.5 · P3 · Underwater length.** It is 16.5 s, with 622-627 slow and dim. Trim 3 s, and add sparse backscatter
    dots for parallax (r1 D4).
14. **640.7-646.7 · P3 · The "Bubbles" chapter is shot from above the water.** Show the cloud breaking the surface
    as boiling whitewater around the halves, or rename the chapter.
15. **655.6-664.7 · P3 · The end is a 9 s static hold** (mean 0.058). Add a slow push of 120 -> 95 m, or a 5 s hold.
    Small grey solid shapes are still in the foreground (652-655).
16. **P3 · Carried over from r1.**
    - The hostile rings are still lime (C13).
    - Vignette dither (C12).
    - Entry drag: a loss of about 20 m/s, not 560 (D12). Or say ABLATING.
    - The camlog's lime fraction reads 0.000 with lime rings on screen (C15).
    - BUS 0.15 TJ in the readout vs "70 GJ" on the BUS tag (the readout includes the hull bursts): name it.

## 6. Sound (whole film), fixes against tools/sound_lab

Measured, mix level in dB:

| moment | before | max short-term (0.4 s) | bands at onset (<100 / 100-500 / 2-6k / >6k, dB rel.) |
|---|---|---|---|
| shot 447.5 | -28 | -10.4 | -2 / -5 / -15 / -23 |
| orbital hit 475.05 | -53 | **-7.9** | 0 / -16 / **-42** / -57 |
| orbital shot 581.68 | -32 | **-7.8** | 0 / -12 / **-41** / -56 |
| destroyer strike 601.58 | music swell -11.2 at 600.7; hole -75 at 601.2-601.4 | **-10.8** | -1 / -8 / -24 / -31 |
| magazine chain 606.8-614 | -12..-18 | -12.0 | -1 / -7 / -15 / -23 |

Other measurements:
- The space act's music has under 1.5 % of its energy above 2 kHz.
- In the Fall and Terminal, the music runs louder than the foley: at 598.5-601 it is -11..-17 dB, against an impacts
  stem fading -12 -> -45.
- After the strike, the mix sits at -11..-18 dB for 20 s with 5-9 onsets per second (a wall).
- 655-664.4: -20..-24 dB, then cut in 0.3 s.

Fixes, most important first:

S1. **598-602 · P1 · Make the climax the loudest moment of the film** (pc_duel_score.py §8, pc_duel.py
   fall_and_strike / strike_sound).
   - The strike's -10.8 dB is 3 dB under the orbital hit, and only about 0.5 dB over the music swell before it.
   - Cap the §8 build so its last 3 s sit at -18 dB or lower: `build(..., gain=-6.0)` -> -10, plus an automation dip
     from ts-3.0.
   - Lift the strike composite by 3 dB, and drop the chain's blasts by 3 dB (`db = -10.0 - ...` -> -13).
   - Add a bright 2-6 kHz layer, so the climax has a crack the orbital thuds lack: the falcon9 crack at -6 -> -2, plus
     a howitzer report (hp 800) at -6.
   - Target: max short-term -6.5 dB or louder at 601.6, and at least 4 dB above every other moment.
   - The 0.3 s digital-zero hole is fine: keep it.
S2. **607.8-614.2 · P1 · Magazines 2-9 are silent.** Only `magazine_chain` (606.78) sounds, and `secondary_blasts`
   (614.14) starts a chain after the picture's chain is over.
   - Emit one cue per magazine from strike_sea.js at the readout increments: magazine_1..9 at 607.8, 608.9, 609.6,
     610.4, 611.1, 612.0, 612.7, 613.5, 614.2. blast_cues() already voices every `magazine*`.
   - Make them escalate (size 0.9 -> 1.3, the last one biggest), and drop the secondary_blasts chain, or move it under
     lens_under as muffled shocks.
S3. **478-487 and 486.6-511 · P1 · The orbital ship's energy release and V-break are silent, with rebuild clanks
   under the break.**
   - Cause: space_and_orbit() starts the rebuild's run at the earliest of (ring_crack, rings_split, barrel_build), and
     ring_crack is now 485.55, inside the release. So the `electric_motor_2` bed and the metal_shed_door_hits clanks
     (every 2.4-3 s: peaks at 489, 491, 499, 501, 508) play under the breaking ship.
   - Start the rebuild at `rings_split` (or the Rings chapter, 511.1).
   - Voice burst_0..9 (481.84-486.37) as through-hull thumps sized by GJ (10-50 GJ: -16..-6 dB).
   - Voice hull_break 486.57: a long torn-steel wrench (steel_girders_tear_creak + metallic_groan, slowed 0.6, -8 dB
     through the hull) with a low sub swell.
   - Voice furrow_end 478.19: the tearing stops on a wrench.
   - Note that `T.cue('hull_break', ts - 0.1)` in fall_and_strike / strike_chain must keep reading the destroyer's
     (627.86), not this one.
S4. **475 / 581.7 · P2 · The orbital events are sub-bass only** (0 dB under 100 Hz, -41 dB at 2-6 kHz). They vanish on
   phones and laptops.
   - Keep them "felt", but add a through-structure metallic body: S.through_hull with lp 900 -> 2500 on one
     metal_shed_door_hits / steel_girders layer at -12, and a 300-800 Hz groan.
   - The orbital shot's coil stages at 579-581.5: the picture's most intense coil flashes play in a 2.5 s hole
     (-32 dB, flagged "busy picture, quiet sound"). Add through-hull thumps per coil flash, accelerating, then the
     0.3 s hole, then the shot.
S5. **Unvoiced cues** (each with real recordings already in the library):

    | cue | time | what to play |
    |---|---|---|
    | fab_line | 552.66 | a hydraulic press, `hydraulic_ramp_motors` + a heavy clank |
    | rod_lift | 556.56 | the arm, `electric_actuator_load` |
    | rod_load | 559.56 | a slide, `overhead_crane_factory` |
    | round_seated | 562.46 | a deep lock clunk plus lock-ring clanks, -10 |
    | deck_breach | 602.38 | a torn-plate shriek (metal_shed_door_hits hp 800, slowed 0.5), and one per deck readout (601.6, 603.8, 605.6, 607.2) |
    | mount_thrown | 614.09 | a heavy metal wrench |
    | lens_under | 615.83 | a plunge: water_splashes lp 1200, 0.4 s |
    | rod_gone | 621.34 | a muffled vapour burst plus a crackle |
    | lens_up | 630.50 | breaking the surface: splash-out, air |
    | column_rise | 631.04 | a rising water roar; plus heavy rain / waterfall at the fall-back from 636 |
    | mount_splash | 638.23 | a big splash, -12 |
    | cook_off | 642.30 | a mid blast, size 0.7, dist 300 |
    | bow_under | 654.26 | an air-venting roar plus foam (air_pressure_release lp 2 k + waves), -14 |
    | stern_under | 655.56 | the same, smaller, then quiet |
S6. **640.7-646 · P2 · The bubbles_rise cue plays under-water sound while the lens is above the water** (the water
   stem's centroid is 400 Hz). In fall_and_strike, play it only if `under(t)`. Above the water, voice the cloud breaking
   as boiling whitewater (boiling_water unmuffled plus waves).
S7. **Underwater and surface · P2 · Replace F.bubbles** (sine chirps; still at lens_under -31, bubbles_rise -27,
   sinking -32, surface -36) with a real hydrophone bubbling recording (CC0), as r1 S8 asked. The 8.6 onsets per second
   under water are a synthetic risk.
S8. **655-664.7 · P2 · The end is cut** (-22 dB, then 0.3 s to silence). Let the theme's last note ring 4-6 s. Fade the
   fire and ambience beds to the opening's sea bed (-30 to -36 dB) over the last 4 s, so the loop and the YouTube end
   are clean.
S9. **452-598 · P2 · The space act is dark.** Mix centroid 100-330 Hz, under 1.5 % above 2 kHz. In
   pc_duel_score.py §6b/§7, give the piano and the strings some air: the m_* buses' high shelf +2 -> +4 dB at 5 kHz,
   with violins in the §7 ostinato.
S10. **Mastering · P3.** Limiter max 9.4 dB (S9 r1). Lower the beds 2 dB and the music 2 dB, and bring the gain down,
   so the strike keeps its crest.

## 7. Top 5

1. **Picture 1: make the destroyer strike massive.** A fat plasma head; magazine fireballs growing at the front speed;
   plates pushed out; a 10-15 m crater; a visible keel crack (strike_sea_fx.js / runXB).
2. **Sound S1 + S2: make the climax the loudest moment.** Cap the music swell, lift the strike with a real crack, and
   give magazines 1-9 their own cues (pc_duel_score.py §8, pc_duel.py, strike_sea.js cues).
3. **Picture 2 + sound S3: the orbital hit's comet fan, light shafts and plates.** Voice the energy release and the
   V-break, and move the rebuild clanks off the break (intercept_dmg.js; pc_duel.py space_and_orbit).
4. **Picture 3 + 4: the 5 s black Coast, and the bore-ride / hull-entry wire spaghetti** (intercept_act.js,
   strike_orbit.js / pc_duel_shot.js).
5. **Picture 5 + 6: tighten the rebuild from 39 to about 24 s, and make the rod line read as mass production** with a
   lime scan of six working stations (strike_orbit.js, pc_duel_magazine.js).
