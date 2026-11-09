"""Separate a sound file or film render into layers: python tools/audio_separate.py <file> [options]

-> <file>_separation/: stems as WAV, events/ (every sound as its own clip), separation.json, index.html (listen)
Methods: hpss (tonal/transients/noise), nmf (K named components), bands, events (+ families of similar sounds),
demucs (drums/bass/other/vocals; neural, CPU). Details: tools/audio_analyzer/separate.py"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('input')
    ap.add_argument('-o', '--out')
    ap.add_argument('-m', '--methods', default='hpss,nmf,bands,events', help='comma list of hpss,nmf,bands,events,demucs (or all)')
    ap.add_argument('-k', type=int, default=8, help='NMF components (default 8)')
    ap.add_argument('--start', type=float)
    ap.add_argument('--end', type=float)
    a = ap.parse_args()
    from audio_analyzer.separate import run
    m = ('hpss', 'nmf', 'bands', 'events', 'demucs') if a.methods == 'all' else tuple(a.methods.split(','))
    p = Path(a.input)
    out = Path(a.out) if a.out else p.with_name(p.stem + '_separation')
    t0 = time.perf_counter()
    print(p)
    res = run(p, out, methods=m, k=a.k, start=a.start, end=a.end)
    print(f'  {len(res["stems"])} stems, {len(res.get("events", []))} event clips, {len(res.get("families", []))} families'
          f' -> {out} ({time.perf_counter() - t0:.1f} s)')


if __name__ == '__main__':
    main()
