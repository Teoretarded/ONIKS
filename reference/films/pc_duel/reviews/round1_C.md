# pc_duel review, round 1, part C: 451-585 s

Climb, Exit, Coast, Strike (on the orbital ship), Debris, Rings, Ring, Split, Build, Charge, Fire, Fall up to the
orbit-to-sea cross-fade (582.7-584.1).
Inputs: sheets s_100..s_130 (every one read), camera.csv rows 450-586 (all analysed), flags.md, chapters.md, frames at
1280 px, and stills from the 1080p MP4 at 451.6 / 453.5 / 469 / 582.

## 1. Scores

| area | score | why |
|---|---|---|
| models | 6.6 | The orbital ship (hull plating, two stabiliser rings, guide ring, engines, truss legs), the rod with its sheath, the 18 m round with sabot petals and the construction rings are all real models. But at every distance after the hit the ship reads as undamaged. |
| detail | 6.0 | Dense hull wire, small parts and coils hold up close (517, 520, 570). Debris is a sprinkle of small specks (477, 482). The exit hole is 26 m on a 1.7 km hull, about 1 % of the frame in any wide shot. |
| rendering | 5.0 | 466.0-471.4 is a black frame (lit < 0.01). The vignette shows concentric bands on black (469-471). The Ring and Split shots and the bore ride turn into wire spaghetti (522-528, 566-573). A hard, straight dotted "atmosphere" plane cuts across the frame at 581-583. The hit flash is fine (lit 1.0 for 0.6 s, clip 0.005). |
| animation | 6.0 | The climb (sheath, drag, gravity), the ring spin-down, the split into construction rings, the bore ride at x0.05 and the sabot opening all move well. The impact is a spark with a few specks. The ship does not react: no tumble, no venting plume, nothing flies off the spinning ring. |
| camera | 4.5 | Whips at 461.1-462.3 (35-60 deg/s), 465.6-466.5 (48-68 deg/s), 470.4-471.3 (38-40 deg/s), 481.2-482.0 (33-76 deg/s, reads as a cut), 564.6-565.8 (26-34 deg/s) and 575.4-576.0 (28-42 deg/s). The target is first seen at the right edge and gone in the next frame (470.5-471.0). The fragments are out of frame from 479.6 to the end of the act. Long static holds: 497-511 (rel < 17 m/s, turn < 1 deg/s) and 538-553. The roll reaches 63 deg and holds for 17 s. |
| pacing | 4.5 | The Coast is dead air (5.4 s black). The Debris hold is 14 s on an intact-looking ship, and the Build is 15 s static and far away. Ten readouts burst through in 3.7 s at 554.5-558.3. The Fall coast at 578.5-580.5 hardly changes. |
| flow/story | 5.0 | The second shot reads (charge, bore, muzzle, fall). The rebuild is told by the HUD ("taken apart to build the barrel"), not by the picture. The damage of the hit cannot be seen after 486, so "one damage state" is true only in code. |
| labels/HUD | 6.0 | The numbers check out (see Realism) and time compression is always shown. But during Split and Build the compression jumps x10 / x339 / x17 / x160 every 0.5 s. Readouts at 554.5-558.3 last 0.3 s each. The rod tag in the Fall is too dim to read (582, 585). |
| realism | 6.6 | Checked: 19 kg at 11.5 km/s = 1.26 GJ ("1.3 GJ"). The climb loses 7.80 -> 6.86 km/s to drag by 60 km, then 6.86 -> 6.41 km/s to gravity by 380 km, as v^2 - 2gh predicts. 24.6 t at 5.00 km/s = 307 GJ, from 0.60 TJ banked. The 1016 m bore takes 0.41 s at about 1250 g. Recoil of 0.3 m/s means a 410 kt ship. These are honest numbers, but 1.3 GJ (about 300 kg TNT) is also why the hit looks small. |
| overall | **5.2** | Strong numbers and mechanisms, but the hit, its consequences and the rebuild are under-shown: the big moment of the act does not land. |

**Key questions**
- **Does the hit feel enormous?** No (about 3/10). At 240 m it is a 0.6 s white ball and a few hundred specks (475-477). By 479.6 the specks have left the frame, and the wide shot at 498 shows a ship that looks intact. Nothing reads as "parts everywhere, momentum carrying on forever".
- **Is the damage the same in every later orbital shot?** In code, yes: `strike_orbit.js setDamage` carries the intercept's `IACT.damage` (tunnel, petals, fragments, ring A's chord). On screen it cannot be checked, because no shot after 486 shows the exit hole, the path or the venting. The Rings readout says "HULL HOLED" over a clean hull (517, 520). Ring A's broken chord is only visible through its tag (498), and the ring is then taken apart, which is fine for the story.
- **Does the rebuild with the rings and the second shot read clearly?** The second shot does (charge 558-565, bore 566-574, muzzle 574, fall). The rebuild only half-reads. In the Ring shot (522-528) the rings being taken apart are lost in wire. The Split (528-538) is readable but small. The Build (538-553) is a 70 px glowing blob at the barrel tip seen from 1.8 km, so "five rings laying the barrel" cannot be seen.
- **Is the coast (466-471) dead air?** Yes. From 466.0 to 471.4 the frame is black (lit 0.00-0.01) with one coral tag and a stray rod tag. The ship is not drawn until 470.0, and it should already be 100-250 px wide at that range. Then it appears at the right edge for about 0.7 s and is whipped out of frame.

## 2. What works (keep)
- The climb: the lime rod out of the muzzle (450-451), the plasma sheath and its trail, the limb coming up (454-455), and "LEAVING THE AIR · SHEATH FADING" with honest altitude, air density and speed.
- The orbit reveal at 451.5-452.0 (s_103): the lit limb with the rod as a tiny tagged dot over Earth.
- The impact readouts: x0.05 shown, "PATH THROUGH THE HULL 270 M · TANK VENTING", "DEBRIS 644 PIECES · FASTEST 3.5 KM/S", "RING A · CHORD 10 BROKEN · WOBBLE".
- The exit close-up at 482-486: a dark torn ellipse with coral rim and the EXIT · PORT SHOULDER tag (just too short).
- The rings spinning down while the ship turns onto the destroyer (511-522): readable intent, with smooth turns of 20 deg/s or less.
- The charge (558-565): "CHARGE RINGS n/198 · TJ" climbing with "FIRE IN" counting down, and the iris opening.
- The bore ride at x0.05 (566-574): the round moving coil to coil with lime coils, true distance and energy counters. It is spectacular.
- The muzzle exit (574): the round in its petals with the plasma ball behind, and "RECOIL 0.3 M/S · THE ENGINES NULL IT". Nicely honest.
- The entry: the bow shock forming on the rod, the altitude ladder, and the cross-fade at 582.7-584.1 keeping the rod centred. The seam is clean.

## 3. Fixes (most important first)

1. **474.8-483.0 · P1 · The hit is a spark, not a catastrophe.**
   - What happens now: the flash is a 0.6 s ball (475.1-475.7). Specks spray down-left, out of frame by 479.6. The camera stays at 240 m and then whips away (481.2-482.0 at 33-76 deg/s). The ship never reacts.
   - Make it enormous with real mechanisms, not more TNT. 1.3 GJ cannot cut a 1.7 km hull in half. If the user wants "blown in half", that needs a far heavier round; ask them.
     - **Exit debris cloud:** a hypervelocity vapour and spall cone out of the port shoulder. Use 3-5k dots, half-angle 35 deg, front up to 3.5 km/s, glowing white then fading. At x0.05 it grows about 175 m per film-second, so it should fill the frame (about 700 m across) by 479. Hold x0.05 to x0.1 until 479. Pull the lens back from 240 to about 700 m during 476-480, with a turn rate of 20 deg/s or less, so the cloud stays in frame.
     - **The 270 m path:** draw it as a line of torn, glowing decks.
     - **Plates:** peel plates outward around both holes.
     - **Tank venting:** a straight plume that keeps widening (no drag).
     - **Ring A:** at 2 rpm the broken chord lets its segments fly off tangentially at R*omega. They never slow; that is the user's "momentum forever".
     - **Tumble:** give the ship a slow tumble (0.2-0.5 deg/s) from the vent thrust that persists.
   - Files: proto/intercept_dmg.js (cloud, plates, ring break, tumble), proto/intercept_orbit.js / intercept_act.js (time ramp, lens).
2. **479.6-511.0 · P1 · The debris is never in frame, and the Debris chapter is 14 s of nearly nothing.**
   - What happens now: camera.csv lists "fragments" as out of frame on every row from 479.6 to 586. From 497 to 511 the shot is a static wide view (rel 0-17 m/s, turn < 1 deg/s, s_110-s_113) of a ship that looks whole.
   - What to do:
     - Frame the debris field rather than the hull.
     - Use 2k or more pieces with a size spread: 3-5 m plates, thousands of 0.1-0.5 m dots.
     - Run 483-490 at x0.1-0.2 so the pieces visibly travel straight lines, with faint straight trails on the big plates.
     - Replace the 497-511 hold with a slow orbit (8 deg/s or less) that passes the exit hole within 80 m (EXT tag held for at least 2.5 s), then pulls out to about 1 km to show the debris fan streaming away from the ship.
   - Files: proto/intercept_orbit.js, intercept_act.js, intercept_dmg.js.
3. **486-575 · P1 · The damage is not visible in any later orbital shot.**
   - What happens now: it is carried in code (`strike_orbit.js setDamage`, `damageTags` only while t < 53) but not on screen. 498 wide: no hole, no vent. 517 and 520 close: the readout says "HULL HOLED" over a clean hull. 533-575: nothing.
   - What to do:
     - Add a scar that reads from 0.5-2 km: a 60-100 m dark, scorched zone (missing or dimmed dots) around the exit, peeled plates, the vent plume, and the torn path.
     - Keep a sparse field of slow fragments (constant velocity, the same ones as in fix 2) drifting near the ship in Rings, Ring, Split, Build and Charge.
     - Route the Rings camera (511-522) past the port shoulder once, with the EXT tag held at least 2.5 s.
   - Files: proto/strike_orbit.js, intercept_dmg.js (fragPose already exists).
4. **465.3-471.4 · P1 · Coast is dead air plus two whips.**
   - What happens now: black from 466.0 to 471.4 (lit 0.00-0.01, s_103/s_104). Turns of 48-68 deg/s at 465.6-466.5 and 38-40 deg/s at 470.4-471.3. The target shows only at the right edge at 470.5 (f_0470500) and is gone at 471.0.
   - What to do:
     - From about 466, keep the rod (or the limb) and the orbital ship both in frame at x8.
     - Draw the ship at range; no culling. At 20-35 km it should be 100-250 px, growing from a dot at frame centre.
     - Cap turns at 20 deg/s.
     - Centre the ship by 470 and hold 2 s before contact.
     - If nothing new can be shown, cut the coast to 3 s.
   - Files: proto/intercept_act.js / intercept_orbit.js.
5. **533-558.3 · P1 · HUD timing.**
   - What happens now: the time compression jumps x6.3 -> x28 -> x53 ... x140 -> x10 -> x23 -> x208 -> x17 -> x160 -> x339 -> x35 -> x85 -> x14 within seconds. At 554.5-558.3, ten readouts in 3.7 s (ALIGNMENT, BORE STRAIGHT, SWITCHES, BAY 4 FLAPS, MAGNETS, CASSETTES, BREECH, CHAMBERED, CLAMPS, COILS) show for 0.3 s each.
   - What to do:
     - Smooth the build clock to one steady rate (for example x60 for the barrel, x20 for the collars), with ramps of 1.5 s or more.
     - Show the compression rounded to 2 significant figures.
     - Merge the pre-fire checks into 3 readouts held at least 2.5 s each, or give that stretch about 10 s.
   - File: proto/strike_orbit.js (RO lines).
6. **538.1-553.0 · P2 · The Build is too far and too static to show the build.**
   - What happens now: the camera is at 1.8 km for 15 s (rel 0-26 m/s). The barrel is a thin line and the five construction rings are one glowing lime blob (f_0546000, about 70 px). The lime is clipped near white.
   - What to do: open at about 350 m on the barrel tip for 6-8 s, showing one ring laying a layer and a collar locking, then dolly back along the barrel to the ship (rel up to 150 m/s, turn up to 10 deg/s). Bring the tip glow down so the ring segments stay readable.
   - File: proto/strike_orbit.js.
7. **522.7-533 · P2 · Ring and Split read as wire spaghetti.**
   - What happens now: from 250-440 m every hull, truss and ring wire overlaps (s_116, s_117), and the ring being taken apart is lost.
   - What to do: dim the parts not involved to about 30 % alpha and run a lime scan pass over the ring as it opens. Start the pull-out to about 600 m before the split rather than during it: rel reaches 700 m/s at 530.5.
   - File: proto/strike_orbit.js.
8. **460.9-462.6 and 481.2-482.0 · P2 · Whips.**
   - What happens now: the climb pull-back turns at 35-60 deg/s with rel up to 3.2 km/s. The Strike to Debris move peaks at 76 deg/s and reads as a cut (s_106 8:01.0 to 8:01.5).
   - What to do: ease both to 25 deg/s or less over 2-3 s, or make the second one a deliberate slow orbit.
   - Files: proto/intercept_act.js, intercept_orbit.js.
9. **563.7-582.7 · P2 · Roll and turns around the shot.**
   - What happens now: the roll goes 0 -> 63 deg in about 2.5 s (563.7-566.2) while turning 26-34 deg/s, then holds 60-63 deg for 17 s. Turns of 28-42 deg/s at 575.4-576.0 and 19-28 deg/s at 580.8-582.6.
   - What to do: cap the roll rate at 10 deg/s and settle to 20 deg or less by 577, so the limb in the Fall isn't steep. Keep turns at 20 deg/s or less.
   - File: proto/strike_orbit.js.
10. **565.8-573.9 · P2 · Bore-ride clutter.**
    - What happens now: the whole ship's X-ray wire is drawn through the barrel (f_0570000); the round and coils compete with hundreds of hull boxes.
    - What to do: fade geometry that is not barrel within about 60 m of the lens to 20-30 %, and keep the coils, the round and the bore liner.
    - Files: proto/strike_orbit.js / pc_duel_shot.js.
11. **576-582.7 · P2 · The Fall is dim and its tag unreadable.**
    - What happens now: the rod is a faint wire 1 km away, and 578.5-580.5 barely changes (s_128). The rod tag ("TUNGSTEN · 18 M · alt · km/s") is at about 30 % alpha, unreadable at 582 and 585. A hard straight dotted plane (the atmosphere shell) slices the frame at 581-583. The ladder text is faint.
    - What to do: close to about 300 m during the x17 coast, or put the destroyer's sea and the target area in frame. Give the tag full alpha for at least 2.5 s. Feather the shell edge (fade dots by depth across 2-5 km). Raise the ladder alpha.
    - Files: proto/strike_orbit.js, strike_film.js.
12. **Whole stretch, worst on black (446-471, 576-582) · P2 · Vignette banding.**
    - What happens now: visible concentric elliptical steps (f_0469, f_0470500).
    - What to do: add 1-2 LSB of blue-noise dither to the vignette (and the grade). It will show worse in the YouTube encode.
    - Files: pc_duel_film.js / common/film.js.
13. **511-575 · P3 · Colour semantics.**
    - What happens now: the hostile ship's rings, guide ring, charge glow and bore coils are lime, the colour reserved for own units and scans; only its engines are coral.
    - What to do: render powered hostile parts white or coral, and keep lime for the scan passes and the destroyer's own HUD.
    - File: proto/strike_orbit.js.
14. **553 vs 565.8 · P3 · Barrel length.**
    - What happens now: "BARREL 1004 M OF 1004" at the build, but "ROUND 0 M OF 1016" in the bore.
    - What to do: reconcile the two figures, or label the second as breech-to-muzzle.
    - File: proto/strike_orbit.js.
15. **Tooling · P3 · The camlog has two faulty columns.**
    - What happens now: the lime and coral fractions read 0.000 in lime-heavy frames (450, 533, 546). The `tags` column still lists act 1's CTR/DMP contactor tags through 586.
    - What to do: fix both before round 2 so the numbers can be trusted.
    - Files: tools/film_review.py and the camlog in pc_duel_film.js.
