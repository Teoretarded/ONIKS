"""Gallery thumbnails for films/index.html.

  python _thumbs.py url     -> prints the _shoot.html query that captures every moment below
  python _thumbs.py         -> converts shots/<id>_t<sec>.png into thumbs/<id>_<k>.jpg
k = 0 is the hero still, 1..3 the strip under it.
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MOMENTS = {
    'og_bullet_time': ['112.2', '12', '135', '138.5'],
    'pc_anatomy_ship': ['52', '29.6', '10', '131.8'],
    'of_task_force': ['81.1', '47.5', '70.8', '89'],
    'ph_damage_scan': ['102', '70.6', '88', '67.8'],
    'pf_gun_camera': ['22.7', '140.2', '52.8', '138.5'],
    'od_salvo': ['104.5', '102.5', '116', '144'],
    'pc_anatomy_battery': ['60', '97', '26', '128'],
    'pe_aegis': ['80', '101.1', '0.5', '70'],
    'ob_barrage': ['139', '97', '37', '117.5'],
    'pd_engagement': ['97.5', '93', '106', '127'],
    'oe_ring': ['130.8', '26', '86.3', '119.3'],
    'oa_strike': ['121.8', '61.5', '110.5', '142'],
    'pb_battle': ['109.35', '110.15', '113.3', '127'],
    'pa_raid': ['154.4', '80.8', '156.8', '83.6'],
    'oa_scale': ['66', '8', '103', '124'],
    'ob_long_exposure': ['33', '21.5', '101.2', '121'],
    'oc_underway': ['8.5', '78.9', '119.4', '136.5'],
    'pa_picture': ['26', '81', '101.3', '156'],
    'pb_survey': ['110.45', '13.8', '53.5', '150'],
    'pc_anatomy': ['37.5', '22', '102.3', '110'],
}


def tag(t):
    return 't' + t.replace('.', '_')


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'url':
        print('http://localhost:8770/films/_shoot.html?s=' + ';'.join(f"{k}@{','.join(v)}" for k, v in MOMENTS.items()))
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
