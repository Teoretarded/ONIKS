"""Picture analysis for sync: brightness, flashes, ONIKS accent colours (lime scans, coral hostiles, Orbital yellow),
global image motion by phase correlation (camera moves = whoosh candidates), local motion and cuts.
Frames come in downscaled by ffmpeg (GPU decode when available), so a 10 min 1440p60 film is a quick read."""
import numpy as np
import scipy.fft as sfft
from scipy.ndimage import median_filter, uniform_filter1d

from .decode import iter_video

HUES = {'lime': (57, 100), 'coral': (0, 28), 'yellow': (38, 57), 'cyan_blue': (170, 250)}


def _hsv(f):
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    dd = np.maximum(d, 1e-6)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) * 60.0
    return h, s, mx


def analyze(path, info, start=None, end=None, width=192, hw=True, log=print):
    vi = info['video']
    W0, H0 = vi['width'], vi['height']
    h = max(2, int(round(width * H0 / W0 / 2)) * 2)
    fps = vi['fps'] or 30.0
    win = (np.hanning(h)[:, None] * np.hanning(width)[None, :]).astype(np.float32)
    cols = {k: [] for k in ('luma', 'luma_p95', 'bright', 'motion', 'local_motion', 'dx', 'dy', 'pc_conf', 'cut',
                            'saturated', *HUES)}
    prevL = prevF = prevH = None
    n_done = 0

    def run(acc):
        nonlocal prevL, prevF, prevH, n_done
        for batch in iter_video(path, width, h, start, end, hw=acc):
            f = batch.astype(np.float32) / 255.0
            L = 0.2126 * f[..., 0] + 0.7152 * f[..., 1] + 0.0722 * f[..., 2]
            n = len(L)
            hue, sat, val = _hsv(f)
            vivid = (sat > 0.5) & (val > 0.12)        # mixing with black keeps saturation, so thin lines still count
            cols['saturated'].append(vivid.mean((1, 2)))
            for k, (a, b) in HUES.items():
                m = vivid & (hue >= a) & (hue < b)
                if k == 'coral':
                    m |= vivid & (hue >= 350)
                cols[k].append(m.mean((1, 2)))
            cols['luma'].append(L.mean((1, 2)))
            cols['luma_p95'].append(np.percentile(L.reshape(n, -1), 95, axis=1))
            cols['bright'].append((L > 0.8).mean((1, 2)))
            q = np.minimum((L * 32).astype(np.int32), 31).reshape(n, -1)
            H = np.bincount((q + 32 * np.arange(n)[:, None]).ravel(), minlength=32 * n).reshape(n, 32).astype(np.float32)
            H /= H.sum(1, keepdims=True)
            F = sfft.fft2(L * win, axes=(1, 2), workers=-1)
            Lp = np.concatenate(([prevL], L)) if prevL is not None else L
            Fp = np.concatenate(([prevF], F)) if prevF is not None else F
            Hp = np.concatenate(([prevH], H)) if prevH is not None else H
            first = 0 if prevL is not None else 1
            dx = np.zeros(n, np.float32)
            dy = np.zeros(n, np.float32)
            pc = np.zeros(n, np.float32)
            mo = np.zeros(n, np.float32)
            lm = np.zeros(n, np.float32)
            cut = np.zeros(n, np.float32)
            if len(Fp) > 1:
                R = Fp[1:] * np.conj(Fp[:-1])
                R /= np.abs(R) + 1e-9
                r = sfft.ifft2(R, axes=(1, 2), workers=-1).real
                flat = r.reshape(len(r), -1)
                am = flat.argmax(1)
                py, px = np.unravel_index(am, (h, width))
                k_ = np.arange(len(r))
                def sub(a, b, c):
                    den = a - 2 * b + c
                    return np.where(np.abs(den) > 1e-9, 0.5 * (a - c) / den, 0).clip(-0.5, 0.5)
                sx = px + sub(r[k_, py, (px - 1) % width], r[k_, py, px], r[k_, py, (px + 1) % width])
                sy = py + sub(r[k_, (py - 1) % h, px], r[k_, py, px], r[k_, (py + 1) % h, px])
                sx = np.where(sx > width / 2, sx - width, sx)
                sy = np.where(sy > h / 2, sy - h, sy)
                o = slice(first, n)
                dx[o], dy[o], pc[o] = sx, sy, flat[k_, am]
                mo[o] = np.abs(Lp[1:] - Lp[:-1]).mean((1, 2))
                cut[o] = 0.5 * ((Hp[1:] - Hp[:-1]) ** 2 / (Hp[1:] + Hp[:-1] + 1e-9)).sum(1)
                m = 8
                for i in range(len(r)):
                    sh = np.roll(Lp[i], (int(round(sy[i])), int(round(sx[i]))), axis=(0, 1))
                    lm[first + i] = np.abs(Lp[i + 1][m:-m, m:-m] - sh[m:-m, m:-m]).mean()
            for k, v in (('dx', dx), ('dy', dy), ('pc_conf', pc), ('motion', mo), ('local_motion', lm), ('cut', cut)):
                cols[k].append(v)
            prevL, prevF, prevH = L[-1], F[-1], H[-1]
            n_done += n
            if n_done % (int(fps) * 60) < n:
                log(f'  video {n_done / fps:6.1f} s')

    for i, acc in enumerate(['d3d11va', 'auto', None] if hw else [None]):
        try:
            run(acc)
            break
        except RuntimeError:
            if n_done or acc is None:
                raise
            log(f'  -hwaccel {acc} failed, trying ' + ('the next decoder' if i < 1 else 'the CPU'))
    out = {k: np.concatenate(v).astype(np.float32) if v else np.zeros(0, np.float32) for k, v in cols.items()}
    out['fps'] = fps
    out['size'] = (width, h)
    out['t'] = np.arange(len(out['luma'])) / fps
    sp = np.hypot(out['dx'], out['dy']) / width * fps            # image speed in frame widths per second
    out['cam_speed'] = uniform_filter1d(sp, 5).astype(np.float32)
    return out


# ---------------------------------------------------------------- events

def rises(x, fps, min_rise, base_sec, k=6.0, merge_sec=0.08, min_sec=0.0):
    if len(x) < 3:
        return []
    kb = max(3, int(base_sec * fps) | 1)
    base = median_filter(x, size=kb, origin=(kb - 1) // 2, mode='nearest')
    d = x - base
    mad = float(np.median(np.abs(d - np.median(d)))) + 1e-9
    thr = max(min_rise, k * 1.4826 * mad)
    ev = []
    for i, j in runs(d > thr, int(merge_sec * fps)):
        p = i + int(np.argmax(d[i:j]))
        if (j - i) / fps >= min_sec:
            ev.append({'start_s': round(i / fps, 3), 'peak_s': round(p / fps, 3), 'end_s': round(j / fps, 3),
                       'dur_s': round((j - i) / fps, 3), 'peak': round(float(x[p]), 4), 'rise': round(float(d[p]), 4),
                       'strength': round(float(d[p] / thr), 2)})
    return ev


def runs(mask, merge=0):
    """[start, end) runs of True, joining runs separated by <= merge False samples."""
    m = np.r_[False, np.asarray(mask, bool), False]
    e = np.flatnonzero(m[1:] != m[:-1])
    out = []
    for a, b in zip(e[::2], e[1::2]):
        if out and a - out[-1][1] <= merge:
            out[-1][1] = b
        else:
            out.append([a, b])
    return [(int(a), int(b)) for a, b in out]


def _dir(dx, dy):
    a = (np.degrees(np.arctan2(-dy, dx)) + 360) % 360       # screen up = +y
    names = ('right', 'up-right', 'up', 'up-left', 'left', 'down-left', 'down', 'down-right')
    return names[int(((a + 22.5) % 360) // 45)]


def camera_moves(v, on=0.12, off=0.06, min_sec=0.15):
    sp, fps = v['cam_speed'], v['fps']
    ev, i, n = [], 0, len(sp)
    while i < n:
        if sp[i] < on:
            i += 1
            continue
        a = i
        while a > 0 and sp[a - 1] > off:
            a -= 1
        j = i
        while j < n and sp[j] > off:
            j += 1
        if (j - a) / fps >= min_sec:
            p = a + int(np.argmax(sp[a:j]))
            seg = slice(a, j)
            ev.append({'start_s': round(a / fps, 3), 'peak_s': round(p / fps, 3), 'end_s': round(j / fps, 3),
                       'dur_s': round((j - a) / fps, 3), 'peak_speed': round(float(sp[p]), 3),
                       'image_moves': _dir(float(np.mean(v['dx'][seg])), float(np.mean(v['dy'][seg]))),
                       'onset_accel': round(float((sp[p] - sp[a]) / max((p - a) / fps, 1 / fps)), 3)})
        i = j + 1
    return ev


def holds(v, below=0.03, min_sec=1.5):
    sp, fps = v['cam_speed'], v['fps']
    q = (sp < below) & (v['local_motion'] < np.percentile(v['local_motion'], 40))
    ev, i, n = [], 0, len(sp)
    while i < n:
        if not q[i]:
            i += 1
            continue
        j = i
        while j < n and q[j]:
            j += 1
        if (j - i) / fps >= min_sec:
            ev.append({'start_s': round(i / fps, 3), 'end_s': round(j / fps, 3), 'dur_s': round((j - i) / fps, 3)})
        i = j
    return ev


def cuts(v):
    c = v['cut']
    if len(c) < 3:
        return []
    med = median_filter(c, size=31, mode='nearest')
    idx = np.nonzero((c > 0.3) & (c > 5 * med) & (v['motion'] > 0.04))[0]
    return [{'t_s': round(i / v['fps'], 3), 'hist_dist': round(float(c[i]), 3)} for i in idx]


def events(v):
    fps = v['fps']
    flash_sig = v['luma'] + 0.5 * v['bright']
    return {
        'flashes': rises(flash_sig, fps, 0.025, 0.6),
        'lime': rises(v['lime'], fps, 0.0015, 6.0, merge_sec=0.25, min_sec=0.1),
        'coral': rises(v['coral'], fps, 0.0015, 6.0, merge_sec=0.25, min_sec=0.1),
        'yellow': rises(v['yellow'], fps, 0.0015, 6.0, merge_sec=0.25, min_sec=0.1),
        'motion_bursts': rises(v['local_motion'], fps, 0.01, 1.5, merge_sec=0.15),
        'camera_moves': camera_moves(v),
        'holds': holds(v),
        'cuts': cuts(v),
    }
