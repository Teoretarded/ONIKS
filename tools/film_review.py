"""Prepare a film render for a review: frames every 0.5 s, contact sheets, and the camera log turned into numbers.

    python tools/film_review.py <video.mp4> [--camlog reference/films/shots/camlog/<film>.json] [--out <dir>]
                                [--every 0.5] [--t0 s] [--no-audio]

-> <out>/ (default: <video>_review/)
    frames/f_<ms>.jpg        one frame every --every s (1280 px wide), named by film time in ms
    sheets/s_<nnn>.jpg       3 x 3 contact sheets of those frames, each tile stamped with its time
    camera.csv               the camera every 0.1 s (from the log): eye, target, distance, speed (m/s), rel_speed (relative to the target), acceleration,
                             turn rate of the view (deg/s), fov and its rate, roll, what the frame shows, HUD text
    flags.md                 moments worth a look: fast turns, jerks, jumps (cuts), fov zooms, empty or blown-out
                             frames, long static holds, tags shown too briefly
    chapters.md              per chapter: length, camera speed and turn rate (mean / max), brightness
    audio/                   tools/audio_analyze.py on the video's sound (if it has any)
The camera log comes from the film page itself: open /films/<film>/<film>.html?camlog=1&hq=1 on tools/serve.py
(reference/films/common/camlog.js). """
import argparse
import csv
import glob
import json
import math
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from serve import find_ffmpeg  # noqa: E402


def sub(a, b): return [a[i] - b[i] for i in range(3)]
def norm(a): return math.sqrt(sum(x * x for x in a))


def angle(a, b):
    na, nb = norm(a), norm(b)
    if na < 1e-9 or nb < 1e-9:
        return 0.0
    c = max(-1.0, min(1.0, sum(a[i] * b[i] for i in range(3)) / (na * nb)))
    return math.degrees(math.acos(c))


def frames(video, out, every, t0=0.0):
    ff = find_ffmpeg()
    d = os.path.join(out, 'frames')
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(d, '*.jpg')):
        os.remove(f)
    subprocess.run([ff, '-hide_banner', '-loglevel', 'error', '-i', video, '-vf', f'fps=1/{every},scale=1280:-2',
                    '-q:v', '3', os.path.join(d, 'tmp_%06d.jpg')], check=True)
    fs = sorted(glob.glob(os.path.join(d, 'tmp_*.jpg')))
    named = []
    for k, f in enumerate(fs):
        t = t0 + k * every
        g = os.path.join(d, f'f_{int(round(t * 1000)):07d}.jpg')
        os.replace(f, g)
        named.append((t, g))
    return named


def sheets(named, out):
    from PIL import Image, ImageDraw, ImageFont
    d = os.path.join(out, 'sheets')
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(d, '*.jpg')):
        os.remove(f)
    try:
        font = ImageFont.truetype('consola.ttf', 22)
    except OSError:
        font = ImageFont.load_default()
    TW, TH = 640, 360
    for k in range(0, len(named), 9):
        S = Image.new('RGB', (TW * 3, TH * 3), (40, 40, 40))
        dr = ImageDraw.Draw(S)
        for j, (t, f) in enumerate(named[k:k + 9]):
            im = Image.open(f).convert('RGB').resize((TW, TH))
            x, y = (j % 3) * TW, (j // 3) * TH
            S.paste(im, (x, y))
            dr.rectangle([x, y, x + 118, y + 30], fill=(0, 0, 0))
            dr.text((x + 6, y + 4), f'{int(t // 60)}:{t % 60:05.2f}', fill=(198, 244, 50), font=font)
            dr.rectangle([x, y, x + TW - 1, y + TH - 1], outline=(90, 90, 90))
        S.save(os.path.join(d, f's_{k // 9:03d}.jpg'), quality=88)
    return len(range(0, len(named), 9))


def camera(camlog, out):
    with open(camlog, encoding='utf-8') as f:
        L = json.load(f)
    S = L['samples']
    rows, flags = [], []
    prev = None
    for i, s in enumerate(S):
        eye, tgt = s['eye'], s['tgt']
        fwd = s.get('fwd') or sub(tgt, eye)
        r = {'t': s['t'], 'chapter': s['ch'], 'ex': eye[0], 'ey': eye[1], 'ez': eye[2], 'tx': tgt[0], 'ty': tgt[1], 'tz': tgt[2],
             'dist': round(norm(sub(tgt, eye)), 2), 'fov': s['fov'], 'roll': s['roll']}
        if prev:
            dt = s['t'] - prev['t']
            v = norm(sub(eye, prev['eye'])) / dt
            r['speed'] = round(v, 2)
            r['turn'] = round(angle(fwd, prev.get('fwd') or sub(prev['tgt'], prev['eye'])) / dt, 2)
            r['fov_rate'] = round((s['fov'] - prev['fov']) / dt, 2)
            r['tgt_speed'] = round(norm(sub(tgt, prev['tgt'])) / dt, 2)
            r['rel_speed'] = round(norm(sub(sub(eye, tgt), sub(prev['eye'], prev['tgt']))) / dt, 2)   # the eye's motion relative to what it looks at (riding a fast subject reads as still)
            r['acc'] = round((v - rows[-1].get('speed', v)) / dt, 2) if rows else 0
        else:
            r.update(speed=0, turn=0, fov_rate=0, tgt_speed=0, rel_speed=0, acc=0)
        img = s.get('img') or {}
        r.update(mean=img.get('mean'), lit=img.get('lit'), clip=img.get('clip'), lime=img.get('lime'), coral=img.get('coral'),
                 lit_c=img.get('c'), kick=s.get('kick', ''), ro=s.get('ro', '')[:160], tags=' | '.join(s.get('tags') or [])[:300])
        if s.get('poi') is not None:
            r['in_frame'] = ', '.join(p['n'] for p in s['poi'] if p.get('vis'))
            r['out_of_frame'] = ', '.join(p['n'] for p in s['poi'] if not p.get('vis'))
        rows.append(r)
        prev = s
    keys = list(dict.fromkeys(k for r in rows for k in r))
    with open(os.path.join(out, 'camera.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)

    # flags
    def span(pred, label, min_len=0.0):
        a = None
        for r in rows + [None]:
            on = r is not None and pred(r)
            if on and a is None:
                a = r
            elif not on and a is not None:
                b = last
                if b['t'] - a['t'] >= min_len:
                    flags.append((a['t'], b['t'], label, a))
                a = None
            if r is not None:
                last = r
    span(lambda r: r['turn'] > 25, 'fast turn (> 25 deg/s)')
    span(lambda r: abs(r['acc']) > 40 and r['rel_speed'] < 500 and abs(r['rel_speed'] - r['speed']) < 1, 'jerk (|acceleration| > 40 m/s^2, camera not riding a subject)')
    span(lambda r: r['rel_speed'] > 5 * max(1.0, r['dist']), 'jump (eye moved > half the subject distance in 0.1 s relative to the subject: a cut or a frame change)')
    span(lambda r: abs(r['fov_rate']) > 8, 'fast zoom (fov > 8 deg/s)')
    span(lambda r: r['lit'] is not None and r['lit'] < .01, 'near-empty frame (< 1% lit)', .3)
    span(lambda r: r['clip'] is not None and r['clip'] > .25, 'blown out (> 25% clipped)', .2)
    span(lambda r: r['speed'] < .05 and r['turn'] < .2 and abs(r['fov_rate']) < .05, 'camera static for > 12 s (check pacing)', 12)
    # tags shown too briefly
    seen = {}
    for r in rows:
        for tg in filter(None, r['tags'].split(' | ')):
            k = tg[:3]                                   # (the tag's id: its text types itself in, letter by letter)
            a = seen.setdefault(k, [r['t'], r['t'], tg])
            if r['t'] - a[1] <= .15:
                a[1], a[2] = r['t'], tg
            else:
                if a[1] - a[0] < 2.0:
                    flags.append((a[0], a[1], f'tag on screen < 2 s: {a[2][:60]}', None))
                seen[k] = [r['t'], r['t'], tg]
    for k, a in seen.items():
        if a[1] - a[0] < 2.0:
            flags.append((a[0], a[1], f'tag on screen < 2 s: {a[2][:60]}', None))
    flags.sort()
    with open(os.path.join(out, 'flags.md'), 'w', encoding='utf-8') as f:
        f.write(f'# Flags: {L["film"]} ({len(rows)} camera samples, every {L["step"]} s)\n\n| from | to | what | chapter |\n|---|---|---|---|\n')
        for a, b, lab, r in flags:
            f.write(f'| {a:.1f} | {b:.1f} | {lab} | {(r or {}).get("chapter", "")} |\n')

    # per chapter
    ch = L.get('chapters') or []
    with open(os.path.join(out, 'chapters.md'), 'w', encoding='utf-8') as f:
        f.write('| chapter | from | len s | speed mean / max m/s | turn mean / max deg/s | fov range | brightness | lit |\n|---|---|---|---|---|---|---|---|\n')
        bounds = [c['t'] for c in ch] + [L['to']]
        for k, c in enumerate(ch):
            R = [r for r in rows if bounds[k] <= r['t'] < bounds[k + 1]]
            if not R:
                continue
            sp = [r['speed'] for r in R]
            tu = [r['turn'] for r in R]
            fv = [r['fov'] for r in R]
            mb = [r['mean'] or 0 for r in R]
            lt = [r['lit'] or 0 for r in R]
            f.write(f'| {c["title"]} | {c["t"]:.1f} | {bounds[k + 1] - bounds[k]:.1f} | {sum(sp) / len(sp):.1f} / {max(sp):.1f} | '
                    f'{sum(tu) / len(tu):.1f} / {max(tu):.1f} | {min(fv):.0f}-{max(fv):.0f} | {sum(mb) / len(mb):.3f} | {sum(lt) / len(lt):.2f} |\n')
    return len(rows), len(flags)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('video')
    ap.add_argument('--camlog')
    ap.add_argument('--out')
    ap.add_argument('--every', type=float, default=.5)
    ap.add_argument('--t0', type=float, default=0, help='film time at the start of the video (a part render)')
    ap.add_argument('--no-audio', action='store_true')
    a = ap.parse_args()
    out = a.out or os.path.splitext(a.video)[0] + '_review'
    os.makedirs(out, exist_ok=True)
    named = frames(a.video, out, a.every, a.t0)
    ns = sheets(named, out)
    print(f'{len(named)} frames, {ns} sheets')
    if a.camlog:
        n, nf = camera(a.camlog, out)
        shutil.copy(a.camlog, os.path.join(out, 'camlog.json'))
        print(f'{n} camera samples, {nf} flags')
    if not a.no_audio:
        ff = find_ffmpeg()
        probe = subprocess.run([ff, '-hide_banner', '-i', a.video], capture_output=True, text=True).stderr
        if 'Audio:' in probe:
            subprocess.run([sys.executable, os.path.join(HERE, 'audio_analyze.py'), a.video, '--out', os.path.join(out, 'audio')])
    print('->', out)


if __name__ == '__main__':
    main()
