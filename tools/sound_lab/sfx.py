"""Sound-effect recipes. Each is a function of a few plain parameters plus a seed, returning stereo float (n, 2)
peak-normalised to -1 dBFS (set the level in the score). Built by layering, like a sound designer would: a
transient for the attack, a body for weight, a tail for size, and space for distance.

All recipes: list(RECIPES) · RECIPES[name](**params). Times in seconds, frequencies in Hz."""
import numpy as np

from . import dsp as D
from .dsp import SR

RECIPES = {}


def recipe(fn):
    RECIPES[fn.__name__] = fn
    return fn


def _out(x, peak=-1.0):
    x = D.normalize(D.stereo(x), peak)
    a = np.abs(x).max(1)
    live = np.nonzero(a > 10 ** (-72 / 20))[0]          # trim the silent end of reverb tails
    if len(live):
        x = x[:min(len(x), live[-1] + D.n_of(0.05))]
    return D.fade(x, 0.001, 0.03)


def _distance(x, distance, t60=2.5):
    """0 = in your face, 1 = far away: duller, later, wetter."""
    if distance <= 0:
        return x
    x = D.filt(x, 'lp', 18000 * (1 - distance) + 700 * distance, order=2)
    x = D.mix((D.silence(0.0), 0), (x, 0, distance * 0.25))
    return D.reverb(x, t60 * (1 + distance), mix=0.25 + 0.5 * distance, predelay=0.03 + 0.08 * distance)


# ---------------------------------------------------------------- impacts and explosions

@recipe
def explosion(size=1.0, distance=0.0, seed=0):
    """Layered blast: crack, sub thump with a pitch drop, swept noise body, debris crackle, rolling rumble tail."""
    s = max(0.2, size)
    dur = 2.5 + 4.0 * s
    crack = D.filt(D.noise(0.04, 'white', seed), 'hp', 1200) * D.decay(0.04, 0.03, 0.0005)
    pop = D.osc('sine', [(0, 1800), (0.006, 300)], 0.012) * D.decay(0.012, 0.01, 0.0002)
    f0 = 75 / s ** 0.3
    thump = D.drive(D.osc('sine', D.expo(f0, 26, D.n_of(0.9 * s), 0.6), 0.9 * s) * D.decay(0.9 * s, 0.8 * s, 0.003), 1.8)
    bd = 2.2 * s
    body = D.noise(bd, 'pink', seed + 1) * D.decay(bd, 1.6 * s, 0.004)
    body = D.filt(body, 'lp', D.expo(7000, 220, D.n_of(bd), 0.45), 0.8)
    roar = D.filt(D.noise(bd, 'brown', seed + 2), 'bp', 260, 0.6) * D.decay(bd, 2.0 * s, 0.03)
    deb = np.c_[D.crackle(dur, [(0, 500), (0.8 * s, 120), (1.8 * s, 6), (2.6 * s, 0)], seed + 3, 0.8),
                D.crackle(dur, [(0, 500), (0.8 * s, 120), (1.8 * s, 6), (2.6 * s, 0)], seed + 4, 0.8)]
    deb = D.filt(deb, 'hp', 1800) * 0.6
    rum = D.filt(D.noise(dur, 'brown', seed + 5), 'lp', 110, order=2)
    wob = D.filt(np.abs(D.noise(dur, 'white', seed + 6)), 'lp', 3.0, order=2)
    rum = rum * (0.4 + 3 * wob) * D.decay(dur, 3.5 * s, 0.08)
    x = D.mix((crack, -2), (pop, -6), (thump, 0), (D.width(D.stereo(body), 1.3), -1), (roar, -4), (deb, -16),
              (D.width(D.stereo(rum), 1.5), -6), length=D.n_of(dur))
    x = D.drive(x * 1.4, 1.5)
    x = D.reverb(x, 2.2 * s, mix=0.18, predelay=0.015, damp=0.6)
    return _out(_distance(x, distance))


@recipe
def impact(weight=1.0, metal=0.5, seed=0):
    """Heavy hit (things landing, hull hits): thud, metal modes, short debris."""
    w = max(0.2, weight)
    ex = D.noise(0.006, 'white', seed) * np.hanning(D.n_of(0.006))
    ex = np.pad(ex, (0, D.n_of(2.0)))
    base = 140 / w ** 0.4
    ratios = np.array([1, 2.71, 4.53, 6.89, 9.7, 12.9, 16.2])
    m = D.modal(ex, base * ratios * (1 + 0.02 * D.rng(seed).standard_normal(7)), 0.15 + 0.9 * metal * np.array([1, .8, .7, .55, .45, .35, .3]),
                1 / np.sqrt(ratios))
    thud = D.osc('sine', D.expo(110 / w ** 0.3, 40, D.n_of(0.4)), 0.4) * D.decay(0.4, 0.3 * w)
    deb = D.filt(D.crackle(0.8, [(0, 300), (0.6, 0)], seed + 1), 'hp', 2500)
    x = D.mix((m / (np.abs(m).max() + 1e-9), -4 + 6 * metal), (thud, 0), (deb, -18))
    return _out(D.reverb(x, 1.2, mix=0.15))


@recipe
def trailer_hit(note=33, seed=0):
    """Cinematic boom: sub drop, distorted low brass stab, crack and a huge hall."""
    f = 440 * 2 ** ((note - 69) / 12)
    sub = D.drive(D.osc('sine', D.expo(f * 3, f, D.n_of(0.25), 0.5).tolist() + [f] * D.n_of(2.75), 3.0), 2) * D.decay(3.0, 2.5, 0.002)
    br = braam(note=note + 12, dur=2.5, seed=seed)
    cr = D.filt(D.noise(0.05, 'white', seed), 'hp', 900) * D.decay(0.05, 0.04, 0.0005)
    x = D.mix((sub, 0), (br, -4), (cr, -6))
    return _out(D.reverb(x, 4.5, mix=0.3, predelay=0.02))


@recipe
def sub_drop(dur=2.0, f_start=110.0, f_end=28.0):
    x = D.osc('sine', D.expo(f_start, f_end, D.n_of(dur), 0.7), dur) * D.decay(dur, dur * 1.2, 0.005)
    return _out(D.drive(x, 1.6))


@recipe
def thunder(distance=0.4, seed=0):
    """Close rip (if near) then a rolling low rumble built from random bumps."""
    dur = 7.0
    r = D.rng(seed)
    env = np.zeros(D.n_of(dur))
    for _ in range(14):
        t0 = r.random() ** 1.6 * dur * 0.7
        a = r.random() * (1 - t0 / dur)
        k = D.n_of(0.6 + r.random())
        i = D.n_of(t0)
        seg = np.hanning(k) * a
        env[i:i + k] += seg[:len(env) - i]
    rum = D.filt(D.noise(dur, 'brown', seed + 1), 'lp', 260, order=2) * env
    rip = D.filt(D.noise(0.9, 'pink', seed + 2), 'hp', 900) * D.decay(0.9, 0.5, 0.002) * (1 - distance)
    crk = D.filt(D.crackle(1.0, [(0, 2000), (1, 0)], seed + 3), 'hp', 3000) * (1 - distance)
    x = D.mix((D.width(D.stereo(rum), 1.6), 0), (rip, -6), (crk, -14))
    return _out(D.reverb(D.filt(x, 'lp', 9000 - 7000 * distance), 3.5, mix=0.3))


# ---------------------------------------------------------------- the railgun

@recipe
def railgun_charge(dur=4.0, seed=0):
    """Capacitors charging: a rising whine, FM shimmer, mains buzz and arcs getting denser; cuts off at the end."""
    n = D.n_of(dur)
    f = D.expo(60, 3200, n, 1.7)
    whine = D.osc('saw', f, dur) * 0.5 + D.osc('sine', f * 2, dur) * 0.3
    whine = D.filt(whine, 'lp', np.clip(f * 3, 200, 16000), 1.2)
    shim = D.fm(f * 0.75, 1.414, np.minimum(D.expo(0.3, 5, n), 9000 / (f * 1.06 + 1) - 1).clip(0.1), dur) * 0.25   # sidebands kept under ~10 kHz
    buzz = D.filt(D.osc('square', D.expo(100, 180, n), dur), 'lp', 1800) * (0.5 + 0.5 * D.osc('sine', 9, dur)) * 0.15
    arcs = D.filt(D.crackle(dur, D.expo(1, 600, n, 2.5), seed, 0.5), 'bp', 5000, 0.8)
    sub = D.osc('sine', 38, dur) * np.linspace(0, 1, n) ** 2
    rise = np.linspace(0, 1, n) ** 1.6
    x = D.mix((whine * rise, 0), (shim * rise, -4), (buzz, -8), (np.c_[arcs, np.roll(arcs, 331)], -6), (sub, -6))
    x = D.chorus(x, 0.3, 3, 10, 0.4)[:n]
    x[-D.n_of(0.004):] *= np.linspace(1, 0, D.n_of(0.004))[:, None]
    return _out(x)


@recipe
def railgun_fire(seed=0, distance=0.0):
    """The shot: arc snap, a falling FM zap, the supersonic N-wave crack, sub punch, a whistle leaving, and
    the sound bouncing back off the terrain as rolling thunder."""
    snap = D.filt(D.noise(0.02, 'white', seed), 'bp', 5500, 0.9) * D.decay(0.02, 0.015, 0.0002)
    zap = D.drive(D.fm(D.expo(4200, 110, D.n_of(0.35), 0.5), 2.71, D.expo(9, 0.3, D.n_of(0.35)), 0.35), 2.5) * D.decay(0.35, 0.3, 0.0005)
    nw = np.linspace(1, -1, D.n_of(0.0025))
    crack = np.r_[nw, np.zeros(D.n_of(0.012)), nw * 0.55]
    crack = D.filt(np.pad(crack, (0, D.n_of(0.1))), 'hp', 180)
    punch = D.drive(D.osc('sine', D.expo(120, 32, D.n_of(0.6), 0.5), 0.6) * D.decay(0.6, 0.45, 0.001), 2.2)
    whistle = D.osc('sine', D.expo(2600, 700, D.n_of(1.6), 0.7), 1.6) * D.decay(1.6, 1.2, 0.02)
    whistle = D.pan(whistle, [(0, 0.0), (1.6, 0.85)])
    dur = 7.0
    roll = D.filt(D.noise(dur, 'pink', seed + 1), 'lp', 420, order=2) * D.decay(dur, 4.0, 0.15)
    echo = D.mix(*[(D.filt(roll, 'lp', 900 / (k + 1)), -4 - 5 * k, 0.35 + 0.55 * k) for k in range(4)], length=D.n_of(dur))
    x = D.mix((snap, -1), (zap, -4), (crack * 2.5, 0), (punch, -2), (whistle, -15), (D.width(echo, 1.7), -8),
              length=D.n_of(dur))
    x = D.reverb(x, 3.0, mix=0.2, predelay=0.01, damp=0.55)
    return _out(_distance(x, distance))


# ---------------------------------------------------------------- scans and UI

@recipe
def scan_sweep(dur=2.5, direction=1.0, seed=0):
    """The lime lightning scan: a glassy FM chirp sweeping across the stereo field, branching electric forks
    along it, glass sparkles and a soft sub swell."""
    n = D.n_of(dur)
    r = D.rng(seed)
    hump = np.sin(np.linspace(0, np.pi, n)) ** 0.7
    chirp = D.fm(D.expo(420, 3400, n, 0.8), 3.01, 1.8 + 1.5 * hump, dur) * hump
    chirp = D.pan(D.filt(chirp, 'hp', 300), np.linspace(-0.9, 0.9, n) * direction)
    forks = np.zeros((n, 2))
    for _ in range(int(9 * dur)):
        t0 = r.random() * dur * 0.92
        L = D.n_of(0.015 + 0.05 * r.random())
        b = D.filt(D.noise(L / SR, 'white', int(r.integers(1e6))), 'bp', 2500 + 7000 * r.random(), 2.5)
        b *= np.exp(-np.linspace(0, 6, L))
        p = (t0 / dur * 1.8 - 0.9) * direction + 0.15 * r.standard_normal()
        i = D.n_of(t0)
        forks[i:i + L] += D.pan(b, float(np.clip(p, -1, 1)))[:n - i] * (0.4 + r.random())
    tones = np.array([2093, 2349.3, 2793.8, 3136, 3729.3, 4186])          # high pentatonic glass
    spark = np.zeros((n, 2))
    for _ in range(int(30 * dur)):
        t0 = r.random() * dur
        f = r.choice(tones) * 2 ** r.integers(0, 2)
        L = D.n_of(0.08 + 0.15 * r.random())
        g = D.osc('sine', f, L / SR) * D.decay(L / SR, L / SR * 0.7, 0.001) * r.random() * hump[min(n - 1, D.n_of(t0))]
        i = D.n_of(t0)
        spark[i:i + L] += D.pan(g, float(np.clip((t0 / dur * 2 - 1) * direction, -1, 1)))[:n - i]
    sub = D.osc('sine', 55, dur) * hump ** 2
    x = D.mix((chirp, -2), (forks, -3), (spark, -10), (sub, -12), length=n)
    return _out(D.reverb(x, 1.4, mix=0.3, predelay=0.01, damp=0.2))


@recipe
def lock_on(steps=4, seed=0):
    """Target acquisition: rising beeps tightening in time, then a confirm chord."""
    parts, t = [], 0.0
    for k in range(steps):
        f = 880 * 2 ** (k * 3 / 12)
        b = D.osc('square', f, 0.07) * D.adsr(0.07, 0.002, 0.02, 0.6, 0.03)
        parts.append((D.filt(b, 'lp', 5000), -6, t))
        t += 0.24 * 0.82 ** k
    ch = sum(D.osc('sine', 880 * 2 ** (i / 12), 0.5) for i in (12, 16, 19)) * D.decay(0.5, 0.45, 0.003)
    parts.append((ch, -4, t + 0.05))
    return _out(D.reverb(D.mix(*parts), 0.8, mix=0.2))


@recipe
def ui_blip(kind='select'):
    """select | confirm | deny | open | close: tiny interface sounds."""
    seqs = {'select': [(1320, 0.04)], 'confirm': [(1046.5, 0.05), (1568, 0.09)], 'deny': [(330, 0.09), (247, 0.14)],
            'open': [(660, 0.04), (990, 0.04), (1320, 0.06)], 'close': [(1320, 0.04), (990, 0.04), (660, 0.06)]}
    parts, t = [], 0.0
    for f, d in seqs[kind]:
        w = 'square' if kind == 'deny' else 'sine'
        parts.append((D.osc(w, f, d) * D.adsr(d, 0.002, 0.01, 0.7, d * 0.4), 0, t))
        t += d * 0.9
    x = D.mix(*parts)
    return _out(D.reverb(D.filt(x, 'lp', 7000), 0.5, mix=0.15))


@recipe
def data_stream(dur=2.0, density=18, seed=0):
    """HUD telemetry: crushed bleeps on a pentatonic grid, scattered across the stereo field."""
    r = D.rng(seed)
    scale = np.array([0, 3, 5, 7, 10])
    parts = []
    t = 0.0
    while t < dur:
        f = 1046.5 * 2 ** ((scale[r.integers(0, 5)] + 12 * r.integers(0, 2)) / 12)
        d = 0.02 + 0.05 * r.random()
        b = D.osc('square', f, d) * D.adsr(d, 0.001, 0.005, 0.6, 0.01)
        parts.append((D.pan(b, r.uniform(-0.8, 0.8)), -10 * r.random(), t))
        t += r.exponential(1 / density)
    x = D.crush(D.mix(*parts, length=D.n_of(dur + 0.1)), 6, 3)
    return _out(D.filt(x, 'lp', 9000))


@recipe
def sonar_ping(freq=1450.0, seed=0):
    p = D.osc('sine', freq, 0.35) * D.adsr(0.35, 0.01, 0.1, 0.5, 0.2)
    x = D.mix((p, 0), (D.filt(p, 'lp', 2000), -14, 1.8))
    return _out(D.reverb(x, 5.0, mix=0.45, predelay=0.05, damp=0.7))


@recipe
def alarm(dur=3.0, rate=2.0):
    n = D.n_of(dur)
    sq = (D.osc('square', rate, dur) > 0)
    f = np.where(sq, 560.0, 440.0)
    x = D.drive(D.filt(D.osc('saw', f, dur), 'bp', 900, 0.8) * 2, 2) * D.adsr(dur, 0.02, 0.05, 1, 0.1)
    return _out(D.reverb(x, 1.6, mix=0.25))


# ---------------------------------------------------------------- motion

@recipe
def whoosh(dur=1.2, bright=0.5, heavy=0.0, seed=0, direction=1.0):
    """A fast pass: doppler-shifted noise with a swept band, a hump in level and a pan across."""
    n = D.n_of(dur)
    src = D.noise(dur, 'pink', seed)
    src = D.filt(src, 'bp', D.as_curve([(0, 300), (dur * 0.6, 1500 + 6000 * bright), (dur, 500)], n), 1.1)
    body = D.flyby(src, speed=120 + 200 * bright, closest=6, t_close=dur * 0.62, side=direction)
    tone = D.flyby(D.osc('saw', 70, dur) * 0.4, 120, 6, dur * 0.62, side=direction) * heavy
    x = D.mix((body, 0), (D.filt(tone, 'lp', 600), -6))
    return _out(D.fade(x, 0.05, 0.1))


@recipe
def flyby_jet(dur=8.0, seed=0):
    """Jet pass: roar + turbine whine with full doppler and air absorption."""
    roar = D.filt(D.noise(dur, 'pink', seed), 'bp', 900, 0.5) + 0.5 * D.filt(D.noise(dur, 'brown', seed + 1), 'lp', 200)
    whine = D.osc('sine', 3150, dur) * 0.08 + D.osc('sine', 6300, dur) * 0.03
    x = D.flyby(roar + whine, speed=240, closest=90, t_close=dur * 0.45)
    return _out(D.reverb(x, 2.5, mix=0.15))


@recipe
def missile_launch(dur=6.0, seed=0):
    """Ignition pop, rocket roar with crackle, then it leaves: doppler down and away."""
    pop = explosion(size=0.35, seed=seed)[:D.n_of(1.0)] * 0.7
    roar = D.filt(D.noise(dur, 'pink', seed + 1), 'lp', 2500) + 0.8 * D.filt(D.noise(dur, 'brown', seed + 2), 'lp', 300)
    roar += 3 * D.filt(D.crackle(dur, 350, seed + 3, 0.6), 'hp', 1500)
    roar *= D.adsr(dur, 0.25, 0.3, 0.9, 1.0)
    away = D.flyby(roar, speed=180, closest=15, t_close=0.4, side=0.4)
    x = D.mix((pop, 0), (away, 0, 0.05))
    return _out(D.reverb(x, 2.5, mix=0.2))


@recipe
def servo(dur=2.0, speed=None, seed=0):
    """Motor + gear whine + hydraulic hiss, start and stop clunks. speed: curve 0..1 (default ease in/out)."""
    n = D.n_of(dur)
    sp = D.as_curve(speed if speed is not None else [(0, 0), (dur * 0.25, 1), (dur * 0.75, 1), (dur, 0)], n)
    fm_ = 70 + 260 * sp
    motor = D.filt(D.osc('saw', fm_, dur), 'bp', np.clip(fm_ * 4, 200, 8000), 1.5) * (0.2 + sp)
    gear = D.osc('sine', fm_ * 7.3, dur) * sp * 0.25
    hiss = D.filt(D.noise(dur, 'white', seed), 'hp', 3500) * sp * 0.15
    k1, k2 = clunk(0.6, seed), clunk(0.8, seed + 1)
    x = D.mix((motor, -6), (gear, -10), (hiss, -14), (k1, -6, 0.0), (k2, -4, max(0.0, dur - 0.05)))
    return _out(D.reverb(x, 0.9, mix=0.12))


@recipe
def clunk(heavy=0.8, seed=0):
    """Mechanical lock / latch: modal metal plus a dull body thud. heavy 0 = clack, 1 = big clunk."""
    ex = np.pad(D.noise(0.003, 'white', seed) * np.hanning(D.n_of(0.003)), (0, D.n_of(0.6)))
    base = 1200 - 900 * heavy
    m = D.modal(ex, base * np.array([1, 2.32, 4.25, 6.63, 9.38]), (0.05 + 0.2 * heavy) * np.array([1, .8, .6, .5, .4]))
    thud = D.osc('sine', 90 + 60 * (1 - heavy), 0.15) * D.decay(0.15, 0.08)
    x = D.mix((m / (np.abs(m).max() + 1e-9), -2), (thud, -2 - 8 * (1 - heavy)))
    return _out(D.reverb(x, 0.6, mix=0.12))


@recipe
def electric_arc(dur=2.0, seed=0):
    n = D.n_of(dur)
    r = D.rng(seed)
    gate = D.filt((r.random(n) < 0.0009).astype(float), 'lp', 30) > 0.0001
    cr = D.crackle(dur, 900, seed, 0.3) * (0.3 + gate)
    buzz = D.osc('square', 100, dur) * (0.3 + 0.7 * gate) * 0.2
    x = np.c_[D.filt(cr, 'hp', 1500), D.filt(np.roll(cr, 97), 'hp', 1500)] + D.stereo(D.filt(buzz, 'lp', 3000))
    return _out(D.reverb(x, 0.7, mix=0.15))


# ---------------------------------------------------------------- beds and tonal

@recipe
def reactor_hum(dur=8.0, base=50.0, seed=0):
    """Machine-room bed: mains hum harmonics with slow beating, filter breathing and a little air."""
    n = D.n_of(dur)
    x = np.zeros(n)
    for k in range(1, 12):
        x += D.osc('sine', base * k * (1 + 0.0007 * k), dur) / k ** 1.1
        x += 0.5 * D.osc('sine', base * k * (1 - 0.0005 * k) + 0.3, dur) / k ** 1.3
    breath = 600 + 400 * np.sin(np.linspace(0, 2 * np.pi * dur / 6.0, n))
    x = D.filt(x, 'lp', breath, 0.9)
    air = D.filt(D.noise(dur, 'pink', seed), 'bp', 2500, 0.5) * 0.04
    y = D.width(D.chorus(D.stereo(x + air), 0.1, 4, 12, 0.5), 1.3)
    return _out(D.fade(y, 0.5, 0.5))


@recipe
def braam(note=36, dur=3.0, seed=0):
    """Low brass blast (trailer 'braaam'): detuned saws over root/fifth/octave, a fast filter bloom, heavy drive."""
    f = 440 * 2 ** ((note - 69) / 12)
    n = D.n_of(dur)
    x = sum(D.supersaw(f * k, dur, voices=5, detune=0.12, seed=seed + i) * g for i, (k, g) in enumerate(((1, 1), (1.5, .6), (2, .5))))
    cut = D.as_curve([(0, 200), (0.12, 2200), (dur * 0.6, 900), (dur, 300)], n)
    x = D.filt(x, 'lp', cut, 1.4)
    x = D.drive(x * 2.5, 2.2) * D.adsr(dur, 0.04, 0.4, 0.75, dur * 0.4)[:, None]
    sub = D.osc('sine', f / 2, dur) * D.adsr(dur, 0.02, 0.3, 0.8, dur * 0.4)
    return _out(D.reverb(D.mix((x, 0), (sub, -4)), 3.5, mix=0.28))


@recipe
def riser(dur=4.0, seed=0):
    """Tension build: noise opening upward, a saw stack rising an octave, a tremolo that speeds up."""
    n = D.n_of(dur)
    nz = D.filt(D.noise(dur, 'white', seed), 'bp', D.expo(300, 9000, n, 1.5), 1.0)
    st = D.supersaw(D.expo(110, 220, n, 1.2), dur, 5, 0.25, seed)
    st = D.filt(st, 'lp', D.expo(400, 7000, n, 1.5))
    trem = 0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(D.expo(2, 18, n)) / SR)
    amp = np.linspace(0, 1, n) ** 2.2
    x = D.mix((D.stereo(nz) * (amp * trem)[:, None], -4), (st * amp[:, None], -2))
    x[-D.n_of(0.01):] *= np.linspace(1, 0, D.n_of(0.01))[:, None]
    return _out(D.reverb(x, 2.0, mix=0.25, tail=False))


@recipe
def splash(size=1.0, seed=0):
    r = D.rng(seed)
    hit = D.filt(D.noise(0.8, 'pink', seed), 'bp', D.expo(600, 2500, D.n_of(0.8)), 0.7) * D.decay(0.8, 0.5 * size, 0.004)
    bub = np.zeros(D.n_of(1.5))
    for _ in range(int(30 * size)):
        t0 = r.random() * 1.2
        d = 0.02 + 0.04 * r.random()
        f0 = 400 + 1200 * r.random()
        b = D.osc('sine', D.expo(f0, f0 * 1.6, D.n_of(d)), d) * D.decay(d, d)
        i = D.n_of(t0)
        bub[i:i + len(b)] += b[:len(bub) - i] * r.random()
    thud = D.osc('sine', 70, 0.3) * D.decay(0.3, 0.2)
    return _out(D.reverb(D.mix((hit, 0), (bub, -10), (thud, -6)), 1.2, mix=0.2))


@recipe
def tick(bright=0.6, seed=0):
    c = D.filt(D.noise(0.004, 'white', seed), 'bp', 2000 + 6000 * bright, 2) * np.hanning(D.n_of(0.004))
    return _out(np.pad(c, (0, D.n_of(0.03))))
