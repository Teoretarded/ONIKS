"""SCAN · RAILGUN: the climax in five music styles, all with the measured shot.

    python tools/sound_lab/soundtracks/pc_scan_railgun.py --style --video reference/films/renders/pc_scan_railgun_2160p60.mp4
    python tools/sound_lab/soundtracks/pc_scan_railgun.py --style 1 3             some of them

The window runs 451.5-541.5: 30 s before the shot to the end of the scan.

The sound design is shared and rebuilt from measurements of real recordings (tools/audio_impact.py,
data/impacts/):
- under the hull, the banks charging through the plating, and muffled snaps;
- on the surface, the charging hum climbing an octave, arcs crawling along the rails (a measured Jacob's ladder)
  and thickening, and the eight banks arming in waves (a contactor and a spark-gap snap each);
- the interlock, then silence;
- the banks going off (a spark gap enlarged an octave, the measured capacitor discharge, a pressure thump);
- the shot: the BAE railgun's wall of sound with a howitzer's body, the falling 'umf', a rifle's crack and
  lightning's roll;
- arcs round the muzzle.

The music drops out for the shot and comes back on the next downbeat.

  1 hardstyle   150 BPM: a filtered anthem under the water, kicks rolling in, a snare roll; the drop is distorted
                hardstyle kicks, reverse bass, a screech and the supersaw anthem; a break in the slow motion; a kick
                roll into the main drop on the scan
  2 phonk       130 BPM drift phonk: a cowbell riff, distorted 808s sliding, hat rolls, a half-time slam
  3 frenchcore  195 BPM: strings and the theme, then kicks that play the melody, savage and fast
  4 techno      150 BPM hard techno: rumbling kicks from the start, a 303 acid line opening up, claps, stabs
  5 rage        150 BPM rage/trap, half time: a huge detuned lead, 808 glides, trap hats and rolls
"""
import numpy as np

from sound_lab import foley as F, styles as Z, synth as Y
import pc_scan_railgun as P

W0, W1 = 451.5, 541.5
REL, SHOT = 480.49, 481.5
DROP = 482.6                      # the music comes back on this downbeat after the shot (all grids anchor here)
MUS = ('pads', 'orch', 'keys', 'bass', 'drums', 'perc', 'fx', 'kick')
PROG = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A']


def fire_foley(E, S):
    """The measured charge, discharge and shot (shared by every style)."""
    E('water', 455.0, F.charge_hum(8.4, 40, 55, 700, buzz=0.25), -8, env=[(0, -30), (6, -6), (8.2, 0), (8.4, -60)])
    for k, t in enumerate((456.4, 458.9, 461.1)):
        E('water', t, F.discharge(710 + k, 0.6), -12)
    E('deck', 464.0, F.charge_hum(15.5, 45, 110, 701), -10, env=[(0, -24), (4.5, -12), (15.35, 0), (15.5, -80)])
    E('deck', 468.4, F.arcs(11.15, [(0, 0.1), (8, 0.6), (11.15, 1.0)], 720), -7, env=[(0, -30), (2, -12), (11.0, 0), (11.15, -80)])
    for k, t in enumerate([468.6 + 10.4 * (1 - (1 - k / 8) ** 1.35) for k in range(8)]):     # eight banks arm
        pan = -0.85 + 0.24 * k
        E('deck', t, F.latch(1.3, 730 + k, gap=0.01, ring=0.3), -6, pan=pan)
        E('deck', t + 0.01, F.discharge(740 + k, 0.35 + 0.05 * k), -11 + 0.6 * k, pan=pan)
    E('deck', 479.55, F.breaker(761), -1)                                                   # full charge: the interlock
    E('sky', REL, F.discharge(762, 1.3), -7)                                                # the banks go off
    E('sky', SHOT, F.railgun_blast(434, weight=1.2, crack=1.3, tail=0.7), 0)                # the shot
    E('sky', SHOT + 0.05, F.flight(7.0, 435), -12)
    E('sky', SHOT + 0.1, F.arcs(3.6, [(0, 1.0), (3.6, 0.0)], 770), -9)                      # arcs round the muzzle
    for k, t in enumerate((481.75, 482.1, 482.35, 482.8, 483.3, 483.65, 484.2, 484.7)):
        E('sky', t, F.arc_crack(600 + k, 0.5 + 0.1 * (k % 3)), -14 - 0.8 * k, pan=0.6 * np.sin(k * 1.9))
    E('deck', 483.0, F.cool_ticks(8.5, 3.0, 790), -16)


FOLEY_DB = [(446, -2), (468.5, -4), (479.5, -4.5), (479.65, -9), (480.4, -9), (480.45, 0), (484, -1), (490, -3), (541.5, -2)]


def gap_db(drop=DROP, main=505.0, level=0.0):
    """Music level: the build under the shot's level, silent for the discharge and the shot, back on the drop a
    little under it, full on the main drop (the scan)."""
    return [(446, level - 7), (479.5, level - 5), (479.6, -60), (drop - 0.05, -60), (drop, level - 4), (490.4, level - 3),
            (main - 0.1, level - 2), (main, level), (541.5, level)]


def chords_bars(G, bars, prog, inst, bus, lo, hi, vel, db, every=2):
    """Held chords, `every` bars each, from prog (cycled)."""
    for i, b in enumerate(range(bars[0], bars[1], every)):
        c = prog[i % len(prog)]
        S_ = chords_bars.S
        S_.n(bus, G(b), inst, tuple(Y.voicing(c, lo, hi)), round(G(b + every) - G(b), 3), vel, db=db)


def roll(S, G, bus, b0, b1, fn, db=0.0):
    """A snare/kick roll accelerating over bars b0..b1: 8ths, then 16ths, then 32nds in the last bar."""
    t, end = G(b0), G(b1)
    bar = G(1) - G(0)
    while t < end - 1e-6:
        x = (t - G(b0)) / (end - G(b0))
        S.n(bus, t, fn, round(0.45 + 0.55 * x, 2), db=db)
        rem = (end - t) / bar
        t += bar / (8 if rem > 2 else 16 if rem > 1 else 32)


class Style:
    W0, W1 = W0, W1
    foley_db = FOLEY_DB
    muffle = None
    sidechain = ('kick', ('pads', 'orch', 'keys', 'bass', 'perc'), -8.0)
    bus_lufs = {'kick': -18.0, 'drums': -24.0, 'bass': -21.0, 'keys': -21.0, 'pads': -26.0, 'orch': -25.0, 'perc': -28.0, 'fx': -26.0}

    @staticmethod
    def foley(E, S):
        fire_foley(E, S)


# ---------------------------------------------------------------- 1 hardstyle

HS_LEAD = [[69, 69, 74, 69, 72, 69, 67, 65], [65, 65, 70, 65, 69, 65, 64, 62], [60, 60, 65, 60, 69, 67, 65, 64], [64, 64, 67, 64, 72, 71, 72, 74],
           [74, 72, 74, 77, 76, 74, 72, 69], [70, 69, 70, 74, 72, 70, 69, 65], [67, 65, 67, 70, 69, 67, 65, 62], [61, 64, 69, 73, 76, 73, 69, 64]]


class V1(Style):
    name, title = 'hardstyle', 'Hardstyle (150 BPM)'
    music_db = gap_db()

    @staticmethod
    def music(S):
        S.drop(MUS, 440.0, 545.0)
        G = Z.grid(150, DROP)
        chords_bars.S = S
        root = lambda b: Y.bass_note(PROG[(b // 1) % 8], 33)  # noqa: E731  (one chord a bar in the drops)
        # intro under the water and on the surface: pads and the anthem, filtered and soft
        chords_bars(G, (-19, -1), PROG, P.PAD(0.35, 21, 1.2, 2.5), 'pads', 50, 66, 0.55, 0, every=2)
        for b in range(-16, -2):
            for i, m in enumerate(HS_LEAD[(b + 16) // 2 % 8]):
                if (b % 2 == 0) == (i < 8):
                    S.n('keys', G(b, i * 0.5), Z.anthem_lead, m, round((G(1) - G(0)) / 8 * 0.9, 3), 0.45, 0.25, db=-6)
        for b in range(-10, -2):                                                        # the kicks roll in, half energy
            for q in range(4):
                S.n('kick', G(b, q), Z.hard_kick, 0.55, 55.0, 0.3, 4.0, 0.6, db=-5)
        roll(S, G, 'drums', -6, -2, Y.snare, db=-4)
        S.n('fx', G(-6), Y.riser, G(-2) - G(-6), 0.8, db=-3)
        # drop 1 (bars 0-4) and the main drop (bars 14-35): kick, reverse bass, screech, anthem
        for rng_, lead in (((0, 5), False), ((14, 36), True)):
            for b in range(*rng_):
                c = PROG[b % 8]
                f = float(Y.mtof(Y.bass_note(c, 33)))
                for q in range(4):
                    S.n('kick', G(b, q), Z.hard_kick, 1.0, f, 0.38, 7.0, 1.0)
                    S.n('bass', G(b, q + 0.5), Z.reverse_bass, f, round((G(1) - G(0)) / 8, 3), 0.85)
                S.n('perc', G(b, 1), Z.clap, 0.8, db=-2)
                S.n('perc', G(b, 3), Z.clap, 0.8, db=-2)
                Z.steps(S, G, 'perc', [b], Y.hat, '..o...o...o...o.', db=-8)
                if lead or b >= 2:
                    for i, m in enumerate(HS_LEAD[b % 8]):
                        S.n('keys', G(b, i * 0.5), Z.anthem_lead, m + 12, round((G(1) - G(0)) / 8 * 0.95, 3), 0.85, 0.75, db=-2)
                if b % 2 == 0:
                    S.n('keys', G(b), Z.screech, Y.bass_note(c, 57), round((G(1) - G(0)) * 0.45, 3), 0.7, -3.0, db=-6)
                S.n('pads', G(b), P.CHO('a', 22), tuple(Y.voicing(c, 57, 74)), round(G(1) - G(0), 3), 0.6, db=-2)
            S.n('fx', G(rng_[0]), Y.hit, 1.0, 40, db=-2)
            S.n('fx', G(rng_[0]), Y.cymbal, 1.0, 3.0, db=-3)
        # the slow-motion break (bars 5-9): pads, choir, the anthem slowed
        chords_bars(G, (5, 10), ['Gm9', 'Bbmaj7', 'Gm9'], P.PAD(0.3, 23, 0.4, 2.5), 'pads', 52, 70, 0.7, 0, every=2)
        S.n('pads', G(5), P.CHO('o', 23), tuple(Y.voicing('Gm9', 55, 74)), round(G(10) - G(5), 3), 0.6, db=-2)
        # build 2 (bars 10-13): the kicks roll, the snares roll, the riser, a beat of silence before the scan drop
        roll(S, G, 'kick', 10, 13.75, lambda v: Z.hard_kick(v, 55.0, 0.18, 6.0, 1.0), db=-3)
        roll(S, G, 'drums', 11, 13.75, Y.snare, db=-3)
        S.n('fx', G(10), Y.riser, G(13.75) - G(10), 0.9, db=-2)
        S.n('fx', G(36), Y.hit, 1.0, 41, db=-2)


# ---------------------------------------------------------------- 2 phonk

CB_RIFF = [74, None, 74, None, 77, None, 74, 72, None, 74, None, 69, 70, None, 69, None]
CB_RIFF2 = [74, None, 74, None, 77, None, 79, 77, None, 75, None, 74, 72, None, 69, None]
PH_808 = ['D', 'D', 'Bb', 'A']


class V2(Style):
    name, title = 'phonk', 'Drift phonk (130 BPM)'
    music_db = gap_db(main=504.75)
    sidechain = ('kick', ('pads', 'keys', 'perc'), -5.0)
    bus_lufs = {'kick': -19.0, 'drums': -23.0, 'bass': -19.0, 'keys': -22.0, 'pads': -27.0, 'orch': -26.0, 'perc': -28.0, 'fx': -26.0}

    @staticmethod
    def music(S):
        S.drop(MUS, 440.0, 545.0)
        G = Z.grid(130, DROP)
        bar = G(1) - G(0)
        s16 = round(bar / 16 * 0.9, 3)
        ch = ['Dm', 'Dm', 'Bb', 'A']

        def cowbells(b, riff, vel, db):
            for i, m in enumerate(riff):
                if m is not None:
                    S.n('keys', G(b, i / 4), Z.cowbell, m, s16 * 1.6, vel, db=db)

        def b808s(b, vel, db, d=1.0):
            r = Y.bass_note(ch[b % 4], 26)
            prev = Y.bass_note(ch[(b - 1) % 4], 26)
            S.n('bass', G(b), Z.b808, r, round(bar * 0.48, 3), vel, prev if prev != r else None, 3.0, db=db)
            S.n('bass', G(b, 2.5), Z.b808, r + 12 if b % 2 else r, round(bar * 0.35, 3), vel * 0.9, r, 3.0, db=db)

        chords_bars.S = S
        chords_bars(G, (-16, -1), ch, P.PAD(0.25, 31, 1.0, 2.5), 'pads', 50, 66, 0.55, 0, every=1)
        for b in range(-14, -1):
            cowbells(b, CB_RIFF if b % 4 != 3 else CB_RIFF2, 0.5, -10 + max(0, b + 8) * 0.8)
        for b in range(-8, -1):
            b808s(b, 0.7, -4)
            Z.steps(S, G, 'perc', [b], Y.hat, 'o-o-o-o-o-o-o-o-', db=-9)
        for b in (-4, -3):
            S.n('perc', G(b, 3), Z.hat_roll, 0.7, 12, round(bar / 4, 3), db=-8)
        S.n('fx', G(-4), Y.riser, G(-1.2) - G(-4), 0.7, db=-4)
        for rng_ in ((0, 4), (12, 31)):
            for b in range(*rng_):
                Z.steps(S, G, 'kick', [b], lambda v: Z.hard_kick(v, 50.0, 0.22, 3.0, 1.0), 'X.....x...x.....', db=-1)
                S.n('drums', G(b, 2), Z.clap, 1.0, db=0)
                S.n('drums', G(b, 2), Y.snare, 0.8, db=-3)
                Z.steps(S, G, 'perc', [b], Y.hat, 'x-x-x-x-x-x-x-x-', db=-7)
                if b % 2:
                    S.n('perc', G(b, 3.5), Z.hat_roll, 0.75, 6, round(bar / 8, 3), db=-7)
                cowbells(b, CB_RIFF if b % 4 != 3 else CB_RIFF2, 0.9, 0)
                b808s(b, 1.0, 0)
            S.n('fx', G(rng_[0]), Y.hit, 1.0, 50, db=-2)
        chords_bars(G, (4, 9), ['Gm9', 'Bbmaj7'], P.PAD(0.3, 33, 0.5, 2.5), 'pads', 52, 70, 0.7, 0, every=2)
        for b in range(4, 9):
            cowbells(b, CB_RIFF, 0.35, -12)
        for b in range(9, 12):
            Z.steps(S, G, 'kick', [b], lambda v: Z.hard_kick(v, 50.0, 0.2, 3.0, 1.0), 'X.......X.......' if b < 11 else 'X...X...X.X.XXXX', db=-3)
            S.n('perc', G(b, 2), Z.hat_roll, 0.6 + 0.1 * (b - 9), 8 + 4 * (b - 9), round(bar / 2, 3), db=-8)
        S.n('fx', G(9), Y.riser, G(11.9) - G(9), 0.8, db=-3)
        S.n('fx', G(31), Y.hit, 1.0, 51, db=-2)


# ---------------------------------------------------------------- 3 frenchcore


class V3(Style):
    name, title = 'frenchcore', 'Frenchcore (195 BPM)'
    music_db = gap_db(main=504.75)
    sidechain = ('kick', ('pads', 'orch', 'keys', 'perc'), -7.0)

    @staticmethod
    def music(S):
        S.drop(MUS, 440.0, 545.0)
        G = Z.grid(195, DROP)
        bar = G(1) - G(0)
        chords_bars.S = S
        ch = ['Dm', 'Bb', 'Gm', 'A']
        chords_bars(G, (-24, -1), ch, P.STR(0.5, 1.2, 0.5, 41), 'orch', 50, 70, 0.65, 0, every=2)
        theme = [(m, b * 2) for m, b in P.THEME_A]                                         # the theme, at half time
        t = G(-16)
        for m, b in theme:
            S.n('keys', t, Y.epiano, m, round(b * bar / 4 * 0.95, 3), 0.6, db=-2)
            t += b * bar / 4
        for b in range(-10, -2):                                                        # the kicks start playing the roots
            for q in range(4):
                S.n('kick', G(b, q), Z.french_kick, Y.bass_note(ch[(b // 2) % 4], 38), 0.55, 0.12, db=-5)
        roll(S, G, 'drums', -6, -1.5, Y.snare, db=-4)
        S.n('fx', G(-6), Y.riser, G(-1.5) - G(-6), 0.8, db=-3)
        for rng_ in ((0, 7), (18, 47)):
            for b in range(*rng_):
                c = ch[(b // 2) % 4]
                r = Y.bass_note(c, 38)
                mel = [r, r, r + 12, r] if b % 2 == 0 else [r + 7, r, r + 10, r + 12]       # the kick melody
                for q in range(4):
                    S.n('kick', G(b, q), Z.french_kick, mel[q], 1.0, 0.2)
                Z.steps(S, G, 'perc', [b], Y.hat, '..x...x...x...x.', db=-6)
                S.n('drums', G(b, 1), Z.clap, 0.6, db=-6)
                S.n('drums', G(b, 3), Z.clap, 0.6, db=-6)
            # the theme on a screaming lead
            t = G(rng_[0])
            for m, b2 in theme * 2:
                if t >= G(rng_[1]):
                    break
                S.n('keys', t, Z.anthem_lead, m + 12, round(b2 * bar / 4 * 0.95, 3), 0.8, 0.7, db=-1)
                t += b2 * bar / 4
            S.n('fx', G(rng_[0]), Y.hit, 1.0, 60, db=-2)
            S.n('fx', G(rng_[0]), Y.cymbal, 1.0, 3.0, db=-3)
        S.n('orch', G(7), P.STR(0.6, 2.0, 0.5, 42), tuple(Y.voicing('Gm9', 52, 74)), round(G(13) - G(7), 3), 0.75, db=0)
        S.n('pads', G(7), P.CHO('a', 43), tuple(Y.voicing('Gm9', 55, 74)), round(G(13) - G(7), 3), 0.7, db=-1)
        roll(S, G, 'kick', 13, 17.75, lambda v: Z.french_kick(38, v, 0.08), db=-2)
        S.n('fx', G(13), Y.riser, G(17.75) - G(13), 0.9, db=-2)
        S.n('fx', G(47), Y.hit, 1.0, 61, db=-2)


# ---------------------------------------------------------------- 4 hard techno

ACID = [(38, 1, 0), (38, 0, 0), (50, 1, 1), (38, 0, 0), (41, 0, 0), (38, 0, 1), (48, 1, 0), (38, 0, 0),
        (38, 1, 0), (50, 0, 1), (38, 0, 0), (41, 1, 0), (43, 0, 1), (38, 0, 0), (46, 1, 0), (45, 0, 1)]   # (note, accent, slide)


class V4(Style):
    name, title = 'techno', 'Hard techno (150 BPM)'
    music_db = gap_db()
    sidechain = ('kick', ('pads', 'keys', 'bass', 'perc'), -9.0)
    bus_lufs = {'kick': -18.0, 'drums': -25.0, 'bass': -21.0, 'keys': -24.0, 'pads': -27.0, 'orch': -26.0, 'perc': -27.0, 'fx': -26.0}

    @staticmethod
    def music(S):
        S.drop(MUS, 440.0, 545.0)
        G = Z.grid(150, DROP)
        bar = G(1) - G(0)
        s16 = round(bar / 16, 4)

        def acid_bar(b, cut, vel=0.8):
            prev = None
            for i, (m, acc, sl) in enumerate(ACID):
                S.n('bass', G(b, i / 4), Z.acid, m, round(s16 * (1.05 if sl else 0.7), 3), vel, float(acc), prev if sl else None, float(round(cut, -1)), 0.85)
                prev = m

        for b in range(-19, -1):                                                         # the kick from the start
            Z.steps(S, G, 'kick', [b], lambda v: Z.rumble_kick(v, 50.0, 0.8, round(bar / 4, 4)), 'X...X...X...X...', db=-2 if b > -12 else -6)
            Z.steps(S, G, 'perc', [b], Y.hat, '..x...x...x...x.', db=-6)
            if b >= -12:
                acid_bar(b, 300 + 60 * (b + 12), 0.7)
            if b >= -8:
                S.n('drums', G(b, 1), Z.clap, 0.8, db=-3)
                S.n('drums', G(b, 3), Z.clap, 0.8, db=-3)
        roll(S, G, 'drums', -5, -1.2, Y.snare, db=-5)
        S.n('fx', G(-5), Y.riser, G(-1.2) - G(-5), 0.8, db=-3)
        for rng_ in ((0, 5), (14, 36)):
            for b in range(*rng_):
                Z.steps(S, G, 'kick', [b], lambda v: Z.rumble_kick(v, 50.0, 1.0, round(bar / 4, 4)), 'X...X...X...X...')
                Z.steps(S, G, 'perc', [b], Y.hat, '-.x--.x--.x--.x-', db=-5)
                S.n('drums', G(b, 1), Z.clap, 1.0, db=-1)
                S.n('drums', G(b, 3), Z.clap, 1.0, db=-1)
                acid_bar(b, 900 + 300 * np.sin(b * 0.7), 0.9)
                for q in (0.5, 1.75, 2.5):                                               # stabs
                    S.n('keys', G(b, q), Z.screech, Y.bass_note(PROG[b % 8], 62), round(bar / 16, 3), 0.6, 0.0, db=-6)
                if b % 4 == 3:
                    Z.steps(S, G, 'drums', [b], lambda v: Y.tom(140.0, v), '........x.x.xxxx', db=-4)
            S.n('fx', G(rng_[0]), Y.hit, 1.0, 70, db=-2)
        for b in range(5, 10):
            acid_bar(b, 260 + 40 * (b - 5), 0.6)
        S.n('pads', G(5), P.PAD(0.3, 71, 0.5, 2.5), tuple(Y.voicing('Dm', 50, 66)), round(G(10) - G(5), 3), 0.6, db=0)
        for b in range(10, 14):
            Z.steps(S, G, 'kick', [b], lambda v: Z.rumble_kick(v, 50.0, 0.6, round(bar / 4, 4)), 'X...X...X...X...' if b < 12 else 'X.X.X.X.XXXXXXXX', db=-3)
            acid_bar(b, 400 + 200 * (b - 10), 0.75)
        S.n('fx', G(10), Y.riser, G(13.8) - G(10), 0.9, db=-2)
        S.n('fx', G(36), Y.hit, 1.0, 71, db=-2)


# ---------------------------------------------------------------- 5 rage

RAGE = [[74, 77, 81, 79, 77, 74, 72, 74], [70, 74, 77, 76, 74, 70, 69, 70], [72, 76, 79, 77, 76, 72, 71, 72], [69, 73, 76, 74, 73, 69, 76, 73]]


class V5(Style):
    name, title = 'rage', 'Rage / dark trap (150 BPM, half time)'
    music_db = gap_db()
    sidechain = ('kick', ('pads', 'keys'), -4.0)
    bus_lufs = {'kick': -20.0, 'drums': -23.0, 'bass': -19.0, 'keys': -20.0, 'pads': -27.0, 'orch': -26.0, 'perc': -28.0, 'fx': -26.0}

    @staticmethod
    def music(S):
        S.drop(MUS, 440.0, 545.0)
        G = Z.grid(150, DROP)
        bar = G(1) - G(0)
        ch = ['Dm', 'Bb', 'C', 'A']
        chords_bars.S = S
        chords_bars(G, (-19, -1), ch, P.PAD(0.3, 81, 1.0, 3.0), 'pads', 50, 66, 0.55, 0, every=2)

        def lead_bar(b, vel, db):
            for i, m in enumerate(RAGE[(b // 2) % 4] if b % 2 == 0 else RAGE[(b // 2) % 4][4:] + RAGE[(b // 2) % 4][:4]):
                S.n('keys', G(b, i * 0.5), Z.rage_lead, m, round(bar / 8 * 0.9, 3), vel, db=db)

        def b808s(b, vel):
            r = Y.bass_note(ch[(b // 2) % 4], 26)
            prev = Y.bass_note(ch[((b - 1) // 2) % 4], 26)
            S.n('bass', G(b), Z.b808, r, round(bar * 0.7, 3), vel, prev if (b % 2 == 0 and prev != r) else None, 2.2)
            S.n('bass', G(b, 3), Z.b808, r + (12 if b % 2 else 7), round(bar * 0.24, 3), vel * 0.85, r, 2.2)

        for b in range(-14, -1):
            lead_bar(b, 0.45, -8 + max(0, b + 8))
        for b in range(-8, -1):
            Z.steps(S, G, 'perc', [b], Y.hat, 'x-x-x-x-x-x-x-x-', db=-9)
            b808s(b, 0.7)
        S.n('perc', G(-2), Z.hat_roll, 0.7, 24, round(bar * 0.9, 3), db=-7)
        S.n('fx', G(-5), Y.riser, G(-1.2) - G(-5), 0.8, db=-4)
        for rng_ in ((0, 5), (14, 36)):
            for b in range(*rng_):
                Z.steps(S, G, 'kick', [b], lambda v: Z.hard_kick(v, 48.0, 0.25, 2.5, 1.0), 'X.....x.........' if b % 2 == 0 else 'X.........x.....')
                S.n('drums', G(b, 2), Z.clap, 1.0, db=0)
                S.n('drums', G(b, 2), Y.snare, 0.9, db=-2)
                Z.steps(S, G, 'perc', [b], Y.hat, 'xxx-xx-xxxx-x-xx' if b % 4 == 3 else 'x-x-x-x-x-x-x-x-', db=-6)
                if b % 4 == 1:
                    S.n('perc', G(b, 3), Z.hat_roll, 0.8, 9, round(bar / 4, 3), db=-6)
                lead_bar(b, 0.9, 0)
                b808s(b, 1.0)
            S.n('fx', G(rng_[0]), Y.hit, 1.0, 80, db=-2)
        S.n('pads', G(5), P.CHO('o', 82), tuple(Y.voicing('Gm9', 55, 74)), round(G(10) - G(5), 3), 0.7, db=-1)
        for b in range(5, 10):
            lead_bar(b, 0.35, -10)
        for b in range(10, 14):
            Z.steps(S, G, 'kick', [b], lambda v: Z.hard_kick(v, 48.0, 0.2, 2.5, 1.0), 'X.......X.......' if b < 12 else 'X...X...X.X.XXXX', db=-3)
            S.n('perc', G(b, 2), Z.hat_roll, 0.6 + 0.08 * (b - 10), 8 + 4 * (b - 10), round(bar / 2, 3), db=-7)
        S.n('fx', G(10), Y.riser, G(13.8) - G(10), 0.9, db=-2)
        S.n('fx', G(36), Y.hit, 1.0, 81, db=-2)


VARIANTS = {1: V1, 2: V2, 3: V3, 4: V4, 5: V5}


# ---------------------------------------------------------------- round 2: the railgun kit leads (sound_lab/railgun.py)
# Measured with audio_analyzer.layers: in round 1 the blast masked the breech, the crack and the ring, and the
# hardstyle build masked the charge in its last 5 s. Now each part has its own moment and band; the music's riser
# is replaced by the chargers' whine; the music strips back for the last 8 s of the charge; the drop comes a bar
# later so the shot has 2.7 s.

DROP2 = 484.2                     # one bar (150 BPM) after DROP


def railgun_foley(E, S):
    from sound_lab import railgun as RG
    E('water', 455.0, F.charge_hum(8.4, 40, 55, 700, buzz=0.25), -8, env=[(0, -30), (6, -6), (8.2, 0), (8.4, -60)])
    for k, t in enumerate((456.4, 458.9, 461.1)):
        E('water', t, F.discharge(710 + k, 0.6), -12)
    ch, banks = RG.charge_parts(468.5, 479.55, seed=900)
    for name, items in ch.items():
        for t, x in items:
            E('deck', t, x, RG.PARTS_DB[name] + (2 if name == 'whine' else 1 if name in ('bank_arm', 'arcs') else 0))
    E('sky', REL, RG.dump(940), RG.PARTS_DB['dump'])
    for name, (off, x) in RG.shot_parts(950).items():
        E('sky' if name in ('echoes', 'roll') else 'deck', SHOT + off, x, RG.PARTS_DB[name])
    E('sky', SHOT + 0.05, F.flight(7.0, 435), -14)
    E('deck', 483.0, F.cool_ticks(8.5, 3.0, 790), -14)


def round2_db(drop=DROP2, main=505.0):
    """The build pulls back under the charge (the whine and the banks lead), silence for the dump and the shot,
    the drop a bar later."""
    return [(446, -7), (468.5, -7), (471.5, -8.5), (479.5, -9.5), (479.6, -60), (drop - 0.05, -60), (drop, -4), (490.4, -3),
            (main - 0.1, -2), (main, 0), (541.5, 0)]


FOLEY_DB2 = [(446, -2), (468.5, -2), (479.5, -1), (479.65, -9), (480.4, -9), (480.45, 0), (484, 0), (486, -1), (490, -3), (541.5, -2)]


class V6(V1):
    name, title = 'hardstyle_r2', 'Hardstyle, the railgun leading'
    music_db = round2_db()
    foley_db = FOLEY_DB2

    @staticmethod
    def foley(E, S):
        railgun_foley(E, S)

    @staticmethod
    def music(S):
        V1.music(S)
        S.drop(('fx',), 466.0, 481.4)                                     # the chargers' whine is the riser now
        G = Z.grid(150, DROP)
        S.n('fx', G(1), Y.hit, 1.0, 42, db=-2)
        S.n('fx', G(1), Y.cymbal, 1.0, 3.0, db=-3)


class V7(V5):
    name, title = 'rage_r2', 'Rage, the railgun leading'
    music_db = round2_db()
    foley_db = FOLEY_DB2

    @staticmethod
    def foley(E, S):
        railgun_foley(E, S)

    @staticmethod
    def music(S):
        V5.music(S)
        S.drop(('fx',), 466.0, 481.4)
        G = Z.grid(150, DROP)
        S.n('fx', G(1), Y.hit, 1.0, 82, db=-2)


VARIANTS.update({6: V6, 7: V7})
