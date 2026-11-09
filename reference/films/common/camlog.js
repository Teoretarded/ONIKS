/* The camera log for film reviews. Load after film.js; open the film with ?camlog=1[&step=0.1][&from=s][&to=s]
   (plus &hq=1 to log the render's look). The page steps itself through the film (FILM.seek every `step` s) and
   records, per sample: the camera (eye, target, up, fov, roll, shake; the kit's M3.Cam: window.SK / ORK / SSK .C,
   or window.CAMLOG_CAM() -> Cam), the chapter, the HUD text (kicker, readout, visible tags), what the frame shows
   (mean brightness, lit / clipped fractions, the lit centroid and box, the lime and coral fractions) and, when the
   film defines window.CAMLOG_POI() -> [{name, p: [x, y, z], r}] (in the camera's frame), each subject's screen
   position, depth, apparent size and whether it is in frame. Saved (tools/serve.py) to
   films/shots/camlog/<page>.json; tools/film_review.py turns it into speeds, turn rates and flags. */
(function () {
'use strict';
if (!window.STAGE || !STAGE.Q.has('camlog')) { window.CAMLOG = null; return; }
const Q = STAGE.Q, STEP = Math.max(.01, parseFloat(Q.get('step')) || .1);
const r3 = v => Math.round(v * 1000) / 1000, r1 = v => Math.round(v * 10) / 10;
const DEG = 180 / Math.PI;
const yieldNow = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
function cam() {
  if (window.CAMLOG_CAM) return window.CAMLOG_CAM();
  for (const k of ['SK', 'ORK', 'SSK']) if (window[k] && window[k].C && window[k].C.eye) return window[k].C;
  return null;
}
const SW = 96, SH = 54;
const sm = document.createElement('canvas'); sm.width = SW; sm.height = SH;
const sx = sm.getContext('2d', { willReadFrequently: true });
function frameStats() {
  const cv = document.getElementById('c'); if (!cv) return null;
  sx.globalCompositeOperation = 'source-over'; sx.fillStyle = '#000'; sx.fillRect(0, 0, SW, SH);
  for (const c of document.querySelectorAll('#stage canvas')) sx.drawImage(c, 0, 0, SW, SH);
  const d = sx.getImageData(0, 0, SW, SH).data;
  let sum = 0, lit = 0, clip = 0, lime = 0, coral = 0, cx = 0, cy = 0, x0 = SW, y0 = SH, x1 = -1, y1 = -1;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const i = (y * SW + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2], L = (.2126 * r + .7152 * g + .0722 * b) / 255;
    sum += L;
    if (L > .1) { lit++; cx += x; cy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (L > .95) clip++;
    if (g > 40 && g > r * 1.15 && b < g * .5) lime++;             // (hue tests: the 96 x 54 average dims thin lines)
    if (r > 40 && r > g * 1.4 && b < r * .5) coral++;
  }
  const n = SW * SH;
  return { mean: r3(sum / n), lit: r3(lit / n), clip: r3(clip / n), lime: r3(lime / n), coral: r3(coral / n),
    c: lit ? [r3(cx / lit / SW), r3(cy / lit / SH)] : null, box: lit ? [r3(x0 / SW), r3(y0 / SH), r3((x1 + 1) / SW), r3((y1 + 1) / SH)] : null };
}
const txt = id => { const e = document.getElementById(id); return e ? e.innerText.split('\n').map(s => s.trim()).filter(Boolean).join(' / ') : ''; };
function tags() {
  const out = [];
  for (const e of document.querySelectorAll('#stage .tag')) {
    if (e.checkVisibility ? !e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : e.offsetParent === null) continue;   // (hidden by any ancestor too)
    let o = 1; for (let q = e; q && q !== document.body; q = q.parentElement) o *= +getComputedStyle(q).opacity; if (o < .05) continue;
    const t = e.textContent.replace(/\s+/g, ' ').trim(); if (t) out.push(t);
  }
  return out;
}
function pois(C) {
  if (!window.CAMLOG_POI) return undefined;
  const out = [];
  for (const q of window.CAMLOG_POI() || []) {
    const p = C.project(q.p);
    if (!p) { out.push({ n: q.name, vis: 0, behind: 1 }); continue; }
    const px = q.r ? C.fl * q.r / p[2] : 0, on = p[0] > -px && p[0] < C.W + px && p[1] > -px && p[1] < C.H + px;
    out.push({ n: q.name, vis: on ? 1 : 0, s: [r3(p[0] / C.W), r3(p[1] / C.H)], z: r1(p[2]), px: r1(px) });
  }
  return out;
}
const CAMLOG = {
  async begin() {
    try {
      document.title = 'CAMLOG';
      const D = FILM.duration, FROM = Math.max(0, parseFloat(Q.get('from')) || 0), TO = Q.has('to') ? Math.min(D, parseFloat(Q.get('to'))) : D;
      const S = [], t0 = performance.now();
      for (let t = FROM; t <= TO + 1e-9; t += STEP) {
        FILM.seek(t);
        const C = cam(); if (!C) throw new Error('camlog: no camera found (set window.CAMLOG_CAM)');
        const c = FILM.chapter;
        S.push({ t: r3(t), ch: c ? c.title : '', eye: C.eye.map(r3), tgt: C.target.map(r3), up: C.up.map(r3), fwd: C.f.map(v => Math.round(v * 1e5) / 1e5),
          fov: r3(C.fov * DEG), roll: r3((C.roll || 0) * DEG), shake: C.shake.map(r1), kick: txt('kick'), ro: txt('ro'), tags: tags(), img: frameStats(), poi: pois(C) });
        if (S.length % 50 === 0) document.title = `CAMLOG ${(100 * (t - FROM) / Math.max(1e-6, TO - FROM)).toFixed(0)}%`;
        if (S.length % 20 === 0) await yieldNow();   // (a MessageChannel yield: timers are throttled in a hidden tab)
      }
      const body = JSON.stringify({ film: STAGE.PAGE, path: location.pathname, step: STEP, from: FROM, to: TO, dur: D, hq: Q.has('hq'),
        chapters: FILM.chapters.map(c => ({ t: r3(c.t), title: c.title })), samples: S });
      const out = Q.get('out') || `films/shots/camlog/${STAGE.PAGE}.json`;
      const r = await fetch('/save?path=' + encodeURIComponent(out), { method: 'POST', body });
      document.title = r.ok ? `CAMLOG DONE ${S.length} samples ${((performance.now() - t0) / 1000).toFixed(0)} s -> ${out}` : `CAMLOG FAILED ${r.status}`;
      window.CAMLOG_DONE = { ok: r.ok, n: S.length, out };
    } catch (e) { document.title = 'CAMLOG FAILED ' + e.message; window.CAMLOG_DONE = { ok: false, error: String(e) }; console.error(e); }
  },
};
window.CAMLOG = CAMLOG;
})();
