"""Impact analysis: what makes a shot, a cannon, a blast or a discharge hit, measured the way a listener hears it.

A listener hears an impact as a few things at once:
- the crack (the first milliseconds, 1-8 kHz);
- the punch or "umf" (45-180 Hz in the first 150 ms, often a thump that drops in pitch);
- the body and blast (180 Hz-1 kHz);
- the tail (the rumble and echoes after 300 ms).

This module finds the impacts in a recording and measures each of them:
- attack and peak;
- band energies in time windows;
- the umf, crack and tail ratios;
- decay times per band;
- the low thump's pitch track;
- the centroid track;
- the stereo width;
- a band-by-time fingerprint.

It compares two impacts feature by feature, with suggestions. It writes a listening page: the clips, their
spectrograms and band envelopes side by side, and the numbers.

    python tools/audio_impact.py reference/sounds/refs/*.mp3 --out reference/sounds/refs/_impacts
    python tools/audio_impact.py mine.wav --ref reference/sounds/refs/howitzer_155mm.mp3     (compare)
"""
import json
import os
import struct
import zlib

import numpy as np
import scipy.signal as ss

BANDS = [('sub', 20, 45), ('thump', 45, 90), ('punch', 90, 180), ('body', 180, 400), ('lowmid', 400, 1000),
         ('crack', 1000, 3000), ('bite', 3000, 8000), ('air', 8000, 18000)]
WINS = [(0.0, 0.01), (0.01, 0.05), (0.05, 0.15), (0.15, 0.4), (0.4, 1.0), (1.0, 3.0)]
THIRD = [25 * 2 ** (k / 3) for k in range(28)]                       # 25 Hz .. 16 kHz, 1/3 octave


def _db(p, floor=-120.0):
    return np.maximum(10 * np.log10(np.maximum(p, 1e-30)), floor)


def _mono(x):
    return x.mean(1) if x.ndim == 2 else x


def _sos(lo, hi, sr, order=4):
    hi = min(hi, sr * 0.45)
    if lo <= 0:
        return ss.butter(order, hi, 'lowpass', fs=sr, output='sos')
    return ss.butter(order, [lo, hi], 'bandpass', fs=sr, output='sos')


def envelope(m, sr, ms=1.0):
    """Peak envelope at 1 ms resolution (max of |x| per ms block)."""
    k = max(1, int(sr * ms / 1000))
    n = len(m) // k
    return np.abs(m[:n * k]).reshape(n, k).max(1)


def find_impacts(x, sr, top=6, min_gap=1.5, min_jump_db=18.0):
    """The strongest sudden onsets: the level jumps at least min_jump_db within 30 ms from a quieter moment just
    before. Returns onset times (s), strongest first."""
    m = _mono(x)
    e = envelope(m, sr, 1.0)
    edb = 20 * np.log10(e + 1e-9)
    w = 30                                                             # the level 30-120 ms before each ms
    c = np.concatenate([[0], np.cumsum(edb)])
    i = np.arange(len(edb))
    a, b = np.clip(i - 120, 0, None), np.clip(i - w, 1, None)
    pre = (c[b] - c[a]) / np.maximum(b - a, 1)
    jump = edb - pre
    cand = np.where((jump > min_jump_db) & (edb > edb.max() - 40))[0]
    picks = []
    for i in cand[np.argsort(-edb[cand])]:
        if all(abs(i - j) > min_gap * 1000 for j in picks):
            picks.append(i)
        if len(picks) >= top:
            break
    if not picks:                                                      # (a file that starts on the hit: its loudest ms)
        picks = [int(np.argmax(edb))]
    out = []
    for i in picks:                                                    # refine: the first ms within 12 dB of the local peak
        seg = edb[max(0, i - 40):i + 60]
        j = int(np.argmax(seg >= seg.max() - 12))
        out.append((max(0, i - 40) + j) / 1000.0)
    return out


def _schroeder_t30(p, fs_env):
    """Decay time to -60 dB extrapolated from the -5..-35 dB slope of the backward-integrated energy."""
    if p.sum() <= 0:
        return None
    sch = np.cumsum(p[::-1])[::-1]
    d = 10 * np.log10(sch / sch[0] + 1e-30)
    i5 = np.argmax(d <= -5)
    i35 = np.argmax(d <= -35)
    if i35 <= i5:
        i35 = np.argmax(d <= -25)
        if i35 <= i5:
            return None
        return round((i35 - i5) / fs_env * 60 / 20, 3)
    return round((i35 - i5) / fs_env * 2, 3)


def low_pitch(m, sr, dur=0.3, hop=0.005):
    """The dominant frequency between 25 and 250 Hz in 40 ms windows every 5 ms: a thump's pitch drop."""
    lo = ss.sosfilt(_sos(25, 250, sr, 4), m)
    w = int(0.04 * sr)
    out = []
    for k in range(int(dur / hop)):
        a = int(k * hop * sr)
        seg = lo[a:a + w]
        if len(seg) < w:
            break
        X = np.abs(np.fft.rfft(seg * np.hanning(w), 1 << 15))
        f = np.fft.rfftfreq(1 << 15, 1 / sr)
        s = (f >= 25) & (f <= 250)
        out.append(round(float(f[s][np.argmax(X[s])]), 1))
    return out


def fingerprint(m, sr, dur=2.0, hop=0.005):
    """Third-octave band energies (dB, re the loudest cell) every 5 ms: the impact's shape in time and frequency."""
    n = int(dur * sr)
    m = np.pad(m[:n], (0, max(0, n - len(m))))
    k = int(hop * sr)
    rows = []
    for fc in THIRD:
        lo, hi = fc / 2 ** (1 / 6), fc * 2 ** (1 / 6)
        y = ss.sosfilt(_sos(lo, hi, sr, 3), m)
        p = (y[:len(y) // k * k] ** 2).reshape(-1, k).mean(1)
        rows.append(p)
    P = np.array(rows)
    return _db(P / (P.max() + 1e-30), -90.0)


def profile(x, sr, t0, dur=3.0, name=''):
    """Everything about one impact starting at t0 (s)."""
    i0 = max(0, int((t0 - 0.002) * sr))
    seg = x[i0:i0 + int(dur * sr)]
    m = _mono(seg).astype(np.float64)
    e = envelope(m, sr, 1.0)
    pk = e[:60].max() if len(e) else 0
    i90 = int(np.argmax(e >= 0.9 * pk))
    i10 = int(np.argmax(e >= 0.1 * pk))
    tot = float((m ** 2).sum()) + 1e-30
    band = {}
    for nm, lo, hi in BANDS:
        y = ss.sosfilt(_sos(lo, hi, sr), m)
        p = y ** 2
        band[nm] = {'win_db': [round(float(_db(p[int(a * sr):int(b * sr)].sum() / tot)), 1) for a, b in WINS],
                    't30': _schroeder_t30((p[:len(p) // 48 * 48]).reshape(-1, 48).sum(1), sr / 48)}
    def E(lo, hi, a, b):
        y = ss.sosfilt(_sos(lo, hi, sr), m) if hi else m
        return float((y[int(a * sr):int(b * sr)] ** 2).sum()) + 1e-30
    umf = _db(E(45, 180, 0, 0.15) / E(0, None, 0, 0.15))
    crack = _db(E(1000, 8000, 0, 0.02) / E(0, None, 0, 0.02))
    tail = _db(E(0, None, 0.3, dur) / E(0, None, 0, 0.3))
    body = _db(E(180, 1000, 0, 0.3) / E(0, None, 0, 0.3))
    rms50 = np.sqrt(np.mean(m[:int(0.05 * sr)] ** 2)) + 1e-12
    lp = low_pitch(m, sr)
    # centroid every 10 ms over the first second
    f, t, S = ss.stft(m[:int(1.0 * sr)], sr, nperseg=1024, noverlap=1024 - int(0.01 * sr))
    P = np.abs(S) ** 2
    cen = (P * f[:, None]).sum(0) / (P.sum(0) + 1e-30)
    width = None
    if seg.ndim == 2:
        mid, side = (seg[:, 0] + seg[:, 1]) / 2, (seg[:, 0] - seg[:, 1]) / 2
        width = round(float(_db((side ** 2).sum() / ((mid ** 2).sum() + 1e-30))), 1)
    return {
        'name': name, 't0': round(float(t0), 3),
        'peak_dbfs': round(float(20 * np.log10(np.abs(m).max() + 1e-12)), 1),
        'rise_ms': int(max(0, i90 - i10)),
        'crest50_db': round(float(20 * np.log10(np.abs(m[:int(0.05 * sr)]).max() / rms50 + 1e-12)), 1),
        'umf_db': round(float(umf), 1), 'crack_db': round(float(crack), 1), 'body_db': round(float(body), 1),
        'tail_db': round(float(tail), 1),
        't30_all': _schroeder_t30((m[:len(m) // 48 * 48] ** 2).reshape(-1, 48).sum(1), sr / 48),
        'bands': band,
        'low_pitch_hz': {'0ms': lp[0] if lp else None, '20ms': lp[4] if len(lp) > 4 else None,
                         '60ms': lp[12] if len(lp) > 12 else None, '150ms': lp[30] if len(lp) > 30 else None},
        'centroid_hz': {'10ms': int(cen[1]) if len(cen) > 1 else None, '50ms': int(cen[5]) if len(cen) > 5 else None,
                        '200ms': int(cen[20]) if len(cen) > 20 else None, '800ms': int(cen[80]) if len(cen) > 80 else None},
        'width_db': width,
    }


FEATS = [('rise_ms', 'attack (10-90 %, ms)'), ('crest50_db', 'crest, first 50 ms (dB)'), ('umf_db', 'umf: 45-180 Hz share, 0-150 ms (dB)'),
         ('crack_db', 'crack: 1-8 kHz share, 0-20 ms (dB)'), ('body_db', 'body: 180 Hz-1 kHz share, 0-300 ms (dB)'),
         ('tail_db', 'tail: after 300 ms vs before (dB)'), ('t30_all', 'decay T30 (s)')]


def compare(ref, cand):
    """Rows (feature, ref, cand, delta) and plain suggestions for making cand hit like ref."""
    rows, tips = [], []
    for k, label in FEATS:
        a, b = ref.get(k), cand.get(k)
        d = None if a is None or b is None else round(b - a, 1)
        rows.append((label, a, b, d))
    d = lambda k: (cand.get(k) or 0) - (ref.get(k) or 0)  # noqa: E731
    if d('umf_db') < -3:
        tips.append(f'too little umf: raise 45-180 Hz in the first 150 ms by about {-d("umf_db"):.0f} dB (a thump that drops in pitch)')
    if d('umf_db') > 4:
        tips.append(f'too much low end up front ({d("umf_db"):+.0f} dB): it will sound woolly, not sharp')
    if d('crack_db') < -4:
        tips.append(f'the crack is soft: add {-d("crack_db"):.0f} dB of 1-8 kHz in the first 20 ms (a sharper N-wave)')
    if (cand.get('rise_ms') or 0) > 2 * max(2, ref.get('rise_ms') or 0):
        tips.append('the attack is slow: the front should reach full level within a few ms')
    if d('tail_db') < -5:
        tips.append(f'the tail is short or weak ({d("tail_db"):+.0f} dB): more rumble/echo after 300 ms')
    if d('tail_db') > 5:
        tips.append(f'the tail is heavy ({d("tail_db"):+.0f} dB) next to the hit: tighten it or lift the hit')
    for nm, _, _ in BANDS:
        ra, ca = ref['bands'][nm]['win_db'], cand['bands'][nm]['win_db']
        for (a, b), x, y in zip(WINS, ra, ca):
            if x > -25 and y - x < -8:
                tips.append(f'{nm} band is {x - y:.0f} dB short at {int(a * 1000)}-{int(b * 1000)} ms')
    return rows, tips


# ---------------------------------------------------------------- pictures (PNG without matplotlib)


def _png(path, img):
    h, w, _ = img.shape
    raw = b''.join(b'\x00' + img[y].tobytes() for y in range(h))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)  # noqa: E731
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw, 6)) + ch(b'IEND', b''))


def _cmap(v):
    v = np.clip(v, 0, 1)
    return (np.stack([np.clip(1.5 * v - 0.2, 0, 1), np.clip(2.0 * v - 1.0, 0, 1) ** 0.8,
                      np.clip(np.sin(np.pi * v) * 0.9 + (v > 0.85) * (v - 0.85) * 4, 0, 1)], -1) * 255).astype(np.uint8)


def spectrogram_png(m, sr, path, dur=3.0, w=900, h=260):
    m = np.pad(m[:int(dur * sr)], (0, max(0, int(dur * sr) - len(m))))
    hop = max(32, len(m) // w)
    f, t, S = ss.stft(m, sr, nperseg=2048, noverlap=2048 - hop)
    P = 20 * np.log10(np.abs(S) + 1e-9)
    P -= P.max()
    fr = np.geomspace(25, 16000, h)
    img = P[np.searchsorted(f, fr).clip(0, len(f) - 1)][::-1]
    img = img[:, np.linspace(0, img.shape[1] - 1, w).astype(int)]
    rgb = _cmap((img + 80) / 80)
    for g in (100, 1000, 10000):
        rgb[h - 1 - int(np.searchsorted(fr, g)), ::6] = 255
    _png(path, rgb)


def bands_png(m, sr, path, dur=3.0, w=900, h=220):
    """One line per band (sub at the bottom in deep red .. air at the top in pale blue): level over time, 50 dB."""
    img = np.full((h, w, 3), 12, np.uint8)
    cols = [(200, 40, 40), (230, 90, 40), (240, 160, 40), (200, 210, 60), (110, 210, 90), (60, 190, 200), (90, 140, 240), (180, 180, 250)]
    n = int(dur * sr)
    m = np.pad(m[:n], (0, max(0, n - len(m))))
    k = max(1, n // w)
    ref = None
    for (nm, lo, hi), c in zip(BANDS, cols):
        y = ss.sosfilt(_sos(lo, hi, sr), m)
        p = np.sqrt((y[:k * w] ** 2).reshape(w, k).mean(1))
        d = 20 * np.log10(p + 1e-9)
        ref = d.max() if ref is None else max(ref, d.max())
        img_line = d
        setattr(bands_png, nm, img_line)
    for (nm, lo, hi), c in zip(BANDS, cols):
        d = getattr(bands_png, nm)
        yy = np.clip(((ref - d) / 50) * (h - 1), 0, h - 1).astype(int)
        for x in range(w):
            y0 = yy[x - 1] if x else yy[x]
            a, b = sorted((y0, yy[x]))
            img[a:b + 1, x] = c
    _png(path, img)


# ---------------------------------------------------------------- the listening page


def write_clip(x, sr, path, t0, dur=3.0):
    from scipy.io import wavfile
    seg = x[max(0, int((t0 - 0.1) * sr)):int((t0 + dur) * sr)]
    seg = seg / (np.abs(seg).max() + 1e-9) * 0.89
    wavfile.write(path, sr, (seg * 32767).astype(np.int16))


def page(entries, out_dir, title='Impacts'):
    """entries: [{'profile', 'clip', 'spec', 'bands', 'compare': (rows, tips) or None}] -> index.html"""
    def row(p):
        return ''.join(f'<td>{p.get(k)}</td>' for k, _ in FEATS)
    h = [f'<!doctype html><meta charset="utf-8"><title>{title}</title><style>body{{background:#0b0c0a;color:#ddd;font:13px/1.45 system-ui;margin:24px}}'
         'h2{font-size:15px;margin:28px 0 6px;color:#c6f432}img{display:block;margin:4px 0;border:1px solid #222}td,th{padding:2px 8px;border-bottom:1px solid #222;text-align:right}'
         'th{color:#999;font-weight:400}table{border-collapse:collapse;margin:8px 0}.tip{color:#ffb38a}</style>',
         f'<h1 style="font-size:18px">{title}</h1><table><tr><th>sound</th>' + ''.join(f'<th>{lab}</th>' for _, lab in FEATS) + '</tr>']
    for e in entries:
        h.append(f'<tr><td style="text-align:left">{e["profile"]["name"]}</td>{row(e["profile"])}</tr>')
    h.append('</table>')
    for e in entries:
        p = e['profile']
        h.append(f'<h2>{p["name"]} <span style="color:#777">@ {p["t0"]} s</span></h2>')
        h.append(f'<audio controls preload="none" src="{os.path.basename(e["clip"])}"></audio>')
        h.append(f'<img src="{os.path.basename(e["spec"])}" title="spectrogram 25 Hz-16 kHz, 3 s"><img src="{os.path.basename(e["bands"])}" title="bands over time">')
        lp = p['low_pitch_hz']
        h.append(f'<div>low thump pitch: {lp} · centroid: {p["centroid_hz"]} · peak {p["peak_dbfs"]} dBFS · width {p["width_db"]} dB</div>')
        h.append('<table><tr><th>band</th>' + ''.join(f'<th>{int(a * 1000)}-{int(b * 1000)} ms</th>' for a, b in WINS) + '<th>T30 s</th></tr>')
        for nm, lo, hi in BANDS:
            bd = p['bands'][nm]
            h.append(f'<tr><td style="text-align:left">{nm} {lo}-{hi}</td>' + ''.join(f'<td>{v}</td>' for v in bd['win_db']) + f'<td>{bd["t30"]}</td></tr>')
        h.append('</table>')
        if e.get('compare'):
            rows, tips = e['compare']
            h.append('<table><tr><th>vs reference</th><th>ref</th><th>this</th><th>delta</th></tr>' +
                     ''.join(f'<tr><td style="text-align:left">{a}</td><td>{b}</td><td>{c}</td><td>{d}</td></tr>' for a, b, c, d in rows) + '</table>')
            h.extend(f'<div class="tip">• {t}</div>' for t in tips)
    with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(h))
    return os.path.join(out_dir, 'index.html')


def analyse_file(path, sr=48000, top=1, out_dir=None, ref=None, at=None, log=print):
    """Find the strongest impacts in a file (or use `at` times), profile each, write clips and pictures."""
    from .decode import load_audio
    x = load_audio(path, sr).astype(np.float64)
    times = at if at else find_impacts(x, sr, top=top)
    base = os.path.splitext(os.path.basename(path))[0]
    out = []
    for k, t in enumerate(times):
        nm = base + (f' #{k + 1}' if len(times) > 1 else '')
        p = profile(x, sr, t, name=nm)
        e = {'profile': p}
        if out_dir:
            stem = os.path.join(out_dir, f'{base}_{k + 1}')
            write_clip(x, sr, stem + '.wav', t)
            m = _mono(x[int(max(0, t - 0.1) * sr):])
            spectrogram_png(m, sr, stem + '_spec.png')
            bands_png(m, sr, stem + '_bands.png')
            e.update(clip=stem + '.wav', spec=stem + '_spec.png', bands=stem + '_bands.png')
            np.save(stem + '_fp.npy', fingerprint(_mono(x[int(t * sr):]), sr, dur=3.0).astype(np.float32))
        if ref is not None:
            e['compare'] = compare(ref, p)
        out.append(e)
        log(f'{nm} @ {t:.3f}s: umf {p["umf_db"]} dB, crack {p["crack_db"]} dB, body {p["body_db"]} dB, tail {p["tail_db"]} dB, '
            f'attack {p["rise_ms"]} ms, T30 {p["t30_all"]} s, thump {p["low_pitch_hz"]}')
    return out


def save_json(entries, path):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump([e['profile'] for e in entries], f, indent=1)
