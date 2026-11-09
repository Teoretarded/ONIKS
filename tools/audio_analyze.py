"""Audio (and picture) analysis for sound design: python tools/audio_analyze.py <file|folder>... [options]

One file  -> <out>/analysis.json, summary.md, timeline.csv, events.csv, report.html
A folder  -> one analysis per audio/video file (in parallel) + library.md / library.csv comparing them
Details: tools/audio_analyzer/README.md"""
import argparse
import csv
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

MEDIA = {'.wav', '.mp3', '.flac', '.ogg', '.opus', '.m4a', '.aac', '.aif', '.aiff', '.wma', '.mp4', '.mov', '.mkv', '.webm', '.avi'}


def run_one(path, out, opts, quiet=False):
    from audio_analyzer.analyze import analyze
    from audio_analyzer import report
    from audio_analyzer.html import write_html
    log = (lambda *a: None) if quiet else print
    log(f'{path}')
    res, arrays = analyze(path, sr=opts.sr, start=opts.start, end=opts.end, use_video=not opts.no_video,
                          markers=opts.markers, video_width=opts.video_width, hw=not opts.cpu_decode, log=log)
    out.mkdir(parents=True, exist_ok=True)
    report.write_json(res, out)
    report.write_timeline(res, arrays, out)
    report.write_events(res, out)
    report.write_summary(res, out)
    if not opts.no_html:
        write_html(res, arrays, out, Path(path))
    log(f'  -> {out}  ({res["timing_s"]["total"]} s)')
    return res


def _job(args):
    path, out, opts = args
    os.environ.setdefault('OMP_NUM_THREADS', '2')
    res = run_one(path, out, opts, quiet=True)
    lo = res.get('loudness', {})
    os_ = res.get('one_shot') or {}
    sp = res.get('spectrum', {})
    on = res.get('onsets', [])
    return {'file': Path(path).name, 'dur_s': res['duration_s'], 'lufs_i': lo.get('integrated_lufs'),
            'true_peak_dbtp': lo.get('true_peak_dbtp'), 'attack_ms': os_.get('attack_10_90_ms'),
            'decay_20db_ms': (os_.get('decay') or {}).get('to_-20dB_ms'), 'decay_60db_ms': (os_.get('decay') or {}).get('to_-60dB_ms'),
            'centroid_hz': sp.get('centroid_hz_median'), 'flatness': sp.get('flatness_median'),
            'low_share': round(sum((sp.get('band_energy_share') or {}).get(k) or 0 for k in ('sub', 'bass')), 3) if sp else None,
            'key': (lambda k: k['key'] if k and k['tonal'] == 'clear' else None)((res.get('tonal') or {}).get('key')), 'pitch': (res.get('tonal') or {}).get('pitch_median_note'),
            'onsets': len(on), 'first_type': on[0]['type'] if on else None, 'analysis': str(out)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('inputs', nargs='+', help='audio/video files or folders')
    ap.add_argument('-o', '--out', help='output folder (default: <file>_analysis next to the file)')
    ap.add_argument('--start', type=float, help='analyse from this second')
    ap.add_argument('--end', type=float, help='analyse up to this second')
    ap.add_argument('--markers', help='chapters/cues json ([{t,title}] or {chapters, cues}); default <file>.markers.json')
    ap.add_argument('--sr', type=int, default=48000, help='analysis sample rate (default 48000)')
    ap.add_argument('--no-video', action='store_true', help='skip the picture analysis')
    ap.add_argument('--no-html', action='store_true', help='skip report.html')
    ap.add_argument('--video-width', type=int, default=192, help='picture analysis width in px (default 192)')
    ap.add_argument('--cpu-decode', action='store_true', help='decode video on the CPU instead of the GPU')
    ap.add_argument('-j', '--jobs', type=int, default=max(1, (os.cpu_count() or 4) // 2), help='parallel files for folders')
    opts = ap.parse_args()

    files = []
    for i in opts.inputs:
        p = Path(i)
        if p.is_dir():
            files += sorted(f for f in p.rglob('*') if f.suffix.lower() in MEDIA and '_analysis' not in str(f.parent))
        elif p.is_file():
            files.append(p)
        else:
            sys.exit(f'not found: {i}')
    if not files:
        sys.exit('no audio/video files found')

    def out_for(f):
        if opts.out and len(files) == 1:
            return Path(opts.out)
        base = Path(opts.out) if opts.out else f.parent
        return base / f'{f.stem}_analysis'

    if len(files) == 1:
        run_one(files[0], out_for(files[0]), opts)
        return
    t0 = time.perf_counter()
    rows = []
    with ProcessPoolExecutor(max_workers=min(opts.jobs, len(files))) as ex:
        futs = {ex.submit(_job, (f, out_for(f), opts)): f for f in files}
        for fu in as_completed(futs):
            try:
                rows.append(fu.result())
                print(f'  done {futs[fu].name}')
            except Exception as e:                      # keep the batch going
                print(f'  FAILED {futs[fu].name}: {e}')
    rows.sort(key=lambda r: r['file'])
    base = Path(opts.out) if opts.out else Path(os.path.commonpath([str(f.parent) for f in files]))
    base.mkdir(parents=True, exist_ok=True)
    with (base / 'library.csv').open('w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    cols = [k for k in rows[0] if k != 'analysis']
    md = ['# Sound library', '', f'{len(rows)} files, analysed in {time.perf_counter() - t0:.1f} s. Each has its own `<name>_analysis/summary.md`.', '',
          '| ' + ' | '.join(cols) + ' |', '|' + '---|' * len(cols)]
    md += ['| ' + ' | '.join('–' if r[k] is None else str(r[k]) for k in cols) + ' |' for r in rows]
    (base / 'library.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
    print(f'library -> {base / "library.md"}')


if __name__ == '__main__':
    main()
