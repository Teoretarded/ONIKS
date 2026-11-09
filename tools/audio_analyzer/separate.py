"""Sound separation. Four built-in methods (numpy/scipy, no models) and one neural:

  hpss    tonal / transient / noise layers (median-filter HPSS with a residual, Driedger et al.)
  nmf     K spectral components (KL-NMF + Wiener masks), each named by what it sounds like
  bands   sub / bass / mid / high stems (4th-order Linkwitz-Riley crossovers, phase-matched)
  events  every detected sound cut into its own clip, then grouped into families of similar sounds
  demucs  drums / bass / other / vocals with Meta's Hybrid Transformer Demucs (if installed: pip install demucs)

Everything is written as 16-bit WAV plus separation.json and an index.html to listen."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import scipy.signal as ss
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.ndimage import median_filter

from . import features as F
from .decode import load_audio, probe

EPS = 1e-10


def write_wav(path, x, sr):
    """16-bit PCM with TPDF dither; x float (n,) or (n, ch)."""
    from scipy.io import wavfile
    x = np.asarray(x, np.float64)
    rng = np.random.default_rng(0)
    d = (rng.random(x.shape) - rng.random(x.shape)) / 32768.0
    y = np.clip(x + d, -1.0, 32767 / 32768) * 32768.0
    wavfile.write(str(path), sr, y.astype(np.int16))


def _stft(x, sr, n_fft=2048, hop=512):
    _, _, Z = ss.stft(x, sr, window='hann', nperseg=n_fft, noverlap=n_fft - hop, boundary='even', padded=True, axis=0)
    return Z                       # (bins, ch, frames) for x (n, ch)


def _istft(Z, sr, n, n_fft=2048, hop=512):
    _, y = ss.istft(Z, sr, window='hann', nperseg=n_fft, noverlap=n_fft - hop, boundary=True, time_axis=-1, freq_axis=0)
    y = np.moveaxis(y, -1, 0) if y.ndim > 1 else y
    y = y[:n]
    return np.pad(y, ((0, n - len(y)),) + ((0, 0),) * (y.ndim - 1))


# ---------------------------------------------------------------- HPSS

def hpss(x, sr, kernel_t=0.2, kernel_f=500.0, margin=2.0):
    n_fft, hop = 2048, 512
    Z = _stft(x.astype(np.float32), sr, n_fft, hop)                     # (bins, ch, frames)
    S = np.abs(Z).mean(1)
    kt = max(3, int(kernel_t * sr / hop) | 1)
    kf = max(3, int(kernel_f / (sr / n_fft)) | 1)
    H = median_filter(S, size=(1, kt), mode='nearest')
    P = median_filter(S, size=(kf, 1), mode='nearest')
    mh = (H > margin * P).astype(np.float32)
    mp = (P >= margin * H).astype(np.float32)
    # soft versions keep it musical: Wiener-like weights inside the binary regions
    wh = H ** 2 / (H ** 2 + (margin * P) ** 2 + EPS)
    wp = P ** 2 / (P ** 2 + (margin * H) ** 2 + EPS)
    mh = np.maximum(mh * 0.5, wh)
    mp = np.maximum(mp * 0.5, wp)
    s = mh + mp
    over = s > 1
    mh[over] /= s[over]
    mp[over] /= s[over]
    mr = 1.0 - mh - mp
    n = len(x)
    return {name: _istft(Z * m[:, None, :], sr, n, n_fft, hop) for name, m in
            (('tonal', mh), ('transients', mp), ('noise', mr))}


# ---------------------------------------------------------------- NMF

def nmf(x, sr, k=8, iters=200, seed=0, log=print):
    n_fft, hop = 2048, 1024
    Z = _stft(x.astype(np.float32), sr, n_fft, hop)
    V = np.abs(Z).mean(1).astype(np.float32) + EPS                       # (bins, frames)
    rng = np.random.default_rng(seed)
    nb, nf = V.shape
    # init: W from spectra at the loudest distinct frames (helps components lock onto real sounds)
    e = V.sum(0)
    pick = np.argsort(e)[::-1][:: max(1, nf // (k * 8))][:k]
    W = (V[:, pick] + V.mean(1, keepdims=True) * 0.1).astype(np.float32)
    if W.shape[1] < k:
        W = np.hstack([W, rng.random((nb, k - W.shape[1]), np.float32)])
    W /= W.sum(0, keepdims=True)
    H = rng.random((k, nf)).astype(np.float32) * e.mean() / k
    for it in range(iters):
        WH = W @ H + EPS
        H *= (W.T @ (V / WH)) / (W.sum(0)[:, None] + EPS)
        WH = W @ H + EPS
        W *= ((V / WH) @ H.T) / (H.sum(1)[None, :] + EPS)
        s = W.sum(0, keepdims=True) + EPS
        W /= s
        H *= s.T
        if it % 50 == 49:
            kl = float((V * np.log(V / (W @ H + EPS)) - V + W @ H).sum())
            log(f'  nmf iter {it + 1}: KL {kl:.4g}')
    freqs = np.fft.rfftfreq(n_fft, 1 / sr)
    WH = W @ H + EPS
    n = len(x)
    comps = []
    for j in range(k):
        Vj = np.outer(W[:, j], H[j])
        m = Vj / WH
        y = _istft(Z * m[:, None, :], sr, n, n_fft, hop)
        w = W[:, j]
        cen = float((w * freqs).sum() / (w.sum() + EPS))
        peak = float(freqs[int(np.argmax(w))])
        tonal = float(w.max() / (w.mean() + EPS))                       # spectral peakiness
        h = H[j] / (H[j].max() + EPS)
        active = float((h > 0.1).mean())
        kurt = float(((h - h.mean()) ** 4).mean() / (h.var() ** 2 + EPS))
        from .video import runs
        rl = [b - a for a, b in runs(h > 0.2, 2)]
        run_s = float(np.median(rl)) * hop / sr if rl else 0.0
        energy = float((y.astype(np.float64) ** 2).sum())
        comps.append({'audio': y, 'centroid_hz': cen, 'peak_hz': peak, 'peakiness': tonal, 'active_share': active,
                      'impulsiveness': kurt, 'energy': energy, 'typical_run_s': run_s,
                      'activation': h[:: max(1, len(h) // 2000)].round(3).tolist(), 'activation_rate_hz': sr / hop / max(1, len(h) // 2000)})
    tot = sum(c['energy'] for c in comps) + EPS
    comps.sort(key=lambda c: -c['energy'])
    for i, c in enumerate(comps):
        c['energy_share'] = c['energy'] / tot
        c['label'] = _nmf_label(c)
        c['name'] = f'nmf{i + 1:02d}_' + c['label'].split(' (')[0].replace(' ', '_').replace('/', '-')
    return comps


def _nmf_label(c):
    reg = ('sub' if c['peak_hz'] < 60 else 'low' if c['peak_hz'] < 250 else 'mid' if c['peak_hz'] < 2000 else 'high')
    kind = 'tone' if c['peakiness'] > 40 else 'band' if c['peakiness'] > 12 else 'broadband'
    r = c['typical_run_s']
    time = 'hits' if r < 0.35 else 'bursts' if r < 2.5 else 'sustained'
    note = F.midi_name(F.hz_to_midi(c['peak_hz'])) if kind == 'tone' and c['peak_hz'] > 20 else ''
    return f"{reg} {kind} {time} ({c['peak_hz']:.0f} Hz{(' ' + note) if note else ''}, centroid {c['centroid_hz']:.0f} Hz)"


# ---------------------------------------------------------------- bands

def bands(x, sr, cuts=(120.0, 1000.0, 5000.0)):
    """Linkwitz-Riley 4 (two cascaded Butterworth 2) splits; summing the stems gives back the input's magnitude."""
    out, rest = {}, x.astype(np.float64)
    names = ('sub_bass', 'low_mid', 'high_mid', 'high')
    for name, fc in zip(names, cuts):
        lp = ss.butter(2, fc, 'lowpass', fs=sr, output='sos')
        hp = ss.butter(2, fc, 'highpass', fs=sr, output='sos')
        lo = ss.sosfilt(lp, ss.sosfilt(lp, rest, axis=0), axis=0)
        rest = ss.sosfilt(hp, ss.sosfilt(hp, rest, axis=0), axis=0)
        out[f'{name}_below_{int(fc)}Hz'] = lo
    out[f'{names[-1]}_above_{int(cuts[-1])}Hz'] = rest
    return out


# ---------------------------------------------------------------- events + families

def events(x, sr, onsets, max_len=4.0, pre=0.01):
    clips = []
    n = len(x)
    ts = [o['t'] for o in onsets]
    mono = x.mean(1)
    env = F.envelope_1ms(mono, sr)
    for i, o in enumerate(onsets):
        a = max(0, int((o['t'] - pre) * sr))
        nxt = ts[i + 1] if i + 1 < len(ts) else o['t'] + max_len
        end_t = min(nxt, o['t'] + max_len)
        d40 = o.get('decay40_ms')
        if d40:
            end_t = min(end_t, o['peak_t'] + d40 / 1000 + 0.05)
        b = min(n, max(a + int(0.03 * sr), int(end_t * sr)))
        clip = x[a:b].astype(np.float64).copy()
        fade = min(len(clip), int(0.01 * sr))
        clip[-fade:] *= np.linspace(1, 0, fade)[:, None]
        clips.append(clip)
    return clips


def clip_features(clip, sr):
    m = clip.mean(1)
    n_fft = 1024
    seg = m[: int(0.35 * sr)]
    if len(seg) < n_fft:
        seg = np.pad(seg, (0, n_fft - len(seg)))
    _, _, Z = ss.stft(seg, sr, nperseg=n_fft, noverlap=n_fft // 2)
    P = np.abs(Z) ** 2
    fb, _ = F.mel_fb(sr, n_fft, 40)
    mel = np.log10(fb.T @ P + 1e-10)                                     # (40, frames)
    prof = mel.mean(1)
    shape = mel.max(1) - mel.min(1)
    dur = len(clip) / sr
    return np.r_[prof - prof.mean(), 0.3 * shape, 2.0 * np.log(dur + 0.05)]


def families(clips, onsets, sr, threshold=0.5):
    if len(clips) < 2:
        return [0] * len(clips)
    X = np.array([clip_features(c, sr) for c in clips])
    X = (X - X.mean(0)) / (X.std(0) + 1e-6)
    Zl = linkage(X, method='average', metric='cosine')
    lab = fcluster(Zl, t=threshold, criterion='distance')
    # renumber by size
    order = {l: i for i, (l, _) in enumerate(sorted(((l, (lab == l).sum()) for l in set(lab)), key=lambda p: -p[1]))}
    return [order[l] for l in lab]


# ---------------------------------------------------------------- demucs

def demucs(path, out, start=None, end=None, model='htdemucs', log=print):
    try:
        import demucs  # noqa: F401
    except ImportError:
        log('  demucs not installed (pip install demucs); skipped')
        return None
    src = Path(path)
    tmp = out / '_demucs_in.wav'
    x = load_audio(path, 44100, start, end)
    write_wav(tmp, x, 44100)
    log(f'  demucs {model} on the CPU (a few minutes for long files)')
    r = subprocess.run([sys.executable, '-m', 'demucs', '-n', model, '-d', 'cpu', '-o', str(out / '_demucs'), str(tmp)],
                       capture_output=True, text=True)
    tmp.unlink(missing_ok=True)
    if r.returncode:
        log('  demucs failed: ' + r.stderr[-400:])
        return None
    stems = {}
    for f in (out / '_demucs' / model / '_demucs_in').glob('*.wav'):
        dst = out / f'demucs_{f.stem}.wav'
        shutil.move(str(f), dst)
        stems[f.stem] = dst.name
    shutil.rmtree(out / '_demucs', ignore_errors=True)
    return stems


# ---------------------------------------------------------------- driver

def run(path, out, methods=('hpss', 'nmf', 'bands', 'events'), k=8, sr=48000, start=None, end=None, log=print):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    info = probe(path)
    x = load_audio(path, sr, start, end)
    log(f'  {len(x) / sr:.1f} s decoded')
    res = {'file': str(path), 'duration_s': round(len(x) / sr, 3), 'sample_rate': sr, 'stems': []}

    def stem(name, y, group, **meta):
        p = out / f'{name}.wav'
        write_wav(p, y if y.ndim > 1 else y[:, None], sr)
        rms = float(np.sqrt(np.mean(np.asarray(y, np.float64) ** 2)) + EPS)
        res['stems'].append({'group': group, 'name': name, 'file': p.name, 'rms_dbfs': round(20 * np.log10(rms), 1), **meta})

    if 'hpss' in methods:
        log('  hpss')
        for name, y in hpss(x, sr).items():
            stem(f'hpss_{name}', y, 'hpss', what={'tonal': 'steady pitched sound: hums, tones, drones, chords',
                                                 'transients': 'attacks: hits, clicks, clacks, cracks',
                                                 'noise': 'everything else: hiss, air, rumble textures'}[name])
    if 'bands' in methods:
        log('  bands')
        for name, y in bands(x, sr).items():
            stem(f'band_{name}', y, 'bands')
    if 'nmf' in methods:
        log(f'  nmf k={k}')
        for c in nmf(x, sr, k=k, log=log):
            stem(c['name'], c.pop('audio'), 'nmf', label=c['label'], energy_share=round(c['energy_share'], 4),
                 peak_hz=round(c['peak_hz'], 1), centroid_hz=round(c['centroid_hz'], 1), active_share=round(c['active_share'], 3),
                 impulsiveness=round(c['impulsiveness'], 1), activation=c['activation'],
                 activation_rate_hz=round(c['activation_rate_hz'], 3))
    if 'events' in methods:
        log('  events')
        from .analyze import analyze
        r, _ = analyze(path, sr=sr, start=start, end=end, use_video=False, log=lambda *a: None)
        on = r.get('onsets', [])
        clips = events(x, sr, on)
        fam = families(clips, on, sr)
        ed = out / 'events'
        ed.mkdir(exist_ok=True)
        evs = []
        for i, (o, c, f) in enumerate(zip(on, clips, fam)):
            fn = f"{i + 1:04d}_{o['t']:08.3f}s_f{f:02d}_{o['type'].split(' ')[0].replace('/', '-')}.wav"
            write_wav(ed / fn, c, sr)
            evs.append({'file': 'events/' + fn, 't': o['t'], 'family': f, 'type': o['type'], 'strength': o['strength'],
                        'dur_s': round(len(c) / sr, 3), 'peak_dbfs': o['peak_dbfs'], 'centroid_hz': o['centroid_hz'],
                        'note': o['note']})
        fams = []
        for f in sorted(set(fam)):
            mem = [e for e in evs if e['family'] == f]
            rep = max(mem, key=lambda e: e['strength'] or 0)
            types = {}
            for e in mem:
                types[e['type']] = types.get(e['type'], 0) + 1
            fams.append({'family': f, 'count': len(mem), 'example': rep['file'], 'types': types,
                         'times_s': [e['t'] for e in mem],
                         'mean_dur_s': round(float(np.mean([e['dur_s'] for e in mem])), 3),
                         'mean_centroid_hz': round(float(np.nanmean([e['centroid_hz'] or np.nan for e in mem])), 0)
                         if any(e['centroid_hz'] for e in mem) else None})
        res['events'] = evs
        res['families'] = fams
    if 'demucs' in methods:
        st = demucs(path, out, start, end, log=log)
        if st:
            for name, fn in st.items():
                res['stems'].append({'group': 'demucs', 'name': f'demucs_{name}', 'file': fn})
    (out / 'separation.json').write_text(json.dumps(res, indent=1), encoding='utf-8')
    _index(res, out)
    return res


def _index(res, out):
    rows = []
    for s in res['stems']:
        rows.append(f"<tr><td>{s['group']}</td><td>{s['name']}</td><td>{s.get('label') or s.get('what') or ''}"
                    f"{' · ' + str(round(s['energy_share'] * 100, 1)) + ' % of energy' if 'energy_share' in s else ''}</td>"
                    f"<td><audio controls preload='none' src='{s['file']}'></audio></td></tr>")
    fam = ''
    if res.get('families'):
        fam = '<h2>Sound families (similar sounds grouped)</h2><table>' + ''.join(
            f"<tr><td>family {f['family']}</td><td>{f['count']}×</td><td>{', '.join(f'{k} {v}' for k, v in f['types'].items())}</td>"
            f"<td>first at {f['times_s'][0]:.2f} s · {f['mean_dur_s']} s</td><td><audio controls preload='none' src='{f['example']}'></audio></td></tr>"
            for f in res['families']) + '</table>'
    html = f"""<!doctype html><html><head><meta charset="utf-8"><title>Separation · {Path(res['file']).name}</title>
<style>body{{background:#0B0C0A;color:#E9EAE4;font:12px/1.5 ui-monospace,Consolas,monospace;margin:16px}}
h1,h2{{font-size:13px;font-weight:600}} td{{padding:3px 10px;border-bottom:1px solid #24271f;vertical-align:middle}}
audio{{height:28px;width:320px}} table{{border-collapse:collapse}}</style></head><body>
<h1>Separation · {Path(res['file']).name} · {res['duration_s']} s</h1>
<table>{''.join(rows)}</table>{fam}</body></html>"""
    (out / 'index.html').write_text(html, encoding='utf-8')
