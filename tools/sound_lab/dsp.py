"""DSP building blocks for programmatic sound: band-limited oscillators, noise colours, envelopes, static and
time-varying filters, drive, delay, convolution reverb, chorus, doppler fly-bys, modal resonators, Karplus-Strong,
granular clouds, panning, compression and a true-peak-safe limiter. Everything is vectorised numpy/scipy at
48 kHz float64; stereo is (n, 2). Randomness always comes from a seeded Generator, so a sound renders identically
every time (like the films)."""
import numpy as np
import scipy.signal as ss
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d

SR = 48000
TAU = 2 * np.pi


def n_of(d):
    return max(1, int(round(d * SR)))


def time(d):
    return np.arange(n_of(d)) / SR


def rng(seed):
    return np.random.default_rng(seed)


def as_curve(v, n):
    """Scalar, array, or breakpoint list [(t, value), ...] (seconds) -> array of length n."""
    if isinstance(v, (list, tuple)) and v and isinstance(v[0], (list, tuple)):
        ts, vs = zip(*v)
        return np.interp(np.arange(n) / SR, ts, vs)
    if np.ndim(v) == 0:
        return np.full(n, float(v))
    v = np.asarray(v, np.float64)
    return v if len(v) == n else np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(v)), v)


def expo(a, b, n, curve=1.0):
    """Exponential glide from a to b (both > 0) over n samples; curve > 1 lingers at a."""
    x = np.linspace(0, 1, n) ** curve
    return a * (b / a) ** x


# ---------------------------------------------------------------- oscillators

def _blep(p, dt):
    out = np.zeros_like(p)
    m = p < dt
    x = p[m] / dt[m]
    out[m] = 2 * x - x * x - 1
    m = p > 1 - dt
    x = (p[m] - 1) / dt[m]
    out[m] = x * x + 2 * x + 1
    return out


def osc(kind, freq, dur, phase=0.0, pw=0.5):
    """sine | saw | square | tri | pulse. freq: Hz scalar/array/breakpoints. Saw/square are PolyBLEP band-limited."""
    n = n_of(dur)
    f = np.maximum(as_curve(freq, n), 0.0)
    dt = np.clip(f / SR, 1e-9, 0.5)
    p = (phase + np.cumsum(dt) - dt[0]) % 1.0
    if kind == 'sine':
        return np.sin(TAU * p)
    if kind == 'saw':
        return 2 * p - 1 - _blep(p, dt)
    if kind in ('square', 'pulse'):
        w = pw if kind == 'pulse' else 0.5
        y = np.where(p < w, 1.0, -1.0)
        return y + _blep(p, dt) - _blep((p - w) % 1.0, dt)
    if kind == 'tri':
        return 4 * np.abs(p - 0.5) - 1
    raise ValueError(kind)


def supersaw(freq, dur, voices=7, detune=0.18, seed=0, stereo=True):
    """JP-8000 style: detuned saws spread across the stereo field."""
    r = rng(seed)
    n = n_of(dur)
    f = as_curve(freq, n)
    spread = np.linspace(-1, 1, voices)
    L = np.zeros(n)
    R = np.zeros(n)
    for i, s in enumerate(spread):
        cents = s * detune * 100 * (1 + 0.1 * r.standard_normal())
        y = osc('saw', f * 2 ** (cents / 1200), dur, phase=r.random())
        g = 1.0 if i == voices // 2 else 0.7
        pl = 0.5 + 0.45 * s if stereo else 0.5
        L += y * g * np.cos(pl * np.pi / 2)
        R += y * g * np.sin(pl * np.pi / 2)
    return np.c_[L, R] / np.sqrt(voices)


def fm(carrier, ratio, index, dur, feedback=0.0):
    """Two-operator FM (phase modulation). index may be a curve (brightness envelope)."""
    n = n_of(dur)
    fc = as_curve(carrier, n)
    pc = np.cumsum(fc) / SR
    pm = np.cumsum(fc * ratio) / SR
    mod = np.sin(TAU * pm)
    if feedback:
        mod = np.sin(TAU * pm + feedback * mod)
    return np.sin(TAU * pc + as_curve(index, n) * mod)


def noise(dur, color='white', seed=0):
    """white | pink (-3 dB/oct) | brown (-6 dB/oct) | blue | violet; unit RMS."""
    n = n_of(dur)
    w = rng(seed).standard_normal(n)
    if color == 'white':
        return w
    X = np.fft.rfft(w)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1] if n > 1 else 1.0
    tilt = {'pink': -0.5, 'brown': -1.0, 'blue': 0.5, 'violet': 1.0}[color]
    y = np.fft.irfft(X * (f / 1000.0) ** tilt, n)
    return y / (np.sqrt(np.mean(y * y)) + 1e-12)


def crackle(dur, density, seed=0, decay_ms=1.5):
    """Sparse random clicks: density (per second) may be a curve. Embers, debris, static, rocket crackle."""
    n = n_of(dur)
    r = rng(seed)
    d = as_curve(density, n)
    hit = r.random(n) < d / SR
    amp = np.where(hit, r.choice([-1.0, 1.0], n) * r.random(n) ** 2, 0.0)
    k = max(2, int(decay_ms / 1000 * SR * 5))
    kern = np.exp(-np.arange(k) / (decay_ms / 1000 * SR))
    return ss.oaconvolve(amp, kern)[:n]


# ---------------------------------------------------------------- envelopes

def adsr(dur, a=0.01, d=0.1, s=0.7, r=0.2, curve=3.0):
    n = n_of(dur)
    t = np.arange(n) / SR
    rel = max(0.0, dur - r)
    y = np.where(t < a, (t / max(a, 1e-6)), np.where(t < a + d, 1 - (1 - s) * (1 - np.exp(-curve * (t - a) / max(d, 1e-6))) /
                                                      (1 - np.exp(-curve)), s))
    y = np.where(t >= rel, y * np.exp(-curve * (t - rel) / max(r, 1e-6)) * np.clip((dur - t) / max(r, 1e-6) * 4, 0, 1), y)
    return y


def decay(dur, t60, attack=0.002):
    t = time(dur)
    return np.minimum(1.0, t / max(attack, 1e-6)) * 10 ** (-3 * t / t60)


def env(points, dur):
    """Breakpoints [(t, level), ...] -> curve."""
    return as_curve(list(points), n_of(dur))


# ---------------------------------------------------------------- filters

def rbj(kind, f, q=0.707, gain_db=0.0):
    f = float(np.clip(f, 10.0, SR * 0.49))
    w = TAU * f / SR
    c, s = np.cos(w), np.sin(w)
    al = s / (2 * q)
    A = 10 ** (gain_db / 40)
    if kind == 'lp':
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'hp':
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'bp':
        b = [al, 0, -al]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'notch':
        b = [1, -2 * c, 1]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'peak':
        b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]
    elif kind == 'lowshelf':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sq)]
        a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
    elif kind == 'highshelf':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
        a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    else:
        raise ValueError(kind)
    b, a = np.array(b) / a[0], np.array(a) / a[0]
    return b, a


def filt(x, kind, f, q=0.707, gain_db=0.0, order=1, block=64):
    """Biquad filter. f scalar = static (zero-phase-free, causal); f curve = swept, coefficients per 64-sample block."""
    x = np.asarray(x, np.float64)
    if np.ndim(f) == 0 and not isinstance(f, (list, tuple)):
        b, a = rbj(kind, f, q, gain_db)
        for _ in range(order):
            x = ss.lfilter(b, a, x, axis=0)
        return x
    n = len(x)
    fc = as_curve(f, n)
    qc = as_curve(q, n)
    for _ in range(order):
        y = np.empty_like(x)
        zi = np.zeros((2,) + x.shape[1:])
        for i in range(0, n, block):
            j = min(n, i + block)
            m = (i + j) // 2
            b, a = rbj(kind, fc[m], qc[m], gain_db)
            y[i:j], zi = ss.lfilter(b, a, x[i:j], axis=0, zi=zi)
        x = y
    return x


def butter(x, kind, f, order=4):
    sos = ss.butter(order, f, {'lp': 'lowpass', 'hp': 'highpass', 'bp': 'bandpass'}[kind], fs=SR, output='sos')
    return ss.sosfilt(sos, x, axis=0)


def eq(x, low_db=0.0, low_f=120.0, mid_db=0.0, mid_f=1000.0, mid_q=0.8, high_db=0.0, high_f=6000.0):
    if low_db:
        x = filt(x, 'lowshelf', low_f, 0.7, low_db)
    if mid_db:
        x = filt(x, 'peak', mid_f, mid_q, mid_db)
    if high_db:
        x = filt(x, 'highshelf', high_f, 0.7, high_db)
    return x


# ---------------------------------------------------------------- shaping

def drive(x, amount=2.0, kind='tanh'):
    if kind == 'tanh':
        return np.tanh(amount * x) / np.tanh(amount)
    if kind == 'fold':
        return np.sin(amount * x * np.pi / 2)
    if kind == 'hard':
        return np.clip(amount * x, -1, 1)
    if kind == 'asym':
        return (np.tanh(amount * (x + 0.2)) - np.tanh(amount * 0.2)) / np.tanh(amount)
    raise ValueError(kind)


def crush(x, bits=8, hold=4):
    y = np.repeat(x[::hold], hold, axis=0)[:len(x)]
    q = 2 ** (bits - 1)
    return np.round(y * q) / q


def ring(x, f):
    m = osc('sine', f, len(x) / SR)[:len(x)]
    return x * (m[:, None] if np.ndim(x) == 2 else m)


# ---------------------------------------------------------------- space

def stereo(x):
    x = np.asarray(x, np.float64)
    return x if x.ndim == 2 else np.c_[x, x]


def pan(x, p):
    """Equal-power pan of a mono (or summed) signal; p in -1..1, scalar or curve."""
    m = x.mean(1) if x.ndim == 2 else x
    pc = (as_curve(p, len(m)) + 1) / 2 * np.pi / 2
    return np.c_[m * np.cos(pc), m * np.sin(pc)]


def width(x, w):
    x = stereo(x)
    mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2 * w
    return np.c_[mid + side, mid - side]


def delay(x, t, feedback=0.4, mix=0.3, lp=6000.0, pingpong=True):
    x = stereo(x)
    d = n_of(t)
    taps = int(np.ceil(np.log(1e-3) / np.log(max(feedback, 1e-3)))) if feedback > 0 else 1
    out = np.zeros((len(x) + d * taps, 2))
    out[:len(x)] += x
    wet = x.copy()
    for k in range(1, taps + 1):
        wet = filt(wet, 'lp', lp) * (feedback if k > 1 else 1.0)
        tap = wet[:, ::-1] if pingpong and k % 2 else wet
        out[d * k:d * k + len(x)] += tap * mix
    return out


def reverb_ir(t60=2.0, predelay=0.02, damp=0.5, size=1.0, seed=7, early=True):
    """Stereo IR: decorrelated noise in three bands with their own decay (highs die first), plus early reflections."""
    r = rng(seed)
    n = n_of(predelay + t60 * 1.3)
    t = np.arange(n) / SR - predelay
    ir = np.zeros((n, 2))
    nz = r.standard_normal((n, 2))
    lo = butter(nz, 'lp', 700, 2)
    hi = butter(nz, 'hp', 4000, 2)
    mid = nz - lo - hi
    for band, k in ((lo, 1.15), (mid, 1.0), (hi, max(0.15, 1 - damp * 0.8))):
        ir += band * (10 ** (-3 * np.maximum(t, 0) / (t60 * k)))[:, None]
    ir *= (t > 0)[:, None] * np.clip(t / 0.008, 0, 1)[:, None]
    if early:
        for _ in range(10):
            at = predelay * 0.3 + r.random() * 0.06 * size
            i = n_of(at)
            if i < n:
                ir[i] += r.choice([-1, 1], 2) * (0.6 - at * 4) * 3
    return ir / np.sqrt((ir ** 2).sum() / 2)


def reverb(x, t60=2.0, mix=0.3, predelay=0.02, damp=0.5, size=1.0, seed=7, tail=True):
    x = stereo(x)
    ir = reverb_ir(t60, predelay, damp, size, seed)
    wet = np.c_[ss.oaconvolve(x[:, 0], ir[:, 0]), ss.oaconvolve(x[:, 1], ir[:, 1])]
    if not tail:
        wet = wet[:len(x)]
    out = np.zeros_like(wet)
    out[:len(x)] = x * (1 - mix * 0.5)
    return out + wet * mix


def chorus(x, rate=0.6, depth_ms=6.0, base_ms=14.0, mix=0.5):
    x = stereo(x)
    n = len(x)
    t = np.arange(n) / SR
    out = np.empty_like(x)
    for ch, ph in ((0, 0.0), (1, np.pi / 2)):
        dl = (base_ms + depth_ms * np.sin(TAU * rate * t + ph)) / 1000 * SR
        out[:, ch] = np.interp(np.arange(n) - dl, np.arange(n), x[:, ch], left=0)
    return x * (1 - mix) + out * mix


def flyby(x, speed=200.0, closest=50.0, t_close=None, c=343.0, side=1.0):
    """Doppler pass: pitch shift from the changing delay, 1/r level, air absorption, pan across. The source is
    extended backwards (mirrored) so sound already in flight at t=0 is heard, and the ends are faded."""
    x = x.mean(1) if np.ndim(x) == 2 else np.asarray(x, np.float64)
    n = len(x)
    t = np.arange(n) / SR
    tc = t_close if t_close is not None else n / SR / 2
    pos = speed * (t - tc)
    d = np.sqrt(closest ** 2 + pos ** 2)
    pre = int(np.ceil(d.max() / c * SR)) + 2
    k = min(pre, n - 1)
    xx = np.concatenate([np.tile(x[1:k + 1][::-1], int(np.ceil(pre / max(k, 1))))[:pre][::-1], x])
    tt = (np.arange(len(xx)) - pre) / SR
    y = np.interp(t - d / c, tt, xx, left=0, right=0) * (closest / d)
    y = filt(y, 'lp', np.clip(18000 * np.exp(-d / 1800), 800, 18000))
    y = fade(y, min(0.25, n / SR / 6), min(0.4, n / SR / 5))
    return pan(y, side * np.tanh(pos / max(closest, 1)))


# ---------------------------------------------------------------- physical-ish models

def modal(excite, freqs, t60s, amps=None):
    """Bank of resonant modes driven by an excitation: bells, metal plates, hulls, pipes."""
    excite = np.asarray(excite, np.float64)
    out = np.zeros(len(excite))
    amps = np.ones(len(freqs)) if amps is None else amps
    for f, t60, a in zip(freqs, t60s, amps):
        if f >= SR / 2:
            continue
        r = 10 ** (-3 / (t60 * SR))
        w = TAU * f / SR
        out += a * ss.lfilter([np.sin(w)], [1, -2 * r * np.cos(w), r * r], excite)
    return out


def karplus(freq, dur, bright=0.5, seed=0, decay_s=None):
    """Plucked string (Karplus-Strong) computed one period at a time."""
    n = n_of(dur)
    p = max(2, int(round(SR / freq)))
    r = rng(seed)
    buf = r.uniform(-1, 1, p)
    buf = filt(buf, 'lp', 1000 + 12000 * bright)
    g = 0.996 if decay_s is None else 10 ** (-3 * p / (decay_s * SR))
    out = np.empty(n)
    i = 0
    while i < n:
        k = min(p, n - i)
        out[i:i + k] = buf[:k]
        buf = g * 0.5 * (buf + np.roll(buf, -1))
        i += k
    return out


def grains(src, dur, density=40, grain=0.04, pitch_jitter=0.0, seed=0, spread=0.8):
    """Granular cloud from a source signal (mono): density per second (curve ok)."""
    r = rng(seed)
    src = src.mean(1) if np.ndim(src) == 2 else src
    n = n_of(dur)
    out = np.zeros((n + n_of(grain) * 4, 2))
    dens = as_curve(density, n)
    t = 0
    while t < n:
        rate = max(dens[min(t, n - 1)], 0.5)
        g = n_of(grain * (0.6 + 0.8 * r.random()))
        sh = 2 ** (pitch_jitter * r.standard_normal() / 12)
        L = int(g * sh) + 2
        st = r.integers(0, max(1, len(src) - L))
        seg = np.interp(np.arange(g) * sh, np.arange(L), src[st:st + L]) * np.hanning(g)
        pp = (r.uniform(-spread, spread) + 1) * np.pi / 4
        out[t:t + g, 0] += seg * np.cos(pp)
        out[t:t + g, 1] += seg * np.sin(pp)
        t += max(1, int(r.exponential(SR / rate)))
    return out[:n]


# ---------------------------------------------------------------- dynamics and levels

def follower(x, attack=0.005, release=0.15):
    a = np.abs(stereo(x)).max(1)
    pk = maximum_filter1d(a, n_of(attack) * 2 + 1)
    k = np.exp(-1 / (release * SR))
    return ss.lfilter([1 - k], [1, -k], pk)


def compress(x, thresh_db=-18.0, ratio=4.0, attack=0.005, release=0.15, makeup_db=0.0, key=None):
    x = stereo(x)
    e = follower(x if key is None else key, attack, release)[:len(x)]
    lev = 20 * np.log10(e + 1e-9)
    over = np.maximum(lev - thresh_db, 0)
    g = 10 ** ((-over * (1 - 1 / ratio) + makeup_db) / 20)
    return x * g[:, None]


def duck(x, key, depth_db=-8.0, attack=0.004, release=0.18):
    """Sidechain: lower x while key plays (music under explosions, pads under the kick)."""
    x = stereo(x)
    e = follower(key, attack, release)
    e = np.pad(e, (0, max(0, len(x) - len(e))))[:len(x)]
    e /= e.max() + 1e-9
    return x * (10 ** (depth_db * e / 20))[:, None]


def limit(x, ceiling_db=-1.0, lookahead=0.005, release=0.08):
    """Lookahead brickwall: gain never lets a sample (or a 4x inter-sample peak, approx.) exceed the ceiling."""
    x = stereo(x)
    c = 10 ** (ceiling_db / 20) * 0.98
    pk = np.abs(x).max(1)
    la = n_of(lookahead)
    need = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    g = minimum_filter1d(need, 2 * la + 1)
    g = uniform_filter1d(g, la * 2 + 1)
    g = np.minimum(g, minimum_filter1d(need, 2 * la + 1))
    k = np.exp(-1 / (release * SR))
    # release smoothing that can only rise slowly (attack is handled by the lookahead minimum)
    sm = np.empty_like(g)
    acc = 1.0
    blk = 256
    for i in range(0, len(g), blk):
        seg = g[i:i + blk]
        m = seg.min()
        acc = min(m, acc + (1 - acc) * (1 - k ** blk))
        sm[i:i + blk] = np.minimum(seg, acc)
    return x * sm[:, None]


def lufs(x):
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from audio_analyzer.features import loudness
    return loudness(stereo(x).astype(np.float64), SR)['integrated']


def normalize(x, peak_db=-1.0):
    m = np.abs(x).max()
    return x * (10 ** (peak_db / 20) / m) if m > 0 else x


def to_lufs(x, target=-16.0):
    L = lufs(x)
    return x * 10 ** ((target - L) / 20) if L is not None else x


def fade(x, fin=0.005, fout=0.02):
    x = np.array(x, np.float64)
    a, b = min(len(x), n_of(fin)), min(len(x), n_of(fout))
    sh = (slice(None),) + ((None,) if x.ndim == 2 else ())
    x[:a] *= np.linspace(0, 1, a)[sh]
    x[len(x) - b:] *= np.linspace(1, 0, b)[sh]
    return x


def mix(*parts, length=None):
    """Sum stereo/mono signals of different lengths; parts can be (signal, gain_db, offset_s) tuples."""
    items = []
    for p in parts:
        if isinstance(p, tuple):
            s, g, o = (p + (0.0, 0.0))[:3]
        else:
            s, g, o = p, 0.0, 0.0
        items.append((stereo(s), 10 ** (g / 20), n_of(o) if o else 0))
    n = length or max(len(s) + o for s, _, o in items)
    out = np.zeros((n, 2))
    for s, g, o in items:
        k = min(len(s), n - o)
        if k > 0:
            out[o:o + k] += s[:k] * g
    return out


def silence(d):
    return np.zeros((n_of(d), 2))


def write(path, x, bits=24):
    """WAV (24-bit by default). Browsers play 16/24-bit PCM."""
    from scipy.io import wavfile
    x = stereo(x)
    if bits == 16:
        d = (rng(1).random(x.shape) - rng(2).random(x.shape)) / 32768
        wavfile.write(str(path), SR, (np.clip(x + d, -1, 32767 / 32768) * 32768).astype(np.int16))
        return
    y = (np.clip(x, -1, 1 - 2 ** -23) * 2 ** 23).astype(np.int32)
    b = (y.astype('<i4').view(np.uint8).reshape(-1, 4)[:, :3]).tobytes()
    import struct
    with open(path, 'wb') as fh:
        ch = 2
        fh.write(b'RIFF' + struct.pack('<I', 36 + len(b)) + b'WAVE')
        fh.write(b'fmt ' + struct.pack('<IHHIIHH', 16, 1, ch, SR, SR * ch * 3, ch * 3, 24))
        fh.write(b'data' + struct.pack('<I', len(b)) + b)
