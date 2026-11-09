"""Layer audibility: given the separate layers of a mix (stems or parts), which of them a listener can hear, where,
and how clearly. This is a simple masking model on a spectrogram: 2048-point STFT, 10 ms hop, 1/3-octave bands
40 Hz-16 kHz.

For each layer:
- clear %: the share of loud cells (within 45 dB of the loudest cell of the whole mix) where the layer is at
  least as loud as all the other layers together, so it stands out;
- heard %: the share where it is within 10 dB of them, so it is audible but blended;
- its own loudest band;
- where (in time) it is clearly heard.

A layer with 0 % clear and little heard is masked: it adds nothing you could pick out. This answers "I can't hear
the railgun", and says which part to move, re-voice or raise.

    from audio_analyzer.layers import audibility, report
    print(report(audibility({'blast': a, 'crack': b, 'music': m})))
"""
import numpy as np
import scipy.signal as ss

EDGES = [40 * 2 ** (k / 3) for k in range(25)]                     # 40 Hz .. ~10 kHz (+ the top band to 16k)


def _bands(x, sr, hop):
    m = x.mean(1) if x.ndim == 2 else x
    f, t, S = ss.stft(m, sr, nperseg=2048, noverlap=2048 - hop, boundary=None)
    P = np.abs(S) ** 2
    rows = []
    edges = EDGES + [16000]
    for lo, hi in zip(edges[:-1], edges[1:]):
        s = (f >= lo) & (f < hi)
        rows.append(P[s].sum(0) if s.any() else np.zeros(P.shape[1]))
    return np.array(rows), t


def audibility(layers, sr=48000, hop=480, floor_db=45.0, t0=0.0):
    """layers: {name: audio (same length, aligned)} -> {name: {...}} (see the header)."""
    names = list(layers)
    n = min(len(v) for v in layers.values())
    B = {k: _bands(np.asarray(layers[k])[:n], sr, hop) for k in names}
    t = B[names[0]][1] + t0
    P = {k: v[0] for k, v in B.items()}
    tot = sum(P.values())
    loud = 10 * np.log10(tot + 1e-30) > 10 * np.log10(tot.max() + 1e-30) - floor_db
    out = {}
    for k in names:
        others = tot - P[k]
        ratio = 10 * np.log10((P[k] + 1e-30) / (others + 1e-30))
        clear = (ratio >= 0) & loud
        heard = (ratio >= -10) & loud
        frames = clear.any(0)
        spans = []
        on = None
        for i, v in enumerate(frames):
            if v and on is None:
                on = i
            if not v and on is not None:
                if i - on >= 3:
                    spans.append((round(float(t[on]), 2), round(float(t[i - 1]), 2)))
                on = None
        if on is not None:
            spans.append((round(float(t[on]), 2), round(float(t[-1]), 2)))
        share = float(P[k][loud].sum() / (tot[loud].sum() + 1e-30))
        band = int(np.argmax(P[k].sum(1)))
        out[k] = {'clear_pct': round(100 * clear.sum() / max(1, loud.sum()), 1), 'heard_pct': round(100 * heard.sum() / max(1, loud.sum()), 1),
                  'energy_pct': round(100 * share, 1), 'band_hz': int(EDGES[band] * 2 ** (1 / 6)), 'clear_spans': spans[:8]}
    return out


def report(a):
    lines = [f'{"layer":12s} {"clear %":>8s} {"heard %":>8s} {"energy %":>9s} {"band":>7s}  clearly heard at']
    for k, v in a.items():
        sp = ', '.join(f'{x}-{y}' for x, y in v['clear_spans']) or '(masked)'
        lines.append(f'{k:12s} {v["clear_pct"]:8.1f} {v["heard_pct"]:8.1f} {v["energy_pct"]:9.1f} {v["band_hz"]:7d}  {sp}')
    return '\n'.join(lines)
