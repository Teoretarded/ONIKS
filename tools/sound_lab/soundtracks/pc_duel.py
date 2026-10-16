"""THE DUEL (reference/films/pc_duel/): the soundtrack, built on real recordings and timed by the render's markers.

    python tools/sound_lab/soundtracks/pc_duel.py --video <render.mp4> [--markers <json>] [--from s --to s]
        -> <render>_sound.mp4 (whole film: video stream copied; a part: cut exactly, 1080p) and the WAVs in
           reference/films/renders/pc_duel/sound/ (mix, music, foley stems by family; float stems sum to the mix
           before the limiter)

The story, in order (each beat: the chapter titles it may come under; a cue named snd:<beat> wins over the chapter,
see BEATS and README 'Sample layers'): night at sea; the engine rooms and the reactor; the power room, its banks
charging under liquid-helium cooling; the coils, the hydraulics, the mount training; the director and the radar on
a ship in orbit; the charge and the shot (the crack, the round climbing through plasma, the boom rolling back);
the silence of space; the hit on the orbital ship (a thud and a groan through its hull, no boom); the orbital ship
re-forming its barrel (machinery heard through the hull); its shot; the rod's fall (a rising roar, plasma tearing);
the strike on the destroyer (the crack, the rolling blast, tearing metal, secondaries, fire); the rod into the sea
(under the water: a muffled roar, boiling, bubbles); back at the surface (fire, steam, bubbles, groaning steel,
waves).

Every sound is a real recording (reference/sounds/refs, MANIFEST.md) cut, looped, varispeeded, stretched,
filtered, placed at a distance and in a space by sound_lab.samples; only a few small things stay physical models
(bubbles, frost, a sub thump). No beeps: the tags and the film's UI tones stay silent; the film's mechanical cues
(clunk, clack, whirr) become real contactors, clanks and motors.
"""
import argparse
import json
import os
import sys
import time as _time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, HERE)

from sound_lab import dsp, foley as F, mixer as MX, samples as S, timeline as TL  # noqa: E402
from sound_lab.dsp import SR, n_of  # noqa: E402
import pc_duel_score as SC  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
OUT = os.path.join(ROOT, 'reference', 'films', 'renders', 'pc_duel', 'sound')
B = TL.Beat

# ---------------------------------------------------------------- the story

BEATS = [   # (id, chapter titles, the film's named cue that marks it exactly)
    B('station', ['Station', 'Night', 'Sea']),
    B('machinery', ['Machinery', 'X-ray']),
    B('engines', ['Main engines', 'Engines', 'Engine room', 'Gas turbines']),
    B('gear', ['Reduction gear', 'Gear', 'Shafts']),
    B('reactor', ['Reactor']),
    B('steamgen', ['Steam generator', 'Boiler']),
    B('turbine', ['Steam turbine', 'Turbine']),
    B('condenser', ['Condenser']),
    B('generator', ['Generator']),
    B('powerrun', ['Power run', 'Feeders', 'Switchboard']),
    B('helium', ['Helium'], cue='helium_start'),
    B('powerroom', ['Power room', 'Banks', 'Capacitors']),
    B('alternators', ['Alternators'], cue='alternator_spinup'),
    B('coolant', ['Coolant']),
    B('bankcharge', ['Banks charge'], cue='bank_charge'),
    B('cryo', ['Cryo', 'Cryogenics']),
    B('coils', ['Coils']),
    B('hydraulics', ['Hydraulics']),
    B('sensors', ['Sensors', 'Director', 'Track', 'Radar']),
    B('lay', ['Lay', 'Train', 'Mount']),
    B('magazine', ['Magazine']),
    B('fab', ['Fabrication', 'Circuit', 'Lattice', 'Armature', 'Tolerance', 'Round']),
    B('load', ['Load']),
    B('heatsink', ['Heat sink', 'Heat sink · out']),
    B('charge', ['Charge'], cue='rail_charge'),
    B('fire', ['Fire', 'Shot'], cue='fire'),
    B('flight', ['Flight', 'Climb']),
    B('space', ['Exit', 'Coast', 'Space', 'Burst'], cue='exit_atmosphere'),
    B('hit', ['Strike', 'Hit', 'Impact'], cue='hit_orbital'),
    B('debris', ['Debris', 'Scan'], cue='fragments'),
    B('orbit', ['Orbit', 'Wake', 'Reactor', 'Radiators', 'Thrust', 'Detach']),
    B('rings', ['Rings', 'Breach', 'Ring', 'Split', 'Build', 'Calibrate', 'Reroute', 'Reconfigure', 'Breech', 'Chamber'],
      cue='barrel_build'),
    B('orb_charge', ['Charge'], cue='orbital_charge'),
    B('orb_fire', ['Fire'], cue='orbital_fire'),
    B('fall', ['Fall', 'Entry', 'Re-entry'], cue='entry_glow'),
    B('strike', ['Strike', 'Impact'], cue='rod_impact'),
    B('underwater', ['Under', 'Underwater', 'Sea floor', 'Sink', 'Dive'], cue='water_entry'),
    B('surface', ['Surface', 'Aftermath', 'Wreck', 'Return', 'Stow', 'Heat to sea', 'Heat sink · stow'], cue='surface'),
]

# where each beat is heard from (the ambience bed under it); chapters not in the story keep the previous place
PLACE = {
    'station': 'sea', 'machinery': 'engine', 'engines': 'engine', 'gear': 'engine', 'reactor': 'plant', 'steamgen': 'plant',
    'turbine': 'plant', 'condenser': 'plant', 'generator': 'plant', 'powerrun': 'power', 'helium': 'cryo', 'powerroom': 'power', 'alternators': 'power',
    'bankcharge': 'power', 'coolant': 'power', 'cryo': 'cryo', 'coils': 'deck', 'hydraulics': 'power', 'sensors': 'deck', 'lay': 'deck',
    'magazine': 'hangar', 'fab': 'hangar', 'load': 'hangar', 'heatsink': 'power', 'charge': 'deck', 'fire': 'deck',
    'flight': 'sky', 'space': 'space', 'hit': 'space', 'debris': 'space', 'orbit': 'space_in', 'rings': 'space_in',
    'orb_charge': 'space_in', 'orb_fire': 'space_in', 'fall': 'fall', 'strike': 'aftermath', 'underwater': 'underwater',
    'surface': 'aftermath',
}
SPACE_OF = {'engine': 'engine_room', 'plant': 'engine_room', 'power': 'power_room', 'cryo': 'power_room', 'hangar': 'hangar',
            'deck': 'deck', 'sea': 'open_sea', 'sky': 'sky', 'space': None, 'space_in': 'hull', 'fall': 'sky',
            'aftermath': 'open_sea', 'underwater': 'water'}


# ---------------------------------------------------------------- layer helpers


def lv(x, db, crest=18.0):
    """At db dBFS active RMS, its peaks held within `crest` dB of that (a stray click in a recording must not set
    the level of the whole mix)."""
    y = S.level(x, db)
    if np.abs(y).max() > 10 ** ((db + crest) / 20):
        y = dsp.limit(y, db + crest, 0.003, 0.05)
    return y


def pk(x, db):
    """Peak-normalise to db dBFS."""
    m = np.abs(x).max()
    return x * (10 ** (db / 20) / m) if m > 0 else x


class Kit:
    """The scene helpers, bound to the mixer and the timeline."""

    def __init__(self, M, T):
        self.M, self.T = M, T
        self.place_at = None

    # beds ---------------------------------------------------------------
    def bed(self, bus, t0, t1, key, db, seed=0, fin=2.0, fout=3.0, rate=None, eq=None, post=None, send=False, dw=None, **kw):
        """A recording's texture from t0 to t1 (faded in before t0, out after t1), at db dBFS RMS."""
        if t1 - t0 < 0.3:
            return
        L = t1 - t0 + fin + fout

        def fn():
            x = S.bed(key, L * (rate or 1.0) + 0.1, seed, fin=fin, fout=fout, **kw)
            if rate is not None and np.isscalar(rate):
                x = S.vari(x, rate)
            if dw:
                x = S.dewhistle(x, dw)
            if eq:
                x = S.eq(x, **eq)
            if post:
                x = post(x)
            return lv(x, db)
        self.M.add(bus, t0 - fin, fn, dur=L, send=send, why='bed ' + key)

    # one-shots ----------------------------------------------------------
    def hit(self, bus, t, key, i, db, semis=0.0, eq=None, top=40, pan=None, send=None, post=None, length=None, t0=0.0, t1=None,
            dw=None):
        def fn():
            x = S.hit(key, i, top=top, length=length, t0=t0, t1=t1)
            if semis:
                x = S.vari(x, 2 ** (semis / 12))
            if dw:
                x = S.dewhistle(x, dw)
            if eq:
                x = S.eq(x, **eq)
            if post:
                x = post(x)
            return pk(x, db)
        self.M.add(bus, t, fn, dur=6, pan=pan, send=send, why=f'hit {key}[{i}]')

    def seg(self, bus, t, key, start, length, db, rate=None, eq=None, pan=None, send=None, post=None, fin=0.02, fout=0.2,
            peak=False, env=None, dw=None):
        """length s of a recording from `start` s, optionally varispeeded (rate: scalar or [(t, rate)]), filtered,
        shaped by a dB envelope [(t, dB)], at db dBFS RMS (or peak)."""
        def fn():
            if rate is None:
                x = S.seg(key, start, length, fin, fout)
            elif np.isscalar(rate):
                x = S.vari(S.seg(key, start, length * rate + 0.05, fin, fout), rate)
            else:
                top = max(r for _, r in rate)
                x = dsp.fade(S.vari(S.seg(key, start, length * top + 0.1, 0.005, 0.005), rate, length=length), fin, fout)
            if dw:
                x = S.dewhistle(x, dw)
            if eq:
                x = S.eq(x, **eq)
            if env:
                x = S.envelope(x, env)
            if post:
                x = post(x)
            return pk(x, db) if peak else lv(x, db)
        self.M.add(bus, t, fn, dur=length + 4, pan=pan, send=send, why=f'seg {key}@{start:g}')

    def fn(self, bus, t, f, dur, db=0.0, pan=None, send=None, why=''):
        self.M.add(bus, t, f, dur=dur, db=db, pan=pan, send=send, why=why)

    # the mechanical vocabulary (the film's own cues land here) ---------
    def contactor(self, t, db=-16, send=None, seed=0, big=False):
        """A contactor / relay pulling in: a real one (two recordings, many strikes)."""
        if big or seed % 3 == 0:
            self.hit('mech', t, 'circuit_breaker_handling', seed % 23, db - 2 + (3 if big else 0), eq={'hp': 120}, top=30,
                     pan=((seed * 0.37) % 1.2) - 0.6, send=send, dw=900)
        else:
            self.hit('mech', t, 'contactor_overload_relay', seed % 29, db, eq={'hp': 150}, top=40,
                     pan=((seed * 0.53) % 1.2) - 0.6, send=send, dw=700)

    def clank(self, t, db=-12, send=None, seed=0, size=1.0, semis=None):
        """Heavy steel seating: a real metal door's clangs, pitched down for bigger parts."""
        sm = semis if semis is not None else -3.0 - 4.0 * (size - 1.0) - (seed % 3)
        self.hit('mech', t, 'metal_shed_door_hits', 3 + (seed * 7) % 37, db, semis=sm, eq={'hp': 35, 'lp': 9000}, top=60,
                 pan=((seed * 0.41) % 1.0) - 0.5, send=send)

    def motor(self, t, d, db=-20, send=None, seed=0, up=True, size=1.0):
        """A drive moving a part: a real electric actuator under load, its speed eased in and out; a big part
        (size > 1) moves slower and lower, with a travelling crane's rumble under it."""
        d = max(0.4, float(d))
        st = 1.0 + (seed % 5) * 2.0
        r0, r1 = (0.75, 1.0) if up else (1.0, 0.8)
        r0, r1 = r0 / size, r1 / size
        if size > 1.15:
            self.seg('mech', t, 'overhead_crane_factory', 52.0 + (seed % 6) * 4.0, d + 0.4, db - 3, rate=0.85 / size,
                     eq={'hp': 35, 'lp': 4000}, send=send, fin=0.15, fout=0.4)
        ramp = [(0, r0 * 0.6), (min(0.25, d * 0.2), r0), (d * 0.8, r1), (d, r1 * 0.7)]
        self.seg('mech', t, 'electric_actuator_load', st, d, db, rate=ramp, eq={'hp': 60, 'lp': 7000}, send=send,
                 fin=0.06, fout=min(0.3, d * 0.3), env=[(0, -20), (min(0.15, d * 0.2), 0), (max(0.2, d - 0.2), 0), (d, -30)],
                 pan=((seed * 0.29) % 1.0) - 0.5)

    def spin(self, t, d, db=-21, send=None, seed=0, key='electric_motor_fs', top=1.0, low=0.3, hold=4.0, eq=None):
        """A rotor spinning up: a running machine slowed down then brought to speed (varispeed), held, faded."""
        d = max(0.6, float(d))
        L = d + hold
        ramp = [(0, low), (d, top), (L, top)]
        e = [(0, -30), (d * 0.5, -6), (d, 0), (L - min(1.5, hold * 0.5), 0), (L, -40)]
        a0 = S.steady(key, 10.0)
        self.seg('mech', t, key, a0, L, db, rate=ramp, eq=eq or {'hp': 40, 'lp': 8000}, send=send, env=e, fin=0.1, fout=0.6,
                 dw=1500)

    def spindown(self, t, d, db=-22, send=None, seed=0, key='electric_motor_fs'):
        """A rotor running down: a running machine slowed to a stop (varispeed), fading as it goes."""
        d = max(0.6, float(d))
        a0 = S.steady(key, 10.0)
        self.seg('mech', t, key, a0, d, db, rate=[(0, 1.0), (d, 0.25)], eq={'hp': 40, 'lp': 7000}, send=send,
                 env=[(0, 0), (d * 0.6, -6), (d, -40)], fin=0.05, fout=0.3, dw=1500)

    def hiss(self, t, d, db=-24, send=None, seed=0, kind='gas'):
        """Gas or steam escaping (kind gas/steam/helium) or water running (water)."""
        d = max(0.5, float(d))
        if kind == 'water':
            st = 6.0 + (seed % 7) * 11.0
            ff = min(1.0, d * 0.3)
            self.seg('water', t, 'waves_lap_boat_hull', st, d, db, rate=0.8, eq={'hp': 120, 'lp': 3200}, send=send,
                     fin=0.3, fout=ff)
            self.seg('water', t, 'liquid_nitrogen_dispensing', 4.0 + (seed % 4) * 6.0, d, db - 4, rate=0.7, dw=600,
                     eq={'hp': 80, 'lp': 2500}, send=send, fin=0.3, fout=ff)
            self.seg('water', t, 'underwater_rumble', 3.0 + (seed % 5) * 8.0, d, db - 5, eq={'hp': 40, 'lp': 700},
                     fin=0.4, fout=ff)
        elif kind == 'helium':
            st = 10.0 + (seed % 5) * 7.0
            self.seg('mech', t, 'liquid_nitrogen_fs', st, d, db, eq={'hp': 1200, 'lp': 11000}, send=send, fin=0.4,
                     fout=min(1.2, d * 0.3), dw=1000)
        else:
            self.seg('mech', t, 'air_pressure_release', 11.6 + (seed % 3) * 0.6, min(d, 5.0), db,
                     eq={'hp': 300 if kind == 'gas' else 150, 'lp': 9000 if kind == 'gas' else 6000}, send=send,
                     fin=0.08, fout=min(1.0, d * 0.3))

    def hum(self, t, d, db=-22, send=None, seed=0, rise=1.0, env=None):
        """Electrical machinery energising: a transformer's hum swelling (rise > 1: the pitch creeping up with load)."""
        d = max(1.0, float(d))
        a0 = S.steady('transformer_hum_large_room', 8.0)
        ramp = [(0, 1.0), (d, rise)]
        self.seg('elec', t, 'transformer_hum_large_room', a0, d, db, rate=ramp, eq={'hp': 50, 'lp': 2500,
                 'peaks': [(240, 2, 1.0)]}, send=send, env=env or [(0, -24), (min(1.0, d * 0.4), 0), (d - 0.6, 0), (d, -30)],
                 fin=0.2, fout=0.5 if env is None else 0.01, dw=1000)


# ---------------------------------------------------------------- the beds by place


def beds(K, T):
    """The ambience of each place, crossfaded at the chapter changes (the place map PLACE)."""
    segs = []
    cur = None
    j2b = {j: b for b, j in T.match.items()}
    for j, c in enumerate(T.chapters):
        b = j2b.get(j)
        pl = PLACE.get(b, cur) if b else cur
        if pl is None:
            pl = 'sea'
        if not segs or segs[-1][0] != pl:
            segs.append([pl, c['t'], None])
        cur = pl
    for k in range(len(segs)):
        segs[k][2] = segs[k + 1][1] if k + 1 < len(segs) else T.duration
    for k, (pl, a, b) in enumerate(segs):
        s = 100 + k * 7
        fi = 0.3 if a <= 0.5 else 1.5
        if pl == 'sea':
            K.bed('amb', a, b, 'waves_lap_boat_hull', -30, s, fi, 2.5, eq={'hp': 60})
            K.bed('amb', a, b, 'waves_breaking_groyne', -34, s + 1, fi, 2.5, post=lambda x: S.distance(x, 300, ground=0.4))
            K.bed('amb', a, b, 'deep_ocean_rumble', -36, s + 2, fi, 2.5, eq={'lp': 220})
            K.fn('amb', a - fi, lambda L=b - a + fi + 2.5, s=s: lv(dsp.fade(dsp.stereo(F.wind(L, 0.3, s)), 1.5, 2.5), -40), b - a + 5)
        elif pl == 'engine':
            K.bed('amb', a, b, 'ferry_engine_room_1', -27, s, fi, 2.0)
            K.bed('amb', a, b, 'ferry_below_deck', -32, s + 1, fi, 2.0, eq={'lp': 4000})
        elif pl == 'plant':
            K.bed('amb', a, b, 'coal_power_plant_interior', -28, s, fi, 2.0, eq={'hp': 30})
            K.bed('amb', a, b, 'ferry_engine_room_2', -32, s + 1, fi, 2.0, eq={'lp': 1800})
        elif pl == 'power':
            K.bed('amb', a, b, 'control_room_tone', -32, s, fi, 2.0, eq={'hp': 25})
            K.bed('amb', a, b, 'large_ventilation_fan', -36, s + 1, fi, 2.0, eq={'lp': 5000})
            K.bed('amb', a, b, 'transformer_hum_large_room', -38, s + 2, fi, 2.0, eq={'lp': 1500}, dw=1000)
        elif pl == 'cryo':
            K.bed('amb', a, b, 'dry_scroll_pump', -32, s, fi, 2.0, eq={'hp': 40, 'lp': 9000}, dw=1200)
            K.bed('amb', a, b, 'liquid_air_plant', -33, s + 1, fi, 2.0, eq={'lp': 7000}, dw=1200)
            K.bed('amb', a, b, 'control_room_tone', -36, s + 2, fi, 2.0)
        elif pl == 'deck':
            K.bed('amb', a, b, 'waves_lap_boat_hull', -34, s, fi, 2.5, eq={'hp': 60})
            K.bed('amb', a, b, 'waves_breaking_groyne', -36, s + 1, fi, 2.5, post=lambda x: S.distance(x, 500, ground=0.4))
            K.bed('amb', a, b, 'industrial_fan_3', -42, s + 2, fi, 2.5, eq={'lp': 2500})
            K.fn('amb', a - fi, lambda L=b - a + fi + 2.5, s=s: lv(dsp.fade(dsp.stereo(F.wind(L, 0.35, s)), 1.5, 2.5), -38), b - a + 5)
        elif pl == 'hangar':
            K.bed('amb', a, b, 'industrial_workshop_ambience', -32, s, fi, 2.0, eq={'lp': 6000}, dw=900)
            K.bed('amb', a, b, 'large_ventilation_fan', -36, s + 1, fi, 2.0)
        elif pl == 'space':
            K.bed('amb', a, b, 'deep_ocean_rumble', -50, s, fi, 2.5, eq={'lp': 140})
        elif pl == 'space_in':
            K.bed('amb', a, b, 'electric_ferry_motor', -33, s, fi, 2.5, post=S.through_hull)
            K.bed('amb', a, b, 'liquid_air_plant', -37, s + 1, fi, 2.5, post=S.through_hull, dw=1200)
        elif pl == 'underwater':
            K.bed('amb', a, b, 'underwater_ambience', -26, s, 0.15, 1.0, eq={'lp': 1500})
            K.bed('amb', a, b, 'underwater_rumble', -28, s + 1, 0.15, 1.0)
        elif pl == 'aftermath':
            K.bed('amb', a, b, 'waves_breaking_groyne', -33, s, fi, 3.0, post=lambda x: S.distance(x, 120))
            K.bed('amb', a, b, 'waves_lap_boat_hull', -35, s + 1, fi, 3.0)
            K.bed('amb', a, b, 'deep_ocean_rumble', -36, s + 2, fi, 3.0, eq={'lp': 220})
        # 'space', 'sky', 'fall': no bed (silence, or the event itself is the sound)
    return segs


# ---------------------------------------------------------------- scenes


def fire_bed(L, seed=0):
    """A ship burning: arc-welding crackle slowed an octave (the pops of a fire), a low roar, a few louder pops."""
    a = S.bed('welding_continuous', L / 0.5 + 0.2, seed, fin=0.5, fout=1.0)
    a = S.eq(S.vari(a, 0.5)[:n_of(L)], hp=120, lp=5000)
    r = S.bed('rocket_launch_rumble_canaveral', L, seed + 1, fin=1.0, fout=1.5, t0=40, t1=120)
    r = S.eq(r, lp=260, hp=25)
    y = lv(a, -31)[:n_of(L)]
    y = y + lv(r, -31)[:len(y)]
    return y


def scenes(K, T, log=print):
    at, span = T.at, T.span
    M = K.M

    # ---- the engines: gas turbines lighting off and running up (real gas-turbine starts), the engine room
    s = span('engines', note=False)
    if s:
        a, b = s
        K.seg('mech', a + 3.0, 'm1a1_gas_turbine_startup', 1.6, 26.0, -22, eq={'hp': 40, 'lp': 6000}, send=('engine_room', 0.25),
              env=[(0, -40), (0.8, 0), (22, 0), (26, -40)])
        K.seg('mech', a + 9.0, 'jet_engine_start_cart', 8.0, 18.0, -28, rate=0.8, eq={'hp': 50, 'lp': 3500}, pan=0.4,
              send=('engine_room', 0.3), env=[(0, -40), (2, 0), (14, -2), (18, -40)])
        K.bed('mech', a + 12, b + 2, 'jet_turbine_noise', -31, 7, rate=0.62, eq={'hp': 40, 'lp': 2200}, fin=4.0, fout=4.0)
    # ---- the reduction gear: the train's whine, clutches seated
    s = span('gear', note=False)
    if s:
        a, b = s
        K.bed('mech', a, b, 'electric_ferry_motor', -26, 11, fin=1.5, fout=2.0, eq={'hp': 60})
        K.seg('mech', a + 1.5, 'overhead_crane_factory', 52.0, 4.5, -22, eq={'hp': 60}, send=('engine_room', 0.3))
    # ---- the reactor: coolant pumps spinning up, the rod drives stepping, the power rising
    s = span('reactor', note=False)
    if s:
        a, b = s
        K.spin(a + 3.0, 3.0, -20, ('engine_room', 0.3), 1, key='electric_ferry_motor', low=0.25, hold=b - a - 4, eq={'hp': 40, 'lp': 4000})
        K.hiss(a + 4.0, b - a - 3, -28, ('engine_room', 0.2), 2, 'water')
        K.hum(a + 10.0, b - a - 9, -26, ('engine_room', 0.2), 3, rise=1.06)
    # ---- the steam generator: boiling, steam
    s = span('steamgen', note=False)
    if s:
        a, b = s
        K.seg('water', a + 0.5, 'liquid_nitrogen_fs', 18.0, b - a + 1, -26, rate=0.7, eq={'hp': 80, 'lp': 5000},
              send=('engine_room', 0.25), env=[(0, -30), (3, 0), (b - a - 1, 0), (b - a + 1, -40)])
        K.bed('mech', a + 3, b + 1, 'steam_release_factory', -30, 21, fin=1.5, fout=1.5, eq={'hp': 200})
    # ---- the steam turbine: admission and the spin-up to speed
    s = span('turbine', note=False)
    if s:
        a, b = s
        K.spin(a + 1.0, min(8.0, b - a - 2), -26, ('engine_room', 0.25), 4, key='jet_turbine_noise', low=0.18, top=0.55,
               hold=max(2.0, b - a - 8), eq={'hp': 40, 'lp': 5000})
        K.hiss(a + 0.6, 3.0, -26, ('engine_room', 0.3), 5, 'steam')
    # ---- the condenser: seawater through it
    s = span('condenser', note=False)
    if s:
        a, b = s
        K.hiss(a + 1.2, b - a + 1, -26, ('engine_room', 0.25), 6, 'water')
        K.bed('water', a + 1.0, b + 1, 'underwater_rumble', -32, 61, fin=1.0, fout=1.5, eq={'hp': 50, 'lp': 700})
    # ---- the generator: the field comes on, the machine hums
    s = span('generator', note=False)
    if s:
        a, b = s
        K.hum(a + 1.2, b - a + 1.5, -25, ('engine_room', 0.25), 7, rise=1.02)
        K.spin(a + 1.0, 2.0, -27, ('engine_room', 0.2), 8, key='electric_ferry_motor', low=0.7, hold=b - a, eq={'hp': 50})
    # ---- the power run: breakers rack in and close; the current goes forward
    s = span('powerrun', note=False)
    if s:
        a, b = s
        K.hum(a + 6.0, 8.0, -26, ('power_room', 0.25), 9, rise=1.03)
    # ---- the power room: coolant pumps, an alternator drawn out and seated, the spin-up, the banks charging
    s = span('powerroom', note=False)
    if s:
        a, b = s
        K.hiss(a + 3.2, min(36.0, b - a - 2), -28, ('power_room', 0.2), 10, 'water')
        K.bed('elec', a + 29.0, b + 2, 'power_station_buzz', -30, 12, fin=4.0, fout=2.0, eq={'hp': 60, 'lp': 3000}, dw=1100)
        K.bed('elec', a + 30.0, b + 2, 'hv_substation', -34, 13, fin=5.0, fout=2.0, eq={'hp': 80, 'lp': 2500}, dw=1100)
    # ---- the banks charging (the duel's own chapter): a rising charge hum under the contactors
    s = span('bankcharge', note=False)
    if s:
        a, b = s
        K.hum(a + 0.5, b - a, -24, ('power_room', 0.25), 14, rise=1.12)
    # ---- coolant up the power column: a valve, the pipe filling, the flow settling
    s = span('coolant', note=False)
    if s:
        a, b = s
        K.seg('water', a + 0.6, 'liquid_nitrogen_dispensing', 2.0, min(9.0, b - a), -22, rate=0.6, eq={'hp': 60, 'lp': 3000}, dw=600,
              send=('power_room', 0.3), env=[(0, -30), (1.0, 0), (6.0, -2), (min(9.0, b - a), -30)], fin=0.3, fout=1.5)
        K.bed('water', a + 5.0, b, 'underwater_rumble', -36, 71, fin=2.0, fout=1.5, eq={'hp': 60, 'lp': 600})
    # ---- the cryo plant: compressors chuffing (the cold heads' 1 Hz breath), helium hiss, frost
    s = span('cryo', note=False)
    if s:
        a, b = s
        K.bed('mech', a + 0.2, b, 'hydraulic_pump_system', -24, 15, fin=0.8, fout=2.0, chunk=(6.0, 10.0), xfade=0.25,
              eq={'hp': 60, 'lp': 8000}, dw=900)
        K.seg('mech', a + 0.5, 'air_compressor', 2.0, min(20.0, b - a), -30, eq={'hp': 80, 'lp': 6000}, send=('power_room', 0.2), dw=500,
              env=[(0, -30), (1, 0), (min(20.0, b - a) - 2, 0), (min(20.0, b - a), -40)])
        K.hiss(a + 1.0, b - a - 1.0, -30, ('power_room', 0.2), 16, 'helium')
        K.fn('mech', a + 2.0, lambda L=b - a - 2: lv(dsp.stereo(F.ice(L, [(0, 2), (L, 28)], 17, big=0.1)), -36), b - a)
    # ---- the coils: current into the magnets, station by station
    s = span('coils', note=False)
    if s:
        a, b = s
        K.hum(a + 2.5, b - a - 2.0, -24, ('deck', 0.2), 18, rise=1.05)
        for k in range(10):
            K.contactor(a + 3.5 + 1.0 * k, -22, ('deck', 0.15), 18 + k)
    # ---- the hydraulics: the power unit starts, pressure builds
    s = span('hydraulics', note=False)
    if s:
        a, b = s
        K.seg('mech', a + 1.0, 'hydraulic_ramp_motors', 0.0, 12.0, -20, eq={'hp': 50}, send=('power_room', 0.2))
        K.bed('mech', a + 2.0, b, 'hydraulic_pump_system', -28, 19, fin=1.0, fout=1.5, eq={'hp': 80})
        K.clank(a + 1.0, -16, ('power_room', 0.25), 19, 1.2)
    # ---- the sensors: the director slews and locks (servos), the radar
    s = span('sensors', note=False)
    if s:
        a, b = s
        K.motor(a + 1.0, 1.6, -24, ('deck', 0.2), 20)
        K.motor(a + 6.0, 2.2, -26, ('deck', 0.2), 21, up=False)
        K.bed('mech', a + 3, b, 'industrial_fan', -38, 22, fin=2.0, fout=2.0, eq={'hp': 150, 'lp': 4000})
    # ---- the lay: the mount trains and elevates (hydraulic motors round the ring gear), laid
    s = span('lay', note=False)
    if s:
        a, b = s
        L = min(9.0, b - a - 1)
        K.seg('mech', a + 0.4, 'hydraulic_ramp_motors', 2.0, 10.5, -19, rate=0.85, eq={'hp': 40}, send=('deck', 0.25))
        K.seg('mech', a + 0.4, 'overhead_crane_factory', 52.0, L, -22, rate=0.8, eq={'hp': 40, 'lp': 5000}, send=('deck', 0.25),
              env=[(0, -30), (0.8, 0), (L - 1, 0), (L, -40)])
        K.clank(a + L + 0.3, -12, ('deck', 0.3), 23, 1.8)
    # ---- the magazine and the fabrication bay: cranes, chains, welding, the round lifted
    s = T.run('magazine', 'fab')
    if s:
        a, b = s
        K.seg('mech', a + 1.0, 'overhead_crane_factory', 6.0, min(12.0, b - a), -24, eq={'hp': 40}, send=('hangar', 0.35))
        K.seg('mech', a + 3.0, 'hoist_chains_rattle', 10.0, 8.0, -26, send=('hangar', 0.35))
        t = a + 14.0
        k = 0
        while t < b - 6:
            if k % 2 == 0:
                K.seg('mech', t, 'spot_welding_raceway', 4.0 + 3 * (k % 5), 3.0, -30, eq={'hp': 200}, send=('hangar', 0.4), pan=0.3, dw=1500)
            else:
                K.seg('mech', t, 'mig_welding', 1.0 + (k % 4), 2.5, -32, eq={'hp': 300}, send=('hangar', 0.4), pan=-0.3, dw=1500)
            t += 7.0
            k += 1
    # ---- the load: the rammer, the breech, the clamps
    s = span('load', note=False)
    if s:
        a, b = s
        K.seg('mech', a + 0.5, 'electric_actuator_load', 1.0, 4.0, -20, send=('hangar', 0.3))
        K.seg('mech', a + 5.0, 'hydraulic_ramp_motors', 9.5, 3.0, -18, send=('hangar', 0.3))
        K.clank(a + 8.0, -10, ('hangar', 0.35), 24, 2.2)

    charge_fire(K, T)
    space_and_orbit(K, T)
    fall_and_strike(K, T)


def charge_fire(K, T):
    """The charge (a rising hum, arcs crawling, contactors) and the shot (the real railgun's report, a big gun's body,
    the crack, the round climbing, the boom rolling back off the sky)."""
    at = T.at
    tf = shot_time(T)
    tc = at('charge', note=False)
    if tf is None:
        return
    if tc is None or tc >= tf:
        tc = tf - 12.0
    c = T.chapter('fire')
    tr = c['t'] + 0.3 if c and tf - 3.0 < c['t'] + 0.3 < tf - 0.3 else tf - 0.6      # the release (the banks let go)
    T.release = tr
    L = tr - tc
    # the charge: transformer hum climbing in pitch with load, the station's buzz, arcs crawling at the top; all of
    # it cut at the release, so the shot comes out of a held breath
    K.hum(tc, L + 0.05, -27, ('deck', 0.2), 30, rise=1.35, env=[(0, -30), (1.5, -16), (L * 0.85, -7), (L, -5)])
    K.seg('elec', tc + L * 0.3, 'power_station_buzz', 40.0, L * 0.7 + 0.05, -33, rate=[(0, 1.0), (L * 0.7, 1.25)],
          eq={'hp': 80, 'lp': 3500}, env=[(0, -30), (L * 0.6, -3), (L * 0.7, 0)], fout=0.01)
    K.seg('elec', tc + L * 0.55, 'jacobs_ladder', 4.0, L * 0.45 + 0.05, -35, eq={'hp': 150, 'lp': 4500},
          env=[(0, -30), (L * 0.45, 0)], fout=0.01)
    for k in range(4):
        K.contactor(tc + L * (0.15 + 0.2 * k), -22, ('deck', 0.2), 31 + k, big=k == 3)
    K.contactor(tr, -10, ('deck', 0.3), 40, big=True)
    K.clank(tr + 0.02, -12, ('deck', 0.3), 41, 2.4)
    # the shot: one composite (the BAE railgun's own report, a tank gun's body, the cannon, the measured blast, the
    # 'umf', the N-wave crack), saturated as a whole so it is the loudest thing in the film without limiter pumping
    K.fn('big', tf - 0.004, lambda: shot_sound(301), 9, why='the shot')
    # the round climbing through its plasma, and the boom rolling back
    sf_ = T.cue('sheath_fade', tf)                 # the plasma sheath fading: the climbing roar goes with it
    Lr = min(14.0, max(4.0, sf_ - tf - 0.6 + 1.5)) if sf_ else 7.0
    K.seg('big', tf + 0.6, 'rocket_launch_rumble_canaveral', 30.0, Lr, -27, eq={'hp': 30, 'lp': 2500}, send=('sky', 0.35),
          env=[(0, -12), (0.6, 0), (Lr * 0.35, -6), (Lr, -40)], fin=0.2, fout=2.0)
    K.seg('big', tf + 0.3, 'air_pressure_release', 12.0, 3.0, -30, rate=0.7, eq={'hp': 500, 'lp': 8000},
          env=[(0, 0), (3, -30)], fin=0.05)
    tb = T.cue('sonic_boom', tf) or tf + 2.4
    K.seg('big', tb, 'sonic_boom_fs', 0.7, 8.0, -17, eq={'hp': 30}, send=('sky', 0.5), peak=True,
          post=lambda x: S.distance(x, 900, ref=100, ground=0.5))
    K.seg('big', tb + 1.0, 'thunder_loud', 1.8, 12.0, -31, eq={'hp': 30, 'lp': 3000}, send=('sky', 0.5), fin=0.8, fout=4.0)


def shot_sound(seed=301):
    rg = S.eq(S.hit('railgun_bae_test', 0, length=3.5, t0=20.0, t1=23.0), hp=25)
    tank = S.eq(S.seg('tank_fire', 0.0, 4.2, 0.0005, 0.6), hp=25, lp=9000)
    can = S.eq(S.vari(S.seg('cannon_ship', 0.25, 3.0, 0.001, 0.5), 0.8), hp=25, lp=5000)
    boom = S.eq(S.hit('falcon9_landing_sonic_boom', 0, length=1.5, t0=1.5, t1=2.2), hp=40)
    x = S.stack([(0.0, pk(rg, 0), 0.0), (0.004, pk(tank, 0), -1.0), (0.014, pk(can, 0), -5.0),
                 (0.004, pk(F.railgun_blast(seed), 0), -4.0), (0.004, pk(dsp.stereo(F.thump(150.0, 44.0, 0.03, 0.3, 2.4, 1.6)), 0), -2.0),
                 (0.024, pk(boom, 0), -4.0)])
    x = S.space(x, 'sky', 0.3, 1.0)
    x = S.envelope(x, [(0, 0), (0.8, 0), (2.5, -5), (8, -8), (20, -10)])
    return S.punch(x, 3.4, -2.0, lows=2.5)


def strike_sound(seed=71):
    boom = S.eq(S.hit('falcon9_landing_sonic_boom', 0, length=2.0, t0=1.5, t1=2.2), hp=30)
    nuc = S.eq(S.seg('nuclear_distant', 0.4, 30.0, 0.001, 6.0), hp=22)
    huge = S.eq(S.seg('huge_distant_explosion', 0.15, 14.0, 0.001, 4.0), hp=25)
    tank = S.eq(S.seg('tank_fire', 0.0, 4.2, 0.0005, 0.6), hp=25)
    x = S.stack([(0.0, pk(boom, 0), 0.0), (0.003, pk(nuc, 0), -2.0), (0.05, pk(huge, 0), -3.0), (0.08, pk(tank, 0), -5.0),
                 (0.003, pk(dsp.stereo(F.thump(120.0, 32.0, 0.04, 0.5, 2.6, 2.4)), 0), -1.0)])
    x = S.space(x, 'open_sea', 0.3, 1.0)
    x = S.envelope(x, [(0, 0), (1.2, 0), (3.5, -6), (12, -9), (40, -12)])     # the blast first, then its roll, lower
    return S.punch(x, 2.6, -2.0, lows=2.0)


def shot_time(T):
    """The muzzle moment: a cue snd:fire; else the kit's shot cue (crack + rumble) in the 8 s after the Fire
    chapter; else the chapter + 1.3 s (the kit puts the chapter on the release, the round leaves 1.3 s later)."""
    if 'fire' in T.named:
        return T.named['fire'][0]
    c = T.chapter('fire')
    if c is None:
        T.at('fire')
        return None
    ev = [t for t, _ in T.events('shot') if c['t'] - 0.5 <= t <= c['t'] + 8]
    return ev[0] if ev else c['t'] + 1.3


def _silence_before(L):
    return np.zeros((n_of(0.1), 2))


def space_and_orbit(K, T):
    """Space: silence; the hit on the orbital ship felt as a thud and a groan through its structure; its barrel
    re-formed by rings (machinery through the hull); its shot (a deep thud through the hull)."""
    at, span = T.at, T.span
    th = at('hit', note=False)
    if th is not None and at('space', note=False) is not None and th > at('space'):
        hull = S.through_hull
        K.fn('hull', th, lambda: pk(hull(S.seg('huge_distant_explosion', 0.15, 6.0, 0.001, 1.5)), -6), 8)
        K.fn('hull', th, lambda: pk(dsp.stereo(F.thump(80.0, 30.0, 0.05, 0.6, 2.0, 2.5)), -5), 3)
        K.fn('hull', th + 0.6, lambda: pk(hull(S.seg('metallic_groan', 0.0, 9.0, 0.3, 2.0)), -12), 12)
        K.fn('hull', th + 3.5, lambda: pk(hull(S.seg('steel_girders_tear_creak', 22.0, 7.0, 0.5, 2.0)), -16), 10)
        tfr = T.cue('fragments', th - 0.1) or th + 1.2
        for k in range(6):
            K.fn('hull', tfr + 1.1 * k, lambda k=k: pk(hull(S.hit('metal_shed_door_hits', 10 + k * 3, top=60)), -20 - 2 * k), 4)
    # the rebuild: servo whine and structural clanks heard through the hull
    r = T.run('rings', 'orb_charge')
    rc = [t for t in (T.cue('ring_crack'), T.cue('rings_split'), T.cue('barrel_build')) if t is not None]
    toc0 = at('orb_charge', note=False)
    if rc and toc0 is not None and toc0 > min(rc):
        r = (min(rc), toc0)
    if r:
        a, b = r
        hull = S.through_hull
        t = T.cue('ring_crack')
        if t is not None:      # the ring cracking free: a deep crack and a groan through the structure
            K.fn('hull', t, lambda: pk(hull(S.vari(S.hit('metal_shed_door_hits', 1, top=60), 0.5)), -8), 5, why='ring_crack')
            K.fn('hull', t + 0.2, lambda: pk(hull(S.seg('steel_girders_tear_creak', 4.0, 5.0, 0.2, 1.5)), -14), 6)
        t = T.cue('rings_split')
        if t is not None:      # the rings splitting: latches letting go one after another, then the drives
            for k in range(5):
                K.fn('hull', t + 0.18 * k, lambda k=k: pk(hull(S.vari(S.hit('circuit_breaker_handling', 4 + k, top=30), 0.6)), -14 - k), 3)
            K.fn('hull', t + 0.8, lambda: lv(hull(S.vari(S.seg('electric_actuator_load', 2, 4.0, 0.1, 0.8), 0.7)), -22), 5)
        K.bed('hull', a, b, 'electric_motor_2', -28, 41, fin=1.5, fout=1.5, rate=0.6, post=hull)
        t = a + 1.5
        k = 0
        while t < b - 1:
            K.fn('hull', t, lambda k=k: pk(hull(S.vari(S.hit('metal_shed_door_hits', 20 + (k * 5) % 30, top=60), 0.7)), -16 - (k % 3) * 2), 5)
            if k % 3 == 1:
                K.fn('hull', t + 0.4, lambda k=k: lv(hull(S.vari(S.seg('electric_actuator_load', 1 + k % 8, 2.5, 0.05, 0.3), 0.8)), -26), 4)
            t += 2.4 + 0.6 * ((k * 7) % 3)
            k += 1
    toc = at('orb_charge', note=False)
    to = at('orb_fire', note=False)
    if toc is not None and to is not None and to > toc:
        K.fn('hull', toc, lambda L=to - toc: lv(S.through_hull(S.vari(S.bed('transformer_hum_large_room', L / 1.15 + 0.5, 42), [(0, 1.0), (L, 1.3)], length=L)), -26), to - toc)
    if to is not None:
        K.fn('hull', to, lambda: pk(dsp.stereo(F.thump(70.0, 28.0, 0.05, 0.7, 2.2, 3.0)), -4), 3)
        K.fn('hull', to, lambda: pk(S.through_hull(S.seg('tank_fire', 0.0, 4.0, 0.001, 1.0)), -8), 5)


def fall_and_strike(K, T):
    """The rod's fall (a roar rising out of nothing, plasma tearing), the strike (the crack, the blast rolling,
    tearing steel, secondaries, fire), under the water, the surface."""
    at, span = T.at, T.span
    ta = at('fall', note=False)
    ts = at('strike', note=False)
    if ta is not None and ts is not None and ts > ta:
        L = ts - ta
        K.seg('big', ta, 'rocket_launch_rumble_canaveral', 20.0, L + 0.05, -17, eq={'hp': 30},
              env=[(0, -50), (L * 0.3, -32), (L * 0.6, -18), (L * 0.85, -6), (L, 0)], fin=0.5, fout=0.01)
        K.seg('big', ta + L * 0.3, 'jet_engine', 10.0, L * 0.7 + 0.05, -21, rate=[(0, 0.6), (L * 0.7, 1.15)],
              eq={'hp': 60, 'lp': 9000}, env=[(0, -50), (L * 0.35, -22), (L * 0.6, -5), (L * 0.7, 0)], fout=0.01)
        K.seg('big', ta + L * 0.5, 'welding_continuous', 3.0, L * 0.5 + 0.05, -25, rate=0.6, eq={'hp': 400, 'lp': 7000},
              env=[(0, -45), (L * 0.3, -15), (L * 0.5, 0)], fout=0.01, dw=1200)
    if ts is not None:
        sea = ('open_sea', 0.35)
        # the strike: one composite (the N-wave crack, the blast, a big gun's punch, the 'umf'), saturated as a whole
        K.fn('big', ts - 0.003, lambda: strike_sound(71), 32, why='the strike')
        # tearing steel and debris, under the blast's tail
        hb = T.cue('hull_break', ts - 0.1) or ts + 1.4
        K.seg('mech', hb, 'steel_girders_tear_creak', 0.0, 14.0, -28, send=sea, fin=0.6, fout=3.0)
        K.seg('mech', hb + 1.0, 'demolition_tearing', 3.5, 10.0, -31, send=sea, fin=0.6, fout=3.0)
        K.seg('mech', hb + 2.0, 'building_demolition_aachen', 33.0, 8.0, -32, send=sea, fin=0.8, fout=3.0)
        # secondaries
        sb = (T.cue('secondary_blasts', ts - 0.1) or ts + 4.1) - 4.1
        for k, (dt, st, d, m) in enumerate(((4.1, 30.3, 4.0, 300), (6.6, 31.1, 4.0, 500), (9.3, 34.5, 5.0, 350),
                                            (13.8, 42.0, 6.0, 700), (19.5, 21.0, 5.0, 900))):
            K.seg('big', sb + dt, 'distant_explosions', st, d, -13 - 1.5 * k, eq={'hp': 25}, send=sea, peak=True, fin=0.002,
                  fout=1.5, post=lambda x, m=m: S.distance(x, m, ref=200))
        K.fn('amb', ts + 2.0, lambda L=max(10.0, T.duration - ts - 2): fire_bed(L, 51), T.duration - ts)
    # under the water
    s = span('underwater', note=False)
    if s:
        a, b = s
        uw = S.underwater
        K.fn('water', a, lambda: pk(uw(S.seg('nuclear_distant', 2.0, min(14.0, b - a + 4), 0.05, 4.0)), -8), b - a + 6)
        K.fn('water', a + 0.3, lambda L=b - a: lv(uw(S.bed('boiling_water', L, 52)), -24), b - a + 2)
        K.fn('water', a, lambda L=b - a: lv(dsp.stereo(F.bubbles(L, [(0, 60), (L * 0.4, 25), (L, 8)], 1.0, 6.0, 53)), -26), b - a)
        K.fn('water', a + 0.5, lambda: pk(uw(S.seg('steel_girders_tear_creak', 30.0, 10.0, 0.3, 3.0)), -16), 12)
        K.seg('water', a - 0.05, 'water_splashes', 19.6, 1.6, -6, peak=True, eq={'hp': 60}, fin=0.002, fout=0.8)
        t = T.cue('cavity_collapse', a)
        if t is not None:      # the cavity the rod tore open slamming shut: a deep, muffled thud
            K.fn('water', t, lambda: pk(uw(S.stack([(0, pk(dsp.stereo(F.thump(70.0, 26.0, 0.05, 0.6, 2.4, 2.5)), 0), 0.0),
                                                   (0.01, pk(S.seg('huge_distant_explosion', 0.15, 6.0, 0.001, 2.0), 0), -4.0)])), -5), 8,
                 why='cavity_collapse')
        t = T.cue('bubbles_rise', a)
        if t is not None:
            K.fn('water', t, lambda: lv(dsp.stereo(F.bubbles(8.0, [(0, 140), (2, 80), (8, 10)], 2.0, 9.0, 55)), -20), 9,
                 why='bubbles_rise')
    t = T.cue('sinking')
    if t is not None:          # the wreck going down: long groans of steel, air escaping, bubbles
        K.seg('mech', t, 'metallic_groan', 0.0, 9.0, -20, rate=0.6, eq={'hp': 40, 'lp': 2500}, send=('open_sea', 0.3), fin=0.5, fout=2.0)
        K.seg('mech', t + 3.0, 'ship_creak', 126.0, 8.0, -22, rate=0.7, eq={'hp': 40, 'lp': 3000}, send=('open_sea', 0.3), fin=0.5, fout=2.0)
        K.fn('water', t + 1.0, lambda: lv(dsp.stereo(F.bubbles(10.0, [(0, 40), (10, 6)], 2.0, 8.0, 63)), -26), 11)
    # back at the surface: steam, groaning steel, bubbles, waves (the fire bed runs on from the strike)
    s = span('surface', note=False)
    if s:
        a, b = s
        K.bed('water', a, b, 'steam_release_factory', -30, 61, fin=1.5, fout=3.0, eq={'hp': 150})
        K.seg('water', a + 0.8, 'air_pressure_release', 11.5, 6.0, -26, eq={'hp': 400}, fin=0.3, fout=2.0)
        K.fn('water', a, lambda L=min(30.0, b - a): lv(dsp.stereo(F.bubbles(L, [(0, 20), (L, 3)], 1.0, 5.0, 62)), -32), b - a)
        t = a + 3.0
        k = 0
        while t < b - 4:
            K.seg('mech', t, 'ship_creak', 3.0 + 41.0 * (k % 4), 5.0, -26, rate=0.75, eq={'hp': 50, 'lp': 3000},
                  send=('open_sea', 0.3), fin=0.4, fout=1.5)
            if k % 2:
                K.fn('mech', t + 2.0, lambda: pk(S.vari(S.seg('metallic_groan', 0, 9.0, 0.3, 2.0), 0.7), -20), 14, send=('open_sea', 0.3))
            t += 9.0
            k += 1


# ---------------------------------------------------------------- the film's named cues (pc_duel)


def named_cues(K, T):
    """The duel's own cue names, each voiced where it happens (repeatable ones at every occurrence)."""
    n = 0
    for k, t in enumerate(T.cues_named('contactor_close')):
        K.contactor(t, -14, ('power_room', 0.25), 700 + k, big=k % 4 == 3)
        n += 1
    t = T.cue('helium_start')
    if t is not None:          # the helium lines open: a valve, the cold gas rushing, the boil-off hiss
        K.clank(t, -16, ('power_room', 0.25), 710, 1.0)
        K.hiss(t + 0.2, 10.0, -26, ('power_room', 0.2), 711, 'helium')
        K.seg('mech', t + 0.1, 'air_pressure_release', 0.0, 3.0, -26, eq={'hp': 400, 'lp': 8000}, fin=0.02, fout=1.5)
        n += 1
    t = T.cue('cold_front')
    if t is not None:          # the cold front running down the lines: frost crackling, steel ticking as it contracts
        K.fn('mech', t, lambda: lv(dsp.stereo(F.ice(6.0, [(0, 60), (2, 30), (6, 4)], 712, big=0.25)), -26), 7, why='cold_front')
        K.hiss(t, 5.0, -30, ('power_room', 0.2), 713, 'helium')
        n += 1
    t = T.cue('bank_charge')
    if t is not None:          # the banks taking charge: a hum rising with the current
        K.hum(t, 10.0, -24, ('power_room', 0.25), 714, rise=1.15, env=[(0, -30), (1.0, -10), (8.0, -2), (10.0, -30)])
        n += 1
    for k, t in enumerate(T.cues_named('alternator_spinup')):
        K.spin(t, 5.0, -21, ('power_room', 0.25), 720 + k, key='electric_ferry_motor', low=0.15, hold=8.0, eq={'hp': 40, 'lp': 5000})
        n += 1
    for k, t in enumerate(T.cues_named('coil_energise')):
        K.contactor(t, -15, ('deck', 0.2), 730 + k, big=True)
        K.hum(t + 0.05, 4.0, -26, ('deck', 0.2), 731 + k, rise=1.03)
        n += 1
    t = T.cue('hpu_start')
    if t is not None:          # the hydraulic power unit: the motor's starter, the pump coming up to pressure
        K.contactor(t, -14, ('power_room', 0.25), 740, big=True)
        K.seg('mech', t + 0.1, 'hydraulic_ramp_motors', 0.0, 10.0, -20, eq={'hp': 50}, send=('power_room', 0.2))
        n += 1
    for k, t in enumerate(T.cues_named('director_lock')):
        K.motor(t - 0.6, 0.6, -24, ('deck', 0.2), 750 + k, up=False)
        K.hit('mech', t, 'circuit_breaker_handling', 9 + k, -18, eq={'hp': 200}, top=30, dw=900, send=('deck', 0.2))
        n += 1
    for k, t in enumerate(T.cues_named('radar_lock')):
        K.hit('mech', t, 'contactor_overload_relay', 11 + k, -22, eq={'hp': 250}, top=40, dw=700, send=('deck', 0.2))
        n += 1
    t = T.cue('mount_train')
    if t is not None:          # the mount training round: hydraulic motors on the ring gear
        K.seg('mech', t, 'hydraulic_ramp_motors', 2.0, 10.5, -20, rate=0.85, eq={'hp': 40}, send=('deck', 0.25))
        n += 1
    return n


# ---------------------------------------------------------------- the film's own mechanical cues


def kit_cues(K, T):
    """The kit's cues (clunk, clack, whirr, sweeps, hisses) as real mechanics, voiced by the place they happen in."""
    j2b = {j: b for b, j in T.match.items()}
    ch = T.chapters

    def place(t):
        pl = 'sea'
        for j, c in enumerate(ch):
            if c['t'] > t + 1e-6:
                break
            b = j2b.get(j)
            if b:
                pl = PLACE.get(b, pl)
        return pl

    # the beats that voice everything themselves: the kit's cues inside them stay silent
    own = [T.span(b, note=False) for b in ('charge', 'fire', 'flight', 'space', 'hit', 'orb_charge', 'orb_fire', 'fall',
                                           'strike', 'underwater')]
    own = [s for s in own if s]
    quiet = lambda t: any(a <= t < b for a, b in own)  # noqa: E731
    have = [(e['t'], e['bus']) for e in K.M.ev]
    near = lambda t, bus, tol=0.6: any(abs(t - u) < tol and b == bus for u, b in have)  # noqa: E731  (a scene already voices it)
    n = 0
    for k, (t, args) in enumerate(T.events('contactor')):
        pl = place(t)
        if quiet(t):
            continue
        if pl in ('space', 'sky', 'fall'):
            continue
        K.contactor(t, -16, (SPACE_OF[pl], 0.25) if SPACE_OF.get(pl) else None, 200 + k)
        n += 1
    for k, (t, args) in enumerate(T.events('clank')):
        pl = place(t)
        if quiet(t):
            continue
        if pl in ('space', 'sky', 'fall'):
            continue
        K.clank(t, -11, (SPACE_OF[pl], 0.3) if SPACE_OF.get(pl) else None, 300 + k, 1.6)
        n += 1
    for k, (t, args) in enumerate(T.events('motor') + T.events('servo')):
        pl = place(t)
        if quiet(t):
            continue
        if pl in ('space', 'sky', 'fall'):
            continue
        d = float(args[0]) if isinstance(args, list) and args else 1.2
        K.motor(t, d, -22, (SPACE_OF[pl], 0.2) if SPACE_OF.get(pl) else None, 400 + k,
                size={'power': 1.4, 'hangar': 1.3, 'deck': 1.2}.get(pl, 1.0))
        n += 1
    for k, (t, args) in enumerate(T.events('spin')):
        pl = place(t)
        if quiet(t):
            continue
        if pl in ('space', 'sky', 'fall', 'sea'):
            continue
        d = min(float(args.get('dur', 1.5)) if isinstance(args, dict) else 1.5, 6.0)
        if pl in ('engine', 'plant') or near(t, 'mech'):
            continue                          # the engine-room scenes voice their own spin-ups
        sp = (SPACE_OF[pl], 0.25) if SPACE_OF.get(pl) else None
        if pl == 'power' and d >= 2.5:        # an alternator: a big electric machine coming up to speed and running on
            K.spin(t, d, -22, sp, 500 + k, key='electric_ferry_motor', low=0.2, hold=8.0, eq={'hp': 40, 'lp': 5000})
        else:
            K.spin(t, d, -22, sp, 500 + k, hold=1.5)
        n += 1
    for k, (t, args) in enumerate(T.events('spindown')):
        pl = place(t)
        if quiet(t) or pl in ('space', 'sky', 'fall', 'sea', 'engine', 'plant') or near(t, 'mech'):
            continue
        d = min(float(args.get('dur', 1.5)) if isinstance(args, dict) else 1.5, 6.0)
        K.spindown(t, d, -23, (SPACE_OF[pl], 0.25) if SPACE_OF.get(pl) else None, 550 + k)
        n += 1
    for k, (t, args) in enumerate(T.events('hum')):
        pl = place(t)
        if quiet(t) or pl in ('space', 'sky', 'fall', 'sea', 'engine', 'plant') or near(t, 'elec', 1.0):
            continue
        d = min(float(args.get('dur', 3.0)) if isinstance(args, dict) else 3.0, 10.0)
        K.hum(t, d, -26, (SPACE_OF[pl], 0.2) if SPACE_OF.get(pl) else None, 580 + k, rise=1.04)
        n += 1
    for k, (t, args) in enumerate(T.events('hiss')):
        pl = place(t)
        if quiet(t):
            continue
        if pl in ('space', 'sky', 'fall', 'sea', 'engine', 'plant'):
            continue
        d = min(float(args.get('dur', 2.0)) if isinstance(args, dict) else 2.0, 8.0)
        f = float(args.get('f', 1000)) if isinstance(args, dict) else 1000
        kind = 'water' if f < 1500 else 'helium' if pl == 'cryo' else 'gas'
        if near(t, 'water' if kind == 'water' else 'mech'):
            continue
        K.hiss(t, d, -28, (SPACE_OF[pl], 0.2) if SPACE_OF.get(pl) else None, 600 + k, kind)
        n += 1
    return n


# ---------------------------------------------------------------- the mix


FOLEY = ('amb', 'mech', 'elec', 'water', 'big', 'hull')
MUSIC = ('m_str', 'm_pno', 'm_pulse', 'm_low', 'm_perc')
STEMS = {'ambience': ('amb',), 'machinery': ('mech', 'elec'), 'water': ('water',), 'impacts': ('big', 'hull'), 'music': MUSIC}


def underwater_windows(T):
    s = T.span('underwater', note=False)
    return [s] if s else []


def muffle(win, cut=500.0):
    """A bus post-process: a low-pass that closes inside the under-water windows."""
    def post(y, t0):
        if not win:
            return y
        n = len(y)
        pts = [(0.0, 20000.0)]
        for a, b in win:
            pts += [(a - t0 - 0.05, 20000.0), (a - t0 + 0.15, cut), (b - t0 - 0.1, cut), (b - t0 + 0.6, 20000.0)]
        pts.append((n / SR + 1, 20000.0))
        pts = sorted((max(0.0, t), v) for t, v in pts)
        fc = F.curve(pts, n)
        if fc.min() > 15000:
            return y
        return dsp.filt(y, 'lp', fc, 0.6, order=2, block=256)
    return post


def build_mixer(T, music=True, log=print):
    M = MX.Mixer()
    win = underwater_windows(T)
    # real machinery recordings are bass-heavy: the beds thinned under 200 Hz, the machines given a little presence
    M.bus('amb', hp=35, eq={'low': (180, -4.0), 'high': (3000, 2.0)})
    M.bus('mech', hp=30, eq={'low': (150, -2.5), 'high': (3500, 3.5)})
    M.bus('elec', hp=40, eq={'low': (150, -2.0), 'high': (3000, 1.5)})
    M.bus('water', hp=45, eq={'low': (200, -2.0), 'high': (3000, 3.0)})
    M.bus('big', hp=18)
    M.bus('hull', hp=20, lp=900)
    for b in ('mech', 'elec', 'big'):
        M.buses[b]['post'] = muffle(win)
    # the music: warm, a little room, out of the machines' 2-5 kHz, ducked under the foley
    for b, sp, db in (('m_str', ('hangar', 0.32), 0.0), ('m_pno', ('hangar', 0.28), 0.0), ('m_pulse', ('power_room', 0.2), 0.0),
                      ('m_low', ('hangar', 0.3), 0.0), ('m_perc', ('hangar', 0.35), 0.0)):
        M.bus(b, hp=30, eq={'peaks': [(3200, -3.0, 0.7)], 'high': (6000, 3.0)}, send=sp, db=db, post=muffle(win, 400.0))
        M.duck(b, ['mech', 'elec', 'big', 'hull', 'water'], depth=-7.0, thresh=-34.0, attack=0.04, release=0.9)
    T.shot = shot_time(T)
    K = Kit(M, T)
    beds(K, T)
    scenes(K, T, log)
    n0 = named_cues(K, T)
    n = kit_cues(K, T)
    log(f'  the film\'s named cues voiced: {n0}; its kit cues (clunk, clack, whirr ...) voiced: {n}')
    if music:
        SC.compose(M, T, log)
    return M


BUS_DB = {'amb': -3.5, 'mech': -4.0, 'elec': -3.5, 'water': -4.5, 'big': 0.0, 'hull': -1.0,
          'm_str': -11.5, 'm_pno': -10.0, 'm_pulse': -13.5, 'm_low': -11.0, 'm_perc': -10.0}


def render(T, t0, t1, out_dir, music=True, gain_db=None, target=-14.0, tp=-1.0, log=print, debug=0):
    T0 = _time.time()
    M = build_mixer(T, music, log)
    for b, d in BUS_DB.items():
        if b in M.buses:
            M.buses[b]['db'] += d
    log(f'  {len(M.ev)} events; rendering {t0:.1f}-{t1:.1f} s')
    if debug:
        M.stats = []
    buses = M.render(t0, t1, log)
    if debug:
        top = sorted(M.stats, key=lambda q: -(q[3] + M.buses[q[1]]['db']))[:debug]
        log('  loudest events (peak dBFS incl. bus gain, before the master):')
        for t, b, w, p, r, L in top:
            log(f'    {t:8.2f} s {b:6s} peak {p + M.buses[b]["db"]:6.1f} rms {r + M.buses[b]["db"]:6.1f} len {L:5.1f}  {w}')
    n = n_of(t1 - t0)
    buses = {b: y[:n] for b, y in buses.items()}
    edge = np.minimum(1, np.arange(n) / SR / 0.5)[:, None] if t0 > 0 else 1.0
    stems = {s: sum(buses[b] for b in bs if b in buses) * edge for s, bs in STEMS.items()}
    mix = sum(stems.values())
    log(f'  rendered ({_time.time() - T0:.0f} s); mastering')
    y, rep = MX.master(mix, target, tp, gain_db=gain_db, log=log)
    if t1 >= T.duration - 0.01:
        f = n_of(2.0)
        y[-f:] *= np.linspace(1, 0, f)[:, None] ** 1.5
    tag = '' if (t0 <= 0 and t1 >= T.duration - 0.01) else f'_{t0:g}-{t1:g}s'
    os.makedirs(out_dir, exist_ok=True)
    g = 10 ** (rep['gain_db'] / 20)
    MX.write_wav(os.path.join(out_dir, f'mix{tag}.wav'), y)
    for s, x in stems.items():
        MX.write_wav(os.path.join(out_dir, f'stem_{s}{tag}.wav'), x * g, float32=True)
    MX.write_wav(os.path.join(out_dir, f'foley{tag}.wav'), sum(v for k, v in stems.items() if k != 'music') * g, float32=True)
    rep.update({'from': t0, 'to': t1, 'stems': list(stems), 'render_s': round(_time.time() - T0, 1)})
    with open(os.path.join(out_dir, f'report{tag}.json'), 'w') as f:
        json.dump(rep, f, indent=1)
    return os.path.join(out_dir, f'mix{tag}.wav'), rep


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--video', help='the silent render (its <stem>.markers.json gives the timing)')
    ap.add_argument('--markers', help='markers.json (default: next to the video)')
    ap.add_argument('--from', dest='frm', type=float, default=0.0)
    ap.add_argument('--to', type=float, default=None)
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--no-music', action='store_true')
    ap.add_argument('--gain', type=float, default=None, help='force the master gain (dB): a part mastered like the whole')
    ap.add_argument('--lufs', type=float, default=-14.0)
    ap.add_argument('--debug', type=int, default=0, help='list the N loudest events')
    ap.add_argument('--height', type=int, default=1080, help='a part is re-encoded at this height (default 1080)')
    a = ap.parse_args()
    mk = a.markers or (os.path.splitext(a.video)[0] + '.markers.json' if a.video else None)
    if not mk or not os.path.exists(mk):
        sys.exit(f'no markers file ({mk}); pass --markers')
    T = TL.Timeline.load(mk, BEATS)
    print(f'{T.film}: {T.duration:.1f} s')
    t1 = min(a.to if a.to is not None else T.duration, T.duration)
    wav, rep = render(T, a.frm, t1, a.out, not a.no_music, a.gain, a.lufs, -1.0, debug=a.debug)
    T.report()
    print('  ->', wav)
    if a.video:
        stem = os.path.splitext(a.video)[0]
        part = not (a.frm <= 0 and t1 >= T.duration - 0.01)
        out = stem + ('_sound.mp4' if not part else f'_sound_{a.frm:g}-{t1:g}s.mp4')
        MX.mux(a.video, wav, out, a.frm if part else 0.0, (t1 - a.frm) if part else None, a.height if part else None)
        print('  ->', out)


if __name__ == '__main__':
    main()
