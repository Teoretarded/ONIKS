"""Club and internet styles for the scores: the instruments of hardstyle, phonk, frenchcore, hard techno and rage,
and helpers that lay them on a tempo grid anchored to a moment of the film (a drop on the frame it should hit).

Instruments (stereo float64, cached like synth.py):
- hard_kick: the hardstyle kick, a punch that sweeps down, then a long, distorted, pitched tail.
- reverse_bass: the offbeat 'reverse' tail of hardstyle.
- french_kick: a frenchcore kick, short, savage, its tail on a note (kick melodies).
- rumble_kick: a hard-techno kick with its low rumble.
- supersaw / anthem_lead: the euphoric lead.
- screech: a raw, bending lead.
- cowbell: the phonk 808 cowbell, pitched.
- b808: a sub bass with a click, saturation and glides.
- acid: a 303 line with accent and slide.
- clap.
- rage_lead: a wide, detuned, vibrating lead.
"""
import functools

import numpy as np

from . import dsp
from .dsp import SR, TAU, n_of, rng
from .foley import bp, hp, lfo, lp, place, smoothstep, stereo_pan
from .synth import _st, _stack, adsr, lp24, mtof, saw, sine, square


@functools.lru_cache(maxsize=256)
def hard_kick(vel=1.0, f=55.0, tail=0.42, dist=7.0, punch=1.0):
    """Hardstyle kick: a click and a pitch sweep (about 450 Hz down to f in 25 ms) for the punch, then a held,
    heavily distorted tail ringing at f that falls a little and stops short."""
    n = n_of(tail + 0.08)
    t = np.arange(n) / SR
    fr = f * (1 - 0.06 * t / tail) + (450 - f) * np.exp(-t / 0.011)
    ph = np.cumsum(fr) / SR
    body = np.sin(TAU * ph)
    hold = np.where(t < tail * 0.7, 1.0, np.exp(-(t - tail * 0.7) / (tail * 0.12)))
    y = np.tanh(dist * body * hold) * hold
    y = lp(y, 7000)
    y = dsp.filt(y, 'peak', 1800, 1.0, 4.0)                                    # the tail's bite
    click = hp(rng(3).standard_normal(n), 2000) * np.exp(-t / 0.0015) * 0.6 * punch
    sub = np.sin(TAU * np.cumsum(f + (160 - f) * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.12) * 0.8 * punch
    y = y * 0.75 + click + sub
    y = np.tanh(1.2 * y)
    return _st(hp(y, 28) * vel)


@functools.lru_cache(maxsize=256)
def reverse_bass(f=55.0, dur=0.3, vel=1.0, dist=5.0):
    """The offbeat reverse bass: a distorted tone at f swelling up to the next kick."""
    n = n_of(dur)
    t = np.arange(n) / SR
    e = (t / dur) ** 1.8
    e[-n_of(0.006):] *= np.linspace(1, 0, n_of(0.006))
    y = np.tanh(dist * np.sin(TAU * f * t)) * e
    y = lp(y, 3500)
    return _st(hp(y, 28) * vel)


@functools.lru_cache(maxsize=256)
def french_kick(m=38, vel=1.0, tail=0.2):
    """Frenchcore kick: brutal, short, its distorted tail tuned to a note so the kicks can play the melody."""
    f = float(mtof(m))
    n = n_of(tail + 0.05)
    t = np.arange(n) / SR
    fr = f + (600 - f) * np.exp(-t / 0.008)
    y = np.sin(TAU * np.cumsum(fr) / SR)
    hold = np.where(t < tail * 0.75, 1.0, np.exp(-(t - tail * 0.75) / 0.015))
    y = np.tanh(14 * y * hold) * hold
    y = dsp.filt(lp(y, 6000), 'peak', 2200, 1.2, 5.0)
    y += hp(rng(5).standard_normal(n), 2500) * np.exp(-t / 0.002) * 0.6
    return _st(hp(np.tanh(1.3 * y), 30) * vel)


@functools.lru_cache(maxsize=64)
def rumble_kick(vel=1.0, f=50.0, rumble=0.8, beat=0.4):
    """Hard-techno kick: a short punchy kick and the dark rumble after it (its low reverb, filtered and
    distorted), gone before the next beat."""
    n = n_of(beat)
    t = np.arange(n) / SR
    fr = f + (200 - f) * np.exp(-t / 0.02)
    k = np.sin(TAU * np.cumsum(fr) / SR) * np.exp(-t / 0.18)
    k = np.tanh(2.5 * k) + hp(rng(7).standard_normal(n), 3000) * np.exp(-t / 0.0015) * 0.4
    r = lp(rng(8).standard_normal(n), 140, 4) * smoothstep((t - 0.03) / 0.05) * np.exp(-t / (beat * 0.45))
    r = np.tanh(3 * r / (np.abs(r).max() + 1e-9)) * rumble * 0.6
    e = np.ones(n)
    e[-n_of(0.01):] = np.linspace(1, 0, n_of(0.01))
    return _st(hp((k + r) * e, 28) * vel)


@functools.lru_cache(maxsize=512)
def anthem_lead(m, dur, vel=0.8, bright=0.7, seed=0):
    """The euphoric hardstyle lead: a wide supersaw with an octave on top, opened up bright."""
    f = float(mtof(m))
    n = n_of(dur + 0.25)
    t = np.arange(n) / SR
    x = _stack(f, n, 7, 28, seed, drift=2.0) + _stack(f * 2, n, 3, 18, seed + 9, drift=2.0) * 0.4
    fc = 900 + 6000 * bright * (0.6 + 0.4 * np.exp(-t / 0.15))
    y = lp24(x, fc, 0.1, block=128)
    return y * adsr(dur, 0.005, 0.25, 0.75, 0.12, n)[:, None] * vel


@functools.lru_cache(maxsize=512)
def screech(m, dur, vel=0.8, bend=-2.0, seed=0):
    """A raw screech: a detuned square-and-saw stack, driven hard, its pitch bending down over the note."""
    f = float(mtof(m))
    n = n_of(dur + 0.1)
    t = np.arange(n) / SR
    fb = f * 2 ** (bend * smoothstep(t / max(dur, 1e-3)) / 12)
    x = np.c_[saw(fb * 2 ** (-12 / 1200), n) + square(fb * 1.003, n, 0.2, 0.35),
              saw(fb * 2 ** (12 / 1200), n, 0.5) + square(fb * 0.997, n, 0.7, 0.35)]
    x = dsp.filt(x, 'peak', 2400, 1.5, 9.0)
    y = np.tanh(3.5 * lp(x, 9000)) * 0.5
    return y * adsr(dur, 0.004, 0.2, 0.85, 0.06, n)[:, None] * vel


@functools.lru_cache(maxsize=512)
def cowbell(m, dur=0.25, vel=0.8):
    """The phonk cowbell: the 808's two square tones (ratio 1.44) through a band-pass, a sharp ring and a tail,
    pitched to the note."""
    f1 = float(mtof(m))
    n = n_of(max(dur, 0.12) + 0.3)
    t = np.arange(n) / SR
    x = square(f1, n) * 0.6 + square(f1 * 1.44, n, 0.3) * 0.4
    x = bp(x, f1 * 0.9, f1 * 4.5, 2)
    e = 0.7 * np.exp(-t / 0.02) + 0.3 * np.exp(-t / 0.22)
    gate = np.ones(n)
    k = n_of(dur)
    gate[k:] = np.exp(-(t[k:] - t[k]) / 0.04)
    return _st(np.tanh(1.6 * x * e * gate) * vel)


@functools.lru_cache(maxsize=1024)
def b808(m, dur, vel=1.0, from_m=None, dist=2.5, glide=0.07):
    """An 808 bass: a sine with a click and a fast pitch drop at the start, gliding from the previous note,
    saturated so it is heard on phones."""
    f = float(mtof(m))
    n = n_of(dur + 0.08)
    t = np.arange(n) / SR
    f0 = float(mtof(from_m)) if from_m is not None else f
    fr = f + (f0 - f) * np.exp(-t / (glide / 3)) if from_m is not None else f * (1 + 1.5 * np.exp(-t / 0.008))
    y = np.sin(TAU * np.cumsum(fr) / SR)
    y = np.tanh(dist * y) / np.tanh(dist)
    y += hp(rng(11).standard_normal(n), 3000) * np.exp(-t / 0.001) * 0.2
    return _st(y * adsr(dur, 0.002, 0.4, 0.85, 0.06, n) * vel)


@functools.lru_cache(maxsize=1024)
def acid(m, dur, vel=0.8, accent=0.0, from_m=None, cutoff=500.0, res=0.85):
    """A 303 line: a saw through a resonant 24 dB low-pass whose envelope snaps open, wider on accents, sliding
    from the previous note when tied."""
    f = float(mtof(m))
    n = n_of(dur + 0.03)
    t = np.arange(n) / SR
    if from_m is not None:
        f0 = float(mtof(from_m))
        fr = f + (f0 - f) * np.exp(-t / 0.02)
    else:
        fr = np.full(n, f)
    x = saw(fr, n)
    fc = cutoff + (900 + 2600 * accent) * np.exp(-t / (0.09 + 0.08 * accent))
    y = lp24(x, fc, res)
    y = np.tanh((1.6 + accent) * y)
    return _st(y * adsr(dur, 0.002, 0.15, 0.7, 0.02, n) * vel * (1 + 0.4 * accent))


@functools.lru_cache(maxsize=64)
def clap(vel=0.8, seed=0):
    n = n_of(0.5)
    t = np.arange(n) / SR
    r = rng(seed)
    e = sum(np.where(t >= d, np.exp(-(t - d) / 0.006), 0) for d in (0.0, 0.009, 0.019)) + np.where(t >= 0.028, 0.6 * np.exp(-(t - 0.028) / 0.12), 0)
    y = bp(r.standard_normal(n), 900, 6000) * e
    return dsp.width(_st(y * vel), 1.3)


@functools.lru_cache(maxsize=512)
def rage_lead(m, dur, vel=0.8, seed=0):
    """A rage lead: a very wide, detuned saw stack with a fast vibrato and a bright top."""
    f = float(mtof(m))
    n = n_of(dur + 0.3)
    t = np.arange(n) / SR
    vib = 18 * smoothstep(t / 0.15) * np.sin(TAU * 6.2 * t)
    x = _stack(f, n, 6, 32, seed, drift=0.0, vib=vib)
    y = lp24(x, 5200, 0.15)
    y = np.tanh(1.8 * y)
    return dsp.width(y * adsr(dur, 0.005, 0.2, 0.8, 0.2, n)[:, None] * vel, 1.4)


@functools.lru_cache(maxsize=256)
def hat_roll(vel, n_hits, span, open_=False):
    """A trap hat roll: n hits spread over span seconds."""
    from .synth import hat
    out = np.zeros((n_of(span + 0.2), 2))
    for i in range(n_hits):
        place(out, hat(vel * (0.7 + 0.3 * i / max(1, n_hits - 1)), open_ and i == n_hits - 1), n_of(i * span / n_hits))
    return out


def grid(bpm, anchor):
    """Time of (bar, beat) on a 4/4 grid at bpm whose bar 0 starts at `anchor` (bars may be negative)."""
    bar = 240.0 / bpm
    return lambda b, beat=0.0: anchor + b * bar + beat * bar / 4


def steps(S, G, bus, bars, fn, pattern, db=0.0, pan=None):
    """Hits on a 16-step pattern ('X' 1.0, 'x' .78, 'o' .55, '-' .33) for each bar; fn(vel) -> sound."""
    V = {'X': 1.0, 'x': 0.78, 'o': 0.55, '-': 0.33}
    for b in bars:
        for i, c in enumerate(pattern):
            if c in V:
                S.n(bus, G(b, i * 4 / len(pattern)), fn, V[c], db=db, pan=pan)
