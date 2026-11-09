"""Upload dist/ONIKS (tools/build_release.py) to Steam with Valve's SteamCMD. Steps and background: steam/README.md.

    python tools/steam_upload.py --dry-run                write the build scripts only (steam/build/), no login
    python tools/steam_upload.py --user <steam login>     upload; SteamCMD asks for the password and Steam Guard
    python tools/steam_upload.py --user <login> --live beta   also set the build live on a branch (never 'default'
                                                                from here: do that in the Steamworks site)

steam/config.json holds the App ID and Depot ID (from Steamworks, after the Steam Direct fee). SteamCMD is downloaded
from Valve on first use into steam/steamcmd/ (gitignored). The password is typed into SteamCMD itself; this script
never sees it.
"""
import argparse
import io
import json
import os
import subprocess
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STEAM = os.path.join(ROOT, 'steam')
CMD_DIR = os.path.join(STEAM, 'steamcmd')
CMD = os.path.join(CMD_DIR, 'steamcmd.exe')
CMD_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip'
DIST = os.path.join(ROOT, 'dist', 'ONIKS')


def config():
    with open(os.path.join(STEAM, 'config.json'), encoding='utf-8') as f:
        c = json.load(f)
    if not c.get('app_id') or not c.get('depot_id'):
        sys.exit('steam/config.json: set app_id and depot_id (Steamworks > your app > SteamPipe > Depots) first')
    return c


def vdf(d, ind=0):
    out = []
    for k, v in d.items():
        if isinstance(v, dict):
            out.append('\t' * ind + '"%s"' % k)
            out.append('\t' * ind + '{')
            out.append(vdf(v, ind + 1))
            out.append('\t' * ind + '}')
        else:
            out.append('\t' * ind + '"%s"\t\t"%s"' % (k, str(v).replace('\\', '\\\\').replace('"', '\\"')))
    return '\n'.join(out)


def scripts(c, live):
    build = os.path.join(STEAM, 'build')
    os.makedirs(os.path.join(build, 'output'), exist_ok=True)
    try:
        ver = json.load(open(os.path.join(DIST, 'resources', 'version.json'), encoding='utf-8'))
        desc = 'ONIKS %s (%s)' % (ver['version'], ver['commit'])
    except OSError:
        desc = 'ONIKS'
    depot = {'DepotBuild': {
        'DepotID': c['depot_id'],
        'ContentRoot': DIST,
        'FileMapping': {'LocalPath': '*', 'DepotPath': '.', 'Recursive': '1'},
        'FileExclusion': '*.pdb',
    }}
    app = {'AppBuild': {
        'AppID': c['app_id'],
        'Desc': desc,
        'ContentRoot': DIST,
        'BuildOutput': os.path.join(build, 'output'),
        'SetLive': live or '',
        'Preview': '0',
        'Depots': {str(c['depot_id']): os.path.join(build, 'depot_build.vdf')},
    }}
    with open(os.path.join(build, 'depot_build.vdf'), 'w', encoding='utf-8') as f:
        f.write(vdf(depot) + '\n')
    app_vdf = os.path.join(build, 'app_build.vdf')
    with open(app_vdf, 'w', encoding='utf-8') as f:
        f.write(vdf(app) + '\n')
    return app_vdf, desc


def steamcmd():
    if os.path.exists(CMD):
        return CMD
    print('downloading SteamCMD from Valve...', flush=True)
    os.makedirs(CMD_DIR, exist_ok=True)
    data = urllib.request.urlopen(CMD_URL, timeout=60).read()
    zipfile.ZipFile(io.BytesIO(data)).extractall(CMD_DIR)
    return CMD


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--user', help='your Steamworks login (an account with upload rights on the app)')
    ap.add_argument('--live', help="branch to set the build live on, e.g. 'beta' (not 'default')")
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    if not os.path.exists(os.path.join(DIST, 'ONIKS.exe')):
        sys.exit('no dist/ONIKS: run python tools/build_release.py first')
    if a.live == 'default':
        sys.exit("set the default branch live in the Steamworks site (Builds), not from here")
    c = config()
    app_vdf, desc = scripts(c, a.live)
    print('build scripts: %s (%s)' % (app_vdf, desc))
    if a.dry_run:
        return
    if not a.user:
        sys.exit('--user <steam login> (or --dry-run)')
    exe = steamcmd()
    # interactive: SteamCMD asks for the password and the Steam Guard code in this console
    r = subprocess.run([exe, '+login', a.user, '+run_app_build', app_vdf, '+quit'])
    sys.exit(r.returncode)


if __name__ == '__main__':
    main()
