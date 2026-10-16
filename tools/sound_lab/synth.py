"""Instruments for the film scores: analog-style synths (drifting saw stacks through a swept 24 dB low-pass), synth
strings (sustained and spiccato), Zimmer-style brass, a formant choir, an FM electric piano and a glass bell, an arp
pluck, cinematic drums (kick, taiko, toms, a big snare, hats, shaker, a clock tick, cymbals) and the trailer toolkit
(hits, risers, reverse swells, sub drops, braams). Every instrument returns stereo float64 at 48 kHz; notes are
cached by (instrument, pitch, length, velocity), so a 10-minute score with thousands of notes renders in a minute.
"""
import functools

import numpy as np

from . import dsp
from .dsp import SR, TAU, n_of, rng
from .foley import bp, hp, lfo, lp, peak, place, smoothstep, stereo_pan

NAMES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
QUAL = {'': [0, 4, 7], 'm': [0, 3, 7], 'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10], '7': [0, 4, 7, 10],
        'sus2': [0, 2, 7], 'sus4': [0, 5, 7], 'add9': [0, 4, 7, 14], 'madd9': [0, 3, 7, 14], 'm9': [0, 3, 7, 10, 14],
        'maj9': [0, 4, 7, 11, 14], 'dim': [0, 3, 6], '5': [0, 7]}


def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m, float) - 69) / 12)


def pc(name):
    p = NAMES[name[0]]
    for c in name[1:]:
        p += {'b': -1, '#': 1}.get(c, 0)
    return p % 12


def chord(name):
    """'Dm', 'Bbmaj7', 'F/A', 'Gm9', 'Asus4' -> (root pc, intervals, bass pc)."""
    main, _, bass = name.partition('/')
    k = 2 if len(main) > 1 and main[1] in 'b#' else 1
    root = pc(main[:k])
    iv = QUAL[main[k:]]
    return root, iv, pc(bass) if bass else root


def voicing(name, lo=55, hi=74, root_below=False):
    """MIDI notes of a chord inside [lo, hi): each chord tone once, in close position from the bottom."""
    root, iv, bass = chord(name)
    notes = []
    for i in iv:
        p = (root + i) % 12
        m = lo + ((p - lo) % 12)
        while m >= hi:
            m -= 12
        if i >= 12 and m + 12 <= hi + 5:           # a ninth sits above the triad, not in a cluster at the bottom
            m += 12
        notes.append(m)
    notes = sorted(set(notes))
    if root_below:
        m = lo - 12 + ((bass - (lo - 12)) % 12)
        notes = [m] + notes
    return notes


def bass_note(name, lo=33):
    """The chord's bass (its slash note or root) as the MIDI note at or above lo."""
    _, _, b = chord(name)
    return lo + ((b - lo) % 12)


# ---------------------------------------------------------------- core


def saw(freq, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(freq, float), (n,)) if np.ndim(freq) == 0 else np.asarray(freq, float)[:n]
    dt = np.clip(f / SR, 1e-9, 0.5)
    p = (ph0 + np.cumsum(dt) - dt[0]) % 1.0
    return 2 * p - 1 - dsp._blep(p, dt)


def square(freq, n, ph0=0.0, pw=0.5):
    f = np.broadcast_to(np.asarray(freq, float), (n,)) if np.ndim(freq) == 0 else np.asarray(freq, float)[:n]
    dt = np.clip(f / SR, 1e-9, 0.5)
    p = (ph0 + np.cumsum(dt) - dt[0]) % 1.0
    y = np.where(p < pw, 1.0, -1.0)
    return y + dsp._blep(p, dt) - dsp._blep((p - pw) % 1.0, dt)


def sine(freq, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(freq, float), (n,)) if np.ndim(freq) == 0 else np.asarray(freq, float)[:n]
    return np.sin(TAU * (ph0 + np.cumsum(f) / SR))


def lp24(x, fc, res=0.0, block=64):
    """Two cascaded biquads (24 dB/oct); fc scalar or a curve; res 0..1 lifts the corner."""
    if np.ndim(fc) == 0:
        fc = float(min(fc, SR * 0.45))
        b1, a1 = dsp.rbj('lp', fc, 0.54)
        b2, a2 = dsp.rbj('lp', fc, 0.707 + res * 3.0)
        import scipy.signal as ss
        return ss.lfilter(b2, a2, ss.lfilter(b1, a1, x, axis=0), axis=0)
    fc = np.minimum(fc, SR * 0.45)
    y = dsp.filt(x, 'lp', fc, 0.54, block=block)
    return dsp.filt(y, 'lp', fc, 0.707 + res * 3.0, block=block)


def adsr(note, a=0.01, d=0.2, s=0.7, r=0.3, n=None):
    """Envelope: the gate held `note` seconds (attack, decay to s), then an exponential release over r. Length
    note + r (or n samples)."""
    n1, nr = n_of(max(note, 1e-3)), n_of(max(r, 1e-3))
    t = np.arange(n1) / SR
    att = np.clip(t / max(a, 1e-4), 0, 1)
    att = np.sin(att * np.pi / 2)
    dec = s + (1 - s) * np.exp(-np.maximum(t - a, 0) / max(d / 3, 1e-4))
    e1 = np.where(t < a, att, dec)
    last = e1[-1]
    tr = np.arange(nr) / SR
    e2 = last * np.exp(-tr / (r / 5)) * (1 - tr / r) ** 0.5
    e = np.concatenate([e1, e2])
    if n is not None:
        e = np.pad(e, (0, max(0, n - len(e))))[:n]
    return e


def _st(x, w=0.0):
    return np.c_[x, x] if w == 0 else dsp.width(np.c_[x, x], w)


# ---------------------------------------------------------------- synths


@functools.lru_cache(maxsize=4096)
def pulse_bass(m, dur, vel=1.0, cutoff=700.0, env=1600.0, res=0.25, drive=1.6):
    """The pulse: two saws a few cents apart and a sine an octave down through a 24 dB low-pass whose cutoff snaps
    open on each note, gently driven."""
    f = mtof(m)
    n = n_of(dur + 0.06)
    t = np.arange(n) / SR
    x = 0.5 * saw(f * 2 ** (-5 / 1200), n) + 0.5 * saw(f * 2 ** (5 / 1200), n, 0.37) + 0.5 * sine(f, n)
    fc = cutoff + env * vel * np.exp(-t / 0.075)
    y = lp24(x, fc, res)
    y = np.tanh(drive * y) / np.tanh(drive)
    y *= adsr(dur, 0.002, 0.18, 0.55, 0.05, n) * vel
    return _st(y)


@functools.lru_cache(maxsize=1024)
def sub_bass(m, dur, vel=1.0):
    f = mtof(m)
    n = n_of(dur + 0.2)
    y = sine(f, n) + 0.12 * sine(2 * f, n, 0.25)
    return _st(y * adsr(dur, 0.012, 0.3, 0.9, 0.18, n) * vel)


def _stack(f, n, voices, cents, seed, drift=4.0, vib=None):
    """Detuned saws spread across the stereo field, each drifting a few cents like an analog oscillator."""
    r = rng(seed)
    out = np.zeros((n, 2))
    sp = np.linspace(-1, 1, voices) if voices > 1 else np.zeros(1)
    for i, s in enumerate(sp):
        c = s * cents + r.normal(0, cents * 0.15 + 0.5)
        dc = drift * lfo(n, 0.35, seed * 31 + i) if drift else 0.0
        if vib is not None:
            dc = dc + vib * (0.85 + 0.3 * r.random())
        fi = f * 2 ** ((c + dc) / 1200)
        out += stereo_pan(saw(fi, n, r.random()), s * 0.85)
    return out / np.sqrt(voices)


@functools.lru_cache(maxsize=512)
def pad(notes, dur, vel=0.7, bright=0.4, seed=0, a=1.4, r=2.4):
    """A warm analog pad: per note a detuned saw pair and a soft sub-octave, a slowly opening low-pass."""
    n = n_of(dur + r)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for k, m in enumerate(notes):
        f = mtof(m)
        out += _stack(f, n, 3, 9, seed + k * 7)
        out += _st(saw(f / 2, n, 0.2)) * 0.18
    fc = (250 + 2600 * bright) * (0.55 + 0.45 * smoothstep(t / (a * 1.5))) * (1 + 0.08 * lfo(n, 0.2, seed))
    out = lp24(out, fc, 0.1, block=256)
    out *= adsr(dur, a, 1.5, 0.85, r, n)[:, None] * vel / np.sqrt(len(notes))
    return out


def _vib(n, rate=5.2, depth=11.0, delay=0.45, seed=0):
    t = np.arange(n) / SR
    rr = rate * (1 + 0.04 * lfo(n, 0.5, seed))
    return depth * smoothstep((t - delay * 0.5) / delay) * np.sin(TAU * np.cumsum(rr) / SR + seed)


@functools.lru_cache(maxsize=2048)
def strings(notes, dur, vel=0.7, seed=0, a=0.35, r=0.9, bright=0.5):
    """Synth strings: five saws a note, each with its own slight vibrato that comes in after the attack, a soft bow
    noise, a darkened top. vel shapes loudness and brightness (a crescendo opens them up)."""
    n = n_of(dur + r)
    out = np.zeros((n, 2))
    for k, m in enumerate(notes):
        f = mtof(m)
        out += _stack(f, n, 5, 13, seed + 11 * k, drift=3.0, vib=_vib(n, seed=seed + k))
    rn = rng(seed)
    bow = bp(rn.standard_normal((n, 2)), 2000, 6500) * 0.025
    out += bow
    fc = 900 + 4200 * bright * (0.5 + 0.5 * vel)
    out = lp24(out, fc, 0.05)
    out = hp(out, 70)
    out = dsp.filt(out, 'highshelf', 5000, 0.7, -5.0)
    out *= adsr(dur, a, 0.6, 0.9, r, n)[:, None] * vel / np.sqrt(len(notes))
    return out


@functools.lru_cache(maxsize=2048)
def spiccato(m, dur, vel=0.8, seed=0):
    """A short bowed note: a bright bite that closes fast (the strings' ostinato)."""
    f = mtof(m)
    n = n_of(dur + 0.12)
    t = np.arange(n) / SR
    x = _stack(f, n, 4, 10, seed, drift=2.0)
    fc = 700 + 4500 * vel * np.exp(-t / 0.05)
    y = lp24(x, fc, 0.1)
    y += bp(rng(seed).standard_normal((n, 2)), 1500, 6000) * np.exp(-t / 0.01)[:, None] * 0.15
    return y * adsr(dur, 0.004, 0.12, 0.25, 0.08, n)[:, None] * vel


@functools.lru_cache(maxsize=2048)
def brass(m, dur, vel=0.8, seed=0, octave=True):
    """Big low brass (the Zimmer horn): three saws and a square through a low-pass that blares open on the attack,
    driven; an octave below for weight."""
    f = mtof(m)
    n = n_of(dur + 0.5)
    t = np.arange(n) / SR
    x = _stack(f, n, 3, 6, seed, drift=2.5) * 0.8 + _st(square(f * 1.002, n, 0.3, 0.45)) * 0.3
    if octave:
        x += _st(saw(f / 2, n, 0.6)) * 0.45
    op = 1 - np.exp(-t / (0.09 + 0.12 * (1 - vel)))
    fc = 180 + (500 + 2800 * vel) * op * (0.78 + 0.22 * np.exp(-t / 0.5))
    y = lp24(x, fc, 0.15)
    y = np.tanh(2.2 * y) / np.tanh(2.2)
    return y * adsr(dur, 0.03 + 0.08 * (1 - vel), 0.5, 0.85, 0.45, n)[:, None] * vel


VOWELS = {'a': ((800, 10), (1150, 13), (2900, 24), (1, .5, .25)), 'o': ((450, 7), (800, 10), (2830, 24), (1, .45, .2)),
          'u': ((325, 6), (700, 9), (2530, 24), (1, .35, .12)), 'e': ((400, 7), (1600, 16), (2700, 24), (1, .4, .25))}


@functools.lru_cache(maxsize=512)
def choir(notes, dur, vel=0.7, vowel='a', seed=0, a=0.9, r=1.8):
    """A choir pad: per note a small section of detuned, vibrating saws through three formant band-passes (the
    vowel), with breath in the same formants."""
    n = n_of(dur + r)
    src = np.zeros((n, 2))
    for k, m in enumerate(notes):
        f = mtof(m)
        src += _stack(f, n, 4, 14, seed + 5 * k, drift=5.0, vib=_vib(n, 4.8, 18, 0.3, seed + k))
    src += rng(seed).standard_normal((n, 2)) * 0.06
    (f1, q1), (f2, q2), (f3, q3), (g1, g2, g3) = VOWELS[vowel]
    y = (dsp.filt(src, 'bp', f1, q1 / 3) * g1 + dsp.filt(src, 'bp', f2, q2 / 3) * g2 + dsp.filt(src, 'bp', f3, q3 / 3) * g3)
    y = lp(y, 5500)
    return y * adsr(dur, a, 1.0, 0.9, r, n)[:, None] * vel / np.sqrt(len(notes)) * 2.0


@functools.lru_cache(maxsize=2048)
def epiano(m, dur, vel=0.7, seed=0):
    """An FM electric piano: a mellow tone whose brightness dies away, a small bell-like tine on the strike, two
    carriers a hair apart for width."""
    f = mtof(m)
    rel = 0.45
    n = n_of(dur + rel + 0.1)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    idx = (0.5 + 1.5 * vel) * np.exp(-t / 0.8) + 0.12
    for ch, c in ((0, -2.5), (1, 2.5)):
        fc = f * 2 ** (c / 1200)
        mod = np.sin(TAU * fc * t)
        tine = np.sin(TAU * fc * 14 * t) * 0.9 * vel * np.exp(-t / 0.018)
        out[:, ch] = np.sin(TAU * fc * t + idx * mod + tine)
    t60 = 1.6 + 2.5 * (261.0 / f) ** 0.5
    e = 10 ** (-3 * t / t60) * np.minimum(1, t / 0.002)
    gate = np.ones(n)
    k = n_of(dur)
    gate[k:] = np.exp(-(t[k:] - t[k]) / (rel / 4))
    return out * (e * gate * vel)[:, None]


@functools.lru_cache(maxsize=1024)
def bell(m, dur, vel=0.6, seed=0):
    """A glass bell (FM, ratio 3.5): the icy sparkle."""
    f = mtof(m)
    n = n_of(dur + 2.5)
    t = np.arange(n) / SR
    y = np.sin(TAU * f * t + 1.8 * vel * np.exp(-t / 0.5) * np.sin(TAU * 3.5 * f * t))
    y *= 10 ** (-3 * t / 2.8) * np.minimum(1, t / 0.001)
    return _st(y * vel, 0.0)


@functools.lru_cache(maxsize=4096)
def pluck(m, dur, vel=0.7, bright=0.5, seed=0):
    """The arp synth: saw and a narrow pulse through a low-pass that snaps shut."""
    f = mtof(m)
    n = n_of(dur + 0.25)
    t = np.arange(n) / SR
    x = saw(f, n) * 0.7 + square(f * 1.003, n, 0.1, 0.3) * 0.35
    fc = 220 + (700 + 5200 * bright) * vel * np.exp(-t / 0.12)
    y = lp24(x, fc, 0.3)
    return _st(y * adsr(dur, 0.002, 0.3, 0.0, 0.08, n) * vel)


def lead_phrase(notes, beat, vel=0.8, seed=0, bright=0.6):
    """A legato saw lead over a phrase [(midi or None, beats), ...]: gliding between notes, vibrato on held ones."""
    total = sum(b for _, b in notes) * beat
    n = n_of(total + 0.8)
    f = np.zeros(n)
    g = np.zeros(n)
    t = 0.0
    last = None
    for m, b in notes:
        i0, i1 = n_of(t), n_of(t + b * beat)
        if m is not None:
            fm = mtof(m)
            if last is not None:
                k = min(i1 - i0, n_of(0.06))
                f[i0:i0 + k] = np.geomspace(last, fm, k)
                f[i0 + k:i1] = fm
            else:
                f[i0:i1] = fm
            g[i0:i1] = 1
            last = fm
        t += b * beat
    f[n_of(t):] = last or 220
    idx = np.where(f > 0)[0]
    f[:idx[0]] = f[idx[0]] if len(idx) else 220
    vib = _vib(n, 5.5, 14, 0.4, seed)
    fv = f * 2 ** (vib / 1200)
    x = np.c_[saw(fv * 2 ** (-6 / 1200), n), saw(fv * 2 ** (6 / 1200), n, 0.4)]
    ge = dsp.butter(g, 'lp', 30, 1)
    y = lp24(x, 900 + 3600 * bright, 0.15)
    y = np.tanh(1.5 * y)
    return y * (ge * vel)[:, None]


# ---------------------------------------------------------------- drums


@functools.lru_cache(maxsize=64)
def kick(vel=1.0, tight=0.5):
    n = n_of(0.9)
    t = np.arange(n) / SR
    f = 52 + 120 * np.exp(-t / (0.03 + 0.02 * (1 - tight)))
    y = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / (0.22 + 0.25 * (1 - tight)))
    y += np.sin(TAU * 104 * t) * np.exp(-t / 0.045) * 0.35
    y += hp(rng(1).standard_normal(n), 2500) * np.exp(-t / 0.002) * 0.25
    y = np.tanh(1.8 * y)
    return _st(y * vel)


def _drum(f, vel, ratios, amps, decays, slap, seed, drop=0.22, n_s=1.6):
    n = n_of(n_s)
    t = np.arange(n) / SR
    r = rng(seed)
    y = np.zeros(n)
    for q, a, d in zip(ratios, amps, decays):
        fk = f * q * (1 + drop * np.exp(-t / 0.025))
        y += a * np.sin(TAU * np.cumsum(fk) / SR + r.random()) * np.exp(-t / d)
    y += bp(r.standard_normal(n), 250, 2200) * np.exp(-t / 0.018) * slap
    y = np.tanh(1.4 * y) * np.minimum(1, t / 0.0008)
    return y * vel


@functools.lru_cache(maxsize=128)
def taiko(f=58.0, vel=1.0, seed=0):
    y = _drum(f, vel, [1, 1.59, 2.14, 2.30, 2.65, 3.16], [1, .55, .35, .25, .18, .12], [.8, .4, .28, .22, .18, .14], 0.5, seed)
    return _st(y)


@functools.lru_cache(maxsize=128)
def tom(f=110.0, vel=1.0, seed=0):
    y = _drum(f, vel, [1, 1.5, 1.98, 2.44], [1, .4, .25, .12], [.35, .18, .12, .08], 0.35, seed, drop=0.18, n_s=0.9)
    return _st(y)


@functools.lru_cache(maxsize=64)
def snare(vel=1.0, seed=0):
    n = n_of(0.7)
    t = np.arange(n) / SR
    r = rng(seed)
    body = np.sin(TAU * 188 * t) * np.exp(-t / 0.07) + 0.6 * np.sin(TAU * 332 * t + 1) * np.exp(-t / 0.045)
    nz = lp(bp(r.standard_normal(n), 900, 6500), 7000) * np.exp(-t / 0.15) * 0.9
    y = np.tanh(1.5 * (body * 0.7 + nz)) * np.minimum(1, t / 0.0005)
    return _st(y * vel)


@functools.lru_cache(maxsize=64)
def hat(vel=0.6, open_=False, seed=0):
    n = n_of(0.5 if open_ else 0.12)
    t = np.arange(n) / SR
    m = sum(square(f, n, k * 0.13) for k, f in enumerate([205.3, 304.4, 369.6, 522.7, 540.0, 800.0]))
    y = lp(bp(m, 6000, 10000) * 0.6 + bp(rng(seed).standard_normal(n), 6000, 11000) * 0.4, 11000)
    y *= np.exp(-t / (0.12 if open_ else 0.025)) * np.minimum(1, t / 0.0005)
    return _st(y * vel)


@functools.lru_cache(maxsize=64)
def shaker(vel=0.5, seed=0):
    n = n_of(0.12)
    t = np.arange(n) / SR
    y = bp(rng(seed).standard_normal(n), 3500, 9500) * np.minimum(1, t / 0.008) * np.exp(-t / 0.03)
    return _st(y * vel)


@functools.lru_cache(maxsize=64)
def tick(vel=0.5, seed=0):
    """A soft clock tick: a small woody body (the fabrication's clockwork)."""
    n = n_of(0.08)
    t = np.arange(n) / SR
    y = sum(a * np.sin(TAU * f * t) * np.exp(-t / d) for f, a, d in ((1150, 1, .02), (2480, .5, .012), (3950, .25, .007)))
    y += hp(rng(seed).standard_normal(n), 3000) * np.exp(-t / 0.001) * 0.3
    return _st(y * vel)


@functools.lru_cache(maxsize=32)
def cymbal(vel=0.7, dur=3.0, seed=0):
    n = n_of(dur)
    t = np.arange(n) / SR
    r = rng(seed)
    m = sum(square(f, n, k * 0.21) for k, f in enumerate([313.0, 421.7, 532.4, 607.9, 788.0, 1003.0]))
    y = lp(bp(m, 3000, 10000) * 0.5 + bp(r.standard_normal(n), 2500, 10000) * 0.6, 10000) * np.exp(-t / (dur * 0.3))
    return dsp.width(_st(y * vel * np.minimum(1, t / 0.002)), 1.4)


def swell(dur=2.0, vel=0.7, seed=0):
    """A reverse cymbal: noise and metal swelling into the next downbeat (ends exactly at dur)."""
    n = n_of(dur)
    t = np.arange(n) / SR
    r = rng(seed)
    m = sum(square(f, n, k * 0.21) for k, f in enumerate([313.0, 421.7, 532.4, 607.9, 788.0]))
    y = np.c_[bp(m, 2500, 9000) * 0.4 + bp(r.standard_normal(n), 2000, 9000) * 0.6, bp(m, 2500, 9000) * 0.4 + bp(r.standard_normal(n), 2000, 9000) * 0.6]
    e = (t / dur) ** 3.5
    y *= e[:, None]
    y[-n_of(0.004):] *= np.linspace(1, 0, n_of(0.004))[:, None]
    return y * vel


# ---------------------------------------------------------------- trailer toolkit


def riser(dur=4.0, vel=0.8, seed=0, top=7000.0):
    """Tension rising to a downbeat: noise sweeping up, a saw stack gliding up an octave, a tremolo speeding up."""
    n = n_of(dur)
    t = np.arange(n) / SR
    x = t / dur
    r = rng(seed)
    c = 250 * (top / 250) ** x ** 1.4
    nz = np.c_[dsp.filt(r.standard_normal(n), 'bp', c, 1.2, block=128), dsp.filt(r.standard_normal(n), 'bp', c * 1.05, 1.2, block=128)]
    f = mtof(50) * 2 ** (x ** 1.5)
    st = _stack(f, n, 5, 18, seed, drift=0)
    st = lp24(st, 300 + 5000 * x ** 2, 0.2, block=256)
    trem = 0.7 + 0.3 * np.sin(TAU * np.cumsum(4 + 14 * x ** 2) / SR)
    y = (nz * 0.8 + st * 0.5) * (x ** 2.2 * trem)[:, None]
    y[-n_of(0.003):] *= np.linspace(1, 0, n_of(0.003))[:, None]
    return y * vel


def sub_drop(dur=2.5, vel=1.0, f0=80.0, f1=34.0):
    n = n_of(dur)
    t = np.arange(n) / SR
    y = np.sin(TAU * np.cumsum(f0 * (f1 / f0) ** (t / dur)) / SR) * np.exp(-t / (dur * 0.5)) * np.minimum(1, t / 0.003)
    y = np.tanh(1.6 * y) / np.tanh(1.6)
    return _st(y * vel)


def braam(notes, dur=3.0, vel=1.0, seed=0):
    """The horn blast: low brass in octaves, heavily driven, the filter opening slowly across the first second."""
    n = n_of(dur + 0.8)
    t = np.arange(n) / SR
    x = np.zeros((n, 2))
    for k, m in enumerate(notes):
        f = mtof(m)
        x += _stack(f, n, 4, 9, seed + k, drift=3) + _st(square(f * 0.999, n, 0.1, 0.5)) * 0.3
    fc = 120 + 2600 * vel * smoothstep(t / 0.9) * (0.8 + 0.2 * np.exp(-t / 1.5))
    y = lp24(x, fc, 0.25, block=128)
    y = np.tanh(3.0 * y)
    return y * adsr(dur, 0.06, 1.0, 0.85, 0.8, n)[:, None] * vel / np.sqrt(len(notes))


def hit(vel=1.0, seed=0, low=38):
    """A trailer impact: kick, a low taiko, a brass stab in octaves, a burst of noise, and a sub tail."""
    out = np.zeros((n_of(4.0), 2))
    place(out, kick(1.0, 0.2), 0, 1.0)
    place(out, taiko(48.0, 1.0, seed), 0, 0.9)
    place(out, brass(low, 0.5, 1.0, seed) + brass(low + 12, 0.5, 0.9, seed + 1), 0, 0.5)
    n = n_of(0.5)
    t = np.arange(n) / SR
    place(out, np.c_[hp(rng(seed).standard_normal(n), 400), hp(rng(seed + 1).standard_normal(n), 400)] * np.exp(-t / 0.06)[:, None] * 0.35, 0)
    place(out, sub_drop(3.0, 0.8, 70, 32), 0)
    return out * vel
