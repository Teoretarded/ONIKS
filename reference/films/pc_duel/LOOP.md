# pc_duel: the build and review loop (from 2026-10-15)

The user asked for exactly three review + improve rounds on one continuous film, then a final render.

## State

- [ ] 0. Prototypes in (power room in pc_duel/, proto/intercept, proto/strike), then upgraded to production quality
  - power room done (pc_duel_bank.js; film 537.3 s, shot at base 223.1); stills shots/pc_duel_pr*.png; known weak: frost
    close-up, lightning leader faint, the charge view dense near the lens, the sea horizon through the X-ray
  - strike done (proto/strike*, window.DSTRIKE, own:true, ORK kit, 135.3 s; renders/strike/strike_1080p30.mp4). For the
    integration: its destroyer is HD.destroyer without the railgun mount -> must be the act-1 ship (RGP parts + ship);
    at impact the hull reads as grey solid surfaces, not the act-1 dot look; its breach is its own (not intercept's
    damage) -> unify; fast pans ~70 deg/s at 75.6 and 82.7; flash greys the frame 0.4 s; bubbles read as domes
  - intercept done (proto/intercept*, window.IACT, IDMG damage model, 101.6 s, strike at 65.55 s). Weak: the coast
    58-64 s mostly black, fragments small with no close-up, torn decks only at the exit hole, ring crack small wide
- [x] 1. Integrated into one take: 649.4 s, ends on a hold. Hand-overs 450.7 (intercept), 511.1 (strike), 582.7-584.1
  (orbit -> sea cross-fade; the camlog's 646 deg/s there is the world switch, not a real turn). Known weak: turns
  >25 deg/s at 461/466/481/597 and act-1 keys 30-42 deg/s; hit flashes lift +0.15 at 475/574/592; coast 466-471 black;
  ring crack hard to read at 525; strike opening busy; tiny tracking inset; the magazine insert still builds the old
  probe circuit (doesn't fit a solid rod); banks-charge 150-160 ms/frame hq. in pc_duel_film.js (no segments; the orbital ship's damage carried into every later shot)
- [x] 2. Soundtrack (commit 5e68aac; tools/sound_lab samples/mixer/timeline/orchestra; -14 LUFS, -1 dBTP; untested on a
  real pc_duel render; a --from/--to part needs --gain from report.json): tools/sound_lab/soundtracks/pc_duel.py on real recordings (reference/sounds/refs/MANIFEST.md)
- [ ] Round 1: render, camlog, review (reviews/round1.md), fixes
- [ ] Round 2: render, camlog, review (reviews/round2.md), fixes
- [ ] Round 3: render, camlog, review (reviews/round3.md), fixes
- [ ] Final: 1440p60 hq render + soundtrack -> renders/pc_duel/

## Plan from 2026-10-16 14:10 (the user, after the usage limit reset)

The user found the strike "so bad": the ship just snaps in half. New vision (sketches: reviews/user_sketch_strike_1.png,
_2.png): the rod at ~45 deg in its plasma sheath CUTS THROUGH the destroyer (a massive torn hole amidships), the
hypervelocity flash and explosions where it meets the steel, then it reaches the railgun ammunition magazine (red band:
low along the keel from amidships forward under the mount toward the bow) and everything blows up in a chain of huge
cinematic explosions; the rod into the sea, boiling, plasma, disintegrating; the camera comes back up to the wreck.
Sequence now: finish round-1 reviews A/B -> BUILD 1 (all round-1 fixes + the new strike) -> render r2 -> REVIEW 2 ->
BUILD 2 -> render r3 -> STOP for the user's review (no third review round).

Also (14:25): the hit on the orbital ship must be far bigger, like the "manhole cover at 210,000 km/h" meme
(reviews/user_ref_hit_1..7.png): a streak ripping along the hull, a flash with a horizontal streak, a huge comet fan of
debris with light shafts, incandescent torn seams, the ship broken into a V (energy storage letting go, ~1.2 TJ),
crippled but still able to fire; then a ~10 s X-ray of its production line mass-producing tungsten rods and loading
one, instead of anything long; the ring rebuild kept but tight.

Usage (19:12): the 5-hour session limit was hit at ~15:15 with 6 Opus agents in parallel. From now on: at most 2
agents at a time, effort "high" or "medium" on new agents, lean briefs (grep/offset reads, few stills). The round-1
act-1 reviews (A, B) are dropped; round 2 reviews the whole film with 2 reviewers (act 1; acts 2-3 + sound).
Done for build 1: sea strike (new vision, 72.9 s, impact ~602), soundtrack (5e2a662). Running: orbital hit VFX,
fab glimpse + tight rebuild. Then render r2.

2026-10-16 ~20:15, the user: medium effort on build-2 agents; cut the film to ~3-4 min ("cut out the parts that
show all the models; the originals were 2:30"); ONE more build, then stop (no round-3 review). Plan: the act-1 review
r2 was stopped (act 1 mostly cut); build 2 = (E) the edit list + act-1 camera fixes in the kept parts, (V) acts 2-3
visual fixes from reviews/round2_B.md without retiming, then the FINAL picture render at 1440p60 hq, then (S) the
sound: voice the 16 new cues + round2_B's sound fixes, mixed on the final render's markers. Then stop and hand over.

FINAL (2026-10-16 21:25): build 2 done and the loop stopped for the user's review.
- reference/films/renders/pc_duel/pc_duel_1440p60_sound.mp4: 3:53, 2560x1440, 60 fps, hq, soundtrack -14.1 LUFS /
  -1.5 dBTP (limiter up to 13 dB at the climax; the strike is also soft-clipped by design). Silent picture beside it.
- Build 2: the edit list (15 stretches, 14 dissolves; ?full=1 plays the uncut 664.7 s take), act-1 camera eased,
  rate label x1/N, the strike's crater/side tearing/keel crack + magazine_1..9 cues (sound 1c1e586).
- NOT done (auto mode's safety check blocked the agent): the fat plasma head, growing magazine fireballs, the wider
  orbital comet fan with light shafts, the bore-ride clutter fade, the six-station rod-line scan.
- Earlier renders kept: pc_duel_r1_*, pc_duel_r2_*, pc_duel_1080p30_std(_sound) (the cut's preview).

## One round

1. Picture: `python tools/render_film.py pc_duel --res 1080 --fps 30 --no-audio --port 8790 --no-open` (hq; open the URL
   in a browser tab kept in front) -> reference/films/renders/pc_duel/pc_duel_1080p30.mp4 (+ .markers.json).
2. Camera log FIRST (the soundtrack reads its on-screen rates; see 3), then sound:
   `python tools/sound_lab/soundtracks/pc_duel.py --video <that mp4>` -> `<mp4>_sound.mp4` (commit 5e2a662: VSCO 2 CE
   sampler, slow motion slows the sound, strike blasts keyed to rod_impact / hull_break / magazine* / blast*).
3. Camera log: http://127.0.0.1:8770/films/pc_duel/pc_duel.html?camlog=1&hq=1 -> reference/films/shots/camlog/pc_duel.json
   (every 0.1 s: eye, target, fov, roll, chapter, HUD text, tags, frame brightness/coverage, POIs).
4. Prep: `python tools/film_review.py <sound mp4> --camlog reference/films/shots/camlog/pc_duel.json --out reference/films/renders/pc_duel/review_r<N>`
   -> frames every 0.5 s, 3x3 sheets, camera.csv (speed, turn rate, fov rate...), flags.md, chapters.md, audio/.
5. Review agent -> reference/films/pc_duel/reviews/round<N>.md: every sheet read, camera.csv read in full, the
   audio summary, then a 1-10 score per area (models, detail, rendering, animation, sound, pacing, camera, story/flow,
   realism) and overall, with a numbered fix list (time, what's wrong, what to do, file).
   Scale: 1-4 bad; 4-6 rough beta; 6-8 good, improvable; 8+ amazing.
6. Fix agents (one per file group, explicit ownership) apply the list; stills checked at ?hq=1.

## Scores

| round | overall | models | detail | rendering | animation | sound | pacing | camera | flow | realism |
|---|---|---|---|---|---|---|---|---|---|---|
| r1 C (451-585) | 5.2 | | | | | | | | | |
| r1 D (585-649 + sound) | 5.2 | | | | | 5.0 | | | | |
| r2 B (451-664.7 + sound) | 6.3 | 6.8 | 6.4 | 5.7 | 6.6 | 6.2 | 5.8 | 6.4 | 6.8 | 6.6 |

(r2 B: orbital hit 6.5 "good but not epic", destroyer strike 5.8, surface return 7. Round 1 A/B and round 2 A were
cut off by usage limits / dropped.)
