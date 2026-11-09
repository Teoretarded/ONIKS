"""Static server for reference/ with a PNG sink for stills and the video render sink.

    python tools/serve.py [port]        (default 8770)

Pages rasterize themselves (html-to-image) and POST a PNG data URL to /save?path=<rel.png>;
it lands at reference/<path>. _shoot.html in reference/films drives this.

Video renders (reference/films/common/render.js, started by tools/render_film.py): the page POSTs
  /render/start   JSON {film, w, h, fps, from, to, dur, frames, chunk, hq, ui} -> {id, next, audio}
  /render/audio   ?id=  a WAV (the film's sound mixed offline)
  /render/frame   ?id=&i=  one frame's raw pixels (fmt rgba or rgb24, zlib-deflated when the job says z)
  /render/finish  ?id=  -> {out}: the chunks joined (ffmpeg concat) and the sound muxed
  /render/fail    ?id=  the page's error
and GET /render/status[?id=] reports the jobs. Frames are piped into ffmpeg (H.264 High, yuv420p, BT.709, CRF 14,
preset slow, +faststart) in chunks of `chunk` frames under reference/films/renders/.parts/<id>/; a job restarted with
the same parameters resumes at its first unfinished chunk. The MP4: reference/films/renders/<film>/<id>.mp4.
ffmpeg: $FFMPEG, else the WinGet Gyan.FFmpeg build, else ffmpeg on the PATH.
"""
import base64
import glob
import http.server
import json
import os
import queue
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import zlib

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'reference')
RENDERS = os.path.join(ROOT, 'films', 'renders')


def film_dir(film):
    """renders/<film>/ (the renders made before the per-film folders stay at the top of renders/)"""
    return ''.join(ch for ch in str(film) if ch.isalnum() or ch in '_-') or 'misc'


def find_ffmpeg():
    c = os.environ.get('FFMPEG')
    if c and os.path.exists(c):
        return c
    pat = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg*', '*', 'bin', 'ffmpeg.exe')
    hits = sorted(glob.glob(pat))
    if hits:
        return hits[-1]
    return shutil.which('ffmpeg') or 'ffmpeg'


FFMPEG = find_ffmpeg()


def log(*a):
    print(time.strftime('%H:%M:%S'), '[render]', *a, flush=True)


class Job:
    """One render: chunked ffmpeg encodes fed by a writer thread, frames reordered by index."""

    @staticmethod
    def name(spec):
        film, h, fps = spec['film'], int(spec['h']), int(round(spec['fps']))
        fr, to, dur = float(spec['from']), float(spec['to']), float(spec.get('dur', spec['to']))
        part = '' if fr <= 1e-6 and to >= dur - 1e-6 else f'_{fr:g}-{to:g}s'
        extra = ('' if spec.get('hq') else '_std') + ('_menu' if spec.get('ui') == 'menu' else '_noui' if spec.get('ui') == 'none' else '')
        return f'{film}_{h}p{fps}{part}{extra}'

    def __init__(self, spec):
        self.spec = spec
        self.id = Job.name(spec)
        self.w, self.h, self.fps = int(spec['w']), int(spec['h']), int(round(spec['fps']))
        self.frames, self.chunk = int(spec['frames']), int(spec.get('chunk', 600))
        self.fmt, self.z = spec.get('fmt', 'rgba'), bool(spec.get('z'))          # pixel format, deflated (zlib) bodies
        self.bpp = 3 if self.fmt == 'rgb24' else 4
        self.crf = float(spec.get('crf') or 14)
        mr = str(spec.get('maxrate') or '').strip()                             # e.g. '120M': a VBV cap on the densest scenes
        self.maxrate, self.bufsize = (mr, f'{float(mr[:-1]) * 2:g}{mr[-1]}') if mr and mr[-1] in 'kM' else (None, None)
        self.dir = os.path.join(RENDERS, '.parts', self.id)
        os.makedirs(self.dir, exist_ok=True)
        # resume only the same render: a job.json whose frame count, duration or code stamp differs (the film was
        # edited since) means the old chunks are stale -> start over
        old = os.path.join(self.dir, 'job.json')
        if os.path.exists(old):
            try:
                with open(old) as f:
                    o = json.load(f)
                same = all(o.get(k) == spec.get(k) for k in ('frames', 'dur', 'from', 'to', 'w', 'h', 'fps', 'stamp'))
            except (OSError, ValueError):
                same = False
            if not same:
                for f in glob.glob(os.path.join(self.dir, 'c*')):
                    os.remove(f)
                log(f'{self.id}: stale chunks cleared (the film or the job changed)')
        self.out = os.path.join(RENDERS, film_dir(spec['film']), self.id + '.mp4')   # (each film's renders in renders/<film>/)
        os.makedirs(os.path.dirname(self.out), exist_ok=True)
        self.lock = threading.Lock()
        self.q = queue.Queue(maxsize=90)        # (deflated frames ~1 MB: a backlog while the encoder is behind)
        self.pending = {}
        self.proc = None
        self.cur = -1
        self.error = None
        self.state = 'running'
        self.t0 = time.time()
        self.got = 0
        self.written = 0
        # resume: the leading chunks already finished
        nchunks = (self.frames + self.chunk - 1) // self.chunk
        k = 0
        while k < nchunks and os.path.exists(self.cpath(k) + '.done'):
            k += 1
        for f in glob.glob(os.path.join(self.dir, 'c*.mp4')):
            n = int(os.path.basename(f)[1:6])
            if n >= k:
                os.remove(f)
                if os.path.exists(f + '.done'):
                    os.remove(f + '.done')
        self.next = k * self.chunk
        self.start_frame = self.next
        with open(os.path.join(self.dir, 'job.json'), 'w') as f:
            json.dump(spec, f, indent=1)
        self.thread = threading.Thread(target=self.writer, daemon=True)
        self.thread.start()
        log(f'{self.id}: {self.w}x{self.h} {self.fps} fps, {self.frames} frames, from frame {self.next}'
            f' (chunk {k}/{nchunks}), ffmpeg {FFMPEG}')

    def cpath(self, k):
        return os.path.join(self.dir, f'c{k:05d}.mp4')

    def open_chunk(self, k):
        args = [FFMPEG, '-hide_banner', '-loglevel', 'error', '-y',
                '-f', 'rawvideo', '-pix_fmt', self.fmt, '-s', f'{self.w}x{self.h}', '-r', str(self.fps), '-i', '-',
                '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,'
                       'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
                '-c:v', 'libx264', '-preset', 'slow', '-crf', str(self.crf), '-profile:v', 'high',
                *(['-maxrate', self.maxrate, '-bufsize', self.bufsize] if self.maxrate else []),
                '-g', str(max(1, self.fps // 2)), '-bf', '2', '-flags', '+cgop',
                '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                '-movflags', '+faststart', self.cpath(k)]
        self.proc = subprocess.Popen(args, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        self.cur = k

    def close_chunk(self, done):
        p, k = self.proc, self.cur
        self.proc = None
        if not p:
            return
        try:
            p.stdin.close()
        except OSError:
            pass
        err = p.stderr.read().decode('utf-8', 'replace')
        rc = p.wait()
        if rc != 0:
            raise RuntimeError(f'ffmpeg chunk {k} exit {rc}: {err[-800:]}')
        if done:
            open(self.cpath(k) + '.done', 'w').close()

    def writer(self):
        try:
            while True:
                item = self.q.get()
                if item is None:
                    break
                i, data = item
                if self.z:
                    data = zlib.decompress(data)
                if len(data) != self.w * self.h * self.bpp:
                    raise ValueError(f'frame {i}: {len(data)} bytes, expected {self.w * self.h * self.bpp}')
                k = i // self.chunk
                if self.proc is None or self.cur != k:
                    self.close_chunk(True)
                    self.open_chunk(k)
                self.proc.stdin.write(data)
                self.written += 1
                if i % self.chunk == self.chunk - 1 or i == self.frames - 1:
                    self.close_chunk(True)
                    log(f'{self.id}: chunk {k} done ({i + 1}/{self.frames})')
        except Exception as e:  # noqa: BLE001
            self.error = str(e)
            self.state = 'failed'
            log(f'{self.id}: FAILED {e}')
            if self.proc:
                try:
                    self.proc.kill()
                except OSError:
                    pass

    def frame(self, i, data):
        if self.error:
            raise RuntimeError(self.error)
        with self.lock:                      # (in order: the queue's put blocks while ffmpeg is behind)
            if i < self.next or i in self.pending:
                return
            self.pending[i] = data
            while self.next in self.pending:
                it = (self.next, self.pending.pop(self.next))
                self.next += 1
                self.q.put(it)
                self.got += 1
                n = it[0] + 1
                if n % 60 == 0 or n == self.frames:
                    el = time.time() - self.t0
                    fps = self.got / max(1e-6, el)
                    eta = (self.frames - n) / max(1e-6, fps)
                    log(f'{self.id}: frame {n}/{self.frames}  {fps:.2f} fps  {1 / max(fps, 1e-6):.2f} s/frame  ETA {int(eta // 60)}:{int(eta % 60):02d}')

    def finish(self):
        self.q.put(None)
        self.thread.join()
        if self.error:
            raise RuntimeError(self.error)
        nchunks = (self.frames + self.chunk - 1) // self.chunk
        missing = [k for k in range(nchunks) if not os.path.exists(self.cpath(k) + '.done')]
        if missing:
            raise RuntimeError(f'chunks missing: {missing[:10]}')
        lst = os.path.join(self.dir, 'list.txt')
        with open(lst, 'w') as f:
            for k in range(nchunks):
                f.write(f"file '{os.path.basename(self.cpath(k))}'\n")
        wav = os.path.join(self.dir, 'audio.wav')
        args = [FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst]
        if os.path.exists(wav):
            args += ['-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '384k', '-ar', '48000']   # (no -shortest: the sound is the frames' length exactly; with very large video packets -shortest dropped the last frames)
        else:
            args += ['-map', '0:v:0', '-c:v', 'copy']
        tmp = self.out[:-4] + '.tmp.mp4'
        args += ['-movflags', '+faststart', tmp]
        r = subprocess.run(args, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError('concat: ' + r.stderr[-800:])
        os.replace(tmp, self.out)
        mk = os.path.join(self.dir, 'markers.json')
        if os.path.exists(mk):                          # chapters + cues for tools/audio_analyze.py
            shutil.copyfile(mk, self.out[:-4] + '.markers.json')
        self.state = 'done'
        log(f'{self.id}: DONE {self.out} ({os.path.getsize(self.out) / 1e6:.1f} MB, {time.time() - self.t0:.0f} s)')
        return self.out

    def stop(self):
        self.error = self.error or 'stopped'
        if self.proc:
            try:
                self.proc.kill()
            except OSError:
                pass
        try:
            self.q.put_nowait(None)
        except queue.Full:
            pass
        self.thread.join(5)

    def status(self):
        el = time.time() - self.t0
        fps = self.got / max(1e-6, el)
        return {'id': self.id, 'state': self.state, 'frames': self.frames, 'next': self.next, 'written': self.written,
                'fps': round(fps, 3), 'eta_s': round((self.frames - self.next) / fps) if fps > 0 else None,
                'out': os.path.relpath(self.out, os.path.dirname(ROOT)).replace('\\', '/'), 'error': self.error}


JOBS = {}
JLOCK = threading.Lock()


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        """HTTP Range (206) so <video>/<audio> can seek in big renders; plain requests go to the stock handler."""
        rng = self.headers.get('Range', '')
        path = self.translate_path(self.path)
        if not rng.startswith('bytes=') or os.path.isdir(path):
            return super().send_head()
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(404)
            return None
        size = os.fstat(f.fileno()).st_size
        a, _, b = rng[6:].split(',')[0].strip().partition('-')
        try:
            start = int(a) if a else max(0, size - int(b))
            end = min(size - 1, int(b) if a and b else size - 1)
        except ValueError:
            f.close()
            return super().send_head()
        if start >= size or start > end:
            f.close()
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.end_headers()
            return None
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        f.seek(start)
        self._left = end - start + 1
        return f

    def copyfile(self, src, dst):
        left, self._left = getattr(self, '_left', None), None
        if left is None:
            return super().copyfile(src, dst)
        while left > 0:
            buf = src.read(min(1 << 20, left))
            if not buf:
                break
            dst.write(buf)
            left -= len(buf)

    def reply(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == '/render/status':
            q = urllib.parse.parse_qs(u.query)
            jid = q.get('id', [None])[0]
            with JLOCK:
                if jid:
                    j = JOBS.get(jid)
                    return self.reply(200 if j else 404, j.status() if j else {'error': 'no such job'})
                return self.reply(200, {'render': True, 'ffmpeg': FFMPEG, 'jobs': [j.status() for j in JOBS.values()]})
        return super().do_GET()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        if u.path.startswith('/render/'):
            try:
                return self.render(u.path, q)
            except Exception as e:  # noqa: BLE001
                log('error', u.path, e)
                return self.reply(500, {'error': str(e)})
        rel = q.get('path', [''])[0].replace('\\', '/')
        raw = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        if rel.endswith('.json') and '..' not in rel and rel.startswith('films/'):     # data a page measured (common/camlog.js)
            out = os.path.join(ROOT, rel)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with open(out, 'wb') as f:
                f.write(raw)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'ok')
            return
        body = raw.decode('ascii', 'replace')
        if not rel.endswith('.png') or '..' in rel or not body.startswith('data:image/png;base64,'):
            self.send_response(400)
            self.end_headers()
            return
        out = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'wb') as f:
            f.write(base64.b64decode(body.split(',', 1)[1]))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')

    def render(self, path, q):
        n = int(self.headers.get('Content-Length', '0'))
        body = self.rfile.read(n) if n else b''
        jid = q.get('id', [''])[0]
        if path == '/render/start':
            spec = json.loads(body)
            with JLOCK:
                old = JOBS.get(Job.name(spec))
            if old and old.state == 'running':
                old.stop()
            j = Job(spec)
            with JLOCK:
                JOBS[j.id] = j
            return self.reply(200, {'id': j.id, 'next': j.next, 'audio': os.path.exists(os.path.join(j.dir, 'audio.wav'))})
        with JLOCK:
            j = JOBS.get(jid)
        if not j:
            return self.reply(404, {'error': f'no job {jid}'})
        if path == '/render/frame':
            j.frame(int(q['i'][0]), body)
            return self.reply(200, {'ok': True})
        if path == '/render/audio':
            with open(os.path.join(j.dir, 'audio.wav'), 'wb') as f:
                f.write(body)
            log(f'{j.id}: audio {len(body) / 1e6:.1f} MB')
            return self.reply(200, {'ok': True})
        if path == '/render/markers':
            with open(os.path.join(j.dir, 'markers.json'), 'wb') as f:
                f.write(body)
            return self.reply(200, {'ok': True})
        if path == '/render/finish':
            out = j.finish()
            return self.reply(200, {'out': os.path.relpath(out, os.path.dirname(ROOT)).replace('\\', '/')})
        if path == '/render/fail':
            j.error = body.decode('utf-8', 'replace')[:2000]
            j.state = 'failed'
            log(f'{j.id}: page FAILED {j.error}')
            return self.reply(200, {'ok': True})
        return self.reply(404, {'error': path})

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8770
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), H)
    srv.daemon_threads = True
    print(f'serving {ROOT} on http://127.0.0.1:{port}/ (render sink: ffmpeg {FFMPEG})', flush=True)
    srv.serve_forever()
