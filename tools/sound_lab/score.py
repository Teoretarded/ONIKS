"""Scores: a JSON description of a soundtrack (timed sound events, looping beds, a music cue, master settings)
rendered to stems + a mastered mix, optionally put onto a video. `auto_score` writes a first score from an
audio_analyze result: sounds for the flashes, scans, lock-ons, camera moves and motion it found, a bed, and music
that lands its accents on the biggest hits. Edit the JSON, render again.

{
  "duration": 30, "video": "clip.mp4", "video_start": 470,
  "tracks": {"sfx": {"gain_db": 0}, "whoosh": {"gain_db": -6}, "bed": {"gain_db": -20}, "music": {"gain_db": -8}},
  "events": [{"t": 1.2, "sound": "explosion", "params": {"size": 1.2}, "gain_db": -2, "pan": 0.3, "track": "sfx",
              "pitch": 0}],
  "beds":   [{"sound": "reactor_hum", "start": 0, "end": 30, "params": {"base": 50}, "track": "bed", "fade": 2}],
  "music":  {"style": "cinematic", "start": 0, "end": 30, "hits": [12.5], "seed": 1, "track": "music"},
  "master": {"lufs": -14, "ceiling_db": -1, "duck_music_db": 6}
}"""
import inspect
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np

from . import dsp as D
from . import music as M
from .sfx import RECIPES


def _accepts(fn, name):
    return name in inspect.signature(fn).parameters


def _sound(name, params, cache):
    key = (name, json.dumps(params, sort_keys=True))
    if key not in cache:
        if name not in RECIPES:
            raise KeyError(f'unknown sound {name!r}; known: {", ".join(RECIPES)}')
        cache[key] = RECIPES[name](**params)
    return cache[key]


def _repitch(x, semis):
    if not semis:
        return x
    r = 2 ** (semis / 12)
    n = int(len(x) / r)
    src = np.arange(n) * r
    return np.c_[np.interp(src, np.arange(len(x)), x[:, 0]), np.interp(src, np.arange(len(x)), x[:, 1])]


def render_score(score, log=print):
    """-> (mix, stems dict, info). Times are seconds from the start of the score."""
    dur = float(score.get('duration') or 0) or max([e['t'] + 6 for e in score.get('events', [])] + [10.0])
    n = D.n_of(dur)
    tracks = {k: dict(v) for k, v in (score.get('tracks') or {}).items()}
    stems = {}
    cache = {}

    def buf(name):
        tracks.setdefault(name, {})
        if name not in stems:
            stems[name] = np.zeros((n, 2))
        return stems[name]

    for e in score.get('events', []):
        p = dict(e.get('params') or {})
        fn = RECIPES.get(e['sound'])
        if fn and 'dur' in e and _accepts(fn, 'dur'):
            p['dur'] = e['dur']
        if fn and 'seed' not in p and _accepts(fn, 'seed') and 'seed' in e:
            p['seed'] = e['seed']
        s = _repitch(_sound(e['sound'], p, cache), e.get('pitch', 0))
        if e.get('pan') is not None:
            s = D.pan(s, e['pan']) * np.sqrt(2)
        b = buf(e.get('track', 'sfx'))
        i = D.n_of(max(0.0, e['t']))
        sk = D.n_of(-e['t']) if e['t'] < 0 else 0
        k = min(len(s) - sk, n - i)
        if k > 0:
            b[i:i + k] += s[sk:sk + k] * 10 ** (e.get('gain_db', 0) / 20)
    for bd in score.get('beds', []):
        a, z = float(bd.get('start', 0)), float(bd.get('end', dur))
        fn = RECIPES[bd['sound']]
        p = dict(bd.get('params') or {})
        if _accepts(fn, 'dur'):
            p['dur'] = z - a
            s = fn(**p)
        else:
            one = fn(**p)
            reps = int(np.ceil((z - a) * D.SR / max(1, len(one)))) + 1
            s = np.concatenate([one] * reps)[:D.n_of(z - a)]
        s = D.fade(s[:D.n_of(z - a)], bd.get('fade', 1.0), bd.get('fade', 1.0))
        b = buf(bd.get('track', 'bed'))
        i = D.n_of(a)
        k = min(len(s), n - i)
        b[i:i + k] += s[:k] * 10 ** (bd.get('gain_db', 0) / 20)
    mu = score.get('music')
    info = {}
    if mu:
        a, z = float(mu.get('start', 0)), float(mu.get('end', dur))
        log(f"  music {mu.get('style', 'cinematic')} {z - a:.0f} s")
        m, _, info = M.compose(mu.get('style', 'cinematic'), z - a, mu.get('bpm'), mu.get('key'), mu.get('seed', 0),
                               [h - a for h in mu.get('hits', []) if a <= h < z], lufs=-16)
        m = D.fade(m[:D.n_of(z - a)], 0.5, mu.get('fade_out', 3.0))
        b = buf(mu.get('track', 'music'))
        i = D.n_of(a)
        k = min(len(m), n - i)
        b[i:i + k] += m[:k] * 10 ** (mu.get('gain_db', 0) / 20)
    for name, cfg in tracks.items():
        if name in stems:
            if cfg.get('reverb'):
                stems[name] = D.reverb(stems[name], cfg.get('t60', 2.0), mix=cfg['reverb'], tail=False)[:n]
            stems[name] *= 10 ** (cfg.get('gain_db', 0) / 20)
    ms = score.get('master') or {}
    md = ms.get('duck_music_db', 6)
    if md and 'music' in stems:
        key = sum(v for k, v in stems.items() if k not in ('music', 'bed'))
        if np.ndim(key) == 2:
            stems['music'] = D.duck(stems['music'], key, -abs(md), 0.01, 0.4)
    mix = sum(stems.values()) if stems else np.zeros((n, 2))
    if ms.get('lufs', -14) is None:                    # keep the event levels as written, only catch the peaks
        mix = D.limit(mix, ms.get('ceiling_db', -1))
    else:
        mix = M.master(mix, ms.get('lufs', -14), ms.get('ceiling_db', -1))
    return mix, stems, info


def mux(video, audio_wav, out, start=0.0, duration=None, copy=None, height=None, crf=16):
    """Put the mix on the video (the video's own sound is replaced). Re-encodes when cutting a part (frame exact)."""
    ff = shutil.which('ffmpeg')
    copy = (not start) if copy is None else copy
    cmd = [ff, '-nostdin', '-v', 'error', '-y']
    if start:
        cmd += ['-ss', f'{start:.3f}']
    cmd += ['-i', str(video)]
    if duration:
        cmd += ['-t', f'{duration:.3f}']
    cmd += ['-i', str(audio_wav), '-map', '0:v:0', '-map', '1:a:0']
    if height:
        copy = False
        cmd += ['-vf', f'scale=-2:{height}:flags=lanczos']
    cmd += ['-c:v', 'copy'] if copy else ['-c:v', 'libx264', '-crf', str(crf), '-preset', 'medium', '-pix_fmt', 'yuv420p']
    cmd += ['-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', str(out)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr[-600:])
    return out


def render_to(score, out_dir, score_path=None, log=print):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    mix, stems, info = render_score(score, log)
    D.write(out / 'mix.wav', mix)
    (out / 'stems').mkdir(exist_ok=True)
    for k, v in stems.items():
        D.write(out / 'stems' / f'{k}.wav', v)
    res = {'mix': 'mix.wav', 'stems': {k: f'stems/{k}.wav' for k in stems}, 'music': info,
           'lufs': D.lufs(mix), 'peak_dbfs': float(20 * np.log10(np.abs(mix).max() + 1e-12))}
    if score.get('video'):
        v = Path(score['video'])
        if not v.is_absolute() and score_path:
            v = (Path(score_path).parent / v).resolve()
        dur = float(score.get('duration') or len(mix) / D.SR)
        res['video'] = mux(v, out / 'mix.wav', out / 'with_sound.mp4', float(score.get('video_start', 0)), dur,
                           height=score.get('video_height'), crf=score.get('video_crf', 16)).name
        log(f"  video -> {out / 'with_sound.mp4'}")
    (out / 'render.json').write_text(json.dumps(res, indent=1, default=float), encoding='utf-8')
    return res


# ---------------------------------------------------------------- auto score from an analysis

def auto_score(analysis, style='cinematic', music=True, bed='reactor_hum', start=0.0, end=None, seed=0, max_hits=6):
    """First-pass score from audio_analyze's analysis.json (dict). Visual events become sounds; the strongest
    flashes become the music's hit points. Times in the score are relative to `start`."""
    dur_all = analysis['duration_s']
    end = min(end or dur_all, dur_all)
    dur = end - start
    ev = (analysis.get('video') or {}).get('events') or {}
    inr = lambda t: start <= t < end
    out = []

    def add(t, sound, params=None, gain_db=0.0, pan=None, track='sfx', why=''):
        out.append({'t': round(t - start, 3), 'sound': sound, 'params': params or {}, 'gain_db': round(gain_db, 1),
                    'pan': pan, 'track': track, 'why': why})

    flashes = sorted([f for f in ev.get('flashes', []) if inr(f['start_s'])], key=lambda f: f['start_s'])
    last = -9
    for i, f in enumerate(flashes):
        if f['start_s'] - last < 0.25:
            continue
        last = f['start_s']
        st = f['strength']
        if st >= 3:
            add(f['start_s'], 'explosion', {'size': round(float(np.clip(st / 6, 0.4, 1.6)), 2), 'seed': i},
                gain_db=-2 + min(2, st / 10), why=f"flash x{st} at {f['start_s']} s")
        else:
            add(f['start_s'], 'impact', {'weight': round(float(np.clip(st / 3, 0.3, 1)), 2), 'seed': i}, gain_db=-8,
                why=f"small flash x{st}")
    for i, e in enumerate(x for x in ev.get('lime', []) if inr(x['start_s'])):
        add(e['start_s'], 'scan_sweep', {'dur': round(float(np.clip(e['dur_s'], 0.8, 4.0)), 2), 'seed': i,
                                         'direction': 1.0 if i % 2 == 0 else -1.0}, gain_db=-12 - 4 * float(e['dur_s'] < 1.0), why=f"lime on screen {e['dur_s']} s")
    for i, e in enumerate(x for x in ev.get('coral', []) if inr(x['start_s'])):
        add(e['start_s'], 'lock_on', {'seed': i}, gain_db=-10, why='coral (hostile) appears')
    for i, e in enumerate(x for x in ev.get('yellow', []) if inr(x['start_s'])):
        add(e['start_s'], 'ui_blip', {'kind': 'confirm'}, gain_db=-14, why='yellow accent appears')
    for i, e in enumerate(x for x in ev.get('camera_moves', []) if inr(x['start_s'])):
        if e['peak_speed'] < 0.25:
            continue
        lead = max(0.25, e['peak_s'] - e['start_s'])
        d = float(np.clip(lead / 0.62, 0.5, 3.0))
        side = {'right': -1, 'left': 1}.get(e['image_moves'].split('-')[-1], 0.6)
        add(e['peak_s'] - 0.62 * d, 'whoosh', {'dur': round(d, 2), 'bright': round(float(np.clip(e['peak_speed'] / 2, 0.2, 1)), 2),
                                             'heavy': 0.3, 'seed': i, 'direction': side},
            gain_db=-16 + 8 * float(np.clip(e['peak_speed'] / 2, 0, 1)), track='whoosh',
            why=f"camera move {e['peak_speed']} widths/s, image moves {e['image_moves']}")
    for i, e in enumerate(x for x in ev.get('motion_bursts', []) if inr(x['start_s'])):
        add(e['start_s'], 'servo', {'dur': round(float(np.clip(e['dur_s'], 0.5, 3.0)), 2), 'seed': i}, gain_db=-18,
            track='mech', why='things moving inside the frame')
    for i, c in enumerate(x for x in ev.get('cuts', []) if inr(x['t_s'])):
        add(c['t_s'], 'impact', {'weight': 0.6, 'seed': 100 + i}, gain_db=-10, why='cut')
    mk = analysis.get('markers') or {}
    for c in mk.get('chapters', []):
        if inr(c['t']) and c['t'] - start > 0.5:
            add(c['t'] - 0.05, 'data_stream', {'dur': 0.6, 'seed': int(c['t'])}, gain_db=-20, track='ui', why=f"chapter {c['title']}")
    score = {'duration': round(dur, 3), 'source_analysis': analysis.get('file', {}).get('path'),
             'tracks': {'sfx': {'gain_db': 0}, 'whoosh': {'gain_db': -2}, 'mech': {'gain_db': 0}, 'ui': {'gain_db': 0},
                        'bed': {'gain_db': 0}, 'music': {'gain_db': -6}},
             'events': sorted(out, key=lambda e: e['t'])}
    if bed:
        score['beds'] = [{'sound': bed, 'start': 0, 'end': round(dur, 3), 'gain_db': -26, 'fade': 2.0, 'track': 'bed'}]
    if music:
        big = sorted(flashes, key=lambda f: -f['strength'])
        hits = []
        for f in big:
            if len(hits) >= max_hits:
                break
            if all(abs(f['start_s'] - h) > 6 for h in hits) and f['strength'] >= 3:
                hits.append(f['start_s'])
        score['music'] = {'style': style, 'start': 0, 'end': round(dur, 3), 'hits': sorted(round(h - start, 3) for h in hits),
                          'seed': seed, 'track': 'music'}
    score['master'] = {'lufs': -14, 'ceiling_db': -1, 'duck_music_db': 6}
    return score
