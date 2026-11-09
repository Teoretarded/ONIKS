"""Render a film to MP4 (YouTube: 1440p60, max quality, H.264 + AAC) through the browser.

    python tools/render_film.py <film> [--res 1440] [--fps 60] [--from s] [--to s] [--ui hud|menu|none]
                                       [--std] [--no-audio] [--crf 14] [--maxrate 120M] [--port 8772] [--no-open] [--no-wait]

    python tools/render_film.py pc_scan_railgun                   the whole film -> reference/films/renders/pc_scan_railgun/pc_scan_railgun_1440p60.mp4
    python tools/render_film.py pc_scan_railgun --from 150 --to 160    a 10 s part -> ..._1440p60_150-160s.mp4

Starts the render server (tools/serve.py on --port) unless one is up, opens the film's render page in the default
browser (or prints it with --no-open: open it yourself, in a tab that stays open), and follows the job until the
MP4 is written. Re-running the same command resumes an interrupted job at its first unfinished 10 s chunk.
The page and the encoder: reference/films/common/render.js, tools/serve.py.
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))


def status(port, jid=None):
    url = f'http://127.0.0.1:{port}/render/status' + (f'?id={urllib.parse.quote(jid)}' if jid else '')
    with urllib.request.urlopen(url, timeout=3) as r:
        return json.loads(r.read())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('film', help='film id, e.g. pc_scan_railgun')
    ap.add_argument('--res', type=int, default=1440, help='frame height: 1080, 1440 or 2160 (16:9)')
    ap.add_argument('--fps', type=int, default=60)
    ap.add_argument('--from', dest='frm', type=float, default=None, help='start, s of film time')
    ap.add_argument('--to', type=float, default=None, help='end, s of film time')
    ap.add_argument('--ui', default='hud', choices=['hud', 'menu', 'none'])
    ap.add_argument('--std', action='store_true', help='the live density instead of the max-quality mode')
    ap.add_argument('--no-audio', action='store_true')
    ap.add_argument('--crf', type=float, default=14, help='x264 CRF (lower = better, bigger)')
    ap.add_argument('--maxrate', default='', help="cap the densest scenes' bitrate, e.g. 120M (default: none)")
    ap.add_argument('--port', type=int, default=8772)
    ap.add_argument('--no-open', action='store_true', help='print the page to open instead of opening it')
    ap.add_argument('--no-wait', action='store_true', help='do not follow the job')
    a = ap.parse_args()

    # a film id (films/<id>/<id>.html) or a page's path under films/ (e.g. pc_duel/proto/intercept)
    rel = a.film.replace(chr(92), '/').replace('.html', '').strip('/')
    film = rel.split('/')[-1]
    if '/' not in rel:
        rel = f'{film}/{film}'
    if not os.path.exists(os.path.join(HERE, '..', 'reference', 'films', *rel.split('/')) + '.html'):
        sys.exit(f'no such film: reference/films/{rel}.html')
    try:
        st = status(a.port)
        if not st.get('render'):
            raise OSError('not a render server')
    except Exception:  # noqa: BLE001
        print(f'starting the render server on {a.port}: python tools/serve.py {a.port}')
        flags = 0x00000008 | 0x00000200 if os.name == 'nt' else 0      # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        rdir = os.path.join(HERE, '..', 'reference', 'films', 'renders')
        os.makedirs(rdir, exist_ok=True)
        logf = open(os.path.join(rdir, f'server_{a.port}.log'), 'a')
        subprocess.Popen([sys.executable, '-u', os.path.join(HERE, 'serve.py'), str(a.port)], stdout=logf, stderr=subprocess.STDOUT,
                         creationflags=flags, close_fds=True)
        for _ in range(50):
            time.sleep(.2)
            try:
                if status(a.port).get('render'):
                    break
            except Exception:  # noqa: BLE001
                pass
        else:
            sys.exit('the render server did not start')
        print(f'  log: reference/films/renders/server_{a.port}.log')

    q = {'render': 1, 'res': a.res, 'fps': a.fps}
    if not a.std:
        q['hq'] = 1
    if a.frm is not None:
        q['from'] = f'{a.frm:g}'
    if a.to is not None:
        q['to'] = f'{a.to:g}'
    if a.ui != 'hud':
        q['ui'] = a.ui
    if a.no_audio:
        q['audio'] = 0
    if a.crf != 14:
        q['crf'] = f'{a.crf:g}'
    if a.maxrate:
        q['maxrate'] = a.maxrate
    url = f'http://127.0.0.1:{a.port}/films/{rel}.html?' + urllib.parse.urlencode(q)
    print('render page:', url)
    print('  (keep the tab open; the title shows the progress; re-open it to resume)')
    if not a.no_open:
        webbrowser.open(url)
    if a.no_wait:
        return
    known = {j['id'] for j in status(a.port)['jobs']}
    t0, jid, last = time.time(), None, ''
    while True:
        time.sleep(5)
        try:
            jobs = status(a.port)['jobs']
        except Exception as e:  # noqa: BLE001
            print('server gone:', e)
            return
        mine = [j for j in jobs if j['id'].startswith(f'{film}_{a.res}p{a.fps}')]
        if jid is None:
            fresh = [j for j in mine if j['id'] not in known or j['state'] == 'running']
            if not fresh:
                if time.time() - t0 > 600:
                    sys.exit('no job started in 10 min: is the page open?')
                continue
            jid = fresh[-1]['id']
        j = next((x for x in jobs if x['id'] == jid), None)
        if not j:
            continue
        line = f"{j['id']}: {j['next']}/{j['frames']} frames, {j['fps']:.2f} fps" + (f", ETA {j['eta_s'] // 60}:{j['eta_s'] % 60:02d}" if j.get('eta_s') else '')
        if line != last:
            print(line, flush=True)
            last = line
        if j['state'] == 'done':
            print('done:', j['out'])
            return
        if j['state'] == 'failed':
            sys.exit('failed: ' + str(j['error']))


if __name__ == '__main__':
    main()
