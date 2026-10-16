"""The DUEL's score: restrained, cinematic, acoustic (sound_lab.orchestra: felt piano, a string section, low
brass, timpani, a concert bass drum; synth.py only for a sub swell). D minor, 76 bpm, built in cues that start on
the film's beats (from its markers), so a re-timed film keeps its music on the picture.

The arc: the machinery (a low string pedal and a few piano notes), the power room (a slow pulse comes in), the
aim (tremolo, the timpani), the charge (everything builds) - then the music stops dead a beat before the shot. The
silence of space (one high string chord, barely there). The hit (one low brass note). The orbital ship rebuilding
(the pulse again, darker, the timpani). Its shot, the fall (the second, bigger build) - stopped before the strike.
After the strike: nothing for a while; then under the water a low chord; at the surface the theme on the piano,
the strings under it, to the end.

The music sits under the foley: its own buses are ducked by the foley (mixer.duck) and it is kept out of the
2-5 kHz band where the machines speak.
"""
import numpy as np

from sound_lab import orchestra as O, synth as Y

BPM = 76.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
D = 38          # D2
# chords (MIDI): Dm, Bb, Gm, A(sus), F, C
CH = {'Dm': (38, 45, 50, 53, 57), 'Bb': (34, 46, 50, 53, 58), 'Gm': (31, 43, 50, 55, 58), 'Asus': (33, 45, 50, 52, 57),
      'A': (33, 45, 49, 52, 57), 'F': (29, 45, 48, 53, 57), 'C': (36, 43, 48, 52, 55), 'Dm9': (38, 45, 52, 53, 57)}
THEME = [(62, 2), (64, 1), (65, 1), (65, 3), (62, 1), (60, 2), (57, 1), (60, 1), (64, 4)]    # D E F . F D C A C E


def _bars(t0, t1):
    return max(1, int((t1 - t0) / BAR))


def pedal(M, t0, t1, notes=(26, 38), vel=0.35, bus='m_str', seed=0, a=4.0):
    """A held low string pedal over [t0, t1], renewed every 8 bars (bow changes overlap)."""
    L = 8 * BAR
    t = t0
    k = 0
    while t < t1 - 1.0:
        d = min(L, t1 - t) + 1.0
        M.add(bus, t, lambda d=d, k=k: O.section(tuple(notes), d, vel, seed + k, 5, a if k == 0 else 1.5, 2.5, 0.7), dur=d + 3,
              db=-5.0)
        t += L
        k += 1


def chords(M, t0, t1, prog, bars_each=2, vel=0.4, bus='m_str', seed=10, top=False, a=1.2):
    """A slow progression held by the section (bars_each bars per chord), looping until t1."""
    t = t0
    k = 0
    while t < t1 - 0.5:
        nm = prog[k % len(prog)]
        notes = tuple(m + 12 for m in (CH[nm][1:] if not top else CH[nm][2:]))     # violas and violins
        d = min(bars_each * BAR, t1 - t)
        M.add(bus, t, lambda n=notes, d=d, k=k: O.section(n, d + 0.3, vel, seed + k, 5, a, 1.8, 0.5), dur=d + 2)
        t += bars_each * BAR
        k += 1


def piano_sparse(M, t0, t1, notes, every=2, vel=0.32, bus='m_pno', seed=0):
    """A few piano notes, one every `every` bars, cycling through `notes`."""
    t = t0 + BAR
    k = 0
    while t < t1 - 1:
        m = notes[k % len(notes)]
        M.add(bus, t, lambda m=m, k=k: O.felt_piano(m, 3.5, vel * (0.85 + 0.15 * ((k * 7) % 3) / 2), k), dur=5)
        if k % 3 == 2:
            M.add(bus, t + 2 * BEAT, lambda m=m: O.felt_piano(m - 5, 3.0, vel * 0.7, 3), dur=4)
        t += every * BAR
        k += 1


def pulse(M, t0, t1, prog, vel=0.3, bus='m_pulse', seed=20, grow=0.0, eighths=True):
    """The pulse: low strings re-bowed on every eighth (marcato, short), following the progression (2 bars each),
    growing by `grow` in velocity across the stretch."""
    step = BEAT / 2 if eighths else BEAT
    t = t0
    k = 0
    T = max(t1 - t0, 1e-3)
    while t < t1 - step:
        bar = int((t - t0) / BAR)
        nm = prog[(bar // 2) % len(prog)]
        root = CH[nm][0] + 12
        acc = 1.0 if k % 8 in (0, 3, 6) else 0.7
        v = round(min(1.0, vel * acc * (1 + grow * (t - t0) / T)), 2)
        M.add(bus, t, lambda r=root, v=v, k=k: O.section((r, r + 12), step * 0.8, v, (seed + k) % 8, 3, 0.02, 0.12, 0.2), dur=1)
        t += step
        k += 1


def timp_pattern(M, t0, t1, vel=0.4, bus='m_perc', seed=30, every=2):
    """A soft timpani on the downbeat every `every` bars (D, then A below)."""
    t = t0
    k = 0
    while t < t1 - 0.5:
        m = 38 if k % 2 == 0 else 33
        M.add(bus, t, lambda m=m, k=k: O.timpani(m, vel, k % 6), dur=3)
        t += every * BAR
        k += 1


def build(M, t0, t1, peak=0.85, seed=40, stop=None):
    """A build from t0 to t1: tremolo strings climbing (Dm - Bb - Gm - A), a timpani roll, low brass swelling, a
    sub swell; everything cut at `stop` (default t1)."""
    stop = stop or t1
    L = stop - t0
    if L < 2:
        return
    prog = ['Dm', 'Bb', 'Gm', 'A']
    q = L / 4
    for k, nm in enumerate(prog):
        notes = tuple(m + 12 for m in CH[nm][1:])
        v = round(0.3 + (peak - 0.3) * (k + 1) / 4, 2)
        left = stop - (t0 + k * q)                       # everything stops dead at `stop`
        M.add('m_str', t0 + k * q, lambda n=notes, v=v, k=k, c=left: _cut(O.tremolo(n, q + 0.15, v, seed + k, 10 + 3 * k), c), dur=q + 1, db=-12.0)
        M.add('m_low', t0 + k * q, lambda r=CH[nm][0], v=v, k=k, c=left: _cut(O.low_brass(r + 12, q + 0.1, v * 0.9, seed + k, 4, q * 0.6, 0.3), c), dur=q + 1, db=-11.0)
    M.add('m_perc', t0 + L * 0.45, lambda: _cut(O.timp_roll(38, L * 0.55 - 0.05, 0.15, peak, seed), L * 0.55), dur=L, db=-11.0)
    M.add('m_low', t0 + L * 0.3, lambda: _cut(_swell(L * 0.7), L * 0.7), dur=L)


def _swell(d):
    n = int(d * 48000)
    t = np.arange(n) / 48000
    f = 36.7 * (1 + 0.02 * t / d)
    y = np.sin(2 * np.pi * np.cumsum(f) / 48000) * (t / d) ** 2.2 * 0.5
    return np.c_[y, y]


def _cut(x, d):
    """x stopped dead at d s (a 5 ms fade)."""
    n = int(d * 48000)
    x = np.asarray(x)[:n].copy()
    k = min(len(x), 240)
    x[-k:] *= np.linspace(1, 0, k)[:, None]
    return x


def theme(M, t0, vel=0.35, bus='m_pno', octave=0, seed=50):
    """The theme on the piano from t0 (beats as written)."""
    t = t0
    for k, (m, b) in enumerate(THEME):
        M.add(bus, t, lambda m=m + octave, b=b, k=k: O.felt_piano(m, b * BEAT * 1.1, vel, seed + k), dur=b * BEAT + 4)
        t += b * BEAT
    return t


def compose(M, T, log=print):
    """Add the score's cues to the mixer M, timed by the timeline T."""
    at, span, run = T.at, T.span, T.run
    end = T.duration
    # ---- 1. the machinery: pedal and sparse piano
    r = run('machinery', 'powerrun') or run('engines', 'generator')
    if r:
        a, b = r
        pedal(M, a + 2.0, b + 4.0, (26, 38), 0.30, seed=1)
        piano_sparse(M, a + 6.0, b, [69, 65, 62, 64, 60, 57], every=3, vel=0.34)
    # ---- 2. the power room: harmony moves, the pulse arrives
    r = run('powerroom', 'coils')
    if r:
        a, b = r
        chords(M, a, b + 2, ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'Asus'], 2, 0.24, seed=11)
        pedal(M, a, b + 2, (26,), 0.28, seed=2, a=2.0)
        pulse(M, a + 4 * BAR, b, ['Dm', 'Bb', 'F', 'C'], 0.22, grow=0.5)
        piano_sparse(M, a + 2 * BAR, b, [74, 72, 69, 77], every=4, vel=0.3)
    # ---- 3. hydraulics to the load: tension
    r = run('hydraulics', 'load')
    if r:
        a, b = r
        chords(M, a, b, ['Dm', 'Gm', 'Bb', 'Asus'], 4, 0.22, seed=21, top=True, a=3.0)
        pedal(M, a, b, (26, 33), 0.26, seed=3)
        timp_pattern(M, a + 2 * BAR, b, 0.28, every=4)
    # ---- 4. the charge: the first build, cut a beat before the shot
    tf = getattr(T, 'shot', None) or at('fire', note=False)
    tc = at('charge', note=False)
    if tc is not None and tf is not None and tf > tc:
        build(M, tc, tf, 0.9, seed=40, stop=getattr(T, 'release', tf - 0.6))
    elif tf is not None:
        build(M, tf - 16, tf, 0.9, seed=40, stop=getattr(T, 'release', tf - 0.6))
    # ---- 5. the silence of space: one high chord, barely there
    tx = at('space', note=False) or (tf + 8 if tf is not None else None)
    th = at('hit', note=False)
    if tx is not None:
        e = (th if th is not None and th > tx else tx + 14) - 0.5
        M.add('m_str', tx, lambda d=e - tx: O.section((74, 77, 81), max(d, 2), 0.18, 61, 4, 3.0, 1.5, 0.2, 0.6), dur=e - tx + 3,
              db=-9.0)
    # ---- 6. the hit: one low brass note under the thud
    if th is not None:
        M.add('m_low', th + 0.35, lambda: O.low_brass(26, 5.0, 0.55, 70, 5, 0.25, 2.5), dur=8)
        M.add('m_perc', th, lambda: O.bass_drum(0.8, 1), dur=4)
    # ---- 6b. the orbital ship seen: a cold, low drone, a few piano notes far apart
    r = run('orbit', 'orbit')
    rs = at('rings', note=False)
    if r:
        a, b = r[0], (rs if rs is not None and rs > r[0] else r[1])
        pedal(M, a + 1.0, b + 1.0, (26, 33), 0.24, seed=7, a=5.0)
        M.add('m_str', a + 4.0, lambda d=max(2.0, b - a - 3): O.section((69, 76), d, 0.16, 77, 4, 4.0, 2.0, 0.3, 0.7), dur=b - a + 3,
              db=-6.0)
        piano_sparse(M, a + 2.0, b, [57, 53, 50, 52], every=3, vel=0.26)
    # ---- 7. the orbital ship rebuilds: the pulse again, darker
    r = run('rings', 'orb_charge') or run('orbit', 'orb_charge')
    if r:
        a, b = r
        chords(M, a, b, ['Gm', 'Dm', 'Bb', 'A'], 2, 0.24, seed=31)
        pulse(M, a + 2 * BAR, b, ['Gm', 'Dm', 'Bb', 'A'], 0.24, seed=33, grow=0.7)
        timp_pattern(M, a, b, 0.32, every=2)
    # ---- 8. its shot and the fall: the big build, cut before the strike
    to = at('orb_fire', note=False)
    ts = at('strike', note=False)
    if to is not None and ts is not None and ts > to:
        build(M, to, ts, 1.0, seed=80, stop=ts - 0.4)
    # ---- 9. after the strike: silence, then the low chord under the water, the theme at the surface
    tu = at('underwater', note=False)
    tsu = at('surface', note=False)
    if tu is not None:
        e = tsu if tsu is not None and tsu > tu else tu + 20
        M.add('m_str', tu + 1.5, lambda d=e - tu: O.section((26, 38, 45, 53), d, 0.3, 91, 5, 4.0, 3.0, 0.9), dur=e - tu + 4)
    if tsu is not None:
        t0 = tsu + 4.0
        chords(M, t0, end - 2, ['Dm', 'Bb', 'F', 'C', 'Gm', 'Dm'], 2, 0.24, seed=95)
        tt = theme(M, t0 + BAR, 0.3)
        if tt + 2 * BAR < end - 6:
            theme(M, tt + BAR, 0.26, octave=12, seed=60)
    log(f'  score: {sum(1 for e in M.ev if e["bus"].startswith("m_"))} music events')
