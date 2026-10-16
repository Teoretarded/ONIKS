"""Music: synthesized instruments, keys/scales/chords, a beat-grid sequencer with per-track sends, sidechain
ducking and a mastering bus, and `compose()` which writes a whole cue in a style and can land accents exactly on
given hit times (from the analyzer's visual events).

    song = Song(bpm=96, key='F# minor', bars=16)
    song.drums('kick', 'x.......x.......', bars=range(4, 16))
    chords = song.progression(['i', 'VI', 'III', 'VII'])
    song.pad(chords); song.arp(chords); song.bass(chords, 'x..x..x.x..x..x.')
    mix, stems = song.render()"""
import numpy as np

from . import dsp as D
from . import sfx
from .dsp import SR

NOTES = {'C': 0, 'C#': 1, 'DB': 1, 'D': 2, 'D#': 3, 'EB': 3, 'E': 4, 'F': 5, 'F#': 6, 'GB': 6, 'G': 7, 'G#': 8, 'AB': 8,
         'A': 9, 'A#': 10, 'BB': 10, 'B': 11}
SCALES = {'major': [0, 2, 4, 5, 7, 9, 11], 'minor': [0, 2, 3, 5, 7, 8, 10], 'harmonic_minor': [0, 2, 3, 5, 7, 8, 11],
          'dorian': [0, 2, 3, 5, 7, 9, 10], 'phrygian': [0, 1, 3, 5, 7, 8, 10], 'lydian': [0, 2, 4, 6, 7, 9, 11],
          'mixolydian': [0, 2, 4, 5, 7, 9, 10]}
ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii']


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def midi(name):
    """'C#3' -> 49; ints pass through."""
    if isinstance(name, (int, np.integer)):
        return int(name)
    s = name.strip().upper()
    k = 2 if len(s) > 1 and s[1] in '#B' and not s[1:].lstrip('-').isdigit() else 1
    return NOTES[s[:k]] + 12 * (int(s[k:]) + 1)


def parse_key(key):
    root, *mode = key.split()
    return NOTES[root.upper()], SCALES[(mode[0] if mode else 'major').lower()]


def chord(key, numeral, octave=3, size=3):
    """Diatonic chord on a roman numeral ('i', 'VI', 'v7'...): thirds stacked inside the key's scale."""
    root, sc = parse_key(key)
    seven = numeral.endswith('7')
    deg = ROMAN.index(numeral.rstrip('7°+').lower())
    n = 4 if seven else size
    out = []
    for k in range(n):
        d = deg + 2 * k
        out.append(12 * (octave + 1) + root + sc[d % 7] + 12 * (d // 7))
    return out


# ---------------------------------------------------------------- instruments (freq Hz, dur s, vel 0..1)

def kick(vel=1.0, seed=0):
    d = 0.5
    body = D.osc('sine', D.expo(160, 46, D.n_of(0.12), 0.5).tolist() + [46] * D.n_of(d - 0.12), d) * D.decay(d, 0.45, 0.001)
    click = D.filt(D.noise(0.004, 'white', seed), 'hp', 3000) * np.hanning(D.n_of(0.004))
    return D.stereo(D.drive(D.mix((body, 0), (click, -8))[:, 0] * 1.3, 1.6)) * vel


def snare(vel=1.0, seed=0):
    d = 0.3
    tone = D.osc('tri', D.expo(240, 180, D.n_of(d)), d) * D.decay(d, 0.12, 0.001)
    nz = D.filt(D.noise(d, 'white', seed), 'bp', 4500, 0.6) * D.decay(d, 0.22, 0.001)
    return D.reverb(D.mix((tone, -3), (nz, 0)), 0.9, mix=0.12, tail=False) * vel


def clap(vel=1.0, seed=0):
    parts = [(D.filt(D.noise(0.012, 'white', seed + k), 'bp', 1400, 1.2) * D.decay(0.012, 0.01), 0, k * 0.011) for k in range(3)]
    tail = D.filt(D.noise(0.25, 'white', seed + 9), 'bp', 1400, 1.0) * D.decay(0.25, 0.2)
    return D.reverb(D.mix(*parts, (tail, -3, 0.033)), 1.0, mix=0.2, tail=False) * vel


def hat(vel=1.0, open_=False, seed=0):
    d = 0.35 if open_ else 0.06
    metal = sum(D.osc('square', f, d) for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0))
    x = D.filt(D.filt(metal, 'bp', 10000, 0.8) + 0.5 * D.noise(d, 'white', seed), 'hp', 7000)
    return D.stereo(x * D.decay(d, d * 0.9, 0.0005)) * vel * 0.5


def taiko(vel=1.0, freq=70.0, seed=0):
    d = 1.6
    body = D.osc('sine', D.expo(freq * 1.6, freq, D.n_of(0.06)).tolist() + [freq] * D.n_of(d - 0.06), d) * D.decay(d, 0.9, 0.001)
    skin = D.filt(D.noise(0.08, 'pink', seed), 'lp', 1200) * D.decay(0.08, 0.06, 0.0005)
    ov = D.osc('sine', freq * 2.3, d) * D.decay(d, 0.35)
    return D.reverb(D.mix((body, 0), (skin, -4), (ov, -12)), 2.6, mix=0.3, tail=False) * vel


def sub(f, dur, vel=1.0):
    x = D.osc('sine', f, dur) + 0.15 * D.osc('tri', f, dur)
    return D.stereo(x * D.adsr(dur, 0.005, 0.1, 0.9, min(0.08, dur * 0.3))) * vel


def reese(f, dur, vel=1.0, seed=0):
    x = D.osc('saw', f * 0.996, dur) + D.osc('saw', f * 1.004, dur, 0.3) + 0.5 * D.osc('sine', f / 2, dur)
    x = D.filt(x, 'lp', 520, 1.1) * D.adsr(dur, 0.005, 0.15, 0.8, min(0.08, dur * 0.3))
    return D.chorus(D.stereo(D.drive(x, 1.4)), 0.25, 2, 8, 0.3) * vel


def pluck(f, dur, vel=1.0, bright=0.5, seed=0):
    d = max(dur, 0.25)
    x = D.osc('saw', f, d) * 0.6 + D.osc('square', f * 1.003, d) * 0.3
    x = D.filt(x, 'lp', D.as_curve([(0, 400 + 7000 * bright * vel), (0.12, 600 + 1200 * bright), (d, 500)], D.n_of(d)), 1.6)
    return D.stereo(x * D.decay(d, 0.35 + 0.4 * bright)) * vel


def keys(f, dur, vel=1.0, seed=0):
    """FM electric piano."""
    d = max(dur, 0.6)
    x = D.fm(f, 1.0, D.expo(2.5 * vel + 0.2, 0.15, D.n_of(d)), d) + 0.3 * D.fm(f * 2, 7.0, D.expo(1.2, 0.01, D.n_of(d)), d)
    return D.stereo(x * D.decay(d, 1.4, 0.003) * D.adsr(d, 0.003, 0.1, 1, min(0.15, d * 0.3))) * vel


def bell(f, dur, vel=1.0, seed=0):
    d = max(dur, 2.0)
    x = D.fm(f, 3.5, D.expo(5 * vel, 0.2, D.n_of(d)), d) * D.decay(d, d * 0.8, 0.002)
    return D.stereo(x) * vel


def pad(freqs, dur, vel=1.0, bright=0.4, seed=0):
    x = sum(D.supersaw(f, dur, 5, 0.22, seed + i) for i, f in enumerate(freqs)) / np.sqrt(len(freqs))
    n = D.n_of(dur)
    x = D.filt(x, 'lp', 700 + 2200 * bright + 500 * np.sin(np.linspace(0, np.pi, n)), 0.8)
    return D.chorus(x * D.adsr(dur, min(1.2, dur * 0.35), 0.5, 0.85, min(1.5, dur * 0.4))[:, None], 0.15, 5, 14, 0.4) * vel


def strings(freqs, dur, vel=1.0, seed=0):
    x = sum(D.supersaw(f, dur, 3, 0.08, seed + i) for i, f in enumerate(freqs)) / np.sqrt(len(freqs))
    n = D.n_of(dur)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * np.arange(n) / SR)
    x = D.filt(x * vib[:, None], 'lp', 2400, 0.7)
    x = D.eq(x, high_db=-6, mid_db=2, mid_f=600)
    return x * D.adsr(dur, min(0.5, dur * 0.3), 0.3, 0.9, min(0.6, dur * 0.4))[:, None] * vel


def lead(f, dur, vel=1.0, seed=0):
    n = D.n_of(dur)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * np.arange(n) / SR) * np.clip(np.arange(n) / SR / 0.3 - 0.5, 0, 1)
    x = D.osc('saw', f * vib, dur) * 0.6 + D.osc('square', f * vib * 1.005, dur) * 0.4
    x = D.filt(x, 'lp', D.as_curve([(0, 600), (0.05, 3800), (dur, 2000)], n), 1.2)
    return D.delay(D.stereo(x * D.adsr(dur, 0.01, 0.2, 0.8, min(0.2, dur * 0.3))), 0.375 * 0.5, 0.35, 0.22)[:n + D.n_of(1.0)] * vel


def drone(f, dur, vel=1.0, seed=0):
    x = D.supersaw(f, dur, 5, 0.1, seed) + D.stereo(0.6 * D.osc('sine', f / 2, dur))
    n = D.n_of(dur)
    x = D.filt(x, 'lp', 300 + 250 * np.sin(np.linspace(0, 3 * np.pi, n)) ** 2, 1.0)
    return D.fade(x, min(2, dur / 3), min(2, dur / 3)) * vel


INSTRUMENTS = {'kick': kick, 'snare': snare, 'clap': clap, 'hat': hat, 'taiko': taiko, 'sub': sub, 'reese': reese,
               'pluck': pluck, 'keys': keys, 'bell': bell, 'pad': pad, 'strings': strings, 'lead': lead, 'drone': drone}


# ---------------------------------------------------------------- sequencer

class Song:
    TRACK_DEFAULTS = {'gain_db': 0.0, 'reverb': 0.0, 'pan': 0.0, 'duck': 0.0, 'duck_key': 'kick', 'hp': 0.0}

    def __init__(self, bpm=100.0, key='A minor', bars=16, beats_per_bar=4, seed=0, offset=0.0):
        self.bpm, self.key, self.bars, self.bpb, self.seed = bpm, key, bars, beats_per_bar, seed
        self.spb = 60.0 / bpm
        self.offset = offset                                   # seconds of silence before beat 0
        self.length = offset + bars * beats_per_bar * self.spb
        self.events = {}
        self.tracks = {}
        self.r = D.rng(seed)
        self.cache = {}

    def play(self, inst, *args, **kw):
        """Instrument call with memoisation (rounded args): an 8-minute cue reuses most notes."""
        key = (inst, tuple(round(a, 3) if isinstance(a, float) else tuple(np.round(a, 2)) if isinstance(a, list) else a for a in args),
               tuple(sorted((k, round(v, 2) if isinstance(v, float) else v) for k, v in kw.items())))
        if key not in self.cache:
            self.cache[key] = INSTRUMENTS[inst](*args, **kw)
        return self.cache[key]

    def t(self, beat):
        return self.offset + beat * self.spb

    def track(self, name, **kw):
        self.tracks.setdefault(name, dict(self.TRACK_DEFAULTS)).update(kw)
        return self

    def put(self, name, at_s, sig, gain_db=0.0, pan=None):
        self.tracks.setdefault(name, dict(self.TRACK_DEFAULTS))
        s = D.stereo(sig)
        if pan is not None:
            s = D.pan(s, pan) * np.sqrt(2)
        self.events.setdefault(name, []).append((at_s, s, gain_db))

    def note(self, name, inst, beat, pitch, beats=1.0, vel=0.9, **kw):
        f = hz(midi(pitch))
        self.put(name, self.t(beat), self.play(inst, f, beats * self.spb, vel, **kw))

    # ---- patterns
    def drums(self, inst, pattern, bars=None, gain_db=0.0, swing=0.0, track=None, **kw):
        """pattern: 16 steps per bar: 'x' hit, 'o' soft hit, '.' rest (any length; repeats)."""
        steps = len(pattern)
        per = self.bpb / steps
        for b in (bars if bars is not None else range(self.bars)):
            for i, c in enumerate(pattern):
                if c in 'xo':
                    beat = b * self.bpb + i * per + (swing * per if i % 2 else 0)
                    vel = round((1.0 if c == 'x' else 0.55) * (0.92 + 0.08 * self.r.random()), 2)
                    self.put(track or inst, self.t(beat), self.play(inst, vel=vel, seed=int(self.r.integers(4)), **kw), gain_db)

    def progression(self, numerals, bars=None, octave=3, per_bar=1):
        """Repeat the numerals over the bars -> list of (bar, chord midi list)."""
        out = []
        for k, b in enumerate(bars if bars is not None else range(self.bars)):
            out.append((b, chord(self.key, numerals[(k // per_bar) % len(numerals)], octave)))
        return out

    def pad(self, chords, inst='pad', track='pad', vel=0.7, gain_db=0.0, **kw):
        for b, ch in chords:
            f = [hz(m) for m in ch]
            self.put(track, self.t(b * self.bpb), self.play(inst, f, self.bpb * self.spb * 1.35, vel, **kw), gain_db)   # overlap = legato

    def bass(self, chords, rhythm='x.......x.......', inst='sub', octave_shift=-1, track='bass', gain_db=0.0, gate=0.9):
        steps = len(rhythm)
        per = self.bpb / steps
        for b, ch in chords:
            root = ch[0] + 12 * octave_shift
            hits = [i for i, c in enumerate(rhythm) if c in 'xo']
            for j, i in enumerate(hits):
                nxt = hits[j + 1] if j + 1 < len(hits) else steps
                dur = (nxt - i) * per * gate
                self.put(track, self.t(b * self.bpb + i * per), self.play(inst, hz(root), dur * self.spb,
                                                                          0.9 if rhythm[i] == 'x' else 0.6), gain_db)

    def arp(self, chords, rate=16, mode='up', inst='pluck', octaves=2, track='arp', gain_db=0.0, vel=0.7, gate=0.8, **kw):
        per = self.bpb / rate
        for b, ch in chords:
            notes = [m + 12 * o for o in range(octaves) for m in ch]
            seq = notes if mode == 'up' else notes[::-1] if mode == 'down' else notes + notes[-2:0:-1]
            for i in range(rate):
                m = seq[i % len(seq)]
                acc = 1.0 if i % 4 == 0 else 0.75
                self.put(track, self.t(b * self.bpb + i * per), self.play(inst, hz(m + 12), per * gate * self.spb, round(vel * acc, 2), **kw), gain_db)

    def melody(self, chords, inst='lead', track='lead', density=0.55, octave=5, gain_db=0.0, motif_bars=2):
        """A motif built from chord tones on strong beats and scale steps between, repeated and varied."""
        root, sc = parse_key(self.key)
        scale = [12 * (octave + 1) + root + s + 12 * o for o in (-1, 0, 1) for s in sc]
        motif = []
        r = D.rng(self.seed + 11)
        pos = 0.0
        while pos < self.bpb * motif_bars:
            dur = r.choice([0.5, 0.5, 1.0, 1.0, 1.5, 2.0])
            rest = r.random() > density
            motif.append((pos, dur, rest, r.integers(-2, 3)))
            pos += dur
        for k in range(0, len(chords), motif_bars):
            b0, ch0 = chords[k]
            prev = min(scale, key=lambda m: abs(m - (ch0[0] + 24)))
            for pos, dur, rest, step in motif:
                if rest or pos >= self.bpb * motif_bars:
                    continue
                bi = min(len(chords) - 1, k + int(pos // self.bpb))
                ch = chords[bi][1]
                strong = (pos % 2) == 0
                if strong:
                    cands = [m for m in scale if (m - ch[0]) % 12 in {(c - ch[0]) % 12 for c in ch}]
                    m = min(cands, key=lambda c: abs(c - prev - step * 2))
                else:
                    i = scale.index(min(scale, key=lambda c: abs(c - prev)))
                    m = scale[int(np.clip(i + step, 0, len(scale) - 1))]
                prev = m
                self.put(track, self.t(b0 * self.bpb + pos), self.play(inst, hz(m), dur * self.spb * 0.95, 0.8), gain_db)

    # ---- render
    def render(self, master_lufs=-14.0, ceiling_db=-1.0, length=None):
        n = D.n_of(length or (self.length + 4.0))
        stems = {}
        for name, evs in self.events.items():
            buf = np.zeros((n, 2))
            for at, s, g in evs:
                i = D.n_of(at) if at > 0 else 0
                k = min(len(s), n - i)
                if k > 0:
                    buf[i:i + k] += s[:k] * 10 ** (g / 20)
            cfg = self.tracks.get(name, self.TRACK_DEFAULTS)
            if cfg['hp']:
                buf = D.butter(buf, 'hp', cfg['hp'], 2)
            if cfg['pan']:
                buf = D.width(buf, 1 - abs(cfg['pan']) * 0.5)
            stems[name] = buf * 10 ** (cfg['gain_db'] / 20)
        for name, cfg in self.tracks.items():
            key = stems.get(cfg.get('duck_key', 'kick'))
            if name in stems and cfg['duck'] and key is not None and name != cfg.get('duck_key', 'kick'):
                stems[name] = D.duck(stems[name], key, -abs(cfg['duck']))
        bus = sum(stems.values()) if stems else np.zeros((n, 2))
        send = sum(stems[k] * self.tracks.get(k, self.TRACK_DEFAULTS)['reverb'] for k in stems)
        if np.ndim(send) == 2 and np.abs(send).max() > 0:
            bus = bus + D.reverb(send, 2.6, mix=1.0, predelay=0.03, tail=False)[:n] * 0.6
        bus = D.compress(bus, -16, 2.0, 0.01, 0.2)
        bus = master(bus, master_lufs, ceiling_db)
        return bus, stems


def master(x, lufs=-14.0, ceiling_db=-1.0):
    """Gentle glue, loudness to target, brickwall limit."""
    x = D.eq(D.stereo(x), low_db=1.0, low_f=80, high_db=1.0, high_f=9000)
    L = D.lufs(x)
    if L is not None:
        x = x * 10 ** ((lufs - L) / 20)
    return D.limit(x, ceiling_db)


# ---------------------------------------------------------------- styles

STYLES = ('cinematic', 'synthwave', 'dark_ambient', 'hybrid_trailer')


def compose(style='cinematic', duration=60.0, bpm=None, key=None, seed=0, hits=(), lufs=-16.0):
    """A full cue of `duration` seconds. hits: seconds where the music lands an accent (trailer hit / braam),
    with a riser into it when there is room. Returns (mix, stems, info)."""
    bpm = bpm or {'cinematic': 96, 'synthwave': 112, 'dark_ambient': 70, 'hybrid_trailer': 90}[style]
    key = key or {'cinematic': 'D minor', 'synthwave': 'F# minor', 'dark_ambient': 'C# minor', 'hybrid_trailer': 'C minor'}[style]
    bars = max(2, int(np.ceil(duration / (4 * 60 / bpm))))
    s = Song(bpm, key, bars, seed=seed)
    A = bars // 4                     # intro | build | main | outro
    intro, build, main, outro = range(0, A), range(A, 2 * A), range(2 * A, bars - max(1, A // 2)), range(bars - max(1, A // 2), bars)
    full = range(bars)
    if style == 'synthwave':
        prog = s.progression(['i', 'VI', 'III', 'VII'])
        s.track('pad', gain_db=-10, reverb=0.25, duck=6).track('arp', gain_db=-14, reverb=0.3, duck=4)
        s.track('bass', gain_db=-6, duck=5).track('lead', gain_db=-11, reverb=0.25)
        s.track('kick', gain_db=-3).track('snare', gain_db=-8, reverb=0.15).track('hat', gain_db=-16)
        s.pad(prog)
        s.arp([c for c in prog if c[0] in list(build) + list(main)], mode='updown')
        s.bass([c for c in prog if c[0] in list(build) + list(main)], 'x.x.x.x.x.x.x.x.', inst='reese')
        s.drums('kick', 'x...x...x...x...', bars=list(build) + list(main))
        s.drums('snare', '....x.......x...', bars=main)
        s.drums('hat', '..x...x...x...x.', bars=list(build) + list(main))
        s.melody([c for c in prog if c[0] in main])
    elif style == 'dark_ambient':
        root, _ = parse_key(key)
        s.track('drone', gain_db=-8, reverb=0.3).track('pad', gain_db=-14, reverb=0.5).track('bell', gain_db=-18, reverb=0.6)
        s.put('drone', 0.0, drone(hz(36 + root), s.length + 2))
        s.put('drone', 0.0, drone(hz(43 + root), s.length + 2, 0.5, seed=3))
        s.pad(s.progression(['i', 'VI', 'iv', 'i'], per_bar=2, octave=3), bright=0.15)
        _, sc = parse_key(key)
        for b in full:
            if s.r.random() < 0.6:
                m = 72 + root + sc[[0, 2, 4][s.r.integers(0, 3)]]
                s.put('bell', s.t(b * 4 + s.r.integers(0, 8) / 2), bell(hz(m), 4.0, 0.5), pan=float(s.r.uniform(-0.7, 0.7)))
        s.track('sub', gain_db=-10)
        for b in range(0, bars, 4):
            s.put('sub', s.t(b * 4), sfx.sub_drop(3.0, 70, 30))
    else:   # cinematic / hybrid_trailer
        prog = s.progression(['i', 'VI', 'III', 'VII'] if style == 'cinematic' else ['i', 'i', 'VI', 'VII'], octave=3)
        s.track('strings', gain_db=-12, reverb=0.35, duck=3).track('ostinato', gain_db=-15, reverb=0.25, duck=3)
        s.track('low', gain_db=-9, duck=4).track('taiko', gain_db=-6, reverb=0.1).track('kick', gain_db=-4)
        s.pad([c for c in prog if c[0] not in outro], inst='strings', track='strings')
        s.arp([c for c in prog if c[0] in list(build) + list(main)], rate=16 if style == 'cinematic' else 8, mode='updown',
              inst='pluck', octaves=1, track='ostinato', bright=0.3)
        s.bass([c for c in prog if c[0] in list(build) + list(main)], 'x.......x.......' if style == 'cinematic' else 'x..x..x.x..x..x.', inst='sub', track='low')
        s.drums('taiko', 'x.....x.x...x...' if style == 'cinematic' else 'x..x..x.x.x.x...', bars=main)
        s.drums('taiko', 'x.......x.......', bars=build, gain_db=-4)
        if style == 'hybrid_trailer':
            s.drums('kick', 'x.......x.......', bars=main)
            s.track('braam', gain_db=-6, reverb=0.1)
            for b in range(main.start, main.stop, 4):
                s.put('braam', s.t(b * 4), sfx.braam(note=prog[0][1][0] - 12, dur=3.5, seed=b))
        if len(build):
            s.track('riser', gain_db=-10)
            s.put('riser', max(0.0, s.t(main.start * 4) - 4.0), sfx.riser(4.0, seed))
    # accents on the picture's hits
    if hits:
        s.track('hits', gain_db=-3, reverb=0.1).track('rise', gain_db=-12)
        root, _ = parse_key(key)
        last = -1e9
        for h in sorted(hits):
            if h - last > 4.5 and h > 3.0:
                s.put('rise', h - 3.0, sfx.riser(3.0, seed + int(h * 10)))
            s.put('hits', h, sfx.trailer_hit(note=24 + root + 12, seed=int(h * 10)))
            last = h
        for name, cfg in s.tracks.items():               # everything breathes around the hits
            if name not in ('hits', 'rise'):
                cfg['duck'], cfg['duck_key'] = max(cfg['duck'], 7), 'hits'
    mix, stems = s.render(lufs, length=duration + 3.0)
    mix = D.fade(mix, 0.01, 2.5)
    return mix, stems, {'style': style, 'bpm': bpm, 'key': key, 'bars': bars, 'sections': {
        'intro': [s.t(intro.start * 4), s.t(intro.stop * 4)], 'build': [s.t(build.start * 4), s.t(build.stop * 4)],
        'main': [s.t(main.start * 4), s.t(main.stop * 4)], 'outro': [s.t(outro.start * 4), s.length]}, 'hits': list(hits)}
