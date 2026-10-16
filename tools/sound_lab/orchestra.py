"""Acoustic-style instruments for restrained film scores (more real than synth.py's analog voices):

- felt_piano: additive strings with inharmonic partials (stiffness B), three slightly detuned strings a note (the
  beating), a felt hammer whose brightness follows velocity, a two-stage decay (prompt sound, aftersound), the
  hammer's knock and a soundboard body;
- section: a string section (celli, violas, violins) of many bowed voices: sawtooth-like bowed tone per player with
  its own pitch drift and delayed vibrato, bow noise, the instrument body's formants (air, wood and bridge
  resonances), a soft bowed attack; sul_tasto darkens and flautando thins it;
- tremolo: the same section bowed fast (the tension bed);
- low_brass: horns/trombones in unison: a lip buzz (a narrow pulse) through a bell low-pass that opens with the
  breath, a slow swell and a brassy edge only at forte;
- timpani: a tuned kettledrum (membrane modes 1, 1.5, 1.99, 2.44, 2.89 of the tuned partial), felt mallet, rolls;
- bass_drum: a concert bass drum (a deep, unpitched boom) for the climaxes.

All return stereo float64 at 48 kHz. Notes are MIDI numbers.
"""
import functools

import numpy as np

from . import dsp
from .dsp import SR, TAU, n_of, rng
from .foley import bp, hp, lp, lfo, smoothstep


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def _bodyf(x, peaks):
    for f, g, q in peaks:
        x = dsp.filt(x, 'peak', f, q, g)
    return x


@functools.lru_cache(maxsize=2048)
def felt_piano(m, dur, vel=0.6, seed=0):
    f0 = mtof(m)
    rel = 0.35
    T = dur + rel + 0.05
    n = n_of(min(T, 9.0))
    t = np.arange(n) / SR
    r = rng(seed + m)
    B = 0.0004 * (f0 / 261.6) ** 0.6
    out = np.zeros((n, 2))
    nmax = int(min(40, (SR * 0.42) / f0))
    bright = 0.35 + 0.65 * vel
    for k in range(1, nmax + 1):
        fk = k * f0 * np.sqrt(1 + B * k * k)
        if fk > SR * 0.45:
            break
        a = (1 / k ** 1.1) * np.exp(-k * (1.2 - bright) * f0 / 1400) * (1 - 0.7 * (k % 7 == 0))
        t1 = (0.35 + 1.6 * (220 / f0) ** 0.6) / (1 + 0.12 * k)          # prompt
        t2 = (3.0 + 9.0 * (220 / f0) ** 0.7) / (1 + 0.05 * k)           # aftersound
        e = 0.7 * np.exp(-t / t1) + 0.3 * np.exp(-t / t2)
        for s, det in enumerate((-0.6, 0.0, 0.7)):                       # three strings, beating
            ph = r.random() * TAU
            y = np.sin(TAU * fk * (1 + det * 1e-3 * (0.5 + 0.5 * r.random()) / 1.7) * t + ph) * e * a / 3
            pan = (s - 1) * 0.25 + (m - 60) / 80
            out[:, 0] += y * np.cos((pan + 1) * np.pi / 4)
            out[:, 1] += y * np.sin((pan + 1) * np.pi / 4)
    # hammer knock and a felt thump
    kn = lp(r.standard_normal(n), 900 + 2500 * vel) * np.exp(-t / 0.012) * 0.04 * vel
    out += np.c_[kn, kn]
    att = np.minimum(1, t / (0.004 - 0.0025 * vel))
    gate = np.ones(n)
    kk = n_of(dur)
    if kk < n:
        gate[kk:] = np.exp(-(t[kk:] - t[kk]) / (rel / 4))
    out *= (att * gate)[:, None] * vel
    out = _bodyf(out, ((110, 2.0, 1.2), (250, 1.5, 1.0), (1800, -2.0, 0.8)))
    return out


def _bowed(f, n, seed, vib_rate=5.3, vib_cents=14.0, drift=5.0, delay=0.4):
    """One player's bowed tone: a band-limited saw (Helmholtz motion) with drift and a delayed vibrato."""
    r = rng(seed)
    t = np.arange(n) / SR
    dc = drift * lfo(n, 0.4, seed) + r.normal(0, 4)
    vib = vib_cents * smoothstep((t - delay * 0.4) / delay) * np.sin(TAU * np.cumsum(vib_rate * (1 + 0.05 * lfo(n, 0.6, seed + 1))) / SR + r.random() * TAU)
    fi = f * 2 ** ((dc + vib) / 1200)
    ph = np.cumsum(fi) / SR + r.random()
    K = int(min(30, SR * 0.4 / f))
    y = np.zeros(n)
    for k in range(1, K + 1):
        y += np.sin(TAU * k * ph) / k * (1 - (k / (K + 1)) ** 2)
    return y


@functools.lru_cache(maxsize=1024)
def section(notes, dur, vel=0.6, seed=0, players=6, a=0.6, r=1.2, tasto=0.4, flautando=0.0):
    """A string section holding `notes` (a tuple of MIDI numbers) for dur s."""
    n = n_of(dur + r)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    rr = rng(seed)
    for j, m in enumerate(notes):
        f = mtof(m)
        for p in range(players):
            y = _bowed(f, n, seed * 131 + j * 17 + p, vib_rate=4.9 + 0.8 * rr.random(), vib_cents=10 + 8 * rr.random(),
                       delay=0.35 + 0.3 * rr.random())
            pan = np.clip(-(m - 55) / 40, -0.45, 0.45) + rr.uniform(-0.3, 0.3)     # violins left, celli and basses right
            out[:, 0] += y * np.cos((pan + 1) * np.pi / 4)
            out[:, 1] += y * np.sin((pan + 1) * np.pi / 4)
    out /= np.sqrt(players * len(notes))
    bow = bp(rng(seed + 9).standard_normal((n, 2)), 1800, 7000) * 0.035 * (0.5 + vel)
    out += bow
    # the body: air (~ 280 Hz for violins, lower for celli), wood (~ 450-550 Hz), the bridge hill (2-3 kHz)
    lo = min(notes)
    air = 100 if lo < 50 else 180 if lo < 62 else 280
    out = _bodyf(out, ((air, 4.0, 2.0), (air * 1.9, 3.0, 1.6), (2600, 2.5 - 2.0 * tasto, 1.0), (1200, -2.5, 1.2)))
    fc = (1900 + 5200 * vel) * (1 - 0.35 * tasto) * (1 - 0.4 * flautando)
    out = lp(out, fc, 2)
    out = hp(out, 45)
    att = smoothstep(t / max(a, 1e-3))
    gate = np.ones(n)
    k = n_of(dur)
    gate[k:] = np.exp(-(t[k:] - t[k]) / (r / 4))
    e = att * gate * (1 + 0.04 * lfo(n, 0.3, seed))
    return out * (e * vel)[:, None]


@functools.lru_cache(maxsize=256)
def tremolo(notes, dur, vel=0.5, seed=0, rate=11.0):
    """Measured tremolo: the section with a fast, uneven bow-change amplitude (each player at its own rate)."""
    x = section(notes, dur, vel, seed, 5, 0.3, 0.6, 0.3)
    n = len(x)
    t = np.arange(n) / SR
    m = 0.6 + 0.4 * np.abs(np.sin(TAU * np.cumsum(rate * (1 + 0.08 * lfo(n, 1.5, seed))) / SR / 2))
    m2 = 0.6 + 0.4 * np.abs(np.sin(TAU * np.cumsum(rate * 1.07 * (1 + 0.08 * lfo(n, 1.5, seed + 1))) / SR / 2 + 1.0))
    del t
    return x * np.c_[m, m2]


@functools.lru_cache(maxsize=512)
def low_brass(m, dur, vel=0.6, seed=0, players=4, a=0.5, r=1.0):
    f = mtof(m)
    n = n_of(dur + r)
    t = np.arange(n) / SR
    rr = rng(seed)
    out = np.zeros((n, 2))
    breath = smoothstep(t / max(a, 1e-3)) * np.where(t < dur, 1.0, np.exp(-(t - dur) / (r / 4)))
    for p in range(players):
        dc = 3 * lfo(n, 0.5, seed + p) + rr.normal(0, 3)
        fi = f * 2 ** (dc / 1200)
        ph = np.cumsum(fi) / SR + rr.random()
        K = int(min(28, SR * 0.4 / f))
        y = np.zeros(n)
        for k in range(1, K + 1):
            y += np.sin(TAU * k * ph) / (k ** 0.8)
        pan = rr.uniform(-0.5, 0.5)
        out[:, 0] += y * np.cos((pan + 1) * np.pi / 4)
        out[:, 1] += y * np.sin((pan + 1) * np.pi / 4)
    out /= np.sqrt(players) * 4
    fc = 180 + (500 + 2600 * vel ** 1.5) * breath
    out = dsp.filt(out, 'lp', fc, 0.9, order=2, block=128)
    out = np.tanh((1 + 1.5 * vel) * out) / np.tanh(1 + 1.5 * vel)
    out = _bodyf(out, ((f * 2, 2.0, 2.0), (1100, 2.0 * vel, 1.2)))
    return out * (breath * vel)[:, None]


@functools.lru_cache(maxsize=128)
def timpani(m, vel=0.7, seed=0, dur=3.0):
    f = mtof(m)
    n = n_of(dur)
    t = np.arange(n) / SR
    r = rng(seed)
    y = np.zeros(n)
    for q, a, d in ((1.0, 1.0, 1.4), (1.504, 0.55, 0.9), (1.742, 0.25, 0.6), (2.0, 0.35, 0.7), (2.44, 0.18, 0.45), (2.89, 0.1, 0.35)):
        fq = f * q * (1 + 0.01 * vel * np.exp(-t / 0.05))
        y += a * np.sin(TAU * np.cumsum(fq) / SR + r.random()) * np.exp(-t / d)
    y += 0.5 * np.sin(TAU * f * 0.5 * t) * np.exp(-t / 0.25)                      # the kettle's air
    y += lp(r.standard_normal(n), 1200 + 2000 * vel) * np.exp(-t / 0.008) * 0.4   # felt on skin
    y *= np.minimum(1, t / 0.0015)
    y = np.tanh(1.2 * y) / np.tanh(1.2)
    return np.c_[y, y * 0.96] * vel


def timp_roll(m, dur, vel0=0.2, vel1=0.9, seed=0, rate=14.0):
    """A timpani roll swelling from vel0 to vel1 over dur (single strokes, slightly uneven)."""
    r = rng(seed)
    n = n_of(dur + 3.0)
    out = np.zeros((n, 2))
    t = 0.0
    k = 0
    while t < dur:
        v = vel0 + (vel1 - vel0) * (t / dur) ** 1.6
        x = timpani(m, round(v * (0.85 + 0.15 * r.random()), 2), (seed + k) % 6)
        i = n_of(t)
        out[i:i + len(x)] += x[:n - i] * (0.55 if k % 2 else 0.5)
        t += (1 / rate) * (0.9 + 0.2 * r.random())
        k += 1
    return out


@functools.lru_cache(maxsize=32)
def bass_drum(vel=0.8, seed=0, dur=3.5):
    n = n_of(dur)
    t = np.arange(n) / SR
    r = rng(seed)
    y = np.zeros(n)
    for f, a, d in ((42, 1.0, 1.1), (63, 0.6, 0.7), (88, 0.4, 0.45), (121, 0.25, 0.3), (167, 0.15, 0.2)):
        y += a * np.sin(TAU * f * (1 + 0.04 * np.exp(-t / 0.04)) * t + r.random()) * np.exp(-t / d)
    y += lp(r.standard_normal(n), 400) * np.exp(-t / 0.05) * 0.6
    y *= np.minimum(1, t / 0.003)
    y = np.tanh(1.3 * y) / np.tanh(1.3)
    return np.c_[y, y] * vel
