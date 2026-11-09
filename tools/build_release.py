"""Build the shipped game: dist/ONIKS/ (ONIKS.exe + resources/), ready for Steam (steam/README.md) or a zip.

    python tools/build_release.py              build, copy, verify
    python tools/build_release.py --zip        also dist/ONIKS-<version>-win64.zip
    python tools/build_release.py --no-build   reuse the last exe (copy and verify only)
    python tools/build_release.py --no-verify  skip the run check

What it does:
  1. cargo build --release --no-default-features in app/ (target dir app/target/ship: the dev build is untouched).
     The shipped exe has no dev tools, no /save sink, no browser keys (app/src/main.rs SHIPPED_JS).
  2. Copies what the game loads at run time (RULES below) into dist/ONIKS/resources/, plus resources/version.json
     (version from app/tauri.conf.json, the git commit, the date). Docs, research, reviews, shots, dev pages, film
     prototypes and Rust sources stay behind.
  3. Verifies: copies dist/ONIKS to a temp folder outside the repo, starts it with ONIKS_LOG, opens the menu, a
     Sandbox match, the lab and every menu film over the DevTools port, and fails on any missing file, page error
     or request to the network.

The repo stays the source of truth: nothing in game/ or reference/ is changed; dist/ is gitignored.
"""
import argparse
import datetime
import fnmatch
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist', 'ONIKS')
CARGO = os.path.join(os.path.expanduser('~'), '.cargo', 'bin', 'cargo.exe')

# (folder, include globs, exclude globs) relative to the repo; '**' = any depth
RULES = [
    ('game', ['index.html', 'play.html', 'lab.html'], []),
    ('game/styles', ['**'], ['*.md']),
    ('game/src', ['**'], ['*.md', 'blast/fast/rs/**', 'dev/README*']),
    ('reference/menus/common', ['**'], ['*.md', '*.html']),
    ('reference/films/common', ['**'], ['*.md']),
    # every film's own top-level files (its html and <id>_*.js); not proto/, physics/, reviews/, shots/
    ('reference/films/*', ['*.html', '*.js', '*.css', '*.json'], ['*.md']),
]
SKIP_DIRS = {'shots', 'renders', 'reviews', 'proto', 'physics', '_brief', 'thumbs', '__pycache__', 'node_modules', 'target'}


def git(*a):
    return subprocess.run(['git', *a], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def version():
    with open(os.path.join(ROOT, 'app', 'tauri.conf.json'), encoding='utf-8') as f:
        return json.load(f)['version']


def build():
    print('building the shipped exe (cargo --release --no-default-features)...', flush=True)
    r = subprocess.run([CARGO, 'build', '--release', '--no-default-features', '--target-dir', 'target/ship'], cwd=os.path.join(ROOT, 'app'))
    if r.returncode:
        sys.exit('cargo build failed')


def tracked():
    return [p for p in git('ls-files', '-z').split('\0') if p]


def wanted(path):
    parts = path.split('/')
    if any(p in SKIP_DIRS for p in parts):
        return False
    for folder, inc, exc in RULES:
        fp = folder.split('/')
        if len(parts) <= len(fp) or not all(fnmatch.fnmatch(parts[i], fp[i]) for i in range(len(fp))):
            continue
        rest = '/'.join(parts[len(fp):])
        name = parts[-1]
        deep = '/' in rest
        ok = any(g == '**' or (not deep and fnmatch.fnmatch(rest, g)) for g in inc)
        if ok and not any(fnmatch.fnmatch(name, g) or fnmatch.fnmatch(rest, g) for g in exc):
            return True
    return False


def copy():
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    res = os.path.join(DIST, 'resources')
    files = [p for p in tracked() if wanted(p)]
    # (files added but not committed yet count too: the working tree is what ships)
    files += [p for p in git('ls-files', '-z', '--others', '--exclude-standard').split('\0') if p and wanted(p)]
    size = 0
    for p in sorted(set(files)):
        src = os.path.join(ROOT, p)
        if not os.path.isfile(src):
            continue
        dst = os.path.join(res, p)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        size += os.path.getsize(src)
    exe = os.path.join(ROOT, 'app', 'target', 'ship', 'release', 'oniks.exe')
    shutil.copy2(exe, os.path.join(DIST, 'ONIKS.exe'))
    info = {'name': 'ONIKS', 'version': version(), 'commit': git('rev-parse', '--short', 'HEAD'),
            'dirty': bool(git('status', '--porcelain', '--', 'game', 'reference', 'app')),
            'built': datetime.datetime.now().isoformat(timespec='seconds')}
    with open(os.path.join(res, 'version.json'), 'w', encoding='utf-8') as f:
        json.dump(info, f, indent=1)
    shutil.copy2(os.path.join(ROOT, 'reference', 'menus', 'common', 'fonts', 'OFL.txt'), os.path.join(DIST, 'FONTS-OFL.txt'))
    print('copied %d files, %.1f MB + exe %.1f MB -> %s' % (len(set(files)), size / 1e6, os.path.getsize(exe) / 1e6, DIST))
    return info


PAGES = [
    ('menu', 'game/index.html', "document.querySelector('#scr-quit') && document.fonts.status === 'loaded'"),
    ('sandbox', 'game/play.html?mode=sandbox', "window.ONIKS && ONIKS.game && ONIKS.sim && ONIKS.sim.t > 2"),
    ('lab', 'game/lab.html?style=pointcloud', "window.LAB && LAB.core.ready()"),
]


def verify():
    sys.path.insert(0, os.path.dirname(__file__))
    from app_cdp import Page
    tmp = tempfile.mkdtemp(prefix='oniks_ship_')
    run_dir = os.path.join(tmp, 'ONIKS')
    shutil.copytree(DIST, run_dir)
    logf = os.path.join(tmp, 'missing.log')
    films = []
    try:
        src = open(os.path.join(ROOT, 'game', 'src', 'data', 'settings.js'), encoding='utf-8').read()
        import re
        block = src[src.index('export const MENU_FILMS'):]
        block = block[:block.index('];')]
        films = [f for f in re.findall(r"\[\s*'([a-z0-9_]+)'", block) if f != 'random']
    except ValueError:
        pass
    pages = PAGES + [('film ' + f, 'reference/films/%s/%s.html?clean' % (f, f), "document.readyState === 'complete' && performance.now() > 4000") for f in films]
    bad = []
    env = dict(os.environ, ONIKS_DEBUG_PORT='9335', ONIKS_LOG=logf, ONIKS_SIZE='1280x720')
    env.pop('ONIKS_ROOT', None)
    pr = subprocess.Popen([os.path.join(run_dir, 'ONIKS.exe')], env=env, cwd=tmp)
    try:
        p = Page(9335, 60)
        p.call('Runtime.enable')
        p.call('Network.enable')
        for name, url, ready in pages:
            p.events.clear()
            p.eval("location.href = '/%s'; 1" % url)
            time.sleep(1)
            ok = p.wait(ready, 90)
            time.sleep(1.5)
            p.eval('1')
            errs = []
            for m in p.events:
                prm = m.get('params', {})
                if m.get('method') == 'Runtime.exceptionThrown':
                    d = prm['exceptionDetails']
                    errs.append('exception: ' + ((d.get('exception') or {}).get('description') or d.get('text', ''))[:200])
                elif m.get('method') == 'Runtime.consoleAPICalled' and prm.get('type') == 'error':
                    errs.append('console.error: ' + ' '.join(str(a.get('value', a.get('description', ''))) for a in prm['args'])[:200])
                elif m.get('method') == 'Network.requestWillBeSent':
                    u = prm['request']['url']
                    if not (u.startswith('http://oniks.localhost/') or u.startswith('data:') or u.startswith('blob:')):
                        errs.append('network: ' + u[:160])
            print('  %-28s %s%s' % (name, 'ok' if ok and not errs else 'FAIL', '' if ok else ' (never ready)'))
            for e in errs[:6]:
                print('      ' + e)
            if not ok or errs:
                bad.append(name)
    finally:
        pr.kill()
        subprocess.run(['taskkill', '/F', '/IM', 'ONIKS.exe'], capture_output=True)
    # (expected: the browser's favicon, and main.js asking for a folder listing before it falls back to HEAD requests)
    expected = {'', '404 favicon.ico', '404 game/src/'}
    missing = sorted(set(open(logf).read().split('\n')) - expected) if os.path.exists(logf) else []
    for m in missing:
        print('  missing: ' + m)
    time.sleep(1)
    shutil.rmtree(tmp, ignore_errors=True)
    if bad or missing:
        sys.exit('verify: %d page(s) failed, %d missing file(s)' % (len(bad), len(missing)))
    print('verify: %d pages clean, nothing missing, no network' % len(pages))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-build', action='store_true')
    ap.add_argument('--no-verify', action='store_true')
    ap.add_argument('--zip', action='store_true')
    a = ap.parse_args()
    if not a.no_build:
        build()
    info = copy()
    if not a.no_verify:
        verify()
    if a.zip:
        z = os.path.join(ROOT, 'dist', 'ONIKS-%s-win64.zip' % info['version'])
        with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            for d, _, fs in os.walk(DIST):
                for f in fs:
                    full = os.path.join(d, f)
                    zf.write(full, os.path.join('ONIKS', os.path.relpath(full, DIST)))
        print('zip: %s (%.1f MB)' % (z, os.path.getsize(z) / 1e6))


if __name__ == '__main__':
    main()
