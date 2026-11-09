"""Real recordings as first-class sound sources: the sample layer engine.

The field recordings in reference/sounds/refs/<category>/ (MANIFEST.md there) are decoded once to 48 kHz stereo
float32 (cached as .npy under refs/_cache/), analysed once (loudness envelope, onsets, steady stretches; cached as
JSON), then cut, looped, stretched, smeared and placed in a space:

    from sound_lab import samples as S
    x = S.load('engines/ferry_engine_room_1')            # any unique part of a path works: 'ferry_engine_room_1', 'fs74914'
    bed = S.bed('ferry_engine_room_1', 60, seed=3)        # a minute of engine room, no audible loop (random chunks, crossfaded)
    hit = S.hit('metal_shed_door_hits', 7)                # the 8th strongest clang, trimmed to its decay
    spin = S.vari(S.seg('electric_motor_2', 4, 6), [(0, 0.4), (3, 1.0)])   # the motor's pitch and speed ramped (tape-style)
    long = S.stretch(x, 2.0)                             # twice as long, same pitch (phase vocoder)
    smear = S.granular(x, 30, grain=0.15, density=40)    # a smooth bed from any texture
    far = S.distance(hit, 800)                           # 1/r, air absorption (high frequencies lost with range)
    wet = S.space(far, 'open_sea', 0.4)                  # or 'engine_room', 'power_room', 'hangar', 'deck', 'hull', 'sky', 'water'
    sub = S.underwater(x)                                # heard from under the water
    thru = S.through_hull(x)                             # structure-borne: heard through steel (space, an orbital ship)

Everything is deterministic (seeded), stereo (n, 2) float64 at 48 kHz unless stated.
"""
import glob
import hashlib
import json
import os

import numpy as np
import scipy.signal as ss
import soundfile as sf

from . import dsp
from .dsp import SR, n_of, rng

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
REFS = os.path.join(ROOT, 'reference', 'sounds', 'refs')
CACHE = os.path.join(REFS, '_cache')
_MEM = {}
_ANA = {}
EXTS = ('.mp3', '.wav', '.flac', '.ogg', '.aif', '.aiff', '.mp4', '.m4a')


# ---------------------------------------------------------------- finding and loading


def catalog():
    """Every reference recording under refs/ (relative paths, without the analysis folders)."""
    out = []
    for p in glob.glob(os.path.join(REFS, '**', '*'), recursive=True):
        rel = os.path.relpath(p, REFS).replace('\\', '/')
        if rel.startswith('_') or '/_' in rel or not rel.lower().endswith(EXTS):
            continue
        out.append(rel)
    return sorted(out)


def find(key):
    """A recording by any unique part of its path ('motors/servo_motor', 'servo_motor', 'fs776274')."""
    if os.path.isabs(key) and os.path.exists(key):
        return key
    cat = catalog()
    k = key.replace('\\', '/').lower()
    hit = [c for c in cat if c.lower() == k or os.path.splitext(c.lower())[0] == k]
    if not hit:
        hit = [c for c in cat if k in c.lower()]
    if not hit:
        raise KeyError(f'no reference recording matches {key!r} (see reference/sounds/refs/MANIFEST.md)')
    if len(hit) > 1:                      # 'jet_engine' means jet_engine_fs152509, not jet_engine_start_cart
        import re
        stem = lambda c: re.sub(r'_fs\d+$', '', os.path.basename(os.path.splitext(c)[0]).lower())  # noqa: E731
        exact = [c for c in hit if stem(c) == k.split('/')[-1]]
        if len(exact) != 1:
            exact = [c for c in hit if os.path.basename(os.path.splitext(c)[0]).lower().startswith(k.split('/')[-1])]
        hit = exact if len(exact) == 1 else hit
    if len(hit) > 1:
        raise KeyError(f'{key!r} is ambiguous: {hit[:6]}')
    return os.path.join(REFS, hit[0])


def _decode(path):
    try:
        x, sr = sf.read(path, dtype='float32', always_2d=True)
    except Exception:
        exe = _ffmpeg()
        import subprocess
        raw = subprocess.run([exe, '-v', 'error', '-i', path, '-vn', '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                             capture_output=True, check=True).stdout
        return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()
    if x.shape[1] == 1:
        x = np.repeat(x, 2, 1)
    elif x.shape[1] > 2:
        x = x[:, :2]
    if sr != SR:
        g = np.gcd(int(sr), SR)
        x = ss.resample_poly(x, SR // g, int(sr) // g, axis=0).astype(np.float32)
    return x


def load(key):
    """The recording at 48 kHz stereo float32 (decoded once, cached; DC removed). Read-only: copy before editing."""
    path = find(key)
    if path in _MEM:
        return _MEM[path]
    os.makedirs(CACHE, exist_ok=True)
    rel = os.path.relpath(path, REFS).replace('\\', '/')
    c = os.path.join(CACHE, rel.replace('/', '__') + '.npy')
    if os.path.exists(c) and os.path.getmtime(c) >= os.path.getmtime(path):
        x = np.load(c, mmap_mode='r')
    else:
        x = _decode(path)
        x = x - x.mean(0, keepdims=True)
        np.save(c, x.astype(np.float32))
        x = np.load(c, mmap_mode='r')
    _MEM[path] = x
    return x


def dur(key):
    return len(load(key)) / SR


# ---------------------------------------------------------------- analysis (cached)


def _env_db(x, hop=0.01):
    m = np.asarray(x, np.float64).mean(1) if np.ndim(x) == 2 else np.asarray(x, np.float64)
    h = n_of(hop)
    k = len(m) // h
    r = np.sqrt((m[:k * h].reshape(k, h) ** 2).mean(1) + 1e-12)
    return 20 * np.log10(r + 1e-9)


def analyse(key):
    """{'dur', 'rms_db', 'env' (10 ms dB), 'onsets' [(t, strength dB)], 'centroid'} for a recording (cached)."""
    path = find(key)
    if path in _ANA:
        return _ANA[path]
    rel = os.path.relpath(path, REFS).replace('\\', '/')
    c = os.path.join(CACHE, rel.replace('/', '__') + '.json')
    if os.path.exists(c) and os.path.getmtime(c) >= os.path.getmtime(path):
        with open(c) as f:
            a = json.load(f)
        a['env'] = np.array(a['env'])
        _ANA[path] = a
        return a
    x = load(key)
    env = _env_db(x)
    # onsets: a rise of the 10 ms envelope well over its recent floor
    fl = ss.medfilt(env, 51)
    rise = env - fl
    jump = env - np.r_[env[:3], env[:-3]]
    cand = np.where((jump > 6) & (rise > 6))[0]
    ons = []
    for i in cand:
        if ons and i - ons[-1][0] < 15:
            if env[i] > ons[-1][1]:
                ons[-1] = (i, float(env[i]))
            continue
        pk = float(env[i:i + 8].max())
        ons.append((i, pk))
    m = np.asarray(x[:min(len(x), SR * 60)], np.float64).mean(1)
    f, P = ss.welch(m, SR, nperseg=4096)
    cen = float((f * P).sum() / max(P.sum(), 1e-20))
    a = {'dur': len(x) / SR, 'rms_db': float(10 * np.log10((np.asarray(x[::7], np.float64) ** 2).mean() + 1e-12)),
         'env': env, 'onsets': [(i * 0.01, p) for i, p in ons], 'centroid': cen}
    with open(c, 'w') as f_:
        json.dump(dict(a, env=[round(float(v), 1) for v in env]), f_)
    _ANA[path] = a
    return a


def onsets(key, top=None, min_db=None, t0=0.0, t1=None):
    """Onset times of a recording, strongest first when top is given: [(t, peak dB)]."""
    a = analyse(key)
    o = [(t, p) for t, p in a['onsets'] if t >= t0 and (t1 is None or t <= t1) and (min_db is None or p >= min_db)]
    if top:
        o = sorted(o, key=lambda q: -q[1])[:top]
    return o


def steady(key, length, t0=0.0, t1=None, loud=0.6):
    """The start of the steadiest stretch of `length` s (least loudness wobble, among the louder stretches): the
    part to loop for a bed."""
    a = analyse(key)
    e = a['env']
    L = max(1, int(length / 0.01))
    i0, i1 = int(t0 / 0.01), len(e) if t1 is None else min(len(e), int(t1 / 0.01))
    if i1 - i0 <= L:
        return t0
    c1 = np.cumsum(np.r_[0, e[i0:i1]])
    c2 = np.cumsum(np.r_[0, e[i0:i1] ** 2])
    mu = (c1[L:] - c1[:-L]) / L
    sd = np.sqrt(np.maximum((c2[L:] - c2[:-L]) / L - mu ** 2, 0))
    thr = np.quantile(mu, 1 - loud)
    score = sd + 10 * (mu < thr)
    return (i0 + int(np.argmin(score))) * 0.01


# ---------------------------------------------------------------- cutting


def seg(key, t0=0.0, length=None, fin=0.01, fout=0.05):
    """A stretch of a recording (copied, float64, faded at its ends)."""
    x = load(key)
    a = n_of(t0)
    b = len(x) if length is None else min(len(x), a + n_of(length))
    y = np.array(x[a:b], np.float64)
    return dsp.fade(y, fin, fout) if len(y) > n_of(fin + fout) else y


def hit(key, i=0, length=None, pre=0.008, tail_db=-45.0, top=40, t0=0.0, t1=None, fout=0.08):
    """The i-th strongest onset of a recording, cut from just before its attack to where it has decayed tail_db
    below its peak (or `length` s)."""
    o = onsets(key, top=top, t0=t0, t1=t1)
    if not o:
        raise ValueError(f'{key}: no onsets')
    t, pk = o[i % len(o)]
    if length is None:
        e = analyse(key)['env']
        j = int(t / 0.01)
        k = j + 2
        while k < len(e) - 1 and e[k] > pk + tail_db and k - j < 600:
            k += 1
        nxt = [q for q, _ in analyse(key)['onsets'] if q > t + 0.06]
        end = k * 0.01
        if nxt and nxt[0] < end and pk - analyse(key)['env'][int(nxt[0] / 0.01)] < 10:
            end = nxt[0] - 0.005               # the next strike starts before this one has died: stop there
        length = max(0.08, end - t + pre)
    return seg(key, max(0.0, t - pre), length + pre, 0.001, min(fout, length * 0.4))


def hits(key, n, seed=0, top=40, **kw):
    """n different strikes of a recording, in a seeded random order (variety for repeated events)."""
    r = rng(seed)
    idx = r.permutation(min(top, len(onsets(key, top=top))))
    return [hit(key, int(idx[k % len(idx)]), top=top, **kw) for k in range(n)]


# ---------------------------------------------------------------- looping and texture


def xfade_join(parts, xf):
    """Join stereo parts with equal-power crossfades of xf s."""
    k = n_of(xf)
    out = parts[0].copy()
    for p in parts[1:]:
        kk = min(k, len(out) // 2, len(p) // 2)
        if kk < 2:
            out = np.concatenate([out, p])
            continue
        w = np.linspace(0, np.pi / 2, kk)[:, None]
        mid = out[-kk:] * np.cos(w) + p[:kk] * np.sin(w)
        out = np.concatenate([out[:-kk], mid, p[kk:]])
    return out


def bed(key, length, seed=0, chunk=(5.0, 11.0), xfade=1.2, t0=None, t1=None, region=None, fin=1.0, fout=1.5):
    """`length` s of a recording's texture with no audible loop: random chunks from its steadiest region (or
    [t0, t1]), each from a fresh offset, joined with long equal-power crossfades."""
    x = load(key)
    D = len(x) / SR
    if t0 is None:
        reg = region or min(D, max(chunk[1] * 2.5, min(D * 0.8, 60.0)))
        t0 = steady(key, reg) if D > reg + 1 else 0.0
        t1 = min(D, t0 + reg)
    t1 = D if t1 is None else min(t1, D)
    r = rng(seed)
    parts, got = [], 0.0
    while got < length + xfade:
        c = min(r.uniform(*chunk), t1 - t0)
        s = r.uniform(t0, max(t0, t1 - c))
        parts.append(np.array(x[n_of(s):n_of(s + c)], np.float64))
        got += c - xfade
    y = xfade_join(parts, xfade)[:n_of(length)]
    return dsp.fade(y, fin, fout)


def loop(x, length, xfade=0.5):
    """A stretch looped to `length` s with an equal-power crossfade at each seam."""
    x = np.asarray(x, np.float64)
    if len(x) / SR >= length:
        return x[:n_of(length)].copy()
    reps = int(np.ceil(length / max(len(x) / SR - xfade, 0.05))) + 1
    return xfade_join([x] * reps, xfade)[:n_of(length)]


def granular(src, length, grain=0.12, density=40.0, pos=None, jitter=0.6, pitch=0.0, pitch_jitter=0.15, seed=0,
             spread=0.7):
    """A smooth bed from any texture: Hann grains (grain s, density per s) read around a position that drifts
    through the source (pos: None = the whole source, (a, b) = a stretch in s, or a breakpoint curve [(t, s)]),
    pitched (semitones, jittered per grain), spread across the stereo field."""
    src = np.asarray(src, np.float64)
    if src.ndim == 1:
        src = np.c_[src, src]
    r = rng(seed)
    n = n_of(length)
    out = np.zeros((n + n_of(grain * 3), 2))
    D = len(src) / SR
    if pos is None:
        pcurve = lambda t: (t / max(length, 1e-6)) * max(D - grain * 2, 0)  # noqa: E731
    elif isinstance(pos, tuple) and len(pos) == 2 and not isinstance(pos[0], (tuple, list)):
        a, b = pos
        pcurve = lambda t: a + (b - a) * (t / max(length, 1e-6))  # noqa: E731
    else:
        P = np.array(pos, np.float64)
        pcurve = lambda t: float(np.interp(t, P[:, 0], P[:, 1]))  # noqa: E731
    t = 0.0
    g0 = n_of(grain)
    while t < length:
        g = max(32, int(g0 * r.uniform(0.75, 1.3)))
        sh = 2 ** ((pitch + pitch_jitter * r.standard_normal()) / 12)
        L = int(g * sh) + 2
        p = pcurve(t) + jitter * r.standard_normal()
        st = int(np.clip(p * SR, 0, max(0, len(src) - L - 1)))
        seg_ = src[st:st + L]
        if len(seg_) < L:
            t += 1 / density
            continue
        idx = np.arange(g) * sh
        w = np.hanning(g)
        y = np.c_[np.interp(idx, np.arange(L), seg_[:, 0]), np.interp(idx, np.arange(L), seg_[:, 1])] * w[:, None]
        pp = (r.uniform(-spread, spread) + 1) * np.pi / 4
        i = n_of(t)
        out[i:i + g, 0] += y[:, 0] * np.cos(pp) * 1.414
        out[i:i + g, 1] += y[:, 1] * np.sin(pp) * 1.414
        t += r.exponential(1 / density)
    # overlap-add of random grains: keep the level near the source's (density * grain overlaps, incoherent)
    out /= np.sqrt(max(density * grain * 0.375, 0.2))
    return out[:n]


# ---------------------------------------------------------------- speed, pitch, time


def vari(x, rate, length=None):
    """Tape-style varispeed: rate (scalar or breakpoints [(t_out, rate)]) speeds up pitch and time together (a motor
    spinning up, a turbine spooling down). Output stops at `length` s or when the source runs out."""
    x = np.asarray(x, np.float64)
    if x.ndim == 1:
        x = np.c_[x, x]
    if np.isscalar(rate):
        n = int(len(x) / rate) if length is None else n_of(length)
        pos = np.arange(n) * rate
    else:
        P = np.array(rate, np.float64)
        n = n_of(length) if length is not None else int(len(x) / max(P[:, 1].mean(), 1e-3)) + n_of(1)
        r_ = np.interp(np.arange(n) / SR, P[:, 0], P[:, 1])
        pos = np.concatenate([[0.0], np.cumsum(r_)[:-1]])
    keep = pos < len(x) - 2
    pos = pos[keep]
    # anti-alias when speeding up a lot (a gentle low-pass on the source, fixed at the top rate)
    top = float(np.max(rate)) if np.isscalar(rate) else float(np.max(np.array(rate)[:, 1]))
    if top > 1.15:
        x = dsp.butter(x, 'lp', min(0.45 * SR / top, 20000), 4)
    i = pos.astype(np.int64)
    f = (pos - i)[:, None]
    # 4-point cubic (Catmull-Rom) interpolation
    xm1, x0, x1, x2 = x[np.maximum(i - 1, 0)], x[i], x[np.minimum(i + 1, len(x) - 1)], x[np.minimum(i + 2, len(x) - 1)]
    y = x0 + 0.5 * f * (x1 - xm1 + f * (2 * xm1 - 5 * x0 + 4 * x1 - x2 + f * (3 * (x0 - x1) + x2 - xm1)))
    return y


def stretch(x, factor, n_fft=4096, hop=None):
    """Phase-vocoder time stretch (factor 2 = twice as long), pitch kept; phases locked to the spectral peaks
    (fewer phasey artefacts on tonal machinery)."""
    x = np.asarray(x, np.float64)
    if x.ndim == 1:
        x = np.c_[x, x]
    if abs(factor - 1) < 1e-3:
        return x.copy()
    hop = hop or n_fft // 8
    hs = int(round(hop * factor))
    win = np.hanning(n_fft)
    out_n = int(len(x) * factor) + n_fft
    out = np.zeros((out_n, 2))
    norm = np.zeros(out_n)
    frames = (len(x) - n_fft) // hop
    if frames < 2:
        return vari(x, 1 / factor)
    k = np.arange(n_fft // 2 + 1)
    omega = 2 * np.pi * k * hop / n_fft
    for ch in range(2):
        X = np.stack([np.fft.rfft(win * x[i * hop:i * hop + n_fft, ch]) for i in range(frames)])
        mag, ph = np.abs(X), np.angle(X)
        acc = ph[0].copy()
        for i in range(frames):
            if i:
                dphi = ph[i] - ph[i - 1] - omega
                dphi -= 2 * np.pi * np.round(dphi / (2 * np.pi))
                acc += (omega + dphi) * factor
            # phase locking: every bin takes the phase offset of its nearest peak
            m = mag[i]
            pk = np.where((m[1:-1] > m[:-2]) & (m[1:-1] >= m[2:]))[0] + 1
            if len(pk):
                near = pk[np.clip(np.searchsorted(pk, k), 0, len(pk) - 1)]
                prev = pk[np.clip(np.searchsorted(pk, k) - 1, 0, len(pk) - 1)]
                near = np.where(np.abs(prev - k) < np.abs(near - k), prev, near)
                yph = acc[near] + (ph[i] - ph[i][near])
            else:
                yph = acc
            y = np.fft.irfft(m * np.exp(1j * yph), n_fft) * win
            o = i * hs
            out[o:o + n_fft, ch] += y
            if ch == 0:
                norm[o:o + n_fft] += win ** 2
    out /= np.maximum(norm, 1e-3)[:, None]
    return out[:int(len(x) * factor)]


def shift(x, semis):
    """Pitch shift by semitones, length kept (stretch, then varispeed back)."""
    if abs(semis) < 1e-3:
        return np.asarray(x, np.float64).copy()
    r = 2 ** (semis / 12)
    y = stretch(x, r)
    return vari(y, r)


# ---------------------------------------------------------------- tone shaping


def eq(x, hp=None, lp=None, low=None, high=None, peaks=(), order=2):
    """hp/lp Hz (Butterworth), low/high shelves (f, dB), peaks [(f, dB, q)]."""
    y = np.asarray(x, np.float64)
    if hp:
        y = dsp.butter(y, 'hp', hp, order)
    if lp:
        y = dsp.butter(y, 'lp', lp, order)
    if low:
        y = dsp.filt(y, 'lowshelf', low[0], 0.7, low[1])
    if high:
        y = dsp.filt(y, 'highshelf', high[0], 0.7, high[1])
    for f, g, q in peaks:
        y = dsp.filt(y, 'peak', f, q, g)
    return y


def fir_curve(points_db, ntaps=2047):
    """A linear-phase FIR from a gain curve [(Hz, dB)] (log-interpolated)."""
    P = np.array(sorted(points_db), np.float64)
    f = np.linspace(0, SR / 2, 512)
    lf = np.log10(np.maximum(f, 10))
    g = np.interp(lf, np.log10(np.maximum(P[:, 0], 10)), P[:, 1])
    return ss.firwin2(ntaps, f / (SR / 2), 10 ** (g / 20))


def apply_fir(x, h):
    x = np.asarray(x, np.float64)
    if x.ndim == 1:
        x = np.c_[x, x]
    d = (len(h) - 1) // 2
    y = np.c_[ss.oaconvolve(x[:, 0], h), ss.oaconvolve(x[:, 1], h)]
    return y[d:d + len(x)]


def air_db(f, m, humidity=0.5):
    """Atmospheric absorption (dB) over m metres at f Hz (a fit to ISO 9613-1 at 20 C; drier air loses more top)."""
    f = np.asarray(f, np.float64) / 1000.0
    a = (0.0011 * f + 0.0046 * f ** 2 + 0.0041 * f ** 1.5) * (0.5 / max(humidity, 0.1)) ** 0.4   # dB per metre
    return -a * m


_FIRS = {}


def distance(x, m, ref=10.0, air=True, ground=0.0, delay=False, humidity=0.5):
    """A source moved to m metres (measured at ref m): spherical spreading (1/r), the air's high-frequency loss,
    an optional ground-effect dip (ground 0..1: a broad 300-600 Hz hollow over land or sea), and optionally the
    travel delay (m / 343 s)."""
    y = np.asarray(x, np.float64)
    if y.ndim == 1:
        y = np.c_[y, y]
    g = ref / max(m, ref * 0.1)
    if air and m > 30:
        key = (int(m), round(humidity, 2), round(ground, 2))
        if key not in _FIRS:
            fs = [20, 100, 250, 500, 1000, 2000, 4000, 8000, 12000, 16000, 20000]
            pts = [(f, max(-80.0, float(air_db(f, m, humidity)))) for f in fs]
            if ground:
                pts = [(f, d - ground * 6 * np.exp(-((np.log2(f / 420)) ** 2) / 0.6)) for f, d in pts]
            _FIRS[key] = fir_curve(pts)
        y = apply_fir(y, _FIRS[key])
    y = y * g
    if delay:
        y = np.concatenate([np.zeros((n_of(m / 343.0), 2)), y])
    return y


# ---------------------------------------------------------------- spaces


_IRS = {}
SPACES = {  # t60 (s), predelay, early spread (s), brightness 0..1, early level, density fade-in, low t60 x, width
    'engine_room': (1.6, 0.006, 0.030, 0.55, 1.0, 0.006, 1.2, 0.9),     # steel, machinery everywhere, dense and short
    'power_room': (1.1, 0.008, 0.035, 0.50, 0.9, 0.008, 1.1, 0.9),
    'compartment': (0.55, 0.004, 0.014, 0.50, 0.9, 0.004, 1.0, 0.8),
    'hangar': (3.6, 0.025, 0.090, 0.45, 0.6, 0.030, 1.3, 1.0),           # a big steel hall (the magazine, the fab bay)
    'deck': (0.8, 0.018, 0.080, 0.45, 0.45, 0.030, 1.0, 1.0),            # out on deck: superstructure slaps, no tail
    'open_sea': (2.4, 0.045, 0.400, 0.25, 0.30, 0.200, 1.6, 1.0),        # the sea at night: sparse late echoes, a low tail
    'sky': (6.5, 0.080, 0.600, 0.30, 0.35, 0.120, 1.8, 1.0),             # a big report rolling round the horizon
    'water': (0.9, 0.003, 0.012, 0.12, 0.6, 0.003, 1.3, 0.7),            # under the water
    'hull': (1.3, 0.002, 0.010, 0.30, 1.0, 0.002, 1.5, 0.6),             # inside steel structure (structure-borne)
    'hall': (2.3, 0.022, 0.060, 0.62, 0.50, 0.020, 1.2, 1.0),            # a scoring stage (the score's sampled orchestra)
}


def ir(kind):
    """A stereo impulse response for a space: three-band exponential decay (lows ring longer), sparse early
    reflections, density fading in; unit energy."""
    if kind in _IRS:
        return _IRS[kind]
    t60, pre, spread, bright, early, fin, low_x, wid = SPACES[kind]
    seed = int(hashlib.md5(kind.encode()).hexdigest()[:6], 16)
    r = rng(seed)
    n = n_of(pre + t60 * low_x * 1.2)
    t = np.maximum(np.arange(n) / SR - pre, 0)
    nz = r.standard_normal((n, 2))
    nz[:, 1] = wid * nz[:, 1] + (1 - wid) * nz[:, 0]
    out = np.zeros((n, 2))
    bands = [(0, 250, low_x), (250, 1200, 1.0), (1200, 4500, 0.55 + 0.4 * bright), (4500, SR / 2, 0.2 + 0.5 * bright)]
    for lo, hi, m in bands:
        if lo == 0:
            b = dsp.butter(nz, 'lp', hi, 4)
        elif hi >= SR / 2:
            b = dsp.butter(nz, 'hp', lo, 4)
        else:
            b = dsp.butter(dsp.butter(nz, 'hp', lo, 4), 'lp', hi, 4)
        out += b * (10 ** (-3 * t / (t60 * m)))[:, None]
    out *= (np.arange(n) / SR >= pre)[:, None]
    out *= np.clip(t / max(fin, 1e-4), 0, 1)[:, None] ** 2
    for k in range(24):
        at = pre * 0.4 + spread * (k / 24) ** 1.4 + r.random() * spread / 24
        i = n_of(at)
        if i < n - 8:
            g = early * (1 - k / 26) * r.uniform(0.4, 1.0)
            s = k % 2
            out[i, s] += 2 * g * r.choice([-1, 1])
            out[i + 2 + r.integers(0, 6), 1 - s] += g * r.choice([-1, 1])
    out = dsp.butter(out, 'lp', 2500 + 16000 * bright, 2)
    if kind == 'hull':     # steel rings: a few strong plate modes in the tail
        for f0 in (61, 97, 143, 211, 333, 517):
            out += 0.02 * np.c_[np.sin(2 * np.pi * f0 * t), np.sin(2 * np.pi * f0 * 1.004 * t + 1)] * \
                   (10 ** (-3 * t / (t60 * 0.8)))[:, None] * (t > 0)[:, None]
    out /= np.sqrt((out ** 2).sum() / 2)
    _IRS[kind] = out
    return out


def space(x, kind, wet=0.3, dry=1.0, tail=True, pre_lp=None):
    """x in a space: convolution with its IR (wet), plus the dry signal. tail=True keeps the reverb's tail (longer
    output)."""
    y = np.asarray(x, np.float64)
    if y.ndim == 1:
        y = np.c_[y, y]
    h = ir(kind)
    src = dsp.butter(y, 'lp', pre_lp, 2) if pre_lp else y
    w = np.c_[ss.oaconvolve(src[:, 0], h[:, 0]), ss.oaconvolve(src[:, 1], h[:, 1])] * wet
    w[:len(y)] += y * dry
    return w if tail else w[:len(y)]


def underwater(x, depth=1.0, seed=0):
    """Heard from under the water: the top gone (a steep low-pass that closes with depth), the lows swollen, a slow
    wobble of pitch, a dark short room."""
    y = np.asarray(x, np.float64)
    if y.ndim == 1:
        y = np.c_[y, y]
    fc = 900 / (1 + 1.2 * depth)
    y = dsp.butter(y, 'lp', fc, 4)
    y = dsp.filt(y, 'lowshelf', 160, 0.7, 4 + 2 * depth)
    y = dsp.filt(y, 'peak', 90, 1.2, 2.0)
    n = len(y)
    wob = 1 + 0.0025 * np.sin(2 * np.pi * 0.31 * np.arange(n) / SR + seed)
    y = vari(y, [(i / SR, w) for i, w in zip(range(0, n, n_of(0.05)), wob[::n_of(0.05)])], length=n / SR)
    y = np.pad(y, ((0, max(0, n - len(y))), (0, 0)))[:n]
    return space(y, 'water', 0.45, 0.8)[:n + n_of(0.8)]


def through_hull(x, thick=1.0):
    """Structure-borne: what is left after steel has carried it (a low, resonant band, the plate's own ringing)."""
    y = np.asarray(x, np.float64)
    if y.ndim == 1:
        y = np.c_[y, y]
    y = dsp.butter(y, 'lp', 520 / thick, 4)
    y = dsp.butter(y, 'hp', 28, 2)
    for f0, g, q in ((48, 4, 3), (77, 5, 5), (118, 4, 6), (190, 3, 6), (305, 2, 5)):
        y = dsp.filt(y, 'peak', f0, q, g)
    return space(y, 'hull', 0.6, 0.7)


def pan(x, p):
    """Equal-power pan of stereo (or mono) material, -1..1 (p may be a scalar)."""
    y = np.asarray(x, np.float64)
    if y.ndim == 1:
        y = np.c_[y, y]
    a = (p + 1) * np.pi / 4
    return np.c_[y[:, 0] * np.cos(a) * 1.414, y[:, 1] * np.sin(a) * 1.414]


def mono(x):
    y = np.asarray(x, np.float64)
    return y.mean(1) if y.ndim == 2 else y


def envelope(x, points):
    """Multiply by a dB breakpoint curve [(t, dB)]."""
    y = np.asarray(x, np.float64)
    P = np.array(points, np.float64)
    e = np.interp(np.arange(len(y)) / SR, P[:, 0], P[:, 1])
    return y * (10 ** (e / 20))[:, None]


def level(x, db):
    """Set the active (gated) RMS level of x in dBFS, so each recording comes in at a known loudness."""
    y = np.asarray(x, np.float64)
    e = _env_db(y, 0.05)
    act = e[e > e.max() - 30]
    r = np.sqrt(np.mean(10 ** (act / 10))) if len(act) else 1e-6
    return y * (10 ** (db / 20) / max(r, 1e-9))


def tonality(x, n_fft=8192):
    """How beep-like a sound is: the peak-to-median ratio (dB) of its average spectrum above 400 Hz (machinery hum
    sits low; a whistle or a synth tone shows as a lone narrow peak up high)."""
    m = mono(x)
    f, P = ss.welch(m, SR, nperseg=n_fft)
    sel = (f > 400) & (f < 11000)
    Pd = 10 * np.log10(P[sel] + 1e-20)
    med = ss.medfilt(Pd, 101)
    i = np.argmax(Pd - med)
    return float((Pd - med)[i]), float(f[sel][i])


def stack(parts, length=None):
    """Layers summed into one sound: parts [(offset s, audio, gain dB)]."""
    items = []
    for t, x, db in parts:
        x = np.asarray(x, np.float64)
        items.append((n_of(t), np.c_[x, x] if x.ndim == 1 else x, 10 ** (db / 20)))
    n = n_of(length) if length else max(i + len(x) for i, x, _ in items)
    out = np.zeros((n, 2))
    for i, x, g in items:
        k = min(len(x), n - i)
        if k > 0:
            out[i:i + k] += x[:k] * g
    return out


def punch(x, drive=1.8, peak_db=-1.0, lows=0.0):
    """A big composite made dense and loud without a limiter's pumping: normalised, saturated (tanh, drive),
    renormalised to peak_db. lows (dB) lifts the body under 120 Hz before the drive."""
    y = np.asarray(x, np.float64)
    if lows:
        y = dsp.filt(y, 'lowshelf', 120, 0.7, lows)
    y = y / (np.abs(y).max() + 1e-12)
    y = np.tanh(drive * y) / np.tanh(drive)
    return y * 10 ** (peak_db / 20)


def detone(x, fmin=600.0, prom=10.0, q=25.0, most=8, n_fft=16384):
    """Notch out steady whistles and whines: the narrow lines of the average spectrum above fmin that stand prom dB
    over their surroundings (a valve whistling, a transformer's high harmonics), at most `most` of them."""
    y = np.asarray(x, np.float64)
    m = mono(y)
    f, P = ss.welch(m, SR, nperseg=min(n_fft, max(256, len(m) // 2)))
    Pd = 10 * np.log10(P + 1e-20)
    base = ss.medfilt(Pd, 61)
    ex = Pd - base
    ex[f < fmin] = 0
    ex[f > 16000] = 0
    pks, _ = ss.find_peaks(ex, height=prom, distance=8)
    pks = sorted(pks, key=lambda i: -ex[i])[:most]
    for i in pks:
        b, a = ss.iirnotch(f[i], q * (1 + ex[i] / 20), SR)
        y = ss.lfilter(b, a, y, axis=0)
        y = ss.lfilter(b, a, y, axis=0)
    return y


def dewhistle(x, fmin=800.0, over_db=9.0, n_fft=2048, width=41):
    """Take the whistles, whines and buzz lines out of a recording, frame by frame (they may glide): every STFT bin
    above fmin that stands more than over_db over the median of its neighbours (width bins) is pulled down to that
    level. Broadband sound (hiss, rumble, clatter) is left as it is."""
    y = np.asarray(x, np.float64)
    if y.ndim == 1:
        y = np.c_[y, y]
    n = len(y)
    hop = n_fft // 4
    f = np.fft.rfftfreq(n_fft, 1 / SR)
    lo = int(np.searchsorted(f, fmin))
    out = np.zeros_like(y)
    for ch in range(2):
        _, _, Z = ss.stft(y[:, ch], SR, nperseg=n_fft, noverlap=n_fft - hop, boundary='even')
        A = np.abs(Z)
        L = 20 * np.log10(A + 1e-12)
        med = ss.medfilt2d(L, (width, 1))
        ex = L - med - over_db
        g = np.ones_like(A)
        hot = ex > 0
        hot[:lo] = False
        g[hot] = 10 ** (-ex[hot] / 20)
        _, z = ss.istft(Z * g, SR, nperseg=n_fft, noverlap=n_fft - hop, boundary=True)
        out[:, ch] = np.pad(z, (0, max(0, n - len(z))))[:n]
    return out


def _ffmpeg():
    import shutil
    ff = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'WinGet', 'Packages')
    return (glob.glob(os.path.join(ff, 'Gyan.FFmpeg*', '*', 'bin', 'ffmpeg.exe')) or [shutil.which('ffmpeg') or 'ffmpeg'])[0]
