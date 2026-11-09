"""Decoding through ffmpeg / ffprobe: any container or codec ffmpeg reads."""
import json
import queue
import threading
import shutil
import subprocess
import tempfile

import numpy as np


def _exe(name):
    p = shutil.which(name)
    if not p:
        raise SystemExit(f'{name} not found on PATH (install ffmpeg: winget install Gyan.FFmpeg)')
    return p


def _rate(r):
    try:
        n, d = str(r).split('/')
        return float(n) / float(d) if float(d) else None
    except (ValueError, ZeroDivisionError):
        return None


def probe(path):
    out = subprocess.run([_exe('ffprobe'), '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams',
                          str(path)], capture_output=True, check=True).stdout
    j = json.loads(out)
    streams = j.get('streams', [])
    a = next((s for s in streams if s.get('codec_type') == 'audio'), None)
    v = next((s for s in streams if s.get('codec_type') == 'video'
              and not s.get('disposition', {}).get('attached_pic')), None)
    fmt = j.get('format', {})
    info = {'path': str(path), 'container': fmt.get('format_name'),
            'duration': float(fmt.get('duration') or 0.0),
            'bit_rate': int(fmt['bit_rate']) if fmt.get('bit_rate') else None}
    if a:
        info['audio'] = {'codec': a.get('codec_name'), 'sample_rate': int(a.get('sample_rate') or 0),
                         'channels': a.get('channels'), 'layout': a.get('channel_layout'),
                         'bit_rate': int(a['bit_rate']) if a.get('bit_rate') else None,
                         'sample_format': a.get('sample_fmt')}
    if v:
        info['video'] = {'codec': v.get('codec_name'), 'width': v.get('width'), 'height': v.get('height'),
                         'fps': _rate(v.get('avg_frame_rate')) or _rate(v.get('r_frame_rate')),
                         'frames': int(v['nb_frames']) if str(v.get('nb_frames', '')).isdigit() else None,
                         'pix_fmt': v.get('pix_fmt')}
    return info


def _span(start, end):
    a = []
    if start:
        a += ['-ss', f'{start:.6f}']
    return a, (['-t', f'{end - (start or 0.0):.6f}'] if end is not None else [])


def load_audio(path, sr, start=None, end=None):
    """Stereo float32 (n, 2) at sr. Mono sources come back duplicated."""
    pre, post = _span(start, end)
    cmd = [_exe('ffmpeg'), '-nostdin', '-v', 'error', *pre, '-i', str(path), *post,
           '-vn', '-ac', '2', '-ar', str(sr), '-f', 'f32le', 'pipe:1']
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode:
        raise RuntimeError(f'ffmpeg audio decode failed: {r.stderr.decode(errors="replace")[-400:]}')
    return np.frombuffer(r.stdout, np.float32).reshape(-1, 2)


def iter_video(path, w, h, start=None, end=None, hw='d3d11va', batch=240):
    """Yields uint8 (n, h, w, 3) batches, downscaled by ffmpeg (area filter). hw: an ffmpeg -hwaccel name or None.
    A reader thread keeps ffmpeg decoding while the caller analyses the previous batch."""
    pre, post = _span(start, end)
    cmd = [_exe('ffmpeg'), '-nostdin', '-v', 'error']
    if hw:
        cmd += ['-hwaccel', hw]
    cmd += [*pre, '-i', str(path), *post, '-an', '-sn',
            '-vf', f'scale={w}:{h}:flags=area,format=rgb24', '-f', 'rawvideo', 'pipe:1']
    fsize = w * h * 3
    q = queue.Queue(maxsize=6)
    with tempfile.TemporaryFile() as err:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=err, bufsize=fsize * 8)

        def reader():
            try:
                while True:
                    buf = p.stdout.read(fsize * batch)
                    n = len(buf) // fsize
                    if n:
                        q.put(np.frombuffer(buf[:n * fsize], np.uint8).reshape(n, h, w, 3))
                    if len(buf) < fsize * batch:
                        break
            finally:
                q.put(None)

        th = threading.Thread(target=reader, daemon=True)
        th.start()
        got = 0
        try:
            while (b := q.get()) is not None:
                got += len(b)
                yield b
        finally:
            if th.is_alive():
                p.kill()
                while th.is_alive():                    # unblock a reader stuck on a full queue
                    try:
                        q.get(timeout=0.05)
                    except queue.Empty:
                        pass
            th.join()
            p.stdout.close()
            rc = p.wait()
        if rc and not got:
            err.seek(0)
            raise RuntimeError(f'ffmpeg video decode failed: {err.read().decode(errors="replace")[-400:]}')
