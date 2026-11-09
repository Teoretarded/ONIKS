"""The analysis of one file: audio features, events, structure, optional picture + sync. Returns (result, arrays)."""
import json
import time
from pathlib import Path

import numpy as np
import scipy.fft as sfft
from scipy.ndimage import maximum_filter1d, uniform_filter1d

from . import features as F
from . import video as V
from .decode import load_audio, probe

VERSION = '1.0'


def r(x, n=2):
    if x is None:
        return None
    x = float(x)
    return None if not np.isfinite(x) else round(x, n)


# ---------------------------------------------------------------- resampling frame data onto a time grid

class Grid:
    def __init__(self, n_src, src_rate, step, dur):
        self.t = np.arange(0.0, dur + 1e-9, step)
        e = np.clip(np.round(np.r_[self.t - step / 2, self.t[-1] + step / 2] * src_rate).astype(np.int64), 0, n_src)
        e[1:] = np.maximum(e[1:], e[:-1] + 1)
        self.e = np.minimum(e, n_src)
        self.ok = self.e[:-1] < n_src
        self.start = np.minimum(self.e[:-1], n_src - 1)

    def _red(self, a, op):
        out = op.reduceat(a, self.start, axis=0)
        return out

    def max(self, a):
        return self._red(np.asarray(a, np.float64), np.fmax)

    def mean(self, a):
        a = np.asarray(a, np.float64)
        valid = np.isfinite(a)
        s = np.add.reduceat(np.where(valid, a, 0.0), self.start, axis=0)
        c = np.add.reduceat(valid.astype(np.float64), self.start, axis=0)
        with np.errstate(invalid='ignore', divide='ignore'):
            return np.where(c > 0, s / np.maximum(c, 1), np.nan)


def _markers(path, explicit):
    cands = [explicit] if explicit else []
    p = Path(path)
    cands += [p.with_suffix('.markers.json'), p.with_name(p.stem + '_markers.json')]
    for c in cands:
        if c and Path(c).is_file():
            j = json.loads(Path(c).read_text(encoding='utf-8'))
            ch = j if isinstance(j, list) else j.get('chapters', [])
            cues = [] if isinstance(j, list) else j.get('cues', [])
            chapters = [{'t': float(c['t']), 'title': str(c.get('title', ''))} for c in ch]
            cues = [{'t': float(c[0] if isinstance(c, (list, tuple)) else c.get('t', c) if isinstance(c, dict) else c),
                     'name': str(c[1]) if isinstance(c, (list, tuple)) and len(c) > 1 else
                     (c.get('name', '') if isinstance(c, dict) else '')} for c in cues]
            return {'source': str(c), 'chapters': sorted(chapters, key=lambda c: c['t']),
                    'cues': sorted(cues, key=lambda c: c['t'])}
    return None


def analyze(path, sr=48000, start=None, end=None, use_video=True, markers=None, video_width=192, hw=True, log=print):
    T0 = time.perf_counter()
    timing = {}
    tick = [time.perf_counter()]

    def lap(name):
        now = time.perf_counter()
        timing[name] = round(now - tick[0], 3)
        tick[0] = now

    info = probe(path)
    res = {'tool': f'ONIKS audio analyzer {VERSION}', 'file': info, 'range': {'start_s': start or 0.0, 'end_s': end}}
    arrays = {}
    mk = _markers(path, markers)
    if mk:
        off = start or 0.0
        for k in ('chapters', 'cues'):
            mk[k] = [dict(c, t=round(c['t'] - off, 3)) for c in mk[k] if c['t'] >= off and (end is None or c['t'] <= end)]
        res['markers'] = mk

    has_audio = 'audio' in info
    dur = 0.0
    if has_audio:
        x = load_audio(path, sr, start, end)
        lap('decode_audio')
        dur = len(x) / sr
        log(f'  audio {dur:.1f} s decoded')
        _audio(res, arrays, x, sr, dur, lap, log)
    if use_video and 'video' in info:
        v = V.analyze(path, info, start, end, width=video_width, hw=hw, log=log)
        lap('video')
        dur = max(dur, len(v['luma']) / v['fps'])
        vev = V.events(v)
        res['video'] = {'analysis_size': list(v['size']), 'fps': v['fps'], 'frames': int(len(v['luma'])),
                        'luma_mean': r(v['luma'].mean(), 4), 'motion_mean': r(v['local_motion'].mean(), 4),
                        'cam_speed_mean_widths_per_s': r(v['cam_speed'].mean(), 3),
                        'lime_frames_share': r((v['lime'] > 0.002).mean(), 3),
                        'coral_frames_share': r((v['coral'] > 0.002).mean(), 3), 'events': vev}
        arrays['video'] = v
        if has_audio:
            _sync(res, arrays, sr)
            lap('sync')
    res['duration_s'] = round(dur, 3)
    _curves(res, arrays, dur)
    lap('curves')
    res['timing_s'] = dict(timing, total=round(time.perf_counter() - T0, 2))
    return res, arrays


# ---------------------------------------------------------------- audio

def _audio(res, arrays, x, sr, dur, lap, log):
    n_fft = 1 << int(round(np.log2(2048 * sr / 48000)))
    hop = n_fft // 4
    fa = sr / hop
    mono = x.mean(1).astype(np.float32)
    L, R = x[:, 0], x[:, 1]

    sp = F.spectral_pass(mono, sr, n_fft, hop)
    count = len(sp['power'])
    centers = np.arange(count) * hop
    lap('stft')
    rms_db = F.pdb(F.win_mean(mono.astype(np.float64) ** 2, n_fft, centers)).astype(np.float32)
    pk = maximum_filter1d(np.abs(mono), n_fft)[np.minimum(centers, len(mono) - 1)]
    peak_db = F.adb(pk).astype(np.float32)
    ll = F.win_mean(L.astype(np.float64) ** 2, n_fft, centers)
    rr = F.win_mean(R.astype(np.float64) ** 2, n_fft, centers)
    lr = F.win_mean(L.astype(np.float64) * R, n_fft, centers)
    with np.errstate(invalid='ignore', divide='ignore'):
        corr = np.where(ll * rr > 1e-12, lr / np.sqrt(ll * rr), np.nan)
        side = (ll + rr - 2 * lr) / 4
        mid = (ll + rr + 2 * lr) / 4
        width = np.where(mid + side > 1e-12, side / (mid + side), np.nan)
    zc = F.zcr(mono, sr, n_fft, centers)
    lap('levels')

    loud = F.loudness(x, sr)
    tp = F.true_peak(x)
    lap('loudness')

    f0, conf = F.yin(mono, sr, hop, count, gate=rms_db > -50)
    f0s = f0.copy()
    v = np.isfinite(f0s) & (conf > 0.8)
    f0s[~v] = np.nan
    lap('pitch')

    odf = F.onset_strength(sp['mel_db'])
    on_idx, scale = F.pick_onsets(odf, fa, rms_db)
    env = F.envelope_1ms(mono, sr)
    tot_bands = sp['bands']
    onsets = []
    for k, fi in enumerate(on_idx):
        t = fi / fa
        nxt = int(on_idx[k + 1] / fa * 1000) if k + 1 < len(on_idx) else None
        sh = F.onset_shape(env, int(t * 1000), nxt)
        if sh is None:
            continue
        b = tot_bands[fi:fi + 4].mean(0)
        share = b / (b.sum() + F.EPS)
        pf = fi + int(np.argmax(sp['power'][fi:fi + 6]))
        pv = f0s[fi:fi + 8]
        pv = pv[np.isfinite(pv)]
        pitch = float(np.median(pv)) if len(pv) >= 3 else None
        o = {'t': round(sh['start_ms'] / 1000, 3), 'peak_t': round(sh['peak_ms'] / 1000, 3),
             'strength': r(odf[fi] / scale, 3), 'peak_dbfs': r(F.adb(sh['peak']), 1),
             'attack_ms': sh['attack_ms'], 'decay20_ms': sh['decay20_ms'], 'decay40_ms': sh['decay40_ms'],
             'masked_by_next': sh['masked'],
             'centroid_hz': r(sp['centroid'][pf], 0), 'flatness': r(sp['flatness'][pf], 3),
             'low_share': r(share[0] + share[1], 3), 'high_share': r(share[5] + share[6], 3),
             'dominant_band': F.BANDS[int(np.argmax(b))][0],
             'pitch': r(pitch, 1), 'note': F.midi_name(F.hz_to_midi(pitch)) if pitch else None}
        o['type'] = F.classify(o)
        if onsets and abs(o['t'] - onsets[-1]['t']) < 0.015:      # two frames resolved to one attack
            if (o['strength'] or 0) > (onsets[-1]['strength'] or 0):
                onsets[-1] = o
            continue
        onsets.append(o)
    lap('onsets')

    tempos = F.tempo(odf, fa)
    beats = F.beat_track(odf, fa, tempos[0]['bpm']) if tempos else np.array([], np.int64)
    lap('tempo')

    w = 10 ** (rms_db / 20)
    cg = (sp['chroma'] / (sp['chroma'].sum(1, keepdims=True) + F.EPS) * w[:, None]).sum(0)
    key = F.key_of(cg)

    # structure on 0.5 s blocks
    bs = 0.5
    bpf = max(1, int(round(bs * fa)))
    nb = max(1, count // bpf)
    cut = nb * bpf
    mfcc = sfft.dct(sp['mel_db'][:cut], type=2, norm='ortho', axis=1)[:, :13]
    def blk(a):
        with np.errstate(invalid='ignore'), __import__('warnings').catch_warnings():
            __import__('warnings').simplefilter('ignore', RuntimeWarning)
            return np.nanmean(a[:cut].reshape(nb, bpf, -1), axis=1)
    on_count = np.bincount(np.minimum(on_idx // bpf, nb - 1), minlength=nb).astype(np.float64) if len(on_idx) else np.zeros(nb)
    X = np.hstack([blk(mfcc), blk(F.pdb(tot_bands)), blk(rms_db[:, None]),
                   np.nan_to_num(blk(np.log2(np.maximum(sp['centroid'], 20))[:, None]), nan=10),
                   np.nan_to_num(blk(sp['flatness'][:, None]), nan=1), uniform_filter1d(on_count, 3)[:, None]])
    bounds, nov = F.novelty_sections(np.nan_to_num(X), bs)
    lap('structure')

    integ = loud['integrated']
    lt, lm, ls = loud['t'], loud['momentary'], loud['short_term']
    onset_t = np.array([o['t'] for o in onsets])
    sections = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        t0, t1 = a * bs, min(dur, b * bs)
        if t1 - t0 <= 0:
            continue
        m = (lt >= t0) & (lt < t1)
        fsl = slice(int(t0 * fa), max(int(t0 * fa) + 1, int(t1 * fa)))
        e = 10 ** (lm[m] / 10) if m.any() else np.array([1e-12])
        lev = float(10 * np.log10(e.mean()))
        slope = float(np.polyfit(lt[m], ls[m], 1)[0]) if m.sum() > 4 else 0.0
        n_on = int(((onset_t >= t0) & (onset_t < t1)).sum())
        bnd = tot_bands[fsl].mean(0)
        rel = lev - (integ if integ is not None else lev)
        sec = {'start_s': round(t0, 2), 'end_s': round(t1, 2), 'lufs_m_mean': r(lev, 1),
               'lufs_m_max': r(lm[m].max() if m.any() else None, 1), 'vs_integrated_lu': r(rel, 1),
               'trend_db_per_s': r(slope, 2), 'onsets': n_on, 'onsets_per_s': r(n_on / (t1 - t0), 2),
               'centroid_hz': r(np.nanmedian(sp['centroid'][fsl]) if np.isfinite(sp['centroid'][fsl]).any() else None, 0),
               'flatness': r(np.nanmedian(sp['flatness'][fsl]) if np.isfinite(sp['flatness'][fsl]).any() else None, 3),
               'dominant_band': F.BANDS[int(np.argmax(bnd))][0],
               'band_db': {F.BANDS[i][0]: r(F.pdb(bnd[i]), 1) for i in range(len(F.BANDS))},
               'key': None if lev < -60 else F.key_of((sp['chroma'][fsl] / (sp['chroma'][fsl].sum(1, keepdims=True) + F.EPS)
                                * w[fsl, None]).sum(0))}
        sec['character'] = ('silence' if lev < -60 else 'quiet' if rel < -10 else 'loud' if rel > 3 else 'medium') + \
            (', building' if slope > 0.6 else ', fading' if slope < -0.6 else '') + \
            (', dense hits' if n_on / (t1 - t0) > 4 else ', sparse hits' if n_on / (t1 - t0) > 0.5 else ', sustained')
        sections.append(sec)

    # silences, swells, drops (loudness grid is 20 Hz)
    silences = [{'start_s': round(a / fa, 3), 'end_s': round(b / fa, 3), 'dur_s': round((b - a) / fa, 3)}
                for a, b in V.runs(rms_db < -55) if (b - a) / fa >= 0.25]
    step = lt[1] - lt[0] if len(lt) > 1 else 0.05
    sm = uniform_filter1d(lm, max(1, int(0.2 / step)))
    swells, drops = [], []
    k3, k05 = int(3 / step), max(1, int(0.5 / step))
    floor = (integ - 20) if integ is not None else -50
    i = k3
    while i < len(sm):
        lo = int(np.argmin(sm[i - k3:i])) + i - k3
        if sm[i] - max(sm[lo], -70.0) >= 9 and sm[i] > floor and (i + 1 >= len(sm) or sm[i + 1] <= sm[i]):
            swells.append({'start_s': round(lt[lo], 2), 'peak_s': round(lt[i], 2), 'rise_db': r(sm[i] - max(sm[lo], -70.0), 1)})
            i += k3
            continue
        i += 1
    i = 0
    while i + k05 < len(sm):
        if sm[i] > floor and sm[i] - sm[i + k05] >= 12:
            j = i + k05
            drops.append({'t_s': round(lt[i], 2), 'fall_db': r(sm[i] - sm[j], 1)})
            i = j + k05
            continue
        i += 1

    ltas = sp['ltas']
    bshare = tot_bands.sum(0)
    bshare = bshare / (bshare.sum() + F.EPS)
    voiced = np.isfinite(f0s)
    vs = float(voiced[rms_db > -50].mean()) if (rms_db > -50).any() else 0.0
    if vs < 0.05:
        voiced = np.zeros_like(voiced)
    res['loudness'] = {'integrated_lufs': r(integ, 2), 'lra_lu': r(loud['lra'], 2),
                       'max_momentary_lufs': r(loud['max_momentary'], 2), 'max_short_term_lufs': r(loud['max_short_term'], 2),
                       'true_peak_dbtp': r(F.adb(tp), 2), 'sample_peak_dbfs': r(F.adb(np.abs(x).max()), 2),
                       'note': 'ITU-R BS.1770-4 / EBU R128; YouTube normalises to about -14 LUFS'}
    rms_all = float(np.sqrt(np.mean(mono.astype(np.float64) ** 2)))
    res['levels'] = {'rms_dbfs': r(F.adb(rms_all), 2),
                     'crest_factor_db': r(F.adb(np.abs(mono).max()) - F.adb(rms_all), 2),
                     'dynamic_range_db_p95_p10': r(np.percentile(rms_db[rms_db > -90], 95) - np.percentile(rms_db[rms_db > -90], 10), 1)
                     if (rms_db > -90).sum() > 10 else None,
                     'clipped_samples': int((np.abs(x) >= 0.9999).sum()), 'dc_offset': [r(L.mean(), 6), r(R.mean(), 6)],
                     'silence_share': r((rms_db < -55).mean(), 3)}
    res['stereo'] = {'correlation_mean': r(np.nanmean(corr), 3), 'side_share_mean': r(np.nanmean(width), 3),
                     'balance_db_L_minus_R': r(F.pdb(ll.mean()) - F.pdb(rr.mean()), 2),
                     'mono_compatible': bool(np.nanpercentile(corr, 5) > -0.2) if np.isfinite(corr).any() else None}
    res['spectrum'] = {'centroid_hz_median': r(np.nanmedian(sp['centroid']), 0),
                       'rolloff85_hz_median': r(np.nanmedian(sp['rolloff']), 0),
                       'flatness_median': r(np.nanmedian(sp['flatness']), 3),
                       'band_energy_share': {F.BANDS[i][0]: r(bshare[i], 4) for i in range(len(F.BANDS))},
                       'band_ranges_hz': {b[0]: [b[1], b[2]] for b in F.BANDS},
                       'third_octave_db': F.third_octave(ltas, sp['freqs']),
                       'resonances': F.resonances(ltas, sp['freqs'])}
    res['tonal'] = {'key': key, 'chroma_profile': {F.NOTES[i]: r(cg[i] / (cg.max() + F.EPS), 3) for i in range(12)},
                    'voiced_share': r(vs, 3),
                    'pitch_median_hz': r(np.nanmedian(f0s), 1) if voiced.any() else None,
                    'pitch_median_note': F.midi_name(F.hz_to_midi(np.nanmedian(f0s))) if voiced.any() else None,
                    'pitch_range_notes': [F.midi_name(F.hz_to_midi(np.nanpercentile(f0s, 5))),
                                          F.midi_name(F.hz_to_midi(np.nanpercentile(f0s, 95)))] if voiced.any() else None}
    bt = beats / fa
    res['rhythm'] = {'tempo_candidates': tempos,
                     'beat_confidence': ('high' if tempos and tempos[0]['strength'] > 0.35 else
                                         'medium' if tempos and tempos[0]['strength'] > 0.15 else 'low (probably not metric)'),
                     'beats_s': [round(float(t), 3) for t in bt],
                     'onsets_per_s': r(len(onsets) / max(dur, 1e-9), 2)}
    types = {}
    for o in onsets:
        types[o['type']] = types.get(o['type'], 0) + 1
    res['onset_types'] = types
    res['onsets'] = onsets
    res['sections'] = sections
    res['silences'] = silences
    res['swells'] = swells
    res['drops'] = drops
    if dur <= 40:
        res['one_shot'] = F.one_shot(env, mono, sr)
    res['analysis'] = {'sample_rate': sr, 'n_fft': n_fft, 'hop': hop, 'frame_rate_hz': r(fa, 3), 'mel_bands': 96}
    arrays['audio'] = {'fa': fa, 'hop': hop, 'count': count, 'mel_db': sp['mel_db'], 'mel_f': sp['mel_f'], 'odf': odf,
                       'rms_db': rms_db, 'peak_db': peak_db, 'centroid': sp['centroid'], 'flatness': sp['flatness'],
                       'rolloff': sp['rolloff'], 'bands': tot_bands, 'corr': corr, 'width': width, 'zcr': zc,
                       'f0': f0s, 'loud': loud, 'novelty': nov, 'onset_idx': on_idx, 'env': env}


# ---------------------------------------------------------------- picture/sound sync

def _sync(res, arrays, sr):
    a, v = arrays['audio'], arrays['video']
    fa, fv = a['fa'], v['fps']
    ev = res['video']['events']
    odf = a['odf'] / (a['odf'].std() + F.EPS)
    sig = v['luma'] + 0.5 * v['bright'] + 2 * v['lime'] + 2 * v['coral'] + v['local_motion']
    dv = np.maximum(np.diff(sig, prepend=sig[:1]), 0)
    dv = np.interp(np.arange(len(odf)) / fa, v['t'], dv)
    dv = dv / (dv.std() + F.EPS)
    n = len(odf)
    Fa = sfft.rfft(odf - odf.mean(), 2 * n)
    Fv = sfft.rfft(dv - dv.mean(), 2 * n)
    xc = sfft.irfft(Fa * np.conj(Fv), 2 * n)
    L = int(0.5 * fa)
    lags = np.r_[np.arange(0, L + 1), np.arange(-L, 0)]
    vals = np.r_[xc[:L + 1], xc[-L:]] / n
    i = int(np.argmax(vals))
    z = (vals[i] - vals.mean()) / (vals.std() + F.EPS)
    sync = {'audio_lag_ms': r(lags[i] / fa * 1000, 1), 'peak_corr': r(vals[i], 3), 'z_score': r(z, 1),
            'meaning': 'positive = sound lands after the picture; trust it only when z_score > 4'}

    on = res['onsets']
    ot = np.array([o['t'] for o in on]) if on else np.zeros(0)

    def nearest(t):
        if not len(ot):
            return None, None
        j = int(np.argmin(np.abs(ot - t)))
        return j, (ot[j] - t) * 1000

    visual = []
    for kind, key, tol in (('flash', 'flashes', 100), ('lime', 'lime', 150), ('coral', 'coral', 150),
                           ('yellow', 'yellow', 150), ('motion burst', 'motion_bursts', 120), ('camera move', 'camera_moves', 300),
                           ('cut', 'cuts', 80)):
        for e in ev.get(key, []):
            t = e.get('start_s', e.get('t_s'))
            j, d = nearest(t)
            hit = j is not None and abs(d) <= tol
            visual.append({'t': t, 'kind': kind, 'strength': e.get('strength', e.get('peak_speed', 1.0)),
                           'dur_s': e.get('dur_s'), 'nearest_onset_ms': r(d, 0), 'has_sound': bool(hit),
                           'sound_type': on[j]['type'] if hit else None})
    visual.sort(key=lambda e: e['t'])
    sync['visual_events'] = visual
    sync['visual_events_without_sound'] = sum(1 for e in visual if not e['has_sound'])
    vt = np.array([e['t'] for e in visual]) if visual else np.zeros(0)
    lonely = []
    for o in on:
        if (o['strength'] or 0) >= 0.3 and (not len(vt) or np.min(np.abs(vt - o['t'])) > 0.15):
            lonely.append({'t': o['t'], 'type': o['type'], 'strength': o['strength']})
    sync['strong_sounds_without_visual_event'] = lonely
    hits = [e for e in visual if e['kind'] in ('flash', 'lime', 'coral', 'motion burst', 'cut')]
    sync['music_grid_fit'] = F.grid_fit([e['t'] for e in hits], [min(5.0, float(e['strength'] or 1)) for e in hits])

    # busy picture, quiet sound
    step = 0.1
    tg = np.arange(0, len(v['luma']) / fv, step)
    act = np.interp(tg, v['t'], uniform_filter1d(v['local_motion'] / (np.percentile(v['local_motion'], 95) + 1e-9)
                                                  + v['cam_speed'] / (np.percentile(v['cam_speed'], 95) + 1e-9), int(fv)))
    lt, lm = a['loud']['t'], a['loud']['momentary']
    lev = np.interp(tg, lt, lm)
    integ = res['loudness']['integrated_lufs']
    thr = (integ - 15) if integ is not None else -45
    q = (act > np.percentile(act, 70)) & (lev < thr)
    sync['busy_picture_quiet_sound'] = [{'start_s': round(i * step, 2), 'end_s': round(j * step, 2)}
                                        for i, j in V.runs(q, 5) if (j - i) * step >= 1.0]
    res['sync'] = sync


# ---------------------------------------------------------------- curves for the json/csv/report

def curves(arrays, step, dur):
    out = {'t': None}
    if 'audio' in arrays:
        a = arrays['audio']
        g = Grid(a['count'], a['fa'], step, dur)
        out['t'] = g.t
        lt = a['loud']['t']
        out['lufs_m'] = np.interp(g.t, lt, a['loud']['momentary'])
        out['lufs_s'] = np.interp(g.t, lt, a['loud']['short_term'])
        out['rms_db'] = F.pdb(g.mean(10 ** (a['rms_db'] / 10)))
        out['peak_db'] = g.max(a['peak_db'])
        out['onset_strength'] = g.max(a['odf'])
        out['centroid_hz'] = g.mean(a['centroid'])
        out['rolloff_hz'] = g.mean(a['rolloff'])
        out['flatness'] = g.mean(a['flatness'])
        out['zcr_hz'] = g.mean(a['zcr'])
        out['pitch_hz'] = g.mean(a['f0'])
        out['stereo_corr'] = g.mean(a['corr'])
        out['side_share'] = g.mean(a['width'])
        bm = g.mean(a['bands'])
        for i, b in enumerate(F.BANDS):
            out[f'band_{b[0]}_db'] = F.pdb(bm[:, i])
        on_t = a['onset_idx'] / a['fa']
        c = np.searchsorted(on_t, g.t + 0.5) - np.searchsorted(on_t, g.t - 0.5)
        out['onsets_per_s'] = c.astype(np.float64)
    if 'video' in arrays:
        v = arrays['video']
        gv = Grid(len(v['luma']), v['fps'], step, dur)
        if out['t'] is None:
            out['t'] = gv.t
        for k in ('luma', 'bright', 'lime', 'coral', 'yellow', 'local_motion', 'cam_speed', 'motion'):
            out[f'v_{k}'] = gv.max(v[k]) if k in ('bright', 'local_motion', 'motion') else gv.mean(v[k])
    return out


def _curves(res, arrays, dur):
    c = curves(arrays, 0.05, dur)
    res['curves'] = {'step_s': 0.05, 'columns': [k for k in c if k != 't'],
                     'data': {k: [None if not np.isfinite(x) else round(float(x), 3) for x in v] for k, v in c.items() if k != 't'}}
