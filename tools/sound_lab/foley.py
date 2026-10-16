"""Foley: realistic sound effects built from what makes the sound in the world, not from beeps.

Struck steel rings in a plate's inharmonic modes; a bubble rings at its Minnaert frequency and chirps up as it
rises; steam and wind are turbulent noise shaped by the opening; a motor sings at its rotation and its gear mesh;
hydraulics are a pump's pistons, oil rushing through valves and a load straining; thunder is many N-waves from a
long channel, the far ones arriving later and duller. Every function is plain numpy/scipy at 48 kHz, takes plain
parameters plus a seed, and returns float64 audio (mono (n,) or stereo (n, 2)) normalised to a peak of about 1 (beds
to an RMS of about 0.25), so the mix sets every level in dB.
"""
import numpy as np
import scipy.signal as ss

from . import dsp
from .dsp import SR, TAU, n_of, rng

# ---------------------------------------------------------------- helpers


def lp(x, f, order=2):
    if np.ndim(f):                                    # a cutoff curve: swept biquads
        return dsp.filt(x, 'lp', np.minimum(f, SR * 0.45), 0.707, order=max(1, order // 2), block=256)
    return dsp.butter(x, 'lp', min(float(f), SR * 0.45), order)


def hp(x, f, order=2):
    return dsp.butter(x, 'hp', max(float(f), 5.0), order)


def bp(x, lo, hi, order=2):
    sos = ss.butter(order, [max(lo, 5.0), min(hi, SR * 0.45)], 'bandpass', fs=SR, output='sos')
    return ss.sosfilt(sos, x, axis=0)


def peak(x, p=1.0):
    m = np.abs(x).max()
    return x * (p / m) if m > 0 else x


def rms_to(x, r=0.25):
    m = np.sqrt(np.mean(np.square(x)))
    return x * (r / m) if m > 0 else x


def lfo(n, rate, seed=0):
    """A smooth random curve in about -1..1 that changes about `rate` times a second (Catmull-Rom through random
    points): gusts, flutter, wandering resonances, analog drift."""
    r = rng(seed)
    k = max(4, int(n / SR * rate) + 4)
    pts = r.uniform(-1, 1, k)
    m = max(8, min(n, n // 24 + 2))                   # computed at a control rate, then interpolated
    x = np.linspace(0, k - 3.001, m)
    i = np.floor(x).astype(int)
    f = x - i
    p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
    y = 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3)
    return y if m == n else np.interp(np.arange(n), np.linspace(0, n - 1, m), y)


def curve(points, n):
    """Breakpoints [(t, v), ...] in seconds (or a scalar / array) -> n samples."""
    return dsp.as_curve(points if not isinstance(points, (list, tuple)) else list(points), n)


def phase(freq):
    return np.cumsum(freq) / SR


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def fade(x, fin=0.004, fout=0.03):
    return dsp.fade(x, fin, fout)


def place(dst, src, at, gain=1.0):
    """Add src into dst starting at sample `at` (clipped to dst)."""
    if at >= len(dst) or at + len(src) <= 0:
        return dst
    a0 = max(0, -at)
    k = min(len(src), len(dst) - at)
    dst[at + a0:at + k] += src[a0:k] * gain
    return dst


def stereo_pan(x, p):
    """Mono -> stereo, equal power, p -1..1 (scalar)."""
    a = (p + 1) * np.pi / 4
    return np.c_[x * np.cos(a), x * np.sin(a)]


def decor(x, seed=0, amount=0.5):
    """Mono -> stereo with some width: the side is a short all-pass smear of the mid."""
    r = rng(seed)
    d1, d2 = n_of(0.0031 + r.random() * 0.004), n_of(0.0047 + r.random() * 0.005)
    a = np.concatenate([np.zeros(d1), x])[:len(x)]
    b = np.concatenate([np.zeros(d2), x])[:len(x)]
    side = (a - b) * 0.5 * amount
    return np.c_[x + side, x - side]


# ---------------------------------------------------------------- spaces (convolution reverbs)

_IR = {}


def space_ir(kind):
    """Stereo impulse responses of the places in the films: a steel machinery space, a tight compartment, the open
    deck at sea, the night sky over the coast (long), under water (dark, short)."""
    if kind in _IR:
        return _IR[kind]
    P = {  # t60 (s), predelay, early-reflection spread (s), brightness (0..1), early level, density fade-in
        'engine': (1.5, 0.010, 0.045, 0.55, 0.9, 0.012),
        'room': (0.7, 0.006, 0.020, 0.50, 0.8, 0.006),
        'deck': (0.9, 0.020, 0.090, 0.45, 0.5, 0.030),
        'sky': (5.5, 0.060, 0.300, 0.35, 0.4, 0.080),
        'water': (0.9, 0.004, 0.015, 0.15, 0.6, 0.004),
        'hall': (3.2, 0.028, 0.070, 0.50, 0.55, 0.030),
        'plate': (2.2, 0.010, 0.020, 0.70, 0.30, 0.004),
        'epic': (6.0, 0.040, 0.120, 0.42, 0.45, 0.050),
    }[kind]
    t60, pre, spread, bright, early, fin = P
    r = rng(hash(kind) % 9973)
    n = n_of(pre + t60 * 1.25)
    t = np.maximum(np.arange(n) / SR - pre, 0)
    nz = r.standard_normal((n, 2))
    edges = [0, 220, 700, 2200, 5500, SR / 2]
    mult = [1.25, 1.1, 1.0, 0.55 + 0.4 * bright, 0.25 + 0.5 * bright]
    ir = np.zeros((n, 2))
    for (lo, hi), m in zip(zip(edges[:-1], edges[1:]), mult):
        if lo == 0:
            band = dsp.butter(nz, 'lp', hi, 4)
        elif hi >= SR / 2:
            band = dsp.butter(nz, 'hp', lo, 4)
        else:
            band = bp(nz, lo, hi, 3)
        ir += band * (10 ** (-3 * t / (t60 * m)))[:, None]
    ir *= (np.arange(n) / SR > pre)[:, None]
    ir *= np.clip(t / max(fin, 1e-4), 0, 1)[:, None] ** 2
    # early reflections: sparse taps, alternating sides, duller as they come later
    for k in range(18):
        at = pre * 0.35 + spread * (k / 18) ** 1.3 + r.random() * spread / 18
        i = n_of(at)
        if i < n - 8:
            g = early * (1 - k / 20) * r.uniform(0.5, 1.0)
            side = k % 2
            ir[i, side] += g * 2.0 * r.choice([-1, 1])
            ir[i + 3, 1 - side] += g * 1.0 * r.choice([-1, 1])
    ir = dsp.butter(ir, 'lp', 3000 + 15000 * bright, 2)
    ir /= np.sqrt((ir ** 2).sum() / 2)
    _IR[kind] = ir
    return ir


def reverb(x, kind='engine', wet=0.3, dry=1.0):
    x = dsp.stereo(x)
    ir = space_ir(kind)
    w = np.c_[ss.oaconvolve(x[:, 0], ir[:, 0]), ss.oaconvolve(x[:, 1], ir[:, 1])]
    out = w * wet
    out[:len(x)] += x * dry
    return out


# ---------------------------------------------------------------- struck metal

_PLATE = np.array([1.0, 1.59, 2.14, 2.30, 2.65, 2.92, 3.16, 3.50, 3.60, 4.06, 4.15, 4.63, 5.13, 5.40, 5.93, 6.21,
                   6.72, 7.14, 7.82, 8.45, 9.31, 10.2, 11.3, 12.5, 13.9, 15.2])


def metal(size=1.0, damp=1.0, hard=0.5, seed=0, thud=0.6, f0=None):
    """Struck steel: a plate's inharmonic modes excited by a contact pulse (hard = brief and bright, soft = a dull
    bump), plus a low thud of the mass behind it. size 0.3 (a small fitting) .. 4 (a hull frame) sets the pitch and
    how long it rings; damp scales every decay (0.12 = a dead clunk, 1 = rings)."""
    r = rng(seed)
    f0 = f0 or 240.0 / size
    rat = _PLATE * (1 + 0.035 * r.standard_normal(len(_PLATE)))
    rat[0] = 1.0
    fs = f0 * rat
    keep = fs < 15000
    fs, rat = fs[keep], rat[keep]
    t60 = damp * (0.18 + 0.75 * size ** 0.6) / rat ** 0.75
    amps = r.uniform(0.35, 1.0, len(fs)) / rat ** (1.25 - hard * 0.9)
    dur = float(t60.max()) * 1.15 + 0.12
    n = n_of(dur)
    tc = 0.0002 + (1 - hard) * 0.0035
    k = max(2, n_of(tc))
    exc = np.zeros(n)
    exc[:k] = np.sin(np.pi * np.arange(k) / k)
    m = min(n, n_of(0.006))
    exc[:m] += r.standard_normal(m) * np.exp(-np.arange(m) / (SR * 0.0007)) * 0.25 * hard
    y = peak(dsp.modal(exc, fs, t60, amps))
    if thud:
        m = min(n, n_of(0.18))
        b = lp(r.standard_normal(m), 70 + 160 / size, 2) * np.exp(-np.arange(m) / (SR * 0.022 * size ** 0.5))
        y[:m] += thud * peak(b)
    return peak(fade(y, 0.0005, 0.02))


def clank(size=1.0, seed=0, ring=0.35):
    """A heavy steel part landing: a dull thud with a short ring (a clunk), size as metal()."""
    return metal(size, damp=ring, hard=0.35, seed=seed, thud=1.0)


def latch(size=1.0, seed=0, gap=0.018, ring=0.25):
    """A latch or clamp driving home: a bright snap of the pawl, then the heavy body seating a beat later."""
    a = metal(size * 0.32, damp=0.10, hard=0.95, seed=seed, thud=0.15)
    b = metal(size * 1.25, damp=ring, hard=0.45, seed=seed + 7, thud=1.0)
    out = np.zeros(max(len(a), len(b) + n_of(gap)))
    place(out, a, 0, 0.55)
    place(out, b, n_of(gap), 1.0)
    return peak(out)


def breaker(seed=0):
    """A switchgear breaker closing: the spring's release, a big contact slam and a short arc crackle."""
    r = rng(seed)
    out = np.zeros(n_of(1.6))
    s = lp(r.standard_normal(n_of(0.05)), 2500) * np.linspace(0, 1, n_of(0.05)) ** 2 * 0.25
    place(out, s, 0)
    place(out, latch(1.4, seed + 3, gap=0.008, ring=0.3), n_of(0.05))
    arc = dsp.crackle(0.035, 9000, seed + 5, 0.4) * np.exp(-np.arange(n_of(0.035)) / (SR * 0.01))
    place(out, bp(arc, 1200, 7000) * 0.6, n_of(0.052))
    return peak(fade(out))


# ---------------------------------------------------------------- motors, gears, hydraulics


def motor(dur, speed, f_max=180.0, gear=3.7, seed=0, hum=0.15, bright=0.4, brush=0.12):
    """An electric drive and its gearbox: the rotor's tone and harmonics follow the speed curve (0..1), the gear
    mesh sits at `gear` times it, bearings and brushes are a soft noise, the line hum (120 Hz) stays while it is
    powered. Real motor-operated valves, racking drives, ball screws and robot joints all sound like this."""
    n = n_of(dur)
    r = rng(seed)
    s = np.clip(curve(speed, n), 0, 1)
    f = f_max * s * (1 + 0.004 * lfo(n, 3, seed))
    ph = phase(f)
    y = np.zeros(n)
    for k, a in enumerate([1.0, 0.55, 0.38, 0.22, 0.14, 0.09, 0.06], 1):
        y += a * np.sin(TAU * k * ph + r.random() * 6)
    y += 0.30 * np.sin(TAU * gear * ph) + 0.12 * np.sin(TAU * 2 * gear * ph)
    y *= (0.25 + 0.75 * s) * s ** 0.5
    nz = bp(r.standard_normal(n), 300, 2500 + 4000 * bright) * brush * s * (1 + 0.5 * lfo(n, 20, seed + 1))
    on = smoothstep(s / 0.02)
    h = np.sin(TAU * 120 * np.arange(n) / SR) + 0.35 * np.sin(TAU * 240 * np.arange(n) / SR)
    y = y + nz * 3 + hum * h * on
    y = lp(y, 1800 + 5000 * bright)
    return peak(fade(y, 0.01, 0.06))


def moves(dur, spans, ease=0.25):
    """A speed curve 0..1 from moves [(t0, t1, level), ...]: eased up and down at each end."""
    n = n_of(dur)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for t0, t1, lv in spans:
        e = min(ease, (t1 - t0) / 2)
        a = smoothstep((t - t0) / max(e, 1e-3)) * (1 - smoothstep((t - (t1 - e)) / max(e, 1e-3)))
        s = np.maximum(s, a * lv)
    return s


def servo(dur, spans, f_max=420.0, seed=0, gear=2.6):
    """A robot joint or a gimbal: quick moves, the servo's whine rising and falling with each move."""
    s = moves(dur, spans, ease=min(0.3, dur / 6))
    return motor(dur, s, f_max=f_max, gear=gear, seed=seed, hum=0.04, bright=0.55, brush=0.08)


def hydraulic(dur, flow, f_pump=150.0, seed=0, strain=0.6, pump=1.0, creak=0.5):
    """A hydraulic drive: the pump's whine (pistons x shaft speed) dipping under load, oil rushing through the
    valves and lines as flow (curve 0..1) rises, a low groan of the load straining, and small creaks of the steel."""
    n = n_of(dur)
    r = rng(seed)
    fl = np.clip(curve(flow, n), 0, 1)
    pon = smoothstep(np.arange(n) / SR / 0.5) * smoothstep((dur - np.arange(n) / SR) / 0.4)
    f = f_pump * (1 - 0.06 * fl) * (1 + 0.003 * lfo(n, 4, seed))
    ph = phase(f)
    whine = sum(a * np.sin(TAU * k * ph + r.random() * 6) for k, a in enumerate([1, .45, .3, .16, .1, .06, .04, .03], 1))
    whine *= 1 + 0.25 * np.sin(TAU * ph / 9)
    whine *= pump * pon * (0.55 + 0.45 * fl)
    oil = dsp.filt(r.standard_normal(n), 'bp', 220 + 800 * fl, 0.9, block=256) * fl * 1.3
    oil += bp(r.standard_normal(n), 1800, 4500) * fl * 0.08
    groan = dsp.filt(r.standard_normal(n), 'bp', 62 + 26 * lfo(n, 0.7, seed + 2), 7, block=256) * fl * strain * 5
    y = whine * 0.22 + oil + groan + lp(r.standard_normal(n), 160) * 1.2 * (0.3 + 0.7 * fl) * pon
    if creak:
        hits = np.zeros(n)
        k = int(dur * 2.5 * creak)
        for i in range(k):
            at = int(r.random() * n)
            if fl[at] > 0.2:
                c = metal(r.uniform(0.6, 1.4), damp=0.08, hard=0.2, seed=seed + 100 + i, thud=0.0)
                place(hits, c, at, 0.18 * fl[at] * r.random())
        y += hits
    return peak(fade(lp(y, 7000), 0.02, 0.1))


def gears(dur, speed, teeth=35, f_max=40.0, seed=0):
    """A reduction gear train running: the mesh tone of each stage, its rattle and the shaft's rumble."""
    n = n_of(dur)
    r = rng(seed)
    s = np.clip(curve(speed, n), 0, 1)
    fr = f_max * s
    ph = phase(fr)
    y = np.zeros(n)
    for z, a in ((teeth / 6.0, 1.0), (teeth / 14.0, 0.6), (teeth / 3.0, 0.35)):
        y += a * np.sin(TAU * z * ph + r.random() * 6) * (1 + 0.3 * lfo(n, 6, seed + int(z)))
    rumble = lp(r.standard_normal(n), 140) * 2.5 * s
    rattle = bp(r.standard_normal(n), 400, 2400) * 0.35 * s * (1 + 0.8 * np.sin(TAU * ph * 3) ** 8)
    return peak(fade(lp((y * s ** 0.7 + rumble + rattle), 4000), 0.05, 0.2))


def rotor(dur, t_up, f_end=50.0, seed=0, t0=0.0, roar=1.0):
    """A big rotor spinning up: its windage whooms faster and faster and smooths into a roar while the rotation's
    hum (2x the rotation) climbs to its running pitch, then holds."""
    n = n_of(dur)
    r = rng(seed)
    t = np.arange(n) / SR
    s = smoothstep((t - t0) / max(t_up, 1e-3)) ** 1.4
    fr = f_end * s
    ph = phase(fr)
    wind = dsp.filt(r.standard_normal(n), 'bp', 120 + 900 * s, 0.7, block=256)
    am = 0.55 + 0.45 * np.sin(TAU * 2 * ph) ** 2
    wind *= am * (0.15 + 0.85 * s) * roar
    hum = (np.sin(TAU * 2 * ph) + 0.5 * np.sin(TAU * 4 * ph + 1) + 0.2 * np.sin(TAU * 6 * ph + 2)) * s ** 1.5
    low = dsp.filt(r.standard_normal(n), 'lp', 60 + 160 * s, 0.7, block=512) * 2.2 * s
    y = wind * 1.2 + hum * 0.6 + low
    return peak(fade(y, 0.05, 0.3))


def gas_turbine(dur, crank, light, idle, seed=0, roar=1.0):
    """A gas turbine starting (seconds into the clip): the air starter cranks the spool up with a rush of air, fuel
    on and light-off (a low whump through the casing), then the combustion roar builds as the spool climbs to idle.
    The spool's tone stays low in the mix: it is the roar that carries."""
    n = n_of(dur)
    r = rng(seed)
    t = np.arange(n) / SR
    N = 0.28 * smoothstep((t - crank) / 4.0) + 0.42 * smoothstep((t - light) / max(idle - light, 0.5)) ** 1.3
    burn = smoothstep((t - light) / 1.8)
    f = 95 + 520 * N
    ph = phase(f * (1 + 0.003 * lfo(n, 5, seed)))
    spool = (np.sin(TAU * ph) + 0.45 * np.sin(TAU * 2 * ph + 1) + 0.18 * np.sin(TAU * 3.0 * ph + 2)) * N
    blade = np.sin(TAU * 7.3 * ph) * 0.06 * N
    air = bp(r.standard_normal(n), 900, 5000) * smoothstep((t - crank) / 0.6) * (1 - burn * 0.7) * 0.5
    comb = (lp(r.standard_normal(n), 600 + 900 * burn) * 2.4 + bp(r.standard_normal(n), 200, 2500) * 0.6)
    comb *= burn * roar * (1 + 0.18 * lfo(n, 9, seed + 3))
    y = spool * 0.5 + blade + air + comb
    wh = np.zeros(n)
    m = n_of(0.9)
    w = lp(r.standard_normal(m), 180, 3) * np.minimum(1, np.arange(m) / (SR * 0.012)) * np.exp(-np.arange(m) / (SR * 0.18))
    w += np.sin(TAU * 42 * np.arange(m) / SR) * np.exp(-np.arange(m) / (SR * 0.25)) * 0.5
    place(wh, peak(w) * 1.4, n_of(light))
    y = lp(y + wh, 6500)
    return peak(fade(y, 0.05, 0.4))


# ---------------------------------------------------------------- electrical (low, physical)


def energize(size=1.0, seed=0, f_line=60.0, hold=1.2):
    """A big magnet or transformer taking current: a clunk through the core, the inrush hum (2x line frequency and
    its buzzing harmonics) swelling and settling, a low push of air. Deep, not a whine."""
    n = n_of(0.08 + hold + 1.2)
    r = rng(seed)
    t = np.arange(n) / SR
    e = np.minimum(1, t / 0.015) * (0.35 + 0.65 * np.exp(-t / 0.35)) * smoothstep((0.08 + hold + 1.2 - t) / 1.0)
    f = 2 * f_line / size ** 0.25
    hum = np.sin(TAU * f * t) + 0.5 * np.sin(TAU * 2 * f * t + 1) + 0.28 * np.sin(TAU * 3 * f * t + 2)
    buzz = np.abs(np.sin(TAU * f / 2 * t)) ** 6
    buzz = bp(buzz - buzz.mean(), 200, 1800) * 0.4
    push = lp(r.standard_normal(n), 90) * np.exp(-t / 0.12) * 2.0
    y = (hum * 0.7 + buzz) * e + push
    place(y, clank(1.8 * size, seed + 1, ring=0.25) * 0.7, 0)
    return peak(fade(y, 0.001, 0.2))


def corona(dur, amount, seed=0):
    """High-voltage crackle: the sizzle of air breaking down round a charged conductor, its density following
    `amount` (curve 0..1); kept out of the shrill top end."""
    n = n_of(dur)
    a = np.clip(curve(amount, n), 0, 1)
    c = dsp.crackle(dur, 40 + 2600 * a ** 1.5, seed, 0.25)
    y = bp(c, 700, 6500) * (0.3 + 0.7 * a)
    y += bp(rng(seed + 1).standard_normal(n), 900, 4000) * 0.04 * a
    return peak(fade(y, 0.05, 0.2))


def arc_crack(seed=0, size=1.0):
    """An electrical discharge: a sharp report and a tearing crackle (a scan pulse, a spark gap)."""
    r = rng(seed)
    n = n_of(0.9 * size)
    t = np.arange(n) / SR
    y = np.zeros(n)
    y[n_of(0.001)] = 1.0
    y = hp(y, 60) * 6
    c = dsp.crackle(0.9 * size, 9000 * np.exp(-t / (0.08 * size)), seed, 0.3)
    y += bp(c, 600, 7000) * 1.2
    y += lp(r.standard_normal(n), 220) * np.exp(-t / (0.12 * size)) * 1.5
    return peak(fade(y, 0.0003, 0.05))


# ---------------------------------------------------------------- water, steam, air


def bubbles(dur, rate, rmin=1.0, rmax=6.0, seed=0, rise=0.25, q=(10, 26)):
    """A cloud of bubbles: each rings at its Minnaert frequency (3.26 kHz over its radius in mm), chirps up as it
    rises and dies within a few dozen cycles. rate (per second) may be a curve. Stereo."""
    n = n_of(dur)
    r = rng(seed)
    rc = np.maximum(curve(rate, n), 0)
    cum = np.cumsum(rc) / SR
    total = cum[-1]
    k = r.poisson(total) if total > 0 else 0
    out = np.zeros((n, 2))
    if k == 0:
        return out
    ats = np.searchsorted(cum, np.sort(r.random(k) * total))
    rad = np.exp(r.uniform(np.log(rmin), np.log(rmax), k))
    for at, rd in zip(ats, rad):
        f0 = 3260.0 / rd
        if f0 > 12000:
            continue
        tau = r.uniform(*q) / (np.pi * f0)
        m = n_of(min(5 * tau, 0.25))
        tt = np.arange(m) / SR
        fr = f0 * (1 + rise * r.uniform(0.3, 1.5) * tt / tau)
        g = np.sin(TAU * np.cumsum(fr) / SR) * np.exp(-tt / tau) * rd ** 0.7
        p = r.uniform(-0.8, 0.8)
        a = (p + 1) * np.pi / 4
        e = min(n, at + m)
        out[at:e, 0] += g[:e - at] * np.cos(a)
        out[at:e, 1] += g[:e - at] * np.sin(a)
    return peak(out)


def water(dur, flow=1.0, size=1.0, seed=0, gurgle=1.0, bub=1.0):
    """Water moving through pipes or along a hull: a churning low rush, gurgling resonances that wander, bubbles."""
    n = n_of(dur)
    r = rng(seed)
    fl = np.clip(curve(flow, n), 0, 1.5)
    rush = lp(r.standard_normal((n, 2)), 380 / size ** 0.3, 2) * 2.5
    g = np.zeros((n, 2))
    for ch in range(2):
        c = 330 / size ** 0.4 * (1 + 0.45 * lfo(n, 1.6, seed + ch))
        g[:, ch] = dsp.filt(r.standard_normal(n), 'bp', c, 4.5, block=256) * (0.6 + 0.4 * lfo(n, 5, seed + 10 + ch)) * 2.5
    b = bubbles(dur, 80 * fl * bub, 1.5, 9 * size ** 0.5, seed + 20, rise=0.2) * 0.5
    y = (rush + g * gurgle) * fl[:, None] + b
    return fade(rms_to(y, 0.25), 0.2, 0.3)


def fill(dur, seed=0, f0=180.0, f1=900.0):
    """A pipe filling from the bottom: the gurgle's resonance climbs as the air column above the water shortens."""
    n = n_of(dur)
    r = rng(seed)
    t = np.arange(n) / SR
    c = f0 * (f1 / f0) ** smoothstep(t / dur)
    y = np.zeros((n, 2))
    for ch in range(2):
        y[:, ch] = dsp.filt(r.standard_normal(n), 'bp', c * (1 + 0.15 * lfo(n, 3, seed + ch)), 6, block=256) * (0.6 + 0.4 * lfo(n, 7, seed + 5 + ch))
    y = y * 3 + lp(r.standard_normal((n, 2)), 250) * 2 + bubbles(dur, 120, 2, 10, seed + 9) * 0.4
    return fade(rms_to(y, 0.25), 0.3, 0.6)


def boil(dur, heat=1.0, seed=0):
    """Water boiling hard: a dense crowd of small bubbles, a low churn, the seethe of steam."""
    n = n_of(dur)
    r = rng(seed)
    h = np.clip(curve(heat, n), 0, 1.5)
    b = bubbles(dur, 1400 * h, 0.7, 4.5, seed, rise=0.5)
    churn = lp(r.standard_normal((n, 2)), 160) * 2.5 * h[:, None]
    seethe = bp(r.standard_normal((n, 2)), 1500, 6000) * 0.12 * h[:, None]
    return fade(rms_to(b + churn + seethe, 0.25), 0.3, 0.5)


def steam(dur, pressure=1.0, seed=0, bright=0.5, roar=1.0):
    """A steam jet or line: turbulent hiss shaped by the opening, a roar underneath, and a fast flutter."""
    n = n_of(dur)
    r = rng(seed)
    p = np.clip(curve(pressure, n), 0, 1.5)
    w = r.standard_normal((n, 2))
    hiss = dsp.filt(hp(w, 400), 'peak', 2200, 0.6, 6.0)
    hiss = lp(hiss, 5000 + 6000 * bright)
    r2 = lp(r.standard_normal((n, 2)), 450, 2) * 3.0 * roar
    fl = 1 + 0.16 * lfo(n, 22, seed + 4)
    y = (hiss * 0.55 + r2) * (p * fl)[:, None]
    return fade(rms_to(y, 0.25), 0.15, 0.4)


def splash(size=1.0, seed=0):
    """Something big entering the water (or the lens breaking the surface): a slap, a low thump, spray falling back
    and a cloud of bubbles settling."""
    r = rng(seed)
    d = 1.2 + 1.6 * size
    n = n_of(d)
    t = np.arange(n) / SR
    slap = bp(r.standard_normal(n), 500, 4500) * np.exp(-t / 0.035) * np.minimum(1, t / 0.002)
    thump = (np.sin(TAU * 55 * t) * 0.8 + lp(r.standard_normal(n), 200) * 1.5) * np.exp(-t / (0.09 * size ** 0.5))
    spray = bp(r.standard_normal(n), 1400, 8000) * np.minimum(1, t / 0.03) * np.exp(-t / (0.35 * size)) * 0.6
    wash = lp(r.standard_normal(n), 700) * np.minimum(1, t / 0.08) * np.exp(-t / (0.6 * size)) * 1.2
    mono = slap + thump + spray + wash
    b = bubbles(d, [(0, 900 * size), (0.25, 600 * size), (1.2 * size, 40), (d, 0)], 1.2, 12, seed + 1, rise=0.3)
    y = decor(mono, seed) + b * 0.9
    return peak(fade(y, 0.0005, 0.3))


def sea(dur, seed=0, swell=1.0, lap=1.0):
    """The sea at night from a ship's side: long swells, the wash of foam as each breaks, small slaps against the
    hull. Stereo, wide."""
    n = n_of(dur)
    r = rng(seed)
    env = np.zeros(n)
    t = 0.0
    while t < dur + 6:
        L = r.uniform(3.0, 6.5)
        a = r.uniform(0.5, 1.0)
        i0 = n_of(t)
        m = n_of(L)
        x = np.linspace(0, 1, m)
        w = np.where(x < 0.35, smoothstep(x / 0.35), np.exp(-(x - 0.35) / 0.25)) * a
        e = min(n, i0 + m)
        if i0 < n:
            env[i0:e] = np.maximum(env[i0:e], w[:e - i0])
        t += L * r.uniform(0.45, 0.8)
    env = dsp.butter(env, 'lp', 3, 1) * 0.9 + 0.12
    low = lp(r.standard_normal((n, 2)), 300, 2) * 2.0 * (env ** 1.2)[:, None] * swell
    env2 = np.concatenate([np.zeros(n_of(0.35)), env])[:n]
    wash = bp(r.standard_normal((n, 2)), 350, 4200, 2) * (env2 ** 2.0)[:, None] * 0.9
    s = np.zeros((n, 2))
    t = 0.2
    k = 0
    while t < dur - 0.6 and lap > 0:
        m = n_of(r.uniform(0.15, 0.45))
        tt = np.arange(m) / SR
        g = bp(r.standard_normal(m), 250, 1800) * np.minimum(1, tt / 0.01) * np.exp(-tt / r.uniform(0.04, 0.1))
        place(s, stereo_pan(g * r.uniform(0.3, 1.0), r.uniform(-0.7, 0.7)), n_of(t))
        if k % 3 == 0:
            place(s, bubbles(0.5, 160, 2, 9, seed + 50 + k) * 0.25, n_of(t))
        t += r.uniform(0.5, 1.8)
        k += 1
    y = low + wash + s * 0.6 * lap
    return fade(rms_to(y, 0.25), 1.0, 1.0)


def wind(dur, strength=0.5, seed=0, speed=None):
    """Wind over the deck or past a fast lens: a broad band of noise whose pitch and loudness gust slowly.
    speed (curve 0..1) adds the rush of moving through the air."""
    n = n_of(dur)
    r = rng(seed)
    g = 0.65 + 0.35 * lfo(n, 0.25, seed)
    y = np.zeros((n, 2))
    for ch in range(2):
        c = 380 * (1 + 0.5 * lfo(n, 0.18, seed + ch * 7))
        y[:, ch] = dsp.filt(r.standard_normal(n), 'bp', c, 0.8, block=512) * (g + 0.12 * lfo(n, 1.1, seed + 11 + ch))
    y += lp(r.standard_normal((n, 2)), 120) * 1.5 * g[:, None]
    y *= strength
    if speed is not None:
        sp = np.clip(curve(speed, n), 0, 1)
        rush = np.zeros((n, 2))
        for ch in range(2):
            rush[:, ch] = dsp.filt(r.standard_normal(n), 'bp', 300 + 1600 * sp, 0.6, block=512)
        y += rush * (sp ** 1.3)[:, None] * 1.4 + lp(r.standard_normal((n, 2)), 160) * 2 * sp[:, None]
    return fade(rms_to(y, 0.25), 1.0, 1.0)


def room_tone(dur, seed=0, rot=29.6, mech=0.5, hvac=0.5, hum=0.15):
    """A machinery space's air: the deep rumble of the hull and the plant, faint rotating machinery (a shaft and its
    harmonics), ventilation, a whisper of mains hum."""
    n = n_of(dur)
    r = rng(seed)
    t = np.arange(n) / SR
    rumble = lp(r.standard_normal((n, 2)), 150, 2) * 2.2 * (1 + 0.1 * lfo(n, 0.3, seed))[:, None]
    f = rot * (1 + 0.002 * lfo(n, 0.5, seed + 1))
    ph = phase(f)
    m = sum(a * np.sin(TAU * k * ph + r.random() * 6) for k, a in ((1, .7), (2, .5), (3, .35), (4, .3), (6, .15), (8, .1), (11, .06)))
    air = lp(hp(r.standard_normal((n, 2)), 150), 2600) * 0.35 * hvac
    h = (np.sin(TAU * 60 * t) + 0.3 * np.sin(TAU * 120 * t) + 0.15 * np.sin(TAU * 180 * t)) * hum
    y = rumble + decor(m * mech * 0.4 + h, seed) + air
    return fade(rms_to(y, 0.25), 1.0, 1.0)


def underwater(dur, seed=0, motion=0.5):
    """Under the hull: a dark muffled roar, the ship's machinery coming through the plating, slow bubbles."""
    n = n_of(dur)
    r = rng(seed)
    t = np.arange(n) / SR
    roar = lp(r.standard_normal((n, 2)), 260, 3) * 2.5 * (1 + 0.25 * lfo(n, 0.4, seed))[:, None]
    ph = phase(29.6 * np.ones(n))
    hull = (np.sin(TAU * ph) * 0.5 + np.sin(TAU * 2 * ph) * 0.35 + np.sin(TAU * 3.5 * ph) * 0.2 + np.sin(TAU * 60 * t) * 0.15)
    b = lp(bubbles(dur, 14 * (0.6 + motion), 3, 14, seed + 3, rise=0.15), 1600) * 0.8
    y = roar + decor(hull * 0.5, seed) + b
    return fade(rms_to(lp(y, 1400), 0.25), 0.5, 0.8)


def whoosh(dur=1.2, peak_at=0.6, bright=0.4, heavy=0.5, seed=0, pan=(-0.4, 0.4)):
    """Air moved by something big passing the lens: a band of noise that swells to a peak and falls away, its
    centre rising toward the peak, panned across."""
    n = n_of(dur)
    r = rng(seed)
    t = np.arange(n) / SR
    pk = peak_at
    e = np.where(t < pk, (t / pk) ** 2.2, np.exp(-(t - pk) / max(dur - pk, 1e-3) * 3.5))
    c = 180 + (500 + 1800 * bright) * np.where(t < pk, t / pk, np.exp(-(t - pk) / (dur - pk + 1e-3) * 2))
    y = dsp.filt(r.standard_normal(n), 'bp', c, 0.9, block=128) * e
    y += lp(r.standard_normal(n), 110) * e * heavy * 2.5
    p = curve([(0, pan[0]), (dur, pan[1])], n)
    a = (p + 1) * np.pi / 4
    return peak(fade(np.c_[y * np.cos(a), y * np.sin(a)], 0.01, 0.05))


def ice(dur, density, seed=0, big=0.2):
    """Frost forming and steel contracting in the cold: fine crackling ticks, now and then a sharper crack and a
    low tick of the structure. density (per second) may be a curve."""
    n = n_of(dur)
    r = rng(seed)
    d = np.maximum(curve(density, n), 0)
    cum = np.cumsum(d) / SR
    k = r.poisson(cum[-1]) if cum[-1] > 0 else 0
    out = np.zeros((n, 2))
    ats = np.searchsorted(cum, np.sort(r.random(k) * cum[-1]))
    for i, at in enumerate(ats):
        m = n_of(0.03)
        tt = np.arange(m) / SR
        f = r.uniform(1800, 6500)
        g = np.sin(TAU * f * tt) * np.exp(-tt / r.uniform(0.002, 0.008)) * r.uniform(0.2, 1.0)
        g[0] += r.uniform(0.3, 1.0)
        place(out, stereo_pan(g, r.uniform(-0.8, 0.8)), at)
        if r.random() < big:
            c = metal(r.uniform(0.25, 0.6), damp=0.05, hard=0.9, seed=seed + i, thud=0.0)
            place(out, stereo_pan(c * 0.7, r.uniform(-0.6, 0.6)), at)
    out = bp(out, 600, 9000)
    return peak(out)


def frost_crack(seed=0):
    """One station reaching temperature: the sharp crack of frost closing over it and a deep tick of the steel."""
    r = rng(seed)
    out = np.zeros((n_of(1.0), 2))
    place(out, ice(0.25, 220, seed, big=0.5) * 0.8, 0)
    place(out, stereo_pan(metal(1.6, damp=0.12, hard=0.7, seed=seed + 1, thud=0.6), r.uniform(-0.3, 0.3)), n_of(0.02))
    return peak(out)


def cryo_pulse(dur, rate=1.25, seed=0):
    """A Gifford-McMahon cold head breathing (the helium valve's chuff, its tick) over the compressor's hum."""
    n = n_of(dur)
    r = rng(seed)
    t = np.arange(n) / SR
    out = np.zeros(n)
    k = 0
    tt = 0.15
    while tt < dur - 0.3:
        m = n_of(0.45)
        x = np.arange(m) / SR
        ch = dsp.filt(r.standard_normal(m), 'bp', 900 - 500 * x / 0.45, 1.2, block=128) * np.minimum(1, x / 0.012) * np.exp(-x / 0.12)
        place(out, ch * 1.6, n_of(tt))
        place(out, metal(0.45, damp=0.06, hard=0.6, seed=seed + k, thud=0.3) * 0.25, n_of(tt))
        tt += 1 / rate
        k += 1
    hum = (np.sin(TAU * 60 * t) * 0.6 + np.sin(TAU * 120 * t) * 0.4 + lp(r.standard_normal(n), 120) * 0.8) * 0.12
    return peak(fade(decor(out, seed) + decor(hum, seed + 1), 0.1, 0.3))


def laser(dur, pulses, seed=0):
    """A machining laser at work: the sizzle and pop of ablated material, pulsing; quiet and textured, not a zap.
    pulses: [(t0, t1), ...] when the beam is on."""
    n = n_of(dur)
    r = rng(seed)
    on = moves(dur, [(a, b, 1.0) for a, b in pulses], ease=0.02)
    c = dsp.crackle(dur, 1500 + 3500 * on, seed, 0.15) * on
    y = bp(c, 900, 7000)
    buzz = np.sin(TAU * 100 * np.arange(n) / SR) * 0.08 * on
    fume = bp(r.standard_normal(n), 500, 3000) * 0.05 * on
    return peak(fade(decor(y + buzz + fume, seed), 0.01, 0.05))


# ---------------------------------------------------------------- weather and the shot


def nwaves(dur, times, amps, widths, lp_hz, seed=0):
    """N-waves (the pressure signature of a shock) at times, each low-passed by its own cutoff (later/farther =
    duller): the raw material of thunder and blasts."""
    n = n_of(dur)
    out = np.zeros(n)
    for t, a, w, f in zip(times, amps, widths, lp_hz):
        m = max(4, n_of(w))
        k = np.linspace(1, -1, m)
        g = k * a
        g = lp(np.concatenate([g, np.zeros(n_of(0.02))]), f, 1)
        place(out, g, n_of(t))
    return out


def thunder(dur=9.0, dist=0.3, seed=0, crack=1.0):
    """A lightning strike: the ripping crack of the channel close by, then the rolling rumble of the rest of it
    arriving from farther along, duller and duller."""
    r = rng(seed)
    n = n_of(dur)
    t = np.arange(n) / SR
    k = 900
    ts = np.sort(np.concatenate([r.exponential(0.25, k // 3), r.exponential(1.8, k // 3), r.uniform(0, dur * 0.75, k // 3)]))
    ts = ts[ts < dur * 0.85] + dist * 0.4
    amps = r.uniform(0.3, 1.0, len(ts)) * np.exp(-ts / (dur * 0.35)) * r.choice([-1, 1], len(ts))
    widths = r.uniform(0.002, 0.012, len(ts)) * (1 + ts)
    cut = np.clip(5000 * np.exp(-ts / 1.2) + 120, 120, 5000) * (1 - 0.6 * dist)
    roll = nwaves(dur, ts, amps, widths, cut, seed)
    body = bp(r.standard_normal(n), 40, 220, 2) * np.minimum(1, t / 0.15) * np.exp(-t / (dur * 0.3))
    y = peak(roll) * 1.0 + peak(body) * 0.35
    y = dsp.drive(y * 1.5, 1.4)
    if crack:
        c = arc_crack(seed + 1, 1.4) * crack
        place(y, c * np.abs(y).max() * 1.6, n_of(dist * 0.4))
    y = hp(decor(y, seed, 0.8), 32, 2)
    return peak(fade(y, 0.0003, 1.0))


def railgun_shot(seed=0):
    """The railgun firing, heard from close by on the open deck: a hard supersonic report and the blast's crunch,
    a deep concussion, the plasma's sizzle, echoes off the sea and the horizon, and a long rolling tail."""
    r = rng(seed)
    dur = 9.0
    n = n_of(dur)
    t = np.arange(n) / SR
    rep = nwaves(0.3, [0.0], [1.0], [0.0035], [16000], seed)
    burst = r.standard_normal(n_of(0.35)) * np.exp(-np.arange(n_of(0.35)) / (SR * 0.035))
    burst = dsp.drive(bp(burst, 120, 9000), 3.0)
    blast = np.zeros(n_of(0.4))
    place(blast, rep * 3, 0)
    place(blast, burst, 0)
    f = 130 * (44 / 130) ** smoothstep(t / 0.8)
    boom = dsp.drive(np.sin(TAU * phase(f)) * 1.6, 2.2) * np.minimum(1, t / 0.003) * np.exp(-t / 0.5)
    low = bp(r.standard_normal(n), 45, 300, 2) * np.minimum(1, t / 0.006) * np.exp(-t / 0.6) * 3.0
    sizzle = bp(dsp.crackle(dur, 4000 * np.exp(-t / 0.15), seed + 2, 0.2), 1500, 8000) * 0.6
    y = np.zeros(n)
    place(y, blast, 0, 1.0)
    y += boom * 1.1 + low + sizzle
    for d, g, f2 in ((0.33, 0.45, 3500), (0.78, 0.32, 2200), (1.55, 0.22, 1300), (2.6, 0.15, 800), (3.9, 0.1, 500)):
        place(y, lp(blast + 0, f2) * g, n_of(d))
    tail = thunder(dur - 0.4, dist=0.9, seed=seed + 5, crack=0).mean(1)
    place(y, tail * 0.55 * np.exp(-np.arange(len(tail)) / (SR * 3.0)), n_of(0.4))
    y = hp(decor(y, seed, 0.6), 30, 2)
    return peak(fade(y, 0.0002, 1.5))


def release(seed=0):
    """The instant before the shot: the banks dumping into the rails, a deep electrical thump through the mount and
    the deck, the steel taking the load."""
    r = rng(seed)
    n = n_of(2.4)
    t = np.arange(n) / SR
    f = 110 * (46 / 110) ** smoothstep(t / 1.2)
    y = dsp.drive(np.sin(TAU * phase(f)) * 1.5, 2.0) * np.minimum(1, t / 0.004) * np.exp(-t / 0.5) * 1.2
    y += bp(r.standard_normal(n), 45, 260) * np.exp(-t / 0.3) * 2.5
    place(y, clank(3.0, seed + 1, ring=0.5) * 0.8, 0)
    return peak(fade(decor(y, seed), 0.0005, 0.3))


def flight(dur=6.0, seed=0):
    """The round leaving at Mach 6: a tearing roar that falls in pitch and fades up the sky."""
    n = n_of(dur)
    r = rng(seed)
    t = np.arange(n) / SR
    c = 2600 * (180 / 2600) ** smoothstep(t / dur) ** 0.6
    y = dsp.filt(r.standard_normal(n), 'bp', c, 0.7, block=128)
    y += lp(r.standard_normal(n), 200) * 1.5
    e = np.minimum(1, t / 0.05) * np.exp(-t / (dur * 0.35))
    y = decor(y * e, seed, 0.6)
    return peak(fade(y, 0.01, 0.5))


def shatter_slow(dur=3.5, seed=0):
    """A solid rod breaking apart, heard in slow motion: a deep stretched crack, shards ringing low and long, the
    pieces spreading across the field."""
    r = rng(seed)
    n = n_of(dur)
    out = np.zeros((n, 2))
    c = lp(dsp.crackle(dur, 200 * np.exp(-np.arange(n) / (SR * 0.8)), seed, 6.0), 2500) * 3
    out += decor(c, seed)
    for i in range(36):
        at = r.exponential(0.5)
        if at > dur - 0.5:
            continue
        m = metal(r.uniform(0.9, 3.5), damp=r.uniform(0.6, 1.5), hard=0.7, seed=seed + 10 + i, thud=0.1)
        place(out, stereo_pan(m * r.uniform(0.2, 0.7) * np.exp(-at / 1.2), r.uniform(-0.9, 0.9)), n_of(at))
    tt = np.arange(n) / SR
    out += decor(dsp.drive(np.sin(TAU * phase(90 * (45 / 90) ** (tt / dur))) * 1.4, 1.8) * np.exp(-tt / 1.0) * np.minimum(1, tt / 0.01), seed + 1) * 0.8
    return peak(fade(out, 0.001, 0.5))


def slowmo_drop(dur=1.6, seed=0):
    """Time slowing down: the air's rush pitching down and a sub sinking under it."""
    n = n_of(dur)
    r = rng(seed)
    t = np.arange(n) / SR
    c = 1800 * (120 / 1800) ** (t / dur)
    y = dsp.filt(r.standard_normal(n), 'bp', c, 1.0, block=128) * np.exp(-t / (dur * 0.5))
    y += dsp.drive(np.sin(TAU * phase(140 * (45 / 140) ** (t / dur))) * 1.4, 1.8) * np.exp(-t / (dur * 0.6)) * 0.8
    return peak(fade(decor(y, seed), 0.005, 0.3))


# ---------------------------------------------------------------- build-ups (the charge before a shot)


def slow(x, factor=2.0):
    """Played `factor` times slower (and lower), like tape: for slow-motion echoes."""
    x = np.asarray(x, np.float64)
    n = int(len(x) * factor)
    i = np.arange(n) / factor
    if x.ndim == 1:
        return np.interp(i, np.arange(len(x)), x)
    return np.c_[np.interp(i, np.arange(len(x)), x[:, 0]), np.interp(i, np.arange(len(x)), x[:, 1])]


def shepard(dur, octaves_per_s=0.08, base=27.5, n_oct=7, seed=0, bright=0.35, saw=True):
    """An endlessly rising tone (Shepard-Risset): octave-spaced voices all gliding up, each fading in at the bottom
    and out at the top under a bell-shaped weight, so it climbs forever without arriving. Kept low and dark."""
    n = n_of(dur)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    r = rng(seed)
    for k in range(n_oct):
        pos = (k + t * octaves_per_s) % n_oct
        f = base * 2 ** pos
        w = np.exp(-0.5 * ((pos - n_oct * 0.42) / (n_oct * 0.2)) ** 2)
        ph = np.cumsum(f) / SR + r.random()
        v = (2 * (ph % 1.0) - 1) if saw else np.sin(TAU * ph)
        out += stereo_pan(v * w, 0.5 * np.sin(k * 1.7))
    out = lp(out, 400 + 3000 * bright)
    return peak(fade(out, 0.3, 0.05))


def heartbeat(times, seed=0, depth=1.0):
    """A heart: each beat a 'lub' and a softer 'dub' a quarter second later, felt more than heard. times: beat
    onsets in seconds from the start of the clip."""
    end = (max(times) if len(times) else 0) + 1.0
    out = np.zeros(n_of(end))
    m = n_of(0.35)
    tt = np.arange(m) / SR
    for i, t0 in enumerate(times):
        for d, f, a in ((0.0, 52.0, 1.0), (0.24, 64.0, 0.6)):
            g = np.sin(TAU * f * tt * (1 + 0.4 * np.exp(-tt / 0.02))) * np.exp(-tt / 0.07) * np.minimum(1, tt / 0.004)
            g = np.tanh(2.0 * g * depth) * a
            place(out, g, n_of(t0 + d))
    out += lp(rng(seed).standard_normal(len(out)), 90) * 0.02
    return peak(fade(out, 0.002, 0.2))


def charge_hum(dur, f0=50.0, f1=100.0, seed=0, buzz=0.35):
    """A capacitor bank charging through its transformer: the hum and its harmonics climbing an octave, the core's
    buzz growing with the load, a pressure of air underneath. Deep, not a whine."""
    n = n_of(dur)
    t = np.arange(n) / SR
    x = t / dur
    f = f0 * (f1 / f0) ** (x ** 1.3)
    ph = np.cumsum(f) / SR
    hum = np.sin(TAU * ph) + 0.55 * np.sin(TAU * 2 * ph + 1) + 0.3 * np.sin(TAU * 3 * ph + 2) + 0.15 * np.sin(TAU * 4 * ph + 3)
    bz = np.abs(np.sin(TAU * ph)) ** 8
    bz = bp(bz - bz.mean(), 180, 1600) * buzz * (0.3 + x)
    air = lp(rng(seed).standard_normal(n), 120) * 0.6 * x
    y = (hum * 0.6 + bz * 2.0 + air) * (0.2 + 0.8 * x ** 1.2)
    return peak(fade(decor(y, seed, 0.4), 0.3, 0.02))


def coil_volley(n_stage=12, span=0.24, seed=0, f0=48.0, f1=190.0):
    """A coilgun's stages firing one after the other down the barrel: a fast ripple of electromagnetic whumps,
    each a little higher, racing across the stereo field."""
    r = rng(seed)
    out = np.zeros((n_of(span + 1.2), 2))
    m = n_of(0.5)
    tt = np.arange(m) / SR
    for k in range(n_stage):
        a = k / max(1, n_stage - 1)
        t = span * a ** 0.85
        f = f0 * (f1 / f0) ** a
        g = np.sin(TAU * f * tt * (1 + 0.6 * np.exp(-tt / 0.01))) * np.exp(-tt / 0.06) * np.minimum(1, tt / 0.0008)
        g = np.tanh(2.5 * g)
        g += bp(r.standard_normal(m), 600, 5000) * np.exp(-tt / 0.004) * 0.6
        place(out, stereo_pan(g * (0.6 + 0.4 * a), -0.85 + 1.7 * a), n_of(t))
    return peak(out)


def cool_ticks(dur, density=3.0, seed=0):
    """Hot steel cooling: small sharp pings and ticks here and there, thinning out."""
    r = rng(seed)
    out = np.zeros((n_of(dur + 0.5), 2))
    t = 0.05
    k = 0
    while t < dur:
        c = metal(r.uniform(0.25, 0.7), damp=r.uniform(0.04, 0.12), hard=0.85, seed=seed + k, thud=0.0)
        place(out, stereo_pan(c * r.uniform(0.3, 1.0) * np.exp(-t / dur * 1.5), r.uniform(-0.8, 0.8)), n_of(t))
        t += r.exponential(1.0 / density) * (1 + t / dur)
        k += 1
    return peak(out)


def rotor_down(dur, f_start=70.0, seed=0, roar=1.0):
    """A big rotor coasting down: windage whooming slower and slower, its hum falling, the roar thinning."""
    n = n_of(dur)
    r = rng(seed)
    t = np.arange(n) / SR
    s = (1 - t / dur) ** 1.6
    fr = f_start * s
    ph = np.cumsum(fr) / SR
    wind = dsp.filt(r.standard_normal(n), 'bp', 120 + 900 * s, 0.7, block=256)
    wind *= (0.55 + 0.45 * np.sin(TAU * 2 * ph) ** 2) * s * roar
    hum = (np.sin(TAU * 2 * ph) + 0.5 * np.sin(TAU * 4 * ph + 1)) * s ** 1.5
    low = dsp.filt(r.standard_normal(n), 'lp', 60 + 160 * s, 0.7, block=512) * 2.2 * s
    return peak(fade(wind * 1.2 + hum * 0.6 + low, 0.02, 0.3))


# ---------------------------------------------------------------- impacts rebuilt from measured fingerprints

THIRD = [25 * 2 ** (k / 3) for k in range(28)]                         # the fingerprint's bands (audio_analyzer.impact)
_TPL = {}


def template(name):
    """A measured impact fingerprint (dB re its loudest cell; 28 third-octave bands x 5 ms frames, 3 s), from
    tools/sound_lab/data/impacts/ (written by tools/audio_impact.py from CC0 / public-domain recordings; the
    recordings themselves are not used, only these measurements)."""
    if name not in _TPL:
        import os
        _TPL[name] = np.load(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'impacts', name + '.npy')).astype(np.float64)
    return _TPL[name]


def resynth(fp, seed=0, dur=None, hop=0.005, attack_ms=1.0, width=0.6, gain_db=None, tilt=0.0):
    """Fresh noise shaped band by band to a measured fingerprint: the same energy in each third-octave band at
    each moment, so it hits, sustains and decays like the measured sound, with new fine structure. Stereo: the
    bands above 150 Hz decorrelated left/right by `width`. gain_db: per-band offsets (28) to re-voice it; tilt:
    dB per octave around 500 Hz."""
    nf = fp.shape[1]
    dur = dur or nf * hop
    n = n_of(dur)
    r = rng(seed)
    t = np.arange(n) / SR
    centers = (np.arange(nf) + 0.5) * hop
    out = np.zeros((n, 2))
    for k, fc in enumerate(THIRD):
        if fc * 2 ** (1 / 6) >= SR * 0.45:
            break
        lo, hi = fc / 2 ** (1 / 6), fc * 2 ** (1 / 6)
        db = fp[k] + (gain_db[k] if gain_db is not None else 0.0) + tilt * np.log2(fc / 500.0)
        env = 10 ** (np.interp(t, centers, db, left=db[0], right=-120) / 20)
        env *= np.clip(t / max(attack_ms / 1000, 1e-5), 0, 1)
        a = bp(r.standard_normal(n), lo, hi, 3)
        a /= np.sqrt(np.mean(a * a)) + 1e-12
        if fc < 150 or width == 0:
            out += (a * env)[:, None]
        else:
            b = bp(r.standard_normal(n), lo, hi, 3)
            b /= np.sqrt(np.mean(b * b)) + 1e-12
            out[:, 0] += env * (a * np.sqrt(1 - width / 2) + b * np.sqrt(width / 2))
            out[:, 1] += env * (a * np.sqrt(1 - width / 2) - b * np.sqrt(width / 2))
    return out


def thump(f_hi=160.0, f_lo=58.0, drop=0.022, decay=0.2, drive=2.5, dur=1.2):
    """The 'umf': one huge low pressure pulse that falls in pitch (like the measured railgun's 158 -> 60 Hz in
    60 ms), driven so it reads on small speakers too."""
    n = n_of(dur)
    t = np.arange(n) / SR
    f = f_lo + (f_hi - f_lo) * np.exp(-t / drop)
    ph = np.cumsum(f) / SR
    y = (np.sin(TAU * ph) + 0.25 * np.sin(2 * TAU * ph + 0.5)) * np.minimum(1, t / 0.0008) * np.exp(-t / decay)
    return np.tanh(drive * y) / np.tanh(drive)


def railgun_blast(seed=0, weight=1.0, crack=1.0, zap=1.0, body=1.0, tail=1.0):
    """The railgun's report, rebuilt from measurements of real ones: the wall of sound of the BAE railgun's shot
    (broadband at once, held for a second, 3 s to die), a 155 mm howitzer's body under it, a pitch-dropping
    pressure thump (the 'umf'), a rifle's supersonic crack on the front, the snap of a spark gap (the banks
    dumping) and lightning's roll in the tail. Gently saturated so it stays dense (crest about 9 dB)."""
    D = 4.0
    n = n_of(D)
    out = np.zeros((n, 2))
    place(out, resynth(template('railgun_bae'), seed, 3.0), 0, 1.0)
    place(out, resynth(template('howitzer_155'), seed + 1, 3.0), 0, 0.55 * body)
    th = thump()
    place(out, np.c_[th, th], 0, 0.9 * weight)
    c = resynth(template('rifle_mosin'), seed + 2, 0.08, attack_ms=0.3)
    c *= np.exp(-np.arange(len(c)) / (SR * 0.018))[:, None]
    place(out, c, 0, 0.7 * crack)
    z = resynth(template('spark_gap_1'), seed + 3, 0.5, attack_ms=0.3)
    z *= np.exp(-np.arange(len(z)) / (SR * 0.12))[:, None]
    place(out, z, 0, 0.35 * zap)
    rl = resynth(template('lightning'), seed + 4, 3.0, attack_ms=40)
    place(out, rl, n_of(0.12), 0.45 * tail)
    out /= np.abs(out).max() + 1e-12
    out = np.tanh(1.8 * out) / np.tanh(1.8)
    return peak(fade(hp(out, 24, 2), 0.0003, 0.8))


def warp(fp, stretch=1.0, shift=0, loop_to=None):
    """A fingerprint made bigger or longer: stretch in time, shift down by `shift` third-octaves (3 = an octave:
    the same event, larger), or held (its middle repeated) out to loop_to frames."""
    fp = np.asarray(fp, np.float64)
    if shift > 0:
        fp = np.vstack([fp[shift:], np.full((shift, fp.shape[1]), -120.0)])
    if stretch != 1.0:
        nf = fp.shape[1]
        m = int(nf * stretch)
        x = np.linspace(0, nf - 1, m)
        fp = np.array([np.interp(x, np.arange(nf), row) for row in fp])
    if loop_to and loop_to > fp.shape[1]:
        a, b = fp.shape[1] // 4, fp.shape[1] * 3 // 4
        body = fp[:, a:b]
        reps = [fp[:, :b]]
        while sum(r.shape[1] for r in reps) < loop_to:
            reps.append(body[:, ::(-1 if len(reps) % 2 else 1)])
        fp = np.hstack(reps)[:, :loop_to]
    return fp


def discharge(seed=0, size=1.0):
    """A capacitor bank going off: the real spark gap's snap made larger (shifted down and stretched, its top
    darkened), a low pressure thump from the measured capacitor discharge, a burst of arc crackle after it."""
    D = 2.5
    out = np.zeros((n_of(D), 2))
    for k, (dt, g) in enumerate(((0.0, 2.0), (0.011, 1.1), (0.027, 0.7))):
        z = resynth(warp(template('spark_gap_1'), 1.0 + 0.5 * size, int(2 * size)), seed + k, 0.9, attack_ms=0.2, tilt=-2.5)
        z *= np.exp(-np.arange(len(z)) / (SR * (0.06 + 0.05 * size)))[:, None]
        place(out, z, n_of(dt), g)
    c = resynth(template('cap_discharge'), seed + 5, 0.8, attack_ms=0.5)
    place(out, c, n_of(0.004), 0.9)
    th = thump(120.0, 45.0, 0.02, 0.16, 2.2, 1.0)
    place(out, np.c_[th, th], 0, 0.9 * size)
    hs = resynth(warp(template('hv_sparks'), 1.0, 1), seed + 7, 2.0, attack_ms=30, tilt=-2.0)
    hs *= np.exp(-np.arange(len(hs)) / (SR * 0.5))[:, None]
    place(out, hs, n_of(0.05), 0.45)
    out = np.tanh(1.5 * out / (np.abs(out).max() + 1e-12)) / np.tanh(1.5)
    return peak(fade(hp(out, 25, 2), 0.0002, 0.4))


def arcs(dur, amount, seed=0):
    """Arcs crawling and buzzing (the measured Jacob's ladder held for `dur`, its level following `amount`) with the
    crackle of sparks (measured high-voltage sparks) thickening as amount rises. Mid-weighted, not shrill."""
    nf = int(dur / 0.005) + 1
    a = resynth(warp(template('jacobs_ladder'), 1.0, 0, loop_to=nf), seed, dur, attack_ms=50)
    s = resynth(warp(template('hv_sparks'), 1.0, 1, loop_to=nf), seed + 1, dur, attack_ms=50, tilt=-2.5)
    am = np.clip(curve(amount, len(a)), 0, 1)
    y = a * (0.25 + 0.75 * am)[:, None] + s * (am ** 1.5)[:, None] * 0.8
    return peak(fade(y, 0.3, 0.05))
