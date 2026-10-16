# Sound lab

Sound effects and music made by code, for the films and the game, from real field recordings (CC0, in
`reference/sounds/refs/`, see its `MANIFEST.md`) and from synthesis. numpy, scipy and soundfile; no plugins, no network.
Every sound is a function of plain parameters plus a seed, so it renders the same every time, just like the films.

```
python tools/sound_make.py list                                   # every recipe and its parameters
python tools/sound_make.py sfx explosion size=1.4 distance=0.3 -o boom.wav
python tools/sound_make.py music cinematic --dur 90 --hits 24.5,61 -o cue.wav --stems
python tools/sound_make.py auto reference/films/renders/<film>_1440p60.mp4 --start 470 --end 530 --render -o work/score.json
python tools/sound_make.py score work/score.json                  # after editing the score
python tools/sound_lab/examples.py                                # example set -> reference/sounds/index.html
```

## Parts

| File | What |
|---|---|
| `dsp.py` | building blocks: PolyBLEP saw/square, sine/tri, supersaw, FM, noise colours, crackle, ADSR and breakpoint envelopes, static and swept biquads, drive/fold/crush, delay, convolution reverb (three-band decay, early reflections), chorus, doppler `flyby`, modal resonators, Karplus-Strong, granular clouds, pan/width, compressor, sidechain `duck`, lookahead limiter, LUFS, 24-bit WAV |
| `sfx.py` | recipes (`RECIPES`): explosion, impact, trailer_hit, sub_drop, thunder, railgun_charge, railgun_fire, scan_sweep (the lime lightning scan), lock_on, ui_blip, data_stream, sonar_ping, alarm, whoosh, flyby_jet, missile_launch, servo, clunk, electric_arc, reactor_hum, braam, riser, splash, tick |
| `music.py` | instruments (kick, snare, clap, hat, taiko, sub, reese, pluck, keys, bell, pad, strings, lead, drone), keys/scales/roman-numeral chords, `Song` (beat grid, drum patterns `'x...x...'`, progressions, bass, arps, generated melody, per-track gain/reverb send/ducking, mastering), and `compose(style, seconds, hits=[...])` for whole cues. Styles: cinematic, synthwave, dark_ambient, hybrid_trailer |
| `score.py` | JSON scores (timed events, looping beds, a music cue, master) rendered to `mix.wav` + `stems/` + `with_sound.mp4`; `auto_score(analysis)` writes a first score from `tools/audio_analyze.py` output |
| `examples.py` | the example set and listening page |
| `foley.py` | realistic foley from physical models, no beeps: struck steel (plate modes), latches, breakers, motors and gearboxes, servos, hydraulics, gear trains, rotors spinning up, a gas turbine starting, magnets energising, corona, bubbles (Minnaert), water, a pipe filling, boiling, steam, splashes, the sea, wind, room tones, under water, whooshes, frost and ice, a cryocooler, laser machining, N-waves, thunder, the railgun's report, a slow-motion shatter; convolution spaces (`space_ir`: engine, room, deck, sky, water, hall, plate, epic) |
| `synth.py` | the score's instruments: a pulse bass, sub, analog pad, synth strings and spiccato, Zimmer brass, a formant choir, an FM electric piano, a glass bell, an arp pluck, a legato lead; kick, taiko, toms, snare, hats, shaker, clock tick, cymbals and swells; hits, risers, sub drops, braams; chord names and voicings (`voicing('Bbmaj7', 52, 70)`) |
| `styles.py` | club and internet styles: hardstyle kick (punch and distorted pitched tail), reverse bass, frenchcore kick (tuned, for kick melodies), hard-techno rumble kick, supersaw anthem lead, screech, phonk cowbell, 808 with glides, 303 acid (accent, slide), clap, rage lead, trap hat rolls; `grid(bpm, anchor)` puts bar lines on a film moment |
| `railgun.py` | the railgun kit, part by part: the charge (chargers' whine stepping up per bank, transformer hum, bank arming, arcs, interlock) and the shot (bank dump, breech zap, armature zip rising up the barrel, blast, bow-shock crack, rail ring, plasma, echoes off the sea, roll); `PARTS_DB` levels and `SHOT_OFFS` timing were set so each part has its own clear moment and band (measured with `audio_analyzer/layers.py`) |
| `soundtracks/railgun_solos.py` | every railgun part solo, the shot built layer by layer, the charge-to-tail sequence without music, and an analysis page → `renders/pc_scan_railgun_sound/solos/` |
| `data/impacts/` | measured fingerprints of real shots, cannons, discharges and lightning (`tools/audio_impact.py`), used by `foley.resynth` / `railgun_blast` / `discharge` / `arcs`; `profiles.json` holds their numbers |
| `soundtracks/<film>.py` | a film's whole soundtrack: the score (a tempo map whose bars fall on the chapter changes), the foley timeline from the film's cues, the ambience beds, the mix and the master (YouTube: -15 LUFS, -1.2 dBTP), the mux onto a render. `pc_scan_railgun.py` is the first |

## Scoring a film

1. Render the film (`tools/render_film.py`). Its `.markers.json` comes along with it.
2. Run `python tools/sound_make.py auto <render> [--start --end] -o work/<film>_score.json`. This analyses the
   picture and places sounds:
   - flashes become explosions or impacts sized by brightness;
   - lime scans become `scan_sweep` with the scan's length;
   - coral becomes `lock_on`;
   - camera moves become whooshes peaking at the move's peak;
   - motion inside the frame becomes servos;
   - chapters get data blips;
   - a reactor bed runs underneath;
   - music lands its hits on the biggest flashes.

   Each event carries a `why`.
3. Edit the JSON: change recipes, levels, params and times, or add events. Re-render with
   `sound_make.py score`. Check the result with `tools/audio_analyze.py` on `with_sound.mp4`: its "visual events
   without sound" list should shrink.
4. For the final film, put the cues into the film itself (`FILM.cue` in the film's JS) or mux the mix onto the
   1440p render (`score.video` = the render, no `video_height`, so the video is stream-copied when
   `video_start` is 0).

## A film's full soundtrack

```
python tools/render_film.py pc_scan_railgun --res 2160 --crf 12 --no-audio        # the picture, silent, 4K (YouTube's high-bitrate tier)
python tools/sound_lab/soundtracks/pc_scan_railgun.py --video reference/films/renders/pc_scan_railgun_2160p60.mp4
python tools/sound_lab/soundtracks/pc_scan_railgun.py --from 465 --to 545 --remix  # a part, re-mastered from the cached stems
```

The script writes `mix.wav`, `music.wav`, `foley.wav` and `stems.npz` (the cached stems) to
`reference/films/renders/<film>_sound/`. With `--video` it also writes `<render>_sound.mp4` (the video stream
copied, AAC 384 kbps). Times come from the render's `markers.json` (chapters + the film's cues); the film's own synth
cues are not used. `--remix` only redoes the level automation (`MUSIC_DB`, `FOLEY_DB`) and the master.

`--style [N ...]` renders the climax (451.5-541.5) in five music styles (`soundtracks/pc_scan_railgun_style.py`:
hardstyle, phonk, frenchcore, hard techno, rage), all with the measured charge, discharge and shot (`foley.railgun_blast`,
`discharge`, `arcs`: fresh noise shaped to the fingerprints of real recordings, plus a pitch-dropping thump), into
`<film>_sound/style/`. A style balances its own buses (`bus_lufs`) and ducks them under its kick (`sidechain`).

`--fire [N ...]` renders variants of the charge and the shot (`soundtracks/pc_scan_railgun_fire.py`: capacitor bank,
heartbeat, storm, coilgun, trailer) as 40 s clips (30 s before the shot to 10 s after) into `<film>_sound/fire/`,
muxed onto a 1080p cut of that stretch when `--video` is given. A variant replaces the draft's charge-and-shot foley,
can drop and add score events (`Score.drop`), and overrides the level curves (and can muffle the whole mix) inside the
window. A part (`--from/--to`, the variants) uses the whole film's bus gains (`BUS_GAIN`) and `MASTER_GAIN`, so it
sounds as it does in the film.

## Separating sounds

`python tools/audio_separate.py <file> [-m hpss,nmf,bands,events,demucs | all] [--start --end]` writes these to
`<file>_separation/`:
- tonal / transient / noise layers;
- 4 bands;
- K NMF components, each named by what it sounds like;
- Demucs stems (drums / bass / other / vocals; CPU, neural);
- every detected sound cut into its own clip and grouped into families of similar sounds.

It also writes `separation.json` and an `index.html` to listen. Use it to study a reference sound (split it into
layers, then rebuild each layer with recipes) or to pull one sound out of a mix.

## Sample layers (real recordings first)

The user asked for soundtracks on real recordings (2026-10-16). These modules make the refs first-class:

| File | What |
|---|---|
| `samples.py` | the layer engine: `load` / `find` (any unique part of a ref's path; decoded once to 48 kHz stereo, cached in `refs/_cache/`), `analyse` (10 ms envelope, onsets, cached), `seg`, `hit` / `hits` (the N-th strongest strike, cut to its decay), `steady` (the steadiest stretch), `bed` (a loop-free bed: random chunks, long equal-power crossfades), `loop`, `granular` (a smooth smear of any texture), `vari` (tape varispeed with a rate curve: spin-ups, run-downs), `stretch` (phase vocoder, peak-locked), `shift`, `eq`, `fir_curve`, `distance` (1/r, ISO 9613 air absorption, ground dip, travel delay), `space` (convolution: engine_room, power_room, compartment, hangar, deck, open_sea, sky, water, hull), `underwater`, `through_hull` (structure-borne), `dewhistle` (pulls gliding whistles, whines and relay buzz out frame by frame), `detone`, `level` (active RMS), `stack` + `punch` (a big composite saturated as a whole: shots, blasts) |
| `mixer.py` | `Mixer` (buses with filters and reverb sends convolved once per space, lazy events rendered only inside the window, level automation, ducking one bus under others, per-event stats), `lufs` (BS.1770-4 integrated, short-term, LRA), `true_peak` (4x), `limiter` (true-peak brickwall, iterated until under the ceiling), `glue`, `master` (to -14 LUFS, <= -1 dBTP), `write_wav`, `mux` |
| `timeline.py` | a film's timing from its render's `markers.json`: story beats matched to chapter titles in order (longest common subsequence, so repeated titles land on the right beat and a missing one does not derail the rest), named cues (`fire`, `hit_orbital`, `snd:servo:2.5` ...) as exact moments, the kit's old synth cues (`clunk`, `clack`, `whirr`, tone sweeps, noise) read as mechanical events; `report()` lists what it could not place. `FilmLog` reads the film page's camera log (`camlog.json`) for the on-screen time rate (`x8`, `x0.003`) and the lens height (under the water below 0), used only when its chapters match the render's |
| `sampler.py` | real recorded instruments (VSCO 2 Community Edition, CC0, in `reference/sounds/instruments/vsco2ce/`, fetched by `fetch_vsco.py`) through their own `.sfz` maps: `inst('CelloEnsSpic').note(m, vel, dur, seed)` (multi-sample repitched by polyphase resampling, the two velocity layers either side crossfaded, round robins from the map's seq groups plus a few cents and ms of scatter, the recording's own decay for short articulations, a release for sustains, long notes looped on their steady middle), `.swell(m, dur, [(t, vel)])` (a held note whose layers and level follow a dynamics curve), `.legato([(t, m, dur, vel)])` (joined notes: the next enters past its attack with a crossfade and a short slide), `kit('giant_drum' / 'bass_drum' / 'cymbal_roll' ...).hit(vel, seed)` (the unmapped VSCO 1 percussion by file name); every sample levelled by its active RMS (peak held within `CREST` dB), velocity then sets the level |
| `fetch_vsco.py` | downloads the instruments the scores use from the official VSCO 2 CE repository (samples, `.sfz` maps and text files only; the LICENSE checked to be CC0 first; resumable) |
| `orchestra.py` | (superseded by `sampler.py` for scores: synthesized, it reads as synthetic) acoustic-style score instruments: `felt_piano` (inharmonic partials, three detuned strings, felt hammer), `section` (a string section of bowed voices with body resonances, seated violins left / celli right), `tremolo`, `low_brass`, `timpani` + `timp_roll`, `bass_drum` |
| `inventory.py` | the refs listed with length, level, onsets, and how tonal (beep-like) each is (`sound_make.py refs`) |
| `mixcheck.py` | a listen-check by numbers of a soundtrack folder: loudness, true peak, clipping, each stem per window, tonal lines (beeps) left in the foley |

```
python tools/sound_make.py refs [filter]                                     # what is in the refs
python tools/sound_make.py layer metal_shed_door_hits --hit 3 --semis -5 --dist 200 --space open_sea -o clank.wav
python tools/sound_make.py layer ferry_engine_room_1 --bed --dur 30 --space engine_room -o bed.wav
python tools/sound_make.py master mix.wav --lufs -14 --tp -1
python tools/sound_lab/mixcheck.py reference/films/renders/pc_duel/sound [--tag _95-185s --t0 95]
```

Lessons: normalise each recording by its active RMS and hold its crest (`lv`: one stray click must not set a
layer's level); pass whistling sources (a dewar valve, relay coils, transformer harmonics, a workshop's distant
alarm) through `dewhistle`; varispeed a steady machine for spin-ups instead of synthesising them; make the shot and
the strike one saturated composite each (`stack` + `punch`) so they are the loudest moments without limiter
pumping, and cut everything at the release so the shot comes out of a held breath.

## THE DUEL: `soundtracks/pc_duel.py`

```
python tools/sound_lab/soundtracks/pc_duel.py --video <render.mp4> [--markers <json>] [--from s --to s] [--gain dB] [--debug N]
```

- Output: `<render>_sound.mp4` (whole film: video copied; a part: `<render>_sound_<a>-<b>s.mp4`, cut exactly at 1080p),
  and in `reference/films/renders/pc_duel/sound/`: `mix.wav` (24-bit, mastered), `stem_ambience / machinery / water /
  impacts / music.wav` and `foley.wav` (32-bit float, at the master gain, before the limiter), `report.json`.
- Timing: `<render>.markers.json`. Each beat (`BEATS`) is found by its named cue first, then by its chapter title;
  `PLACE` gives each beat its ambience bed (sea, engine, plant, power, cryo, deck, hangar, space, space_in, fall,
  underwater, aftermath). The run prints the beats, events and named cues it could not place or did not use.
- Named cues it keys to (FILM cues as named functions): `helium_start cold_front bank_charge contactor_close
  alternator_spinup coil_energise hpu_start director_lock radar_lock mount_train rail_charge fire sonic_boom
  sheath_fade exit_atmosphere hit_orbital fragments ring_crack rings_split barrel_build orbital_charge orbital_fire
  entry_glow rod_impact hull_break secondary_blasts water_entry cavity_collapse bubbles_rise surface sinking`.
  Chapter fallbacks: Station, Machinery, Main engines, Reduction gear, Reactor, Steam generator, Steam turbine,
  Condenser, Generator, Power run, Helium, Power room / Banks, Alternators, Coolant, Banks charge, Cryo, Coils,
  Hydraulics, Sensors / Track / Director / Radar, Lay, Magazine, Fabrication, Load, Charge, Fire, Flight, Exit /
  Coast, Strike, Debris, Orbit, Rings / Breach / Split / Build, Charge, Fire, Fall, Strike, Under / Underwater,
  Surface. Without `fire`, the shot is the kit's crack-and-rumble cue after the Fire chapter, else the chapter + 1.3 s.
- The picture's clock and lens (`film_timing`): from the film log (`--camlog`, else `<render dir>/review*/camlog.json`,
  else `reference/films/shots/camlog/<film>.json`, each used only if its chapters match): `T.rate(t)` (the on-screen
  time rate), the lens going under the water and coming up (the eye's height crossing 0 inside the underwater beat).
  Without a log: the strike's slow-down across the Terminal chapter to x0.003, the lens under 1.5 s after the
  underwater beat starts (`LENS_UNDER_AFTER`). Slow motion slows the sound (`sound_rate`: x0.05 plays at 0.43, x0.003
  at 0.22, time compression at 1): the fall's roar slows and falls away across the Terminal into a 0.38 s hole (every
  bus out), the strike's body and the blasts after it are slowed and deepened, their cracks stay at speed.
- The strike's sequence (`strike_chain`): the strike composite at `rod_impact`, a blast at `hull_break` and at every cue
  whose name starts with `magazine` or `blast`, a rolling chain of blasts from `secondary_blasts` (if that cue falls
  while the lens is under the water: deep muffled shocks there, and the chain the picture shows above the water in
  the 3 s after the impact), over a swelling rumble; debris raining after each. Each blast (`blast`) is a composite of
  real recordings (howitzer report, distant explosion crack, a huge explosion's body, a thump, steel) placed at a
  distance over the sea. The splash is at `water_entry`; the fire has its own bus, muffled with the rest under water.
- The score (`soundtracks/pc_duel_score.py`): real sampled instruments (`sampler.py`): a breathing low string pedal and
  sparse upright piano in the machinery, a spiccato ostinato (a 3+3+2 cell with its answer, hairpins per two-bar
  phrase, alternate bows, scatter; eighths with rests in the power room, sixteenths in the coils and the builds), a
  giant frame drum, timpani, horns / trombones / tuba swelling in the builds, timpani and cymbal rolls into each stop,
  the theme in the horns over the fall and on the piano at the end (landing ~5 s before the end and ringing out).
  D minor, 76 bpm, cues starting on the beats; space has no music; ducked under the foley (-10 dB) and capped
  `MUSIC_UNDER` dB under it in the machinery places (`music_under_foley`); it stops dead (its reverb too) at the
  release before the shot and at the hole before the strike.
- The master: a 300 Hz dip on the beds and the music, +2 dB above 6 kHz on the whole, -14 LUFS, -1.5 dBTP (before
  AAC); the film ends on the score's own tail (a 0.4 s guard fade).
- A part (`--from/--to`) is mastered on its own unless `--gain` gives the whole film's master gain (printed in
  `report.json`).
