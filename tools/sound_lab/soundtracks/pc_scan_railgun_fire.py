"""SCAN · RAILGUN: five takes on the charge and the shot (30 s before it to 10 s after), each its own idea.

    python tools/sound_lab/soundtracks/pc_scan_railgun.py --fire                      all five -> renders/pc_scan_railgun_sound/fire/
    python tools/sound_lab/soundtracks/pc_scan_railgun.py --fire 2 4 --video <render>  some, muxed onto that stretch (1080p)

The window: under the hull with the heat sink out (451.5), the lens surfaces (463.35), the rails charge (468.5), the
fire chapter (480.19), the banks dump (480.49), the round leaves the muzzle (481.5), lightning round the muzzle, the
flight, the burst begins (490.55). A variant replaces the draft's charge-and-shot foley (`fire_base`), may drop and add
score events, and overrides the music and foley levels (and can muffle the whole mix) inside the window.

  1 capacitor_bank  the banks fill in eight waves of contactors sweeping across, a charging hum climbing an octave,
                    the interlock slams at full charge and the world goes quiet; the shot rings the rails like a struck
                    bar and the hot steel ticks as it cools
  2 heartbeat       a heart under the hull, racing as the banks fill, an endlessly rising tone beneath it; total
                    silence, one deep beat as the banks dump; the shot drops a sub out of the world and everything is
                    muffled, opening back up over seven seconds
  3 storm           thunder rolling far off under the water; static gathering on the rails, arcs snapping faster and
                    faster, thunder closing in, the wind rising; the air goes dead still; the shot is a thunderclap at
                    arm's length, rolling away across the sea
  4 coilgun         the pulsed alternators wind up to a roar, the mount's locks clamp, the twelve coil stations arm one
                    by one down the barrel; the stages fire in a racing ripple (ka-ka-ka-BOOM), the alternators coast
                    down, steam vents and the mount settles
  5 trailer         a clock ticking faster and faster, an endlessly rising tone in the strings, braams climbing a
                    step each time with taikos under them; a reverse swell into silence; a choir-and-brass slam with the
                    shot and a slow-motion echo of the boom
"""
import numpy as np

from sound_lab import foley as F, synth as Y
import pc_scan_railgun as P

W0, W1 = 451.5, 491.5
SURF, CH, REL, SHOT = 463.35, 468.5, 480.49, 481.5
MUS = ('pads', 'orch', 'keys', 'bass', 'drums', 'perc', 'fx')


def muzzle(E, db=0.0):
    """The lime lightning crawling round the muzzle as the round leaves, and the round tearing away (shared)."""
    E('sky', SHOT + 0.05, F.flight(7.0, 435), -9 + db)
    E('sky', SHOT + 0.1, F.corona(3.8, [(0, 1.0), (2.5, 0.6), (3.8, 0.0)], 436), -13 + db)
    for k, t in enumerate((481.75, 482.1, 482.35, 482.8, 483.3, 483.65, 484.2, 484.7)):
        E('sky', t, F.arc_crack(600 + k, 0.5 + 0.1 * (k % 3)), -13 - 0.8 * k + db, pan=0.6 * np.sin(k * 1.9))
    E('sky', 485.3, F.wind(5.0, 0.4, 436), -18)


class V1:
    name = 'capacitor_bank'
    title = 'Capacitor bank'

    @staticmethod
    def foley(E, S):
        E('water', 455.0, F.charge_hum(8.4, 40, 50, 700, buzz=0.2), -9, env=[(0, -30), (6, -6), (8.2, 0), (8.4, -60)])
        E('deck', 464.0, F.charge_hum(15.45, 45, 110, 701), -6, env=[(0, -24), (4.5, -12), (15.3, 0), (15.45, -80)])
        banks = [468.6 + 10.6 * (1 - (1 - k / 8) ** 1.35) for k in range(8)]          # eight banks, faster and faster
        for k, t in enumerate(banks):
            pan = -0.85 + 0.24 * k
            E('deck', t, F.latch(1.3, 710 + k, gap=0.01, ring=0.3), -4, pan=pan)
            E('deck', t + 0.03, F.energize(0.9, 720 + k, hold=0.35), -12, pan=pan)
            for j in range(12):                                                        # its twelve modules
                E('deck', t + 0.06 + j * 0.028, F.latch(0.32, 740 + 12 * k + j, gap=0.005, ring=0.07), -18, pan=min(0.95, pan + 0.02 * j))
        E('deck', 469.6, F.corona(9.8, [(0, 0.0), (9.8, 0.8)], 760), -18, env=[(0, -30), (9.7, 0), (9.8, -80)])
        E('deck', 479.45, F.breaker(761), 1)                                              # full charge: the interlock
        E('deck', 479.47, F.clank(3.4, 762, 0.5), -2)
        E('sky', REL, F.release(763), -7)
        E('sky', REL, F.lp(F.arc_crack(764, 1.2), 1800), -8)
        E('sky', SHOT, F.railgun_shot(434), 0)
        E('sky', SHOT, F.arc_crack(765, 1.6), -3)
        E('deck', SHOT + 0.02, F.metal(6.0, 3.2, 0.9, 766, 0.3, f0=87.3), -7)               # the rails ring (F, in key)
        E('deck', SHOT + 0.02, F.metal(3.0, 2.5, 0.9, 767, 0.0, f0=174.6), -9)
        muzzle(E)
        E('deck', 483.0, F.cool_ticks(8.5, 3.0, 770), -13)

    @staticmethod
    def music(S):
        S.drop(('fx',), 466.0, 481.4)                                                    # the banks are the riser

    music_db = [(466.0, -4.5), (468.5, -9), (479.3, -6), (479.4, -60), (481.45, -60), (481.5, -12), (482.6, -11), (483.8, -5.5)]
    foley_db = [(466.0, -2), (468.5, -3), (479.4, -2), (479.6, -8), (481.4, -8), (481.5, 0), (483.5, -1), (486, -2), (490, -4)]
    muffle = None


class V2:
    name = 'heartbeat'
    title = 'Heartbeat'

    @staticmethod
    def foley(E, S):
        E('water', 452.0, F.heartbeat(list(np.arange(0.0, 11.0, 60 / 54)), 800), -1)
        ts, t = [], 0.0
        while t < 479.55 - 463.6:
            ts.append(t)
            t += 60 / (60 + 105 * (t / 15.95) ** 1.6)
        E('deck', 463.6, F.heartbeat(ts, 801), 0, env=[(0, -8), (15.9, 0)])
        E('sky', 465.0, F.shepard(14.55, 0.11, 27.5, 7, 802, 0.3), -7, env=[(0, -30), (6, -12), (14.4, 0), (14.55, -80)])
        E('sky', CH, F.charge_hum(11.0, 40, 80, 803, buzz=0.15), -16, env=[(0, -30), (10.9, 0), (11.0, -80)])
        E('sky', REL, F.heartbeat([0.0], 804, depth=1.6), 0)                              # one deep beat: the dump
        E('sky', REL, F.release(805), -12)
        E('sky', SHOT, F.railgun_shot(434), 0)
        E('sky', SHOT, Y.sub_drop(4.5, 1.0, 70, 30), -10)
        muzzle(E, -3)

    @staticmethod
    def music(S):
        S.drop(MUS, 465.0, 481.4)                                                        # the heart carries the build

    music_db = [(462.0, -4.5), (465.0, -14), (467.0, -60), (481.45, -60), (481.5, -6), (484.0, -5), (488.0, -4), (490.55, -6)]
    foley_db = [(466.0, -2), (479.6, -1), (479.7, -10), (481.4, -10), (481.5, -2), (486, -3), (490, -4)]
    muffle = [(481.55, 20000.0), (481.62, 260.0), (484.5, 420.0), (487.5, 1600.0), (489.5, 20000.0)]


class V3:
    name = 'storm'
    title = 'Storm'

    @staticmethod
    def foley(E, S):
        E('water', 453.5, F.thunder(7.0, 0.9, 820, crack=0), -3)
        E('water', 458.8, F.thunder(7.0, 0.8, 821, crack=0), -1)
        E('deck', 463.4, F.wind(16.3, 0.7, 822, speed=[(0, 0.1), (16.3, 0.9)]), -8, env=[(0, -20), (12, -4), (16.2, 0), (16.3, -80)])
        E('deck', CH, F.corona(11.1, [(0, 0.1), (11.1, 1.0)], 823), -9, env=[(0, -24), (11.0, 0), (11.1, -80)])
        E('deck', CH, F.steam(11.1, [(0, 0.05), (11.1, 1.0)], 824, bright=0.2, roar=0.4), -20, env=[(0, -30), (11.0, 0), (11.1, -80)])
        r = np.random.default_rng(825)
        t, k = 469.0, 0
        while t < 479.5:                                                                  # arcs snapping across the rails
            a = (t - 469.0) / 10.5
            E('deck', t, F.arc_crack(830 + k, 0.3 + 0.5 * r.random()), -14 + 7 * a, pan=r.uniform(-0.8, 0.8))
            t += 1.0 / (0.9 + 9 * a ** 1.5)
            k += 1
        for t, d, c, db in ((470.6, 0.8, 0, -8), (474.1, 0.55, 0.6, -6), (477.2, 0.3, 1.0, -4)):   # thunder closing in
            E('sky', t, F.thunder(6.0, d, 900 + int(t), crack=c), db)
        E('sky', REL, F.arc_crack(905, 1.0), -8)
        E('sky', SHOT, F.railgun_shot(434), -1)
        E('sky', SHOT, F.thunder(10.0, 0.02, 906, crack=2.0), 0)                          # a thunderclap at arm's length
        muzzle(E, 2)
        E('sky', 486.0, F.thunder(6.0, 0.7, 907, crack=0), -9)

    @staticmethod
    def music(S):
        S.drop(('fx',), 466.0, 481.4)

    music_db = [(466.0, -4.5), (468.5, -7), (479.6, -5), (479.65, -60), (481.45, -60), (481.5, -12), (483.0, -12), (486.0, -6)]
    foley_db = [(466.0, -2), (468.5, -3), (479.6, -2), (479.7, -6), (481.4, -6), (481.5, -2), (486, -1), (490, -3)]
    muffle = None


class V4:
    name = 'coilgun'
    title = 'Coilgun machine'

    @staticmethod
    def foley(E, S):
        E('water', 452.0, F.rotor(11.5, 10.0, 35.0, seed=840), -5)
        E('deck', 463.4, F.rotor(17.1, 3.0, 70.0, seed=841, roar=1.5), -6, env=[(0, -12), (4, -4), (16.95, 0), (17.09, -60)])
        E('deck', 463.6, F.gears(16.9, [(0, 0.2), (4, 1), (16.9, 1)], 47, 60, seed=842), -14, env=[(0, 0), (16.8, 0), (16.9, -60)])
        for k, t in enumerate((464.6, 465.4, 466.1, 466.7)):                              # the mount's locks clamp
            E('deck', t - 0.25, F.hydraulic(0.35, [(0, 0), (0.1, 1), (0.3, 1), (0.35, 0)], 160, seed=860 + k, pump=0.2), -16)
            E('deck', t, F.latch(1.6, 850 + k), -5, pan=(-0.4, 0.4, -0.2, 0.2)[k])
        stations = [468.8 + 9.8 * (1 - (1 - k / 11) ** 1.25) for k in range(12)]           # twelve coil stations arm
        for k, t in enumerate(stations):
            pan = -0.85 + 0.155 * k
            E('deck', t, F.energize(1.7 - 0.07 * k, 870 + k, hold=0.5), -5, pan=pan)
            E('deck', t, F.latch(0.6, 890 + k, ring=0.15), -13, pan=pan)
        E('deck', 468.8, F.motor(10.7, [(0, 0.2), (10.7, 1.0)], 180, seed=900, gear=3.0, hum=0.3, bright=0.25), -15,
          env=[(0, -20), (10.6, 0), (10.7, -80)])
        E('sky', REL, F.release(901), -6)
        E('deck', REL, F.rotor_down(10.5, 70.0, 902, roar=1.4), -14)                       # the alternators coast down
        E('sky', SHOT - 0.24, F.coil_volley(12, 0.24, 903), -1)                            # the stages fire down the barrel
        E('sky', SHOT, F.railgun_shot(434), 0)
        muzzle(E, -2)
        E('deck', 483.0, F.steam(2.6, [(0, 1), (0.3, 1), (2.6, 0)], 904, bright=0.35), -9, pan=-0.4)
        E('deck', 485.6, F.steam(2.2, [(0, 1), (2.2, 0)], 905, bright=0.3), -12, pan=0.5)
        E('deck', 482.4, F.clank(3.2, 906, 0.4), -6)
        E('deck', 483.9, F.clank(2.6, 907, 0.4), -9)

    @staticmethod
    def music(S):
        S.drop(('fx',), 466.0, 481.4)

    music_db = [(466.0, -4.5), (468.5, -8), (479.6, -6), (479.65, -60), (481.25, -60), (481.5, -12), (482.6, -11), (483.8, -5.5)]
    foley_db = [(466.0, -2), (468.5, -4), (479.6, -3), (479.7, -6), (481.2, -6), (481.25, 0), (483.5, -1), (486, -2), (490, -4)]
    muffle = None


class V5:
    name = 'trailer'
    title = 'Cinematic trailer'

    @staticmethod
    def foley(E, S):
        P.fire_base(E)
        E('sky', SHOT + 0.35, F.slow(F.railgun_shot(434), 2.0), -5)                      # the boom again, in slow motion

    @staticmethod
    def music(S):
        S.drop(MUS, 466.0, 481.4)
        S.drop(('fx',), 481.4, 481.6)
        t, k = 455.0, 0
        while t < 479.6:                                                                  # a clock, ticking faster
            a = (t - 455.0) / 24.6
            S.n('perc', t, Y.tick, round(0.45 + 0.5 * a, 2), db=-2 + 4 * a)
            t += 0.31 * (1 - 0.8 * a ** 1.3)
            k += 1
        S.n('orch', 466.0, lambda: F.shepard(13.6, 0.12, 55.0, 6, 950, 0.55), db=-2,
            env=[(0, -24), (13.5, 0), (13.6, -80)])
        hits = [468.5, 470.9, 473.0, 474.9, 476.6, 478.1]
        for t, root in zip(hits, (38, 40, 41, 43, 45, 46)):                               # braams climbing a step
            S.n('fx', t, Y.braam, (root - 12, root, root + 7), 2.0, 0.85, db=-5)
            S.n('drums', t, P.TAIKO(48), 1.0, db=-1)
            S.n('orch', t, P.STR(0.1, 0.4, 0.6, 951), tuple(Y.voicing('Dm' if root in (38, 41, 45) else 'Bb' if root == 46 else 'C', root + 19, root + 34)),
                2.0, 0.8, db=-5)
        for i in range(48):                                                               # the taikos gather
            a = i / 47
            S.n('drums', 470.0 + 9.6 * (1 - (1 - a) ** 1.7), P.TAIKO(62 + 30 * (i % 2), i % 3), round(0.4 + 0.55 * a, 2), db=-6)
        S.n('pads', CH, P.CHO('a', 12), tuple(Y.voicing('Dm', 62, 79)), 11.1, 0.7, db=-3)
        S.n('fx', 479.65 - 3.0, Y.swell, 3.0, 0.9, db=-5)
        S.n('fx', SHOT, Y.hit, 1.0, 13, db=-3)
        S.n('fx', SHOT, Y.hit, 0.9, 77, 26, db=-5)
        S.n('fx', SHOT, Y.braam, (26, 38, 45, 50, 57), 4.5, 1.0, db=-6)
        S.n('pads', SHOT, P.CHO('a', 13), tuple(Y.voicing('Dm', 57, 81)), 1.4, 1.0, db=0)   # the choir's slam
        S.n('fx', SHOT, Y.cymbal, 1.0, 3.0, db=-4)
        E1 = P.Seg(481.5, 490.55, 4)
        P.drum(S, E1, range(4), P.TAIKO(70, 6), 'o-o-o-o-o-o-o-o-', db=-8)

    music_db = [(462.0, -4.5), (466.0, -4), (479.6, -3), (479.65, -60), (481.45, -60), (481.5, -8), (483.8, -4), (490.55, -4.5)]
    foley_db = [(466.0, -2), (468.5, -8), (479.8, -9), (479.9, -6), (481.4, -6), (481.5, 1), (483.5, 0), (486, -2), (490, -4)]
    muffle = None


VARIANTS = {1: V1, 2: V2, 3: V3, 4: V4, 5: V5}
