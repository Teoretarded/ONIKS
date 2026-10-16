"""A quick listen-check of a rendered soundtrack folder by numbers: loudness and peaks of the mix, each stem's
level per window (who is carrying each stretch), clipping, and tonal 'beeps' (narrow, steady spectral lines above
1 kHz standing out of the noise for a while).

    python tools/sound_lab/mixcheck.py reference/films/renders/pc_duel/sound [--tag _95-185s] [--win 10] [--t0 95]
"""
import argparse
import glob
import os
import re
import sys

import numpy as np
import scipy.signal as ss
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from sound_lab import mixer as MX  # noqa: E402


def beeps(x, sr, t0=0.0, min_dur=0.25, prom=18.0, fmin=1000.0, fmax=14000.0):
    """[(t, dur, Hz, prominence dB)] narrow lines above fmin that stand prom dB over their neighbourhood for at least
    min_dur s."""
    m = x.mean(1)
    f, t, Z = ss.stft(m, sr, nperseg=4096, noverlap=3072)
    P = 20 * np.log10(np.abs(Z) + 1e-9)
    sel = (f >= fmin) & (f <= fmax)
    P = P[sel]
    f = f[sel]
    base = ss.medfilt2d(P, (31, 1))
    hot = (P - base) > prom
    out = []
    hop = t[1] - t[0]
    need = int(min_dur / hop)
    for i in range(len(f)):
        row = hot[i]
        if row.sum() < need:
            continue
        d = np.diff(np.r_[0, row.astype(int), 0])
        st, en = np.where(d == 1)[0], np.where(d == -1)[0]
        for a, b in zip(st, en):
            if b - a >= need:
                out.append((t0 + t[a], (b - a) * hop, float(f[i]), float((P[i, a:b] - base[i, a:b]).mean())))
    out.sort()
    merged = []
    for e in out:
        if merged and abs(e[0] - merged[-1][0]) < 0.3 and abs(e[2] - merged[-1][2]) < 60:
            continue
        merged.append(e)
    return merged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder')
    ap.add_argument('--tag', default='')
    ap.add_argument('--win', type=float, default=10.0)
    ap.add_argument('--t0', type=float, default=0.0)
    a = ap.parse_args()
    mix, sr = sf.read(os.path.join(a.folder, f'mix{a.tag}.wav'), always_2d=True)
    I, st, lra = MX.lufs(mix, short=True)
    tp = MX.true_peak(mix)
    clip = int((np.abs(mix) >= 0.999).sum())
    print(f'mix: {len(mix) / sr:.1f} s, {I:.2f} LUFS, true peak {tp:.2f} dBTP, LRA {lra}, max short-term {st.max():.1f}, '
          f'clipped samples {clip}')
    stems = {}
    for p in sorted(glob.glob(os.path.join(a.folder, f'stem_*{a.tag}.wav'))):
        if not a.tag and re.search(r'_[\d.]+-[\d.]+s\.wav$', p):
            continue                                          # a part's stems, not the whole film's
        nm = os.path.basename(p)[5:-4 - len(a.tag)] if a.tag else os.path.basename(p)[5:-4]
        x, _ = sf.read(p, always_2d=True)
        stems[nm] = x
        print(f'  stem {nm:10s} {MX.lufs(x):6.1f} LUFS, peak {20 * np.log10(np.abs(x).max() + 1e-12):6.1f} dBFS')
    W = int(a.win * sr)
    print(f'per {a.win:g} s (LUFS-ish, K-weighted RMS): t | mix | ' + ' | '.join(stems))
    for i in range(0, len(mix) - W // 2, W):
        row = [MX.lufs(mix[i:i + W])] + [MX.lufs(s[i:i + W]) for s in stems.values()]
        print(f'  {a.t0 + i / sr:7.1f} | ' + ' | '.join(f'{v:6.1f}' for v in row))
    fol = [x for k, x in stems.items() if k != 'music']
    src = sum(fol) if fol else mix
    b = beeps(src, sr, a.t0)
    print(f'tonal lines above 1 kHz in the {"foley stems (the music is tonal by nature)" if fol else "mix"} '
          f'(>= 0.25 s, 18 dB over the spectrum around them): {len(b)}')
    for t, d, f, p in b[:30]:
        print(f'  {t:7.2f} s  {d:4.2f} s  {f:7.0f} Hz  +{p:.0f} dB')


if __name__ == '__main__':
    main()
