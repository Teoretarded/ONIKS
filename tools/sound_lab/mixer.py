"""The mixer and the master for a film soundtrack built from layers.

    M = Mixer()
    M.bus('machinery', hp=30, send=('engine_room', 0.25))       # a bus: filters, a reverb send, a gain
    M.add('machinery', 12.0, lambda: S.bed('ferry_engine_room_1', 40), dur=40, db=-6, pan=-0.2)
    M.duck('music', key=['machinery', 'impacts'], depth=-6)     # the music gives way to the foley
    buses = M.render(t0, t1)                                    # {bus: (n, 2)} incl. each bus's reverb
    mix, rep = master(sum(buses.values()), target=-14, tp=-1)   # loudness (BS.1770-4) + true-peak limiter

Events are lazy: their audio is made only when they overlap the rendered window, so a part of a long film renders
quickly. Reverb sends are summed per space and convolved once.
"""
import os
import subprocess

import numpy as np
import scipy.signal as ss
from scipy.ndimage import minimum_filter1d

from . import dsp, samples as S
from .dsp import SR, n_of


# ---------------------------------------------------------------- loudness and peaks (BS.1770-4)


def _kw(x):
    """K-weighting at 48 kHz (the BS.1770 pre-filter and RLB high-pass)."""
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return ss.lfilter(b2, a2, ss.lfilter(b1, a1, x, axis=0), axis=0)


def lufs(x, short=False):
    """Integrated loudness (LUFS, gated per BS.1770-4); with short=True also the 3 s short-term curve (10 Hz) and
    the loudness range (LRA)."""
    x = np.asarray(x, np.float64)
    if x.ndim == 1:
        x = np.c_[x, x]
    y = _kw(x)
    p = (y * y).sum(1)
    c = np.concatenate([[0.0], np.cumsum(p)])

    def blocks(T, hop):
        L = n_of(T)
        e = np.arange(L, len(p) + 1, n_of(hop))
        return (c[e] - c[e - L]) / L

    z = blocks(0.4, 0.1)
    if not len(z):
        return (-70.0, None, None) if short else -70.0
    lz = -0.691 + 10 * np.log10(z + 1e-20)
    g = z[lz > -70]
    I = -70.0
    if len(g):
        rel = -0.691 + 10 * np.log10(g.mean()) - 10
        g2 = z[(lz > -70) & (lz > rel)]
        I = float(-0.691 + 10 * np.log10(g2.mean())) if len(g2) else -70.0
    if not short:
        return I
    zs = blocks(3.0, 0.1)
    st = -0.691 + 10 * np.log10(zs + 1e-20)
    lra = None
    gs = st[st > -70]
    if len(gs) > 2:
        rel = -0.691 + 10 * np.log10(np.mean(10 ** ((gs + 0.691) / 10))) - 20
        v = gs[gs > rel]
        if len(v) > 2:
            lra = float(np.percentile(v, 95) - np.percentile(v, 10))
    return I, st, lra


def _tp_env(x, os_=4, chunk=1 << 18):
    """Per-sample true peak (the max of the 4x-oversampled magnitude around each sample, both channels)."""
    n = len(x)
    out = np.zeros(n)
    pad = 64
    for i in range(0, n, chunk):
        a, b = max(0, i - pad), min(n, i + chunk + pad)
        u = ss.resample_poly(x[a:b], os_, 1, axis=0)
        m = np.abs(u).max(1).reshape(-1, os_).max(1)
        out[i:min(n, i + chunk)] = m[i - a:i - a + min(chunk, n - i)]
    return np.maximum(out, np.abs(x).max(1))


def true_peak(x):
    x = np.asarray(x, np.float64)
    if x.ndim == 1:
        x = np.c_[x, x]
    return 20 * np.log10(_tp_env(x).max() + 1e-12)


def limiter(x, ceiling=-1.0, look=0.004, release=0.12, hold=0.01):
    """A true-peak brickwall: the gain each sample needs (against the 4x-oversampled peak) is held over the
    lookahead and smoothed with a raised-cosine attack, then released exponentially. Passes until the result's
    true peak is under the ceiling."""
    x = np.asarray(x, np.float64)
    c = 10 ** (ceiling / 20)
    y = x
    for k in range(4):
        pk = _tp_env(y)
        if pk.max() <= c:
            break
        need = np.minimum(1.0, (c * (0.995 - 0.004 * k)) / np.maximum(pk, 1e-9))
        la = n_of(look)
        g = minimum_filter1d(need, 2 * la + n_of(hold) + 1, origin=-(n_of(hold) // 2))
        w = np.hanning(2 * la + 1)
        w /= w.sum()
        gs = np.convolve(g, w, mode='same')
        gs = np.minimum(gs, g)                      # the smoothing never lets a peak through
        # release: the gain may only rise at the release rate
        a = np.exp(-1 / (release * SR))
        out = np.empty_like(gs)
        acc = 1.0
        B = 128
        for i in range(0, len(gs), B):
            s = gs[i:i + B]
            acc = min(s.min(), 1 - (1 - acc) * a ** B)
            out[i:i + B] = np.minimum(s, acc)
        y = y * out[:, None]
    return y


def glue(x, thresh=-16.0, ratio=1.5, attack=0.05, release=0.8):
    """A slow RMS bus compressor that eases the loudest stretches down without touching transients."""
    p = (np.asarray(x, np.float64) ** 2).mean(1)
    a_r = np.exp(-1 / (release * SR))
    env = ss.lfilter([1 - a_r], [1, -a_r], p)
    lev = 10 * np.log10(env + 1e-12)
    gr = np.maximum(lev - thresh, 0) * (1 - 1 / ratio)
    gr = ss.lfilter([1 - np.exp(-1 / (attack * SR))], [1, -np.exp(-1 / (attack * SR))], gr)
    return x * (10 ** (-gr / 20))[:, None]


def master(x, target=-14.0, tp=-1.0, gain_db=None, glue_db=-16.0, log=print):
    """Loudness to target LUFS (integrated) and true peak under tp dBTP: glue, gain, limiter, iterated. gain_db
    forces the gain (a part of a film mastered like the whole). Returns (mix, report)."""
    x = np.asarray(x, np.float64)
    pre = lufs(x)
    if pre <= -69:
        return x, {'lufs': -70.0, 'tp': -120.0, 'gain_db': 0.0}
    gl = glue(x, pre + 6 + (glue_db + 16))
    if gain_db is None:
        g = target - lufs(gl)
        for _ in range(3):
            y = limiter(gl * 10 ** (g / 20), tp)
            L = lufs(y)
            if abs(L - target) < 0.15:
                break
            g += target - L
    else:
        g = gain_db
    y = limiter(gl * 10 ** (g / 20), tp)
    pk_pre = _tp_env(gl * 10 ** (g / 20))
    gr = 20 * np.log10(np.maximum(pk_pre, 1e-9) / np.maximum(_tp_env(y), 1e-9))
    I, st, lra = lufs(y, short=True)
    rep = {'lufs': round(I, 2), 'tp': round(true_peak(y), 2), 'lra': None if lra is None else round(lra, 1),
           'gain_db': round(g, 2), 'limiter_max_db': round(float(gr.max()), 1),
           'limiter_over3db_pct': round(float((gr > 3).mean() * 100), 3),
           'max_short_term': round(float(st.max()), 1) if st is not None and len(st) else None,
           'pre_lufs': round(pre, 2)}
    if log:
        log(f"  master: {rep['lufs']} LUFS, true peak {rep['tp']} dBTP, LRA {rep['lra']}, gain {rep['gain_db']:+.1f} dB, "
            f"limiter max {rep['limiter_max_db']} dB ({rep['limiter_over3db_pct']} % over 3 dB)")
    return y, rep


# ---------------------------------------------------------------- the mixer


class Mixer:
    def __init__(self):
        self.ev = []
        self.buses = {}
        self.ducks = []
        self.autos = {}
        self.stats = None          # set to [] to collect (t, bus, why, peak dB, rms dB, length s) per event

    def bus(self, name, hp=None, lp=None, eq=None, send=None, db=0.0, post=None):
        """eq: dict for samples.eq; send: (space, wet) or a list of them; post: fn(buf, t0) -> buf after the space."""
        sends = [] if send is None else ([send] if isinstance(send[0], str) else list(send))
        self.buses[name] = dict(hp=hp, lp=lp, eq=eq or {}, send=sends, db=db, post=post)

    def add(self, bus, t, fn, dur=None, db=0.0, pan=None, send=None, why=''):
        """An event: fn() -> audio (mono or stereo) placed at t s. dur (s) is a hint for skipping it when it lies
        outside the rendered window; send overrides the bus's reverb send for this event ((space, wet) or None
        to keep the bus send, False for dry)."""
        if bus not in self.buses:
            self.bus(bus)
        self.ev.append(dict(bus=bus, t=float(t), fn=fn, dur=dur, db=db, pan=pan, send=send, why=why))

    def auto(self, bus, points):
        """Level automation of a bus: [(t, dB)] breakpoints (film time)."""
        self.autos.setdefault(bus, []).extend(points)

    def duck(self, bus, key, depth=-6.0, attack=0.03, release=0.6, thresh=-30.0):
        """Duck `bus` under the summed `key` buses: up to `depth` dB when the key is loud (above thresh dBFS RMS)."""
        self.ducks.append(dict(bus=bus, key=key if isinstance(key, (list, tuple)) else [key], depth=depth,
                               attack=attack, release=release, thresh=thresh))

    def render(self, t0, t1, log=print, tail=6.0):
        n = n_of(t1 - t0 + tail)
        dry = {b: np.zeros((n, 2)) for b in self.buses}
        sends = {}
        cnt = {b: 0 for b in self.buses}
        for e in sorted(self.ev, key=lambda q: q['t']):
            if e['t'] > t1:
                continue
            if e['dur'] is not None and e['t'] + e['dur'] + 8 < t0:
                continue
            x = e['fn']()
            if x is None:
                continue
            x = np.asarray(x, np.float64)
            if x.ndim == 1:
                x = np.c_[x, x]
            if e['pan'] is not None:
                x = S.pan(x, e['pan'])
            g = 10 ** (e['db'] / 20)
            i = n_of(e['t'] - t0)
            a = max(0, -i)
            k = min(len(x) - a, n - max(i, 0))
            if k <= 0:
                continue
            seg_ = x[a:a + k] * g
            if self.stats is not None:
                pkv = float(np.abs(seg_).max())
                self.stats.append((e['t'], e['bus'], e['why'] or getattr(e['fn'], '__qualname__', ''), 20 * np.log10(pkv + 1e-12),
                                   10 * np.log10((seg_ ** 2).mean() + 1e-12), len(x) / SR))
            dry[e['bus']][max(i, 0):max(i, 0) + k] += seg_
            sd = self.buses[e['bus']]['send'] if e['send'] is None else ([] if e['send'] is False else [e['send']])
            for space, wet in sd:
                key = (e['bus'], space)
                if key not in sends:
                    sends[key] = np.zeros((n, 2))
                sends[key][max(i, 0):max(i, 0) + k] += seg_ * wet
            cnt[e['bus']] += 1
        out = {}
        for b, cfg in self.buses.items():
            y = dry[b]
            for (bb, space), s in sends.items():
                if bb == b and np.abs(s).max() > 0:
                    w = S.space(s, space, 1.0, 0.0)
                    y = y + w[:n]
            if cfg['hp'] or cfg['lp'] or cfg['eq']:
                y = S.eq(y, hp=cfg['hp'], lp=cfg['lp'], **cfg['eq'])
            if cfg['post']:
                y = cfg['post'](y, t0)
            if b in self.autos:
                P = np.array(sorted(self.autos[b]), np.float64)
                e_ = np.interp(t0 + np.arange(n) / SR, P[:, 0], P[:, 1])
                y = y * (10 ** (e_ / 20))[:, None]
            out[b] = y * 10 ** (cfg['db'] / 20)
            if log and cnt[b]:
                log(f'  {b}: {cnt[b]} events')
        for d in self.ducks:
            if d['bus'] not in out:
                continue
            key = sum(out[k] for k in d['key'] if k in out)
            if np.isscalar(key):
                continue
            p = (key ** 2).mean(1)
            ar = np.exp(-1 / (d['release'] * SR))
            env = ss.lfilter([1 - ar], [1, -ar], p)
            lev = 10 * np.log10(env + 1e-12)
            amt = np.clip((lev - d['thresh']) / 18.0, 0, 1)
            aa = np.exp(-1 / (d['attack'] * SR))
            amt = ss.lfilter([1 - aa], [1, -aa], amt)
            out[d['bus']] = out[d['bus']] * (10 ** (d['depth'] * amt / 20))[:, None]
        return out


# ---------------------------------------------------------------- files


def write_wav(path, x, float32=False):
    import soundfile as sf
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    x = np.ascontiguousarray(np.asarray(x, np.float64))
    if float32:
        sf.write(path, x.astype(np.float32), SR, subtype='FLOAT')
    else:
        sf.write(path, np.clip(x, -1, 1), SR, subtype='PCM_24')
    return path


def mux(video, wav, out, t0=0.0, dur=None, reencode_height=None):
    """The mix onto a picture: the video stream copied (a whole film) or cut exactly and re-encoded (a part), AAC
    384 kbps."""
    exe = S._ffmpeg()
    args = [exe, '-y', '-v', 'error']
    if t0 or dur:
        args += ['-ss', f'{t0:.3f}', '-i', video]
        if dur:
            args += ['-t', f'{dur:.3f}']
        args += ['-i', wav, '-map', '0:v:0', '-map', '1:a:0']
        vf = ['-vf', f'scale=-2:{reencode_height}:flags=lanczos'] if reencode_height else []
        args += vf + ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p']
    else:
        args += ['-i', video, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy']
    args += ['-c:a', 'aac', '-b:a', '384k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out]
    subprocess.run(args, check=True)
    return out
