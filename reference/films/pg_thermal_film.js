/* THERMAL (Point Cloud, defence P4) · the film. One take through a gimballed thermal imager on a sister ship's
   pilothouse: the lens never leaves its mast, it only slews, tracks and zooms. Down off the horizon onto the hero
   at night, into its stacks and along to the aft Phalanx; out to the whole ship as the view flips to black-hot, then
   to the threat bearing, where four hot points come over the horizon; wide for the launches and the far intercepts;
   white-hot again for the Phalanx and the hit; the breach, the Phalanx back to stow; up the smoke into the night
   sky, along the cloud deck and down to the horizon, the slew running on across the loop's seam onto the hero.
   render(T) is a pure function of film time T. */
(() => {
  'use strict';
  const { V, R, X, E, Cam } = M3;
  const { D, DEG, TAU, LIME, WH, CORAL } = PG;
  const DW = PG.DW, win = PG.win;
  const ss = E.ss, sat = E.sat;
  STAGE.fit();
  const SFX = STAGE.SFX; SFX.kind = 'pc';
  const $ = id => document.getElementById(id);

  /* ---------- menu ---------- */
  const menuEl = $('menu');
  menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
  const veil = $('veil');
  STAGE.menu({ el: menuEl, blurb: $('blurb'),
    onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });
  const MENU_BOX = [70, 560, 600, 960];

  /* ---------- canvases ---------- */
  const cv = $('c'), ov = $('o'), octx = ov.getContext('2d');
  const pb = new PointBuf(cv, [11, 12, 10], { vignette: .5 });
  const cam = new Cam(); cam.near = 1;
  const uiEl = $('ui');
  const CX0 = 1110, CY0 = 520;                           // the boresight: right of the menu

  /* ---------- the gimbal: keyed look targets (world points, or functions of T for tracking) and a vertical FOV,
     each segment eased (a slew accelerates and settles; a pan runs level). The eye is the imager's own. ---------- */
  const EYE = [0, 0, 0], RO = {};
  const DIP = Math.sqrt(2 * PG.SENS.h / PG.RE) / DEG;
  const dirOf = (brg, el) => [Math.sin(brg * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(brg * DEG) * Math.cos(el * DEG)];
  const brgOf = p => { PG.eye(0, EYE); return Math.atan2(p[0] - EYE[0], p[2] - EYE[2]) / DEG; };
  const Pt = p => () => p;
  /* a point on the horizon (el: degrees above it) or in the sky, 20 km out along a bearing from the eye */
  const HZ = (brg, el) => T => { PG.eye(T, EYE); return V.mad(EYE, dirOf(brg, (el || 0) - DIP), 20000); };
  const SK = (brg, el) => T => { PG.eye(T, EYE); return V.mad(EYE, dirOf(brg, el), 20000); };
  /* a direction off a world point: rotated by dB degrees in bearing and dE in elevation, seen from the eye */
  const OFF = (p, dB, dE) => T => { PG.eye(T, EYE); const d = V.sub(p, EYE), r = Math.hypot(d[0], d[2]), b = Math.atan2(d[0], d[2]) / DEG + dB, e = Math.atan2(d[1], r) / DEG + dE; return V.mad(EYE, dirOf(b, e), V.len(d)); };
  const GRP = T => { let x = 0, y = 0, z = 0; for (let k = 0; k < 4; k++) { const p = PG.round(k, Math.min(T, 79.9), RO).p; x += p[0]; y += p[1]; z += p[2]; } return [x / 4, y / 4, z / 4]; };
  const RND = k => T => PG.round(k, T, RO).p.slice();
  const SHH = i => T => { const s = PG.SHOTS[i]; return PG.shotAt(s, E.clamp(T, s.tL, s.tEnd), [0, 0, 0]); };
  const HERO = [0, 13, -8];
  const BH = brgOf(HERO);                                      // the hero from the eye (~059)
  const BR = brgOf(GRP(61));                                   // the raid at the horizon (~072)
  PG.BR = BR;
  const STOP0 = PG.EV.stops[0].p, STOP1 = PG.EV.stops[1].p;
  /* AGC windows [lo, hi] in heat: the ship at night, the stacks close, the aft end, the horizon stretched, the raid,
     the fight wide, the ship in black-hot (hot = high in the window, so the hull falls dark), the sky */
  const AGC = { A: [.14, .9], S: [.16, 1.08], A2: [.14, .88], Hz: [.1, .47], R: [.09, .66], W: [.06, .8], Wb: [.05, .64], K: [.02, .3] };
  /* keys in film time; the last one runs on across the loop's seam into the first (T = 0 falls inside that slew,
     with the hero still out of frame) */
  const K = [];
  /* gw: the part of the move [u0, u1] over which the AGC settles on the new scene (default the whole move) */
  const key = (t, f, fov, e, g, gw) => K.push({ t, f: typeof f === 'function' ? f : Pt(f), fov, e: e || 'ss', g: AGC[g || 'A'], gw: gw || [0, 1] });
  key(4.0, HERO, 4.6, 'ss', 'A', [.62, 1]);                  // down off the horizon onto the hero (AGC as it enters)
  key(12.5, [0, 16, -12], 3.4, 'ss', 'A');                    // push in
  key(17, [0, 20.6, -7.4], 1.7, 'ss', 'S');                   // the uptakes
  key(22, [-1, 23.5, -9], 1.6, 'ss', 'S');
  key(27, [-6, 31, -24], 2.0, 'ss', 'S');                     // up the exhaust as it streams aft
  key(31.5, [0, 17, -32], 1.7, 'ss', 'A2');                   // aft along the superstructure
  key(36, [0, 15.2, -47.5], 1.45, 'ss', 'A2');                // the aft Phalanx, stowed
  key(39.5, [0, 14.6, -49.5], 1.4, 'ss', 'A2');
  key(43.5, OFF(HERO, -.25, .25), 3.6, 'ss', 'A');               // out to the whole ship: black-hot at 45.0
  key(48.2, OFF(HERO, -.05, .3), 3.9, 'lin', 'Wb');            // held while the ship reads dark
  key(51.2, HZ(BR - 1.5, .05), 3.2, 'q', 'Hz');              // slew to the threat bearing
  key(54.2, HZ(BR - 4.0, .05), 2.6, 'ss', 'Hz');             // step-stare along the horizon
  key(57.4, HZ(BR + .3, .03), 2.2, 'ss', 'Hz');              // the raid comes over it at 57.25
  key(60.4, GRP, 1.15, 'ss', 'R');                            // four hot points: lock on
  key(63.8, GRP, .95, 'lin', 'R');
  key(66.0, OFF(HERO, .5, 2.4), 9.0, 'q', 'Wb');            // back on the hero, headroom for the launches (66.0, 67.6)
  key(69.8, OFF(HERO, 2.6, 3.0), 12.0, 'ss', 'W');           // widening with the climbs
  key(74.4, OFF(HERO, 4.1, 3.8), 14.7, 'ss', 'W');           // the whole picture: ship, arcs, the raid
  key(76.7, OFF(HERO, 4.4, 3.85), 14.3, 'ss', 'W');          // held through I3's launch (75.6)
  key(78.9, OFF(STOP0, 0, .5), 3.1, 'ss', 'W');              // onto the first meeting point (80.0)
  key(81.3, OFF(STOP0, 0, .4), 3.1, 'ss', 'W');
  key(82.8, OFF(STOP1, 0, .4), 3.1, 'ss', 'W');              // the second (83.2)
  key(84.6, OFF(STOP1, 0, .4), 3.1, 'ss', 'W');
  key(87.2, SHH(2), 3.0, 'ss', 'W');                          // with I3 onto the weaving round
  key(89.3, RND(3), 2.0, 'ss', 'R');                          // the miss
  key(91.0, RND(3), 2.3, 'lin', 'R');                         // white-hot again at 90.5
  key(93.6, [0, 15.2, -47.5], 1.4, 'q', 'A2');               // the aft Phalanx trains (93.9-95.5)
  key(97.0, [0, 15.2, -47.5], 1.45, 'ss', 'A2');
  key(99.6, OFF(HERO, 1.6, .35), 6.0, 'ss', 'A');            // the ship left, the rounds in from the right
  key(103.4, OFF(HERO, 1.3, .3), 5.6, 'lin', 'A');           // the hit
  key(106.5, [4, 12, -57], 2.8, 'ss', 'A');
  key(112, [3, 10, -57], 1.8, 'ss', 'A');                     // close on the breach
  key(118.4, [2, 11, -59], 1.75, 'ss', 'A');
  key(123, [0, 16, -44], 3.0, 'ss', 'A');                     // the aft half
  key(127.2, [0, 15.4, -47.5], 1.5, 'ss', 'A2');             // the aft Phalanx back to stow (127.5-131.5)
  key(131.8, [0, 15.2, -48], 1.45, 'ss', 'A2');
  key(137, OFF(HERO, .2, .9), 2.8, 'ss', 'A');                // up the exhaust as it trails away
  key(142.5, SK(BH - 1.5, 3.2), 5.2, 'ss', 'K');              // into the night sky: the cloud deck
  key(148.5, SK(BH - 14, 2.2), 5.6, 'lin', 'K');              // along it
  key(153.5, HZ(BH - 20, .5), 4.0, 'ss', 'Hz');               // down to the horizon, and on across the seam
  const q5 = u => u * u * u * (u * (u * 6 - 15) + 10);
  const EASE = { ss: u => u * u * (3 - 2 * u), q: q5, lin: u => u };
  const slerpDir = (a, b, u) => { const d = E.clamp(V.dot(a, b), -1, 1), th = Math.acos(d); if (th < 1e-6) return V.norm(V.lerp(a, b, u)); const s = Math.sin(th); return V.add(V.mul(a, Math.sin((1 - u) * th) / s), V.mul(b, Math.sin(u * th) / s)); };
  const SENS = { lo: .05, hi: .92, fov: 4, dir: [0, 0, 1] };
  const KN = K.length;
  function camAt(T) {
    PG.eye(T, EYE);
    let a, b, ta, tb;
    if (T < K[0].t) { a = K[KN - 1]; b = K[0]; ta = a.t - D; tb = b.t; }
    else if (T >= K[KN - 1].t) { a = K[KN - 1]; b = K[0]; ta = a.t; tb = b.t + D; }
    else { let i = 0; while (i < KN - 2 && K[i + 1].t <= T) i++; a = K[i]; b = K[i + 1]; ta = a.t; tb = b.t; }
    const u = sat((T - ta) / (tb - ta)), e = EASE[b.e](u);
    const da = V.norm(V.sub(a.f(T), EYE)), db = V.norm(V.sub(b.f(T), EYE));
    let dir = slerpDir(da, db, e);
    const fov = Math.exp(Math.log(a.fov) + (Math.log(b.fov) - Math.log(a.fov)) * e);
    const ge = ss(b.gw[0], b.gw[1], e);
    SENS.lo = a.g[0] + (b.g[0] - a.g[0]) * ge; SENS.hi = a.g[1] + (b.g[1] - a.g[1]) * ge; SENS.fov = fov;
    // the stabiliser's residual: a few microradians (whole cycles per film)
    const rt = V.norm(V.cross([0, 1, 0], dir)), up = V.cross(dir, rt);
    const jx = 1.1e-5 * (Math.sin(TAU * 37 * T / D) + .6 * Math.sin(TAU * 83 * T / D + 1)), jy = 1.1e-5 * (Math.sin(TAU * 29 * T / D + 2) + .5 * Math.sin(TAU * 71 * T / D));
    dir = V.norm(V.add(dir, V.add(V.mul(rt, jx), V.mul(up, jy))));
    SENS.dir = dir;
    cam.eye = EYE.slice(); cam.target = V.add(EYE, V.mul(dir, 100)); cam.fov = fov * DEG; cam.roll = 0;
    cam.cx = CX0; cam.cy = CY0; cam.near = 1;
    const sk = PG.shakeFx(T);
    cam.shake = sk > .05 ? FILM.shake(T, sk, 14) : [0, 0];
    cam.update();
  }

  /* ---------- heat -> apparent temperature (the spot meter and the tags) ---------- */
  const HC = [[0, -55], [.05, -38], [.1, -16], [.15, 6], [.2, 12], [.3, 17], [.36, 21], [.45, 30], [.55, 48], [.65, 78], [.75, 125], [.85, 200], [.95, 310], [1.05, 440], [1.2, 650], [1.3, 800]];
  const degC = h => { if (h <= HC[0][0]) return HC[0][1]; for (let i = 0; i < HC.length - 1; i++) if (h < HC[i + 1][0]) return HC[i][1] + (HC[i + 1][1] - HC[i][1]) * (h - HC[i][0]) / (HC[i + 1][0] - HC[i][0]); return HC[HC.length - 1][1]; };
  const fmtC = c => (c >= 0 ? '+' : '−') + (Math.abs(c) < 100 ? Math.abs(c).toFixed(1) : Math.round(Math.abs(c))) + ' °C';
  PG.degC = degC;

  /* ---------- tags (DOM chips, after pa_picture_core) ---------- */
  const tagPool = new Map(); let req = [];
  function flushTags() {
    req.sort((a, b) => (b.pri || 0) - (a.pri || 0) || a.y - b.y);
    const placed = [];
    for (const qq of req) {
      let t = tagPool.get(qq.key);
      if (!t) {
        const el = document.createElement('div'); el.className = 'tag off'; el.innerHTML = '<b></b><i></i><span class="v"></span>'; uiEl.insertBefore(el, menuEl);
        t = { el, b: el.children[0], i: el.children[1], v: el.children[2], txt: '', cls: '' }; tagPool.set(qq.key, t);
      }
      const txt = (qq.id || '') + '|' + (qq.txt || '') + '|' + (qq.v || '');
      if (t.txt !== txt) { t.txt = txt; t.b.textContent = qq.id || ''; t.i.textContent = qq.txt || ''; t.v.textContent = qq.v || ''; t.v.style.display = qq.v ? '' : 'none'; t.i.style.display = qq.txt ? '' : 'none'; }
      const cls = 'tag' + (qq.cls ? ' ' + qq.cls : '');
      if (t.cls !== cls) { t.cls = cls; t.el.className = cls; }
      const w = t.el.offsetWidth || 150;
      const offAnchor = qq.ax !== undefined && (qq.ax < 4 || qq.ax > 1916 || qq.ay < 4 || qq.ay > 1076);
      let x = Math.min(Math.max(8, qq.x), 1912 - w), y = qq.y;
      for (let g = 0; g < 10; g++) { const hit = placed.find(p => x < p.x + p.w + 6 && p.x < x + w + 6 && Math.abs(y - p.y) < 24); if (!hit) break; y = hit.y + (qq.down ? 25 : -25); }
      const inMenu = x < MENU_BOX[2] && x + w > MENU_BOX[0] && y + 20 > MENU_BOX[1] && y < MENU_BOX[3];
      if (offAnchor || inMenu || qq.a <= .02 || y < 150 || y > 870) { t.used = false; continue; }
      placed.push({ x, y, w });
      t.used = true;
      t.el.style.opacity = Math.min(1, qq.a).toFixed(2);
      t.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
      if (qq.ax !== undefined && qq.lead !== false && !FILM.uiHidden) {
        octx.strokeStyle = qq.leadCol || 'rgba(238,238,228,.7)'; octx.globalAlpha = Math.min(1, qq.a) * .8; octx.lineWidth = 1; octx.setLineDash([1, 2.5]);
        octx.beginPath(); octx.moveTo(qq.ax, qq.ay); octx.lineTo(x - 2, y + (y < qq.ay ? 20 : 0)); octx.stroke(); octx.setLineDash([]); octx.globalAlpha = 1;
      }
    }
    for (const [, t] of tagPool) if (!t.used) { if (t.cls !== 'tag off') { t.cls = 'tag off'; t.el.className = 'tag off'; t.el.style.opacity = ''; } } else t.used = false;
    req = [];
  }
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
  /* corner brackets + a dotted outline fitted to a screen box */
  function bracket(x0, y0, x1, y1, col, a, len) {
    const c = Math.min(len, (x1 - x0) * .35, (y1 - y0) * .35);
    octx.strokeStyle = rgba(col, a); octx.lineWidth = 1.5; octx.beginPath();
    for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { octx.moveTo(px + sx * c, py); octx.lineTo(px, py); octx.lineTo(px, py + sy * c); }
    octx.stroke(); octx.lineWidth = 1; octx.setLineDash([2, 4]); octx.strokeStyle = rgba(col, a * .45); octx.strokeRect(x0, y0, x1 - x0, y1 - y0); octx.setLineDash([]);
  }

  /* ---------- the imager's reticle: a thin cross round a gap at the boresight ---------- */
  function reticle(k) {
    if (k <= .01 || FILM.uiHidden) return;
    const cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1];
    octx.strokeStyle = rgba(WH, .72 * k); octx.lineWidth = 1; octx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { octx.moveTo(cx + dx * 13 + .5 * !dx, cy + dy * 13 + .5 * !dy); octx.lineTo(cx + dx * 44 + .5 * !dx, cy + dy * 44 + .5 * !dy); }
    // stadia ticks on the horizontal arms
    for (const s of [-1, 1]) for (const r of [26, 38]) { octx.moveTo(cx + s * r + .5, cy - 3); octx.lineTo(cx + s * r + .5, cy + 4); }
    octx.stroke();
    octx.fillStyle = rgba(WH, .9 * k); octx.fillRect(cx - .5, cy - .5, 2, 2);
  }

  /* ---------- captions, readouts ---------- */
  const CH = [
    { t: 0, title: 'Watch' },
    { t: 15, title: 'Machinery' },
    { t: 43.5, title: 'Black-hot' },
    { t: 50, title: 'Horizon' },
    { t: 64, title: 'Launch' },
    { t: 90.5, title: 'Close-in' },
    { t: PG.T_HIT, title: 'Hit' },
    { t: 134, title: 'Night' },
  ];
  const b3 = a => String(Math.round(((a % 360) + 360) % 360)).padStart(3, '0');
  const KICKS = [
    [0, 'Mk 20 EOSS / LWIR · white-hot'],
    [3.2, 'DDG-51 Arleigh Burke / 4.0 km · port quarter'],
    [15.5, 'LM2500 × 4 / Uptakes · exhaust'],
    [31.5, 'Mk 15 Phalanx 1B / Aft mount · stowed'],
    [PG.POL[0].t, 'Mk 20 EOSS / LWIR · black-hot'],
    [49, `Mk 20 EOSS / Threat bearing ${b3(BR)}`],
    [PG.EV.detect, 'TRK 41–44 / 3M55 Oniks · Mach 2'],
    [65.5, 'Mk 41 / SM-6 · engage'],
    [PG.POL[1].t, 'Mk 20 EOSS / LWIR · white-hot'],
    [93, 'Mk 15 Phalanx 1B / Aft mount · engage'],
    [PG.T_HIT, 'DDG-51 / Hit · starboard quarter'],
    [126.5, 'Mk 15 Phalanx 1B / Aft mount · stow'],
    [135.5, 'Mk 20 EOSS / Night sky · search'],
    [152, 'Mk 20 EOSS / LWIR · white-hot'],
  ];
  const kickT = $('kickt'), spotEl = $('spot'), pW = $('pW'), pB = $('pB'), sFov = $('sFov'), sZm = $('sZm'), sRng = $('sRng'), sAz = $('sAz'), sEl = $('sEl');
  let lastKick = '', lastUi = -1, lastPol = -1;
  const setTxt = (el, s) => { if (el.textContent !== s) el.textContent = s; };
  /* the range under the boresight: the hero's hull box, a round near the cross, else the sea (with the earth's
     curve), else none */
  function rangeAt(T) {
    const e = cam.eye, d = SENS.dir;
    // ray against the hero's box
    let t0 = 0, t1 = 1e9; const mn = [-11, 0, -78], mx = [11, 46, 78];
    for (let c = 0; c < 3; c++) { if (Math.abs(d[c]) < 1e-9) { if (e[c] < mn[c] || e[c] > mx[c]) { t0 = 1e9; break; } continue; } let a = (mn[c] - e[c]) / d[c], b = (mx[c] - e[c]) / d[c]; if (a > b) { const s = a; a = b; b = s; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
    if (t0 < t1 && t0 < 1e8) return t0;
    for (let k = 0; k < 4; k++) { PG.round(k, T, RO); if (!RO.alive) continue; const p = cam.project(RO.p); if (p && Math.hypot(p[0] - cam.cx, p[1] - cam.cy) < 14) return V.dist(e, RO.p); }
    const dep = -Math.asin(E.clamp(d[1], -1, 1)), h = e[1], disc = dep * dep - 2 * h / PG.RE;
    if (dep > 0 && disc > 0) return (dep - Math.sqrt(disc)) * PG.RE;
    return -1;
  }

  /* ---------- render ---------- */
  const PROF = {}; let pt0 = 0;
  const tick = k => { const n = performance.now(); PROF[k] = +((PROF[k] || 0) * .9 + (n - pt0) * .1).toFixed(2); pt0 = n; };
  const ctx = { T: 0, cam, pb, DW, st: null, sensor: DW.sensor, hot: [], partHeat: DW.partHeat, PID: DW.PID, pol: 0,
    hput: DW.hput, hglow: DW.hglow, P3: DW.P3, q: DW.q, occMark: DW.occMark, put: DW.put, dset: DW.dset, lum: DW.lum };
  const BOXES = [];
  function render(T) {
    pt0 = performance.now();
    camAt(T);
    // the sensor for this shot: polarity (+ its wipe), AGC, noise; then stage B's heat
    const S = DW.sensor, pol = PG.polAt(T);
    S.pol = pol.pol; S.from = pol.from; S.wipe = pol.wipe;
    S.lo = SENS.lo; S.hi = SENS.hi; S.glare = 0;
    S.noise = E.clamp(.052 * .86 / Math.max(.2, S.hi - S.lo), .04, .12);
    const st = PG.shipStateFx(PG.shipState(T), T);
    ctx.T = T; ctx.st = st; ctx.pol = pol.pol; ctx.hot.length = 0; DW.partHeat.fill(0);
    PG.heatFx(T, ctx);
    DW.setHot(ctx.hot);
    DW.palette();
    DW.frame(Math.floor(T * 30));
    pb.clear();
    octx.clearRect(0, 0, 1920, 1080);
    DW.sync(cam, pb);
    DW.spotAt(cam.cx, cam.cy, 7);
    tick('pre');
    // the hero first: it writes the occlusion the sky and the sea test
    DW.occReset();
    DW.drawShip(T, st, 1);
    DW.occClose();
    tick('ship');
    DW.drawExhaust(T, 1);
    tick('exhaust');
    // the raid, the interceptors' paths
    BOXES.length = 0;
    for (let k = 0; k < 4; k++) {
      if (T < PG.tFirst(k) || T > PG.tStop[k] + 1.5) continue;
      DW.drawTrail(k, T, 1);
      PG.round(k, T, RO);
      if (!RO.alive) continue;
      const b = DW.drawRound(k, T, RO, 1);
      if (b) BOXES.push({ k, b, p: RO.p.slice() });
    }
    for (const s of PG.SHOTS) DW.drawShotPath(s, T, 1);
    tick('raid');
    // the fighting (stage B)
    PG.launchFx(T, ctx); PG.interceptFx(T, ctx); PG.ciwsFx(T, ctx); PG.hitFx(T, ctx);
    tick('fx');
    DW.drawSky(1);
    tick('sky');
    DW.drawSea(T, 1);
    tick('sea');
    DW.drawWake(T, 1);
    DW.drawGrain(Math.floor(T * 30), .8 + .6 * E.sat((.6 - (S.hi - S.lo)) / .3));
    DW.drawGlare(S.glare);
    pb.blit();
    tick('blit');

    // ---------- overlay ----------
    if (!FILM.uiHidden) {
      const g = octx.createRadialGradient(120, 1080, 0, 120, 1080, 900);
      g.addColorStop(0, 'rgba(11,12,10,.86)'); g.addColorStop(.55, 'rgba(11,12,10,.55)'); g.addColorStop(1, 'rgba(11,12,10,0)');
      octx.fillStyle = g; octx.fillRect(0, 180, 1100, 900);
      const g2 = octx.createRadialGradient(150, 70, 0, 150, 70, 520);
      g2.addColorStop(0, 'rgba(11,12,10,.75)'); g2.addColorStop(1, 'rgba(11,12,10,0)');
      octx.fillStyle = g2; octx.fillRect(0, 0, 680, 600);
      const g3 = octx.createRadialGradient(1760, 1000, 0, 1760, 1000, 420);
      g3.addColorStop(0, 'rgba(11,12,10,.7)'); g3.addColorStop(1, 'rgba(11,12,10,0)');
      octx.fillStyle = g3; octx.fillRect(1300, 600, 620, 480);
    }
    // the polarity switch: the wipe's leading edge
    if (pol.wipe >= 0 && !FILM.uiHidden) {
      const y = pol.wipe * 1080;
      octx.fillStyle = 'rgba(238,238,228,.32)'; octx.fillRect(0, Math.round(y), 1920, 1);
      octx.fillStyle = 'rgba(238,238,228,.07)'; octx.fillRect(0, Math.round(y) - 6, 1920, 6);
    }
    reticle(1);
    const tags = [];
    // the hero, identified in the wide shots (a box on its true bounds)
    const heroK = win(T, 3.4, 5.2, 11.4, 13.2) + win(T, 45.8, 46.6, 48.4, 49.4) + win(T, 65.6, 67.2, 72.5, 74.2) + win(T, 99.2, 100.4, 102.6, 103.3);
    const sb = DW.shipBox;
    if (heroK > .01 && sb && sb.x1 > sb.x0 + 8) {
      bracket(sb.x0 - 5, sb.y0 - 5, sb.x1 + 5, sb.y1 + 5, WH, .75 * heroK, 9);
      tags.push({ key: 'hero', id: 'DDG', txt: 'Arleigh Burke', v: (V.dist(cam.eye, HERO) / 1000).toFixed(1) + ' km', cls: 'lime', ax: sb.x0 + 4, ay: sb.y0 - 5, x: sb.x0 + 14, y: sb.y0 - 46, a: heroK, pri: 6 });
    }
    // the uptakes: the hottest thing aboard, read off the imager
    const upK = win(T, 16.2, 18, 25.8, 27.4);
    if (upK > .01) {
      const m = DW.MOUTHS[0], p = cam.project([m[0], m[1] + .3, m[2]]);
      if (p) tags.push({ key: 'upt', id: 'MER 2', txt: 'LM2500 uptake', v: fmtC(degC(1.14)), cls: 'drop', ax: p[0], ay: p[1], x: p[0] + 70, y: p[1] - 90, a: upK, pri: 5 });
    }
    // the aft Phalanx: its mount at rest, then training
    const cwK = win(T, 35, 36.6, 40, 41.6) + win(T, 93.4, 94.4, 98.2, 99.2) + win(T, 127.2, 128.2, 132.2, 133.6);
    if (cwK > .01) {
      const p = cam.project([0, 17.4, -47.5]);
      const a = PG.ciwsAim(T);
      if (p) tags.push({ key: 'ciws', id: 'CIWS 2', txt: 'Mk 15 Phalanx 1B', v: T < 60 || T > PG.CIWS.tBack1 ? 'stowed' : T > PG.CIWS.tBack0 ? 'stow ' + b3(a.yaw / DEG) : 'train ' + b3(a.yaw / DEG), cls: 'lime', ax: p[0] + 4, ay: p[1] - 4, x: p[0] + 90, y: p[1] - 120, a: cwK, pri: 6 });
    }
    // the raid: coral boxes on each round's true bounds while the imager is on them
    const rdK = win(T, PG.EV.detect + .4, PG.EV.detect + 1.2, 65.2, 66.2) + win(T, 74.8, 76, 91.4, 92.6) + win(T, 99.4, 100, 103.2, 103.5);
    if (rdK > .01) for (const B of BOXES) {
      const b = B.b, cxb = (b.x0 + b.x1) / 2, cyb = (b.y0 + b.y1) / 2, hw = Math.max(7, (b.x1 - b.x0) / 2 + 3), hh = Math.max(6, (b.y1 - b.y0) / 2 + 3);
      if (cxb < 0 || cxb > 1920 || cyb < 0 || cyb > 1080) continue;
      bracket(cxb - hw, cyb - hh, cxb + hw, cyb + hh, CORAL, .9 * rdK, 6);
      const r = PG.RND[B.k], rng = V.dist(cam.eye, B.p);
      tags.push({ key: 'r' + B.k, id: 'TRK ' + r.id, txt: '', v: (rng / 1000).toFixed(1) + ' km', cls: 'coral sm', ax: cxb + hw, ay: cyb - hh, x: cxb + hw + 14, y: cyb - hh - 34, a: rdK, pri: 4 + (B.k === 3 ? 1 : 0) });
    }
    PG.fxOverlay(T, octx, tags, ctx);
    for (const tg of tags) req.push(tg);
    flushTags();
    tick('ui');

    // captions + readouts, 10 Hz
    let kk = KICKS[0][1]; for (const [t, k] of KICKS) if (T >= t) kk = k;
    if (kk !== lastKick) { lastKick = kk; kickT.textContent = kk; }
    if (pol.pol !== lastPol && (pol.wipe < 0 || pol.wipe > .5)) { lastPol = pol.pol; pW.classList.toggle('on', !pol.pol); pB.classList.toggle('on', !!pol.pol); }
    if (Math.abs(T - lastUi) > .1 || FILM.seeking || !FILM.playing) {
      lastUi = T;
      setTxt(spotEl, DW.spot.h < 0 ? '—' : fmtC(degC(DW.spot.h)));
      setTxt(sFov, SENS.fov.toFixed(2) + '°');
      setTxt(sZm, (12.5 / SENS.fov).toFixed(1));
      const r = rangeAt(T);
      setTxt(sRng, r < 0 ? '—' : r < 10000 ? (r / 1000).toFixed(2) + ' km' : (r / 1000).toFixed(1) + ' km');
      const d = SENS.dir, az = Math.atan2(d[0], d[2]) / DEG, el = Math.asin(E.clamp(d[1], -1, 1)) / DEG;
      setTxt(sAz, (((az % 360) + 360) % 360).toFixed(1).padStart(5, '0') + '°');
      setTxt(sEl, (el < 0 ? '−' : '+') + Math.abs(el).toFixed(2) + '°');
    }
    STAGE.dbg = { T: +T.toFixed(2), fov: +SENS.fov.toFixed(2), pol: pol.pol, ship: DW.shipN, sea: DW.seaN, sky: DW.skyN, prof: PROF };
  }

  /* ---------- sound: synthesized, fired only while playing forward (the fight's own sounds: stage B) ---------- */
  const cues = [];
  const cue = (t, fn) => { t = ((t % D) + D) % D; cues.push([t, fn]); };
  // the polarity switches: a relay click and a short high tick
  for (const s of PG.POL) cue(s.t, () => { SFX.tone(1800, 1800, .02, 'square', .014); SFX.tone(2700, 2700, .03, 'square', .01, .05); SFX.noise(.12, 3000, .6, .015, .002); });
  // the gimbal's slews: a servo whir on each big move
  for (const k of K) if (k.e === 'q') cue(k.t - 2.6, () => { SFX.noise(2.2, 1300, 2.5, .022, .4); SFX.tone(520, 760, 1.8, 'sine', .006); });
  // zooms: a faint focus motor
  for (let i = 1; i < K.length; i++) if (Math.abs(Math.log(K[i].fov / K[i - 1].fov)) > .5 && K[i].e !== 'q') cue(K[i - 1].t + .2, () => SFX.noise(1.4, 2600, 3, .008, .3));
  // the raid comes over the horizon
  cue(PG.EV.detect, () => { SFX.tone(620, 620, .05, 'square', .012); SFX.tone(465, 465, .06, 'square', .01, .07); });
  // the imager's cooler, a low hum under everything
  for (let t = .5; t < D; t += 8) cue(t, () => SFX.tone(58, 58, 7.8, 'sine', .004));
  for (const c of (PG.fxCues || [])) cue(c[0], c[1]);

  FILM.run({
    duration: D,
    chapters: CH.map(c => ({ t: c.t, title: c.title })),
    cues,
    render,
  });
  // stills render before the web fonts load: redraw once they have, so every canvas label uses them
  if (STAGE.Q.has('t')) document.fonts.ready.then(() => FILM.seek(FILM.T));
  STAGE.PG = { cam, camAt, K, SENS, PROF, BH, BR };
})();
