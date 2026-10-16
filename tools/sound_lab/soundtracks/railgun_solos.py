"""The railgun's sounds solo: every part alone, the shot built up layer by layer, the whole charge-and-shot
sequence without music (timed to SCAN · RAILGUN), and a listening page.

    python tools/sound_lab/soundtracks/railgun_solos.py [--out reference/films/renders/pc_scan_railgun_sound/solos]

The output folder gets:
- `NN_<part>.wav`: each part alone;
- `shot_layer_by_layer.wav`: the blast, then each layer added, 4.5 s apart;
- `sequence_no_music.wav`: 451.5-491.5 of the film, the charge to the tail at their mix levels;
- `analysis/index.html`: players, spectrograms, band envelopes and impact numbers for each part.
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))

import numpy as np  # noqa: E402

from sound_lab import dsp, railgun as RG  # noqa: E402
from sound_lab.dsp import SR, n_of  # noqa: E402
from sound_lab.foley import place  # noqa: E402
from audio_analyzer import impact as I  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
W0, T_CHARGE, T_FULL, REL, SHOT = 451.5, 468.5, 479.55, 480.49, 481.5


def write(path, x, peak_db=-1.0):
    x = np.asarray(x, np.float64)
    if x.ndim == 1:
        x = np.c_[x, x]
    x = x / (np.abs(x).max() + 1e-12) * 10 ** (peak_db / 20)
    dsp.write(path, np.ascontiguousarray(x))


def sequence(seed=0):
    """The charge, the dump and the shot at their mix levels, as {part: track} on the window W0..W0+40."""
    n = n_of(40.0)
    tracks = {}
    ch, banks = RG.charge_parts(T_CHARGE, T_FULL, seed=seed)
    for name, items in ch.items():
        tr = tracks.setdefault(name, np.zeros((n, 2)))
        for t, x in items:
            place(tr, x, n_of(t - W0), 10 ** (RG.PARTS_DB[name] / 20))
    tr = tracks.setdefault('dump', np.zeros((n, 2)))
    place(tr, RG.dump(seed + 40), n_of(REL - W0), 10 ** (RG.PARTS_DB['dump'] / 20))
    for name, (off, x) in RG.shot_parts(seed + 50).items():
        tr = tracks.setdefault(name, np.zeros((n, 2)))
        place(tr, x, n_of(SHOT + off - W0), 10 ** (RG.PARTS_DB[name] / 20))
    return tracks, banks


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(ROOT, 'reference', 'films', 'renders', 'pc_scan_railgun_sound', 'solos'))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    parts = [('whine', RG.whine(11.0, 110, 880, [0.4, 2.6, 4.5, 6.1, 7.4, 8.4, 9.2, 9.8])), ('hum', RG.hum(8.0)), ('bank_arm', RG.bank_arm()),
             ('arcs', RG.arcs(6.0)), ('interlock', RG.interlock()), ('dump', RG.dump()), ('breech', RG.breech()), ('zip', RG.zip_()),
             ('blast', RG.blast()), ('crack', RG.crack()), ('ring', RG.ring()), ('plasma', RG.plasma()), ('echoes', RG.echoes()), ('roll', RG.roll())]
    entries = []
    an = os.path.join(a.out, 'analysis')
    os.makedirs(an, exist_ok=True)
    for k, (name, x) in enumerate(parts, 1):
        p = os.path.join(a.out, f'{k:02d}_{name}.wav')
        write(p, x)
        if name in ('bank_arm', 'interlock', 'dump', 'breech', 'zip', 'blast', 'crack', 'ring', 'echoes'):
            entries += I.analyse_file(p, out_dir=an, log=lambda *s: None)
    # the shot, layer by layer: the blast alone, then breech + zip, crack, ring, plasma, echoes + roll
    sp = RG.shot_parts(0)
    order = [['blast'], ['breech', 'zip'], ['crack'], ['ring'], ['plasma'], ['echoes', 'roll']]
    lay = np.zeros((n_of(4.5 * len(order) + 4.0), 2))
    on = []
    for i, group in enumerate(order):
        on += group
        t = 0.3 + 4.5 * i
        for name in on:
            off, x = sp[name]
            place(lay, x, n_of(t + off), 10 ** (RG.PARTS_DB[name] / 20))
    write(os.path.join(a.out, 'shot_layer_by_layer.wav'), lay)
    tracks, banks = sequence()
    mix = sum(tracks.values())
    write(os.path.join(a.out, 'sequence_no_music.wav'), mix)
    print('banks arm at', [round(b, 2) for b in banks])
    print('page:', I.page(entries, an, 'Railgun parts'))


if __name__ == '__main__':
    main()
