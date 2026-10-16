"""SCAN · RAILGUN: the soundtrack (music + foley), timed to the film's chapters and cues (606.3 s at the 2026-10-15
cut; the times come from the render's markers.json).

    python tools/sound_lab/soundtracks/pc_scan_railgun.py                       the whole mix -> reference/films/renders/pc_scan_railgun_sound/
    python tools/sound_lab/soundtracks/pc_scan_railgun.py --video <render.mp4>  ... and muxed onto that render (video stream-copied)
    python tools/sound_lab/soundtracks/pc_scan_railgun.py --from 470 --to 545   a part (for listening)

The music: a cinematic electronic score in D minor that follows the film's acts (the machinery, the gun, the round,
the heat sink and the charge, the shot, the scan, home), on a tempo map whose bar lines fall on the chapter changes.
One theme (D-E-F, F-D, C-A-C, E) is hinted at on the keys, carried by the low strings when the round is done and
played in full by the orchestra when the scan lands.

The foley: what each machine really sounds like (gas turbines lighting off, a reduction gear, reactor coolant pumps
and rod latches, boiling and steam, a turbine and a generator, switchgear, pumps and water, a cryocooler breathing
and frost cracking, magnets taking current, hydraulics, servos, laser machining, a rammer and clamps, the sea and
the hull from under the water), the railgun's report and its echoes off the sea, the lightning and its thunder.
No beeps: the on-screen tags stay silent, the music carries the rhythm.
"""
import argparse
import os
import subprocess
import sys
import time as _time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))

from sound_lab import dsp, foley as F, synth as Y  # noqa: E402
from sound_lab.dsp import SR, n_of  # noqa: E402
from sound_lab.foley import place, stereo_pan  # noqa: E402
from audio_analyzer.features import loudness  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
DUR = 606.3
TAIL = 6.0

# ---------------------------------------------------------------- the score as events


class Score:
    """Events (bus, time, fn, args, gain dB, pan) rendered later bus by bus (so ten minutes of thirty tracks never
    sit in memory at once)."""

    def __init__(self):
        self.ev = []

    def n(self, bus, t, fn, *args, db=0.0, pan=None, env=None, **kw):
        self.ev.append((bus, float(t), fn, args, kw, db, pan, env))

    def drop(self, buses, t0, t1, keep=None):
        """Remove the events of these buses that start in [t0, t1) (a variant replacing part of the score)."""
        self.ev = [e for e in self.ev if not (e[0] in buses and t0 <= e[1] < t1 and not (keep and keep(e)))]

    def render_bus(self, bus, n, t0=0.0, t1=None, log=None):
        buf = np.zeros((n, 2))
        k = 0
        for b, t, fn, args, kw, db, pan, env in self.ev:
            if b != bus:
                continue
            if t1 is not None and t > t1:
                continue
            if t < t0 - 30:
                continue
            x = fn(*args, **kw)
            x = np.asarray(x, np.float64)
            if x.ndim == 1:
                x = np.c_[x, x] if pan is None else stereo_pan(x, pan)
            elif pan is not None:
                a = (pan + 1) * np.pi / 4
                x = np.c_[x[:, 0] * np.cos(a) * 1.414, x[:, 1] * np.sin(a) * 1.414]
            if env is not None:
                e = F.curve(env, len(x))
                x = x * (10 ** (e / 20))[:, None]
            place(buf, x, n_of(t - t0), 10 ** (db / 20))
            k += 1
        if log:
            log(f'  {bus}: {k} events')
        return buf


class Seg:
    """A stretch of the tempo map: bars of 4 beats between t0 and t1."""

    def __init__(self, t0, t1, bars, beats=4):
        self.t0, self.t1, self.bars, self.beats = t0, t1, bars, beats
        self.bar = (t1 - t0) / bars
        self.beat = self.bar / beats

    def t(self, bar, beat=0.0):
        return self.t0 + bar * self.bar + beat * self.beat


TRES = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0]          # 3-3-2 3-3-2: the pulse's accents
VEL = {'X': 1.0, 'x': 0.78, 'o': 0.55, '-': 0.33}

# the theme (MIDI, beats): over Dm Bb F C Dm Bb F A, then the climb over Dm Bb F C Gm Bb A (-> D)
THEME_A = [(74, 2), (76, 1), (77, 1), (77, 3), (74, 1), (72, 2), (69, 1), (72, 1), (76, 4),
           (74, 2), (76, 1), (77, 1), (79, 3), (77, 1), (81, 2), (79, 1), (77, 1), (76, 2), (73, 2)]
THEME_B = [(81, 2), (77, 1), (81, 1), (82, 3), (81, 1), (81, 2), (79, 1), (77, 1), (79, 4),
           (82, 2), (81, 1), (79, 1), (77, 2), (74, 2), (76, 3), (73, 1)]
MOTIF = [(69, 2), (74, 1), (76, 1), (77, 4), (76, 2), (74, 1), (72, 1), (74, 4)]


def sustain(S, seg, chords, bars, inst, bus, lo, hi, vel, db=0.0, **kw):
    """One held chord per run of equal chords (no re-attack); vel may be a function of the bar."""
    bars = list(bars)
    i = 0
    while i < len(bars):
        j = i
        while j + 1 < len(bars) and chords[bars[j + 1]] == chords[bars[i]] and bars[j + 1] == bars[j] + 1:
            j += 1
        b0 = bars[i]
        dur = seg.bar * (bars[j] - b0 + 1)
        v = vel(b0) if callable(vel) else vel
        S.n(bus, seg.t(b0), inst, tuple(Y.voicing(chords[b0], lo, hi)), round(dur, 3), round(v, 2), db=db, **kw)
        i = j + 1


def pulse(S, seg, chords, bars, vel=0.8, cut=(500, 1400), db=0.0, lo=36, sixteenth=True, jump=True, accents=TRES):
    bars = list(bars)
    for k, b in enumerate(bars):
        root = Y.bass_note(chords[b], lo)
        c = cut[0] + (cut[1] - cut[0]) * k / max(1, len(bars) - 1)
        for i in range(16):
            if not sixteenth and i % 2:
                continue
            acc = accents[i]
            m = root + (12 if jump and not acc and i % 4 == 2 else 0)
            v = vel * (1.0 if acc else 0.55)
            d = seg.beat / 4 * (0.9 if sixteenth else 1.7)
            S.n('bass', seg.t(b, i / 4), Y.pulse_bass, m, round(d, 3), round(v, 2), float(round(c, -1)), db=db)


def drum(S, seg, bars, fn, pattern, db=0.0, bus='drums', pan=None):
    steps = len(pattern)
    for b in bars:
        for i, ch in enumerate(pattern):
            if ch in VEL:
                S.n(bus, seg.t(b, i * 4 / steps), fn, VEL[ch], db=db, pan=pan)


def melody(S, seg, bar0, notes, inst, bus, vel=0.8, db=0.0, octave=0, legato=1.0, beat0=0.0):
    t = seg.t(bar0, beat0)
    for m, b in notes:
        d = b * seg.beat
        if m is not None:
            v = vel(m) if callable(vel) else vel
            S.n(bus, t, inst, m + octave, round(d * legato, 3), v, db=db)
        t += d


def arp(S, seg, chords, bars, vel=0.6, bright=0.4, db=0.0, lo=50, shape=(0, 1, 2, 3, 4, 3, 2, 1), bright_to=None):
    bars = list(bars)
    for k, b in enumerate(bars):
        v3 = Y.voicing(chords[b], lo, lo + 12)
        tones = v3 + [m + 12 for m in v3]
        br = bright if bright_to is None else bright + (bright_to - bright) * k / max(1, len(bars) - 1)
        for i in range(16):
            m = tones[shape[i % len(shape)] % len(tones)]
            S.n('keys', seg.t(b, i / 4), Y.pluck, m, round(seg.beat / 4 * 0.9, 3), round(vel * (1.0 if i % 4 == 0 else 0.75), 2),
                round(br, 2), db=db)


# instrument shorthands (cached underneath)
def STR(a=0.35, r=0.9, bright=0.5, seed=0):
    return lambda notes, dur, vel: Y.strings(notes, dur, vel, seed, a, r, bright)


def STR1(a=0.08, r=0.45, bright=0.6, seed=0):
    return lambda m, dur, vel: Y.strings((m,), dur, vel, seed, a, r, bright)


def BRS(seed=0, octave=True):
    return lambda m, dur, vel: Y.brass(m, dur, vel, seed, octave)


def PAD(bright=0.4, seed=0, a=1.4, r=2.4):
    return lambda notes, dur, vel: Y.pad(notes, dur, vel, bright, seed, a, r)


def CHO(vowel='a', seed=0):
    return lambda notes, dur, vel: Y.choir(notes, dur, vel, vowel, seed)


def KICK(tight=0.5):
    return lambda v: Y.kick(v, tight)


def TAIKO(f=58.0, seed=0):
    return lambda v: Y.taiko(f, v, seed)


def TOM(f=110.0, seed=0):
    return lambda v: Y.tom(f, v, seed)


SNARE = lambda v: Y.snare(v)          # noqa: E731
HAT = lambda v: Y.hat(v * 0.8)        # noqa: E731
OHAT = lambda v: Y.hat(v * 0.7, True)  # noqa: E731
SHAKE = lambda v: Y.shaker(v)         # noqa: E731
TICK = lambda v: Y.tick(v)            # noqa: E731


def EP(m, dur, vel):
    return Y.epiano(m, dur, vel)


def SUBN(m, dur, vel):
    return Y.sub_bass(m, dur, vel)


def music(S):
    """The score, act by act."""
    # ---- 0-4 the ship on station: a pad breathes in over the sea; at 4.0 the X-ray opens (a soft low hit)
    S.n('pads', 0.0, Y.pad, tuple(Y.voicing('Dmadd9', 50, 66)), 5.0, 0.5, 0.25, 0, 3.0, 3.0, db=-2)
    S.n('fx', 4.0 - 2.5, Y.swell, 2.5, 0.35, db=-8)
    S.n('fx', 4.0, Y.sub_drop, 3.0, 0.7, 75, 36, db=-6)
    S.n('drums', 4.0, TAIKO(46), 0.7, db=-4)

    # ---- A1 4.0-51.0 machinery, main engines, reduction gear (19 bars, 97 BPM)
    A1 = Seg(4.0, 51.0, 19)
    ch = ['Dm'] * 4 + ['Dm', 'Dm', 'Bb', 'Bb', 'F', 'F', 'C', 'C'] + ['Dm', 'Bb', 'F', 'C', 'Gm', 'Gm', 'A']
    sustain(S, A1, ch, range(19), PAD(0.3), 'pads', 50, 66, lambda b: 0.45 + 0.02 * b, db=-3)
    melody(S, A1, 0, MOTIF, EP, 'keys', 0.55, db=-1)
    melody(S, A1, 0, MOTIF, EP, 'keys', 0.35, db=-6, octave=-12)
    pulse(S, A1, ch, range(4, 19), vel=0.6, cut=(320, 700), db=-4, sixteenth=False, jump=False)
    sustain(S, A1, ch, range(8, 19), STR(0.8, 1.2, 0.35), 'orch', 38, 50, 0.5, db=-4)
    drum(S, A1, range(12, 19), KICK(0.6), 'x.......o.......', db=-6)
    drum(S, A1, range(12, 19), SHAKE, '-o-o-o-o-o-o-o-o', db=-10, bus='perc')
    S.n('fx', A1.t(18), Y.swell, A1.bar, 0.5, db=-8)

    # ---- A2 51.0-108.8 reactor, steam generator, turbine, condenser, generator (23 bars, 95.5 BPM)
    A2 = Seg(51.0, 108.8, 23)
    ch = ['Dm', 'Dm', 'Bb', 'Bb', 'F', 'F', 'C', 'C', 'Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A', 'Dm', 'Bb', 'F', 'C', 'Gm', 'A', 'A']
    S.n('fx', 51.0, Y.hit, 0.55, 3, db=-8)
    sustain(S, A2, ch, range(23), PAD(0.35), 'pads', 50, 66, 0.5, db=-5)
    sustain(S, A2, ch, range(23), STR(0.6, 1.0, 0.45), 'orch', 50, 67, lambda b: 0.42 + 0.012 * b, db=-4)
    sustain(S, A2, ch, range(0, 23), STR(0.8, 1.2, 0.35, 3), 'orch', 38, 50, 0.5, db=-6)
    pulse(S, A2, ch, range(23), vel=0.7, cut=(420, 1300), db=-4)
    drum(S, A2, range(0, 8), KICK(0.6), 'x.......x.......', db=-5)
    drum(S, A2, range(8, 23), KICK(0.6), 'x.....o.x.......', db=-4)
    drum(S, A2, range(8, 23), HAT, '..o...o...o...o.', db=-8, bus='perc')
    drum(S, A2, range(11, 23), SHAKE, '-o-o-o-o-o-o-o-o', db=-9, bus='perc')
    sustain(S, A2, ch, range(4, 8), CHO('u'), 'pads', 57, 72, 0.5, db=-5)                       # critical: a choir breathes in
    S.n('fx', 61.4 - 3.0, Y.swell, 3.0, 0.4, db=-10)
    arp(S, A2, ch, range(11, 23), vel=0.5, bright=0.25, bright_to=0.55, db=-6)
    drum(S, A2, [15], TOM(100), '........x.x.xxxx', db=-6)
    drum(S, A2, [22], SNARE, 'o.o.o.o.x.x.xxxx', db=-10)
    S.n('fx', A2.t(21), Y.riser, A2.bar * 2, 0.5, db=-10)

    # ---- B1 108.8-165.6 power run, power room (24 bars, 101 BPM): it drives
    B1 = Seg(108.8, 165.6, 24)
    ch = ['Dm', 'Dm', 'C', 'C', 'Bb', 'Bb', 'C', 'C', 'Dm', 'Dm', 'C', 'C', 'Bb', 'Bb', 'A', 'A',
          'Gm', 'Gm', 'Dm', 'Dm', 'Bb', 'Bb', 'A', 'A']
    S.n('fx', 108.8, Y.hit, 0.8, 4, db=-6)
    S.n('fx', 108.8, Y.cymbal, 0.6, 3.0, db=-12)
    pulse(S, B1, ch, range(24), vel=0.8, cut=(900, 1900), db=-3)
    sustain(S, B1, ch, range(24), PAD(0.4), 'pads', 50, 66, 0.5, db=-7)
    sustain(S, B1, ch, range(0, 24), STR(0.4, 0.9, 0.55), 'orch', 55, 72, lambda b: 0.5 + 0.01 * b, db=-4)
    sustain(S, B1, ch, range(0, 24), STR(0.5, 1.0, 0.4, 5), 'orch', 38, 50, 0.6, db=-5)
    drum(S, B1, range(0, 20), KICK(0.5), 'x.....x...x.....', db=-3)
    drum(S, B1, range(2, 20), SNARE, '....x.......x...', db=-8)
    drum(S, B1, range(0, 24), HAT, 'o-x-o-x-o-x-o-x-', db=-9, bus='perc')
    drum(S, B1, [7, 15], TOM(95), '........x.x.x.xx', db=-5)
    for b in range(8, 18, 2):
        S.n('orch', B1.t(b), Y.brass, Y.bass_note(ch[b], 38), round(B1.bar * 0.9, 3), 0.65, 0, True, db=-9)
    drum(S, B1, range(20, 24), KICK(0.5), 'x.......x.......', db=-5)
    arp(S, B1, ch, range(8, 20), vel=0.5, bright=0.35, bright_to=0.6, db=-7, lo=62, shape=(0, 2, 1, 3, 2, 4, 3, 5))
    S.n('fx', 151.0 - 2.0, Y.swell, 2.0, 0.5, db=-8)                                              # the rotors' spin-up
    S.n('fx', 151.0, Y.sub_drop, 3.4, 0.7, 60, 36, db=-8)
    S.n('fx', B1.t(22), Y.riser, B1.bar * 2, 0.4, db=-12)

    # ---- B2 165.6-203.9 coolant, cryo (16 bars, 100 BPM): the breakdown, cold and clear
    B2 = Seg(165.6, 203.9, 16)
    ch = ['Bbmaj7', 'Bbmaj7', 'F/A', 'F/A', 'Gm9', 'Gm9', 'Dm9', 'Dm9', 'Bbmaj7', 'Bbmaj7', 'F/A', 'F/A', 'Gm9', 'Gm9', 'Asus4', 'A']
    S.n('fx', 165.6, Y.cymbal, 0.4, 3.0, db=-16)
    sustain(S, B2, ch, range(16), PAD(0.22, 2, 2.0, 3.0), 'pads', 52, 70, 0.6, db=-3)
    sustain(S, B2, ch, range(6, 16), CHO('o', 2), 'pads', 60, 76, 0.5, db=-6)
    for b in range(16):
        S.n('bass', B2.t(b), SUBN, Y.bass_note(ch[b], 26), round(B2.bar * 0.95, 3), 0.55, db=-6)
    for b in range(6, 16):                                                                             # ice: a glass bell, sparse
        v3 = Y.voicing(ch[b], 74, 88)
        for i, k in enumerate((0, 2, 1, 3, 2, 0)):
            if (b + i) % 3 == 2:
                continue
            S.n('keys', B2.t(b, i * 0.66), Y.bell, (v3 + [v3[0] + 12])[k], 0.3, 0.45, db=-9, pan=(-0.5 if i % 2 else 0.5))
    drum(S, B2, range(12, 16), KICK(0.7), 'x...............', db=-8)
    S.n('fx', B2.t(14), Y.riser, B2.bar * 2, 0.45, db=-12)

    # ---- B3 203.9-234.9 coils (13 bars, 100.6 BPM): the build
    B3 = Seg(203.9, 234.9, 13)
    ch = ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A', 'Dm', 'Bb', 'Gm', 'A', 'A']
    S.n('fx', 203.9, Y.hit, 0.6, 5, db=-9)
    pulse(S, B3, ch, range(13), vel=0.8, cut=(800, 2000), db=-3)
    for k, b in enumerate(range(13)):                                                                # spiccato ostinato
        v3 = Y.voicing(ch[b], 62, 74)
        seq = [v3[0], v3[1], v3[2], v3[1]] * 4
        for i in range(16):
            S.n('orch', B3.t(b, i / 4), Y.spiccato, seq[i], round(B3.beat / 4 * 0.8, 3), round(0.45 + 0.035 * k, 2), i % 7, db=-5)
    sustain(S, B3, ch, range(13), STR(0.5, 0.9, 0.5, 7), 'orch', 38, 50, lambda b: 0.55 + 0.03 * b, db=-4)
    sustain(S, B3, ch, range(8, 13), CHO('a', 3), 'pads', 60, 76, 0.6, db=-4)
    for b in range(8, 13):
        S.n('orch', B3.t(b), Y.brass, Y.bass_note(ch[b], 38), round(B3.bar * 0.95, 3), round(0.55 + 0.08 * (b - 8), 2), 1, True, db=-8)
    drum(S, B3, range(0, 6), TOM(90), 'x.o.x.o.x.o.x.o.', db=-7)
    drum(S, B3, range(6, 13), TOM(90), 'xoooxoooxoooxooo', db=-6)
    drum(S, B3, range(6, 13), TOM(140), '..o...o...o...xo', db=-8)
    drum(S, B3, range(0, 13), KICK(0.5), 'x.......x.......', db=-4)
    drum(S, B3, range(9, 13), SNARE, '....x.......x...', db=-8)
    S.n('fx', B3.t(11), Y.riser, B3.bar * 2, 0.6, db=-9)
    S.n('fx', 234.9 - 2.0, Y.swell, 2.0, 0.6, db=-8)

    # ---- B4a 234.9-249.9 hydraulics (6 bars, 96 BPM): heavy, half time
    B4a = Seg(234.9, 249.9, 6)
    ch = ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm']
    S.n('fx', 234.9, Y.hit, 1.0, 6, db=-4)
    S.n('fx', 234.9, Y.braam, (26, 38, 45), 3.5, 0.9, db=-8)
    S.n('fx', 234.9, Y.cymbal, 0.7, 3.0, db=-10)
    pulse(S, B4a, ch, range(6), vel=0.85, cut=(700, 1200), db=-3, sixteenth=False)
    drum(S, B4a, range(6), KICK(0.4), 'x.....x...x.....', db=-3)
    drum(S, B4a, range(6), SNARE, '........x.......', db=-6)
    drum(S, B4a, range(6), TAIKO(58), 'x.........o.....', db=-5)
    drum(S, B4a, range(6), HAT, 'x.x.x.x.x.x.x.x.', db=-11, bus='perc')
    for b in range(6):
        S.n('orch', B4a.t(b), Y.brass, Y.bass_note(ch[b], 38), round(B4a.beat * 1.5, 3), 0.8, 2, True, db=-7)
    sustain(S, B4a, ch, range(6), STR(0.3, 0.8, 0.5, 9), 'orch', 50, 66, 0.6, db=-5)

    # ---- B4b 249.9-269.7 sensors (8 bars, 97 BPM): tension (D Phrygian), the locks as stingers
    B4b = Seg(249.9, 269.7, 8)
    ch = ['Dm', 'Eb', 'Dm', 'Eb', 'Dm', 'Eb', 'C', 'A']
    sustain(S, B4b, ch, range(8), PAD(0.3, 4), 'pads', 50, 66, 0.55, db=-4)
    pulse(S, B4b, ch, range(8), vel=0.55, cut=(400, 900), db=-5)
    drum(S, B4b, range(8), TICK, 'o-x-o-x-o-x-o-x-', db=-12, bus='perc')
    drum(S, B4b, range(8), KICK(0.7), 'x...............', db=-7)
    for b in range(8):                                                                              # tremolo strings, high
        S.n('orch', B4b.t(b), STR(0.25, 0.6, 0.4, 11), tuple(Y.voicing(ch[b], 62, 77)), round(B4b.bar, 3), 0.4, db=-8)
    for t in (252.3, 261.7):                                                                         # director lock, radar lock
        S.n('fx', t, Y.hit, 0.45, 7, db=-10)
        S.n('orch', t, Y.brass, 50, 0.6, 0.7, 3, True, db=-9)
    S.n('fx', B4b.t(6), Y.riser, B4b.bar * 2, 0.6, db=-9)
    drum(S, B4b, [7], SNARE, 'o.o.o.o.x.x.xxxx', db=-8)

    # ---- B4c 269.7-282.3 lay (5 bars, 95 BPM): the gun rises: the hook on the brass
    B4c = Seg(269.7, 282.3, 5)
    ch = ['Bb', 'C', 'Dm', 'Dm', 'A']
    S.n('fx', 269.7, Y.hit, 1.0, 8, db=-3)
    S.n('fx', 269.7, Y.cymbal, 0.8, 3.0, db=-9)
    sustain(S, B4c, ch, range(5), STR(0.2, 1.2, 0.6, 13), 'orch', 55, 74, 0.75, db=-3)
    sustain(S, B4c, ch, range(5), CHO('a', 4), 'pads', 57, 76, 0.65, db=-4)
    pulse(S, B4c, ch, range(4), vel=0.9, cut=(1100, 1800), db=-3)
    melody(S, B4c, 0, [(62, 2), (64, 1), (65, 1), (67, 2), (64, 2), (62, 4), (62, 4)], BRS(4), 'orch', 0.85, db=-6)
    drum(S, B4c, range(4), KICK(0.4), 'x.....x...x.....', db=-3)
    drum(S, B4c, range(4), SNARE, '....x.......x...', db=-6)
    drum(S, B4c, range(4), TAIKO(62), 'x..x..x.x..x..x.', db=-6)
    drum(S, B4c, range(4), TAIKO(90, 1), '..o..o....o..o.o', db=-9)
    S.n('fx', B4c.t(4), Y.braam, (33, 45, 52), 3.5, 0.7, db=-10)

    # ---- C1 282.3-288.1 down to the magazine (free): a held chord, the clock starts
    S.n('pads', 282.3, Y.pad, tuple(Y.voicing('Dm', 50, 66)), 6.2, 0.5, 0.3, 5, 0.6, 2.0, db=-4)
    S.n('bass', 282.3, SUBN, 38, 5.6, 0.5, db=-8)

    # ---- C2 288.1-372.3 fabrication, circuit, lattice, armature, charge, tolerance (35 bars, 99.8 BPM): clockwork
    C2 = Seg(288.1, 372.3, 35)
    ch = (['Dmadd9', 'Dmadd9', 'Bbadd9', 'Bbadd9', 'F', 'F', 'C', 'C'] + ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A'] +
          ['Dm', 'Dm', 'Bb', 'Bb', 'F', 'F', 'C', 'C'] + ['Gm', 'Gm', 'A', 'A'] + ['Dm', 'Bb', 'Gm', 'A', 'A'] + ['Dm', 'Dm'])
    arp(S, C2, ch, range(0, 33), vel=0.55, bright=0.3, bright_to=0.65, db=-5)
    drum(S, C2, range(0, 33), TICK, 'x-o-x-o-x-o-x-o-', db=-11, bus='perc')
    drum(S, C2, range(33, 35), TICK, 'x...o...x...o...', db=-13, bus='perc')
    sustain(S, C2, ch, range(0, 35), PAD(0.3, 6), 'pads', 50, 66, 0.45, db=-7)
    pulse(S, C2, ch, range(4, 33), vel=0.6, cut=(500, 1300), db=-5, sixteenth=False)
    drum(S, C2, range(7, 28), KICK(0.6), 'x.......x.......', db=-5)
    drum(S, C2, range(8, 28), SNARE, '....o.......o...', db=-12)
    drum(S, C2, range(16, 28), HAT, '..o...o...o...o.', db=-9, bus='perc')
    melody(S, C2, 8, MOTIF + MOTIF[:4] + [(76, 4), (73, 4)], EP, 'keys', 0.6, db=-3)                   # circuit: the motif on the keys
    sustain(S, C2, ch, range(16, 28), STR(0.6, 1.0, 0.45, 15), 'orch', 55, 72, 0.5, db=-6)
    # charge (bars 28-32): it builds
    drum(S, C2, range(28, 33), KICK(0.5), 'x.....x.x.....x.', db=-4)
    drum(S, C2, range(28, 33), SNARE, '....x.......x...', db=-8)
    drum(S, C2, range(30, 33), TOM(100), 'x.x.x.x.x.x.xxxx', db=-8)
    sustain(S, C2, ch, range(28, 33), STR(0.3, 0.8, 0.55, 17), 'orch', 55, 74, lambda b: 0.55 + 0.06 * (b - 28), db=-4)
    sustain(S, C2, ch, range(28, 33), STR(0.3, 0.8, 0.45, 19), 'orch', 38, 50, 0.6, db=-5)
    S.n('fx', C2.t(31), Y.riser, C2.bar * 2, 0.6, db=-9)
    S.n('fx', 355.5, Y.sub_drop, 3.0, 0.6, 70, 36, db=-10)

    # ---- C3 372.3-413.9 round, load (17 bars, 98 BPM): the theme on the low strings; the load, heavy
    C3 = Seg(372.3, 413.9, 17)
    ch = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'F', 'A', 'Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A', 'A']
    S.n('fx', 372.3, Y.hit, 0.6, 9, db=-9)
    melody(S, C3, 0, THEME_A, STR1(0.1, 0.5, 0.45, 21), 'orch', 0.7, db=-3, octave=-12)
    melody(S, C3, 0, THEME_A, STR1(0.1, 0.5, 0.4, 22), 'orch', 0.5, db=-7, octave=-24)
    sustain(S, C3, ch, range(8), PAD(0.35, 7), 'pads', 50, 66, 0.5, db=-6)
    drum(S, C3, range(0, 8), TAIKO(52), 'x.......o.......', db=-6)
    drum(S, C3, range(0, 8), KICK(0.6), 'x.......x.......', db=-6)
    pulse(S, C3, ch, range(8, 17), vel=0.85, cut=(800, 1700), db=-3)
    drum(S, C3, range(8, 16), TAIKO(58), 'x..x..x.x..x..x.', db=-5)
    drum(S, C3, range(8, 16), KICK(0.4), 'x.......x.......', db=-4)
    drum(S, C3, range(8, 16), SNARE, '........x.......', db=-7)
    sustain(S, C3, ch, range(8, 17), STR(0.4, 0.9, 0.5, 23), 'orch', 50, 69, lambda b: 0.5 + 0.03 * (b - 8), db=-4)
    for b in range(8, 16, 2):
        S.n('orch', C3.t(b), Y.brass, Y.bass_note(ch[b], 38), round(C3.bar * 1.8, 3), 0.7, 5, True, db=-8)
    S.n('fx', 404.1, Y.hit, 0.9, 10, db=-6)                                                           # the rammer seats the round
    drum(S, C3, [16], SNARE, 'o.o.o.o.x.x.xxxx', db=-8)
    drum(S, C3, [16], TOM(90), '........x.x.xxxx', db=-6)
    S.n('fx', C3.t(15), Y.riser, C3.bar * 2, 0.6, db=-10)

    # ---- D1 413.9-468.5 heat sink (22 bars, 96.7 BPM): ominous; under the water from 421.85 to 463.35 (muffled)
    D1 = Seg(413.9, 468.5, 22)
    ch = ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A', 'Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'Eb', 'Eb',
          'Dm', 'Dm', 'Bb', 'C', 'A', 'A']
    S.n('fx', 413.9, Y.hit, 0.8, 11, db=-6)
    sustain(S, D1, ch, range(22), PAD(0.3, 8), 'pads', 50, 66, 0.55, db=-5)
    sustain(S, D1, ch, range(22), STR(0.7, 1.2, 0.4, 25), 'orch', 38, 52, 0.6, db=-5)
    pulse(S, D1, ch, range(22), vel=0.75, cut=(500, 1100), db=-4)
    drum(S, D1, range(0, 10), TAIKO(52), 'x.....x...o.....', db=-5)
    drum(S, D1, range(10, 20), TAIKO(52), 'x..x..x.x..x..o.', db=-5)
    drum(S, D1, range(10, 20), TAIKO(80, 2), '....o.......o..o', db=-8)
    drum(S, D1, range(0, 20), KICK(0.5), 'x.......x.......', db=-5)
    sustain(S, D1, ch, range(10, 20), CHO('u', 5), 'pads', 50, 64, 0.55, db=-4)
    for b in range(10, 20, 2):
        S.n('orch', D1.t(b), Y.brass, Y.bass_note(ch[b], 38), round(D1.bar * 1.9, 3), 0.6, 6, True, db=-8)
    drum(S, D1, range(20, 22), KICK(0.4), 'x.....x.x.....x.', db=-3)
    drum(S, D1, range(20, 22), SNARE, '....x.......x...', db=-7)
    drum(S, D1, range(20, 22), HAT, 'x-x-x-x-x-x-x-x-', db=-10, bus='perc')
    sustain(S, D1, ch, range(20, 22), STR(0.3, 0.8, 0.6, 27), 'orch', 57, 74, 0.7, db=-4)

    # ---- D2 468.5-480.19 the rails charge (5 bars, 102.7 BPM): everything climbs, then silence
    D2 = Seg(468.5, 480.19, 5)
    S.n('fx', 468.5, Y.hit, 0.7, 12, db=-7)
    for b, (c, v) in enumerate([('A', .6), ('A', .7), ('Bb', .8), ('C', .9), ('A', 1.0)]):
        S.n('orch', D2.t(b), STR(0.2, 0.3, 0.5 + 0.1 * b, 29), tuple(Y.voicing(c, 57 + 2 * b, 76 + 2 * b)), round(D2.bar, 3), v, db=-4)
        S.n('orch', D2.t(b), Y.brass, Y.bass_note(c, 38), round(D2.bar * 0.98, 3), v, 7, True, db=-6)
        S.n('pads', D2.t(b), CHO('a', 6), tuple(Y.voicing(c, 60 + b, 79 + b)), round(D2.bar, 3), v * 0.8, db=-5)
    pulse(S, D2, ['A', 'A', 'Bb', 'C', 'A'], range(5), vel=0.9, cut=(900, 2400), db=-3)
    drum(S, D2, [0, 1], SNARE, 'o...o...o...o...', db=-9)
    drum(S, D2, [2, 3], SNARE, 'o.o.o.o.o.o.o.o.', db=-8)
    drum(S, D2, [4], SNARE, 'oooooooooooooooo', db=-6)
    drum(S, D2, range(5), KICK(0.4), 'x...x...x...x...', db=-4)
    drum(S, D2, [3, 4], TOM(85), 'x.x.x.x.xxxxxxxx', db=-6)
    S.n('fx', 468.5, Y.riser, 479.8 - 468.5, 0.9, db=-6)
    S.n('fx', 479.8 - 3.0, Y.swell, 3.0, 0.8, db=-6)

    # ---- E1 481.5-490.55 the shot and the flight (4 bars, 106 BPM): the theme breaks out
    E1 = Seg(481.5, 490.55, 4)
    ch = ['Dm', 'Bb', 'F', 'C']
    S.n('fx', 481.5, Y.hit, 1.0, 13, db=-2)
    S.n('fx', 481.5, Y.braam, (26, 38, 45, 50), 4.0, 1.0, db=-6)
    S.n('fx', 481.5, Y.cymbal, 1.0, 3.0, db=-6)
    melody(S, E1, 0, THEME_A[:9], STR1(0.05, 0.6, 0.65, 31), 'orch', 0.85, db=-2)
    melody(S, E1, 0, THEME_A[:9], STR1(0.05, 0.6, 0.6, 32), 'orch', 0.75, db=-4, octave=-12)
    melody(S, E1, 0, THEME_A[:9], BRS(8), 'orch', 0.8, db=-7, octave=-24)
    sustain(S, E1, ch, range(4), CHO('a', 7), 'pads', 57, 76, 0.75, db=-4)
    sustain(S, E1, ch, range(4), STR(0.2, 0.8, 0.55, 33), 'orch', 38, 52, 0.75, db=-4)
    pulse(S, E1, ch, range(4), vel=1.0, cut=(1300, 2200), db=-2)
    drum(S, E1, range(4), TAIKO(55), 'x..x..x.x..x..x.', db=-3)
    drum(S, E1, range(4), TAIKO(85, 3), '..o..o.o..o..ooo', db=-7)
    drum(S, E1, range(4), KICK(0.4), 'x.......x.......', db=-3)
    drum(S, E1, range(4), SNARE, '........x.......', db=-5)
    S.n('fx', 490.55 - 0.05, Y.cymbal, 0.6, 3.0, db=-12)

    # ---- E2 490.55-498.18 the burst, in slow motion: time stands still
    S.n('orch', 490.55, STR(0.5, 3.0, 0.4, 35), tuple(Y.voicing('Gm9', 55, 74)), 7.6, 0.7, db=-4)
    S.n('pads', 490.55, CHO('o', 8), tuple(Y.voicing('Gm9', 55, 74)), 7.6, 0.65, db=-4)
    S.n('bass', 490.55, SUBN, 31, 7.4, 0.7, db=-6)
    for t in (490.6, 491.85, 493.1, 494.35, 495.6, 496.85):                                           # the heart, slowed
        S.n('drums', t, TAIKO(44, 4), 0.6, db=-6)
    S.n('fx', 498.18 - 2.2, Y.swell, 2.2, 0.8, db=-6)
    S.n('fx', 496.0, Y.riser, 2.18, 0.7, db=-8)

    # ---- E3 498.18-505.38 the strike: the leader comes down, the drums gather, the bolt lands
    S.n('fx', 498.38, Y.hit, 0.9, 14, db=-4)
    S.n('orch', 498.38, STR(0.05, 1.0, 0.6, 37), tuple(Y.voicing('Bb', 58, 77)), 5.5, 0.8, db=-4)
    S.n('orch', 498.38, Y.brass, 46, 5.4, 0.85, 9, True, db=-6)
    for i, t in enumerate(np.linspace(499.3, 503.7, 22) ** 1):
        k = i / 21
        S.n('drums', 499.3 + 4.4 * (1 - (1 - k) ** 1.8), TOM(80 + 50 * k, i % 3), round(0.45 + 0.5 * k, 2), db=-6)
    S.n('fx', 499.5, Y.riser, 503.88 - 499.5, 0.8, db=-6)
    S.n('fx', 503.88, Y.hit, 1.0, 15, db=-2)
    S.n('fx', 503.88, Y.braam, (26, 38, 45), 3.0, 1.0, db=-6)

    # ---- E4 505.38-539.13 the scan (15 bars, 106.7 BPM; the scan's pulses on bars 2, 6, 10, 14): the theme in full
    E4 = Seg(505.38, 539.13, 15)
    ch = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'F', 'A', 'Dm', 'Bb', 'F', 'C', 'Gm', 'Bb', 'A']
    melody(S, E4, 0, THEME_A + THEME_B, STR1(0.06, 0.6, 0.7, 41), 'orch', lambda m: 0.8 if m < 80 else 0.9, db=-2)
    melody(S, E4, 0, THEME_A + THEME_B, STR1(0.06, 0.6, 0.6, 42), 'orch', 0.75, db=-4, octave=-12)
    melody(S, E4, 0, THEME_A + THEME_B, BRS(10), 'orch', 0.85, db=-6, octave=-24)
    S.ev.append(('keys', E4.t(8), Y.lead_phrase, (THEME_B, E4.beat, 0.7, 43, 0.55), {}, -9, None, None))
    sustain(S, E4, ch, range(15), CHO('a', 9), 'pads', 57, 76, 0.75, db=-4)
    sustain(S, E4, ch, range(15), STR(0.2, 0.8, 0.55, 44), 'orch', 38, 52, 0.75, db=-4)
    sustain(S, E4, ch, range(15), PAD(0.5, 10), 'pads', 50, 66, 0.55, db=-8)
    pulse(S, E4, ch, range(15), vel=1.0, cut=(1300, 2300), db=-2)
    drum(S, E4, range(15), TAIKO(55), 'x..x..x.x..x..x.', db=-3)
    drum(S, E4, range(8, 15), TAIKO(85, 5), 'o.o.o.o.o.o.o.oo', db=-7)
    drum(S, E4, range(15), KICK(0.4), 'x.......x.x.....', db=-3)
    drum(S, E4, range(15), SNARE, '........x.......', db=-5)
    drum(S, E4, range(15), HAT, 'x-o-x-o-x-o-x-o-', db=-11, bus='perc')
    for b in (0, 4, 8, 12):
        S.n('fx', E4.t(b), Y.cymbal, 0.8, 3.0, db=-9)
    for b in (2, 6, 10, 14):                                                                         # the scan pulses
        S.n('fx', E4.t(b), Y.hit, 0.7, 16 + b, db=-8)
    S.n('fx', E4.t(13), Y.riser, E4.bar * 2, 0.6, db=-10)
    drum(S, E4, [14], TOM(95), 'x.x.x.x.xxxxxxxx', db=-6)

    # ---- F 539.13-606.3 home (27 bars, 96.5 BPM): the theme on the keys, the strings resolve, the sea
    Fs = Seg(539.13, 606.3, 27)
    ch = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'F', 'A', 'Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A',
          'Dm', 'Dm', 'Bb', 'Bb', 'F', 'F', 'C', 'C', 'Dmadd9', 'Dmadd9', 'Dmadd9']
    S.n('fx', 539.13, Y.cymbal, 0.8, 3.0, db=-8)
    S.n('fx', 539.13, Y.hit, 0.7, 30, db=-8)
    sustain(S, Fs, ch, range(27), PAD(0.32, 11, 1.6, 4.0), 'pads', 50, 66, 0.5, db=-5)
    sustain(S, Fs, ch, range(0, 9), STR(0.6, 2.0, 0.45, 45), 'orch', 55, 72, lambda b: 0.65 - 0.03 * b, db=-4)
    sustain(S, Fs, ch, range(0, 24), STR(0.8, 2.0, 0.35, 46), 'orch', 38, 52, 0.5, db=-6)
    melody(S, Fs, 0, THEME_A, EP, 'keys', 0.65, db=-2)
    melody(S, Fs, 0, THEME_A, EP, 'keys', 0.4, db=-8, octave=-12)
    pulse(S, Fs, ch, range(0, 8), vel=0.6, cut=(900, 400), db=-5, sixteenth=False)
    drum(S, Fs, range(0, 4), KICK(0.6), 'x.......x.......', db=-6)
    sustain(S, Fs, ch, range(9, 24), CHO('u', 10), 'pads', 50, 66, 0.45, db=-6)
    pulse(S, Fs, ch, range(9, 24), vel=0.5, cut=(350, 600), db=-7, sixteenth=False, jump=False)
    S.n('orch', 561.7, Y.brass, 38, 4.0, 0.55, 11, True, db=-10)                                      # the stow
    if FIRE is not None:
        FIRE.music(S)
    melody(S, Fs, 22, MOTIF, EP, 'keys', 0.5, db=-3)                                                # (its last D rings out by the end)
    S.n('bass', Fs.t(22), SUBN, 26, 9.0, 0.5, db=-8)


# ---------------------------------------------------------------- foley


def foley(S):
    """Every sound the picture makes. Buses: engine / room (below decks), deck (outside), sky (the shot, the
    lightning), water (under the hull), beds (ambiences)."""
    E = lambda bus, t, x, db=0.0, pan=None, env=None: S.n(bus, t, lambda: x, db=db, pan=pan, env=env)  # noqa: E731
    W = lambda t, d, peak_at=None, db=-10, bus='deck', seed=0, heavy=0.5, bright=0.35, pan=(-0.4, 0.4): E(  # noqa: E731
        bus, t, F.whoosh(d, peak_at or d * 0.6, bright, heavy, seed, pan), db)

    # ---- the X-ray opens below decks
    W(2.6, 2.2, 1.4, -12, seed=1)

    # ---- main engines: LM2500 1B cranks at 16.0 and lights at 30.3; 1A, 2A, 2B crank and light at 36-37
    E('engine', 16.0, F.gas_turbine(96.0, 0.0, 14.3, 19.0, seed=2), -8,
      env=[(0, 0), (20, 0), (24, -4), (36, -8), (60, -13), (90, -16), (96, -60)])
    for k, (tc, tl) in enumerate(((36.0, 36.5), (36.4, 36.9), (36.8, 37.3))):
        E('engine', tc, F.gas_turbine(72.0, 0.0, tl - tc, tl - tc + 3.0, seed=3 + k, roar=0.8), -15,
          pan=(-0.6, 0.6, 0.0)[k], env=[(0, 0), (8, -2), (30, -8), (66, -14), (72, -60)])
    # reduction gear: the train drawn apart and back, seated; the clutches in; the shafts turn
    W(40.0, 2.0, 0.8, -15, 'engine', 4, 0.3, 0.3)
    W(44.0, 1.6, 1.2, -15, 'engine', 5, 0.3, 0.3, (0.4, -0.4))
    E('engine', 45.75, F.clank(2.4, 6), -6)
    E('engine', 48.0, F.latch(2.0, 7), -4)
    E('engine', 48.4, F.clank(2.8, 8, 0.5), -5)
    E('engine', 49.2, F.gears(22.0, [(0, 0), (4.5, 1), (22, 1)], 35, 34, seed=9), -12,
      env=[(0, 0), (12, -2), (18, -10), (22, -60)])
    # reactor: the coolant pumps start, the rod latches step out, critical, the power rising
    E('engine', 54.0, F.rotor(24.0, 3.0, 20.0, seed=10, roar=0.6), -11, env=[(0, 0), (14, -3), (22, -14), (24, -60)])
    E('engine', 55.0, F.water(22.0, [(0, 0), (3, 1), (22, 1)], 1.4, seed=11), -16, env=[(0, -60), (2, 0), (19, -4), (22, -60)])
    for g, t0 in enumerate((58.2, 60.0, 61.6)):
        for k in range(8):
            E('engine', t0 + k * 0.19, F.latch(0.9, 20 + 8 * g + k, gap=0.012, ring=0.2), -13 + (k % 2) * -2, pan=0.15 * (g - 1))
    E('engine', 61.4, F.energize(2.2, 40, hold=6.0), -14)
    # steam generator: boiling, the steam; separators
    E('engine', 65.4, F.boil(16.0, [(0, 0), (3, 0.7), (8, 1.1), (16, 1.1)], 41), -14, env=[(0, -60), (1.5, 0), (11, 0), (16, -60)])
    E('engine', 68.4, F.steam(14.0, [(0, 0), (1.5, 0.8), (14, 1)], 42, bright=0.3), -17, env=[(0, -60), (1, 0), (10, -2), (14, -60)])
    # steam turbine: admission and spin-up to 3 600 rpm; condenser seawater; the generator's field and hum
    E('engine', 79.4, F.rotor(24.0, 4.0, 60.0, seed=43), -11, env=[(0, 0), (14, 0), (20, -8), (24, -60)])
    E('engine', 79.0, F.steam(22.0, [(0, 0), (1.0, 1), (22, 1)], 44, bright=0.25), -15, env=[(0, -60), (1, 0), (16, -4), (22, -60)])
    E('engine', 94.0, F.water(12.0, [(0, 0), (2, 1), (12, 1)], 2.0, seed=45), -12, env=[(0, -60), (1.5, 0), (9, -2), (12, -60)])
    E('engine', 101.2, F.energize(1.6, 46, hold=5.0), -12)
    E('engine', 101.2, F.rotor(12.0, 0.1, 60.0, seed=47, roar=0.8), -16, env=[(0, -60), (1, 0), (8, -6), (12, -60)])
    # power run: the feeder breakers rack in and close; the current runs forward; the power room's contactors
    E('room', 110.6, F.motor(1.4, F.moves(1.4, [(0, 1.3, 1)]), 140, seed=48), -12)
    E('room', 111.9, F.clank(1.6, 49), -8)
    E('room', 112.8, F.breaker(50), -3, pan=-0.2)
    E('room', 112.92, F.breaker(51), -5, pan=0.25)
    E('room', 114.8, F.energize(1.0, 52, hold=4.5), -16, pan=-0.5)
    W(114.6, 6.2, 4.0, -16, 'room', 53, 0.7, 0.2, (-0.7, 0.7))
    E('room', 120.58, F.breaker(54), -6)
    E('room', 120.6, F.energize(1.3, 55, hold=2.0), -12)

    # ---- the power room: valves, the coolant pumps, alternator 3 apart and back, the spin-up, the racks
    E('room', 126.8, F.motor(1.4, F.moves(1.4, [(0, 1.3, 1)]), 120, seed=56, gear=6.1), -12)
    E('room', 128.1, F.latch(1.0, 57), -10)
    E('room', 128.6, F.rotor(3.0, 1.6, 25.0, seed=58, roar=0.7), -11)
    E('room', 128.8, F.water(38.0, [(0, 0), (2, 1), (38, 1)], 1.2, seed=59), -15, env=[(0, -60), (2, 0), (34, -3), (38, -60)])
    E('room', 139.9, F.latch(1.2, 60), -9)
    for k, (t, d) in enumerate(((140.0, .8), (140.6, 1.4), (141.8, 2.0), (143.9, 3.0), (147.0, 1.6), (148.4, 1.4))):
        E('room', t, F.motor(d + 0.2, F.moves(d + 0.2, [(0.05, d, 1)]), 95 + 15 * (k % 3), seed=61 + k, gear=5.3, hum=0.08), -11)
        E('room', t, F.hydraulic(d + 0.4, [(0, 0), (0.3, 0.7), (d, 0.7), (d + 0.4, 0)], 140, seed=70 + k, pump=0.0, creak=0.4), -18)
    E('room', 149.8, F.clank(3.0, 76, 0.45), -4)
    E('room', 150.3, F.latch(1.6, 77), -7)
    E('room', 151.0, F.rotor(16.0, 3.4, 55.0, seed=78, roar=1.2), -5, env=[(0, 0), (4, 0), (10, -5), (14.6, -10), (16, -60)])
    for k, t in enumerate((157.6, 159.45, 161.3, 163.15)):
        E('room', t, F.breaker(80 + k), -9, pan=(-0.5, -0.17, 0.17, 0.5)[k])
    for k in range(10):
        E('room', 157.9 + 0.74 * k, F.latch(0.45, 90 + k, gap=0.008, ring=0.12), -18, pan=-0.6 + 0.13 * k)
    E('room', 155.4, F.energize(0.8, 100, hold=8.0), -18)

    # ---- coolant up the power column
    E('room', 166.0, F.motor(1.1, F.moves(1.1, [(0, 1.0, 1)]), 110, seed=101, gear=6.1), -12)
    E('room', 166.2, F.fill(7.6, 102), -9)
    E('room', 170.6, F.latch(1.1, 103), -10)
    E('deck', 172.0, F.water(10.0, [(0, 0.6), (10, 0.4)], 1.0, seed=104), -18, env=[(0, -60), (1, 0), (8, -3), (10, -60)])

    # ---- cryo (x240): the compressors' hum, the cold heads breathing, frost growing, each station reaching 20 K
    E('deck', 181.1, F.cryo_pulse(22.5, 1.3, 105), -10, env=[(0, -60), (0.6, 0), (20, 0), (22.5, -60)])
    E('deck', 181.6, F.ice(13.0, [(0, 2), (13, 30)], 106, big=0.1), -16)
    E('deck', 195.0, F.ice(4.4, [(0, 40), (4.4, 90)], 107, big=0.15), -14)
    for k in range(12):
        E('deck', 198.75 + 0.33 * k, F.frost_crack(110 + k), -15, pan=-0.6 + 0.11 * k)
    E('deck', 199.0, F.ice(5.0, [(0, 60), (5, 10)], 108, big=0.1), -17)

    # ---- coils: the cutaway; current into the coils station by station (x60); the slice; one station apart
    W(203.6, 1.8, 0.9, -12, seed=120, heavy=0.4)
    E('deck', 206.9, F.energize(1.6, 121, hold=10.0), -10)
    for k in range(12):
        E('deck', 207.55 + 0.85 * k, F.energize(1.6 - 0.05 * k, 122 + k, hold=0.6), -6 - 0.15 * k, pan=-0.7 + 0.127 * k)
    W(218.7, 3.2, 1.6, -15, seed=135, heavy=0.2, bright=0.2, pan=(-0.6, 0.6))
    W(223.3, 1.3, 0.6, -14, seed=136, heavy=0.3)
    E('deck', 223.3, F.servo(1.3, [(0.05, 1.2, 1)], 260, seed=137), -18)
    W(229.4, 1.3, 0.9, -14, seed=138, heavy=0.3, pan=(0.4, -0.4))
    E('deck', 229.7, F.servo(1.3, [(0.05, 1.2, 1)], 240, seed=139), -18)
    E('deck', 231.1, F.clank(2.0, 140), -10)

    # ---- the hydraulic power unit: the motor, the pump's pistons building pressure, the unloader
    E('room', 236.2, F.motor(7.0, [(0, 0), (1.0, 1), (7, 1)], 30, seed=141, gear=2.0, hum=0.3, bright=0.2), -13,
      env=[(0, 0), (5.5, 0), (7, -60)])
    E('room', 236.2, F.clank(2.2, 142), -8)
    E('room', 237.0, F.hydraulic(6.0, [(0, 0), (0.6, 0.4), (5.4, 1.0), (6, 1.0)], 160, seed=143, strain=0.4), -9)
    E('room', 242.4, F.latch(1.3, 144), -6)
    E('room', 242.5, F.steam(1.4, [(0, 1), (1.4, 0)], 145, bright=0.3, roar=0.4), -18)
    E('room', 242.5, F.hydraulic(5.5, [(0, 0.3), (5.5, 0.2)], 140, seed=146, strain=0.1, creak=0.2), -15,
      env=[(0, 0), (4, -2), (5.5, -60)])

    # ---- the sensors: the director slews and locks; the radar
    E('deck', 250.5, F.servo(1.7, [(0.05, 1.6, 1)], 330, seed=147, gear=3.1), -14)
    E('deck', 252.3, F.latch(0.7, 148), -11)
    E('deck', 259.1, F.energize(0.7, 149, hold=1.6), -20)
    E('deck', 261.7, F.latch(0.8, 150), -11)

    # ---- the lay: the spools shift, train and elevation (hydraulic motors round the ring gear, the rams), laid
    E('deck', 269.7, F.latch(1.4, 151), -7)
    E('deck', 270.1, F.hydraulic(7.6, [(0, 0), (0.8, 1), (6.6, 1), (7.6, 0)], 150, seed=152, strain=0.8), -6)
    E('deck', 270.3, F.gears(5.4, [(0, 0), (0.8, 0.8), (4.6, 0.8), (5.4, 0)], 47, 22, seed=153), -12)
    E('deck', 270.3, F.hydraulic(8.2, [(0, 0), (1.0, 0.9), (7.4, 0.9), (8.2, 0)], 175, seed=154, strain=1.0, pump=0.5), -9, pan=0.3)
    E('deck', 275.2, F.clank(2.6, 155, 0.4), -5)
    E('deck', 278.3, F.clank(3.0, 156, 0.45), -4)
    E('deck', 278.4, F.latch(0.9, 157), -10)

    # ---- down to the magazine; the drum indexes
    W(282.4, 2.4, 1.0, -9, seed=158, heavy=0.8, bright=0.25, pan=(0.2, -0.2))
    E('room', 285.9, F.motor(0.7, F.moves(0.7, [(0, 0.65, 1)]), 150, seed=159, gear=4.2), -12)
    E('room', 286.5, F.clank(2.2, 160), -7)

    # ---- fabrication: robot arms, carriages, lasers, the lattice winder, the armature, the round lifted
    W(288.2, 1.4, 0.6, -15, 'room', 161, 0.3, 0.3)
    for k, t in enumerate((298.5, 299.5, 300.3, 300.7, 302.1, 303.35, 303.75, 306.45, 328.85, 372.3, 375.2, 376.0, 378.6)):
        d = 0.9 if k % 3 else 0.6
        E('room', t, F.servo(d, [(0.03, d * 0.5, 1), (d * 0.55, d - 0.03, 0.6)], 380 + 60 * (k % 4), seed=170 + k), -17,
          pan=((k * 0.37) % 1.2) - 0.6)
    for k, (t, d) in enumerate(((302.8, 1.6), (304.7, 1.6), (331.28, 2.0), (333.9, 2.0), (347.9, 2.2), (350.9, 1.8),
                                (354.9, 1.0), (355.5, 1.4), (374.65, 2.0), (384.3, 1.0), (384.8, 2.0), (387.5, 2.0))):
        E('room', t, F.motor(d, F.moves(d, [(0.05, d - 0.05, 1)]), 120 + 25 * (k % 3), seed=190 + k, gear=4.6, hum=0.05), -15)
    for k, t in enumerate((303.05, 336.4, 350.4, 352.7, 378.1, 387.3)):
        E('room', t, F.clank(1.6 + 0.2 * (k % 3), 210 + k), -9)
    for k, t in enumerate((299.95, 303.22, 374.4, 378.3)):
        E('room', t, F.latch(0.8, 220 + k), -11)
    for k, t in enumerate((308.27, 310.77, 313.95, 315.75, 316.94, 326.1)):
        d = 2.2
        E('room', t, F.laser(d, [(0.05, 0.7), (0.8, 1.5), (1.6, 2.1)], 230 + k), -15, pan=0.2 * ((k % 3) - 1))
        E('room', t, F.servo(d, [(0.05, 0.4, 0.5), (0.7, 1.0, 0.5), (1.4, 1.9, 0.5)], 520, seed=240 + k), -22)
    W(331.6, 1.2, 0.5, -15, 'room', 250, 0.3, 0.35)
    # the lattice winder: a spinning frame, the shuttle's rhythmic clack
    E('room', 336.8, F.motor(9.4, [(0, 0), (1.2, 1), (8.4, 1), (9.4, 0)], 140, seed=251, gear=3.0, hum=0.05), -15)
    for k in range(int(8.6 * 5.5)):
        E('room', 337.2 + k / 5.5, F.metal(0.55, 0.06, 0.5, 260 + k, 0.25), -24, pan=0.5 * np.sin(k * 1.1))
    E('room', 353.3, F.latch(1.8, 310), -5)
    E('room', 353.32, F.arc_crack(311, 0.5), -18)
    E('room', 356.3, F.energize(1.2, 312, hold=4.6), -16)
    E('room', 356.6, F.corona(5.0, [(0, 0), (5, 0.6)], 313), -24)
    for k, t in enumerate((361.7, 361.79)):
        E('room', t, F.latch(0.4, 314 + k, ring=0.1), -16)
    for k, t in enumerate((361.9, 365.66, 369.42)):
        W(t - 0.2, 0.9, 0.35, -18, 'room', 316 + k, 0.2, 0.25, (-0.6, 0.6))
    E('room', 379.7, F.motor(4.6, [(0, 0), (0.4, 1), (4.2, 1), (4.6, 0)], 95, seed=320, gear=7.0, hum=0.1), -12)
    E('room', 379.7, F.hydraulic(4.6, [(0, 0), (0.6, 0.5), (4.0, 0.5), (4.6, 0)], 160, seed=321, pump=0.3, creak=0.6), -18)

    # ---- the load: the hoist, the breech block, the tray, the rammer seats the round, the clamps drive home
    E('room', 391.2, F.latch(1.2, 330), -9)
    E('room', 391.3, F.motor(2.5, [(0, 0), (0.3, 0.6), (2.2, 1), (2.5, 0)], 110, seed=331, gear=5.0), -10)
    E('room', 393.7, F.clank(2.4, 332), -6)
    E('room', 399.3, F.latch(1.4, 333), -7)
    E('room', 399.4, F.hydraulic(0.8, [(0, 0), (0.2, 0.8), (0.6, 0.8), (0.8, 0)], 150, seed=334, pump=0.3), -12)
    E('room', 400.0, F.clank(2.6, 335), -5)
    E('room', 400.1, F.motor(1.2, F.moves(1.2, [(0.05, 1.1, 1)]), 120, seed=336, gear=4.0), -12)
    E('room', 401.2, F.clank(2.2, 337), -7)
    E('room', 401.7, F.hydraulic(2.6, [(0, 0), (0.4, 0.6), (2.3, 1.0), (2.6, 1.0)], 170, seed=338, strain=0.9), -6)
    E('room', 401.7, F.motor(2.5, [(0, 0), (2.4, 1), (2.5, 1)], 160, seed=339, gear=3.3), -13)
    E('room', 404.1, F.clank(3.6, 340, 0.6), 0)
    E('room', 404.12, F.latch(2.2, 341), -4)
    E('room', 404.2, F.hydraulic(2.2, [(0, 0), (0.3, 0.6), (1.9, 0.6), (2.2, 0)], 160, seed=342, strain=0.3), -12)
    E('room', 405.2, F.motor(0.7, F.moves(0.7, [(0.03, 0.65, 1)]), 130, seed=343, gear=4.0), -13)
    E('room', 405.8, F.motor(0.9, F.moves(0.9, [(0.03, 0.85, 1)]), 115, seed=344, gear=4.0), -13)
    E('room', 406.6, F.clank(2.8, 345), -5)
    for k in range(13):
        E('room', 410.42 + 0.24 * k, F.latch(1.1, 350 + k, gap=0.014, ring=0.25), -6 - (k % 2), pan=-0.65 + 0.108 * k)

    # ---- the heat sink: hatches, the lens goes under; the pump, valves, the doors, the bundles out; up again
    W(416.0, 1.6, 0.7, -13, 'room', 370, 0.4, 0.3)
    E('room', 418.8, F.motor(1.5, F.moves(1.5, [(0.05, 1.4, 1)]), 150, seed=371, gear=4.0), -12)
    E('room', 419.4, F.motor(1.5, F.moves(1.5, [(0.05, 1.4, 1)]), 140, seed=372, gear=4.0), -13)
    E('room', 420.2, F.clank(2.0, 373), -8)
    E('room', 420.8, F.clank(1.8, 374), -9)
    E('room', 420.2, F.water(3.5, [(0, 0), (1.5, 1), (3.5, 1.2)], 2.0, seed=375), -10)
    E('splash', 421.85, F.splash(1.2, 376), -2)
    E('water', 426.3, F.motor(3.0, [(0, 0), (2.2, 1), (3, 1)], 40, seed=377, gear=2.0, hum=0.4, bright=0.2), -6)
    E('water', 427.2, F.latch(1.4, 378), -6)
    E('water', 427.3, F.latch(1.2, 379), -7)
    E('water', 428.7, F.water(9.0, [(0, 0), (2, 1.2), (9, 1.0)], 2.2, seed=380), -6, env=[(0, -60), (1, 0), (7, -2), (9, -60)])
    for k, t in enumerate((428.34, 429.5, 429.66, 429.84, 430.52, 432.02, 432.7, 432.96, 434.2, 434.88)):
        E('water', t, F.clank(1.2, 390 + k, 0.2), -12, pan=-0.5 + 0.1 * k)
    E('water', 439.9, F.clank(2.6, 400), -3)
    E('water', 440.3, F.hydraulic(2.8, [(0, 0), (0.4, 1), (2.4, 1), (2.8, 0)], 150, seed=401, strain=0.8), -5)
    E('water', 443.0, F.clank(2.2, 402), -5)
    E('water', 443.3, F.motor(2.5, F.moves(2.5, [(0.05, 2.4, 1)]), 90, seed=403, gear=5.0), -8)
    for k, t in enumerate((444.52, 444.64, 444.86, 444.98, 445.2, 445.32, 445.54, 445.66, 445.88)):
        E('water', t, F.clank(1.4, 410 + k, 0.25), -8, pan=-0.6 + 0.15 * k)
    E('water', 447.3, F.clank(2.4, 420), -4)
    E('water', 447.4, F.hydraulic(3.4, [(0, 0), (0.5, 1), (3, 1), (3.4, 0)], 140, seed=421, strain=0.9), -5)
    E('water', 447.8, F.clank(2.0, 422), -6)
    E('water', 448.3, F.clank(2.0, 423), -6)
    E('water', 449.1, F.motor(3.2, F.moves(3.2, [(0.05, 3.1, 1)]), 70, seed=424, gear=6.0), -7)
    E('water', 452.0, F.water(10.0, [(0, 0.5), (10, 0.8)], 2.5, seed=425), -10)
    E('splash', 463.35, F.splash(1.0, 426), -3)

    # ---- the charge and the shot (the draft's design, or a variant's: --fire N)
    if FIRE is None:
        fire_base(E)
    else:
        FIRE.foley(E, S)

    # ---- the burst in slow motion: time drops, the rod cracks, the shards spread, the charge gathers, discharges
    E('sky', 490.6, F.slowmo_drop(1.8, 437), -6)
    E('sky', 491.0, F.corona(1.6, [(0, 0.2), (1.6, 0.6)], 438), -22)
    E('sky', 491.45, F.metal(4.0, 1.6, 0.4, 439, 0.6), -10)
    E('sky', 492.65, F.shatter_slow(3.8, 440), -4)
    E('sky', 493.85, F.energize(2.0, 441, hold=1.2), -12)
    E('sky', 494.45, F.lp(F.corona(1.6, [(0, 1), (1.6, 0.2)], 442), 3000), -12)
    E('sky', 496.35, F.lp(F.arc_crack(443, 2.0), 2500), -4)
    E('sky', 497.25, F.lp(F.corona(1.0, [(0, 1), (1, 0)], 444), 2500), -12)

    # ---- the strike: the leader stepping down, the bolt landing (thunder)
    E('sky', 498.38, F.arc_crack(445, 1.4), -3)
    E('sky', 498.4, F.thunder(5.0, 0.6, 446, crack=0), -10)
    steps = 499.5 + 4.3 * (1 - (1 - np.linspace(0, 1, 14)) ** 1.6)
    for k, t in enumerate(steps):
        E('sky', float(t), F.arc_crack(450 + k, 0.4 + 0.04 * k), -16 + 0.6 * k, pan=0.5 * np.sin(k * 2.3))
    E('sky', 503.88, F.thunder(10.0, 0.12, 470, crack=1.3), 0)

    # ---- the scan: each pulse a crack of the lime lightning and a far roll
    for k, t in enumerate((509.88, 518.88, 527.88, 536.88)):
        E('sky', t, F.arc_crack(480 + k, 0.9), -3, pan=0.3 * ((k % 3) - 1))
        E('sky', t + 0.05, F.thunder(6.0, 0.8, 490 + k, crack=0), -8)

    # ---- home: low and fast over the sea
    E('beds', 540.9, F.wind(21.5, 0.4, 500, speed=[(0, 0.3), (2, 1.0), (17, 1.0), (21.5, 0.2)]), -10,
      env=[(0, -40), (1.5, 0), (19, 0), (21.5, -40)])

    # ---- the stow: the field down, the sensors stowed, train and elevation home
    n = n_of(1.6)
    tt = np.arange(n) / SR
    E('deck', 562.3, np.sin(2 * np.pi * np.cumsum(120 * (40 / 120) ** (tt / 1.6)) / SR) * np.exp(-tt / 0.6), -14)
    E('deck', 564.5, F.servo(1.1, [(0.05, 1.0, 1)], 300, seed=501), -15)
    E('deck', 565.2, F.hydraulic(3.2, [(0, 0), (0.5, 0.8), (2.7, 0.8), (3.2, 0)], 150, seed=502, strain=0.6), -10)

    # ---- heat to the sea: the dump pump, under the hull, the hot water boiling out into the sea
    E('room', 573.7, F.motor(2.0, [(0, 0), (1.5, 1), (2, 1)], 40, seed=503, gear=2.0, hum=0.4, bright=0.2), -9)
    E('splash', 573.95, F.splash(1.2, 504), -2)
    E('water', 576.1, F.boil(12.0, [(0, 0), (1.5, 1.2), (9, 1.0), (12, 0.3)], 505), -9, env=[(0, -60), (0.8, 0), (10, -2), (12, -60)])
    E('water', 576.1, F.water(12.0, [(0, 0), (1.5, 1.3), (12, 0.6)], 2.0, seed=506), -11)
    E('water', 577.1, F.bubbles(8.0, [(0, 300), (8, 60)], 2, 14, 507), -13)
    E('water', 587.9, F.motor(1.9, F.moves(1.9, [(0.05, 1.8, 1)]), 120, seed=508, gear=4.0), -9)
    E('water', 588.7, F.clank(1.2, 509, 0.2), -10)
    E('water', 588.9, F.clank(1.2, 510, 0.2), -10)
    E('water', 589.5, F.hydraulic(4.5, [(0, 0), (0.5, 1), (4, 1), (4.5, 0)], 140, seed=511, strain=0.7), -6)
    E('water', 589.7, F.motor(4.0, F.moves(4.0, [(0.05, 3.9, 1)]), 85, seed=512, gear=5.0), -9)
    for k, t in enumerate((594.6, 594.9, 594.9, 595.06, 595.2, 595.22, 595.38, 595.54, 595.7, 595.86)):
        E('water', t, F.clank(1.4, 520 + k, 0.25), -8, pan=0.6 - 0.13 * k)
    E('splash', 596.15, F.splash(1.0, 530), -3)
    E('deck', 603.1, F.clank(2.6, 531), -7)
    E('deck', 604.1, F.clank(2.8, 532, 0.45), -6)
    E('deck', 605.6, F.motor(1.6, [(0, 1), (1.6, 0)], 40, seed=533, gear=2.0, hum=0.3, bright=0.2), -12)


def fire_base(E):
    """The charge and the shot as in the first draft."""
    # ---- the rails charge: a deep hum climbing, the corona's crackle growing, the steel straining
    n = n_of(11.4)
    tt = np.arange(n) / SR
    f = 55 * 2 ** (tt / 11.4)
    hum = (np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(4 * np.pi * np.cumsum(f) / SR + 1)) * (tt / 11.4) ** 1.5
    E('deck', 468.6, F.fade(hum, 0.5, 0.05), -12)
    E('deck', 469.6, F.corona(10.2, [(0, 0.05), (10.2, 1.0)], 430), -14,
      env=[(0, -30), (6, -8), (10.0, 0), (10.15, -60)])
    E('deck', 470.5, F.hydraulic(9.3, [(0, 0), (9.3, 1)], 140, seed=431, pump=0.0, strain=1.2, creak=1.2), -14,
      env=[(0, -30), (8, -4), (9.2, 0), (9.3, -60)])
    E('deck', 469.1, F.motor(1.6, F.moves(1.6, [(0.05, 1.5, 1)]), 200, seed=432), -16)

    # ---- the shot: the banks dump (a deep thump through the mount), the report, the round tearing away
    E('sky', 480.49, F.release(433), -6)
    E('sky', 481.5, F.railgun_shot(434), 0)
    E('sky', 481.55, F.flight(7.0, 435), -9)
    # the lime lightning crawling round the muzzle as the round leaves (3.5 s): arcs and their crackle
    E('sky', 481.6, F.corona(3.8, [(0, 1.0), (2.5, 0.6), (3.8, 0.0)], 436), -13)
    for k, t in enumerate((481.75, 482.1, 482.35, 482.8, 483.3, 483.65, 484.2, 484.7)):
        E('sky', t, F.arc_crack(600 + k, 0.5 + 0.1 * (k % 3)), -13 - 0.8 * k, pan=0.6 * np.sin(k * 1.9))
    E('sky', 485.3, F.wind(5.0, 0.4, 436), -18)


def beds(n):
    """The ambiences under everything, each a whole-film bed with its own level curve (dB)."""
    out = np.zeros((n, 2))
    D = n / SR
    plan = [
        ('sea', lambda: F.sea(D, 600), [(0, -8), (3.6, -8), (6.5, -40), (8, -80), (176, -80), (182, -26), (234, -26), (236.5, -80),
                                       (248, -80), (251, -16), (282.5, -16), (285, -80), (463.0, -80), (463.4, -8), (468, -12),
                                       (480, -16), (488, -26), (490.5, -80), (540.5, -80), (542, -12), (566, -12), (568, -26),
                                       (573.8, -30), (574.1, -80), (596.0, -80), (596.3, -8), (606.3, -8)]),
        ('wind', lambda: F.wind(D, 0.5, 601), [(0, -18), (3.6, -18), (6.5, -80), (176, -80), (182, -24), (234, -24), (236.5, -80),
                                              (248, -80), (251, -18), (282.5, -18), (285, -80), (466, -80), (468, -18),
                                              (480, -18), (488, -14), (490.5, -10), (498, -12), (504, -18), (540, -18), (541, -80),
                                              (561, -80), (562, -20), (566, -20), (568, -80), (596.2, -80), (596.5, -20), (606.3, -20)]),
        ('engine', lambda: F.room_tone(D, 602, 29.6, 0.6, 0.4, 0.12), [(0, -80), (3.0, -80), (6.0, -10), (108.8, -10), (112, -14),
                                                                      (125.6, -14), (166, -16), (172, -80), (234, -80), (235.5, -14),
                                                                      (249, -14), (250.5, -80), (282.3, -80), (285, -16),
                                                                      (421.6, -16), (421.9, -80), (566, -80), (568, -14), (573.8, -14),
                                                                      (574.0, -80)]),
        ('under', lambda: F.underwater(D, 603), [(0, -80), (421.8, -80), (422.0, -9), (463.2, -9), (463.4, -80), (573.9, -80),
                                                 (574.1, -9), (596.0, -9), (596.2, -80)]),
    ]
    for name, fn, lv in plan:
        x = fn()
        g = 10 ** (F.curve(lv, len(x)) / 20)
        out[:len(x)] += x * g[:, None]
        del x
    return out


# ---------------------------------------------------------------- mix

MUSIC = {  # bus: (reverbs [(space, wet)], delay (t, feedback, mix) or None, high-pass Hz, gain dB)
    'pads': ([('hall', 0.45)], None, 60, 0.0),
    'orch': ([('hall', 0.35), ('epic', 0.12)], None, 35, 0.0),
    'keys': ([('hall', 0.35)], (0.45, 0.32, 0.22), 80, 0.0),
    'bass': ([], None, 28, 0.0),
    'drums': ([('epic', 0.22)], None, 30, 0.0),
    'perc': ([('hall', 0.2)], None, 300, 0.0),
    'fx': ([('epic', 0.3)], None, 25, 0.0),
    'kick': ([('plate', 0.04)], None, 25, 0.0),          # (the style variants' kicks: the sidechain key)
}
FOLEY = {
    'engine': ([('engine', 0.32)], 25, 0.0),
    'room': ([('room', 0.3)], 25, 0.0),
    'deck': ([('deck', 0.28)], 25, 0.0),
    'sky': ([('sky', 0.45)], 22, 0.0),
    'water': ([('water', 0.5)], 25, -5.0),
    'splash': ([('deck', 0.2)], 25, 0.0),
    'beds': ([], 22, 0.0),
}
# stem balance: the loudness (LUFS, while playing) each music bus is set to before the music automation
MUSIC_LUFS = {'pads': -25.0, 'orch': -21.0, 'keys': -24.0, 'bass': -23.0, 'drums': -21.0, 'perc': -31.0, 'fx': -25.0}

# the gains the whole film's render found for each bus (printed by it); parts use these so they balance the same
BUS_GAIN = {'pads': -11.0, 'orch': -11.1, 'keys': -7.1, 'bass': -8.0, 'drums': -10.5, 'perc': -1.9, 'fx': -9.4}
# the music's level (dB) through the film: under the machinery it makes room for the foley; the shot and the
# thunder punch through it; at the end it hands back to the sea
MUSIC_DB = [(0, -1.5), (4, -4), (13, -6), (51, -5), (78, -5), (108.8, -4.5), (125.6, -5), (165.6, -4.5), (203.9, -4),
            (230, -3), (234.9, -3.5), (249.9, -5), (269.7, -3), (282.3, -5), (288.1, -5.5), (304.7, -5), (355.5, -4.5),
            (367.5, -6), (372.3, -4), (390.9, -4.5), (413.9, -4.5), (468.5, -5), (479.7, -7), (479.8, -60), (481.45, -60),
            (481.5, -12), (482.6, -11), (483.8, -5.5), (490.55, -6), (498.18, -5.5), (503.8, -5.5), (503.9, -12), (505.2, -9),
            (505.6, -5)] + [p for t in (509.88, 518.88, 527.88, 536.88) for p in ((t - 0.05, -5), (t + 0.05, -9), (t + 0.9, -5))] +            [(539.13, -5), (550, -5), (561.7, -5), (566.3, -5), (596.15, -5), (600, -6), (606.3, -12)]
UNDER = [(421.85, 463.35), (573.95, 596.15)]
# the foley's level (dB) through the film: in front under the machinery, the shot and the thunder on top
FOLEY_DB = [(0, -4), (3.8, -4), (5.5, 0), (12, 0), (14, -3), (107, -3), (108.8, 0), (165.6, -0.5), (269.7, -2), (282.3, -1),
            (413.9, -2), (466, -2), (468.5, -7), (479.8, -9), (479.9, -5), (481.4, -5), (481.5, 2), (483.5, 1), (486, -2), (490, -4),
            (497.9, -4), (498.2, -3), (503.8, -3), (503.9, 0), (507, -2), (512, -3), (540, -2), (561, -2), (563, -5), (606.3, -5)]
TARGET_LUFS = -15.0
FIRE = None                # a variant of the charge and the shot (pc_scan_railgun_fire.VARIANTS[n]); None = the draft


def splice(base, over):
    """An automation curve with a stretch replaced: the base outside the override's first..last time."""
    if not over:
        return base
    a, b = over[0][0], over[-1][0]
    return sorted([p for p in base if p[0] < a or p[0] > b] + list(over))
MASTER_GAIN = 3.5          # set from the whole film's render (printed); the parts use it so they sound the same


def k_lufs(x):
    """Gated loudness while the stem plays: the mean of 400 ms blocks above -50 LUFS (K-weighted)."""
    y = dsp.filt(dsp.filt(x, 'highshelf', 1681, 0.71, 4.0), 'hp', 38, 0.5)
    L = n_of(0.4)
    m = (y * y).sum(1)
    k = len(m) // L
    b = m[:k * L].reshape(k, L).mean(1)
    lb = -0.691 + 10 * np.log10(b + 1e-12)
    g = b[lb > -50]
    return -0.691 + 10 * np.log10(g.mean() + 1e-12) if len(g) else -80.0


def under_lp(x, t0=0.0, cut=550.0):
    """The music and the dry foley muffled while the lens is under the water (a low-pass that closes at each
    splash and opens at each surfacing)."""
    n = len(x)
    pts = [(0, 20000.0)]
    for a, b in UNDER:
        pts += [(a - t0 - 0.02, 20000.0), (a - t0 + 0.25, cut), (b - t0 - 0.05, cut), (b - t0 + 0.35, 20000.0)]
    pts.append((n / SR + 1, 20000.0))
    pts = [(max(0.0, t), v) for t, v in pts]
    fc = F.curve(pts, n)
    if fc.min() > 15000:
        return x
    return dsp.filt(x, 'lp', fc, 0.6, order=2, block=512)


def process(buf, reverbs, hp_hz, delay=None):
    if hp_hz:
        buf = dsp.butter(buf, 'hp', hp_hz, 2)
    if delay:
        d = dsp.delay(buf, *delay[:2], mix=delay[2], lp=4500)
        buf = d[:len(buf)]
    out = buf.copy()
    for space, wet in reverbs:
        w = F.reverb(buf, space, wet, 0.0)
        out += w[:len(out)]
    return out


def stems(t0=0.0, t1=DUR, log=print):
    """The music and the foley, each fully processed (buses balanced, spaces, the underwater muffle) but before the
    level automation and the master."""
    T0 = _time.time()
    n = n_of(t1 - t0 + TAIL)
    S = Score()
    log('composing...')
    music(S)
    foley(S)
    log(f'  {len(S.ev)} events ({_time.time() - T0:.0f} s)')
    edge = (lambda b: b) if t0 <= 0 else (lambda b: b * np.minimum(1, np.arange(len(b)) / SR / 1.0)[:, None])
    mus = np.zeros((n, 2), np.float32)
    own = FIRE is not None and getattr(FIRE, 'bus_lufs', None)       # a style variant balances its own buses
    sc = getattr(FIRE, 'sidechain', None) if FIRE is not None else None
    key = S.render_bus(sc[0], n, t0, t1) if sc else None            # (bus, targets, depth dB): ducked under the kick
    for bus, (revs, dly, hpz, gdb) in MUSIC.items():
        b = edge(S.render_bus(bus, n, t0, t1, log))
        if sc and bus in sc[1] and np.abs(key).max() > 0:
            b = dsp.duck(b, key, sc[2], 0.003, 0.16)
        b = process(b, revs, hpz, dly)
        if own:
            L = k_lufs(b) if np.abs(b).max() > 0 else -80
            g = (own.get(bus, -30.0) - L) if L > -79 else 0.0
        elif t0 > 0 or t1 < DUR:                             # a part: the whole film's balance (a part alone would skew it)
            g = BUS_GAIN.get(bus, 0.0)
        else:
            L = k_lufs(b) if np.abs(b).max() > 0 else -80
            g = MUSIC_LUFS.get(bus, -22.0) - L if L > -79 else 0.0
            log(f'    {bus}: {L:.1f} LUFS -> {g:+.1f} dB ({_time.time() - T0:.0f} s)')
        mus += (b * 10 ** ((g + gdb) / 20)).astype(np.float32)
        del b
    mus = under_lp(mus.astype(np.float64), t0).astype(np.float32)
    fol = np.zeros((n, 2), np.float32)
    for bus, (revs, hpz, gdb) in FOLEY.items():
        if bus == 'beds':
            b = beds(n_of(DUR + TAIL))[n_of(t0):n_of(t0) + n]
            b = np.pad(b, ((0, n - len(b)), (0, 0)))
        else:
            b = edge(S.render_bus(bus, n, t0, t1, log))
        if bus == 'water':
            b = F.lp(b, 1100, 4)
        b = process(b, revs, hpz)
        if bus in ('engine', 'room', 'deck', 'sky'):
            b = under_lp(b, t0, 700.0)
        fol += (b * 10 ** (gdb / 20)).astype(np.float32)
        del b
        log(f'    foley {bus} ({_time.time() - T0:.0f} s)')
    return mus, fol


def glue(x, thresh=-17.0, ratio=1.4, rel=0.6):
    """A slow RMS bus compressor: it eases the loudest stretches down a dB or two without touching transients."""
    import scipy.signal as ss
    p = (x * x).mean(1)
    a = np.exp(-1 / (rel * SR))
    env = ss.lfilter([1 - a], [1, -a], p)
    lev = 10 * np.log10(env + 1e-12)
    gr = np.maximum(lev - thresh, 0) * (1 - 1 / ratio)
    return x * (10 ** (-gr / 20))[:, None]


def master(mus, fol, t0=0.0, t1=DUR, log=print):
    """The level automation (music and foley through the film), then the master: gentle glue, a true-peak-safe
    limiter, loudness for YouTube."""
    n = len(mus)
    mdb, fdb = MUSIC_DB, FOLEY_DB
    if FIRE is not None:
        mdb, fdb = splice(MUSIC_DB, getattr(FIRE, 'music_db', None)), splice(FOLEY_DB, getattr(FIRE, 'foley_db', None))
    gm = 10 ** (F.curve([(t - t0, v) for t, v in mdb], n) / 20)
    gf = 10 ** (F.curve([(t - t0, v) for t, v in fdb], n) / 20)
    mix = mus.astype(np.float64) * gm[:, None] + fol.astype(np.float64) * gf[:, None]
    if FIRE is not None and getattr(FIRE, 'muffle', None):        # the whole world muffled (shell shock), then opening
        fc = F.curve([(max(0.0, t - t0), v) for t, v in FIRE.muffle], n)
        mix = dsp.filt(mix, 'lp', fc, 0.6, order=2, block=256)
    mix = glue(mix)
    gain = 10 ** (MASTER_GAIN / 20)
    if t0 == 0 and t1 >= DUR:
        for _ in range(2):
            L = loudness(dsp.limit(mix * gain, -1.2), SR)['integrated']
            gain *= 10 ** ((TARGET_LUFS - L) / 20)
        log(f'  master gain {20 * np.log10(gain):+.2f} dB (keep MASTER_GAIN at this for the parts)')
    pre = np.abs(mix * gain).max(1)
    mix = dsp.limit(mix * gain, -1.2)
    gr = 20 * np.log10(np.maximum(pre, 1e-9) / np.maximum(np.abs(mix).max(1), 1e-9))
    hot = gr > 3
    log(f'  limiter: max {gr.max():.1f} dB, over 3 dB on {100 * hot.mean():.2f} % of samples' +
        (f' (worst near {np.argmax(gr) / SR + t0:.1f} s)' if hot.any() else ''))
    L = loudness(mix, SR)
    log(f'  master: {L["integrated"]:.1f} LUFS integrated, LRA {L["lra"]}, peak {20 * np.log10(np.abs(mix).max()):.1f} dBFS')
    if t1 >= DUR:                                         # the picture ends at DUR: the sound fades out with it
        k = n_of(DUR - t0)
        f = n_of(2.0)
        mix[k - f:k] *= np.linspace(1, 0, f)[:, None] ** 1.5
        mix[k:] = 0
        return mix[:k]
    return mix[:n_of(t1 - t0)]


def render(t0=0.0, t1=DUR, out_dir=None, log=print, remix=False):
    tag = '' if (t0 == 0 and t1 >= DUR) else f'_{t0:g}-{t1:g}s'
    cache = os.path.join(out_dir, f'stems{tag}.npz') if out_dir else None
    if remix and cache and os.path.exists(cache):
        z = np.load(cache)
        mus, fol = z['music'], z['foley']
        log('stems from ' + cache)
    else:
        mus, fol = stems(t0, t1, log)
        if cache:
            os.makedirs(out_dir, exist_ok=True)
            np.savez(cache, music=mus, foley=fol)
    mix = master(mus, fol, t0, t1, log)
    if out_dir:
        dsp.write(os.path.join(out_dir, f'mix{tag}.wav'), np.ascontiguousarray(mix))
        k = len(mix)
        dsp.write(os.path.join(out_dir, f'music{tag}.wav'), np.ascontiguousarray(np.clip(mus[:k].astype(np.float64) * 0.5, -1, 1)))
        dsp.write(os.path.join(out_dir, f'foley{tag}.wav'), np.ascontiguousarray(np.clip(fol[:k].astype(np.float64) * 0.5, -1, 1)))
    return mix


def mux(video, wav, out, t0=0.0, dur=None):
    ff = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'WinGet', 'Packages')
    import glob
    exe = (glob.glob(os.path.join(ff, 'Gyan.FFmpeg*', '*', 'bin', 'ffmpeg.exe')) or ['ffmpeg'])[0]
    args = [exe, '-y', '-v', 'error']
    if t0:
        args += ['-ss', f'{t0:.3f}']
    args += ['-i', video, '-i', wav, '-map', '0:v:0', '-map', '1:a:0']
    if dur:
        args += ['-t', f'{dur:.3f}']
    args += ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '384k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out]
    subprocess.run(args, check=True)
    return out


def fire_variants(which=None, out_dir=None, video=None, log=print, module='pc_scan_railgun_fire', sub='fire'):
    """Each variant of the charge and the shot as its own clip (W0..W1: 30 s before the shot to 10 s after),
    mastered like the film, and muxed onto the same stretch of the picture (1080p) when a render is given."""
    global FIRE
    import importlib
    V = importlib.import_module(module)
    d = os.path.join(out_dir, sub)
    os.makedirs(d, exist_ok=True)
    W0, W1, PRE = V.W0, V.W1, 10.0
    clip = None
    if video:
        clip = os.path.join(d, f'picture_1080p_{W0:g}-{W1:g}.mp4')
        if not os.path.exists(clip):
            exe = _ffmpeg()
            subprocess.run([exe, '-y', '-v', 'error', '-ss', f'{W0:.3f}', '-i', video, '-t', f'{W1 - W0:.3f}', '-an',
                            '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14',
                            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', clip], check=True)
    for k in which or sorted(V.VARIANTS):
        FIRE = V.VARIANTS[k]
        log(f'== variant {k}: {FIRE.title}')
        mus, fol = stems(W0 - PRE, W1 + 3.0, log=lambda *a: None)
        mix = master(mus, fol, W0 - PRE, W1 + 3.0, log)
        x = mix[n_of(PRE):n_of(PRE + W1 - W0)].copy()
        x[:n_of(0.25)] *= np.linspace(0, 1, n_of(0.25))[:, None]
        x[-n_of(0.6):] *= np.linspace(1, 0, n_of(0.6))[:, None]
        wav = os.path.join(d, f'{sub}_v{k}_{FIRE.name}.wav')
        dsp.write(wav, np.ascontiguousarray(x))
        if clip:
            out = wav[:-4] + '.mp4'
            subprocess.run([_ffmpeg(), '-y', '-v', 'error', '-i', clip, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
                            '-c:a', 'aac', '-b:a', '384k', '-movflags', '+faststart', '-shortest', out], check=True)
            log('  -> ' + out)
    FIRE = None


def _ffmpeg():
    import glob
    ff = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'WinGet', 'Packages')
    return (glob.glob(os.path.join(ff, 'Gyan.FFmpeg*', '*', 'bin', 'ffmpeg.exe')) or ['ffmpeg'])[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--from', dest='frm', type=float, default=0.0)
    ap.add_argument('--to', type=float, default=DUR)
    ap.add_argument('--out', default=os.path.join(ROOT, 'reference', 'films', 'renders', 'pc_scan_railgun_sound'))
    ap.add_argument('--video', default=None, help='a render to mux the mix onto (video stream-copied)')
    ap.add_argument('--remix', action='store_true', help='reuse the cached stems (only the automation and the master)')
    ap.add_argument('--fire', type=int, nargs='*', default=None,
                    help='variants of the charge and the shot (pc_scan_railgun_fire.py): render 30 s before to 10 s after it')
    ap.add_argument('--style', type=int, nargs='*', default=None,
                    help='music styles over the climax with the measured shot (pc_scan_railgun_style.py)')
    a = ap.parse_args()
    if a.fire is not None:
        fire_variants(a.fire or None, a.out, a.video)
        return
    if a.style is not None:
        fire_variants(a.style or None, a.out, a.video, module='pc_scan_railgun_style', sub='style')
        return
    render(a.frm, a.to, a.out, remix=a.remix)
    if a.video:
        tag = '' if (a.frm == 0 and a.to >= DUR) else f'_{a.frm:g}-{a.to:g}s'
        base = os.path.splitext(os.path.basename(a.video))[0]
        out = os.path.join(os.path.dirname(a.video), f'{base}_sound{tag}.mp4')
        mux(a.video, os.path.join(a.out, f'mix{tag}.wav'), out, a.frm, (a.to - a.frm) if tag else None)
        print('muxed:', out)


if __name__ == '__main__':
    main()
