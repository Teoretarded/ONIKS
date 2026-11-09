"""An inventory of the reference recordings: length, level, brightness, onsets, how tonal (beep-like) each is.

    python tools/sound_lab/inventory.py [filter]      -> a table (and refs/_cache/inventory.json)
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from sound_lab import samples as S  # noqa: E402


def main():
    flt = sys.argv[1] if len(sys.argv) > 1 else ''
    rows = []
    for rel in S.catalog():
        if flt and flt not in rel:
            continue
        try:
            a = S.analyse(rel)
        except Exception as e:  # noqa: BLE001
            print(f'{rel}: {e}')
            continue
        x = S.load(rel)
        mid = S.steady(rel, min(8.0, a['dur'] * 0.5))
        ton, tf = S.tonality(x[S.n_of(mid):S.n_of(mid + 8)])
        o = a['onsets']
        rows.append({'path': rel, 'dur': round(a['dur'], 1), 'rms_db': round(a['rms_db'], 1),
                     'centroid': round(a['centroid']), 'onsets': len(o), 'tonal_db': round(ton, 1), 'tonal_hz': round(tf),
                     'steady_at': round(mid, 1)})
        r = rows[-1]
        print(f"{rel:62s} {r['dur']:7.1f}s {r['rms_db']:6.1f}dB cen {r['centroid']:5d} on {r['onsets']:4d} "
              f"tonal {r['tonal_db']:5.1f}dB@{r['tonal_hz']:5d} steady@{r['steady_at']}")
    with open(os.path.join(S.CACHE, 'inventory.json'), 'w') as f:
        json.dump(rows, f, indent=1)


if __name__ == '__main__':
    main()
