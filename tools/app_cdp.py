"""Drive the ONIKS app (app/, Tauri over WebView2) through the Chrome DevTools Protocol, the way the browser tools drive a
tab: run JS, wait for a condition, take a screenshot. Start the app with ONIKS_DEBUG_PORT=9333 first.

    python tools/app_cdp.py eval "<js>"            prints the JSON result (promises awaited)
    python tools/app_cdp.py wait "<js expr>" [-t 60] until the expression is truthy
    python tools/app_cdp.py shot <out.png>         a PNG of the window
    python tools/app_cdp.py console [-t 5]          console messages and exceptions for t seconds
    options: --port 9333

Needs websocket-client (pip install websocket-client).
"""
import argparse
import base64
import json
import sys
import time
import urllib.request

import websocket


class Page:
    def __init__(self, port=9333, timeout=30):
        t0 = time.time()
        while True:
            try:
                tabs = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json' % port, timeout=2))
                tabs = [t for t in tabs if t.get('type') == 'page']
                if tabs:
                    break
            except OSError:
                pass
            if time.time() - t0 > timeout:
                sys.exit('app_cdp: nothing on port %d (start the app with ONIKS_DEBUG_PORT=%d)' % (port, port))
            time.sleep(.5)
        self.ws = websocket.create_connection(tabs[0]['webSocketDebuggerUrl'], timeout=600, suppress_origin=True)
        self.n = 0
        self.events = []

    def call(self, method, **params):
        self.n += 1
        my = self.n
        self.ws.send(json.dumps({'id': my, 'method': method, 'params': params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('id') == my:
                if 'error' in m:
                    raise RuntimeError(m['error'])
                return m.get('result', {})
            self.events.append(m)

    def eval(self, js, timeout=600):
        r = self.call('Runtime.evaluate', expression=js, awaitPromise=True, returnByValue=True, timeout=timeout * 1000)
        if 'exceptionDetails' in r:
            d = r['exceptionDetails']
            raise RuntimeError((d.get('exception') or {}).get('description') or d.get('text'))
        return r['result'].get('value')

    def wait(self, js, timeout=60):
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                if self.eval('!!(%s)' % js, 10):
                    return True
            except RuntimeError:
                pass
            time.sleep(.5)
        return False

    def shot(self, out):
        r = self.call('Page.captureScreenshot', format='png')
        with open(out, 'wb') as f:
            f.write(base64.b64decode(r['data']))
        return out

    def console(self, secs):
        self.call('Runtime.enable')
        self.ws.settimeout(.5)
        t0, out = time.time(), []
        evs, self.events = self.events, []
        while time.time() - t0 < secs:
            try:
                evs.append(json.loads(self.ws.recv()))
            except websocket.WebSocketTimeoutException:
                pass
        for m in evs:
            p = m.get('params', {})
            if m.get('method') == 'Runtime.consoleAPICalled':
                out.append('[%s] %s' % (p['type'], ' '.join(str(a.get('value', a.get('description', ''))) for a in p['args'])))
            elif m.get('method') == 'Runtime.exceptionThrown':
                d = p['exceptionDetails']
                out.append('[exception] %s' % ((d.get('exception') or {}).get('description') or d.get('text')))
        self.ws.settimeout(600)
        return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['eval', 'wait', 'shot', 'console'])
    ap.add_argument('arg', nargs='?')
    ap.add_argument('--port', type=int, default=9333)
    ap.add_argument('-t', type=float, default=60)
    a = ap.parse_args()
    p = Page(a.port)
    if a.cmd == 'eval':
        print(json.dumps(p.eval(a.arg), indent=1))
    elif a.cmd == 'wait':
        ok = p.wait(a.arg, a.t)
        print('ok' if ok else 'timeout')
        sys.exit(0 if ok else 1)
    elif a.cmd == 'shot':
        print(p.shot(a.arg))
    else:
        print('\n'.join(p.console(a.t)))


if __name__ == '__main__':
    main()
