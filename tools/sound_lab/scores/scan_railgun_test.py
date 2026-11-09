"""Sound test: Scan · Railgun from the start to just after the shot, with designed music, picture-synced effects
and the film's own cues. Uses the existing 1440p60 render (shot at 477.5 s in that render).

    python tools/sound_lab/scores/scan_railgun_test.py [--preview-only]
-> reference/sounds/film_test_scan_railgun.mp4 (+ _mix.wav, _stems/)

Music: 119.4 BPM, F# minor (the tempo that best fits the picture's hits with the shot on a downbeat; the film's
own cues are in F#). The bar grid is anchored on the shot. Sections follow the tour; the drums stop one beat
before the shot, so the shot lands in silence on the downbeat."""
import argparse
import json
import subprocess
import sys
import shutil
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools'))

from sound_lab import dsp as D            # noqa: E402
from sound_lab import sfx as S            # noqa: E402
from sound_lab.music import Song, drone, bell, hz, chord, master   # noqa: E402
from sound_lab.score import render_score, auto_score               # noqa: E402
from audio_analyzer.decode import load_audio                       # noqa: E402

FILM = ROOT / 'reference/films/renders/pc_scan_railgun_1440p60.mp4'
ANALYSIS = ROOT / 'reference/films/renders/pc_scan_railgun_1440p60_analysis/analysis.json'
OUT = ROOT / 'reference/sounds'
FIRE, END = 477.5, 484.0
BPM, KEY = 119.4, 'F# minor'
SPB = 60 / BPM
BAR = 4 * SPB
K = int(FIRE // BAR)                 # the shot's bar
OFFSET = FIRE - K * BAR              # beat 0


def B(sec):
    return int(round((sec - OFFSET) / BAR))


def music():
    s = Song(BPM, KEY, bars=K + 4, seed=7, offset=OFFSET)
    sec = {'intro': (0, B(32)), 'engines': (B(32), B(96)), 'grooveA': (B(96), B(160)), 'breakdown': (B(160), B(200)),
           'grooveB': (B(200), B(264)), 'trans': (B(264), B(296)), 'fab': (B(296), B(392)), 'sink': (B(392), B(448)),
           'build': (B(448), K - 6), 'charge': (K - 6, K)}
    R = lambda *names: [b for n in names for b in range(*sec[n])]
    main = ['i', 'VI', 'III', 'VII']
    dark = ['i', 'VI', 'iv', 'v']
    s.track('drone', gain_db=-13, reverb=0.2).track('pad', gain_db=-12, reverb=0.3, duck=5)
    s.track('arp', gain_db=-15, reverb=0.25, duck=4).track('bass', gain_db=-7, duck=6)
    s.track('kick', gain_db=-3).track('clap', gain_db=-9, reverb=0.15).track('hat', gain_db=-17)
    s.track('snare', gain_db=-9, reverb=0.1).track('taiko', gain_db=-7, reverb=0.1).track('lead', gain_db=-13, reverb=0.3)
    s.track('bell', gain_db=-19, reverb=0.6).track('braam', gain_db=-9, reverb=0.1).track('riser', gain_db=-12)

    # bed: an F# drone under everything up to the charge
    s.put('drone', 0.0, drone(hz(30), s.t(sec['charge'][0] * 4) + 3, 0.9))
    s.put('drone', 0.0, drone(hz(37), s.t(sec['charge'][0] * 4) + 3, 0.5, seed=3))
    # pads
    s.pad(s.progression(main, R('intro', 'engines'), octave=3), bright=0.15, vel=0.6)
    s.pad(s.progression(['VI', 'VII', 'i', 'i'], R('breakdown'), octave=3), bright=0.3, vel=0.8)
    s.pad(s.progression(main, R('grooveA', 'grooveB', 'fab'), octave=3), bright=0.35)
    s.pad(s.progression(dark, R('trans', 'sink', 'build'), octave=3), bright=0.25)
    # bells in the quiet parts
    root = 6
    for b in R('intro', 'breakdown'):
        if s.r.random() < 0.55:
            m = 78 + [0, 3, 7, 10][s.r.integers(0, 4)]
            s.put('bell', s.t(b * 4 + s.r.integers(0, 8) / 2), bell(hz(m), 3.5, 0.5), pan=float(s.r.uniform(-0.7, 0.7)))
    # arps
    s.arp(s.progression(main, R('engines', 'grooveA', 'grooveB', 'fab')), rate=16, mode='updown', octaves=2, bright=0.35, vel=0.6)
    s.arp(s.progression(dark, R('trans', 'sink')), rate=8, mode='down', octaves=1, bright=0.2, vel=0.6)
    s.arp(s.progression(dark, R('build', 'charge')), rate=16, mode='up', octaves=2, bright=0.6, vel=0.7)
    # bass
    s.bass(s.progression(main, R('engines')), 'x.x.x.x.x.x.x.x.', inst='sub')
    s.bass(s.progression(main, R('grooveA', 'grooveB', 'fab')), '..x...x...x...x.', inst='reese')     # offbeat, against the kick
    s.bass(s.progression(dark, R('trans', 'sink')), 'x.......x.......', inst='reese')
    s.bass(s.progression(dark, R('build', 'charge')), 'x.x.x.x.x.x.x.x.', inst='reese')
    # drums
    s.drums('kick', 'x.......x.......', bars=R('engines', 'trans'))
    s.drums('kick', 'x...x...x...x...', bars=R('grooveA', 'grooveB', 'fab', 'build'))
    s.drums('kick', 'x.....x...x.....', bars=R('sink'))
    s.drums('hat', 'o.o.o.o.o.o.o.o.', bars=R('engines'), gain_db=-4)
    s.drums('hat', '..x...x...x...x.', bars=R('grooveA', 'grooveB', 'fab', 'build'))
    s.drums('hat', 'ooxoooxoooxoooxo', bars=R('fab', 'build'), gain_db=-6)
    s.drums('clap', '....x.......x...', bars=R('grooveA', 'grooveB', 'fab', 'build'))
    s.drums('taiko', 'x.....x.x...x...', bars=R('grooveB', 'sink', 'build'))
    # lead melody in the second half of the two big grooves
    gb, fb = sec['grooveB'], sec['fab']
    s.melody(s.progression(main, range((gb[0] + gb[1]) // 2, gb[1])), density=0.5)
    s.melody(s.progression(main, range((fb[0] + fb[1]) // 2, fb[1])), density=0.6)
    # braams on section downbeats, risers into them
    for name in ('grooveA', 'grooveB', 'fab', 'sink'):
        b0 = sec[name][0]
        s.put('riser', s.t(b0 * 4) - 4.0, S.riser(4.0, seed=b0))
        s.put('braam', s.t(b0 * 4), S.braam(note=30, dur=4.0, seed=b0))
    for b in range(fb[0] + 16, fb[1], 16):
        s.put('braam', s.t(b * 4), S.braam(note=30, dur=3.0, seed=b))
    # the charge: four-on-the-floor, then 8ths, a snare roll 16ths -> 32nds, and the last beat empty
    c0 = sec['charge'][0]
    s.drums('kick', 'x...x...x...x...', bars=range(c0, K - 2))
    s.drums('kick', 'x.x.x.x.x.x.x.x.', bars=range(K - 2, K))
    s.drums('taiko', 'x...x...x...x...', bars=range(c0, K))
    for b in range(K - 3, K):
        steps = 16 if b < K - 1 else 32
        for i in range(steps):
            beat = b * 4 + i * 4 / steps
            if beat >= K * 4 - 1:                       # silence on the last beat
                break
            v = 0.25 + 0.75 * ((b - (K - 3)) * steps + i) / (3 * 16)
            s.put('snare', s.t(beat), s.play('snare', vel=round(min(1.0, v), 2), seed=i % 4))
    s.put('riser', FIRE - 8.0, S.riser(8.0 - SPB, seed=99) * 10 ** (-4 / 20))
    mix, stems = s.render(master_lufs=-18, length=END + 4)
    # section dynamics: quiet intro and breakdown, full grooves (1 s ramps)
    lvl = {'intro': -5, 'engines': -3, 'grooveA': 0, 'breakdown': -7, 'grooveB': 0, 'trans': -5, 'fab': 0, 'sink': -2,
           'build': 0, 'charge': -2}
    pts = []
    for name, (b0, b1) in sec.items():
        pts += [(s.t(b0 * 4) + 0.5, lvl[name]), (s.t(b1 * 4) - 0.5, lvl[name])]
    pts = sorted(pts) + [(END + 5, 0)]
    mix *= (10 ** (D.as_curve([(0, lvl['intro'])] + pts, len(mix)) / 20))[:, None]
    # the gap: everything stops for the last beat before the shot
    g = np.ones(len(mix))
    a, z = D.n_of(FIRE - SPB), D.n_of(FIRE)
    g[a:z] = 0.0
    f = D.n_of(0.03)
    g[a - f:a] = np.linspace(1, 0, f)
    mix *= g[:, None]
    # after the shot: the tonic chord rings out with the drone an octave down
    tail = D.mix((S.braam(note=30, dur=6.0, seed=5), -6), (Song(BPM, KEY).play('pad', [hz(m) for m in chord(KEY, 'i', 3)], 6.5, 0.9), -4),
                 (drone(hz(18), 6.5, 0.9), -8))
    mix = D.mix((mix, 0), (D.fade(tail, 0.01, 2.0), -2, FIRE))
    return mix, {'bpm': BPM, 'key': KEY, 'offset': OFFSET, 'fire_bar': K,
                 'sections': {k: [round(s.t(v[0] * 4), 2), round(s.t(v[1] * 4), 2)] for k, v in sec.items()}}


def effects(analysis):
    sc = auto_score(analysis, music=False, bed=None, start=0.0, end=FIRE - 0.6)
    ev = []
    for e in sc['events']:
        if e['sound'] == 'explosion':           # in this film flashes are power coming on, not blasts
            w = e['params']['size']
            ev.append(dict(e, sound='impact', params={'weight': min(1.0, w), 'metal': 0.3, 'seed': e['params']['seed']}, gain_db=-8))
            ev.append(dict(e, sound='sub_drop', params={'dur': 1.5}, gain_db=-10, why=e['why'] + ' (weight)'))
        else:
            ev.append(e)
    # the shot, designed by hand
    ev += [
        {'t': FIRE - 9.5, 'sound': 'railgun_charge', 'params': {'dur': 9.5 - 0.02}, 'gain_db': -9, 'track': 'sfx', 'why': 'charge'},
        {'t': FIRE, 'sound': 'railgun_fire', 'params': {}, 'gain_db': 0, 'track': 'sfx', 'why': 'the shot'},
        {'t': FIRE, 'sound': 'trailer_hit', 'params': {'note': 30}, 'gain_db': -1, 'track': 'sfx', 'why': 'the shot, weight'},
        {'t': FIRE + 0.35, 'sound': 'electric_arc', 'params': {'dur': 3.4, 'seed': 3}, 'gain_db': -9, 'track': 'sfx', 'why': 'lightning tendrils'},
        {'t': FIRE + 0.4, 'sound': 'scan_sweep', 'params': {'dur': 3.0, 'seed': 8}, 'gain_db': -12, 'track': 'sfx', 'why': 'lime discharge'},
        {'t': 481.3, 'sound': 'whoosh', 'params': {'dur': 1.6, 'bright': 0.9, 'heavy': 0.7, 'seed': 4}, 'gain_db': -6, 'track': 'whoosh',
         'why': 'camera chases the round'},
    ]
    return {'duration': END + 4, 'tracks': {'sfx': {'gain_db': 0}, 'whoosh': {'gain_db': -4}, 'mech': {'gain_db': 0}, 'ui': {'gain_db': 0}},
            'events': sorted(ev, key=lambda e: e['t']), 'master': {'lufs': None, 'ceiling_db': -1, 'duck_music_db': 0}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--keep-wavs', action='store_true')
    a = ap.parse_args()
    an = json.loads(ANALYSIS.read_text(encoding='utf-8'))
    print(f'grid: {BPM} BPM, beat 0 at {OFFSET:.3f} s, shot = bar {K}')
    print('music...')
    mus, info = music()
    print('effects...')
    sc = effects(an)
    pre = dict(sc, events=[e for e in sc['events'] if e['t'] < FIRE])
    shot = dict(sc, events=[e for e in sc['events'] if e['t'] >= FIRE])
    fx_pre, _, _ = render_score(pre, log=lambda *x: None)
    fx_shot, _, _ = render_score(shot, log=lambda *x: None)
    print('film cues...')
    film = load_audio(FILM, 48000, 0, END + 4).astype(np.float64)
    film = D.to_lufs(film, -23)
    n = D.n_of(END + 4)
    pad = lambda x: np.pad(D.stereo(x), ((0, max(0, n - len(x))), (0, 0)))[:n]
    mus, film, fx_pre, fx_shot = pad(mus), pad(film), pad(fx_pre), pad(fx_shot)
    # the inhale: everything but the shot drops out for a quarter second, film cues sit lower during the charge
    g = np.ones(n)
    a, z, f = D.n_of(FIRE - 0.25), D.n_of(FIRE), D.n_of(0.02)
    g[a:z] = 0.0
    g[a - f:a] = np.linspace(1, 0, f)
    film *= (g * 10 ** (D.as_curve([(0, 0), (FIRE - 12, 0), (FIRE - 10, -6), (FIRE, -6), (FIRE + 0.5, -2)], n) / 20))[:, None]
    mus *= g[:, None]
    fx_pre *= g[:, None]
    fx = fx_pre + fx_shot
    mus = D.to_lufs(mus, -19.5)
    mus = D.duck(mus, fx + film, -7, 0.01, 0.35)          # music makes room for the effects
    mix = master(mus + fx + film, -15, -2.0)              # 2 dB headroom for the AAC encode
    mix = mix[:D.n_of(END)]
    mix = D.fade(mix, 0.0, 1.5)
    OUT.mkdir(parents=True, exist_ok=True)
    wav = OUT / 'film_test_scan_railgun_mix.wav'
    D.write(wav, mix)
    st = OUT / 'film_test_scan_railgun_stems'
    st.mkdir(exist_ok=True)
    for k, v in (('music', mus), ('effects', fx), ('film_cues', film)):
        D.write(st / f'{k}.wav', v[:D.n_of(END)])
    (OUT / 'film_test_scan_railgun_score.json').write_text(json.dumps({'music': info, 'effects': sc}, indent=1), encoding='utf-8')
    print(f'mix: LUFS {D.lufs(mix):.1f}, peak {20 * np.log10(np.abs(mix).max()):.1f} dBFS')
    print('video (GPU encode, fade out)...')
    out = OUT / 'film_test_scan_railgun.mp4'
    cmd = [shutil.which('ffmpeg'), '-nostdin', '-v', 'error', '-y', '-hwaccel', 'd3d11va', '-i', str(FILM), '-i', str(wav),
           '-t', f'{END:.3f}', '-map', '0:v:0', '-map', '1:a:0', '-vf', f'fade=t=out:st={END - 1.2:.2f}:d=1.2',
           '-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'vbr_peak', '-b:v', '40M', '-maxrate', '60M', '-bufsize', '80M',
           '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', str(out)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print('AMF failed, using libx264:', r.stderr[-300:])
        cmd = [c for c in cmd]
        i = cmd.index('h264_amf')
        cmd[i - 1:i + 13] = ['-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p']
        subprocess.run(cmd, check=True)
    print(out)


if __name__ == '__main__':
    main()
