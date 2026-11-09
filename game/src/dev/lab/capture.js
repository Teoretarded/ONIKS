/* Blast lab capture (dev/lab): a shot recorded frame by frame from one or more camera views, each frame the solver's
   state at that tau (the clock holds until the solve has reached it), stamped with tau and the numbers; played back
   from memory (scrub both ways at once), laid out as contact sheets (16 frames a page, one image the whole sequence:
   what an agent reads), saved under game/shots/lab/<name>/ with the report (report.json).

   capture({ views: ['detail', 'macro'], taus: 'auto' | [s...], from, to, scale: .5, overlay: true, name, save: 'sheets' |
     'all' | false, onProgress(i, n, tau) }) -> REC = { frames: [{ tau, tele, img: { view: JPEG data URL } }], views, name }
   The 'auto' schedule: fine where the plate moves (0.25 ms steps to 2 ms, then 1, 5, 25, 100, 500 ms) to `to`. */
const MONO = "'Geist Mono', Consolas, monospace";
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
export const tauTxt = t => t === null || t === undefined ? '—' : (t < 0 ? '−' : '+') + (Math.abs(t) < 1 ? (Math.abs(t) * 1000).toFixed(Math.abs(t) < .01 ? 2 : 1) + ' MS' : Math.abs(t).toFixed(3) + ' S');

export function schedule(from = -.04, to = 3) {
  const out = [];
  const add = (a, b, d) => { for (let t = a; t < b - 1e-9; t += d) if (t >= from - 1e-9 && t <= to + 1e-9) out.push(+t.toFixed(5)); };
  add(-.12, 0, .02); add(0, .002, .00025); add(.002, .01, .001); add(.01, .05, .005); add(.05, .2, .025); add(.2, 1, .1); add(1, 5, .5); add(5, 60, 2.5); add(60, 600, 10);
  if (!out.length || out[out.length - 1] < to - 1e-6) out.push(+to.toFixed(5));
  return out;
}

export function createCapture(core, game, O, cams) {
  const R = game.R, L = core.L;
  let REC = null;
  // (frames are kept as JPEG data URLs: toBlob / convertToBlob answer once a second in a hidden page, toDataURL at once)
  const bmp = u => { const b = atob(u.slice(u.indexOf(',') + 1)), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return createImageBitmap(new Blob([a], { type: 'image/jpeg' })); };
  const post = (path, body) => fetch('/save?path=' + encodeURIComponent(path), { method: 'POST', body }).then(r => r.ok).catch(() => false);

  /* the frame now (rendered with dt 0) -> canvas, stamped */
  function grab(scale, overlay, stamp) {
    const g = R.gl.canvas, ov = R.overlay && R.overlay.cv;
    const w = Math.round(g.width * scale), h = Math.round(g.height * scale), sh = stamp ? Math.max(24, Math.round(w / 52)) : 0;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h + sh;
    const c = cv.getContext('2d');
    c.fillStyle = '#0B0C0A'; c.fillRect(0, 0, w, h + sh);
    c.drawImage(g, 0, 0, w, h);
    if (overlay && ov) c.drawImage(ov, 0, 0, w, h);
    if (stamp) { c.font = `500 ${Math.round(sh * .55)}px ${MONO}`; c.fillStyle = '#C6F432'; c.fillText(stamp[0], 8, h + sh * .72); c.fillStyle = 'rgba(255,255,255,.75)'; c.fillText(stamp[1], 8 + c.measureText(stamp[0]).width + 14, h + sh * .72); }
    return cv;
  }
  function stampOf(view) {
    const s = L.shot, t = core.tau(), sm = core.sample() || {};
    return [`τ ${tauTxt(t)}`, `${(s && s.type || L.type).toUpperCase()} · ${(s && s.kind || L.kind).toUpperCase()} ${s && s.C ? f1(s.C.W) + ' KG TNT ' + (s.C.fz || '').toUpperCase() : ''} · ${view.toUpperCase()} · TORN ${f1(sm.torn || 0)} M² · SET ${Math.round((sm.set || 0) * 1000)} MM · PIECES ${sm.bodies || 0} · ${(sm.state || '').toUpperCase()}`];
  }
  /* render the current tau from a view and keep it */
  async function shoot(view, o) {
    cams.apply(view);
    // (the game's own 2D layer (the clock's chip) off, the lab's overlay without its text labels unless asked: the
    // numbers are in the stamp)
    const h = game.ui.hidden, lb = L.labels;
    game.ui.hidden = true; L.labels = !!o.labels;
    try { O.advance(0, 1); O.advance(0, 1); } finally { game.ui.hidden = h; L.labels = lb; }
    const cv = grab(o.scale || .5, o.overlay !== false, stampOf(view));
    return cv.toDataURL('image/jpeg', .9);
  }

  async function capture(o = {}) {
    const s = L.shot; if (!s) throw new Error('lab: fire a shot first');
    const views = o.views || ['detail'], name = (o.name || `${s.type}_${s.kind}_${Date.now().toString(36)}`).replace(/[^\w.-]+/g, '_');
    const taus = Array.isArray(o.taus) ? o.taus.slice().sort((a, b) => a - b) : schedule(o.from !== undefined ? o.from : (s.mode === 'mission' ? 0 : -.04), o.to !== undefined ? o.to : 3);
    const keep = cams.save();
    const rec = { name, views, frames: [], at: new Date().toISOString(), shot: { type: s.type, kind: s.kind, C: s.C } };
    REC = rec;
    L.busy++;
    try {
      const t = core.tau();
      if (s.mode === 'direct' && (t === null || t > taus[0] + 1e-6)) await core.rerun(taus[0]);
      for (let i = 0; i < taus.length; i++) {
        if (o.cancel && o.cancel()) break;
        const T = taus[i];
        if (core.tau() === null || core.tau() < T - 1e-6) await core.to(T);
        const fr = { tau: core.tau(), tele: core.sample(), img: {} };
        for (const v of views) fr.img[v] = await shoot(v, o);
        rec.frames.push(fr);
        if (o.onProgress) o.onProgress(i + 1, taus.length, fr.tau);
      }
    } finally { L.busy--; cams.restore(keep); }
    if (o.sheet !== false) rec.sheets = await sheets(rec);
    if (o.save) await save(rec, o.save);
    return rec;
  }
  /* every view from here, now (no time passes): the quad still */
  async function views4(views = ['close', 'detail', 'macro', 'inside'], o = {}) {
    const keep = cams.save(), fr = { tau: core.tau(), tele: core.sample(), img: {} };
    try { for (const v of views) fr.img[v] = await shoot(v, o); } finally { cams.restore(keep); }
    const cells = await Promise.all(views.map(v => bmp(fr.img[v])));
    const cw = cells[0].width, ch = cells[0].height, cv = document.createElement('canvas'); cv.width = cw * 2; cv.height = ch * 2;
    const c = cv.getContext('2d'); cells.forEach((b, i) => c.drawImage(b, (i % 2) * cw, Math.floor(i / 2) * ch));
    return cv;
  }

  /* contact sheets: 12 frames a page, 3 across (each 640 px wide, a caption band over it) */
  async function sheets(rec, per = 12) {
    const out = {};
    for (const v of rec.views) {
      out[v] = [];
      const fr = rec.frames;
      for (let p = 0; p * per < fr.length; p++) {
        const page = fr.slice(p * per, (p + 1) * per), bms = await Promise.all(page.map(f => bmp(f.img[v])));
        const sh = Math.max(24, Math.round(bms[0].width / 52)), srcH = bms[0].height - sh;   // (each frame's own stamp strip cut off: the band carries it)
        const cw = 640, ch = Math.round(cw * srcH / bms[0].width), band = 22, cols = 3, rows = Math.ceil(page.length / cols), head = 34;
        const cv = document.createElement('canvas'); cv.width = cw * cols; cv.height = head + (ch + band) * rows;
        const c = cv.getContext('2d'); c.fillStyle = '#0B0C0A'; c.fillRect(0, 0, cv.width, cv.height);
        c.font = `500 14px ${MONO}`; c.fillStyle = '#C6F432';
        const C = rec.shot.C || {};
        c.fillText(`ONIKS LAB · ${rec.shot.type.toUpperCase()} · ${(C.name || rec.shot.kind).toUpperCase()} ${f1(C.W || 0)} KG TNT FUZE ${(C.fz || '').toUpperCase()} · VIEW ${v.toUpperCase()} · ${p + 1}/${Math.ceil(fr.length / per)} · τ ${tauTxt(page[0].tau)} .. ${tauTxt(page[page.length - 1].tau)}`, 10, 22);
        bms.forEach((b, i) => {
          const x = (i % cols) * cw, y = head + Math.floor(i / cols) * (ch + band), T = page[i].tele || {};
          c.font = `500 13px ${MONO}`; c.fillStyle = '#C6F432'; c.fillText(`τ ${tauTxt(page[i].tau)}`, x + 8, y + 16);
          c.fillStyle = 'rgba(255,255,255,.78)'; c.fillText(`TORN ${f1(T.torn || 0)} M² · SET ${Math.round((T.set || 0) * 1000)} MM · ${T.bodies || 0} PCS · ${(T.state || '').toUpperCase()}`, x + 130, y + 16);
          c.drawImage(b, 0, 0, b.width, srcH, x, y + band, cw, ch);
          c.strokeStyle = 'rgba(255,255,255,.12)'; c.strokeRect(x + .5, y + .5, cw - 1, ch + band - 1);
        });
        out[v].push(cv);
      }
    }
    return out;
  }

  async function save(rec = REC, what = 'sheets') {
    if (!rec) return null;
    const dir = `game/shots/lab/${rec.name}`, files = [];
    if (rec.sheets) for (const v in rec.sheets) for (let i = 0; i < rec.sheets[v].length; i++) { const p = `${dir}/sheet_${v}_${String(i + 1).padStart(2, '0')}.png`; if (await post(p, rec.sheets[v][i].toDataURL('image/png'))) files.push(p); }
    if (what === 'all') for (let i = 0; i < rec.frames.length; i++) for (const v of rec.views) { const p = `${dir}/${v}_${String(i).padStart(3, '0')}.jpg`; if (await post(p, rec.frames[i].img[v])) files.push(p); }
    const rep = core.report();
    rep.capture = { name: rec.name, views: rec.views, frames: rec.frames.map(f => ({ tau: f.tau, tele: f.tele })) };
    const p = `${dir}/report.json`; if (await post(p, JSON.stringify(rep, null, 1))) files.push(p);
    rec.saved = files;
    return { dir, files };
  }
  async function saveCanvas(cv, name) { const p = `game/shots/lab/${name}.png`; return (await post(p, cv.toDataURL('image/png'))) ? p : null; }
  async function saveReport(name) { const p = `game/shots/lab/${name}.json`; return (await post(p, JSON.stringify(core.report(), null, 1))) ? p : null; }

  return { capture, views4, sheets, save, saveCanvas, saveReport, grab, bmp, get rec() { return REC; }, set rec(r) { REC = r; }, schedule };
}
