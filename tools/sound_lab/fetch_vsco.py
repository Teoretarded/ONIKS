"""Fetch the instruments the scores use from VSCO 2 Community Edition (Versilian Studios, CC0 1.0).

    python tools/sound_lab/fetch_vsco.py [--all] [--dry]

Source: the official repository https://github.com/sgossner/VSCO-2-CE (branch SFZ: the samples plus the .sfz maps).
Only samples (.wav), the .sfz maps and the text files (LICENSE, readmes, notes) are downloaded; anything else in the
repository (archives, executables) is skipped. The LICENSE is checked to be CC0 1.0 before anything else is fetched.
-> reference/sounds/instruments/vsco2ce/ (gitignored), paths as in the repository. Re-running only fetches what is
missing. Credit: Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell (VSCO 2 CE readme).
"""
import argparse
import concurrent.futures as cf
import json
import os
import re
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEST = os.path.join(ROOT, 'reference', 'sounds', 'instruments', 'vsco2ce')
REPO = 'sgossner/VSCO-2-CE'
BRANCH = 'SFZ'
RAW = f'https://raw.githubusercontent.com/{REPO}/{BRANCH}/'
TREE = f'https://api.github.com/repos/{REPO}/git/trees/{BRANCH}?recursive=1'

# the instruments (their .sfz maps) and raw folders (unmapped VSCO 1 percussion) the scores use
SFZ = ['CelloEnsSpic', 'ViolaEnsSpic', 'ViolinEnsSpic', 'ContrabassSpic',
       'CelloEnsSusVib', 'ViolaEnsSusVib', 'ViolinEnsSusVib', 'ContrabassSusVB',
       'CelloEnsTrem', 'ViolaEnsTrem', 'ViolinEnsTrem', 'ContrabassTrem', 'CelloEnsPizz',
       'FHornSus', 'TromboneSus', 'TubaSus', 'Timpani', 'TimpaniRolls', 'UprightPiano']
FOLDERS = ['VSCO 1 Percussion/drums/bass/', 'VSCO 1 Percussion/drums/other/ethnic/giant/',
           'VSCO 1 Percussion/varMetal/Cymbals/susp/']
FILES = ['LICENSE', 'README.md', 'Readme.txt']
OK_EXT = ('.wav', '.sfz', '.txt', '.md')


def get(url, timeout=120):
    req = urllib.request.Request(url, headers={'User-Agent': 'oniks-sound-lab'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def raw_url(path):
    return RAW + urllib.parse.quote(path)


def sfz_samples(text):
    """The sample paths an .sfz map names (default_path + sample=), with / separators."""
    base = ''
    out = []
    for line in text.splitlines():
        line = line.split('//')[0].strip()
        m = re.match(r'default_path=(.*)', line)
        if m:
            base = m.group(1).strip().replace('\\', '/')
        m = re.match(r'sample=(.*\.wav)', line, re.I)
        if m:
            out.append((base + m.group(1).strip().replace('\\', '/')).lstrip('/'))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--jobs', type=int, default=8)
    a = ap.parse_args()
    os.makedirs(DEST, exist_ok=True)
    lic = get(raw_url('LICENSE')).decode('utf-8', 'replace')
    if not lic.lstrip().startswith('CC0 1.0 Universal'):
        sys.exit('LICENSE is not CC0 1.0; stopping')
    tree = json.loads(get(TREE))
    blobs = {e['path']: e.get('size', 0) for e in tree['tree'] if e['type'] == 'blob'}
    want = set(FILES)
    for name in SFZ:
        p = name + '.sfz'
        if p not in blobs:
            print('  no map', p)
            continue
        want.add(p)
        text = get(raw_url(p)).decode('utf-8', 'replace')
        for s in sfz_samples(text):
            if s in blobs:
                want.add(s)
            else:
                print('  missing sample', s)
    for f in FOLDERS:
        want |= {p for p in blobs if p.startswith(f)}
    want = sorted(p for p in want if p == 'LICENSE' or p.lower().endswith(OK_EXT))
    todo = [p for p in want if not (os.path.exists(os.path.join(DEST, p)) and os.path.getsize(os.path.join(DEST, p)) == blobs[p])]
    mb = sum(blobs[p] for p in todo) / 1e6
    print(f'{len(want)} files, {len(todo)} to fetch ({mb:.0f} MB) -> {DEST}')
    if a.dry:
        return

    def one(p):
        y = get(raw_url(p))
        d = os.path.join(DEST, *p.split('/'))
        os.makedirs(os.path.dirname(d), exist_ok=True)
        with open(d + '.part', 'wb') as f:
            f.write(y)
        os.replace(d + '.part', d)
        return len(y)

    n = 0
    fails = []
    with cf.ThreadPoolExecutor(a.jobs) as ex:
        futs = {ex.submit(one, p): p for p in todo}
        for fut in cf.as_completed(futs):
            try:
                n += fut.result()
            except Exception as e:  # noqa: BLE001
                fails.append((futs[fut], str(e)))
    for p, e in fails:
        try:
            one(p)
        except Exception as e2:  # noqa: BLE001
            print('  failed', p, e2)
    print(f'done ({n / 1e6:.0f} MB)')


if __name__ == '__main__':
    main()
