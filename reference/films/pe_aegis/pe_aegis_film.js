/* AEGIS (Point Cloud, defence P2) · the film. One take through the ship's own radar picture: from one SPY-1D face,
   out over the ship into the 360° scope (clutter, the group, the aircraft), the raid condensing out of uncertainty
   on the horizon and closing, the interceptors leaving the ship, the Phalanx for the last one, the climb for the
   whole picture and the dive back onto the array face. render(T) is a pure function of film time T. */
(() => {
  'use strict';
  const { V, R, X, E, Cam } = M3;
  const { D, DEG, TAU, LIME, WH, CORAL } = PE;
  const DW = PE.DW, win = PE.win, lerpK = PE.lerpK, pol = PE.pol;
  STAGE.fit();
  const SFX = STAGE.SFX; SFX.kind = 'pc';

  /* ---------- menu ---------- */
  const menuEl = document.getElementById('menu');
  menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
  const veil = document.getElementById('veil');
  STAGE.menu({ el: menuEl, blurb: document.getElementById('blurb'),
    onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });
  const MENU_BOX = [70, 560, 600, 960];

  /* ---------- canvases ---------- */
  const cv = document.getElementById('c'), ov = document.getElementById('o'), octx = ov.getContext('2d');
  const pb = new PointBuf(cv, [11, 12, 10], { vignette: .5 });
  const cam = new Cam(); cam.near = .3;
  const uiEl = document.getElementById('ui');

  /* ---------- camera: one take, keyed in the own ship's frame ---------- */
  const F0 = PE.FACE0, C0 = F0.c;
  const faceDir = (az, el) => { const b = F0.brg + az * DEG, e = el * DEG; return [Math.sin(b) * Math.cos(e), Math.sin(e), Math.cos(b) * Math.cos(e)]; };
  const K = [];
  const key = (t, eye, target, fov) => K.push({ t, eye, target, fov });
  /* a key on the face's line of sight: distance d, swung az (deg, + clockwise) and raised el (deg) off its normal */
  const fk = (t, d, az, el, fov, tgt) => key(t, V.mad(C0, faceDir(az, el), d), tgt || C0, fov);
  /* a key round the ship: bearing, horizontal distance, altitude */
  const sk = (t, brg, dist, alt, tgt, fov) => key(t, V.add(pol(brg, dist), [0, alt, 0]), tgt, fov);
  const AX = 58.5;                                   // the threat axis
  /* a key round the ship looking along a bearing (deg) and down a depression (deg) */
  const sv = (t, brg, dist, alt, look, dep, fov) => { const e = V.add(pol(brg, dist), [0, alt, 0]), l = look * DEG, d = dep * DEG; key(t, e, V.add(e, [Math.sin(l) * Math.cos(d) * 1000, -Math.sin(d) * 1000, Math.cos(l) * Math.cos(d) * 1000]), fov); };
  const ax = (r, y) => pol(AX, r, y || 0);
  /* the close-up: the array face, a little off its normal (the loop starts and ends here) */
  fk(0, 7.4, -17, 2, 42, V.mad(C0, F0.h, -.3));
  fk(4.6, 7.9, -13, 3, 42, V.mad(C0, F0.h, -.25));
  fk(8.6, 9.2, -7, 5, 42, V.mad(C0, F0.h, -.1));
  /* the pull-out: back along the face's line of sight, the ship coming into frame, then up into the scope;
     distance grows ~2.5x per key so the spline cannot overshoot */
  fk(11.4, 15, 3, 8, 42, C0);
  fk(13.9, 37, 13, 11, 42, [3, 13, 20]);
  fk(16.4, 92, 26, 14, 42, [0, 12, 8]);
  fk(19.0, 230, 42, 17, 42, [0, 10, 0]);
  fk(22.0, 580, 60, 21, 41, [0, 0, -40]);
  fk(25.6, 1450, 80, 26, 40, [0, 0, -300]);
  sk(30, 112, 4200, 2900, pol(250, 2600), 40);
  /* the picture: out and up round the south until the whole scope is in frame */
  sk(35, 130, 9500, 5200, pol(320, 3000), 40);
  sk(41, 165, 21000, 9500, pol(340, 3000), 40);
  sk(47, 205, 34000, 13500, pol(20, 2000), 40);
  /* the raid: down behind the ship onto the threat axis; a long lens holds the ship's silhouette under the
     horizon where the raid condenses */
  sv(52.5, 226, 15000, 5200, AX - 3, 12, 34);
  sv(55.5, 236, 7800, 1500, AX - 1, 4.2, 22);
  sv(58.5, 238.5, 4600, 300, AX, 2.3, 15);
  sv(61.5, 238.5, 4200, 260, AX, 2.3, 16);
  /* the launches and the far kills: off the port quarter, low, the arcs rising from the ship and falling away to
     the right onto the raid at the horizon */
  sv(64.5, 205, 2200, 300, 33, 3, 40);
  sv(70, 202, 1900, 260, 34, 2.5, 40);
  sv(76, 200, 1700, 220, 34, 2.2, 40);
  sv(81, 205, 1300, 170, 36, 2, 40);
  sv(86, 212, 800, 90, 42, 1.5, 40);
  /* the close-in: low off the port quarter, closing on the aft Phalanx (the forward mount is hidden behind the SPY
     deckhouse from this side) as it takes the last round; the ship left of centre, the round in from the right */
  // (kept > ~215 m off the keel: any closer and the ship switches to its fine sampling, ~2.5 ms more a frame)
  sk(91, 215, 380, 36, ax(1500, 15), 40);
  sv(95.5, 210, 305, 27, 46, 1.9, 40);
  sv(99, 206, 292, 25, 43, 2.1, 40);
  sv(101.8, 207, 296, 26, 44, 2.1, 40);
  sk(104.5, 214, 340, 42, ax(700, 25), 40);
  /* the whole picture: up and back behind the ship along the threat axis until the fight lies below: the ship,
     the arcs, the kills, the raid's trails back to the horizon */
  sv(108.5, 214, 700, 300, 50, 10, 40);
  sv(113.5, 225, 2400, 1600, 54, 19, 40);
  sv(120, 232, 5500, 4200, 57, 21, 40);
  sv(127, 236, 9000, 7500, 58, 25, 40);
  sv(133, 238.5, 12000, 10000, 58.5, 26.6, 40);
  /* the dive: over the top and round to the north-east, down onto the starboard-forward face */
  sk(138.5, 300, 9000, 7000, [0, 0, 400], 40);
  sk(142, 10, 3800, 2600, [0, 0, 150], 40);
  fk(144, 1500, 36, 30, 40, [0, 0, 60]);
  fk(147.4, 600, 22, 24, 41, [0, 8, 20]);
  fk(150.6, 230, 8, 19, 42, [2, 11, 24]);
  fk(153.4, 88, -4, 14, 42, [4, 13, 26]);
  fk(156, 34, -12, 9, 42, C0);
  fk(158.6, 14, -17, 5, 42, V.mad(C0, F0.h, -.2));
  fk(161.6, 8.6, -18, 3, 42, V.mad(C0, F0.h, -.28));
  key(D, K[0].eye.slice(), K[0].target.slice(), K[0].fov);
  // keys carry a direction, not a point: every target the same distance ahead of its eye, so the spline blends
  // view directions and never swings early towards a far target
  for (const k of K) k.target = V.mad(k.eye, V.norm(V.sub(k.target, k.eye)), 600);
  const path = FILM.path(K, { loop: true });
  /* projection centre: the action sits right of the menu */
  const CXY = [[0, 1110, 520], [9, 1110, 520], [20, 1080, 540], [48, 1060, 560], [54, 1080, 540], [57, 1150, 560], [62, 1150, 560], [66, 1080, 540], [83, 1100, 540], [89, 1290, 530], [104, 1290, 530], [112, 1100, 540], [134, 1100, 540], [150, 1090, 530], [158, 1110, 520], [D, 1110, 520]];
  const cxcy = T => { let i = 0; while (i < CXY.length - 2 && CXY[i + 1][0] <= T) i++; const a = CXY[i], b = CXY[i + 1], u = E.ss(a[0], b[0], T); return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; };
  function camAt(T) {
    const p = path(T);
    let eye = p.eye;
    const dir = V.norm(V.sub(p.target, p.eye));
    // a hand on the camera when it is low and close
    const dk = win(T, 84, 88, 104, 108) * 1.2, dr = FILM.drift(T, 1, 5);
    eye = [eye[0] + dr[0] * dk, eye[1] + dr[1] * dk * .5, eye[2] + dr[2] * dk];
    if (eye[1] < 3) eye = [eye[0], 3, eye[2]];
    cam.eye = eye; cam.target = V.add(eye, V.mul(dir, 100)); cam.fov = E.clamp(p.fov, 4 * DEG, 80 * DEG); cam.roll = 0;
    const c = cxcy(T); cam.cx = c[0]; cam.cy = c[1];
    cam.near = eye[1] > 3000 ? 5 : eye[1] > 400 ? 1 : .12;
    // the last round bursts ~600 m off the lens: a short jolt
    const jk = T > PE.T_CIWS && T < PE.T_CIWS + 1.6 ? 3.2 * Math.exp(-(T - PE.T_CIWS) * 3.2) : 0;
    cam.shake = jk > .05 ? FILM.shake(T, jk, 16) : [0, 0];
    cam.update();
  }

  /* ---------- layer envelopes ---------- */
  function scopeParams(T) {
    const alt = cam.eye[1];
    return {
      a: win(T, 10.5, 21, 149, 155.5),
      hk: E.clamp(alt * .0026 + .5, .7, 42), big: 26000,
      sea: 1, map: 1, fine: E.ss(8000, 2500, alt), beam: 1, ships: 1,
      tracks: win(T, 21, 27, 147, 153), air: 1, raid: 1, shots: 1 - .5 * win(T, 87, 91, 103, 108), keep: 1 - E.ss(134, 147, T),
      near: cam.near * 4, tagA: 1, heloTrack: E.ss(1400, 2600, V.len(cam.eye)) > .5 ? 1 : 0,
    };
  }

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
      const w = t.el.offsetWidth || 150;
      const offAnchor = qq.ax !== undefined && (qq.ax < 4 || qq.ax > 1916 || qq.ay < 4 || qq.ay > 1076);
      let x = Math.min(Math.max(8, qq.x), 1912 - w), y = qq.y;
      for (let g = 0; g < 10; g++) { const hit = placed.find(p => x < p.x + p.w + 6 && p.x < x + w + 6 && Math.abs(y - p.y) < 24); if (!hit) break; y = hit.y + (qq.down ? 25 : -25); }
      const inMenu = x < MENU_BOX[2] && x + w > MENU_BOX[0] && y + 20 > MENU_BOX[1] && y < MENU_BOX[3];
      if (offAnchor || inMenu || qq.a <= .02 || y < 150 || y > 1040) { t.used = false; continue; }
      placed.push({ x, y, w });
      t.used = true;
      const cls = 'tag' + (qq.cls ? ' ' + qq.cls : '');
      if (t.cls !== cls) { t.cls = cls; t.el.className = cls; }
      t.el.style.opacity = Math.min(1, qq.a).toFixed(2);
      t.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
      if (qq.ax !== undefined && qq.lead !== false && !FILM.uiHidden) {
        octx.strokeStyle = qq.leadCol || 'rgba(238,238,228,.7)'; octx.globalAlpha = Math.min(1, qq.a) * .8; octx.lineWidth = 1; octx.setLineDash([1, 2.5]);
        octx.beginPath(); octx.moveTo(qq.ax, qq.ay); octx.lineTo(x - 2, y + (y < qq.ay ? 20 : 0)); octx.stroke(); octx.setLineDash([]); octx.globalAlpha = 1;
      }
    }
    for (const [, t] of tagPool) if (!t.used) { if (t.cls !== 'tag off') { t.cls = 'tag off'; t.el.className = 'tag off'; } } else t.used = false;
    req = [];
  }
  /* which tags each stretch of the film carries */
  function tagPlan(T) {
    return {
      face: T < 80 ? win(T, -10, -8, 9, 11) : win(T, 157, 159, D + 8, D + 10),
      own: win(T, 11.5, 13.5, 27, 30),
      helo: win(T, 16, 19, 27, 30),
      group: win(T, 29, 32, 50, 53) + win(T, 112, 116, 131, 135),
      groupKeys: T < 60 ? ['cvn', 'ddg2', 'ak', 'fv'] : ['cvn', 'ddg2'],
      air: win(T, 33, 36, 50, 53),
      airKeys: ['cap1', 'awacs'],
      raid: win(T, 52, 54, 104, 106),
      raidIds: T < 90 ? [41, 42, 43, 44, 45, 46] : [45],
    };
  }

  /* ---------- UI: kick, readout ---------- */
  const CH = [
    { t: 0, title: 'Array', kick: 'AN/SPY-1D(V) / Array face' },
    { t: 10, title: 'Own ship', kick: 'DDG-51 Arleigh Burke / Aegis' },
    { t: 29, title: 'Picture', kick: 'SPY-1D / 360° air and surface picture' },
    { t: 51, title: 'Raid', kick: 'SPY-1D / Raid · bearing 058' },
    { t: 61.5, title: 'Engage', kick: 'Mk 41 / SM-6 · engage' },
    { t: 88, title: 'Close-in', kick: 'Mk 15 Phalanx / Close-in' },
    { t: 106, title: 'Overview', kick: 'SPY-1D / The picture' },
    { t: 133, title: 'Return', kick: 'AN/SPY-1D(V) / Array face' },
  ];
  const kickT = document.getElementById('kickt'), readEl = document.getElementById('read');
  let kickCur = '', readHTML = '', lastUi = -1;
  const brg3 = a => String(Math.round(((a / DEG) % 360 + 360) % 360)).padStart(3, '0');
  function readout(T) {
    const ch = FILM.chapter || { t: 0 };
    const nTr = PE.GROUP.length + PE.AIR.length;
    const host = PE.hostileAt(T);
    if (ch.t === 0 || ch.t === 133) return `<i></i><span>Beam <b>${brg3(F0.brg + PE.face0Steer(T))}°</b></span><span>·</span><span><b>4 350</b> elements</span>`;
    if (ch.t === 10 || ch.t === 29 || ch.t === 106) return `<i></i><span><b>${nTr + host}</b> tracks</span><span>·</span><span><b>${host}</b> hostile</span>`;
    if (ch.t === 51) {
      let rmin = Infinity; PE.RAID.forEach((q, k) => { if (T >= q.tDet && T < q.tStop) rmin = Math.min(rmin, PE.roundRange(k, T)); });
      return isFinite(rmin) ? `<i class="coral"></i><span><b>${host}</b> hostile</span><span>·</span><span>closest <b>${(rmin / 1000).toFixed(1)}</b> km</span>`
        : `<i></i><span><b>${nTr}</b> tracks</span><span>·</span><span><b>0</b> hostile</span>`;
    }
    if (ch.t === 61.5) return `<i class="coral"></i><span><b>${host}</b> hostile</span><span>·</span><span>SM-6 <b>${PE.birdsAway(T)}</b> away</span>`;
    if (ch.t === 88) { const r = T < PE.T_CIWS ? PE.roundRange(4, T) : 0; return `<i class="coral"></i><span>TRK 45</span><span>·</span><span><b>${T < PE.T_CIWS ? (r / 1000).toFixed(2) : 'stopped'}</b>${T < PE.T_CIWS ? ' km' : ''}</span>`; }
    return '';
  }

  /* ---------- render ---------- */
  const TP = [0, 0, 0];
  function render(T) {
    camAt(T);
    pb.clear();
    octx.clearRect(0, 0, 1920, 1080);
    DW.sync(cam, pb);
    const tags = [];
    const sp = scopeParams(T), tp = tagPlan(T);
    const st = PE.shipStateFx(PE.shipState(T), T);
    // the own ship first: it writes the occlusion tiles that hide what is behind it
    DW.occReset();
    if (V.dist(cam.eye, C0) < 400) DW.occHouse(PE.HOUSE.planes, [...PE.HOUSE.B, ...PE.HOUSE.T]);
    PE.drawOwn(cam, T, st, 1);
    // behind the face's plane the deckhouse hides it (the close-in off the port quarter): skip its 4 350 elements
    const dF = V.dist(cam.eye, C0), faceA = V.dot(F0.n, V.sub(cam.eye, C0)) > 0 ? E.ss(260, 70, dF) : 0;
    let fi = null;
    if (faceA > .01) fi = PE.drawFace(cam, T, faceA, 0);
    DW.occClose();
    PE.drawSky(cam, .85);
    PE.drawSea(cam, T, 1);
    PE.drawWake(cam, T, X.make(R.I(), [0, 0, 0]), 1, 155, 20);
    // the scope
    sp.tagOnly = [...tp.groupKeys, ...tp.airKeys];
    sp.raidTags = tp.raidIds;
    const scT = [];
    const sc = PE.scope(pb, cam, T, sp);
    for (const tg of sc.tags) {
      const k = tg.key;
      if (k.startsWith('g_')) tg.a *= tp.group; else if (k.startsWith('a_')) tg.a *= tp.air; else if (k.startsWith('r_')) tg.a *= tp.raid;
      scT.push(tg);
    }
    PE.drawGroup(cam, T, 1);
    PE.drawHelo(cam, T, 1);
    PE.drawRounds(cam, T, 1);
    // the fight (stage B)
    const ctx = { cam, pb, DW, st, scope: sp, T };
    PE.launchFx(T, ctx); PE.interceptFx(T, ctx); PE.ciwsFx(T, ctx); PE.hitFx(T, ctx);
    pb.blit();

    // overlay: calm the menu corner
    if (!FILM.uiHidden) {
      const g = octx.createRadialGradient(120, 1080, 0, 120, 1080, 900);
      g.addColorStop(0, 'rgba(11,12,10,.86)'); g.addColorStop(.55, 'rgba(11,12,10,.55)'); g.addColorStop(1, 'rgba(11,12,10,0)');
      octx.fillStyle = g; octx.fillRect(0, 180, 1100, 900);
    }
    // range labels on the rings, where they cross bearing 150
    if (sp.a > .2 && cam.eye[1] > 2500) {
      octx.font = '400 11px "Geist Mono", monospace'; octx.textAlign = 'left';
      octx.fillStyle = `rgba(255,255,255,${(.36 * sp.a).toFixed(2)})`;
      for (const rr of [...PE.RINGS, PE.RMAX]) { const p = cam.project(pol(152, rr * 1000, 0)); if (p) octx.fillText(rr + ' KM', p[0] + 6, p[1] - 5); }
    }
    // tags: the face, the own ship, the helicopter
    if (tp.face > .01 && fi) {
      // anchored on the face's right-hand vertex, the chip to its right
      // F0.h runs to screen-left seen from outside: the anchor is the face's right-hand vertex (-h)
      const p = cam.project(V.add(V.mad(C0, F0.h, -1.95 * Math.cos(Math.PI / 8)), V.mul(F0.u, .5)));
      if (p) tags.push({ key: 'face', id: 'SPY-1D(V)', txt: 'Face 1 · starboard fwd', v: '4 350 elements', cls: 'lime', ax: p[0], ay: p[1], x: p[0] + 46, y: p[1] - 46, a: tp.face, pri: 9 });
    }
    if (tp.own > .01) {
      const p = cam.project(PE.A.mastTop);
      if (p) tags.push({ key: 'own', id: 'OWN', txt: 'DDG · Arleigh Burke', v: `${Math.round(PE.VS * 1.944)} kn`, cls: 'lime', ax: p[0], ay: p[1], x: p[0] + 26, y: p[1] - 40, a: tp.own, pri: 8 });
    }
    if (tp.helo > .01) {
      const Wx = PE.heloX(T), p = cam.project(V.add(Wx.T, [0, 5, 0]));
      if (p && p[2] < 4000) tags.push({ key: 'helo', id: 'TRK 06', txt: 'MH-60R', v: `${Math.round(PE.AIR[0].speed * 1.944)} kn`, cls: 'lime', ax: p[0], ay: p[1], x: p[0] + 18, y: p[1] - 34, a: tp.helo, pri: 7 });
    }
    PE.fxOverlay(T, octx, tags, ctx);
    for (const tg of scT) req.push(tg);
    for (const tg of tags) req.push(tg);
    flushTags();

    // readout, 10 Hz
    if (Math.abs(T - lastUi) > .1) {
      lastUi = T;
      const html = readout(T);
      if (html !== readHTML) { readHTML = html; readEl.innerHTML = html; }
    }
    STAGE.dbg = { T: +T.toFixed(2), eye: cam.eye.map(v => Math.round(v)), fov: +(cam.fov / DEG).toFixed(1), face: fi };
  }

  /* ---------- sound: synthesized, fired only while playing in real time (the fight's own sounds: stage B) ---------- */
  const cues = [];
  const cue = (t, fn) => { t = ((t % D) + D) % D; cues.push([t, fn]); };
  // the sweep: a soft tick each time a face beam crosses the bow, while the scope is up
  for (let j = 0; j < 400; j++) { const t = PE.paintT(j, 0); if (t > 12 && t < 152) cue(t, () => SFX.tone(2100, 2100, .012, 'square', .007)); }
  // the array close-up: the transmit bursts as a faint high chirp
  for (let t = .125; t < D; t += 1) if (t < 12 || t > 154) cue(t, () => SFX.tone(3400, 3100, .02, 'sine', .006));
  // a raid track is born (low, coral) and firms up (two tones)
  for (const q of PE.RAID) {
    cue(q.tDet, () => { SFX.tone(620, 620, .05, 'square', .012); SFX.tone(465, 465, .06, 'square', .01, .07); });
    if (q.looks[2] !== undefined) cue(q.looks[2], () => SFX.tone(930, 930, .04, 'square', .008));
  }
  cue(PE.EV.raidFirst - .4, () => SFX.noise(1.2, 400, .7, .03, .2));

  // the fight's own sounds (stage B): [[t, fn], ...] from pe_aegis_fx.js
  for (const c of (PE.fxCues || [])) cue(c[0], c[1]);

  FILM.run({
    duration: D,
    chapters: CH.map(c => ({ t: c.t, title: c.title })),
    cues,
    render,
    onChapter(ch) { const c = CH.find(q => q.t === ch.t); if (c && c.kick !== kickCur) { kickCur = c.kick; kickT.textContent = c.kick; } },
  });
})();
