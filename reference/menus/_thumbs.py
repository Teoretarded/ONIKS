"""Gallery thumbnails for menus/index.html.

  python _thumbs.py url     -> prints the _shoot.html query that captures every moment below
  python _thumbs.py         -> converts shots/<id>_t<sec>.png into thumbs/<id>_<k>.jpg
k = 0 is the hero still, 1..3 the strip under it.
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MOMENTS = {
    'o1_ignition': ['10.75', '7', '11.3', '13.6'],
    'o2_seaskim': ['22.5', '9', '16', '27'],
    'o3_orbit': ['22', '1.5', '7.5', '29.5'],
    'o4_chronograph': ['19', '4', '10', '12.3'],
    'o5_terminal': ['27.3', '6.8', '11', '24.4'],
    'p1_strike': ['4.8', '1.72', '2.4', '19.5'],
    'p2_clutter': ['20.6', '8.6', '16.6', '52.6'],
    'p3_coastline': ['29.5', '6.5', '14', '24.5'],
    'p4_track': ['8.6', '1.5', '7.4', '11'],
    'p5_confidence': ['17', '4.9', '9.2', '23.4'],
}


def tag(t):
    return 't' + t.replace('.', '_')


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'url':
        print('http://localhost:8770/menus/_shoot.html?s=' + ';'.join(f"{k}@{','.join(v)}" for k, v in MOMENTS.items()))
        sys.exit()
    os.makedirs(os.path.join(HERE, 'thumbs'), exist_ok=True)
    for page, ts in MOMENTS.items():
        for k, t in enumerate(ts):
            src = os.path.join(HERE, 'shots', f'{page}_{tag(t)}.png')
            if not os.path.exists(src):
                print('missing', src)
                continue
            im = Image.open(src).convert('RGB')
            im.thumbnail((1280, 720) if k == 0 else (640, 360), Image.LANCZOS)
            im.save(os.path.join(HERE, 'thumbs', f'{page}_{k}.jpg'), quality=88)
    print('ok')
