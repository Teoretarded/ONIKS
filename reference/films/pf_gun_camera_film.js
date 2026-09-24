/* GUN CAMERA (Point Cloud, defence P3) · the film. One take, mostly through the forward Phalanx's own thermal
   sight: reticle, train tape, elevation ladder, range, the lag line to each tracked round. Between engagements the
   lens zooms out and the camera backs out of the sight to show the mount itself on the deck, turning to the next
   sector with its barrels spinning down, then flies back into the sight. The fifth threat comes round the far side:
   the camera climbs over the bridge and looks aft. render(T) is a pure function of film time T. */
(() => {
  'use strict';
  const { V, R, X, E, Cam } = M3;
  const { D, DEG, TAU, LIME, WH, CORAL } = PF;
  const DW = PF.DW;
  const ss = E.ss, sat = E.sat, mix = E.mix;
  STAGE.fit();
  const SFX = STAGE.SFX; SFX.kind = 'pc';
  const $ = id => document.getElementById(id);

  /* ---------- menu: a centred row along the bottom ---------- */
  const menuEl = $('menu');
  menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
  const veil = $('veil');
  STAGE.menu({ el: menuEl, blurb: $('blurb'), axis: 'h', onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });

  /* ---------- canvases ---------- */
  const cv = $('c'), ov = $('o'), octx = ov.getContext('2d');
  const pb = new PointBuf(cv, [11, 12, 10], { vignette: .5 });
  const cam = new Cam(); cam.near = .1;
  const uiEl = $('ui');
  const CY0 = 466;                                        // the reticle sits above the menu row

  /* ---------- lenses ---------- */
  const lnFL = fovDeg => Math.log(540 / Math.tan(fovDeg * DEG / 2));
  const FL_S = lnFL(1.25), FL_W = lnFL(34), FL_T = Math.log(68000);
  /* on lock the tracker zooms in; then it lets a closing round grow slowly: FL ~ range^0.2 */
  const trackLn = r => FL_T + .2 * Math.log(Math.max(250, r) / 10000);
  const RO = { p: [0, 0, 0], dir: [0, 0, 1] };
  function stateLn(s, T) {
    if (s.kind === 'track') { PF.round(s.k, T, RO); return trackLn(RO.range); }
    if (s.kind === 'hold') { PF.round(s.k, PF.ROUNDS[s.k].tStop - 1e-3, RO); return trackLn(RO.range); }
    if (s.kind === 'park') return FL_W;
    return FL_S;
  }
  function zoomSight(T) {
    const A = PF.AIMS, i = PF.aim(T).i, s = A[i];
    let v = stateLn(s, T);
    if (s.b && T < s.t + s.b) { const p = A[i - 1] || A[A.length - 1]; v = mix(stateLn(p, T), v, E.inOut(sat((T - s.t) / s.b))); }
    return v;
  }

  /* ---------- the take: sight segments and flown segments ----------
     A flown segment starts on the sight's pose (lens zoomed out, eye on the FLIR window) and ends on it, so
     the cuts never show: the sight zooms out for the last ZO s before a flight and in for ZI s after one. */
  const ZO = 1.9, ZI = 2.2;
  const toShip = (T, p) => { const Xs = PF.shipX(T), d = V.sub(p, Xs.T), M = Xs.R; return [M[0] * d[0] + M[3] * d[1] + M[6] * d[2], M[1] * d[0] + M[4] * d[1] + M[7] * d[2], M[2] * d[0] + M[5] * d[1] + M[8] * d[2]]; };
  const dirShip = (T, d) => { const M = PF.shipX(T).R; return [M[0] * d[0] + M[3] * d[1] + M[6] * d[2], M[1] * d[0] + M[4] * d[1] + M[7] * d[2], M[2] * d[0] + M[5] * d[1] + M[8] * d[2]]; };
  const ypOf = d => [Math.atan2(d[0], d[2]) / DEG, Math.asin(E.clamp(d[1], -1, 1)) / DEG];
  const dirYP = (yaw, pit) => { const y = yaw * DEG, p = pit * DEG; return [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)]; };
  /* the sight's pose in ship coordinates at t, backed off d m along its line of sight, lifted h m, moved lat m left */
  function sightKey(t, d, h, lat, fov) {
    const f = PF.flir(t), e = toShip(t, f.eye), dir = dirShip(t, f.f), [yaw, pit] = ypOf(dir), L = [dir[2], 0, -dir[0]];
    d = d || 0; h = h || 0; lat = lat || 0;
    return { t, e: [e[0] - dir[0] * d - L[0] * lat, e[1] - dir[1] * d + h, e[2] - dir[2] * d - L[2] * lat], yaw: yaw + (d ? 9 : 0), pit: pit - (d ? 9 : 0), fov: fov || 34, roll: 0 };
  }
  /* a free key: eye (ship coords), and a point to look at (ship coords) */
  function lookKey(t, e, at, fov, roll) { const [yaw, pit] = ypOf(V.norm(V.sub(at, e))); return { t, e, yaw, pit, fov, roll: roll || 0 }; }
  const MP = PF.CIWS_P[0], MC = [0, 12.8, 33.1];

  const FLIGHTS = [
    // pull back 1: out of the window over the dome's shoulder, round the port bow, across the muzzles, back in
    { t0: 24.6, t1: 39.0, keys: () => [
      sightKey(24.6),
      sightKey(26.0, 1.6, .95, .45, 40),
      lookKey(28.4, [-3.7, 14.6, 34.2], MC, 42),
      lookKey(31.0, [-4.6, 14.1, 35.2], [0, 12.8, 33.3], 42),
      lookKey(32.6, [-.2, 13.6, 39.6], MC, 42),
      lookKey(34.0, [3.4, 13.5, 37.6], [0, 12.9, 33.0], 42),
      lookKey(35.4, [1.2, 17.4, 35.6], MC, 44),
      lookKey(36.6, [-2.4, 15.2, 32.4], [4.5, 12.4, 42.0], 42),
      sightKey(37.9, 1.5, .9, .45, 38),
      sightKey(39.0),
    ] },
    // pull back 2: out and up the port side as the mount trains to port, the bow from high on its port quarter, back in
    { t0: 57.0, t1: 72.0, keys: () => [
      sightKey(57.0),
      sightKey(58.4, 1.6, .95, .45, 40),
      lookKey(60.6, [-5.6, 16.8, 35.4], MC, 44),
      lookKey(63.8, [-13.5, 19.0, 50.0], [0, 11.6, 35.0], 40),
      lookKey(66.9, [-6.8, 14.0, 38.6], [0, 12.8, 33.2], 42),
      lookKey(69.6, [-3.4, 15.2, 30.8], [-4.4, 12.6, 42.0], 42),
      sightKey(70.9, 1.5, .9, .45, 38),
      sightKey(72.0),
    ] },
    // pull back 3: down the starboard side at deck level, round the muzzles, the port bow, back in
    { t0: 90.2, t1: 104.2, keys: () => [
      sightKey(90.2),
      sightKey(91.5, 1.6, .95, .45, 40),
      lookKey(94.0, [5.9, 12.0, 33.6], [0, 13.0, 33.0], 44),
      lookKey(97.2, [1.3, 13.3, 38.5], [0, 13.0, 33.0], 44),
      lookKey(100.4, [-4.5, 14.4, 35.4], MC, 42),
      lookKey(102.4, [-3.0, 15.4, 31.0], [1.0, 12.6, 42.0], 42),
      sightKey(103.3, 1.5, .9, .45, 38),
      sightKey(104.2),
    ] },
    // the far side: out and up past the mount as it trains to port, out over the port bridge wing and aft along the
    // port side for the look aft at the hangar; then out to the port beam for the ship broadside, and home
    { t0: 123.6, t1: 155.2, keys: () => [
      sightKey(123.6),
      sightKey(125.0, 1.6, .95, .45, 40),
      lookKey(127.2, [-3.8, 15.4, 32.0], MC, 44),
      lookKey(129.6, [-8.5, 18.5, 36.0], MC, 44),
      lookKey(131.6, [-17.0, 23.5, 29.0], [-4, 13, -10], 46),
      lookKey(133.8, [-14.0, 21.0, 6.0], [-7, 10, -44], 48),
      lookKey(136.0, [-13.6, 20.2, -1.0], [-8, 9.5, -46], 50),
      lookKey(141.6, [-13.8, 20.4, -3.0], [-8.5, 9.5, -47], 50),
      lookKey(144.6, [-20.0, 22.5, 6.0], [-2, 15, 22], 46),
      lookKey(147.4, [-12.5, 21.0, 26.5], [0, 13, 35], 44),
      lookKey(149.6, [-4.2, 16.6, 28.2], [2, 11.5, 45], 44),
      lookKey(151.8, [-2.4, 14.8, 30.6], [1, 12.6, 42], 40),
      sightKey(153.8, 1.5, .9, .45, 38),
      sightKey(155.2),
    ] },
  ];
  /* cubic Hermite through the keys (tangents from the neighbours over their time span, zero at the ends) */
  function mkPath(keys) {
    const n = keys.length;
    for (let i = 1; i < n; i++) { while (keys[i].yaw - keys[i - 1].yaw > 180) keys[i].yaw -= 360; while (keys[i].yaw - keys[i - 1].yaw < -180) keys[i].yaw += 360; }
    const F = ['e0', 'e1', 'e2', 'yaw', 'pit', 'ln', 'roll'];
    const K = keys.map(k => ({ t: k.t, e0: k.e[0], e1: k.e[1], e2: k.e[2], yaw: k.yaw, pit: k.pit, ln: lnFL(k.fov), roll: k.roll || 0 }));
    const Tg = K.map((k, i) => { const o = {}; for (const f of F) o[f] = (i === 0 || i === n - 1) ? 0 : (K[i + 1][f] - K[i - 1][f]) / (K[i + 1].t - K[i - 1].t); return o; });
    return t => {
      t = E.clamp(t, K[0].t, K[n - 1].t);
      let i = 0; while (i < n - 2 && K[i + 1].t <= t) i++;
      const a = K[i], b = K[i + 1], dt = b.t - a.t, u = (t - a.t) / dt, u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      const o = {};
      for (const f of F) o[f] = a[f] * h00 + Tg[i][f] * dt * h10 + b[f] * h01 + Tg[i + 1][f] * dt * h11;
      return o;
    };
  }
  for (const fl of FLIGHTS) { fl.keysV = fl.keys(); fl.path = mkPath(fl.keysV); }
  const flightAt = T => { for (const fl of FLIGHTS) if (T >= fl.t0 && T < fl.t1) return fl; return null; };
  /* how far the sight is zoomed out for a flight (0 NFOV state .. 1 WFOV) */
  function wideK(T) {
    let k = 0;
    for (const fl of FLIGHTS) { k = Math.max(k, E.inOut(sat((T - (fl.t0 - ZO)) / ZO)) * (T < fl.t0 + 1 ? 1 : 0), T >= fl.t1 ? 1 - E.inOut(sat((T - fl.t1) / ZI)) : 0); }
    return k;
  }
  PF.wideK = wideK;
  const upYP = (yaw, pit, roll) => {
    const f = dirYP(yaw, pit), r = V.norm(V.cross([0, 1, 0], f)), u = V.cross(f, r), c = Math.cos(roll * DEG), s = Math.sin(roll * DEG);
    return [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s];
  };
  /* the camera at T -> {eye, f, up, ln (log focal px), sight (bool), fl (flight or null)} */
  /* debug: ?ce=x,y,z&ca=x,y,z&cf=fov (ship coordinates) holds the camera there */
  const DBGCAM = STAGE.Q.has('ce') ? { e: STAGE.Q.get('ce').split(',').map(Number), a: STAGE.Q.get('ca').split(',').map(Number), fov: +(STAGE.Q.get('cf') || 40) } : null;
  function camAt(T) {
    if (DBGCAM) { const Xs = PF.shipX(T), d = V.norm(V.sub(DBGCAM.a, DBGCAM.e)), [y, p] = ypOf(d); return { eye: X.ap(Xs, DBGCAM.e), f: X.dir(Xs, d), up: X.dir(Xs, upYP(y, p, 0)), ln: lnFL(DBGCAM.fov), sight: false, fl: { t0: -99, t1: 999 } }; }
    const fl = flightAt(T);
    if (!fl) {
      const f = PF.flir(T), ln = mix(zoomSight(T), FL_W, wideK(T));
      return { eye: f.eye, f: f.f, up: f.up, ln, sight: true, fl: null };
    }
    const k = fl.path(T), Xs = PF.shipX(T);
    return { eye: X.ap(Xs, [k.e0, k.e1, k.e2]), f: X.dir(Xs, dirYP(k.yaw, k.pit)), up: X.dir(Xs, upYP(k.yaw, k.pit, k.roll)), ln: k.ln, sight: false, fl };
  }
  PF.camAt = camAt;
  /* where the ship is sharp (distance fade about the forward mount), per flight */
  /* [T, r0, r1, floor]: tight on the mount by default, opened up for the overview and the look aft */
  const FOCUS = [[0, 1.7, 8.5, .14], [60.6, 1.7, 8.5, .14], [62.4, 9, 60, .34], [65.4, 9, 60, .34], [67.2, 1.7, 8.5, .14],
    [130.2, 1.7, 8.5, .14], [132.6, 70, 190, .75], [147.4, 70, 190, .75], [149.0, 1.7, 8.5, .14], [D, 1.7, 8.5, .14]];
  function focusAt(T, C) {
    let i = 0; while (i < FOCUS.length - 2 && FOCUS[i + 1][0] <= T) i++;
    const a = FOCUS[i], b = FOCUS[i + 1], u = E.inOut(sat((T - a[0]) / (b[0] - a[0])));
    const p = X.ap(PF.shipX(T), V.add(PF.pivotShip(0), [0, .3, 0]));
    // only while the mount is what the lens is on: near it and near the middle of the frame
    const d = V.sub(p, C.eye), L = V.len(d), on = ss(.72, .9, V.dot(d, C.f) / L) * (1 - ss(16, 30, L));
    return { p, r0: mix(40, mix(a[1], b[1], u), on), r1: mix(200, mix(a[2], b[2], u), on), floor: mix(1, mix(a[3], b[3], u), on) };
  }
  /* the sight symbology's strength: full in the sight, gone once the eye leaves the window */
  function hudK(T) {
    const fl = flightAt(T);
    for (const f of FLIGHTS) {
      if (T >= f.t0 - 1 && T < f.t0 + .9) return 1 - ss(f.t0 - .1, f.t0 + .7, T);
      if (T >= f.t1 - .9 && T < f.t1 + 1) return ss(f.t1 - .7, f.t1 + .1, T);
    }
    return fl ? 0 : 1;
  }

  /* ---------- tags (DOM chips on the overlay) ---------- */
  const TAGS = new Map();
  function putTags(tags) {
    for (const t of TAGS.values()) t.used = false;
    tags.sort((a, b) => (b.pri || 0) - (a.pri || 0));
    const placed = [];
    for (const tg of tags) {
      let t = TAGS.get(tg.key);
      if (!t) { const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = '<b></b><i></i><span class="v"></span>'; uiEl.insertBefore(el, menuEl); t = { el, txt: '' }; TAGS.set(tg.key, t); }
      t.used = true;
      const txt = tg.cls + '|' + tg.a + '|' + tg.b + '|' + (tg.v || '');
      if (t.txt !== txt) { t.txt = txt; t.el.className = 'tag ' + tg.cls; t.el.children[0].textContent = tg.a; t.el.children[1].textContent = tg.b; t.el.children[2].textContent = tg.v || ''; t.el.children[2].style.display = tg.v ? '' : 'none'; }
      const w = t.el.offsetWidth || 180;
      let x = E.clamp(tg.x, 90, 1830 - w), y = E.clamp(tg.y, 150, 800);
      for (let g = 0; g < 10; g++) { const hit = placed.find(p => x < p.x + p.w + 6 && p.x < x + w + 6 && Math.abs(y - p.y) < 24); if (!hit) break; y = hit.y + 25; }
      placed.push({ x, y, w });
      t.el.style.opacity = tg.al.toFixed(2);
      t.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
      if (tg.lead) { octx.strokeStyle = 'rgba(238,238,228,.6)'; octx.setLineDash([2, 3]); octx.globalAlpha = tg.al; octx.beginPath(); octx.moveTo(tg.lead[0], tg.lead[1]); octx.lineTo(x, y + 10); octx.stroke(); octx.setLineDash([]); octx.globalAlpha = 1; }
    }
    for (const t of TAGS.values()) if (!t.used) t.el.style.opacity = 0;
  }

  /* ---------- overlay helpers ---------- */
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
  function dotted(ctx, x0, y0, x1, y1, col, a, gap) {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.floor(L / (gap || 5)));
    ctx.fillStyle = rgba(col, a);
    for (let i = 0; i <= n; i++) { const t = i / n; ctx.fillRect(Math.round(x0 + (x1 - x0) * t) - .5, Math.round(y0 + (y1 - y0) * t) - .5, 1.5, 1.5); }
  }
  function dotBox(ctx, x0, y0, x1, y1, col, a, gap) { dotted(ctx, x0, y0, x1, y0, col, a, gap); dotted(ctx, x1, y0, x1, y1, col, a, gap); dotted(ctx, x1, y1, x0, y1, col, a, gap); dotted(ctx, x0, y1, x0, y0, col, a, gap); }
  function corners(ctx, x0, y0, x1, y1, len, col, a, lw) {
    const c = Math.min(len, (x1 - x0) * .45, (y1 - y0) * .45);
    ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw || 1.5; ctx.beginPath();
    for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { ctx.moveTo(px + sx * c, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * c); }
    ctx.stroke(); ctx.lineWidth = 1;
  }
  const MONO = '"Geist Mono", Consolas, monospace';
  function txt(ctx, s, x, y, col, a, align, size) { ctx.font = `500 ${size || 11}px ${MONO}`; ctx.textAlign = align || 'left'; ctx.fillStyle = rgba(col, a); ctx.fillText(s, x, y); }

  /* ---------- the sight's symbology ---------- */
  const FR = { x0: 262, y0: 150, x1: 1658, y1: 790 };
  const pad3 = n => String(Math.round(n)).padStart(3, '0');
  function drawSight(T, k, info) {
    if (k <= .01) return;
    const ctx = octx, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1];
    // frame corners of the imager
    corners(ctx, FR.x0, FR.y0, FR.x1, FR.y1, 34, WH, .5 * k, 1.2);
    // reticle: four ticks round a gap, a lime pip, the burst circle dotted
    ctx.strokeStyle = rgba(WH, .85 * k); ctx.lineWidth = 1.5; ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(cx + dx * 16, cy + dy * 16); ctx.lineTo(cx + dx * 44, cy + dy * 44); }
    ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = rgba(LIME, k); ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    ctx.fillStyle = rgba(WH, .5 * k);
    for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; ctx.fillRect(cx + Math.cos(a) * 72 - .75, cy + Math.sin(a) * 72 - .75, 1.5, 1.5); }
    // train tape along the top edge (relative bearing, 11 px per degree)
    const trn = info.yaw / DEG, tx = 960, ty = FR.y0 + 2, PPD = 11, span = 24;
    ctx.fillStyle = rgba(WH, .55 * k);
    for (let d = Math.ceil(trn - span); d <= Math.floor(trn + span); d++) {
      const x = tx + (d - trn) * PPD, edge = 1 - ss(span - 6, span, Math.abs(d - trn)), long = d % 5 === 0;
      ctx.fillStyle = rgba(WH, (long ? .6 : .32) * k * edge); ctx.fillRect(Math.round(x), ty + 14, 1, long ? 9 : 5);
      if (d % 10 === 0) txt(ctx, pad3(((d % 360) + 360) % 360), x, ty + 38, WH, .55 * k * edge, 'center', 10.5);
    }
    ctx.fillStyle = rgba(LIME, k); ctx.beginPath(); ctx.moveTo(tx, ty + 12); ctx.lineTo(tx - 5, ty + 5); ctx.lineTo(tx + 5, ty + 5); ctx.fill();
    txt(ctx, 'TRN ' + (((trn % 360) + 360) % 360).toFixed(1).padStart(5, '0') + '°', tx, ty, WH, .9 * k, 'center', 11.5);
    // elevation ladder on the left edge (10 px per degree)
    const elv = info.pitch / DEG, lx = FR.x0 + 2;
    for (let d = Math.ceil(elv - 14); d <= Math.floor(elv + 14); d++) {
      const y = cy - (d - elv) * 10, edge = 1 - ss(9, 14, Math.abs(d - elv)), long = d % 5 === 0;
      ctx.fillStyle = rgba(WH, (long ? .6 : .3) * k * edge); ctx.fillRect(lx + 14, Math.round(y), long ? 9 : 5, 1);
      if (long) txt(ctx, (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d), lx + 30, y + 4, WH, .5 * k * edge, 'left', 10.5);
    }
    ctx.fillStyle = rgba(LIME, k); ctx.beginPath(); ctx.moveTo(lx + 12, cy); ctx.lineTo(lx + 5, cy - 5); ctx.lineTo(lx + 5, cy + 5); ctx.fill();
    // readouts, lower right inside the frame
    const rx = FR.x1 - 6; let ry = FR.y1 - 92;
    for (const [l, v, c] of info.lines) { txt(ctx, l, rx - 118, ry, WH, .5 * k, 'left', 11); txt(ctx, v, rx, ry, c || WH, .92 * k, 'right', 11.5); ry += 19; }
    // mode, lower left
    txt(ctx, info.mode, FR.x0 + 8, FR.y1 - 16, info.modeC || WH, .92 * k, 'left', 12);
    txt(ctx, 'FLIR · WH', FR.x0 + 8, FR.y1 - 36, WH, .45 * k, 'left', 10.5);
  }

  /* ---------- captions + stat ---------- */
  const KICKS = [
    [0, 'Mk 15 Phalanx 1B / Gun camera · search'],
    [7.4, 'TRK 01 / Single round · Mach 2'],
    [24.6, 'Mk 15 Phalanx 1B / M61A1 20 mm · forward mount'],
    [42.4, 'TRK 02 · TRK 03 / A pair'],
    [57, 'Mk 15 Phalanx 1B / Training to port'],
    [79.4, 'TRK 04 / Sea-skimmer · 3 m'],
    [90.2, 'Mk 15 Phalanx 1B / Barrels spinning down'],
    [107.6, 'TRK 05 / Weaving'],
    [127.8, 'TRK 06 / Port quarter · the far side'],
    [150, 'Mk 15 Phalanx 1B / Gun camera · search'],
  ];
  const kickEl = $('kickt'), rpmEl = $('rpm'), rbarEl = $('rbar');
  let lastKick = '', lastRpm = '';

  /* ---------- render ---------- */
  // debug: ?off=sea,sky,ship,tags leaves layers out
  const OFF = {}; for (const k of (STAGE.Q.get('off') || '').split(',')) if (k) OFF[k] = 1;
  const info = {};
  const PROF = {}; let pt0 = 0;
  const tick = k => { const n = performance.now(); PROF[k] = +((PROF[k] || 0) * .9 + (n - pt0) * .1).toFixed(2); pt0 = n; };
  const BOXES = [];
  function render(T) {
    pt0 = performance.now();
    const C = camAt(T);
    cam.eye = C.eye; cam.target = V.add(C.eye, C.f); cam.up = C.up; cam.roll = 0;
    const FLc = Math.exp(C.ln);
    cam.fov = 2 * Math.atan(540 / FLc);
    cam.cx = 960; cam.cy = CY0;
    // the mount shakes the lens while its own gun fires; a jolt when TRK 06 hits
    const fire = PF.firing(T, 0), hitA = T > PF.T_HIT && T < PF.T_HIT + 2.5 ? 7 * Math.exp(-(T - PF.T_HIT) * 2.2) : 0;
    const shk = (fire && C.sight ? 1.6 : 0) + hitA + PF.shakeFx(T);
    cam.shake = shk > 0 ? FILM.shake(T, shk, 23) : [0, 0];
    cam.update();
    pb.clear();
    DW.sync(cam, pb);
    const fovD = cam.fov / DEG;
    const DBG = window.__dbg || OFF;
    if (!DBG.sky) DW.drawSky(T, 1);
    tick('sky');
    // the sight's own sea (a lattice about the mount) hands over to the world lattice as the eye leaves the window
    const kA = C.sight ? 1 : 1 - ss(.3, 2.0, V.dist(C.eye, PF.flir(T).eye));
    if (!DBG.sea) { DW.drawSea(T, kA, 7); DW.drawSeaW(T, 1 - kA, 7.5); }
    tick('sea');
    const st = PF.shipState(T);
    // out of the sight the mount is the subject: the rest of the ship dims with distance from it
    const foc = C.sight ? null : focusAt(T, C);
    if (!DBG.ship) DW.drawShip(T, 1, st, foc);
    if (!DBG.wake) DW.drawWake(T, 1);
    tick('ship');
    // rounds
    BOXES.length = 0;
    for (let k = 0; k < PF.ROUNDS.length; k++) {
      const r = PF.ROUNDS[k];
      if (T < r.t0 || T > r.tStop + .2) continue;
      PF.round(k, T, RO);
      // stage A: the round simply fades where stage B will stop it
      const a = RO.a * (1 - sat((T - r.tStop + .06) / .06));
      if (a <= .01) continue;
      if (r.low) DW.drawSkim(k, T, a);
      const bb = DW.drawRound(k, T, RO, a);
      if (bb) BOXES.push({ k, x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1, a, range: RO.range, p: RO.p.slice() });
    }
    tick('rounds');
    const ctxB = { cam, pb, DW, sightK: C.sight ? 1 : 0, fov: cam.fov, st, boxes: BOXES };
    PF.tracerFx(T, ctxB); PF.burstFx(T, ctxB); PF.hitFx(T, ctxB);
    tick('fx');
    pb.blit();
    tick('blit');

    // ---------- overlay ----------
    octx.clearRect(0, 0, 1920, 1080);
    const tags = [];
    if (!FILM.uiHidden) {
      const g = octx.createLinearGradient(0, 1080, 0, 760); g.addColorStop(0, 'rgba(11,12,10,.86)'); g.addColorStop(.55, 'rgba(11,12,10,.5)'); g.addColorStop(1, 'rgba(11,12,10,0)');
      octx.fillStyle = g; octx.fillRect(0, 760, 1920, 320);
    }
    const hk = hudK(T), m = PF.mountF(T), aimS = m.aim.state;
    // which round the gun is on
    const engaged = aimS.kind === 'track' || aimS.kind === 'hold' ? aimS.k : -1;
    // boxes on the rounds' true bounds + tags
    for (const b of BOXES) {
      const r = PF.ROUNDS[b.k], on = b.k === engaged && aimS.kind === 'track';
      const acq = on ? sat((T - aimS.t) / .5) : 1, snap = on ? 1 + 2.2 * (1 - E.outCubic(acq)) : 1;
      const cxb = (b.x0 + b.x1) / 2, cyb = (b.y0 + b.y1) / 2, hw = Math.max(7, (b.x1 - b.x0) / 2 + 4) * snap, hh = Math.max(7, (b.y1 - b.y0) / 2 + 4) * snap;
      const x0 = cxb - hw, x1 = cxb + hw, y0 = cyb - hh, y1 = cyb + hh, al = b.a * (on ? 1 : .8);
      if (x1 < 0 || x0 > 1920 || y1 < 0 || y0 > 1080) continue;
      const boxK = r.hit ? ss(134.6, 135.4, T) : hk;
      if (boxK < .02) continue;
      dotBox(octx, x0, y0, x1, y1, on ? LIME : WH, al * boxK * (on ? .95 : .6), 4);
      if (on) corners(octx, x0 - 3, y0 - 3, x1 + 3, y1 + 3, 9, LIME, al * boxK, 1.5);
      const rng = b.range < 1000 ? Math.round(b.range) + ' m' : (b.range / 1000).toFixed(2) + ' km';
      const tagK = r.hit ? ss(134.6, 135.4, T) : hk * (on || b.range < 9000 ? 1 : 0);
      if (tagK > .02) tags.push({ key: 'r' + b.k, cls: 'coral sm', a: r.id, b: r.low ? 'Oniks · 3 m' : 'Oniks · 680 m/s', v: rng, x: x1 + 14, y: y0 - 30, al: al * tagK, pri: on ? 5 : 3, lead: [x1 + 2, y0 - 2] });
      // lag line: from the reticle to the round the gun is on
      if (on && C.sight && hk > .1) {
        const cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1], L = Math.hypot(cxb - cx, cyb - cy);
        if (L > 14) dotted(octx, cx, cy, cxb, cyb, LIME, .85 * hk * acq, 5);
      }
    }
    // the sight
    let mode = 'SEARCH', modeC = WH, lines = [];
    const fireF = PF.firing(T, 0);
    if (engaged >= 0) {
      PF.round(engaged, aimS.kind === 'hold' ? PF.ROUNDS[engaged].tStop - 1e-3 : T, RO);
      mode = fireF ? 'ENGAGE · ' + PF.ROUNDS[engaged].id : aimS.kind === 'hold' ? 'CEASE · ' + PF.ROUNDS[engaged].id : 'TRACK · ' + PF.ROUNDS[engaged].id;
      modeC = fireF ? CORAL : LIME;
      lines = [['RNG', RO.range < 1000 ? Math.round(RO.range) + ' M' : (RO.range / 1000).toFixed(2) + ' KM'], ['VEL', (aimS.kind === 'hold' ? 0 : PF.VM) + ' M/S'], ['FOV', fovD.toFixed(2) + '°']];
    } else lines = [['RNG', '—'], ['VEL', '—'], ['FOV', fovD.toFixed(2) + '°']];
    if (aimS.kind === 'park') mode = 'STOW · TRAINING';
    drawSight(T, hk, { yaw: m.yaw, pitch: m.pitch, lines, mode, modeC });
    // the mount itself, seen from outside: a box on its true bounds
    if (!C.sight && hk < .5) {
      const Xs = PF.shipX(T);
      DW.bbReset();
      // bounds from a coarse, invisible pass is overkill: project the mount's dots at the coarsest level into a scratch run
      const mb = mountBounds(Xs, 0, m);
      const vis = mb && mb.x1 - mb.x0 > 30 && mb.x1 - mb.x0 < 1500 && mb.x0 > -40 && mb.x1 < 1960 && mb.y0 > -40 && (mb.x0 + mb.x1) / 2 > 160 && (mb.x0 + mb.x1) / 2 < 1760 && (mb.y0 + mb.y1) / 2 < 900;
      if (vis) {
        const al = (1 - hk * 2) * sat((T - C.fl.t0 - 2.2) / .6) * sat((C.fl.t1 - 2.4 - T) / .6) * (T > 131 && T < 147 ? 0 : 1);
        if (al > .02) {
          dotBox(octx, mb.x0 - 6, mb.y0 - 6, mb.x1 + 6, mb.y1 + 6, WH, .55 * al, 4);
          corners(octx, mb.x0 - 9, mb.y0 - 9, mb.x1 + 9, mb.y1 + 9, 12, LIME, .9 * al, 1.5);
          const rpm = Math.round(m.omega * 60 / TAU);
          tags.push({ key: 'mnt', cls: 'lime', a: 'CIWS 1', b: 'Mk 15 Phalanx 1B · 20 mm', v: rpm > 5 ? rpm + ' rpm' : 'train ' + pad3(((m.yaw / DEG) % 360 + 360) % 360) + '°', x: mb.x1 + 22, y: mb.y0 - 36, al, pri: 4, lead: [mb.x1 + 9, mb.y0 - 9] });
        }
      }
      // aft mount on the far side
      if (T > 131 && T < 147) {
        const ma = PF.mountA(T), ab = mountBounds(Xs, 1, ma);
        const al = ss(132.5, 133.5, T) * (1 - ss(145, 146.5, T));
        if (ab && al > .02 && ab.x1 - ab.x0 > 4 && (ab.x0 + ab.x1) / 2 > 60 && (ab.x0 + ab.x1) / 2 < 1860 && ab.y1 > 0 && ab.y0 < 1080) {
          corners(octx, ab.x0 - 6, ab.y0 - 6, ab.x1 + 6, ab.y1 + 6, 8, LIME, .9 * al, 1.5);
          const rpm = Math.round(ma.omega * 60 / TAU);
          tags.push({ key: 'mntA', cls: 'lime sm', a: 'CIWS 2', b: 'aft · hangar roof', v: rpm > 5 ? rpm + ' rpm' : 'train ' + pad3(((ma.yaw / DEG) % 360 + 360) % 360) + '°', x: ab.x1 + 16, y: ab.y0 - 32, al, pri: 4, lead: [ab.x1 + 6, ab.y0 - 6] });
        }
      }
    }
    PF.overlayFx(T, octx, tags, ctxB);
    if (!DBG.tags) putTags(tags);
    // caption + stat
    let kk = KICKS[0][1]; for (const [t, k] of KICKS) if (T >= t) kk = k;
    if (kk !== lastKick) { lastKick = kk; kickEl.textContent = kk; }
    const rpm = Math.round(m.omega * 60 / TAU), rs = String(rpm);
    if (rs !== lastRpm) { lastRpm = rs; rpmEl.textContent = rs; rbarEl.style.width = (Math.round(rpm / 750 * 16) * 6) + 'px'; }
    tick('ui');
    STAGE.dbg = { T: +T.toFixed(2), fov: +fovD.toFixed(2), sight: C.sight, sea: DW.seaN(), seaW: DW.seaWN(), pts: DW.npts(), prof: PROF };
  }
  /* screen bounds of mount i (train + elevating + barrels) from its coarsest cloud's points */
  const MB_P = [0, 0, 0];
  function mountBounds(Xs, i, m) {
    const Xm = DW.mountXf(Xs, i, m), clouds = [DW.MNT.base, DW.MNT.elev, DW.MNT.bar];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    for (let c = 0; c < 3; c++) {
      const cl = clouds[c], P = cl.lv[cl.nl - 2], Tm = Xm[c];
      for (let j = 0; j < P.length; j += 6) {
        const w = X.ap(Tm, [P[j], P[j + 1], P[j + 2]]);
        const p = cam.project(w); if (!p) continue;
        if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; n++;
      }
    }
    return n ? { x0, y0, x1, y1 } : null;
  }

  /* ---------- sound ---------- */
  const cues = [];
  const cue = (t, fn) => cues.push([t, fn]);
  for (const s of PF.AIMS) {
    if (s.kind === 'track') cue(s.t, () => { SFX.tone(1480, 1480, .05, 'square', .014); SFX.tone(1980, 1980, .07, 'square', .012, .07); });
    if (s.kind === 'park') cue(s.t, () => { SFX.tone(140, 260, Math.max(.6, s.b * .8), 'sawtooth', .012); SFX.noise(Math.max(.6, s.b * .8), 900, .6, .02, .2); });
  }
  for (const fl of FLIGHTS) {
    cue(fl.t0 - ZO, () => SFX.tone(900, 520, .35, 'sine', .018));
    cue(fl.t1, () => { SFX.tone(520, 900, .3, 'sine', .018); SFX.tone(1500, 1500, .03, 'square', .01, .3); });
  }
  cue(127.8, () => { for (let i = 0; i < 4; i++) SFX.tone(1250, 1250, .09, 'square', .018, i * .18); });
  for (let t = 1.5; t < D; t += 3.2) cue(t, () => SFX.tone(2200, 2200, .012, 'square', .005));
  for (const c of PF.fxCues || []) cues.push(c);

  FILM.run({
    duration: D,
    chapters: [
      { t: 0, title: 'Search' }, { t: 7.4, title: 'Single' }, { t: 24.6, title: 'Mount' }, { t: 42.4, title: 'Pair' },
      { t: 57, title: 'Low' }, { t: 90.2, title: 'Weave' }, { t: 123.6, title: 'Far side' }, { t: 150, title: 'Home' },
    ],
    cues,
    render,
  });
  STAGE.PF = { cam, camAt, FLIGHTS, wideK, hudK, PROF, BOXES };
})();
