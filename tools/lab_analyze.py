"""Read a blast-lab recording (game/shots/lab/<name>/: data.json + field_<ms>.json, from LAB.record / Compare) and
print what the hit did, in numbers, without the picture. Two folders (or a Compare folder with dots/ and vox/) are
printed side by side.

  python tools/lab_analyze.py game/shots/lab/cmp_ddg_side_oniks
  python tools/lab_analyze.py game/shots/lab/run_a game/shots/lab/run_b

Per recording: the defects over time (vanished / floating / hanging / hovering / far side), the pieces and fragments
(how many, how fast, where they ended: at rest, in the sea), the displacement field at each saved tau (area moved past
5 cm / 20 cm / 50 cm / 1 m, away from the charge or toward it, out or in, how far from the charge it reaches, the
outer plating and the interior apart, by 1 m shells round the charge), and the field's own checks: cells pushed
toward the charge (they should not be, early), cells moved on the far side, the largest displacement and where."""
import json, math, os, sys, glob

THR = [.05, .2, .5, 1.0]


def load(folder):
    d = json.load(open(os.path.join(folder, 'data.json')))
    fields = {}
    for f in sorted(glob.glob(os.path.join(folder, 'field_*ms.json'))):
        F = json.load(open(f))
        fields[F['tau']] = F
    return d, fields


def field_stats(F):
    c, n, S, C = F['cells'], F['n'], F['S'], F['C']
    A = S * S
    out = {'cells': n, 'moved': [0.0] * 4, 'shell': [0.0] * 4, 'interior': [0.0] * 4, 'loose': 0.0, 'torn': 0.0, 'away': 0.0, 'toward': 0.0,
           'out': 0.0, 'in': 0.0, 'reach': 0.0, 'far': 0.0, 'max': 0.0, 'maxAt': None, 'shells': {}, 'dirs': [0.0, 0.0, 0.0]}
    side = 1 if C[0] >= 0 else -1
    for i in range(n):
        o = 11 * i
        x, y, z, dx, dy, dz, nx, ny, nz, f, cls = c[o:o + 11]
        f = int(f)
        m = math.sqrt(dx * dx + dy * dy + dz * dz)
        rx, ry, rz = x - C[0], y - C[1], z - C[2]
        R = math.sqrt(rx * rx + ry * ry + rz * rz) or 1
        if f & 2: out['loose'] += A
        if f & 1: out['torn'] += A
        if m > out['max']: out['max'], out['maxAt'] = m, [round(x, 2), round(y, 2), round(z, 2)]
        for k, t in enumerate(THR):
            if m > t:
                out['moved'][k] += A
                (out['interior'] if cls else out['shell'])[k] += A
        if m > .05:
            out['reach'] = max(out['reach'], R)
            rad = (dx * rx + dy * ry + dz * rz) / (m * R)
            if rad > .2: out['away'] += A
            elif rad < -.2: out['toward'] += A
            if nx * dx + ny * dy + nz * dz > 0: out['out'] += A
            else: out['in'] += A
            if abs(x) > 2.2 and (1 if x >= 0 else -1) != side: out['far'] += A
            for k, v in enumerate((dx, dy, dz)): out['dirs'][k] += v * A
            b = out['shells'].setdefault(int(R), [0, 0.0, 0.0])
            b[0] += 1; b[1] += m; b[2] = max(b[2], m)
    return out


def f(v, d=1):
    return ('{:.%df}' % d).format(v)


def report(folder):
    d, fields = load(folder)
    s = d['summary']
    print('=' * 100)
    print(folder, '·', d.get('target'), d.get('kind'), '·', s.get('mode'))
    sh = d.get('shot') or {}
    ch = (sh.get('charge') or {})
    print('  charge %s kg TNT, fuze %s, at %s from %s' % (ch.get('W'), ch.get('fz'), sh.get('aim'), sh.get('from')))
    print('  defects (worst over the run):', s['worst'])
    print('  pieces at the end: %(pieces)s (%(piecesAtRest)s at rest, %(piecesInSea)s in the sea), fragments %(frags)s' % s['end'])
    print('  tau        vanish float hang hover far(m2) pieces frags  moved>5cm  >20cm  >50cm  >1m  away toward reach')
    for r in d['rows']:
        D, de = r.get('defects') or {}, r.get('deform') or {}
        mv = de.get('moved') or [0, 0, 0, 0]
        print('  %7.3f s  %6s %5s %4s %5s %7s %6s %5s   %7s %6s %6s %5s %5s %6s %5s' % (r['tau'], D.get('vanished', ''), D.get('floating', ''), D.get('hanging', ''), D.get('hovering', ''), D.get('farSide', ''),
              len(r.get('pieces') or []), len(r.get('frags') or []), f(mv[0]), f(mv[1]), f(mv[2]), f(mv[3]), f(de.get('away', 0)), f(de.get('toward', 0)), f(de.get('reach', 0))))
    for t, F in fields.items():
        st = field_stats(F)
        print('  field at %.3f s: %d cells listed, %s m2 cells' % (t, st['cells'], f(F['S'] ** 2, 4)))
        print('    moved past 5 / 20 / 50 / 100 cm: %s m2 (outer plating %s, interior %s)' % (' / '.join(f(v) for v in st['moved']), ' / '.join(f(v) for v in st['shell']), ' / '.join(f(v) for v in st['interior'])))
        print('    loose %s m2, torn edge %s m2, away from the charge %s m2, toward it %s m2, out %s / in %s m2, reach %s m, far side %s m2' % (
            f(st['loose']), f(st['torn']), f(st['away']), f(st['toward']), f(st['out']), f(st['in']), f(st['reach']), f(st['far'])))
        print('    largest %s m at %s; mean push %s' % (f(st['max'], 2), st['maxAt'], [f(v, 2) for v in st['dirs']]))
        print('    by distance from the charge (m: cells, mean, max displacement): ' + '  '.join('%d: %d %s %s' % (k, v[0], f(v[1] / v[0], 2), f(v[2], 2)) for k, v in sorted(st['shells'].items())[:14]))
    last = d['rows'][-1]
    ps = last.get('pieces') or []
    if ps:
        sp = sorted(p.get('speed', 0) for p in ps)
        print('  pieces at the end: n %d, sizes %s, speeds median %s max %s' % (len(ps), sorted((p.get('n', 0) for p in ps), reverse=True)[:10], f(sp[len(sp) // 2], 2), f(sp[-1], 2)))
        air = [p for p in ps if not p.get('rest') and not p.get('sea') and not p.get('touch') and p.get('speed', 0) < .05]
        if air: print('  !! pieces still in the air and not moving:', [(p['n'], p['p']) for p in air][:8])
    fr = last.get('frags') or []
    if fr:
        ys = sorted(x[1] for x in fr)
        print('  fragments at the end: n %d, height min %s median %s max %s (y: up from the waterline)' % (len(fr), f(ys[0], 2), f(ys[len(ys) // 2], 2), f(ys[-1], 2)))


if __name__ == '__main__':
    args = sys.argv[1:] or [os.path.join('game', 'shots', 'lab')]
    for a in args:
        if os.path.exists(os.path.join(a, 'data.json')): report(a)
        else:
            for sub in ('dots', 'vox'):
                if os.path.exists(os.path.join(a, sub, 'data.json')): report(os.path.join(a, sub))
