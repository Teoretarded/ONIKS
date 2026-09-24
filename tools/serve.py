"""Static server for reference/ with a PNG sink for stills.

    python tools/serve.py [port]        (default 8770)

Pages rasterize themselves (html-to-image) and POST a PNG data URL to /save?path=<rel.png>;
it lands at reference/<path>. _shoot.html in reference/films drives this.
"""
import base64
import http.server
import os
import sys
import urllib.parse

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'reference')


class H(http.server.SimpleHTTPRequestHandler):
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
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8770
    http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
