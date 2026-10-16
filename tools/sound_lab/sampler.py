"""A sampler for real recorded instruments: VSCO 2 Community Edition (CC0, reference/sounds/instruments/vsco2ce/,
fetched by fetch_vsco.py) read through its own .sfz maps, plus the unmapped VSCO 1 percussion by file name.

    from sound_lab import sampler as SM
    vc = SM.inst('CelloEnsSpic')                       # a mapped instrument (any .sfz in the library)
    y = vc.note(50, 0.7, 0.25, seed=3)                 # D3, velocity 0..1, 0.25 s held, with its release tail
    pad = SM.inst('ViolaEnsSusVib').swell(57, 12.0, [(0, 0.2), (6, 0.7), (12, 0.3)], seed=1)   # a held note with dynamics
    line = SM.inst('CelloEnsSusVib').legato([(0, 50, 1.6, 0.5), (1.6, 53, 1.6, 0.55)], seed=2)  # a legato line
    hit = SM.kit('giant_drum').hit(0.8, seed=4)        # an unpitched percussion hit (dynamic layers, round robins)

What it does like a real sampler:
- multi-sample: each note uses the nearest recorded pitch (the map's key ranges), repitched by resampling;
- velocity layers: the two layers either side of the velocity are crossfaded (the timbre changes with dynamics,
  not only the level); swell() crossfades them along a dynamics curve, so a held note opens and closes like a bow;
- round robins: the map's seq groups are cycled by seed, and a few cents of detune and a little timing and level
  scatter keep repeated notes from sounding identical;
- release tails: a note keeps sounding after its end (the map's ampeg_release, or the sample's own decay for short
  articulations), and long notes past the recording loop on its steady middle with equal-power crossfades;
- legato: the next note of a line starts past its bow attack and crossfades from the previous one (with a short
  slide), so a line is joined, not re-attacked.
Each sample is levelled by its own active RMS (calibrated per layer), and velocity then sets the level along a
musical curve, so levels are predictable across instruments. Output: stereo (n, 2) float64 at 48 kHz.
"""
import glob
import os
import re
from fractions import Fraction

import numpy as np
import scipy.signal as ss
import soundfile as sf

from . import samples as _S
from .dsp import SR, n_of

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
LIB = os.path.join(ROOT, 'reference', 'sounds', 'instruments', 'vsco2ce')
_NOTE = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}
_WAV = {}
_INST = {}
_KITS = {}
CREST = 16.0       # a sample's peak is held at most this far above its calibrated level


def note_num(s):
    """'57' / 'a3' / 'A#3' / 'c#4' -> MIDI (C4 = 60)."""
    s = str(s).strip().lower()
    if re.fullmatch(r'-?\d+', s):
        return int(s)
    m = re.fullmatch(r'([a-g])([#b]?)(-?\d+)', s)
    if not m:
        raise ValueError(s)
    k = _NOTE[m.group(1)] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)
    return 12 * (int(m.group(3)) + 1) + k


def _rms_db(x):
    """Active RMS (dB) of the loudest second-long stretch around the attack: how loud the recording plays."""
    m = np.asarray(x, np.float64).mean(1)
    h = n_of(0.05)
    k = len(m) // h
    if k < 1:
        return 20 * np.log10(np.sqrt((m ** 2).mean()) + 1e-9)
    e = (m[:k * h].reshape(k, h) ** 2).mean(1)
    e = np.sort(e)[::-1][:max(1, min(k, 20))]
    return 10 * np.log10(e.mean() + 1e-12)


def load_wav(path):
    """A sample at 48 kHz stereo float32 (cached in memory)."""
    if path in _WAV:
        return _WAV[path]
    x, sr = sf.read(path, dtype='float32', always_2d=True)
    if x.shape[1] == 1:
        x = np.repeat(x, 2, 1)
    x = x[:, :2]
    if sr != SR:
        f = Fraction(SR, sr)
        x = ss.resample_poly(x, f.numerator, f.denominator, axis=0).astype(np.float32)
    _WAV[path] = x
    return x


def repitch(x, semis):
    """Resample by a pitch ratio (polyphase, band-limited): semis > 0 higher and shorter."""
    if abs(semis) < 1e-4:
        return np.asarray(x, np.float64)
    r = 2 ** (semis / 12)
    f = Fraction(1 / r).limit_denominator(240)
    return ss.resample_poly(np.asarray(x, np.float64), f.numerator, f.denominator, axis=0, window=('kaiser', 8.0))


def _fade(n, kind='out'):
    t = np.linspace(0, np.pi / 2, max(n, 1))
    return np.sin(t) if kind == 'in' else np.cos(t)


def _loop_extend(x, need, seed=0, xf=0.45):
    """x made at least `need` samples long by looping its steady middle (equal-power crossfades, start points
    scattered so no loop is heard)."""
    if len(x) >= need:
        return x
    r = np.random.default_rng(seed)
    a, b = int(len(x) * 0.35), int(len(x) * 0.85)
    if b - a < n_of(0.6):
        a, b = len(x) // 4, len(x) - 1
    X = n_of(xf)
    out = [x[:b]]
    have = b
    while have < need + X:
        s = int(r.uniform(a, max(a + 1, b - n_of(1.0))))
        e = min(len(x), s + max(n_of(1.0), b - a))
        out.append(x[s:e])
        have += e - s - X
    y = out[0]
    for c in out[1:]:
        k = min(X, len(y), len(c))
        y = np.concatenate([y[:-k], y[-k:] * _fade(k)[:, None] + c[:k] * _fade(k, 'in')[:, None], c[k:]])
    return y


# ---------------------------------------------------------------- .sfz maps


def parse_sfz(path):
    """Regions of an .sfz map: [{sample, lokey, hikey, key, lovel, hivel, volume, tune, offset, seq, seq_len, lorand,
    hirand, release, attack}] with group/global inheritance."""
    txt = open(path, encoding='utf-8', errors='replace').read()
    txt = re.sub(r'//[^\n]*', '', txt)
    tokens = re.split(r'(<[a-z]+>)', txt)
    ctl, glob_, master, group = {}, {}, {}, {}
    regs = []
    head = None
    cur = None

    def ops(s):
        out = {}
        for m in re.finditer(r'([a-z_0-9]+)=(.*?)(?=\s+[a-z_0-9]+=|\s*$)', s.strip(), re.S):
            out[m.group(1)] = m.group(2).strip()
        return out

    for tok in tokens:
        if re.fullmatch(r'<[a-z]+>', tok or ''):
            head = tok[1:-1]
            if head == 'group':
                group = {}
            elif head == 'master':
                master, group = {}, {}
            elif head == 'global':
                glob_ = {}
            elif head == 'region':
                cur = {}
                regs.append((cur, dict(glob_), dict(master), dict(group)))
            continue
        o = ops(tok or '')
        if not o:
            continue
        if head == 'control':
            ctl.update(o)
        elif head == 'global':
            glob_.update(o)
        elif head == 'master':
            master.update(o)
        elif head == 'group':
            group.update(o)
        elif head == 'region' and cur is not None:
            cur.update(o)
    base = ctl.get('default_path', '').replace('\\', '/')
    out = []
    for r, g0, m0, g1 in regs:
        d = {}
        for src in (g0, m0, g1, r):
            d.update(src)
        if 'sample' not in d:
            continue
        if 'key' in d:
            d.setdefault('lokey', d['key'])
            d.setdefault('hikey', d['key'])
            d.setdefault('pitch_keycenter', d['key'])
        smp = os.path.join(LIB, *(base + d['sample'].replace('\\', '/')).split('/'))
        out.append(dict(
            sample=smp, lokey=note_num(d.get('lokey', 0)), hikey=note_num(d.get('hikey', 127)),
            key=note_num(d.get('pitch_keycenter', d.get('lokey', 60))), lovel=int(d.get('lovel', 0)),
            hivel=int(d.get('hivel', 127)), volume=float(d.get('volume', 0)), tune=float(d.get('tune', 0)),
            offset=int(d.get('offset', 0)), seq=int(d.get('seq_position', 1)), seq_len=int(d.get('seq_length', 1)),
            lorand=float(d.get('lorand', 0)), hirand=float(d.get('hirand', 1)),
            release=float(d.get('ampeg_release', 0.5)), attack=float(d.get('ampeg_attack', 0.001)),
            trigger=d.get('trigger', 'attack')))
    return out


class Instrument:
    """A mapped instrument. Short articulations (short=True: spiccato, pizzicato, timpani) keep the recording's own
    decay as the release; sustains are cut at note-off with the map's release (or `release`)."""

    def __init__(self, name, short=None, release=None, level_db=-20.0, loop=None):
        p = os.path.join(LIB, name + '.sfz')
        if not os.path.exists(p):
            raise FileNotFoundError(f'{p} (run tools/sound_lab/fetch_vsco.py)')
        self.name = name
        self.regions = [r for r in parse_sfz(p) if r['trigger'] == 'attack' and os.path.exists(r['sample'])]
        if not self.regions:
            raise RuntimeError(f'{name}: no samples on disk (run fetch_vsco.py)')
        low = name.lower()
        self.short = short if short is not None else any(k in low for k in ('spic', 'pizz', 'stac', 'timpani', 'piano', 'upright'))
        self.loop = (not self.short) if loop is None else loop
        self.release = release
        self.level_db = level_db
        self.layers = sorted({(r['lovel'], r['hivel']) for r in self.regions})
        self._cal = {}

    # ---- region choice
    def _cands(self, m):
        c = [r for r in self.regions if r['lokey'] <= m <= r['hikey']]
        if not c:                                    # outside the map: the nearest recorded pitch
            d = min(abs(r['key'] - m) for r in self.regions)
            c = [r for r in self.regions if abs(r['key'] - m) == d]
        return c

    def _layer_regions(self, m, v127, seed):
        """(region, weight) pairs: the layer under the velocity and the next one, crossfaded."""
        c = self._cands(m)
        lay = sorted({(r['lovel'], r['hivel']) for r in c})
        if not lay:
            return []
        mids = [0.5 * (a + b) for a, b in lay]
        if v127 <= mids[0] or len(lay) == 1:
            pick = [(lay[0], 1.0)]
        elif v127 >= mids[-1]:
            pick = [(lay[-1], 1.0)]
        else:
            k = max(i for i in range(len(mids)) if mids[i] <= v127)
            w = (v127 - mids[k]) / (mids[k + 1] - mids[k])
            pick = [(lay[k], 1 - w), (lay[k + 1], w)]
        out = []
        for (lo, hi), w in pick:
            rr = [r for r in c if r['lovel'] == lo and r['hivel'] == hi]
            seqs = sorted({r['seq'] for r in rr})
            sq = seqs[seed % len(seqs)]                       # round robin: the map's seq groups, cycled
            rr = [r for r in rr if r['seq'] == sq]
            if any(r['hirand'] < 1 for r in rr):              # random round robins (lorand/hirand), drawn by seed
                u = (seed * 0.6180339 + 0.31) % 1.0
                rr = [r for r in rr if r['lorand'] <= u < r['hirand']] or rr
            rr = sorted(rr, key=lambda r: (abs(r['key'] - m), r['sample']))
            out.append((rr[0] if len(rr) == 1 else rr[(seed // len(seqs)) % len(rr)], w))
        return [(r, w) for r, w in out if w > 0.01]

    def _cal_db(self, r):
        """The sample's level for calibration: its active RMS, or its peak less CREST dB if that is higher (a
        struck sound's RMS says little about how loud its attack is)."""
        if r['sample'] not in self._cal:
            x = load_wav(r['sample'])[r['offset']:]
            pk_db = 20 * np.log10(np.abs(x).max() + 1e-9)
            self._cal[r['sample']] = max(_rms_db(x), pk_db - CREST)
        return self._cal[r['sample']]

    def _src(self, r, m, cents=0.0):
        x = load_wav(r['sample'])[r['offset']:]
        g = 10 ** ((self.level_db - self._cal_db(r)) / 20)
        return repitch(x, m - r['key'] + (r['tune'] + cents) / 100.0) * g

    @staticmethod
    def vel_db(v):
        """Velocity (0..1) to level: -26 dB at 0, 0 dB at 1 (a musical curve, steeper at the quiet end)."""
        v = float(np.clip(v, 0, 1))
        return -26.0 * (1 - v) ** 1.5

    # ---- playing
    def note(self, m, vel=0.7, dur=0.5, seed=0, release=None, start=0.0, attack=None, cents=None, tail=None):
        """One note: MIDI m, velocity 0..1, held dur s, from `start` s into the recording (past the attack, for
        legato), with its release tail. Short articulations (spiccato, pizzicato, piano, timpani) ring out with the
        recording's own decay for `tail` s (default dur + the map's release, at most 3 s more); a release given
        explicitly damps them after dur (a hand on the drum head, a damper on the string)."""
        v127 = 1 + 126 * float(np.clip(vel, 0, 1))
        rng = np.random.default_rng(seed * 7919 + int(m))
        c = rng.normal(0, 3.0) if cents is None else cents
        parts = self._layer_regions(int(round(m)), v127, seed)
        if not parts:
            return np.zeros((1, 2))
        rel = release if release is not None else (self.release if self.release is not None else parts[0][0]['release'])
        hold = n_of(dur)
        if self.short and release is None:
            L = n_of(tail if tail is not None else max(dur + min(rel, 3.0), 1.2))
        else:
            L = hold + n_of(min(rel, 4.0))
        y = np.zeros((L, 2))
        for r, w in parts:
            x = self._src(r, m, c)[n_of(start):]
            if self.loop:
                x = _loop_extend(x, L, seed + r['seq'])
            k = min(L, len(x))
            y[:k] += x[:k] * w
        if attack is not None and attack > 0.002:
            a = min(L, n_of(attack))
            y[:a] *= np.linspace(0, 1, a)[:, None] ** 1.5
        elif start > 0:
            a = min(L, n_of(0.02))
            y[:a] *= np.linspace(0, 1, a)[:, None]
        if not self.short or release is not None:      # note-off: an exponential release (-60 dB over rel s)
            if hold < L:
                y[hold:] *= np.exp(-np.arange(L - hold) / SR / (max(rel, 0.02) / 6.9))[:, None]
        e = min(L, n_of(0.05))
        y[-e:] *= np.linspace(1, 0, e)[:, None]
        return y * 10 ** (self.vel_db(vel) / 20)

    def swell(self, m, dur, dyn, seed=0, release=None, cents=None, start=0.0, attack=0.25):
        """A held note whose dynamics follow dyn [(t, vel)]: the soft and loud layers crossfaded along the curve
        and the level following it, so the bow opens and closes the sound."""
        P = np.array(dyn, np.float64)
        rel = release if release is not None else (self.release if self.release is not None else 1.0)
        L = n_of(dur + min(rel, 4.0))
        rng = np.random.default_rng(seed * 31 + int(m))
        c = rng.normal(0, 3.0) if cents is None else cents
        cand = self._cands(int(round(m)))
        lay = sorted({(r['lovel'], r['hivel']) for r in cand})
        t = np.arange(L) / SR
        vc = np.interp(t, P[:, 0], P[:, 1])
        v127 = 1 + 126 * np.clip(vc, 0, 1)
        mids = np.array([0.5 * (a + b) for a, b in lay])
        y = np.zeros((L, 2))
        for i, (lo, hi) in enumerate(lay):
            # this layer's weight along the curve (triangular between neighbouring layer centres)
            if len(lay) == 1:
                w = np.ones(L)
            else:
                left = mids[i - 1] if i > 0 else -1e9
                right = mids[i + 1] if i + 1 < len(lay) else 1e9
                w = np.where(v127 <= mids[i], np.clip((v127 - left) / max(mids[i] - left, 1e-6), 0, 1) if i > 0 else 1.0,
                             np.clip((right - v127) / max(right - mids[i], 1e-6), 0, 1) if i + 1 < len(lay) else 1.0)
            if w.max() < 0.01:
                continue
            rr = [r for r in cand if r['lovel'] == lo and r['hivel'] == hi]
            r = rr[seed % len(rr)]
            x = self._src(r, m, c)[n_of(start):]
            if self.loop:
                x = _loop_extend(x, L, seed + i)
            k = min(L, len(x))
            y[:k] += x[:k] * w[:k, None]
        lev = np.array([self.vel_db(v) for v in vc[::n_of(0.01)]])
        lev = np.interp(t, t[::n_of(0.01)][:len(lev)], lev)
        y *= (10 ** (lev / 20))[:, None]
        if attack:
            a = min(L, n_of(attack))
            y[:a] *= np.linspace(0, 1, a)[:, None] ** 1.2
        hold = n_of(dur)
        if hold < L:
            y[hold:] *= np.exp(-np.arange(L - hold) / SR / (max(rel, 0.05) / 6.9))[:, None]
        return y

    def legato(self, notes, seed=0, xf=0.11, skip=0.16, release=None, attack=0.18):
        """A joined line: notes [(t, m, dur, vel)] (t from the line's start); each note after the first enters past
        its attack (skip s into the recording), crossfading over xf s with a short slide from the previous pitch."""
        if not notes:
            return np.zeros((1, 2))
        end = max(t + d for t, _, d, _ in notes)
        rel = release if release is not None else (self.release if self.release is not None else 1.0)
        L = n_of(end + rel + xf)
        y = np.zeros((L, 2))
        for k, (t, m, d, v) in enumerate(notes):
            gap = k == 0 or notes[k - 1][0] + notes[k - 1][2] < t - 0.05
            last = k == len(notes) - 1 or notes[k + 1][0] > t + d + 0.05
            # a joined note enters past its bow attack and fades in over xf while the previous one releases over xf
            x = self.note(m, v, d, seed + k, release=rel if last else xf * 1.6, start=0.0 if gap else skip,
                          attack=attack if gap else None)
            if not gap:
                pm = notes[k - 1][1]
                if pm != m:                                  # the slide: a part of the interval, over 60 ms
                    r0 = 2 ** ((pm - m) / 12 * 0.5)
                    x = _S.vari(x, [(0.0, r0), (0.06, 1.0), (len(x) / SR + 1, 1.0)], length=len(x) / SR)
                a = min(n_of(xf), len(x))
                x[:a] *= _fade(a, 'in')[:, None]
            i = n_of(t)
            k2 = min(len(x), L - i)
            y[i:i + k2] += x[:k2]
        return y


def inst(name, **kw):
    key = (name, tuple(sorted(kw.items())))
    if key not in _INST:
        _INST[key] = Instrument(name, **kw)
    return _INST[key]


def available():
    """The mapped instruments on disk."""
    return sorted(os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(LIB, '*.sfz')))


# ---------------------------------------------------------------- unmapped percussion (VSCO 1), by file name

_DYN = {'ppp': 0.08, 'pp': 0.2, 'p': 0.35, 'mp': 0.5, 'mf': 0.62, 'f': 0.78, 'ff': 0.9, 'fff': 1.0}
KITS = {   # name: (folder under the library, file pattern with a (?P<dyn>...) group)
    'bass_drum': ('VSCO 1 Percussion/drums/bass', r'^bdrum\d?_(?P<dyn>ppp|pp|p|mp|mf|f|ff|fff)_\d+\.wav$'),
    'giant_drum': ('VSCO 1 Percussion/drums/other/ethnic/giant/mallet', r'^EthnicLargeMallet_hit_(?P<dyn>pp|mf|f|ff)_\d+\.wav$'),
    'giant_hand': ('VSCO 1 Percussion/drums/other/ethnic/giant/hand', r'^EthnicLargeHand_hit_(?P<dyn>ppp|pp|p|mp|mf|f|ff|fff)_\d+\.wav$'),
    'giant_sticks': ('VSCO 1 Percussion/drums/other/ethnic/giant/sticks', r'^EthnicLargeSticks_hit_(?P<dyn>ppp|pp|p|mp|mf|f|ff|fff)_\d+\.wav$'),
    'cymbal_roll': ('VSCO 1 Percussion/varMetal/Cymbals/susp', r'^susp_.*roll.*cresc.*\.wav$'),
    'cymbal_scrape': ('VSCO 1 Percussion/varMetal/Cymbals/susp', r'^susp_FX_scrape_\d+\.wav$'),
}


class Kit:
    """Unpitched percussion from loose files: dynamic layers from the names, round robins by seed."""

    def __init__(self, name, level_db=-24.0):
        folder, pat = KITS[name]
        d = os.path.join(LIB, *folder.split('/'))
        rx = re.compile(pat, re.I)
        self.name = name
        self.items = []
        for p in sorted(glob.glob(os.path.join(d, '*.wav'))):
            m = rx.match(os.path.basename(p))
            if m:
                dyn = m.groupdict().get('dyn')
                self.items.append((_DYN.get((dyn or 'f').lower(), 0.7), p))
        if not self.items:
            raise FileNotFoundError(f'{name}: no files in {d} (run fetch_vsco.py)')
        self.level_db = level_db

    def hit(self, vel=0.7, seed=0, semis=0.0, length=None):
        lv = sorted({v for v, _ in self.items})
        tgt = min(lv, key=lambda v: abs(v - vel))
        c = [p for v, p in self.items if v == tgt]
        p = c[seed % len(c)]
        x = load_wav(p)
        if length:
            x = x[:n_of(length)]
        g = 10 ** ((self.level_db - max(_rms_db(x), 20 * np.log10(np.abs(x).max() + 1e-9) - CREST)) / 20)
        y = repitch(x, semis) * g
        # velocity between the recorded dynamics: the level follows (the timbre is the nearest layer's)
        y = y * 10 ** ((Instrument.vel_db(vel) - Instrument.vel_db(tgt)) / 20 * 0.7)
        e = min(len(y), n_of(0.03))
        y[-e:] *= np.linspace(1, 0, e)[:, None]
        return y


def kit(name, **kw):
    if name not in _KITS:
        _KITS[name] = Kit(name, **kw)
    return _KITS[name]


# ---------------------------------------------------------------- writing it down


def place(events, length=None, humanize=0.0, seed=0):
    """Mix [(t, audio)] into one buffer; humanize (s) scatters the times a little (players are not a grid)."""
    rng = np.random.default_rng(seed)
    items = []
    for t, x in events:
        dt = rng.normal(0, humanize) if humanize else 0.0
        items.append((max(0, n_of(t + dt)), np.asarray(x, np.float64)))
    n = n_of(length) if length else max((i + len(x) for i, x in items), default=1)
    out = np.zeros((n, 2))
    for i, x in items:
        k = min(len(x), n - i)
        if k > 0:
            out[i:i + k] += x[:k]
    return out
