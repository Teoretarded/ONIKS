"""The DUEL's score, played by real sampled instruments (VSCO 2 Community Edition, CC0, through sound_lab.sampler):
string sections (spiccato, sustains with vibrato, tremolo), contrabass, horns, trombones, tuba, timpani, a giant
frame drum, a concert bass drum, a suspended cymbal, an upright piano. D minor, 76 bpm, built in cues that start
on the film's beats (from its markers), so a re-timed film keeps its music on the picture.

The arc (a hybrid-trailer shape with one theme): the machinery (a low string pedal that breathes, a few piano
notes); the power room (the harmony moves; a spiccato ostinato comes in, quiet, accented 3+3+2 and shaped in
two-bar hairpins); the coils (the ostinato in sixteenths, a frame drum under it); the aim (tremolo, timpani); the
charge (everything builds: the ostinato, tremolo climbing, brass swelling, a timpani and cymbal roll) - then the
music stops dead a beat before the shot. Space is silent. The hit: one low brass note and a drum. The orbital
ship: a cold pedal, a few piano notes; its rebuild: the ostinato again, darker; its shot and the fall: the big
build with the theme in the horns, stopped with the foley before the strike. Under the water a low chord; at the
surface the theme on the piano, the strings under it, ending on its last note with the room's own tail.

The music sits under the foley: its buses are ducked by the foley (mixer.duck) and capped under it in the
machinery chapters (pc_duel.MUSIC_UNDER).
"""
import numpy as np

from sound_lab import sampler as SM
from sound_lab.dsp import SR, n_of

BPM = 76.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
S16 = BEAT / 4
# chords (MIDI, low to high): Dm, Bb, Gm, A(sus), F, C
CH = {'Dm': (38, 45, 50, 53, 57), 'Bb': (34, 46, 50, 53, 58), 'Gm': (31, 43, 50, 55, 58), 'Asus': (33, 45, 50, 52, 57),
      'A': (33, 45, 49, 52, 57), 'F': (29, 45, 48, 53, 57), 'C': (36, 43, 48, 52, 55), 'Dm9': (38, 45, 52, 53, 57)}
THEME = [(62, 2), (64, 1), (65, 1), (65, 3), (62, 1), (60, 2), (57, 1), (60, 1), (64, 4)]    # D E F . F D C A C E
# the ostinato's cell over eight sixteenths: (degree offset in semitones from the root, accent); 3+3+2
CELL = [(0, 1), (0, 0), (0, 0), (7, 1), (0, 0), (0, 0), (8, 1), (7, 0)]
CELL_B = [(0, 1), (0, 0), (12, 0), (7, 1), (0, 0), (3, 0), (5, 1), (7, 0)]          # the answer (every other bar)
I = SM.inst


def _seed(*a):
    return int(abs(hash(a)) % 100003)


def _vari(rng, v, s=0.05):
    return float(np.clip(v + rng.normal(0, s), 0.05, 1.0))


def _cut(x, d, fade=0.006):
    """x stopped dead at d s (a short fade so it does not click)."""
    n = n_of(d)
    x = np.asarray(x)[:n].copy()
    k = min(len(x), n_of(fade))
    if k:
        x[-k:] *= np.linspace(1, 0, k)[:, None]
    return x


def _place(events, length=None):
    return SM.place(events, length)


# ---------------------------------------------------------------- the parts


def pedal(M, t0, t1, roots=(26, 38), vel=0.35, bus='m_str', seed=0, breathe=8):
    """A held low string pedal over [t0, t1]: contrabasses and celli on the roots, bowed in `breathe`-bar arcs
    (each swell opening and closing; the next bow overlaps the last one's release)."""
    L = breathe * BAR
    t, k = t0, 0
    while t < t1 - 1.0:
        d = min(L, t1 - t) + 1.0
        dyn = [(0, vel * 0.45), (d * 0.45, vel), (d * 0.8, vel * 0.8), (d, vel * 0.5)]

        def fn(d=d, k=k, dyn=dyn):
            parts = []
            for j, m in enumerate(roots):
                ins = I('ContrabassSusVB') if m < 36 else I('CelloEnsSusVib')
                parts.append((0.0, ins.swell(m, d, dyn, seed + 13 * k + j, release=2.0, attack=1.2)))
            return _place(parts)
        M.add(bus, t, fn, dur=d + 3, db=-3.0, why='pedal')
        t += L - 1.0
        k += 1


def chords(M, t0, t1, prog, bars_each=2, vel=0.4, bus='m_str', seed=10, top=False, dyn_shape=(0.55, 1.0, 0.75), final=None):
    """A slow progression held by violas and violins (sustain, vibrato), each chord swelling and easing; `final`
    replaces the last chord (and holds it to t1)."""
    t, k = t0, 0
    while t < t1 - 0.5:
        nm = prog[k % len(prog)]
        last = final and t + 2 * bars_each * BAR > t1 - 0.5
        if last:
            nm = final
            bars_each = (t1 - t) / BAR
        notes = tuple(m + 12 for m in (CH[nm][1:] if not top else CH[nm][2:]))
        d = min(bars_each * BAR, t1 - t) + (0.25 if not last else 0.0)
        a, b, c = dyn_shape
        dyn = [(0, vel * a), (d * 0.5, vel * b), (d, vel * c)] if not last else [(0, vel * a), (d * 0.3, vel * b), (d, 0.03)]

        def fn(notes=notes, d=d, k=k, dyn=dyn):
            parts = []
            for j, m in enumerate(notes):
                ins = I('ViolinEnsSusVib') if m >= 62 else I('ViolaEnsSusVib') if m >= 50 else I('CelloEnsSusVib')
                parts.append((0.0, ins.swell(m, d, dyn, seed + 7 * k + j, release=1.4, attack=0.5)))
            return _place(parts)
        M.add(bus, t, fn, dur=d + 3, why=f'chord {nm}')
        t += bars_each * BAR
        k += 1


def piano_sparse(M, t0, t1, notes, every=2, vel=0.32, bus='m_pno', seed=0):
    """A few piano notes, one every `every` bars, cycling through `notes`, now and then an answer a fourth below."""
    t, k = t0 + BAR, 0
    rng = np.random.default_rng(seed)
    pno = I('UprightPiano', short=False, loop=False, release=0.8)
    while t < t1 - 1:
        m = notes[k % len(notes)]
        v = _vari(rng, vel, 0.04)
        M.add(bus, t, lambda m=m, v=v, k=k: pno.note(m, v, 3.2, seed + k), dur=5, why='piano')
        if k % 3 == 2:
            M.add(bus, t + 2 * BEAT, lambda m=m, v=v, k=k: pno.note(m - 5, v * 0.8, 2.6, seed + k + 50), dur=4, why='piano')
        t += every * BAR
        k += 1


def ostinato(M, t0, t1, prog, vel=0.4, grow=0.0, bus='m_ost', seed=20, sixteenths=True, layers=('vc',), stop=None,
             rests=0.0, bars_each=2, chord_at=None):
    """The ostinato: spiccato strings on a 3+3+2 cell (root, fifth, minor sixth) with its answer every other bar,
    played in two-bar phrases (one event each). Accents on the cell's strong notes; velocity shaped by a hairpin
    over each phrase and growing by `grow` across the stretch; alternate bows (the round robins), a little timing
    scatter. layers: 'vc' celli, 'va' violas (an octave up), 'vn' violins (two up), 'cb' contrabass (accents).
    sixteenths=False: eighths (the same cell at half speed). rests: share of the weak notes left out (air)."""
    stop = stop or t1
    step = S16 if sixteenths else 2 * S16
    T = max(stop - t0, 1e-3)
    phrase = 2 * BAR
    t, ph = t0, 0
    while t < stop - step:
        d = min(phrase, stop - t)

        def fn(t_=t, ph=ph, d=d):
            rng = np.random.default_rng(seed * 101 + ph)
            ev = []
            n = int(round(d / step))
            for i in range(n):
                tt = t_ + i * step
                bar = int((tt - t0) / BAR + 1e-6)
                nm = chord_at(tt) if chord_at else prog[(bar // bars_each) % len(prog)]
                root = CH[nm][0] + 12
                while root < 36:
                    root += 12
                cell = CELL if (bar % 2 == 0) else CELL_B
                off, acc = cell[i % 8]
                if not acc and rests and rng.random() < rests:
                    continue
                hp = 0.82 + 0.18 * np.sin(np.pi * (i * step) / max(d, 1e-3))        # the phrase's hairpin
                g = 1 + grow * (tt - t0) / T
                v = vel * (1.0 if acc else 0.62) * hp * g
                v = _vari(rng, v, 0.04)
                dt = rng.normal(0, 0.006)
                rr = seed + ph * 64 + i                                            # alternate bows
                m = root + off
                if 'vc' in layers:
                    ev.append((i * step + dt, I('CelloEnsSpic').note(m, v, step * 0.7, rr, tail=1.2)))
                if 'va' in layers:
                    ev.append((i * step + rng.normal(0, 0.006), I('ViolaEnsSpic').note(m + 12, v * 0.9, step * 0.7, rr + 3, tail=1.0)))
                if 'vn' in layers:
                    ev.append((i * step + rng.normal(0, 0.006), I('ViolinEnsSpic').note(m + 24, v * 0.85, step * 0.7, rr + 7, tail=0.9)))
                if 'cb' in layers and acc:
                    ev.append((i * step + rng.normal(0, 0.005), I('ContrabassSpic').note(root - 12, min(1, v * 1.05), step, rr + 11, tail=1.4)))
            y = _place(ev)
            return _cut(y, stop - t_ + 1.2) if t_ + d >= stop - 1e-6 and stop < t1 else y
        M.add(bus, t, fn, dur=d + 2, why='ostinato')
        t += phrase
        ph += 1


def drums(M, t0, t1, vel=0.5, bus='m_perc', seed=30, pattern='x...x..x', every_bar=True, stop=None, grow=0.0, kitname='giant_drum'):
    """The frame drum (a giant hand/mallet drum) on a pattern of sixteenths per beat-pair ('x' hit, '.' rest),
    every bar; growing by `grow`."""
    stop = stop or t1
    kit = SM.kit(kitname)
    t, k = t0, 0
    rng = np.random.default_rng(seed)
    T = max(stop - t0, 1e-3)
    step = 2 * BEAT / len(pattern)
    while t < stop - 0.05:
        for i, c in enumerate(pattern):
            tt = t + i * step
            if c != 'x' or tt >= stop:
                continue
            v = _vari(rng, vel * (1.0 if i == 0 else 0.75) * (1 + grow * (tt - t0) / T), 0.05)
            M.add(bus, tt + rng.normal(0, 0.004), lambda v=v, k=k, i=i: kit.hit(v, seed + 3 * k + i), dur=3, why=kitname)
        t += 2 * BEAT
        k += 1


def timp_pattern(M, t0, t1, vel=0.4, bus='m_perc', seed=30, every=2):
    """A soft timpani on the downbeat every `every` bars (D, then A below), damped before the next."""
    t, k = t0, 0
    rng = np.random.default_rng(seed)
    while t < t1 - 0.5:
        m = 38 if k % 2 == 0 else 33
        v = _vari(rng, vel, 0.04)
        M.add(bus, t, lambda m=m, v=v, k=k: I('Timpani').note(m, v, 2.2, seed + k, tail=3.5), dur=4, why='timpani')
        t += every * BAR
        k += 1


def brass_swell(M, t, d, notes, v0, v1, bus='m_low', seed=0, stop=None):
    """Horns, trombones and tuba on a chord, swelling v0 -> v1 over d s (cut at stop)."""
    def fn():
        parts = []
        for j, m in enumerate(notes):
            ins = I('TubaSus') if m < 40 else I('TromboneSus') if m < 55 else I('FHornSus')
            parts.append((0.0, ins.swell(m, d, [(0, v0), (d * 0.7, v0 + 0.7 * (v1 - v0)), (d, v1)], seed + j, release=0.6, attack=0.3)))
        y = _place(parts)
        return _cut(y, stop - t) if stop is not None else y
    M.add(bus, t, fn, dur=d + 2, why='brass')


def build(M, t0, t1, peak=0.85, seed=40, stop=None, theme_horns=False, gain=-4.0):
    """A build from t0 to `stop`: the ostinato (celli, violas, basses; violins in the last half) in sixteenths,
    tremolo strings climbing Dm - Bb - Gm - A, brass swelling under each chord, the frame drum doubling up, a
    timpani roll and a cymbal roll into the stop; everything cut dead at stop. theme_horns: the theme in the
    horns over it."""
    stop = stop or t1
    L = stop - t0
    if L < 2:
        return
    prog = ['Dm', 'Bb', 'Gm', 'A']
    q = L / 4
    ch_at = lambda tt: prog[min(3, max(0, int((tt - t0) / q)))]  # noqa: E731  (the ostinato follows the tremolo's chords)
    ostinato(M, t0, stop, prog, 0.42, grow=1.0, seed=seed, layers=('vc', 'va', 'cb'), stop=stop, chord_at=ch_at)
    if L > 8:
        ostinato(M, t0 + L * 0.5, stop, prog, 0.4, grow=0.8, seed=seed + 1, layers=('vn',), stop=stop, chord_at=ch_at)
    for k, nm in enumerate(prog):
        ta = t0 + k * q
        v = 0.3 + (peak - 0.3) * (k + 1) / 4
        notes = tuple(m + 12 for m in CH[nm][1:])

        def tr(notes=notes, v=v, k=k, ta=ta):
            parts = []
            for j, m in enumerate(notes):
                ins = I('ViolinEnsTrem') if m >= 62 else I('ViolaEnsTrem') if m >= 50 else I('CelloEnsTrem')
                parts.append((0.0, ins.swell(m, q + 0.2, [(0, v * 0.6), (q, v)], seed + 10 * k + j, release=0.3, attack=0.15)))
            return _cut(_place(parts), stop - ta)
        M.add('m_str', ta, tr, dur=q + 2, why='tremolo')
        brass_swell(M, ta, q + 0.1, (CH[nm][0] + 12, CH[nm][1], CH[nm][2] + 12), v * 0.45, v * 0.95, seed=seed + 20 + k, stop=stop)
    drums(M, t0, stop, 0.5, pattern='x.......', seed=seed + 2, grow=0.5)
    drums(M, t0 + L * 0.5, stop, 0.5, pattern='x...x.x.', seed=seed + 3, grow=0.6)
    # the timpani roll into the stop, the cymbal roll's peak on it
    tr0 = t0 + L * 0.5
    M.add('m_perc', tr0, lambda: _cut(I('TimpaniRolls').swell(38, L * 0.5, [(0, 0.25), (L * 0.5, peak)], seed, release=0.2,
                                                          attack=0.4), stop - tr0), dur=L, why='timp roll')
    cy = SM.kit('cymbal_roll')

    def cym():
        x = cy.hit(0.9, seed)
        k = int(np.argmax(np.abs(x).max(1)))          # its peak lands on the stop
        return x[max(0, k - n_of(min(L, 6.0))):k]
    M.add('m_perc', stop - min(L, 6.0), cym, dur=7, why='cymbal roll')
    if theme_horns and L > 12:
        tt = t0 + L * 0.4
        notes = []
        t = 0.0
        for m, b in THEME:
            notes.append((t, m - 12, b * BEAT, 0.75))
            t += b * BEAT
        M.add('m_low', tt, lambda: _cut(I('FHornSus').legato(notes, seed + 5), stop - tt), dur=t + 3, why='theme horns')
    # the stop: the music buses closed (their reverb included), so the shot comes out of a held breath
    for b in ('m_str', 'm_ost', 'm_pno', 'm_low', 'm_perc'):
        M.auto(b, [(t0 - 0.5, 0.0), (t0 + 0.5, gain), (stop - 0.01, gain), (stop + 0.004, -90.0), (stop + 2.5, -90.0), (stop + 2.6, 0.0)])


def theme(M, t0, vel=0.35, bus='m_pno', octave=0, seed=50, last=None, last_len=None):
    """The theme on the piano from t0 (beats as written); `last` replaces its last note (to end on the tonic)."""
    pno = I('UprightPiano', short=False, loop=False, release=1.2)
    t = t0
    rng = np.random.default_rng(seed)
    for k, (m, b) in enumerate(THEME):
        if k == len(THEME) - 1 and last is not None:
            m = last
        d = b * BEAT * 1.05 if not (k == len(THEME) - 1 and last_len) else last_len
        v = _vari(rng, vel * (1.08 if b >= 3 else 1.0), 0.03)
        M.add(bus, t, lambda m=m + octave, d=d, v=v, k=k: pno.note(m, v, d, seed + k), dur=d + 3, why='theme')
        if octave == 0 and b >= 2:                       # the left hand: the bass of the bar
            M.add(bus, t, lambda m=m, d=d, v=v, k=k: pno.note(m - 24 if m - 24 >= 33 else m - 12, v * 0.7, d, seed + k + 90),
                  dur=d + 3, why='theme lh')
        t += b * BEAT
    return t


def theme_len():
    return sum(b for _, b in THEME) * BEAT


# ---------------------------------------------------------------- the whole score


def compose(M, T, log=print):
    """Add the score's cues to the mixer M, timed by the timeline T."""
    at, run = T.at, T.run
    end = T.duration
    # ---- 1. the machinery: a breathing pedal and sparse piano
    r = run('machinery', 'powerrun') or run('engines', 'generator')
    if r:
        a, b = r
        pedal(M, a + 2.0, b + 4.0, (26, 38), 0.32, seed=1)
        piano_sparse(M, a + 6.0, b, [69, 65, 62, 64, 60, 57], every=3, vel=0.3)
    # ---- 2. the power room: the harmony moves, the ostinato arrives in eighths
    r = run('powerroom', 'cryo') or run('powerroom', 'coils')
    if r:
        a, b = r
        chords(M, a, b + 2, ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'Asus'], 2, 0.3, seed=11)
        pedal(M, a, b + 2, (26,), 0.28, seed=2)
        ostinato(M, a + 4 * BAR, b, ['Dm', 'Bb', 'F', 'C'], 0.34, grow=0.4, sixteenths=False, rests=0.35, seed=21)
        piano_sparse(M, a + 2 * BAR, b, [74, 72, 69, 77], every=4, vel=0.28)
    # ---- 2b. the coils: the ostinato in sixteenths, the frame drum under it
    r = T.span('coils', note=False)
    if r:
        a, b = r
        chords(M, a, b, ['Dm', 'Bb', 'Gm', 'Asus'], 2, 0.32, seed=12)
        ostinato(M, a, b, ['Dm', 'Bb', 'Gm', 'Asus'], 0.36, grow=0.35, seed=22, layers=('vc', 'cb'), rests=0.15)
        drums(M, a + 2 * BAR, b, 0.36, pattern='x.......', seed=23)
    # ---- 3. hydraulics to the load: tension (tremolo, the pedal, timpani)
    r = run('hydraulics', 'load')
    if r:
        a, b = r
        chords(M, a, b, ['Dm', 'Gm', 'Bb', 'Asus'], 4, 0.28, seed=21, top=True, dyn_shape=(0.5, 1.0, 0.6))
        pedal(M, a, b, (26, 33), 0.28, seed=3)
        timp_pattern(M, a + 2 * BAR, b, 0.3, every=4)
    # ---- 4. the charge: the first build, cut a beat before the shot
    tf = getattr(T, 'shot', None) or at('fire', note=False)
    tc = at('charge', note=False)
    rel = getattr(T, 'release', None) or (tf - 0.6 if tf is not None else None)
    if tc is not None and tf is not None and tf > tc:
        build(M, tc, tf, 0.9, seed=40, stop=rel, gain=-8.0)
    elif tf is not None:
        build(M, tf - 16, tf, 0.9, seed=40, stop=rel, gain=-8.0)
    # ---- 5. the silence of space: no music at all
    # ---- 6. the hit: one low brass note under the thud, a drum
    th = at('hit', note=False)
    if th is not None:
        M.add('m_low', th + 0.3, lambda: _place([(0, I('TubaSus').swell(38, 5.0, [(0, 0.75), (1.0, 0.6), (5, 0.25)], 70, release=2.5,
                                                                        attack=0.05)),
                                                (0.02, I('TromboneSus').swell(38, 4.5, [(0, 0.7), (1.0, 0.5), (4.5, 0.2)], 71, release=2.0,
                                                                              attack=0.05)),
                                                (0.0, I('ContrabassSusVB').swell(26, 5.0, [(0, 0.8), (5, 0.3)], 72, release=2.5, attack=0.05))]),
              dur=9, why='hit brass')
        M.add('m_perc', th, lambda: SM.kit('bass_drum').hit(0.95, 1), dur=5, why='hit drum')
        M.add('m_perc', th + 0.01, lambda: SM.kit('giant_drum').hit(0.9, 2), dur=5, why='hit drum')
    # ---- 6b. the orbital ship seen: a cold, low pedal, a few piano notes far apart
    r = run('orbit', 'orbit') or T.span('debris', note=False)
    rs = at('rings', note=False)
    if r:
        a, b = r[0], (rs if rs is not None and rs > r[0] else r[1])
        pedal(M, a + 1.0, b + 1.0, (26, 33), 0.26, seed=7)
        piano_sparse(M, a + 2.0, b, [57, 53, 50, 52], every=3, vel=0.26, seed=8)
    # ---- 7. the orbital ship rebuilds: the ostinato again, darker, the timpani
    r = run('rings', 'orb_charge') or run('orbit', 'orb_charge')
    to = at('orb_fire', note=False)
    if r:
        a, b = r
        b = min(b, to) if to is not None else b
        chords(M, a, b, ['Gm', 'Dm', 'Bb', 'A'], 2, 0.3, seed=31)
        ostinato(M, a + 2 * BAR, b, ['Gm', 'Dm', 'Bb', 'A'], 0.34, grow=0.6, seed=33, layers=('vc', 'cb'), rests=0.2)
        timp_pattern(M, a, b, 0.34, every=2)
        drums(M, a + 4 * BAR, b, 0.38, pattern='x.......', seed=34, grow=0.4)
    # ---- 8. its shot and the fall: the big build with the theme in the horns, cut with the foley before the strike
    ts = at('strike', note=False)
    stop = getattr(T, 'strike_hole', None) or (ts - 0.4 if ts is not None else None)
    if to is not None and ts is not None and ts > to:
        build(M, to, ts, 1.0, seed=80, stop=stop, theme_horns=True, gain=-6.0)
    # ---- 9. after the strike: silence, then the low chord under the water, the theme at the surface
    tu = getattr(T, 'lens_under', None) or at('underwater', note=False)
    tsu = getattr(T, 'lens_up', None) or at('surface', note=False)
    if tu is not None:
        e = tsu if tsu is not None and tsu > tu else tu + 20
        d = e - tu
        M.add('m_str', tu + 1.5, lambda d=d: _place([(0, I('ContrabassSusVB').swell(26, d, [(0, 0.15), (d * 0.5, 0.4), (d, 0.3)], 91, release=3.0, attack=3)),
                                                     (0, I('CelloEnsSusVib').swell(38, d, [(0, 0.15), (d * 0.5, 0.38), (d, 0.3)], 92, release=3.0, attack=3)),
                                                     (0, I('CelloEnsSusVib').swell(45, d, [(0, 0.12), (d * 0.5, 0.34), (d, 0.28)], 93, release=3.0, attack=3)),
                                                     (0, I('ViolaEnsSusVib').swell(53, d, [(0, 0.1), (d * 0.5, 0.3), (d, 0.26)], 94, release=3.0, attack=3))]),
              dur=d + 5, why='underwater chord')
    if tsu is not None:
        # the theme twice (the second an octave up, ending on the tonic), its last note landing ~5 s before the end
        L1 = theme_len()
        last_at = end - 5.5
        s2 = last_at - (L1 - THEME[-1][1] * BEAT)
        s1 = s2 - L1
        if s1 < tsu + 0.5:
            s1 = None
            s2 = max(tsu + 0.8, s2)
        if s1 is not None:
            theme(M, s1, 0.32)
        theme(M, s2, 0.3, octave=12 if s1 is not None else 0, seed=60, last=62, last_len=end - (s2 + L1 - THEME[-1][1] * BEAT) - 0.3)
        t0 = tsu + 1.0
        chords(M, t0, end - 0.3, ['Dm', 'Bb', 'F', 'C', 'Gm', 'Asus'], 2, 0.26, seed=95, final='Dm')
    log(f'  score: {sum(1 for e in M.ev if e["bus"].startswith("m_"))} music events')
