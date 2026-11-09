"""Impacts: find the shots, booms and discharges in recordings, measure how they hit (crack, umf, body, tail, decay,
the thump's pitch drop), compare one with a reference, and write a listening page (clips, spectrograms, band
envelopes, numbers).

    python tools/audio_impact.py reference/sounds/refs/*.mp3 reference/sounds/refs/*.mp4 --out reference/sounds/refs/_impacts
    python tools/audio_impact.py my_shot.wav --ref reference/sounds/refs/howitzer_155mm.mp3 --out work/cmp
    python tools/audio_impact.py film.mp4 --at 481.5 503.9                       (profile given times instead of searching)

How it works: tools/audio_analyzer/impact.py (header).
"""
import argparse
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from audio_analyzer import impact as I  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('files', nargs='+')
    ap.add_argument('--out', default=None, help='folder for clips, pictures, profiles.json and index.html')
    ap.add_argument('--top', type=int, default=1, help='impacts per file (strongest first)')
    ap.add_argument('--at', type=float, nargs='*', default=None, help='onset times to profile instead of searching')
    ap.add_argument('--ref', default=None, help='a reference file: every impact is compared with its strongest impact')
    a = ap.parse_args()
    files = [f for p in a.files for f in (glob.glob(p) or [p])]
    if a.out:
        os.makedirs(a.out, exist_ok=True)
    ref = None
    entries = []
    if a.ref:
        r = I.analyse_file(a.ref, out_dir=a.out)
        ref = r[0]['profile']
        entries += r
    for f in files:
        try:
            entries += I.analyse_file(f, top=a.top, out_dir=a.out, ref=ref, at=a.at)
        except Exception as e:  # noqa: BLE001
            print(f'{f}: {e}')
    if a.out:
        I.save_json(entries, os.path.join(a.out, 'profiles.json'))
        print('page:', I.page(entries, a.out))


if __name__ == '__main__':
    main()
