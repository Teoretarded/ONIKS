"""report.html: one self-contained page (no network) with the media player, a zoomable timeline of every lane and
an event table. The media file is referenced by a relative path, so keep the folders where they are."""
import base64
import json
import os
from pathlib import Path

import numpy as np

TEMPLATE = Path(__file__).with_name('report_template.html')
TYPES = ['boom (low impact)', 'thump', 'hit', 'tonal hit', 'click/tick', 'crack/noise burst', 'whoosh/riser', 'swell']


def _spec(arrays, max_cols=12000):
    a = arrays['audio']
    m = a['mel_db']
    n = len(m)
    k = max(1, int(np.ceil(n / max_cols)))
    cols = n // k
    if cols == 0:
        return None
    mp = m[:cols * k].reshape(cols, k, -1).max(1)
    hi = float(np.percentile(mp, 99.7))
    lo = hi - 90.0
    q = np.clip((mp - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)
    return {'b64': base64.b64encode(q.tobytes()).decode(), 'cols': cols, 'rows': mp.shape[1], 'dt': k / a['fa'],
            'freqs': [round(float(f), 1) for f in a['mel_f']], 'lo_db': round(lo, 1), 'hi_db': round(hi, 1)}


def write_html(res, arrays, out, media_path):
    D = {'name': Path(res['file']['path']).name, 'dur': res['duration_s'], 'tool': res['tool']}
    rel = os.path.relpath(Path(media_path).resolve(), Path(out).resolve()).replace('\\', '/')
    D['media'] = {'src': rel, 'kind': 'video' if 'video' in res['file'] else 'audio'}
    st = []
    if 'loudness' in res:
        lo, rh, to = res['loudness'], res['rhythm'], res['tonal']
        st += [['LUFS-I', lo['integrated_lufs']], ['LRA', lo['lra_lu']], ['true peak', lo['true_peak_dbtp']],
               ['max M', lo['max_momentary_lufs']], ['key', (to['key'] or {}).get('key', '–') + ' · ' + (to['key'] or {}).get('tonal', '')],
               ['tempo', f"{rh['tempo_candidates'][0]['bpm']} ({rh['beat_confidence'].split(' ')[0]})" if rh['tempo_candidates'] else '–'],
               ['onsets', len(res['onsets'])], ['centroid', f"{res['spectrum']['centroid_hz_median']} Hz"]]
    if 'sync' in res:
        st += [['visual events', len(res['sync']['visual_events'])], ['…without sound', res['sync']['visual_events_without_sound']],
               ['A/V offset', f"{res['sync']['audio_lag_ms']} ms (z {res['sync']['z_score']})"]]
    D['stats'] = st
    D['curves'] = res['curves']
    if 'audio' in arrays:
        D['spec'] = _spec(arrays)
        D['types'] = TYPES
        D['onsets'] = [[o['t'], TYPES.index(o['type']) if o['type'] in TYPES else 2, o['strength'], o['peak_dbfs'], o['attack_ms'],
                        o['decay20_ms'], o['centroid_hz'], o['note'], o['low_share']] for o in res['onsets']]
        D['beats'] = res['rhythm']['beats_s'] if not res['rhythm']['beat_confidence'].startswith('low') else []
        D['sections'] = [[s['start_s'], s['end_s'], s['character'], s['lufs_m_mean']] for s in res['sections']]
        D['swells'] = res['swells']
        D['drops'] = res['drops']
        D['silences'] = res['silences']
    D['markers'] = res.get('markers') or {'chapters': [], 'cues': []}
    if 'video' in res:
        kinds = ['flash', 'lime', 'coral', 'yellow', 'motion burst', 'camera move', 'cut']
        D['vkinds'] = kinds
        if 'sync' in res:
            D['vevents'] = [[e['t'], kinds.index(e['kind']), e['strength'], e['dur_s'], int(e['has_sound']), e['nearest_onset_ms']]
                            for e in res['sync']['visual_events']]
        else:
            ev = res['video']['events']
            D['vevents'] = []
            for key, kind in (('flashes', 'flash'), ('lime', 'lime'), ('coral', 'coral'), ('yellow', 'yellow'),
                              ('motion_bursts', 'motion burst'), ('camera_moves', 'camera move'), ('cuts', 'cut')):
                for e in ev[key]:
                    D['vevents'].append([e.get('start_s', e.get('t_s')), kinds.index(kind), e.get('strength', e.get('peak_speed')),
                                         e.get('dur_s'), -1, None])
            D['vevents'].sort(key=lambda e: e[0])
    js = json.dumps(D, separators=(',', ':'), allow_nan=False).replace('</', '<\\/')
    html = TEMPLATE.read_text(encoding='utf-8').replace('/*__DATA__*/null', js).replace('__TITLE__', D['name'])
    p = Path(out) / 'report.html'
    p.write_text(html, encoding='utf-8')
    return p
