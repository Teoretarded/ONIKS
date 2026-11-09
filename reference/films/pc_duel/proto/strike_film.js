/* DUEL · STRIKE (Point Cloud): the closing act. The orbital railgun, carrying the damage of the intercept, turns onto
   the destroyer, re-forms its barrel with its rings and fires a solid tungsten rod; the rod falls through the
   atmosphere onto the same Arleigh Burke on the night sea, breaks her in two, and drives on into the sea, ablating to
   nothing inside a cavity of steam that pinches off into a rising cloud of bubbles; then the surface: the two halves
   folding and sinking, the debris field, the burning fuel. One take.

   Parts: strike_orbit.js (the orbital half: the orbital railgun film re-timed, the damage) to A_LEN, then
   strike_sea.js (the fall from 35.6 km, the strike, the dive, the aftermath), cross-faded over XF about the hand-over
   (the lens keeps its pose relative to the rod across it).

   As an insert (pc_duel_film.js): window.DSTRIKE = { len, chapters, cues, own, build(host), frame(u), ro, cam(),
   poi() }. own: true -- the insert renders the whole frame itself (frame(u) clears, draws, its tags, the blit); the
   host keeps the readout (DSTRIKE.ro after each frame: { l1, l2, clock, rate }, the clock on the host's: build's
   host.clockOff added to the orbital film's sim clock) and the kicker. build(host): host = { clockOff, orbit (the
   orbital half's hand-over: STRIKE_ORBIT.setHost's), ship (the destroyer's look: STRIKE_SEA.setShip's) }.
   Standalone (strike.html) it is run by FILM.run. Render is a pure function of u. */
(function () {
'use strict';
const { V, E } = M3;
const A = window.STRIKE_ORBIT, B = window.STRIKE_SEA || null;
const K = ORK;
const XF = [A.len - .7, A.len + .7];
const LEN = A.len + (B ? B.len : 4);
const $ = id => document.getElementById(id);
const ro = $('ro'), kick = $('kick');

const CHAPTERS = (A.CHAPTERS || [{ t: 0, title: 'Rings' }]).slice()
  .concat(B ? B.chapters.map(c => ({ t: A.len + c.t, title: c.title })) : []);

/* the sound hooks: named (the soundtrack is built offline from the render's markers) */
const NAMED = n => { const f = () => {}; Object.defineProperty(f, 'name', { value: n }); return f; };
const D = A.D;
const CUES = [];
{
  const at = (n, t) => { if (t >= 0 && t <= LEN) CUES.push([t, NAMED(n)]); };
  // the orbital half's beats (rings, build, the rod line: fab_line, rod_load; the chamber, the charge, the shot)
  for (const [n, t] of (A.CUEV || [])) at(n, t);
  // the rod's entry: where it falls through 120 km
  { let lo = D.TX, hi = D.TI; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (D.altOf(D.rodAt(m)) > 120000) lo = m; else hi = m; } at('entry_glow', A.cueT(lo)); }
  if (B && B.cueV) for (const [n, v] of B.cueV()) at(n, A.len + v);
  CUES.sort((a, b) => a[0] - b[0]);
}

const fmtRate = r => {
  if (!(r > 0)) return 'x0';
  if (r >= .95) { const v = r >= 20 ? Math.round(r / 10) * 10 : r >= 3 ? Math.round(r) : Math.round(r * 10) / 10; return 'x' + v; }
  const d = 1 / r, n = d > 60 ? Math.round(d / 10) * 10 : d > 12 ? Math.round(d / 2) * 2 : Math.round(d); return 'x1/' + n;
};
const fmtClock = s => { const sg = s < 0 ? '−' : '+', a = Math.abs(s), a10 = Math.round(a * 10); return `T${sg}${String(Math.floor(a10 / 600)).padStart(2, '0')}:${((a10 % 600) / 10).toFixed(1).padStart(4, '0')}`; };
let roTxt = '', kickTxt = '';
const RO = { l1: '', l2: '', clock: 0, rate: 1 };
let HOSTED = false, CLK_OFF = 0;
function setRo(l1, l2, clock, rate) {
  RO.l1 = l1; RO.l2 = l2; RO.clock = clock + CLK_OFF; RO.rate = rate;
  if (HOSTED) return;
  const h = `${l1}<br>${l2}<br>${fmtClock(RO.clock)} · ${fmtRate(rate)}`; if (h !== roTxt) { roTxt = h; ro.innerHTML = h; }
}
function setKick(t) {
  if (HOSTED) return;
  let i = 0; for (let k = 0; k < CHAPTERS.length; k++) if (CHAPTERS[k].t <= t + 1e-6) i = k;
  const kt = `${String(i + 1).padStart(2, '0')} · ${CHAPTERS[i].title}`; if (kt !== kickTxt) { kickTxt = kt; kick.textContent = kt; }
}

let SAVE = null, LIVE = 'A';
function frame(t) {
  t = E.clamp(t, 0, LEN - 1e-6);
  if (!B || t < XF[0]) {
    LIVE = 'A';
    A.frame(t, () => {});
    setRo(A.RO.l1, A.RO.l2, A.simClock(t), A.rateAt(t));
    setKick(t);
    return;
  }
  LIVE = 'B';
  if (t > XF[1]) { B.frame(t - A.len, null); const r = B.RO; setRo(r.l1, r.l2, r.clock, r.rate); setKick(t); return; }
  // the hand-over: the orbital frame kept, the sea's drawn and mixed over it
  const w = E.ss(XF[0], XF[1], t);
  A.frame(t, () => { const d = K.pb.d; if (!SAVE || SAVE.length !== d.length) SAVE = new Uint8ClampedArray(d.length); SAVE.set(d); });
  const ra = { l1: A.RO.l1, l2: A.RO.l2 };
  B.frame(t - A.len, { mix: d => { const bg = K.pb.bg, n = d.length, w1 = 1 - w; for (let i = 0; i < n; i += 4) { const b0 = bg[i], b1 = bg[i + 1], b2 = bg[i + 2]; d[i] = b0 + (d[i] - b0) * w + (SAVE[i] - b0) * w1; d[i + 1] = b1 + (d[i + 1] - b1) * w + (SAVE[i + 1] - b1) * w1; d[i + 2] = b2 + (d[i + 2] - b2) * w + (SAVE[i + 2] - b2) * w1; } } });
  const r = w < .5 ? { l1: ra.l1, l2: ra.l2 } : B.RO;
  setRo(r.l1, r.l2, w < .5 ? A.simClock(t) : B.RO.clock, w < .5 ? A.rateAt(t) : B.RO.rate);
  setKick(t);
}

const DSTRIKE = window.DSTRIKE = {
  len: LEN, chapters: CHAPTERS, cues: CUES, own: true, ro: RO,
  build(host) {
    HOSTED = true;
    if (host && host.clockOff !== undefined) CLK_OFF = host.clockOff;
    if (host && host.orbit) A.setHost(host.orbit);
    if (host && host.ship && B && B.setShip) B.setShip(host.ship);
  },
  frame,
  cam: () => K.C,
  poi: () => LIVE === 'A' ? (A.poi ? A.poi() : []) : (B && B.poi ? B.poi() : []),
};

/* dev: SNAP(t, tag) saves the raster + overlay (no HUD) to films/shots/strike_<tag>.png */
window.SNAP = async (t, tag) => { FILM.seek(t); const c = $('c'), o = $('o'), cv = document.createElement('canvas'); cv.width = c.width; cv.height = c.height; const x = cv.getContext('2d'); x.drawImage(c, 0, 0); x.drawImage(o, 0, 0); const r = await fetch('/save?path=' + encodeURIComponent('films/shots/strike_' + tag + '.png'), { method: 'POST', body: cv.toDataURL('image/png') }); return r.ok; };
/* standalone */
if (STAGE.PAGE === 'strike') FILM.run({ duration: LEN, chapters: CHAPTERS, render: t => frame(t), cues: CUES });
})();
