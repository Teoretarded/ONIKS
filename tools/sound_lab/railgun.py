"""The railgun's sound, component by component, so each part reads on its own and they stack into the shot.

The charge: the pulse-forming network's banks fill through their chargers.
- whine: the chargers' inverters sing up as the voltage climbs. That rising tone is how a charging capacitor is
  recognised. Here it is a chorus of four, deep and in key, stepping up as each bank arms, and trembling at full
  charge.
- hum: the supply transformers, an octave of hum climbing under it.
- bank_arm: a bank coming on line: the contactor's chunk, a short zap of current, the low thoom of the field.
- arcs: corona and arcs crawling on the rails as the voltage peaks (from the measured Jacob's ladder and sparks).
- interlock: full charge, the interlock slams, everything is held.

The shot (all measured against real recordings with tools/audio_impact.py):
- dump: the banks going off, a saturated burst of buzz, a spark gap's snap enlarged, a pressure thump.
- breech: the current arcing at the breech, a short bright electrical crack.
- zip: the armature accelerating down the rails, a tone and hiss sweeping from high to low in 90 ms.
- blast: the muzzle report, the measured railgun's wall of sound with the howitzer's body and the falling 'umf'.
- crack: the round's bow shock, a rifle's supersonic crack made huge, and a second one down range.
- ring: the rails ringing like a struck bar (tuned to F), with a bright ting.
- plasma: the muzzle flash's plasma crackling and dying.
- echoes: the report coming back off the sea and the coast, duller each time.
- roll: lightning's roll, the long tail.

Every function returns stereo float64 at 48 kHz, normalised to a peak of 1. `shot_parts()` and
`charge_parts()` return the named parts laid out in time; `PARTS_DB` holds their levels in the mix.
"""
import numpy as np

from . import dsp, foley as F
from .dsp import SR, TAU, n_of, rng
from .foley import bp, hp, lp, peak, place, smoothstep, stereo_pan


def _env_steps(n, times, f0, f1, step=1.22):
    """A pitch curve from f0 to f1 (exponential) that also jumps up a step at each time (a bank arming) and
    settles back onto the curve."""
    t = np.arange(n) / SR
    dur = n / SR
    base = f0 * (f1 / f0) ** (smoothstep(t / dur) ** 0.9)
    bump = np.ones(n)
    for tk in times:
        a = np.clip((t - tk) / 0.04, 0, 1)
        bump *= 1 + (step - 1) * a * np.exp(-np.maximum(t - tk, 0) / 0.9)
    return base * bump


def whine(dur=11.0, f0=110.0, f1=880.0, banks=(), seed=0, ready=1.0):
    """The chargers singing up: four inverters a little apart, rich in low harmonics, their pitch climbing an
    octave and more with steps at each bank, a 120 Hz ripple in it, and at full charge a held, trembling tone."""
    n = n_of(dur)
    t = np.arange(n) / SR
    r = rng(seed)
    f = _env_steps(n, banks, f0, f1)
    hold = smoothstep((t - (dur - ready)) / 0.25)                                      # the last `ready` s: held
    f = f * (1 - hold) + f1 * hold * (1 + 0.004 * np.sin(TAU * 7.0 * t))
    out = np.zeros((n, 2))
    for k, (det, pan) in enumerate(((-6, -0.6), (-2, -0.2), (3, 0.25), (7, 0.65))):
        fk = f * 2 ** (det / 1200) * (1 + 0.002 * F.lfo(n, 0.8, seed + k))
        ph = np.cumsum(fk) / SR + r.random()
        v = (np.sin(TAU * ph) + 0.55 * np.sin(2 * TAU * ph + 1) + 0.3 * np.sin(3 * TAU * ph + 2) + 0.18 * np.sin(4 * TAU * ph))
        v += 0.45 * np.sin(TAU * ph / 2 + k)                                                # the octave below (body)
        out += stereo_pan(v, pan)
    ripple = 1 + 0.22 * np.sin(TAU * 120 * t)
    out *= ripple[:, None]
    lvl = (0.15 + 0.85 * smoothstep(t / dur) ** 1.5)
    out *= lvl[:, None]
    out = dsp.filt(out, 'lp', np.minimum(f * 5, 9000), 0.8, block=256)
    return peak(F.fade(out, 0.4, 0.008))


def hum(dur=11.0, seed=0):
    return F.charge_hum(dur, 45, 110, seed)


def bank_arm(size=1.0, seed=0):
    """A bank coming on line: the contactor's chunk, a short zap of current, the field's low thoom."""
    out = np.zeros((n_of(1.4), 2))
    place(out, np.c_[F.latch(1.4 * size, seed, gap=0.01, ring=0.3)] * np.ones((1, 2)), 0, 1.0)
    m = n_of(0.07)
    t = np.arange(m) / SR
    zap = np.tanh(6 * np.sin(TAU * 150 * t) * (1 + 0.5 * np.sin(TAU * 1100 * t))) * np.exp(-t / 0.02)
    zap += bp(F.dsp.crackle(0.07, 9000, seed + 1, 0.2), 1200, 6000) * np.exp(-t / 0.015) * 1.5
    place(out, F.decor(zap, seed), n_of(0.012), 0.8)
    e = F.energize(0.9 * size, seed + 2, hold=0.4)
    place(out, np.c_[e, e], n_of(0.015), 0.6)
    return peak(out)


def arcs(dur=6.0, seed=0):
    return F.arcs(dur, [(0, 0.15), (dur * 0.7, 0.6), (dur, 1.0)], seed)


def interlock(seed=0):
    out = F.breaker(seed)
    return peak(np.c_[out, out])


def dump(seed=0):
    """The banks going off: a saturated burst of buzz (the current), the spark gap's snap enlarged, a thump."""
    out = np.zeros((n_of(2.6), 2))
    m = n_of(0.12)
    t = np.arange(m) / SR
    bz = np.tanh(7 * (np.sin(TAU * 110 * t) + 0.6 * np.sin(TAU * 220 * t + 1) + 0.4 * np.sin(TAU * 330 * t + 2))) * np.exp(-t / 0.045)
    bz = bz + bp(F.dsp.crackle(0.12, 12000, seed, 0.15), 900, 7000) * np.exp(-t / 0.03) * 2
    place(out, F.decor(bz, seed), 0, 1.0)
    place(out, F.discharge(seed + 1, 1.2), n_of(0.004), 1.0)
    return peak(out)


def breech(seed=0):
    """The current hitting the armature at the breech: a hard electric crack and a short saturated buzz (BZZT)."""
    n = n_of(0.25)
    t = np.arange(n) / SR
    c = F.arc_crack(seed, 0.3)[:n]
    bz = np.tanh(5 * (np.sin(TAU * 120 * t) + 0.7 * np.sin(TAU * 240 * t + 1) + 0.5 * np.sin(TAU * 360 * t + 2))) * np.exp(-t / 0.05)
    bz = dsp.filt(bz, 'peak', 1800, 0.9, 6.0)
    y = np.pad(c, (0, max(0, n - len(c))))[:n] * 0.8 + bz * 0.7
    return peak(F.decor(y, seed))


def zip_(seed=0, dur=0.4):
    """The armature racing up the barrel (the glow seen travelling up it before the flash): a tone and a band of
    hiss rising faster and faster from 140 Hz to 2.6 kHz, a magnetic hum swelling under it, cut at the muzzle."""
    n = n_of(dur)
    t = np.arange(n) / SR
    x = t / dur
    f = 140 * (2600 / 140) ** (x ** 2.2)
    ph = np.cumsum(f) / SR
    tone = np.sin(TAU * ph) * 0.7 + np.sin(TAU * 2 * ph + 1) * 0.35 + np.sin(TAU * 3 * ph + 2) * 0.15
    hiss = dsp.filt(rng(seed).standard_normal(n), 'bp', np.minimum(f * 1.6, 12000), 1.8, block=64)
    hm = np.tanh(3 * np.sin(TAU * 120 * t)) * 0.4
    e = (0.15 + 0.85 * x ** 1.6)
    y = (tone + hiss * 1.0 + hm) * e
    y[-n_of(0.002):] *= np.linspace(1, 0, n_of(0.002))
    return peak(F.decor(np.tanh(1.4 * y), seed, 0.3))


def blast(seed=0):
    """The muzzle report: the measured wall of sound, its top held back for the first 40 ms so the crack leads,
    tightened after a quarter second so the ring, the plasma and the echoes come through."""
    x = F.railgun_blast(seed, weight=1.3, crack=0.4, tail=0.35)
    n = len(x)
    t = np.arange(n) / SR
    e = np.where(t < 0.25, 1.0, np.exp(-(t - 0.25) / 0.55))
    x = x * (0.25 + 0.75 * e)[:, None]
    early = lp(x, 2500)
    w = np.clip(t / 0.04, 0, 1)[:, None]
    x = early * (1 - w) + x * w
    return peak(lp(x, 6000))


def crack(seed=0):
    """The round's bow shock: the measured rifle crack, large, and its echo down range."""
    out = np.zeros((n_of(1.4), 2))
    c = F.resynth(F.template('rifle_mosin'), seed, 0.25, attack_ms=0.2)
    c *= np.exp(-np.arange(len(c)) / (SR * 0.05))[:, None]
    n = F.nwaves(0.1, [0.0], [1.0], [0.0025], [16000], seed)
    place(out, c, 0, 1.0)
    place(out, np.c_[n, n], 0, 0.8)
    place(out, lp(c, 3500), n_of(0.62), 0.35)
    return peak(out)


def ring(seed=0):
    """The rails ringing like a struck bar: low modes on F (F2, F3) and the bar's bright upper modes (F5, C6),
    which carry through the blast's decay."""
    a = F.metal(6.0, 3.2, 0.9, seed, 0.2, f0=87.3)
    b = F.metal(3.0, 2.5, 0.9, seed + 1, 0.0, f0=174.6)
    c = F.metal(0.9, 3.5, 0.95, seed + 2, 0.0, f0=698.5)
    d = F.metal(0.6, 2.8, 0.95, seed + 3, 0.0, f0=1046.5)
    n = max(len(a), len(b), len(c), len(d))
    y = np.zeros(n)
    for v, g in ((a, 0.8), (b, 0.6), (c, 1.0), (d, 0.7)):
        y[:len(v)] += v * g
    return peak(F.decor(y, seed, 0.5))


def plasma(dur=3.6, seed=0):
    """The muzzle flash's plasma: arcs and crackle, dying."""
    return F.arcs(dur, [(0, 1.0), (dur, 0.0)], seed)


def echoes(seed=0):
    """The report returning off the sea and the coast: duller and later each time."""
    src = F.railgun_blast(seed, weight=0.6, crack=1.0, tail=0.0)[:n_of(0.5)]
    out = np.zeros((n_of(4.0), 2))
    for d, g, f in ((0.33, 0.55, 3200), (0.78, 0.4, 2000), (1.55, 0.28, 1200), (2.6, 0.18, 700)):
        place(out, lp(src, f), n_of(d), g)
    return peak(out)


def roll(seed=0):
    return peak(F.resynth(F.template('lightning'), seed, 3.0, attack_ms=60))


# levels in the mix (dB), relative; the shot parts start at the shot, the charge parts as laid out
PARTS_DB = {'whine': -9, 'hum': -13, 'bank_arm': -5, 'arcs': -12, 'interlock': -2,
            'dump': -6, 'breech': -3, 'zip': -5, 'blast': 0, 'crack': 0, 'ring': -2, 'plasma': -9, 'echoes': -7, 'roll': -9}
SHOT_OFFS = {'breech': -0.42, 'zip': -0.4, 'blast': 0.0, 'crack': 0.0, 'ring': 0.01, 'plasma': 0.08, 'echoes': 0.0, 'roll': 0.12}


def shot_parts(seed=0):
    """The shot's parts {name: (offset s from the shot, audio)}."""
    return {'breech': (SHOT_OFFS['breech'], breech(seed)), 'zip': (SHOT_OFFS['zip'], zip_(seed + 1)),
            'blast': (0.0, blast(seed + 2)), 'crack': (SHOT_OFFS['crack'], crack(seed + 3)), 'ring': (SHOT_OFFS['ring'], ring(seed + 4)),
            'plasma': (SHOT_OFFS['plasma'], plasma(3.6, seed + 5)), 'echoes': (0.0, echoes(seed + 6)), 'roll': (SHOT_OFFS['roll'], roll(seed + 7))}


def charge_parts(t_charge, t_full, n_banks=8, seed=0):
    """The charge's parts {name: [(start s, audio), ...]} between t_charge and t_full (full charge, the
    interlock). Times are absolute (the caller's clock)."""
    dur = t_full - t_charge
    banks = [t_charge + 0.1 + (dur - 0.9) * (1 - (1 - k / n_banks) ** 1.35) for k in range(n_banks)]
    out = {'whine': [(t_charge, whine(dur, 110.0, 880.0, [b - t_charge for b in banks], seed, ready=1.0))],
           'hum': [(t_charge - 4.0, hum(dur + 4.0, seed + 1))],
           'arcs': [(t_full - 6.0, arcs(6.0, seed + 2))],
           'bank_arm': [(b, bank_arm(1.0 + 0.08 * k, seed + 10 + k)) for k, b in enumerate(banks)],
           'interlock': [(t_full, interlock(seed + 30))]}
    return out, banks
