"""A film's timing from its render's markers.json, so a soundtrack survives re-timing of the film.

markers.json (written by reference/films/common/render.js next to each render) holds, in video time:
    chapters: [{t, title}]     the film's chapter changes
    cues:     [[t, name]]      every FILM cue: a named function's name, else the start of its source text

A soundtrack declares its story as an ordered list of beats, each with the chapter titles it may appear under:

    BEATS = [Beat('engines', ['Main engines', 'Engines']), Beat('charge', ['Charge']), Beat('fire', ['Fire']), ...]
    T = Timeline.load('<render>.markers.json', BEATS)
    T.at('fire')            # time of the beat (a cue 'snd:fire' wins over the chapter; None if neither is there)
    T.span('engines')       # (start, end): until the next chapter change
    T.events('contactor')   # times of every 'snd:contactor' cue (+ the kit's own 'clack' cues), with args

Beats are matched to chapters in story order (a longest common subsequence: repeated titles such as 'Charge' or
'Strike' go to the right beat by order, and a missing chapter does not derail the rest). Named sound cues
('snd:<name>[:<arg>...]', or a function named snd_<name>) give exact moments; the film's older synth cues (clunk,
clack, whirr ...) are read as mechanical events so the existing films get foley without edits.
"""
import json
import re

import numpy as np


class Beat:
    def __init__(self, id, titles, cue=None, offset=0.0, optional=False):
        self.id, self.titles, self.cue, self.offset, self.optional = id, [t.lower() for t in titles], cue, offset, optional


def fix_text(s):
    """Undo UTF-8 read as Latin-1 ('Heat sink Â· out' -> 'Heat sink · out')."""
    try:
        return s.encode('latin-1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def norm(s):
    return re.sub(r'\s+', ' ', fix_text(s).strip().lower())


# the kit's synth cues read as mechanical events: (regex on the cue text, event name, arg extractor)
_NUM = r'\s*(-?[\d.]+)\s*'
LEGACY = [
    (re.compile(r'^clunk$'), 'clank'),
    (re.compile(r'^clack$|clack\(\)'), 'contactor'),
    (re.compile(r'^tick$'), None),                                   # the tags' ticks stay silent
    (re.compile(r'SFX\.crack\(\);\s*SFX\.rumble\(3'), 'shot'),
    (re.compile(r'SFX\.crack\(\)'), 'crack'),
    (re.compile(r'tone\(f0, f1, d'), 'motor'),                        # the kit's whirr(f0, f1, d): a motor move
    (re.compile(r"tone\(" + _NUM + ',' + _NUM + r',\s*([^,]+?)\s*,\s*\'(sawtooth|sine|triangle)\''), 'sweep'),
    (re.compile(r'noise\(' + _NUM + ',' + _NUM), 'hiss'),
]


def legacy_event(name):
    """(event, args) for one of the kit's cues, or None."""
    for rx, ev in LEGACY:
        m = rx.search(name)
        if not m:
            continue
        if ev is None:
            return None
        if ev == 'sweep':
            f0, f1 = float(m.group(1)), float(m.group(2))
            try:
                d = float(m.group(3))
            except ValueError:
                d = 1.5
            kind = 'spin' if f1 > f0 * 1.4 else 'spindown' if f1 < f0 / 1.4 else 'hum'
            return kind, {'f0': f0, 'f1': f1, 'dur': d}
        if ev == 'hiss':
            return 'hiss', {'dur': float(m.group(1)), 'f': float(m.group(2))}
        return ev, {}
    if re.search(r"'square'", name):
        return None                                                  # UI beeps
    return None


def parse_cue(name):
    """'snd:servo:2.5' / 'snd_servo' -> ('servo', ['2.5']); the kit's cues -> (event, {args}); else None."""
    n = fix_text(name).strip()
    if n.startswith('snd:') or n.startswith('snd_'):
        parts = re.split(r'[:]', n[4:]) if n.startswith('snd:') else [n[4:]]
        return parts[0], parts[1:], True
    le = legacy_event(n)
    if le:
        return le[0], le[1], False
    if re.fullmatch(r'[a-z][A-Za-z0-9_]*', n) and n not in ('clunk', 'clack', 'tick', 'whirr'):
        return n, [], True                       # a named function: the film's own sound cue (fire, hit_orbital ...)
    return None


class Timeline:
    def __init__(self, data, beats):
        self.film = data.get('film')
        self.duration = float(data.get('to', 0)) - float(data.get('from', 0))
        self.chapters = sorted(({'t': float(c['t']), 'title': fix_text(c['title'])} for c in data.get('chapters', [])),
                               key=lambda c: c['t'])
        self.cues = sorted(((float(t), n) for t, n in data.get('cues', [])), key=lambda q: q[0])
        self.beats = beats
        self.match = self._align()
        self.named = {}
        self.ev = {}
        for t, n in self.cues:
            p = parse_cue(n)
            if not p:
                continue
            ev, args, named = p
            self.ev.setdefault(ev, []).append((t, args, named))
            if named:
                self.named.setdefault(ev, []).append(t)
        self.used = set()
        self.missing = []

    @classmethod
    def load(cls, path, beats):
        with open(path, encoding='utf-8') as f:
            return cls(json.load(f), beats)

    def _align(self):
        """LCS of the story's beats against the chapter list (titles matched case-blind)."""
        B, C = self.beats, [norm(c['title']) for c in self.chapters]
        nb, nc = len(B), len(C)
        L = [[0] * (nc + 1) for _ in range(nb + 1)]
        for i in range(nb - 1, -1, -1):
            for j in range(nc - 1, -1, -1):
                if C[j] in B[i].titles:
                    L[i][j] = 1 + L[i + 1][j + 1]
                else:
                    L[i][j] = max(L[i + 1][j], L[i][j + 1])
        out, i, j = {}, 0, 0
        while i < nb and j < nc:
            if C[j] in B[i].titles and L[i][j] == 1 + L[i + 1][j + 1]:
                out[B[i].id] = j
                i += 1
                j += 1
            elif L[i + 1][j] >= L[i][j + 1]:
                i += 1
            else:
                j += 1
        return out

    # ---- queries

    def chapter(self, beat_id):
        j = self.match.get(beat_id)
        return None if j is None else self.chapters[j]

    def at(self, beat_id, cue=None, default=None, note=True):
        """The beat's moment: its named cue (snd:<cue or id>) if the film emits one, else its chapter start plus
        the beat's offset; None (and noted as missing) when neither exists."""
        b = next((q for q in self.beats if q.id == beat_id), None)
        names = [cue or (b.cue if b and b.cue else beat_id)]
        for nm in names:
            if nm in self.named:
                self.used.add(beat_id)
                self.used.add('cue:' + nm)
                return self.named[nm][0]
        j = self.match.get(beat_id)
        if j is not None:
            self.used.add(beat_id)
            return self.chapters[j]['t'] + (b.offset if b else 0.0)
        if default is not None:
            return default
        if note and beat_id not in self.missing:
            self.missing.append(beat_id)
        return None

    def span(self, beat_id, note=True):
        """(start, end) of a beat: from its chapter to the next chapter that starts another beat (or the film's end)."""
        j = self.match.get(beat_id)
        b = next((q for q in self.beats if q.id == beat_id), None)
        tc = self.cue(b.cue) if b is not None and b.cue else None
        if j is None:
            t = tc if tc is not None else self.at(beat_id, note=note)
            if t is None:
                return None
            nxt = [self.chapters[k]['t'] for k in self.match.values() if self.chapters[k]['t'] > t + 0.5]
            return t, min(nxt) if nxt else min(t + 12.0, self.duration)
        self.used.add(beat_id)
        t0 = self.chapters[j]['t']
        nxt = [k for k in self.match.values() if k > j]          # chapters outside the story belong to the beat before
        t1 = self.chapters[min(nxt)]['t'] if nxt else self.duration
        return t0, t1

    def cue(self, name, after=None, before=None):
        """The first named cue `name` (optionally within (after, before)), or None."""
        for t in self.named.get(name, []):
            if (after is None or t > after) and (before is None or t < before):
                self.used.add('cue:' + name)
                return t
        return None

    def cues_named(self, name):
        if name in self.named:
            self.used.add('cue:' + name)
        return list(self.named.get(name, []))

    def run(self, first, last):
        """(start, end) from the start of beat `first` to the end of beat `last` (whichever exist)."""
        a = self.span(first, note=False)
        b = self.span(last, note=False)
        if a is None and b is None:
            return None
        return (a or b)[0], (b or a)[1]

    def events(self, name, t0=None, t1=None):
        """[(t, args)] of a cue event (named snd: cues and the kit's equivalents), optionally within [t0, t1)."""
        return [(t, a) for t, a, _ in self.ev.get(name, []) if (t0 is None or t >= t0) and (t1 is None or t < t1)]

    def report(self, log=print):
        log(f'  timeline: {len(self.chapters)} chapters, {len(self.cues)} cues; beats placed {len(self.match)}/{len(self.beats)}')
        unm = [b.id for b in self.beats if b.id not in self.match and b.id not in self.named]
        if unm:
            log('  beats with no chapter or cue: ' + ', '.join(unm))
        if self.missing:
            log('  events that could not be placed (asked for, not found): ' + ', '.join(self.missing))
        if self.named:
            unused = [k for k in self.named if 'cue:' + k not in self.used and k not in self.used]
            log('  named cues: ' + ', '.join(f'{k} x{len(v)}' for k, v in self.named.items()) +
                (f'; not used by this soundtrack: {", ".join(unused)}' if unused else ''))
        used_titles = {self.match[k] for k in self.match}
        stray = [c['title'] for j, c in enumerate(self.chapters) if j not in used_titles]
        if stray:
            log('  chapters not in the story (no sound of their own): ' + ', '.join(dict.fromkeys(stray)))


# ---------------------------------------------------------------- the picture's own log: the time rate and the lens


class FilmLog:
    """The film page's camera log (reference/films/common/camlog.js, every 0.1 s: the eye, the HUD readout) read for
    sound: the on-screen time rate (the readout's 'x8', 'x0.003') and the eye's height (under the water below 0).

        L = FilmLog.find(T, video)          # None when there is no log that matches this render's chapters
        L.rate(t)                            # the time rate shown at film time t (1 = real time)
        L.crossings(t0, t1)                  # [(t, 'under' | 'up')]: the lens going under / coming up

    A log is used only if its chapters match the render's (titles in order, times within 0.25 s), so a re-timed
    film never takes its timing from a stale log."""

    def __init__(self, data):
        s = data.get('samples') or []
        self.t = np.array([float(q['t']) for q in s])
        self.eye_y = np.array([float(q['eye'][1]) if q.get('eye') else np.nan for q in s])
        self.r = np.array([_rate_of(q.get('ro', '')) for q in s])
        if len(self.r):
            ok = ~np.isnan(self.r)
            self.r = np.interp(self.t, self.t[ok], self.r[ok]) if ok.any() else np.ones_like(self.t)
        self.chapters = [(float(c['t']), norm(c['title'])) for c in data.get('chapters', [])]
        self.path = None

    def rate(self, t):
        if not len(self.t):
            return np.ones_like(np.asarray(t, float)) if np.ndim(t) else 1.0
        return np.interp(t, self.t, self.r)

    def crossings(self, t0=None, t1=None):
        y = self.eye_y
        out = []
        for i in range(1, len(y)):
            if np.isnan(y[i]) or np.isnan(y[i - 1]):
                continue
            if (y[i - 1] >= 0) != (y[i] >= 0):
                tc = self.t[i - 1] + (self.t[i] - self.t[i - 1]) * y[i - 1] / (y[i - 1] - y[i])
                if (t0 is None or tc >= t0) and (t1 is None or tc <= t1):
                    out.append((float(tc), 'under' if y[i] < 0 else 'up'))
        return out

    def matches(self, T, tol=0.25):
        a = [(c['t'], norm(c['title'])) for c in T.chapters]
        b = self.chapters
        if len(a) != len(b):
            return False
        return all(x[1] == y[1] and abs(x[0] - y[0]) <= tol for x, y in zip(a, b))

    @classmethod
    def find(cls, T, video=None, paths=(), log=print):
        """The first log among `paths`, the render's review folders (<render dir>/review_*/camlog.json) and
        reference/films/shots/camlog/<film>.json whose chapters match T's."""
        import glob
        import os
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        cand = list(paths)
        if video:
            cand += sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(video)), 'review*', 'camlog.json')), reverse=True)
        if T.film:
            cand.append(os.path.join(root, 'reference', 'films', 'shots', 'camlog', f'{T.film}.json'))
        for p in cand:
            if not p or not os.path.exists(p):
                continue
            try:
                with open(p, encoding='utf-8') as f:
                    L = cls(json.load(f))
            except (OSError, ValueError, KeyError):
                continue
            if L.matches(T):
                L.path = p
                if log:
                    log(f'  film log: {p} (time rate and lens height)')
                return L
            if log:
                log(f'  film log {p}: chapters do not match this render; not used')
        return None


_RATE = re.compile(r'[×x]\s?(\d+(?:[.,]\d+)?|\d+\s?/\s?\d+)\s*$')


def _rate_of(ro):
    """The time rate at the end of a HUD readout ('... T-62:03.0 · ×0.003' -> 0.003; '×1/100' -> 0.01)."""
    m = _RATE.search(fix_text(ro or '').strip())
    if not m:
        return np.nan
    v = m.group(1).replace(',', '.').replace(' ', '')
    if '/' in v:
        a, b = v.split('/')
        return float(a) / max(float(b), 1e-9)
    return float(v)
