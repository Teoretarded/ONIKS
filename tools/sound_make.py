"""Make sound programmatically (tools/sound_lab). Subcommands:

  list                                   every sound recipe with its parameters
  sfx <recipe> [key=value ...] -o x.wav  one sound effect          e.g. sfx explosion size=1.4 distance=0.3
  music <style> --dur 60 [--bpm --key --hits 12.5,30 --seed] -o x.wav     styles: cinematic synthwave dark_ambient hybrid_trailer
  score <score.json> [-o dir]            render a score (events, beds, music, master) -> mix.wav, stems/, with_sound.mp4
  auto <media or analysis.json> [--start --end --style --no-music] -o score.json
                                          first-pass score from the picture (runs tools/audio_analyze.py if needed)
  refs [filter]                          the reference recordings (reference/sounds/refs): length, level, onsets, tonality
  layer <ref> [--start --dur --rate --semis --stretch --hp --lp --dist --space --wet --under --hull --bed --dewhistle] -o x.wav
                                          one real recording through the sample layer engine (sound_lab/samples.py)
  master <wav> [--lufs -14 --tp -1] -o x.wav   loudness (BS.1770) + true-peak limiter
Details: tools/sound_lab/README.md"""
import argparse
import inspect
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def _val(v):
    for f in (int, float):
        try:
            return f(v)
        except ValueError:
            pass
    return {'true': True, 'false': False}.get(v.lower(), v)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('list')
    p = sub.add_parser('sfx')
    p.add_argument('recipe')
    p.add_argument('params', nargs='*')
    p.add_argument('-o', '--out')
    p = sub.add_parser('music')
    p.add_argument('style')
    p.add_argument('--dur', type=float, default=60)
    p.add_argument('--bpm', type=float)
    p.add_argument('--key')
    p.add_argument('--hits', default='')
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--stems', action='store_true')
    p.add_argument('-o', '--out')
    p = sub.add_parser('score')
    p.add_argument('score')
    p.add_argument('-o', '--out')
    p = sub.add_parser('auto')
    p.add_argument('input')
    p.add_argument('--start', type=float, default=0.0)
    p.add_argument('--end', type=float)
    p.add_argument('--style', default='cinematic')
    p.add_argument('--no-music', action='store_true')
    p.add_argument('--render', action='store_true', help='also render it (and put it on the video)')
    p.add_argument('-o', '--out')
    p = sub.add_parser('refs')
    p.add_argument('filter', nargs='?', default='')
    p = sub.add_parser('layer')
    p.add_argument('ref')
    p.add_argument('--start', type=float, default=None, help='s into the recording (default: its steadiest stretch)')
    p.add_argument('--dur', type=float, default=8.0)
    p.add_argument('--bed', action='store_true', help='a loop-free bed of --dur s (random chunks, crossfaded)')
    p.add_argument('--hit', type=int, default=None, help='the N-th strongest onset instead of a stretch')
    p.add_argument('--rate', type=float, default=1.0, help='varispeed (pitch and time together)')
    p.add_argument('--semis', type=float, default=0.0, help='pitch shift, length kept')
    p.add_argument('--stretch', type=float, default=1.0, help='time stretch, pitch kept')
    p.add_argument('--hp', type=float)
    p.add_argument('--lp', type=float)
    p.add_argument('--dewhistle', type=float, default=None, help='remove whistles/whines above this Hz')
    p.add_argument('--dist', type=float, default=None, help='move it to this many metres (air absorption, 1/r)')
    p.add_argument('--space', default=None, help='engine_room power_room compartment hangar deck open_sea sky water hull')
    p.add_argument('--wet', type=float, default=0.3)
    p.add_argument('--under', action='store_true', help='heard from under the water')
    p.add_argument('--hull', action='store_true', help='heard through steel structure')
    p.add_argument('-o', '--out', default='layer.wav')
    p = sub.add_parser('master')
    p.add_argument('wav')
    p.add_argument('--lufs', type=float, default=-14.0)
    p.add_argument('--tp', type=float, default=-1.0)
    p.add_argument('-o', '--out')
    a = ap.parse_args()

    if a.cmd == 'refs':
        sys.argv = ['inventory', a.filter]
        from sound_lab import inventory
        inventory.main()
        return
    if a.cmd == 'layer':
        from sound_lab import samples as S, mixer as MX
        if a.hit is not None:
            x = S.hit(a.ref, a.hit)
        elif a.bed:
            x = S.bed(a.ref, a.dur, 0)
        else:
            st = S.steady(a.ref, a.dur) if a.start is None else a.start
            x = S.seg(a.ref, st, a.dur)
        if a.rate != 1.0:
            x = S.vari(x, a.rate)
        if a.semis:
            x = S.shift(x, a.semis)
        if a.stretch != 1.0:
            x = S.stretch(x, a.stretch)
        if a.dewhistle:
            x = S.dewhistle(x, a.dewhistle)
        x = S.eq(x, hp=a.hp, lp=a.lp)
        if a.dist:
            x = S.distance(x, a.dist)
        if a.under:
            x = S.underwater(x)
        if a.hull:
            x = S.through_hull(x)
        if a.space:
            x = S.space(x, a.space, a.wet)
        y, rep = MX.master(x, -18.0, -1.0, log=None)
        MX.write_wav(a.out, y)
        print(f'{a.out}  {len(y) / 48000:.2f} s  {rep["lufs"]} LUFS  {rep["tp"]} dBTP')
        return
    if a.cmd == 'master':
        import soundfile as sf
        from sound_lab import mixer as MX
        x, sr = sf.read(a.wav, always_2d=True)
        if sr != 48000:
            sys.exit('master: 48 kHz input expected')
        y, rep = MX.master(x, a.lufs, a.tp)
        MX.write_wav(a.out or a.wav[:-4] + '_master.wav', y)
        print(rep)
        return

    from sound_lab import dsp as D
    if a.cmd == 'list':
        from sound_lab.sfx import RECIPES
        for k, fn in RECIPES.items():
            sig = ', '.join(f'{n}={v.default!r}' for n, v in inspect.signature(fn).parameters.items())
            print(f'{k}({sig})\n    {(fn.__doc__ or "").strip().splitlines()[0] if fn.__doc__ else ""}')
        from sound_lab import music
        print('\nmusic styles:', ', '.join(music.STYLES), '\ninstruments:', ', '.join(music.INSTRUMENTS))
    elif a.cmd == 'sfx':
        from sound_lab.sfx import RECIPES
        kw = dict((k, _val(v)) for k, v in (x.split('=', 1) for x in a.params))
        x = RECIPES[a.recipe](**kw)
        out = a.out or f'{a.recipe}.wav'
        D.write(out, x)
        print(f'{out}  {len(x) / D.SR:.2f} s')
    elif a.cmd == 'music':
        from sound_lab import music
        hits = [float(h) for h in a.hits.split(',') if h]
        mix, stems, info = music.compose(a.style, a.dur, a.bpm, a.key, a.seed, hits)
        out = Path(a.out or f'{a.style}.wav')
        D.write(out, mix)
        if a.stems:
            for k, v in stems.items():
                D.write(out.with_name(f'{out.stem}_{k}.wav'), v)
        print(f'{out}  {info["style"]} {info["bpm"]} BPM {info["key"]}, {len(mix) / D.SR:.1f} s')
    elif a.cmd == 'score':
        from sound_lab.score import render_to
        sc = json.loads(Path(a.score).read_text(encoding='utf-8'))
        out = Path(a.out) if a.out else Path(a.score).with_suffix('')
        res = render_to(sc, out, a.score)
        print(f'{out}  LUFS {res["lufs"]:.1f}, peak {res["peak_dbfs"]:.1f} dBFS')
    elif a.cmd == 'auto':
        from sound_lab.score import auto_score, render_to
        src = Path(a.input)
        if src.suffix == '.json':
            an = json.loads(src.read_text(encoding='utf-8'))
            media = an['file']['path']
        else:
            from audio_analyzer.analyze import analyze
            print('analysing', src)
            an, _ = analyze(src, start=a.start or None, end=a.end, log=lambda *x: None)
            an = json.loads(json.dumps(an, default=float))
            media = str(src)
            a.start, a.end = 0.0, None                      # the analysis already covers just the range
        sc = auto_score(an, a.style, not a.no_music, start=a.start, end=a.end)
        rng = an.get('range') or {}
        sc['video'] = str(Path(media).resolve()) if (an.get('file') or {}).get('video') else None
        sc['video_start'] = (rng.get('start_s') or 0.0) + (a.start or 0.0)
        out = Path(a.out or 'score.json')
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(sc, indent=1), encoding='utf-8')
        print(f'{out}  {len(sc["events"])} events, music hits {sc.get("music", {}).get("hits")}')
        if a.render:
            res = render_to(sc, out.with_suffix(''), out)
            print(f'  rendered -> {out.with_suffix("")}  LUFS {res["lufs"]:.1f}')


if __name__ == '__main__':
    main()
