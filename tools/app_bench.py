"""App vs browser: the same bench (game/src/dev/app_bench.js) in the ONIKS app (app/, WebView2) and in Chrome, at
1600 x 900, one after the other (never both open), `--rounds` times each, alternating.

    python tools/app_bench.py [--rounds 2] [--page "game/lab.html?style=pointcloud&blast=fast"]

Needs: app/target/release/oniks.exe (cargo build --release in app/), Chrome, tools/serve_game.py on 8771 for Chrome.
Prints one JSON line per run and a summary; writes game/shots/app_bench.json.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(__file__))
from app_cdp import Page  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXE = os.path.join(ROOT, 'app', 'target', 'release', 'oniks.exe')
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
FLAGS = ['--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
         '--disable-backgrounding-occluded-windows']
JS = "(async()=>{const B=await import('/game/src/dev/app_bench.js'); return await B.run();})()"


def bench(port):
    p = Page(port, 60)
    p.call('Emulation.setDeviceMetricsOverride', width=1600, height=900, deviceScaleFactor=1, mobile=False)
    if not p.wait('window.LAB && LAB.core.ready()', 180):
        return {'err': 'lab never ready'}
    r = p.eval(JS)
    r.pop('ua', None)
    return r


def app(page):
    env = dict(os.environ, ONIKS_DEBUG_PORT='9333', ONIKS_SIZE='1600x900', ONIKS_PAGE=page)
    pr = subprocess.Popen([EXE], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        return bench(9333)
    finally:
        pr.kill()
        subprocess.run(['taskkill', '/F', '/IM', 'oniks.exe'], capture_output=True)
        time.sleep(3)


def chrome(page):
    prof = os.path.join(tempfile.gettempdir(), 'oniks_chrome_prof')
    pr = subprocess.Popen([CHROME, '--user-data-dir=' + prof, '--remote-debugging-port=9334', '--no-first-run',
                           '--no-default-browser-check', '--window-size=1616,1000', *FLAGS,
                           '--app=http://127.0.0.1:8771/' + page])
    try:
        return bench(9334)
    finally:
        try:
            Page(9334, 5).call('Browser.close')
        except BaseException:
            pr.kill()
        time.sleep(3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rounds', type=int, default=2)
    ap.add_argument('--page', default='game/lab.html?style=pointcloud&blast=fast')
    a = ap.parse_args()
    runs = []
    for i in range(a.rounds):
        for name, f in (('app', app), ('chrome', chrome)) if i % 2 == 0 else (('chrome', chrome), ('app', app)):
            r = f(a.page)
            r['run'] = name
            runs.append(r)
            print(json.dumps(r), flush=True)
    summ = {}
    for name in ('app', 'chrome'):
        rs = [r for r in runs if r['run'] == name and 'hits' in r]
        warm = [h for r in rs for h in r['hits'][1:]]
        summ[name] = {
            'warm_hit_p50': round(sum(h['p50'] for h in warm) / max(1, len(warm)), 1),
            'warm_hit_p95': round(sum(h['p95'] for h in warm) / max(1, len(warm)), 1),
            'warm_over16_per_run': round(sum(h['over16'] for h in warm) / max(1, len(warm)), 1),
            'first_hit_max': [r['hits'][0]['max'] for r in rs],
            'live': [r['live'] for r in rs],
        }
    print(json.dumps(summ, indent=1))
    os.makedirs(os.path.join(ROOT, 'game', 'shots'), exist_ok=True)
    with open(os.path.join(ROOT, 'game', 'shots', 'app_bench.json'), 'w') as f:
        json.dump({'runs': runs, 'summary': summ}, f, indent=1)


if __name__ == '__main__':
    main()
