"""Static server for the whole repo (game/ + reference/) with the same PNG sink as serve.py.

    python tools/serve_game.py [port]        (default 8771)

Game:      http://localhost:8771/game/index.html
Films:     http://localhost:8771/reference/films/index.html
PNG sink:  POST /save?path=<repo-relative .png> with a PNG data URL body (and, under game/shots/, .jpg with a JPEG
           data URL, .json with the JSON as the body: the blast lab's frames and reports).
"""
import base64
import http.server
import os
import socket
import sys
import threading
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript'}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        rel = q.get('path', [''])[0].replace('\\', '/')
        body = self.rfile.read(int(self.headers.get('Content-Length', '0'))).decode('utf-8')
        data = None
        if '..' not in rel:
            if rel.endswith('.png') and body.startswith('data:image/png;base64,'):
                data = base64.b64decode(body.split(',', 1)[1])
            # the blast lab's frames and reports (game/src/dev/lab): JPEG frames and JSON, under game/shots/ only
            elif rel.startswith('game/shots/') and rel.endswith('.jpg') and body.startswith('data:image/jpeg;base64,'):
                data = base64.b64decode(body.split(',', 1)[1])
            elif rel.startswith('game/shots/') and rel.endswith('.json') and body[:1] in '{[':
                data = body.encode('utf-8')
        if data is None:
            self.send_response(400)
            self.end_headers()
            return
        out = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'wb') as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')

    def log_message(self, *a):
        pass


class V6(http.server.ThreadingHTTPServer):
    address_family = socket.AF_INET6


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8771
    # 'localhost' resolves to ::1 first (Windows): with nothing listening there every request waits ~0.5 s before the
    # browser falls back to 127.0.0.1, and the game's ~130 modules took 10-15 s to load. Serve both loopbacks.
    try:
        v6 = V6(('::1', port), H)
        threading.Thread(target=v6.serve_forever, daemon=True).start()
    except OSError as e:
        print('serve_game: no IPv6 loopback (%s); http://127.0.0.1:%d/ is the fast address' % (e, port))
    http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
