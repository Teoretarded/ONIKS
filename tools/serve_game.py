"""Static server for the whole repo (game/ + reference/) with the same PNG sink as serve.py.

    python tools/serve_game.py [port]        (default 8771)

Game:      http://localhost:8771/game/index.html
Films:     http://localhost:8771/reference/films/index.html
PNG sink:  POST /save?path=<repo-relative .png> with a PNG data URL body.
"""
import base64
import http.server
import os
import sys
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
        body = self.rfile.read(int(self.headers.get('Content-Length', '0'))).decode('ascii')
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

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8771
    http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
