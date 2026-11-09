"""Compare two sets of stills pixel by pixel (the perf suite's look check: game/src/perf.js stills()).

    python tools/imgdiff.py game/shots/perf/before game/shots/perf/after      (two prefixes: <dir>/<prefix>_*.png)
    python tools/imgdiff.py a.png b.png

For each pair: identical, or the share of pixels that differ, the largest channel difference and the box they fall in.
"""
import glob
import os
import sys

import numpy as np
from PIL import Image


def diff(a, b):
    A = np.asarray(Image.open(a).convert('RGBA')).astype(np.int16)
    B = np.asarray(Image.open(b).convert('RGBA')).astype(np.int16)
    if A.shape != B.shape:
        return f'size differs {A.shape} vs {B.shape}'
    d = np.abs(A - B).max(axis=2)
    n = int((d > 0).sum())
    if not n:
        return 'identical'
    ys, xs = np.nonzero(d)
    return f'{n / d.size * 100:.4f} % of pixels differ (max {int(d.max())}/255) in x {xs.min()}-{xs.max()}, y {ys.min()}-{ys.max()}'


def main():
    a, b = sys.argv[1], sys.argv[2]
    if a.endswith('.png'):
        print(os.path.basename(a), diff(a, b))
        return
    for pa in sorted(glob.glob(a + '_*.png')):
        name = pa[len(a) + 1:]
        pb = b + '_' + name
        print(f'{name:28s}', diff(pa, pb) if os.path.exists(pb) else 'missing in the second set')


if __name__ == '__main__':
    main()
