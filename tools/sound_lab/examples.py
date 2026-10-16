"""Render the example set to reference/sounds/ (gitignored) with a listening page:
    python tools/sound_lab/examples.py [--no-film] [--no-music]
then open http://localhost:8770/sounds/index.html (python tools/serve.py)."""
import argparse
import html
import json
import shutil
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))

from sound_lab import dsp as D          # noqa: E402
from sound_lab import music as M        # noqa: E402
from sound_lab import sfx as S          # noqa: E402

OUT = ROOT / 'reference' / 'sounds'
FILM = ROOT / 'reference' / 'films' / 'renders' / 'pc_scan_railgun_1440p60.mp4'

SFX = [  # (file, title, code, what it is)
    ('explosion_near', 'Explosion, close', "explosion(size=1.0)", 'Crack, sub thump with a pitch drop, swept noise body, debris crackle, rolling rumble tail.'),
    ('explosion_huge', 'Explosion, huge', "explosion(size=1.6, seed=3)", 'Same recipe scaled: longer body, deeper thump, more debris.'),
    ('explosion_far', 'Explosion, 3 km away', "explosion(size=1.2, distance=0.75)", 'Distance model: duller, delayed, more of the reflected sound.'),
    ('railgun_charge', 'Railgun charge', "railgun_charge(dur=4)", 'Capacitor whine rising 60 Hz to 3.2 kHz, FM shimmer, mains buzz, arcs getting denser.'),
    ('railgun_fire', 'Railgun shot', "railgun_fire()", 'Arc snap, falling FM zap, supersonic N-wave crack, sub punch, whistle leaving, terrain echoes.'),
    ('scan_sweep', 'Lime lightning scan', "scan_sweep(dur=2.5)", 'Glassy FM chirp sweeping left to right, branching electric forks, glass sparkles, sub swell.'),
    ('lock_on', 'Target lock', "lock_on(steps=5)", 'Beeps tightening in time, then a confirm chord.'),
    ('ui_select', 'UI select', "ui_blip('select')", ''),
    ('ui_confirm', 'UI confirm', "ui_blip('confirm')", ''),
    ('ui_deny', 'UI deny', "ui_blip('deny')", ''),
    ('data_stream', 'HUD data stream', "data_stream(dur=2)", 'Bit-crushed pentatonic bleeps scattered across the stereo field.'),
    ('whoosh_fast', 'Whoosh, fast camera move', "whoosh(dur=0.8, bright=0.9)", 'Doppler-shifted noise, swept band, pan across.'),
    ('whoosh_heavy', 'Whoosh, slow and heavy', "whoosh(dur=2.2, bright=0.3, heavy=1.0)", 'Adds a low tone doing the same pass.'),
    ('flyby_jet', 'Jet fly-by', "flyby_jet(dur=8)", 'Roar and turbine whine with full doppler (240 m/s, 90 m pass) and air absorption.'),
    ('missile_launch', 'Missile launch', "missile_launch(dur=6)", 'Ignition pop, rocket roar with crackle, then away with the doppler drop.'),
    ('servo', 'Servo / hydraulic move', "servo(dur=2.5)", 'Motor + gear whine following a speed curve, hydraulic hiss, start and stop clunks.'),
    ('clunk', 'Heavy lock clunk', "clunk(heavy=1.0)", 'Modal metal + body thud.'),
    ('clack', 'Light clack', "clunk(heavy=0.1)", ''),
    ('impact_metal', 'Metal impact', "impact(weight=1.0, metal=0.9)", 'Thud plus ringing inharmonic modes and debris.'),
    ('electric_arc', 'Electric arc', "electric_arc(dur=2.5)", 'Dense crackle gated in bursts over a 100 Hz buzz.'),
    ('reactor_hum', 'Reactor room bed', "reactor_hum(dur=10, base=50)", 'Mains hum harmonics beating slowly, filter breathing, air. Made to sit under scenes.'),
    ('sonar_ping', 'Sonar ping', "sonar_ping(1450)", ''),
    ('alarm', 'Alarm', "alarm(dur=3)", ''),
    ('thunder', 'Thunder', "thunder(distance=0.3)", 'Rip, crackle and a rolling rumble made of random bumps.'),
    ('splash', 'Splash', "splash(size=1.2)", ''),
    ('braam', 'Braam', "braam(note=36, dur=3)", 'Detuned brass saws on root/fifth/octave, filter bloom, heavy drive, sub.'),
    ('riser', 'Riser', "riser(dur=4)", 'Noise opening upward, saw stack rising an octave, tremolo speeding up.'),
    ('sub_drop', 'Sub drop', "sub_drop(2)", ''),
    ('trailer_hit', 'Trailer hit', "trailer_hit(note=33)", 'Sub drop + braam + crack in a huge hall.'),
]


def moments():
    """Short designed sequences that combine recipes."""
    rg = D.mix((S.riser(3.5, 1), -10, 0.6), (S.railgun_charge(4.0), -2, 0.0), (S.railgun_fire(), 0, 4.0), (S.thunder(0.6, 2), -10, 4.6),
               (S.clunk(1.0), -10, 9.5), (S.servo(2.0), -12, 10.0))
    scan = D.mix((S.reactor_hum(9.0), -18, 0.0), (S.scan_sweep(2.6, 1, 0), -2, 0.5), (S.scan_sweep(2.0, -1, 1), -6, 3.2),
                 (S.lock_on(5), -6, 5.4), (S.data_stream(2.5), -14, 5.8), (S.ui_blip('confirm'), -8, 7.6))
    launch = D.mix((S.alarm(2.0), -14, 0.0), (S.clunk(0.9), -6, 2.0), (S.missile_launch(7.0), 0, 2.4), (S.whoosh(1.5, 0.8), -10, 2.2),
                   (S.explosion(1.2, 0.8, 5), -6, 7.5))
    return [
        ('moment_railgun', 'Moment: charge, fire, echo, reset', 'riser + railgun_charge + railgun_fire + thunder + clunk + servo', D.normalize(rg, -1)),
        ('moment_scan', 'Moment: scan, lock, data', 'reactor_hum bed + two scan_sweeps + lock_on + data_stream + ui_blip', D.normalize(scan, -1)),
        ('moment_launch', 'Moment: alarm, launch, far hit', 'alarm + clunk + missile_launch + whoosh + explosion(distance=0.8)', D.normalize(launch, -1)),
    ]


def spectrogram_png(x, path, height=120, px_per_s=110, max_w=1400):
    from PIL import Image
    from scipy.signal import stft
    from audio_analyzer.features import mel_fb
    m = D.stereo(x).mean(1)
    n_fft, hop = 2048, 256
    _, _, Z = stft(m, D.SR, nperseg=n_fft, noverlap=n_fft - hop)
    fb, _ = mel_fb(D.SR, n_fft, height)
    P = 10 * np.log10(fb.T @ (np.abs(Z) ** 2) + 1e-12)
    hi = np.percentile(P, 99.5)
    v = np.clip((P - (hi - 80)) / 80, 0, 1)[::-1]
    w = int(min(max_w, max(200, len(m) / D.SR * px_per_s)))
    v = np.array(Image.fromarray((v * 255).astype(np.uint8)).resize((w, height), Image.BILINEAR)) / 255.0
    stops = np.array([[0, 11, 12, 10], [.3, 24, 46, 22], [.55, 70, 120, 25], [.78, 198, 244, 50], [1, 255, 255, 240]])
    rgb = np.stack([np.interp(v, stops[:, 0], stops[:, c]) for c in (1, 2, 3)], -1).astype(np.uint8)
    Image.fromarray(rgb).save(path)


def page(items, sections, out):
    def card(it):
        return (f"<div class='card'><div class='h'><b>{html.escape(it['title'])}</b><span>{it['dur']:.1f} s</span></div>"
                f"<img src='{it['png']}' alt=''><audio controls preload='none' src='{it['file']}'></audio>"
                f"<code>{html.escape(it['code'])}</code><p>{html.escape(it['what'])}</p></div>")
    body = ''
    for title, note, keys in sections:
        cards = ''.join(card(i) for i in items if i['group'] == keys)
        if cards:
            body += f"<h2>{title}</h2><p class='note'>{note}</p><div class='grid'>{cards}</div>"
    film = ''
    if (out / 'film_demo.mp4').exists():
        sc = json.loads((out / 'film_demo_score.json').read_text(encoding='utf-8'))
        rows = ''.join(f"<tr><td>{e['t']:.2f}</td><td>{e['sound']}</td><td>{html.escape(json.dumps(e['params']))}</td><td>{e['gain_db']}</td><td>{html.escape(e.get('why', ''))}</td></tr>"
                       for e in sc['events'])
        film = (f"<h2>Film demo: Scan · Railgun 7:50-8:50, scored automatically</h2><p class='note'>tools/sound_make.py auto on the render: "
                f"the analyzer found the flashes, scans and camera moves, auto_score placed {len(sc['events'])} sounds, a reactor bed and a "
                f"cinematic cue whose hits land on the biggest flashes ({', '.join(f'{h:.1f} s' for h in sc['music']['hits'])}). "
                f"No hand edits; this is the starting point Claude then refines.</p>"
                f"<video controls preload='none' src='film_demo.mp4'></video>"
                f"<details><summary>the score ({len(sc['events'])} events)</summary><table>{rows}</table></details>")
    sep = ''
    if (out / 'separation_demo' / 'index.html').exists():
        sep = ("<h2>Separation demo</h2><p class='note'>The film's original soundtrack (7:50-8:40) taken apart: tonal / transients / noise, "
               "4 bands, 8 NMF components, Demucs stems, and every sound cut out and grouped into families.</p>"
               "<p><a href='separation_demo/index.html'>open the separation page</a></p>")
    doc = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ONIKS sound lab</title><style>
:root{{--bg:#0B0C0A;--panel:#121411;--line:#24271f;--text:#E9EAE4;--dim:#8B8F83;--lime:#C6F432}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--text);font:13px/1.5 ui-monospace,'Cascadia Mono',Consolas,monospace;padding:20px 16px 60px}}
h1{{font-size:15px;margin:0 0 4px}} h2{{font-size:13px;margin:34px 0 4px;color:var(--lime);font-weight:600}}
.note{{color:var(--dim);margin:0 0 12px;max-width:900px}} a{{color:var(--lime)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}}
.card{{background:var(--panel);border:1px solid var(--line);padding:10px}} .h{{display:flex;justify-content:space-between;margin-bottom:6px}} .h span{{color:var(--dim)}}
.card img{{width:100%;height:70px;object-fit:fill;display:block;border:1px solid var(--line)}} audio{{width:100%;height:32px;margin:6px 0 4px}}
code{{color:var(--lime);font-size:12px;word-break:break-word}} .card p{{color:var(--dim);margin:4px 0 0;font-size:12px}}
video{{width:100%;max-width:1100px;border:1px solid var(--line);background:#000}} table{{border-collapse:collapse;font-size:12px;margin-top:8px}}
td{{border-bottom:1px solid var(--line);padding:2px 8px;vertical-align:top}} summary{{cursor:pointer;color:var(--dim);margin-top:8px}}
</style></head><body><h1>ONIKS sound lab</h1><p class='note'>Every sound here is generated by code (tools/sound_lab: numpy oscillators, filters,
noise, modal resonators, doppler, convolution reverb). No samples. Re-generate with <code>python tools/sound_lab/examples.py</code>.
Spectrograms: time left to right, 30 Hz bottom to 24 kHz top.</p>
{film}{body}{sep}</body></html>"""
    (out / 'index.html').write_text(doc, encoding='utf-8')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-film', action='store_true')
    ap.add_argument('--no-music', action='store_true')
    ap.add_argument('--no-sep', action='store_true')
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    items = []
    t0 = time.perf_counter()

    def save(name, title, code, what, x, group):
        D.write(OUT / f'{name}.wav', x)
        spectrogram_png(x, OUT / f'{name}.png')
        items.append({'file': f'{name}.wav', 'png': f'{name}.png', 'title': title, 'code': code, 'what': what,
                      'dur': len(x) / D.SR, 'group': group})
        print(f'  {name:22s} {len(x) / D.SR:5.1f} s')

    for name, title, code, what in SFX:
        save(name, title, code, what, eval('S.' + code), 'sfx')
    for name, title, code, x in moments():
        save(name, title, code, '', x, 'moment')
    if not a.no_music:
        for st, hits, what in (('cinematic', [24.0, 38.0], 'String pad, plucked 16th ostinato, taikos, sub; trailer hits at 24 s and 38 s with risers into them.'),
                               ('hybrid_trailer', [30.0], 'Taiko ensemble, 8th pulse, braams every 4 bars, kick; a hit at 30 s.'),
                               ('synthwave', [], 'Reese bass, supersaw pad, up/down arp, four-on-the-floor, a generated lead melody.'),
                               ('dark_ambient', [20.0], 'Two drones, slow pads, sparse FM bells, sub drops; one hit at 20 s.')):
            mix, _, info = M.compose(st, 45.0, seed=2, hits=hits)
            save(f'music_{st}', f'{st.replace("_", " ").title()} · {info["bpm"]} BPM · {info["key"]}',
                 f"compose('{st}', 45, hits={hits})", what, mix, 'music')
    if not a.no_film and FILM.exists():
        from sound_lab.score import auto_score, render_to
        from audio_analyzer.analyze import analyze
        print('  film demo: analysing 470-530 s')
        an, _ = analyze(FILM, start=470, end=530, log=lambda *x: None)
        an = json.loads(json.dumps(an, default=float))
        sc = auto_score(an, 'cinematic', True)
        sc.update(video=str(FILM), video_start=470.0, video_height=720, video_crf=21)
        (OUT / 'film_demo_score.json').write_text(json.dumps(sc, indent=1), encoding='utf-8')
        tmp = OUT / '_film_demo'
        render_to(sc, tmp)
        shutil.move(str(tmp / 'with_sound.mp4'), OUT / 'film_demo.mp4')
        shutil.move(str(tmp / 'mix.wav'), OUT / 'film_demo_mix.wav')
        shutil.rmtree(tmp, ignore_errors=True)
    if not a.no_sep and FILM.exists():
        from audio_analyzer.separate import run
        print('  separation demo')
        run(FILM, OUT / 'separation_demo', methods=('hpss', 'nmf', 'bands', 'events', 'demucs'), start=470, end=520, log=lambda *x: None)
    page(items, [('Moments', 'Recipes layered into short designed sequences.', 'moment'),
                 ('Sound effects', 'One call each; every parameter changes the sound (size, distance, duration, brightness, seed).', 'sfx'),
                 ('Music', 'compose(style, seconds, hits=[...]): the hits are times in seconds where the cue lands an accent.', 'music')], OUT)
    print(f'{OUT / "index.html"}  ({time.perf_counter() - t0:.0f} s)')


if __name__ == '__main__':
    main()
