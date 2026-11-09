/* RENDER: a film to an MP4 for YouTube (1440p60 by default), frame by frame, at the best quality.

   README
     python tools/render_film.py pc_scan_railgun                  (1440p60, max quality, the whole film)
     python tools/render_film.py pc_scan_railgun --from 150 --to 160    (a 10 s test)
   starts (or finds) the render server (tools/serve.py, port 8772), opens the page below in the browser and follows
   the job: progress in the page title and the server log, the MP4 in reference/films/renders/<film>/<film>_1440p60.mp4
   (a part: <film>_1440p60_<from>-<to>s.mp4). Or open the page yourself (from serve.py's port):
     /films/<film>/<film>.html?render=1&res=1440&fps=60&hq=1[&from=s&to=s][&ui=menu|none][&audio=0][&chunk=600]
   (&crf=14 the x264 quality, &maxrate=120M an optional cap on the densest scenes' bitrate)
   res 1080 | 1440 | 2160 (the dot raster's height; the framing is the same at each), hq=1 the max-quality mode (a
   fixed high dot density, no governor, every LOD level crossfaded), ui=menu adds the menu and its blurb, ui=none
   leaves the HUD out (default: the logo, the chapter kick, the readout and the tags; never the key hints, the scrub
   bar or the version footer).
   How: film.js hands the page to RENDER.begin() instead of starting its clock. Each frame is FILM.seek(T) at
   T = from + i / fps (render is a pure function of time), then a composite on one canvas: the film's canvases in
   order (the dot raster, the overlay), then the HUD drawn as canvas text (each visible element of #stage .ui: its
   background box, its text glyph by glyph where the page laid it out, in its computed font, colour and opacity; SVGs
   as images). Its pixels go to the server as deflated RGB (workers pack and POST them while the page draws on:
   POST /render/frame), which pipes them into ffmpeg (H.264 High, yuv420p,
   BT.709, CRF 14, preset slow, GOP of half a second, 2 B-frames, +faststart) in chunks of 600 frames; a job resumes
   at its first unfinished chunk (re-open the same URL), and the finished chunks are joined with ffmpeg's concat.
   The sound: the film's cues (FILM.cues, the same synth calls STAGE.SFX makes live) mixed offline into a 48 kHz
   WAV (STAGE.SFX.offline; its peak raised to -1 dBFS) and muxed as AAC 384 kbps. Tags fade by script (no CSS transitions in a render), with a
   0.3 s pre-roll before the first frame sent, so a resumed chunk joins seamlessly.
   Other films: any page that loads stage.js + film.js and then this file renders (a film whose raster ignores
   STAGE.RES is drawn at 1080 and scaled). */
(function () {
'use strict';
if (!window.STAGE || !STAGE.RENDER) { window.RENDER = null; return; }
const Q = STAGE.Q, RES = STAGE.RES, W = RES.W, H = RES.H, SO = W / 1920;
const FPS = Math.max(1, Math.min(240, +Q.get('fps') || 60));
const FROM = Math.max(0, parseFloat(Q.get('from')) || 0), TO_Q = Q.has('to') ? parseFloat(Q.get('to')) : null;
const UI = Q.get('ui') || 'hud', CHUNK = Math.max(30, +Q.get('chunk') || 600), AUDIO = Q.get('audio') !== '0';
const HQ = Q.has('hq') && Q.get('hq') !== '0';
STAGE.frameDt = 1 / FPS;
const $ = id => document.getElementById(id);
const title = s => { document.title = s; };

/* ---------- the composite ---------- */
const out = document.createElement('canvas'); out.width = W; out.height = H;
const ox = out.getContext('2d', { willReadFrequently: true });         // (alpha canvas: grayscale text AA, no LCD fringes)
const SKIP = UI === 'menu' ? '.keys, .foot' : '.menu, .blurb, .keys, .foot';
const SVGS = new Map();
const clear = c => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
let ST = null, SR = null, SC = 1;
function box(r) { return [(r.left - SR.left) / SC, (r.top - SR.top) / SC, r.width / SC, r.height / SC]; }
const RG = document.createRange();
const MET = new Map();
function metrics(font) {
  let m = MET.get(font); if (m) return m;
  ox.font = font; const t = ox.measureText('Hg'); m = [t.fontBoundingBoxAscent, t.fontBoundingBoxDescent]; MET.set(font, m); return m;
}
function text(node, cs, a) {
  const s = node.data; if (!s.trim()) return;
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, up = cs.textTransform === 'uppercase';
  const [asc, desc] = metrics(font);
  ox.font = font; ox.fillStyle = cs.color; ox.globalAlpha = a; ox.textBaseline = 'alphabetic'; ox.textAlign = 'left';
  for (let i = 0; i < s.length; i++) {
    let ch = s[i]; if (ch === ' ' || ch === '\n' || ch === '\t' || ch === ' ') continue;
    let j = i + 1; const c0 = s.charCodeAt(i); if (c0 >= 0xd800 && c0 < 0xdc00 && j < s.length) { ch = s.slice(i, j + 1); j++; }
    RG.setStart(node, i); RG.setEnd(node, j); i = j - 1;
    const rs = RG.getClientRects(); if (!rs.length) continue;
    const [x, y, , h] = box(rs[0]);
    ox.fillText(up ? ch.toUpperCase() : ch, x, y + h * asc / (asc + desc));
  }
}
function walk(el, a0) {
  if (el.matches && el.matches(SKIP)) return;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return;
  const a = a0 * parseFloat(cs.opacity); if (a < .004) return;
  if (el instanceof SVGElement) { const im = SVGS.get(el); if (im) { const [x, y, w, h] = box(el.getBoundingClientRect()); ox.globalAlpha = a; ox.drawImage(im, x, y, w, h); } return; }
  const bg = cs.backgroundColor, bw = parseFloat(cs.borderTopWidth) || 0;
  if (!clear(bg) || (bw > 0 && !clear(cs.borderTopColor))) {
    const [x, y, w, h] = box(el.getBoundingClientRect());
    if (w > 0 && h > 0) {
      ox.globalAlpha = a;
      if (!clear(bg)) { ox.fillStyle = bg; ox.fillRect(x, y, w, h); }
      if (bw > 0 && !clear(cs.borderTopColor)) { ox.strokeStyle = cs.borderTopColor; ox.lineWidth = bw; ox.strokeRect(x + bw / 2, y + bw / 2, w - bw, h - bw); }
    }
  }
  // the menu's selected entry: the dotted underline (a ::after pseudo-element)
  if (UI === 'menu' && el.matches('.menu .it.on .lab')) {
    const [x, y, w, h] = box(el.getBoundingClientRect()); ox.globalAlpha = a * .9; ox.fillStyle = el.closest('.go') ? '#C6F432' : '#fff';
    for (let px = x + 3; px < x + w; px += 6) { ox.beginPath(); ox.arc(px, y + h + 9 - 1.5, 1.1, 0, Math.PI * 2); ox.fill(); }
  }
  for (const n of el.childNodes) {
    if (n.nodeType === 3) text(n, cs, a);
    else if (n.nodeType === 1) walk(n, a);
  }
}
function drawUI() {
  if (UI === 'none') return;
  ST = $('stage'); SR = ST.getBoundingClientRect(); SC = STAGE.scale || 1;
  ox.setTransform(SO, 0, 0, SO, 0, 0);
  for (const u of document.querySelectorAll('#stage .ui')) walk(u, 1);
  ox.setTransform(1, 0, 0, 1, 0, 0); ox.globalAlpha = 1;
}
function composite() {
  ox.setTransform(1, 0, 0, 1, 0, 0); ox.globalAlpha = 1; ox.globalCompositeOperation = 'source-over';
  ox.fillStyle = getComputedStyle($('stage')).backgroundColor || '#0B0C0A'; ox.fillRect(0, 0, W, H);
  for (const cv of document.querySelectorAll('#stage canvas')) {
    const cs = getComputedStyle(cv); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    ox.globalAlpha = parseFloat(cs.opacity); ox.imageSmoothingEnabled = cv.width !== W; ox.drawImage(cv, 0, 0, W, H);
  }
  ox.globalAlpha = 1; ox.imageSmoothingEnabled = true;
  drawUI();
  return ox.getImageData(0, 0, W, H).data;
}
async function loadSvgs() {
  for (const svg of document.querySelectorAll('#stage .ui svg')) {
    const c = svg.cloneNode(true); c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const r = svg.getBoundingClientRect(); c.setAttribute('width', r.width / (STAGE.scale || 1)); c.setAttribute('height', r.height / (STAGE.scale || 1));
    const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(c.outerHTML);
    try { await im.decode(); SVGS.set(svg, im); } catch (e) { console.warn('svg', e); }
  }
}

/* ---------- the sound: the cues mixed offline -> 16-bit PCM WAV, its peak raised to -1 dBFS (at most +18 dB: the
   live synth is mixed quiet) ---------- */
function wav(buf) {
  const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate, B = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) B.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); B.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt '); B.setUint32(16, 16, true); B.setUint16(20, 1, true);
  B.setUint16(22, ch, true); B.setUint32(24, sr, true); B.setUint32(28, sr * ch * 2, true); B.setUint16(32, ch * 2, true); B.setUint16(34, 16, true);
  str(36, 'data'); B.setUint32(40, n * ch * 2, true);
  const C = []; let pk = 0; for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); C.push(d); for (let i = 0; i < n; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; } }
  const g = pk > 1e-6 ? Math.min(8, .891 / pk) : 1;
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++, o += 2) { const v = Math.max(-1, Math.min(1, C[c][i] * g)); B.setInt16(o, v < 0 ? v * 32768 : v * 32767, true); }
  return B.buffer;
}

/* ---------- the upload: workers pack each frame to RGB, deflate it and POST it while the page draws the next ---------- */
const WK = `self.onmessage = async e => {
  const d = e.data, px = new Uint8Array(d.buf), n = d.w * d.h, rgb = new Uint8Array(n * 3);
  for (let i = 0, j = 0; j < n * 3; i += 4, j += 3) { rgb[j] = px[i]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i + 2]; }
  const z = await new Response(new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
  let err = '';
  for (let k = 0; k < 12; k++) {                       // (a dropped connection is retried; the server drops repeats)
    try { const r = await fetch(d.url, { method: 'POST', body: z }), t = await r.text(); if (r.ok) { self.postMessage({ k: d.k, ok: true, t }); return; } err = r.status + ' ' + t; if (r.status < 500) break; }
    catch (e2) { err = String(e2); }
    await new Promise(r => setTimeout(r, 250 * Math.min(16, 1 << k)));
  }
  self.postMessage({ k: d.k, ok: false, t: err });
};`;
const NW = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) >> 1));
let WKS = null, wk = 0, seq = 0;
const waits = new Map();
function send(url, data) {
  if (!WKS) {
    const u = URL.createObjectURL(new Blob([WK], { type: 'text/javascript' }));
    WKS = Array.from({ length: NW }, () => { const w = new Worker(u); w.onmessage = e => { const f = waits.get(e.data.k); waits.delete(e.data.k); if (f) f(e.data); }; return w; });
  }
  const k = ++seq;
  return new Promise((res, rej) => {
    waits.set(k, m => m.ok ? res(m.t) : rej(new Error(`${url}: ${m.t}`)));
    WKS[wk++ % NW].postMessage({ k, url: location.origin + url, buf: data.buffer, w: W, h: H }, [data.buffer]);
  });
}

/* ---------- the job ---------- */
async function post(url, body) {
  const r = await fetch(url, { method: 'POST', body });
  const t = await r.text(); if (!r.ok) throw new Error(`${url}: ${r.status} ${t}`);
  try { return JSON.parse(t); } catch (e) { return t; }
}
const RENDER = {
  W, H, FPS, FROM, composite,
  async begin() {
    try {
      title('RENDER loading');
      await document.fonts.ready;
      await Promise.all(['400 16px Geist', '500 16px Geist', '600 16px Geist', '400 16px "Geist Mono"', '500 16px "Geist Mono"'].map(f => document.fonts.load(f).catch(() => null)));
      await loadSvgs();
      if (STAGE.err) throw new Error(STAGE.err);
      const D = FILM.duration, TO = TO_Q === null ? D : Math.max(FROM, Math.min(D, TO_Q)), N = Math.round((TO - FROM) * FPS);
      // a code stamp (the newest Last-Modified of the page's scripts): the server resumes only a render of the same code
      let stamp = '';
      try {
        const ms = await Promise.all([...document.scripts].filter(s => s.src).map(s => fetch(s.src, { method: 'HEAD', cache: 'no-store' }).then(r => Date.parse(r.headers.get('Last-Modified') || '') || 0).catch(() => 0)));
        stamp = String(Math.max(0, ...ms));
      } catch (e) {}
      const job = { film: STAGE.PAGE, w: W, h: H, fps: FPS, from: FROM, to: TO, dur: D, frames: N, chunk: CHUNK, hq: HQ, ui: UI, fmt: 'rgb24', z: 1, stamp,
        crf: +Q.get('crf') || 14, maxrate: Q.get('maxrate') || '' };
      const js = await post('/render/start', JSON.stringify(job));
      RENDER.job = js;
      if (AUDIO && !js.audio) {
        title('RENDER mixing the sound');
        const cues = (FILM.cues || []).map(([t, fn]) => [t - FROM, fn]).sort((a, b) => a[0] - b[0]);
        const buf = await STAGE.SFX.offline(cues, TO - FROM, 48000);
        await post(`/render/audio?id=${encodeURIComponent(js.id)}`, wav(buf));
      }
      try {   // chapters + sound cues in video time, saved next to the MP4 as <name>.markers.json for tools/audio_analyze.py
        const nm = fn => fn.name || String(fn).replace(/\s+/g, ' ').replace(/^\(\)\s*=>\s*/, '').slice(0, 90);
        const inR = t => t >= FROM - 1e-6 && t <= TO + 1e-6;
        await post(`/render/markers?id=${encodeURIComponent(js.id)}`, JSON.stringify({ film: STAGE.PAGE, from: FROM, to: TO,
          chapters: FILM.chapters.filter(c => inR(c.t)).map(c => ({ t: +(c.t - FROM).toFixed(3), title: c.title })),
          cues: (FILM.cues || []).filter(([t]) => inR(t)).map(([t, fn]) => [+(t - FROM).toFixed(3), nm(fn)]).sort((a, b) => a[0] - b[0]) }));
      } catch (e) { console.warn('markers not saved', e); }
      const i0 = js.next;
      // pre-roll (not sent): the tags' fades settle as if the film had played into the first frame
      for (let i = i0 - Math.round(.3 * FPS); i < i0; i++) FILM.seek(FROM + i / FPS);
      const t0 = performance.now(), inflight = [];
      let tr = 0, tc = 0;
      for (let i = i0; i < N; i++) {
        const a = performance.now();
        FILM.seek(FROM + i / FPS);
        if (STAGE.err) throw new Error(STAGE.err);
        const b = performance.now();
        const px = composite();
        tr += b - a; tc += performance.now() - b;
        inflight.push(send(`/render/frame?id=${encodeURIComponent(js.id)}&i=${i}`, px));
        if (inflight.length > NW + 1) await inflight.shift();
        const k = i - i0 + 1, el = (performance.now() - t0) / 1000, fps = k / el, eta = (N - i - 1) / fps;
        if (k % 5 === 0 || i === N - 1) title(`RENDER ${i + 1}/${N} · ${fps.toFixed(2)} fps · render ${(tr / k).toFixed(0)} ms · composite ${(tc / k).toFixed(0)} ms · ETA ${Math.floor(eta / 60)}:${String(Math.round(eta % 60)).padStart(2, '0')}`);
        RENDER.at = i;
      }
      await Promise.all(inflight);
      title('RENDER encoding');
      const fin = await post(`/render/finish?id=${encodeURIComponent(js.id)}`, '');
      RENDER.done = fin;
      title(`RENDER DONE ${fin.out}`);
    } catch (e) {
      console.error(e); RENDER.error = String(e && e.stack || e);
      title('RENDER FAILED ' + e);
      try { await post(`/render/fail?id=${encodeURIComponent((RENDER.job || {}).id || '')}`, String(e)); } catch (e2) {}
    }
  },
};
window.RENDER = RENDER;
})();
