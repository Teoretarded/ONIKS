# Audio analyzer

Measures a sound file or a film render in detail, so an AI (or a person) can design sound effects and music that
fit the picture. Built from scratch on numpy + scipy + ffmpeg. There's no ML, no build step and no network.

```
python tools/audio_analyze.py reference/films/renders/pc_scan_railgun_1440p60.mp4
python tools/audio_analyze.py some.wav --start 30 --end 45          # a part only
python tools/audio_analyze.py game/shots/audio                      # a folder: every file + library.md
```

Output goes to `<file>_analysis/` next to the input, or to `-o <folder>`:

| File | What |
|---|---|
| `summary.md` | **read this first**: the brief for sound design (overview, chapters, sections, events, picture, sync gaps) |
| `analysis.json` | everything, plus 20 Hz curves for every measure |
| `timeline.csv` | one row per video frame (or every 50 ms for audio-only files) with every curve |
| `events.csv` | every sound onset, loudness swell/drop, visual event, chapter and cue, sorted by time |
| `report.html` | interactive viewer: the video/audio with spectrogram, levels, bands, pitch, onsets, picture lanes and visual events. Wheel zooms, drag pans, click seeks. It references the media by relative path, so open it through `tools/serve.py` (http://localhost:8770/films/renders/<name>_analysis/report.html) or straight from disk |
| `library.md/.csv` | (folders) one row per file: loudness, attack, decay, centroid, low share, key, pitch |

Speed on this PC (Ryzen 5 7500X3D, RX 9070 XT): the 10 min 1440p60 film takes about 75 s. The picture side is
limited by the GPU's H.264 decoder (d3d11va, about 500 fps, with analysis overlapped). Audio alone runs at about
200x real time. A folder of 31 short game sounds takes 3 s.

## What it measures

**Sound**
- Loudness to ITU-R BS.1770-4 / EBU R128: integrated, LRA, momentary and short-term curves, true peak (4x
  oversampled), sample peak, RMS, crest factor, dynamic range, clipping, DC offset, silences.
- Spectrum: one streaming STFT (2048 / hop 512 at 48 kHz, so 10.7 ms frames). It gives a 96-band mel spectrogram,
  centroid, spread, 85 % rolloff, flatness, zero-crossing rate and energy in 7 bands (sub 20-60, bass 60-250,
  low-mid, mid, high-mid, presence, air), plus a 1/3-octave long-term spectrum and resonant peaks.
- Onsets: SuperFlux on the log-mel spectrogram, picked with an adaptive threshold and masking, so the flutter
  inside a big tail doesn't count. Each onset gets its sample-accurate attack start (Hilbert envelope at 1 kHz),
  10-90 % rise, -20/-40 dB decay, peak dBFS, centroid, flatness, low/high share, dominant band, pitch, and a
  plain-language type: boom, thump, hit, tonal hit, click, crack/noise, whoosh/riser or swell.
- Pitch (batched YIN, 40-2000 Hz), key (Krumhansl), and how tonal the file is.
- Tempo candidates, a DP beat track with a confidence value, and onsets per second.
- Structure: novelty segmentation (MFCC + bands + level + brightness + density) into sections. Each section has
  its level, trend (building/fading), density, brightness, dominant band and key. Also swells (+9 dB in 3 s) and
  drops (-12 dB in 0.5 s).
- For files up to 40 s, a one-shot envelope (ADSR-like: attack, hold, decay to -6/-12/-20/-40/-60 dB, and an
  envelope curve).

**Picture** (for any file with video)
- Per frame: brightness (mean, p95, bright share), flashes, and ONIKS accent colours (lime scans, coral hostiles,
  Orbital yellow) as screen share. Also global image motion by phase correlation, which gives camera-move speed
  in frame widths per second and direction (the whoosh candidates). Plus local motion inside the frame, holds
  and cuts.

**Sound vs picture**
- The global A/V offset (cross-correlation of onset strength and visual change, with a z-score).
- Every visual event matched to the nearest sound onset, with **visual events that have no sound** listed by
  strength.
- Strong sounds with no visual cause.
- Stretches where the picture is busy and the sound is quiet.
- Tempos and phases that put the visual hits on beats, for scoring music to the cut.

## Film markers

`render_film.py` renders now also save `<name>.markers.json` next to the MP4. It holds the film's chapters and
every `FILM.cue` (time + the synth call) in video time. The analyzer picks it up on its own and adds chapters
to the summary and report. For other files, pass `--markers file.json` (`[{t, title}]` or
`{chapters: [{t, title}], cues: [[t, name]]}`).

Options: `--no-video`, `--no-html`, `--sr`, `--video-width` (default 192 px), `--cpu-decode`, `-j` (files in
parallel for folders).

## Impacts (shots, booms, discharges)

```
python tools/audio_impact.py reference/sounds/refs/*.mp3 --out reference/sounds/refs/_impacts     # find and profile
python tools/audio_impact.py my_shot.wav --ref reference/sounds/refs/railgun_bae_test.mp4 --out work/cmp
python tools/audio_impact.py film.mp4 --at 481.5 503.9                                            # given times
```

`impact.py` finds the strongest sudden onsets in a recording (a jump of at least 18 dB within 30 ms) and measures
each one the way a listener hears it:
- attack (10-90 %) and the crest of the first 50 ms;
- the umf: the 45-180 Hz share of the first 150 ms;
- the crack: the 1-8 kHz share of the first 20 ms;
- the body: 180 Hz-1 kHz over the first 300 ms;
- the tail: energy after 300 ms against before;
- the energy of 8 bands (sub, thump, punch, body, low-mid, crack, bite, air) in 6 time windows, and each band's
  T30;
- the low thump's pitch track (a cannon's or a railgun's pressure pulse drops in pitch);
- the centroid track, the stereo width;
- a fingerprint: third-octave bands x 5 ms frames, 3 s.

`--ref` compares every impact with a reference and writes plain suggestions ("raise 45-180 Hz in the first 150 ms
by 6 dB", "the tail is heavy"). `--out` writes the listening page `index.html` (each clip with a player, its
spectrogram, its band envelopes and the numbers) plus `profiles.json` and the fingerprints (`*_fp.npy`).

Measured so far (2026-10-15, CC0 / public-domain recordings in `reference/sounds/refs/`, gitignored):

| | umf | crack | body | tail | attack | T30 |
|---|---|---|---|---|---|---|
| railgun (BAE test) | -4.5 | -8.5 | -3.5 | -0.2 | 2 ms | 3.0 s |
| 155 mm howitzer | -3.5 | -13.6 | -2.7 | +4.5 | 14 ms | 4.0 s |
| tank gun | -2.0 | -14.8 | -7.6 | -4.0 | 5 ms | 4.6 s |
| rifle (Mosin) | -15.9 | -1.2 | -3.7 | -6.5 | 17 ms | 5.6 s |
| spark gap | -26.0 | -1.5 | -13.3 | +8.3 | 2 ms | 2.1 s |
| close lightning | -3.6 | -23.7 | -3.6 | +4.9 | 8 ms | 3.0 s |

A big gun is not a click and a boom: the railgun is a full-band wall of sound that holds about a second and dies
over three, with a thump falling from about 160 to 60 Hz in the first 60 ms. The fingerprints are kept (as
measurements, not audio) in `tools/sound_lab/data/impacts/` for `foley.resynth`.

## Layer audibility (can each part be heard?)

`layers.py`: give it the separate layers of a mix (stems or parts, aligned) and it says, per layer, the share of the
loud spectrogram cells where it stands out over everything else together (clear %), where it is within 10 dB (heard
%), its main band, and the times it is clearly heard. A layer at 0 % clear is masked. On 2026-10-15 this showed the
first railgun blast masking its own breech zap, crack and rail ring, and the hardstyle build masking the charge in
its last 5 s.

```
from audio_analyzer.layers import audibility, report
print(report(audibility({'blast': a, 'crack': b, 'music': m}, t0=481.0)))
```
