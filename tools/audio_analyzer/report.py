"""Writers: analysis.json (everything), summary.md (the brief an AI reads first), timeline.csv, events.csv."""
import csv
import json
from pathlib import Path

import numpy as np

from .analyze import curves


def _f(x, n=1, unit=''):
    return '–' if x is None else f'{x:.{n}f}{unit}' if isinstance(x, (int, float)) else str(x)


def tc(t):
    t = float(t)
    return f'{int(t // 60)}:{t % 60:06.3f}'


def write_json(res, out):
    p = out / 'analysis.json'
    p.write_text(json.dumps(res, separators=(',', ':'), allow_nan=False, default=_jd), encoding='utf-8')
    return p


def _jd(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if not np.isfinite(o) else float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, np.bool_):
        return bool(o)
    raise TypeError(type(o))


def write_timeline(res, arrays, out):
    dur = res['duration_s']
    step = 1.0 / arrays['video']['fps'] if 'video' in arrays else 0.05
    c = curves(arrays, step, dur)
    keys = [k for k in c if k != 't' and c[k] is not None]
    p = out / 'timeline.csv'
    with p.open('w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(['t_s', *keys])
        cols = [c[k] for k in keys]
        for i, t in enumerate(c['t']):
            w.writerow([f'{t:.4f}', *('' if not np.isfinite(col[i]) else f'{col[i]:.4g}' for col in cols)])
    return p


def all_events(res):
    ev = []
    for o in res.get('onsets', []):
        ev.append({'t': o['t'], 'source': 'audio', 'kind': o['type'], 'strength': o['strength'], 'dur_s': None,
                   'detail': f"peak {o['peak_dbfs']} dBFS, attack {o['attack_ms']} ms, decay20 {o['decay20_ms']} ms, "
                             f"centroid {o['centroid_hz']} Hz, low {o['low_share']}, band {o['dominant_band']}"
                             + (f", note {o['note']}" if o['note'] else '')})
    for s in res.get('swells', []):
        ev.append({'t': s['start_s'], 'source': 'audio', 'kind': 'swell (loudness)', 'strength': s['rise_db'],
                   'dur_s': round(s['peak_s'] - s['start_s'], 2), 'detail': f"+{s['rise_db']} dB to {s['peak_s']} s"})
    for d in res.get('drops', []):
        ev.append({'t': d['t_s'], 'source': 'audio', 'kind': 'drop (loudness)', 'strength': d['fall_db'], 'dur_s': None,
                   'detail': f"-{d['fall_db']} dB in 0.5 s"})
    if 'sync' in res:
        for e in res['sync']['visual_events']:
            ev.append({'t': e['t'], 'source': 'video', 'kind': e['kind'], 'strength': e['strength'], 'dur_s': e['dur_s'],
                       'detail': ('sound: ' + e['sound_type'] + f" ({e['nearest_onset_ms']} ms)") if e['has_sound']
                       else 'NO SOUND' + (f" (nearest onset {e['nearest_onset_ms']} ms)" if e['nearest_onset_ms'] is not None else '')})
    elif 'video' in res:
        for key, kind in (('flashes', 'flash'), ('lime', 'lime'), ('coral', 'coral'), ('yellow', 'yellow'),
                          ('motion_bursts', 'motion burst'), ('camera_moves', 'camera move'), ('cuts', 'cut')):
            for e in res['video']['events'].get(key, []):
                ev.append({'t': e.get('start_s', e.get('t_s')), 'source': 'video', 'kind': kind,
                           'strength': e.get('strength', e.get('peak_speed')), 'dur_s': e.get('dur_s'), 'detail': ''})
    for c in (res.get('markers') or {}).get('chapters', []):
        ev.append({'t': c['t'], 'source': 'marker', 'kind': 'chapter', 'strength': None, 'dur_s': None, 'detail': c['title']})
    for c in (res.get('markers') or {}).get('cues', []):
        ev.append({'t': c['t'], 'source': 'marker', 'kind': 'cue', 'strength': None, 'dur_s': None, 'detail': c['name']})
    ev.sort(key=lambda e: e['t'])
    return ev


def write_events(res, out):
    p = out / 'events.csv'
    with p.open('w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(['t_s', 'timecode', 'source', 'kind', 'strength', 'dur_s', 'detail'])
        for e in all_events(res):
            w.writerow([e['t'], tc(e['t']), e['source'], e['kind'], e['strength'], e['dur_s'], e['detail']])
    return p


def _table(rows, head):
    s = '| ' + ' | '.join(head) + ' |\n|' + '---|' * len(head) + '\n'
    return s + ''.join('| ' + ' | '.join('–' if v is None else str(v) for v in r) + ' |\n' for r in rows)


def write_summary(res, out, max_rows=400):
    f = res['file']
    L = [f"# Audio analysis · {Path(f['path']).name}", '']
    a = f.get('audio')
    v = f.get('video')
    L.append(f"- Duration {res['duration_s']} s"
             + (f" (range {res['range']['start_s']}–{res['range']['end_s'] or 'end'} s of the file)" if res['range']['start_s'] or res['range']['end_s'] else ''))
    if a:
        L.append(f"- Audio: {a['codec']}, {a['sample_rate']} Hz, {a['channels']} ch (analysed at {res['analysis']['sample_rate']} Hz, "
                 f"frames every {1000 / res['analysis']['frame_rate_hz']:.1f} ms)")
    if v:
        L.append(f"- Video: {v['codec']} {v['width']}x{v['height']} @ {v['fps']:.3g} fps")
    L.append(f"- Analysed in {res['timing_s']['total']} s ({', '.join(f'{k} {x}' for k, x in res['timing_s'].items() if k != 'total')})")
    L.append('- Files: `analysis.json` (everything + 20 Hz curves), `timeline.csv` (one row per video frame, or 20 Hz), '
             '`events.csv` (every audio/visual event and marker, time-sorted), `report.html` (interactive viewer)')
    L.append('')
    if 'loudness' in res:
        lo, lv, sp, to, rh, st = res['loudness'], res['levels'], res['spectrum'], res['tonal'], res['rhythm'], res['stereo']
        L += ['## Sound overview', '',
              f"- Loudness: integrated {_f(lo['integrated_lufs'])} LUFS, range (LRA) {_f(lo['lra_lu'])} LU, max momentary "
              f"{_f(lo['max_momentary_lufs'])}, max short-term {_f(lo['max_short_term_lufs'])}, true peak {_f(lo['true_peak_dbtp'])} dBTP "
              f"(YouTube plays at about -14 LUFS)",
              f"- Levels: RMS {_f(lv['rms_dbfs'])} dBFS, crest {_f(lv['crest_factor_db'])} dB, dynamic range (p95-p10 of frames) "
              f"{_f(lv['dynamic_range_db_p95_p10'])} dB, silent share {_f(lv['silence_share'] * 100 if lv['silence_share'] is not None else None, 0)} %, "
              f"clipped samples {lv['clipped_samples']}",
              f"- Spectrum: centroid median {_f(sp['centroid_hz_median'], 0)} Hz, 85 % rolloff {_f(sp['rolloff85_hz_median'], 0)} Hz, "
              f"flatness {_f(sp['flatness_median'], 3)} (0 = pure tone, 1 = white noise)",
              '- Energy by band: ' + ', '.join(f"{k} {x * 100:.1f} %" for k, x in sp['band_energy_share'].items() if x is not None)
              + '  (' + ', '.join(f"{k} {r[0]}-{r[1]}" for k, r in sp['band_ranges_hz'].items()) + ' Hz)',
              '- Resonant peaks: ' + (', '.join(f"{x['hz']} Hz ({x['note']}, +{x['above_db']} dB)" for x in sp['resonances']) or 'none'),
              f"- Key: {to['key']['key'] if to['key'] else '–'} (corr {to['key']['corr'] if to['key'] else '–'}, {to['key']['tonal'] if to['key'] else ''}); "
              f"voiced share {to['voiced_share']}; pitch median {to['pitch_median_note'] or '–'}, range {to['pitch_range_notes'] or '–'}",
              f"- Tempo: " + (', '.join(f"{t['bpm']} BPM (strength {t['strength']})" for t in rh['tempo_candidates']) or '–')
              + f"; beat confidence {rh['beat_confidence']}; {len(rh['beats_s'])} beats tracked",
              f"- Onsets: {len(res['onsets'])} ({rh['onsets_per_s']} /s): " + ', '.join(f'{k} {n}' for k, n in sorted(res['onset_types'].items(), key=lambda x: -x[1])),
              f"- Stereo: correlation {st['correlation_mean']}, side share {st['side_share_mean']}, L-R balance {st['balance_db_L_minus_R']} dB, "
              f"mono-safe {st['mono_compatible']}", '']
    mk = res.get('markers')
    if mk and mk['chapters']:
        L += ['## Chapters (film markers)', '']
        ch = mk['chapters']
        ons = res.get('onsets', [])
        vis = res.get('sync', {}).get('visual_events', [])
        rows = []
        for i, c in enumerate(ch):
            t1 = ch[i + 1]['t'] if i + 1 < len(ch) else res['duration_s']
            no = sum(1 for o in ons if c['t'] <= o['t'] < t1)
            nv = [e for e in vis if c['t'] <= e['t'] < t1]
            rows.append([tc(c['t']), round(t1 - c['t'], 1), c['title'], no, len(nv), sum(1 for e in nv if not e['has_sound'])])
        L += [_table(rows, ['start', 'len s', 'title', 'sound onsets', 'visual events', 'visual without sound']), '']
        if mk['cues']:
            L += [f"Sound cues placed in the film ({len(mk['cues'])}): " + ', '.join(f"{c['t']:.2f}" + (f" {c['name']}" if c['name'] else '') for c in mk['cues'][:200]), '']
    if res.get('sections'):
        L += ['## Sections (where the sound changes character)', '',
              _table([[tc(s['start_s']), tc(s['end_s']), s['character'], s['lufs_m_mean'], s['vs_integrated_lu'], s['trend_db_per_s'],
                       s['onsets_per_s'], s['centroid_hz'], s['dominant_band'], s['key']['key'] + f" ({s['key']['tonal']})" if s['key'] else '–']
                      for s in res['sections']],
                     ['start', 'end', 'character', 'LUFS-M', 'vs integ LU', 'dB/s', 'onsets/s', 'centroid Hz', 'band', 'key']), '']
    if res.get('swells') or res.get('drops') or res.get('silences'):
        L += ['## Dynamics', '',
              '- Swells (+9 dB within 3 s): ' + (', '.join(f"{s['start_s']}→{s['peak_s']} s (+{s['rise_db']})" for s in res['swells'][:80]) or 'none'),
              '- Drops (-12 dB within 0.5 s): ' + (', '.join(f"{d['t_s']} s (-{d['fall_db']})" for d in res['drops'][:80]) or 'none'),
              '- Silences (< -55 dBFS, ≥ 0.25 s): ' + (', '.join(f"{s['start_s']}–{s['end_s']}" for s in res['silences'][:80]) or 'none'), '']
    if res.get('onsets'):
        on = res['onsets']
        pick = on if len(on) <= max_rows else sorted(sorted(on, key=lambda o: -(o['strength'] or 0))[:max_rows], key=lambda o: o['t'])
        L += [f"## Sound events ({len(pick)} of {len(on)}{', strongest' if len(pick) < len(on) else ''}; all in events.csv)", '',
              _table([[tc(o['t']), o['type'], o['strength'], o['peak_dbfs'], o['attack_ms'], o['decay20_ms'], o['centroid_hz'],
                       o['low_share'], o['dominant_band'], o['note']] for o in pick],
                     ['time', 'type', 'strength', 'peak dBFS', 'attack ms', 'decay -20 dB ms', 'centroid Hz', 'low share', 'band', 'note']), '']
    if 'video' in res:
        vv = res['video']
        ev = vv['events']
        L += ['## Picture', '',
              f"- Analysed at {vv['analysis_size'][0]}x{vv['analysis_size'][1]}, {vv['frames']} frames; mean luma {vv['luma_mean']}, "
              f"camera speed mean {vv['cam_speed_mean_widths_per_s']} frame-widths/s; lime on screen in {_f(vv['lime_frames_share'] * 100, 0)} % of frames, "
              f"coral in {_f(vv['coral_frames_share'] * 100, 0)} %",
              '- Events: ' + ', '.join(f'{k} {len(x)}' for k, x in ev.items()), '']
        if ev['camera_moves']:
            cm = sorted(sorted(ev['camera_moves'], key=lambda e: -e['peak_speed'])[:150], key=lambda e: e['start_s'])
            L += ['### Camera moves (whoosh candidates; speed in frame widths per second)', '',
                  _table([[tc(e['start_s']), tc(e['peak_s']), e['dur_s'], e['peak_speed'], e['image_moves'], e['onset_accel']] for e in cm],
                         ['start', 'peak', 'dur s', 'peak speed', 'image moves', 'accel']), '']
        for key, title in (('flashes', 'Flashes (brightness jumps)'), ('lime', 'Lime on screen (scans, own units)'),
                           ('coral', 'Coral on screen (hostiles, fire)'), ('yellow', 'Yellow accent (Orbital)'),
                           ('motion_bursts', 'Motion bursts (things moving inside the frame)')):
            if ev[key]:
                e2 = sorted(sorted(ev[key], key=lambda e: -e['strength'])[:150], key=lambda e: e['start_s'])
                L += [f'### {title}', '', _table([[tc(e['start_s']), tc(e['peak_s']), e['dur_s'], e['peak'], e['strength']] for e in e2],
                                                 ['start', 'peak', 'dur s', 'peak value', 'strength (× threshold)']), '']
        if ev['holds']:
            L += ['- Still holds (camera and frame calm ≥ 1.5 s): ' + ', '.join(f"{e['start_s']}–{e['end_s']}" for e in ev['holds'][:80]), '']
    if 'sync' in res:
        sy = res['sync']
        L += ['## Sound vs picture', '',
              f"- Global offset estimate: {sy['audio_lag_ms']} ms (z {sy['z_score']}; {sy['meaning']})",
              f"- Visual events: {len(sy['visual_events'])}, without a sound onset nearby: {sy['visual_events_without_sound']}",
              '- Busy picture, quiet sound: ' + (', '.join(f"{x['start_s']}–{x['end_s']} s" for x in sy['busy_picture_quiet_sound'][:60]) or 'none'),
              '- Tempos that put the visual hits on beats: ' + (', '.join(
                  f"{g['bpm']} BPM (fit {g['fit']} vs chance {g['chance_level']}, first beat {g['first_beat_s']} s)" for g in sy['music_grid_fit']) or '–'), '']
        miss = [e for e in sy['visual_events'] if not e['has_sound']]
        if miss:
            m2 = sorted(sorted(miss, key=lambda e: -(e['strength'] or 0))[:max_rows], key=lambda e: e['t'])
            L += [f'### Visual events without sound ({len(m2)} of {len(miss)}, strongest)', '',
                  _table([[tc(e['t']), e['kind'], e['strength'], e['dur_s'], e['nearest_onset_ms']] for e in m2],
                         ['time', 'kind', 'strength', 'dur s', 'nearest onset ms']), '']
        if sy['strong_sounds_without_visual_event']:
            L += ['- Strong sounds with no visual event within 150 ms: ' + ', '.join(
                f"{x['t']} ({x['type']})" for x in sy['strong_sounds_without_visual_event'][:120]), '']
    if res.get('one_shot'):
        o = res['one_shot']
        L += ['## One-shot envelope', '',
              f"- Onset {o['onset_ms']} ms, peak {o['peak_ms']} ms ({o['peak_dbfs']} dBFS), end {o['end_ms']} ms; attack 10-90 % {o['attack_10_90_ms']} ms; "
              f"hold within 3 dB {o['hold_-3dB_ms']} ms; decay " + ', '.join(f"{k} {x}" for k, x in o['decay'].items()),
              '- Envelope (ms, dB re peak): ' + ' '.join(f'{t}:{d}' for t, d in o['envelope_db']), '']
    L += ['## Column guide', '',
          '- `strength`: onset strength relative to the loudest 0.5 % of the file (about 0-1.5); visual `strength`: times over its detection threshold.',
          '- `low share`: share of energy under 250 Hz in the first 40 ms; `centroid`: spectral centre of mass; `flatness`: 0 tonal … 1 noise.',
          '- `decay -20 dB ms`: time from the peak until the level fell 20 dB (None: not within 8 s); `masked_by_next`: the next onset came first.',
          '- Times are seconds from the start of the analysed range; timecodes are m:ss.mmm.', '']
    p = out / 'summary.md'
    p.write_text('\n'.join(L), encoding='utf-8')
    return p
