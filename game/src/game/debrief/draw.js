/* Debrief: what is drawn over the picture, in the films' type.
     caption   bottom left: 'Fig. N' then the line, typing in (the film maker's caption)
     readout   top right: the subject, its height and speed, T+ the match clock, the time rate (lime when it is not x1)
     fade      the take's black in and out
     tracks    the Orbital map's hairlines for every round of the match (record.tracks), drawn on in launch order;
               yours yellow (the one accent), the enemy's white; interceptors faint. The ends: a ring where a round hit,
               a cross where one was shot down. The tally bottom right, true to the record. */

const TAU = Math.PI * 2;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const HI = [244 / 255, 210 / 255, 60 / 255], WH = [246 / 255, 245 / 255, 242 / 255];
const C_W = '#F6F5F2', C_HI = '#F4D23C';
const MONO = "'Geist Mono', 'DM Mono', Consolas, monospace", SANS = "'Geist', 'Segoe UI', sans-serif";
const OMONO = '"DM Mono", "Geist Mono", Consolas, monospace';

export function scaleOf(ov) { return Math.max(.8, Math.min(1.6, Math.min(ov.W / 1920, ov.H / 1080))); }

/* the soft dark behind text (the film maker's calm) */
function calm(ctx, x, y, rx, ry, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(11,12,10,${.72 * a})`); g.addColorStop(.55, `rgba(11,12,10,${.38 * a})`); g.addColorStop(1, 'rgba(11,12,10,0)');
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
  ctx.fillStyle = g; ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2); ctx.restore();
}

export function caption(ov, fig, text, age, a) {
  if (!text || a <= 0) return;
  const ctx = ov.ctx, W = ov.W, H = ov.H, s = scaleOf(ov);
  const f = fig ? `Fig. ${fig}` : '';
  const full = f ? f + '    ' + text : text;
  const nShow = Math.min(full.length, Math.floor(full.length * sat(age / .5) + .999));
  const bx = 56 * s, by = H - 54 * s, px = 16 * s;
  ctx.save();
  ctx.globalAlpha = a;
  calm(ctx, 0, H, 700 * s, 170 * s, 1);
  ctx.textBaseline = 'alphabetic';
  let x = bx;
  if (f) {
    ctx.font = `500 ${px}px ${SANS}`; ctx.fillStyle = '#fff';
    ctx.fillText(f.slice(0, nShow), x, by); x += ctx.measureText(f + '    ').width;
  }
  const rest = f ? Math.max(0, nShow - (f.length + 4)) : nShow;
  ctx.font = `400 ${px}px ${SANS}`; ctx.fillStyle = 'rgba(255,255,255,.66)';
  ctx.fillText(text.slice(0, rest), x, by);
  ctx.restore();
}

/* parts: [[text, colour], ...] */
export function readout(ov, parts, a, calmA) {
  if (!parts.length || a <= 0) return;
  if (calmA === undefined) calmA = 1;
  const ctx = ov.ctx, W = ov.W, s = scaleOf(ov), px = 13 * s, sp = px * .05;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = `400 ${px}px ${MONO}`; ctx.textBaseline = 'alphabetic';
  const sep = '  ·  ';
  const txt = parts.map(q => String(q[0]).toUpperCase());
  const wOf = t => ctx.measureText(t).width + sp * t.length;
  let w = 0; txt.forEach((t, i) => { w += wOf(t) + (i ? wOf(sep) : 0); });
  const x1 = W - 56 * s, y = 58 * s;
  if (calmA > .01) calm(ctx, W - 40 * s, 30 * s, Math.max(360 * s, w + 120 * s), 150 * s, calmA);
  let x = x1 - w;
  ctx.fillStyle = '#C6F432'; ctx.fillRect(Math.round(x - 20 * s), Math.round(y - 9 * s), Math.round(8 * s), Math.round(8 * s));
  const put = (t, col) => { ctx.fillStyle = col; if ('letterSpacing' in ctx) ctx.letterSpacing = sp + 'px'; ctx.fillText(t, x, y); x += wOf(t); };
  txt.forEach((t, i) => { if (i) put(sep, 'rgba(255,255,255,.36)'); put(t, parts[i][1]); });
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();
}

export function fade(ov, a) {
  if (a <= 0) return;
  const ctx = ov.ctx;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = '#0B0C0A';
  ctx.fillRect(0, 0, ov.cv ? ov.cv.width : ov.W * 4, ov.cv ? ov.cv.height : ov.H * 4);
  ctx.restore();
}

/* key chips bottom centre, the films' footer (chip: the key on a light plate, then its word) */
export function chips(ov, list, a) {
  if (a <= .01 || !list.length) return;
  const ctx = ov.ctx, s = scaleOf(ov), px = 11 * s, pad = 5 * s, gap = 18 * s;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = `500 ${px}px ${MONO}`; ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = (.05 * px) + 'px';
  const parts = list.map(([k, w]) => ({ k: k.toUpperCase(), w: w.toUpperCase(), kw: ctx.measureText(k.toUpperCase()).width + pad * 2, ww: ctx.measureText(w.toUpperCase()).width }));
  let total = 0; parts.forEach((q, i) => { total += q.kw + 8 * s + q.ww + (i ? gap : 0); });
  let x = ov.W / 2 - total / 2; const y = ov.H - 26 * s;
  for (const q of parts) {
    ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.fillRect(Math.round(x), Math.round(y - 8 * s), Math.round(q.kw), Math.round(16 * s));
    ctx.fillStyle = '#0B0C0A'; ctx.fillText(q.k, x + pad, y + .5);
    x += q.kw + 8 * s;
    ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.fillText(q.w, x, y + .5);
    x += q.ww + gap;
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();
}

/* a line of note at the top centre (a failure, a sequence's progress) */
export function note(ov, text, col) {
  const ctx = ov.ctx, s = scaleOf(ov);
  ctx.save();
  ctx.font = `400 ${12 * s}px ${MONO}`; ctx.textAlign = 'center'; ctx.fillStyle = col || '#C6F432';
  if ('letterSpacing' in ctx) ctx.letterSpacing = (.6 * s) + 'px';
  ctx.fillText(String(text).toUpperCase(), ov.W / 2, 34 * s);
  ctx.restore();
}

/* ------------------------------------------------------------------ the Orbital map: every round's track */
/* prepared once: per track its points, colour, alpha, when it starts to draw (0..1 of the draw-on) */
export function prepTracks(rec, side, PROJ) {
  const out = [];
  const ids = Object.keys(rec.tracks || {}).map(Number).sort((a, b) => a - b);
  if (!ids.length) return { list: out, box: null };
  let t0 = Infinity, t1 = -Infinity;
  for (const id of ids) { const T = rec.tracks[id]; t0 = Math.min(t0, T.t0); t1 = Math.max(t1, T.end ? T.end.tick : T.t0); }
  const span = Math.max(1, t1 - t0);
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const id of ids) {
    const T = rec.tracks[id], P = PROJ[T.kind] || {};
    if (T.pts.length < 6) continue;
    const own = T.side === side, off = !!P.threat;
    const rgb = own && off ? HI : WH;
    const a = own && off ? .92 : off ? .7 : own ? .26 : .32;
    for (let i = 0; i < T.pts.length; i += 3) {
      box[0] = Math.min(box[0], T.pts[i]); box[1] = Math.min(box[1], T.pts[i + 2]);
      box[2] = Math.max(box[2], T.pts[i]); box[3] = Math.max(box[3], T.pts[i + 2]);
    }
    out.push({ id, kind: T.kind, side: T.side, own, off, rgb, a, pts: T.pts, n: T.pts.length / 3, end: T.end,
      s0: (T.t0 - t0) / span, s1: ((T.end ? T.end.tick : T.t0 + 200) - t0) / span });
  }
  return { list: out, box: box[0] < Infinity ? box : null, t0, t1 };
}

/* 3D: hairlines, drawn on as the clock k (0..1 of the match) passes each track's launch; kA the layer's fade */
export function tracks3d(W, prep, k, kA) {
  if (!W || !prep || kA <= .001) return;
  for (const T of prep.list) {
    if (k <= T.s0) continue;
    const f = T.s1 > T.s0 ? sat((k - T.s0) / (T.s1 - T.s0)) : 1;
    const nDraw = Math.max(2, Math.ceil(T.n * f));
    const P = T.pts, a = T.a * kA, c = T.rgb;
    let px = P[0], py = P[1], pz = P[2];
    for (let i = 1; i < nDraw; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      W.seg(px, Math.max(1, py), pz, x, Math.max(1, y), z, c[0], c[1], c[2], a);
      px = x; py = y; pz = z;
    }
  }
}

/* 2D: the ends (a ring where a round hit, a cross where it was shot down), then the tally */
export function tracks2d(ov, cam, prep, k, kA, tally) {
  if (!prep || kA <= .01) return;
  const ctx = ov.ctx, q = [0, 0, 0], s = scaleOf(ov);
  ctx.save();
  ctx.lineWidth = 1;
  for (const T of prep.list) {
    if (!T.end || !T.end.pos || !T.off || k < T.s1) continue;
    if (!cam.project(T.end.pos, q)) continue;
    const x = Math.round(q[0]) + .5, y = Math.round(q[1]) + .5;
    const age = sat((k - T.s1) / .06);
    ctx.globalAlpha = kA * (.35 + .55 * age);
    ctx.strokeStyle = T.own ? C_HI : C_W;
    if (T.end.k === 'hit') { ctx.beginPath(); ctx.arc(x, y, 4 + 10 * (1 - age), 0, TAU); ctx.stroke(); }
    else if (T.end.k === 'intercept') { ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x - 3, y + 3); ctx.lineTo(x + 3, y - 3); ctx.stroke(); }
  }
  // the tally: one row per kind that was fired, the heavy rounds first
  if (tally && tally.length) {
    const px = 11.5 * s, lh = 19 * s, x1 = ov.W - 56 * s;
    let y = ov.H - 54 * s - (tally.length - 1) * lh;
    ctx.font = `400 ${px}px ${OMONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (.05 * px) + 'px';
    for (const r of tally) {
      ctx.globalAlpha = kA * r.a;
      ctx.fillStyle = r.col;
      ctx.fillText(r.text.toUpperCase(), x1, y);
      y += lh;
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  ctx.restore();
}

export { HI, WH, C_W, C_HI };
