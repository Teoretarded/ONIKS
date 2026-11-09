"""Audio features. One streaming STFT pass (never holds the full spectrogram), BS.1770 loudness, YIN pitch,
SuperFlux onsets, tempo + DP beat tracking, Krumhansl key, novelty segmentation, one-shot envelope profile.
Everything is vectorised numpy/scipy; FFTs run on all cores (scipy.fft workers=-1)."""
import numpy as np
import scipy.fft as sfft
import scipy.signal as ss
from numpy.lib.stride_tricks import sliding_window_view
from scipy.ndimage import maximum_filter1d, median_filter, uniform_filter1d

EPS = 1e-12
BANDS = (('sub', 20, 60), ('bass', 60, 250), ('low_mid', 250, 500), ('mid', 500, 2000),
         ('high_mid', 2000, 4000), ('presence', 4000, 6000), ('air', 6000, 20000))
NOTES = ('C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B')
THIRD_OCT = (20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
             2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000)


def pdb(p, floor=-120.0):
    return np.maximum(10.0 * np.log10(np.maximum(p, 1e-30)), floor)


def adb(a, floor=-120.0):
    return np.maximum(20.0 * np.log10(np.maximum(a, 1e-30)), floor)


def win_mean(v, n, centers):
    """Mean of v over n-sample windows centred on `centers` (cumsum, O(len))."""
    c = np.concatenate(([0.0], np.cumsum(v, dtype=np.float64)))
    a = np.clip(centers - n // 2, 0, len(v))
    b = np.clip(centers + n // 2, 0, len(v))
    return (c[b] - c[a]) / n


def midi_name(m):
    m = int(round(float(m)))
    return f'{NOTES[m % 12]}{m // 12 - 1}'


def hz_to_midi(f):
    return 69.0 + 12.0 * np.log2(np.maximum(f, EPS) / 440.0)


def mel_fb(sr, n_fft, n_mels, fmin=30.0, fmax=None):
    fmax = min(fmax or sr / 2, sr / 2)
    h2m = lambda f: 2595.0 * np.log10(1.0 + f / 700.0)
    m = np.linspace(h2m(fmin), h2m(fmax), n_mels + 2)
    f = 700.0 * (10.0 ** (m / 2595.0) - 1.0)
    bins = np.fft.rfftfreq(n_fft, 1.0 / sr)
    fb = np.zeros((len(bins), n_mels), np.float32)
    for i in range(n_mels):
        lo, c, hi = f[i], f[i + 1], f[i + 2]
        fb[:, i] = np.maximum(0.0, np.minimum((bins - lo) / (c - lo), (hi - bins) / (hi - c)))
        if fb[:, i].sum() == 0:
            fb[np.argmin(np.abs(bins - c)), i] = 1.0
        fb[:, i] /= fb[:, i].sum()
    return fb, f[1:-1]


# ---------------------------------------------------------------- spectral pass

def spectral_pass(mono, sr, n_fft, hop, n_mels=96, block=4096):
    count = len(mono) // hop + 1
    pad = np.pad(mono, (n_fft // 2, n_fft // 2 + hop))
    view = sliding_window_view(pad, n_fft)[::hop][:count]
    win = ss.get_window('hann', n_fft).astype(np.float32)
    norm = np.float32(2.0 / (n_fft * np.sum(win.astype(np.float64) ** 2)))   # band power = mean square of the signal
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr).astype(np.float32)
    fb, mel_f = mel_fb(sr, n_fft, n_mels)
    band_idx = [(int(np.searchsorted(freqs, lo)), int(np.searchsorted(freqs, min(hi, sr / 2)))) for _, lo, hi in BANDS]
    cbins = np.nonzero((freqs > 50) & (freqs < 5000))[0]
    cw = np.zeros((len(cbins), 12), np.float32)
    cw[np.arange(len(cbins)), np.round(hz_to_midi(freqs[cbins])).astype(int) % 12] = 1.0
    fsel = (freqs >= 60) & (freqs <= min(16000, sr / 2))
    f2 = freqs.astype(np.float64) ** 2

    o = {k: np.empty(count, np.float32) for k in ('centroid', 'spread', 'rolloff', 'flatness', 'power')}
    mel = np.empty((count, n_mels), np.float32)
    chroma = np.empty((count, 12), np.float32)
    bands = np.empty((count, len(BANDS)), np.float32)
    ltas = np.zeros(len(freqs), np.float64)
    for i in range(0, count, block):
        S = sfft.rfft(view[i:i + block] * win, axis=1, workers=-1)
        P = (S.real * S.real + S.imag * S.imag) * norm
        tot = P.sum(1, dtype=np.float64) + EPS
        sl = slice(i, i + len(P))
        o['power'][sl] = tot
        c = (P @ freqs) / tot
        o['centroid'][sl] = c
        o['spread'][sl] = np.sqrt(np.maximum((P @ f2) / tot - c.astype(np.float64) ** 2, 0))
        cum = np.cumsum(P, axis=1)
        o['rolloff'][sl] = freqs[np.argmax(cum >= 0.85 * tot[:, None], axis=1)]
        Pf = P[:, fsel] + 1e-20
        o['flatness'][sl] = np.exp(np.log(Pf).mean(1)) / Pf.mean(1)
        mel[sl] = pdb(P @ fb)
        chroma[sl] = P[:, cbins] @ cw
        for j, (a, b) in enumerate(band_idx):
            bands[sl, j] = P[:, a:b].sum(1)
        ltas += P.sum(0, dtype=np.float64)
    quiet = o['power'] < 1e-9           # below -90 dB: spectral shape is meaningless
    for k in ('centroid', 'spread', 'rolloff', 'flatness'):
        o[k][quiet] = np.nan
    o.update(mel_db=mel, mel_f=mel_f, chroma=chroma, bands=bands, ltas=ltas / max(count, 1), freqs=freqs)
    return o


def zcr(mono, sr, n, centers):
    s = np.signbit(mono)
    zc = np.concatenate(([0], (s[1:] != s[:-1]).astype(np.float32)))
    return win_mean(zc, n, centers) * sr / 2.0          # in Hz-equivalent (crossings/2 per second)


def third_octave(ltas, freqs):
    out = []
    for fc in THIRD_OCT:
        lo, hi = fc / 2 ** (1 / 6), fc * 2 ** (1 / 6)
        m = (freqs >= lo) & (freqs < hi)
        if m.any():
            out.append({'hz': fc, 'db': round(float(pdb(ltas[m].sum())), 1)})
    return out


def resonances(ltas, freqs, top=12):
    """Peaks standing out of the smoothed long-term spectrum (on a log-frequency grid)."""
    g = np.geomspace(30, min(18000, freqs[-1]), 600)
    d = np.interp(g, freqs, pdb(ltas))
    base = uniform_filter1d(d, 81, mode='nearest')
    pk, pr = ss.find_peaks(d - base, prominence=4.0, distance=6)
    keep = d[pk] > d.max() - 45
    pk, pr = pk[keep], {'prominences': pr['prominences'][keep]}
    order = np.argsort(pr['prominences'])[::-1][:top]
    return sorted(({'hz': round(float(g[pk[i]]), 1), 'above_db': round(float(pr['prominences'][i]), 1),
                    'note': midi_name(hz_to_midi(g[pk[i]]))} for i in order), key=lambda r: r['hz'])


# ---------------------------------------------------------------- loudness (ITU-R BS.1770-4 / EBU R128)

def k_weight(x, sr):
    K = np.tan(np.pi * 1681.974450955533 / sr)
    Vh = 10 ** (3.999843853973347 / 20)
    Vb = Vh ** 0.4996667741545416
    Q = 0.7071752369554196
    a0 = 1 + K / Q + K * K
    b1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a1 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    K = np.tan(np.pi * 38.13547087602444 / sr)
    Q = 0.5003270373238773
    a0 = 1 + K / Q + K * K
    b2 = [1, -2, 1]
    a2 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    sos = np.array([b1 + a1, b2 + a2], np.float64)
    return ss.sosfilt(sos, x.astype(np.float64), axis=0)


def loudness(x, sr, step=0.05):
    y = k_weight(x, sr)
    ms = (y * y).sum(axis=1)
    c = np.concatenate(([0.0], np.cumsum(ms)))
    n = len(ms)

    def curve(T):
        t = np.arange(0, n / sr + 1e-9, step)
        a = np.clip(((t - T / 2) * sr).astype(np.int64), 0, n)
        b = np.clip(((t + T / 2) * sr).astype(np.int64), 0, n)
        return t, np.maximum(-0.691 + pdb((c[b] - c[a]) / np.maximum(b - a, 1), -200), -120.0)

    def blocks(T, hop):
        L = int(T * sr)
        e = np.arange(L, n + 1, int(hop * sr))
        return (c[e] - c[e - L]) / L

    t, mom = curve(0.4)
    _, short = curve(3.0)
    z = blocks(0.4, 0.1)
    integ = None
    if len(z):
        lz = -0.691 + pdb(z, -200)
        g = z[lz > -70]
        if len(g):
            rel = -0.691 + pdb(g.mean(), -200) - 10
            g2 = z[(lz > -70) & (lz > rel)]
            integ = float(-0.691 + pdb(g2.mean(), -200)) if len(g2) else None
    lra = None
    zs = blocks(3.0, 0.1)
    if len(zs):
        ls = -0.691 + pdb(zs, -200)
        g = zs[ls > -70]
        if len(g) > 2:
            rel = -0.691 + pdb(g.mean(), -200) - 20
            v = ls[(ls > -70) & (ls > rel)]
            if len(v) > 2:
                lra = float(np.percentile(v, 95) - np.percentile(v, 10))
    return {'t': t, 'momentary': mom, 'short_term': short, 'integrated': integ, 'lra': lra,
            'max_momentary': float(mom.max()) if len(mom) else None,
            'max_short_term': float(short.max()) if len(short) else None}


def true_peak(x, chunk=1 << 20):
    tp = 0.0
    for ch in range(x.shape[1]):
        v = x[:, ch]
        for i in range(0, len(v), chunk):
            seg = v[max(0, i - 64): i + chunk + 64].astype(np.float64)
            if len(seg) > 8:
                tp = max(tp, float(np.abs(ss.resample_poly(seg, 4, 1)).max()))
    return tp


# ---------------------------------------------------------------- pitch (YIN, batched FFT)

def yin(mono, sr, hop, count, gate, fmin=40.0, fmax=2000.0, W=1024, thr=0.15, batch=768):
    tmax = int(sr / fmin)
    tmin = max(2, int(sr / fmax))
    N = W + tmax
    nfft = 1 << int(np.ceil(np.log2(W + N)))
    pad = np.pad(mono.astype(np.float32), (W // 2, N + hop))
    c2 = np.concatenate(([0.0], np.cumsum(pad.astype(np.float64) ** 2)))
    f0 = np.full(count, np.nan, np.float32)
    conf = np.zeros(count, np.float32)
    idx = np.nonzero(gate)[0]
    taus = np.arange(tmax + 1)
    ar = np.arange(1, tmax + 1, dtype=np.float64)
    for k in range(0, len(idx), batch):
        rows = idx[k:k + batch]
        st = rows * hop
        fr = pad[st[:, None] + np.arange(N)]
        A = sfft.rfft(fr[:, :W], nfft, axis=1, workers=-1)
        B = sfft.rfft(fr, nfft, axis=1, workers=-1)
        r = sfft.irfft(np.conj(A) * B, nfft, axis=1, workers=-1)[:, :tmax + 1].astype(np.float64)
        e0 = c2[st + W] - c2[st]
        et = c2[st[:, None] + taus + W] - c2[st[:, None] + taus]
        d = np.maximum(e0[:, None] + et - 2.0 * r, 0.0)[:, 1:]
        cm = d * ar / np.maximum(np.cumsum(d, axis=1), EPS)     # cm[:, j] is tau = j + 1
        sub = cm[:, tmin - 1:]
        below = sub < thr
        has = below.any(1)
        j = np.where(has, np.argmax(below, 1), np.argmin(sub, 1)) + tmin - 1
        last = cm.shape[1] - 2
        n_ = np.arange(len(rows))
        for _ in range(64):                                     # slide down to the local minimum
            j1 = np.minimum(j + 1, last + 1)
            mv = (j < last + 1) & (cm[n_, j1] < cm[n_, j])
            if not mv.any():
                break
            j = np.where(mv, j1, j)
        jl, jr = np.maximum(j - 1, 0), np.minimum(j + 1, last + 1)
        a, b, c = cm[n_, jl], cm[n_, j], cm[n_, jr]
        den = a - 2 * b + c
        with np.errstate(invalid='ignore', divide='ignore'):
            delta = np.nan_to_num(np.where(np.abs(den) > EPS, 0.5 * (a - c) / den, 0.0)).clip(-1, 1)
        tau = j + 1 + delta
        cf = 1.0 - b
        ok = has | (b < 0.35)
        f0[rows] = np.where(ok, sr / tau, np.nan)
        conf[rows] = np.clip(cf, 0, 1)
    return f0, conf


# ---------------------------------------------------------------- onsets

def onset_strength(mel_db, lag=1):
    top = float(np.percentile(mel_db, 99.9))
    m = np.maximum(mel_db, top - 80.0)
    ref = maximum_filter1d(m, 3, axis=1)
    d = np.maximum(m[lag:] - ref[:-lag], 0.0).mean(1)
    return np.concatenate((np.zeros(lag, np.float32), d.astype(np.float32)))


def pick_onsets(odf, fps, level_db, gate_db=-60.0, rel=0.1, half_life=0.5):
    """Local-maximum peaks over an adaptive mean, then masking: a peak counts only if it is at least `rel` of the
    strongest recent peak decayed with `half_life` seconds (drops the flutter inside big tails)."""
    w = lambda s: max(1, int(round(s * fps)))
    mx = maximum_filter1d(odf, 2 * w(0.03) + 1)
    avg = uniform_filter1d(odf, w(0.1) + w(0.07) + 1, origin=(w(0.1) - w(0.07)) // 2)
    top = float(odf.max()) if len(odf) and odf.max() > 0 else 1.0
    lvl = maximum_filter1d(level_db, 7, origin=-3)
    cand = np.nonzero((odf == mx) & (odf >= avg + 0.03 * top) & (odf > 0.02 * top) & (lvl > gate_db))[0]
    dk = 0.5 ** (1.0 / (half_life * fps))
    keep = []
    gap = w(0.03)
    mem, last = 0.0, 0
    for i in cand:
        mem *= dk ** (i - last)
        last = i
        v = float(odf[i])
        if v < rel * mem:
            continue
        mem = max(mem, v)
        if keep and i - keep[-1] < gap:
            if v > odf[keep[-1]]:
                keep[-1] = int(i)
            continue
        keep.append(int(i))
    return np.array(keep, np.int64), top


def envelope_1ms(mono, sr):
    """Hilbert (analytic) amplitude, max per 1 ms: smooth for low tones, still sharp on clicks."""
    n = len(mono)
    m = sfft.next_fast_len(n)
    X = sfft.rfft(mono.astype(np.float64), m, workers=-1)
    h = np.zeros(m // 2 + 1)
    h[0] = 1
    h[1:(m + 1) // 2] = 2
    if m % 2 == 0:
        h[m // 2] = 1
    full = np.zeros(m, complex)
    full[:m // 2 + 1] = X * h
    a = np.abs(sfft.ifft(full, workers=-1)[:n])
    blk = max(1, sr // 1000)
    nb = n // blk
    return a[:nb * blk].reshape(nb, blk).max(1).astype(np.float32)


def onset_shape(env, t_ms, next_ms):
    """Attack start, 10-90 % rise, peak and -20/-40 dB decay from a 1 kHz peak envelope."""
    n = len(env)
    i0, i1 = max(0, t_ms - 30), min(n, t_ms + 60)
    if i1 <= i0:
        return None
    p = i0 + int(np.argmax(env[i0:i1]))
    pk = float(env[p])
    if pk <= 0:
        return None
    lo = max(0, i0 - 40)
    seg = env[lo:p + 1][::-1]
    under = np.nonzero(seg < 0.1 * pk)[0]
    start = p - int(under[0]) + 1 if len(under) else lo
    rise = env[start:p + 1]
    t10 = start + int(np.argmax(rise >= 0.1 * pk))
    t90 = start + int(np.argmax(rise >= 0.9 * pk))
    sm = uniform_filter1d(env[p:min(n, p + 8000)], 10)
    ref = float(sm[:10].max()) if len(sm) else pk
    d20 = np.nonzero(sm < ref * 0.1)[0]
    d40 = np.nonzero(sm < ref * 0.01)[0]
    return {'start_ms': start, 'peak_ms': p, 'peak': pk, 'attack_ms': max(0, t90 - t10),
            'decay20_ms': int(d20[0]) if len(d20) else None, 'decay40_ms': int(d40[0]) if len(d40) else None,
            'masked': bool(next_ms is not None and len(d20) and p + int(d20[0]) > next_ms)}


def classify(o):
    """Plain-language sound type from the numbers (heuristic; the numbers are the truth)."""
    att, dec = o.get('attack_ms', 0), o.get('decay20_ms') or 0
    low, flat, cen = o.get('low_share', 0), o.get('flatness') or 0, o.get('centroid_hz') or 0
    if att >= 60:
        return 'swell' if o.get('pitch') else 'whoosh/riser'
    if low >= 0.55 and dec >= 120:
        return 'boom (low impact)'
    if o.get('pitch') and flat < 0.12:
        return 'tonal hit'
    if dec and dec < 60 and cen > 3500:
        return 'click/tick'
    if flat >= 0.3 or cen > 5000:
        return 'crack/noise burst'
    if low >= 0.4:
        return 'thump'
    return 'hit'


# ---------------------------------------------------------------- tempo and beats

def tempo(odf, fps, lo=40.0, hi=220.0):
    o = odf - uniform_filter1d(odf, max(3, int(fps)))
    o = np.maximum(o, 0)
    n = len(o)
    if n < fps * 4 or not o.any():
        return []
    F = sfft.rfft(o, 2 * n, workers=-1)
    ac = sfft.irfft(F * np.conj(F), 2 * n, workers=-1)[:n]
    ac /= ac[0] + EPS
    bpm = np.arange(lo, hi + 0.25, 0.25)
    lag = fps * 60.0 / bpm
    a = lambda L: np.interp(L, np.arange(n), ac)
    sc = a(lag) + 0.5 * a(2 * lag) + 0.25 * a(lag / 2)
    w = np.exp(-0.5 * (np.log2(bpm / 120.0) / 1.0) ** 2)
    s = sc * w
    pk, _ = ss.find_peaks(s, distance=8)
    pk = pk[np.argsort(s[pk])[::-1]][:4]
    base = float(np.median(s)) + EPS
    return [{'bpm': round(float(bpm[i]), 2), 'strength': round(float(a(lag[i])), 4),
             'salience': round(float(s[i] / base), 2)} for i in pk]


def beat_track(odf, fps, bpm, tight=100.0):
    P = fps * 60.0 / bpm
    o = odf / (odf.std() + EPS)
    n = len(o)
    lo, hi = max(1, int(round(P / 2))), int(round(2 * P))
    if n <= hi + 2:
        return np.array([], np.int64)
    offs = np.arange(-hi, -lo + 1)
    pen = -tight * np.log(-offs / P) ** 2
    score = o.astype(np.float64).copy()
    back = np.full(n, -1, np.int64)
    for t in range(hi, n):
        cand = score[t + offs] + pen
        k = int(np.argmax(cand))
        score[t] = o[t] + cand[k]
        back[t] = t + offs[k]
    t = n - int(round(P)) + int(np.argmax(score[n - int(round(P)):]))
    beats = []
    while t >= 0:
        beats.append(t)
        t = back[t]
    return np.array(beats[::-1], np.int64)


def grid_fit(times, weights, lo=60.0, hi=180.0):
    """BPM/phase that put the given event times closest to beats (circular mean resultant per tempo)."""
    if len(times) < 4:
        return []
    t = np.asarray(times, np.float64)
    w = np.asarray(weights, np.float64)
    bpm = np.arange(lo, hi + 0.1, 0.1)
    z = (w[None, :] * np.exp(2j * np.pi * t[None, :] * (bpm[:, None] / 60.0))).sum(1) / w.sum()
    r = np.abs(z)
    pk, _ = ss.find_peaks(r, distance=15)
    pk = pk[np.argsort(r[pk])[::-1]][:5]
    chance = float(np.sqrt((w ** 2).sum()) / w.sum())
    out = []
    for i in pk:
        per = 60.0 / bpm[i]
        phase = (-np.angle(z[i]) / (2 * np.pi)) % 1.0
        first = (phase * per) % per
        out.append({'bpm': round(float(bpm[i]), 1), 'fit': round(float(r[i]), 3), 'chance_level': round(chance, 3),
                    'first_beat_s': round(float(first), 3)})
    return out


# ---------------------------------------------------------------- key

KS_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def key_of(chroma_vec):
    v = np.asarray(chroma_vec, np.float64)
    if v.sum() <= 0:
        return None
    res = []
    for k in range(12):
        for prof, mode in ((KS_MAJ, 'major'), (KS_MIN, 'minor')):
            res.append((float(np.corrcoef(v, np.roll(prof, k))[0, 1]), f'{NOTES[k]} {mode}'))
    res.sort(reverse=True)
    return {'key': res[0][1], 'corr': round(res[0][0], 3), 'runner_up': res[1][1], 'runner_up_corr': round(res[1][0], 3),
            'tonal': 'clear' if res[0][0] > 0.75 else 'weak' if res[0][0] > 0.5 else 'atonal/noise'}


# ---------------------------------------------------------------- structure

def novelty_sections(X, block_sec, kernel_sec=8.0, min_sec=5.0):
    n = len(X)
    if n < 8:
        return np.array([0, n]), np.zeros(n)
    Z = (X - X.mean(0)) / (X.std(0) + 1e-6)
    Z /= np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9
    S = Z @ Z.T
    k = max(2, int(kernel_sec / block_sec / 2))
    g = np.exp(-0.5 * (np.linspace(-1, 1, 2 * k) / 0.5) ** 2)
    K = np.outer(g, g) * np.outer(np.r_[-np.ones(k), np.ones(k)], np.r_[-np.ones(k), np.ones(k)])
    Sp = np.pad(S, k, mode='edge')
    nov = np.array([(K * Sp[i:i + 2 * k, i:i + 2 * k]).sum() for i in range(n)])
    nov = np.maximum(nov, 0)
    if nov.max() <= 0:
        return np.array([0, n]), nov
    pk, _ = ss.find_peaks(nov, distance=max(1, int(min_sec / block_sec)), prominence=0.15 * nov.max())
    return np.r_[0, pk, n], nov / nov.max()


# ---------------------------------------------------------------- one-shot profile

def one_shot(env, mono, sr):
    """ADSR-like description of a short sound from its 1 kHz peak envelope."""
    if not len(env) or env.max() <= 0:
        return None
    sm = uniform_filter1d(env, 5)
    pk = float(sm.max())
    p = int(np.argmax(sm))
    on = np.nonzero(sm >= pk * 0.03)[0]
    start, end = int(on[0]), int(on[-1])
    t10 = int(np.argmax(sm >= pk * 0.1))
    t90 = int(np.argmax(sm >= pk * 0.9))
    after = sm[p:]
    hold = int(np.argmax(after < pk * 0.708)) if (after < pk * 0.708).any() else len(after)   # -3 dB
    dec = {}
    for dbv in (6, 12, 20, 40, 60):
        m = np.nonzero(after < pk * 10 ** (-dbv / 20))[0]
        dec[f'to_-{dbv}dB_ms'] = int(m[0]) if len(m) else None
    curve = adb(sm[start:end + 1] / pk, -80)
    pts = np.unique(np.r_[np.geomspace(1, max(2, len(curve)), 40).astype(int) - 1, p - start])
    pts = pts[(pts >= 0) & (pts < len(curve))]
    return {'onset_ms': start, 'peak_ms': p, 'end_ms': end, 'attack_10_90_ms': max(0, t90 - t10),
            'hold_-3dB_ms': hold, 'decay': dec, 'peak_dbfs': round(float(adb(pk)), 2),
            'envelope_db': [[int(start + i), round(float(curve[i]), 1)] for i in pts]}
