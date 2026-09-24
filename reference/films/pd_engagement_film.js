/* ENGAGEMENT (Point Cloud D) · the film. One take through the sensors: the Monolith-B scope with the strike
   group as tracks and the raid coming over its edge, the dive into the dot world behind the four rounds, the
   defence (pd_engagement_defence.js), the hit in slow motion (pd_engagement_hit.js), and the climb back into
   the scope where the next raid comes over the edge. render(T) is a pure function of film time T. */
(() => {
  'use strict';
  const { V, R, X, E, Cam } = M3;
  const { D, DEG, TAU, LIME, WH } = PD;
  const DW = PD.DW;
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
  const ic = document.createElement('canvas'); ic.width = 480; ic.height = 270; ic.className = 'px';
  const insetEl = document.getElementById('inset'); insetEl.appendChild(ic);
  const pb2 = new PointBuf(ic, [11, 12, 10], { vignette: .3 });
  const cam2 = new Cam(480, 270); cam2.near = 1;
  const INSET = { el: insetEl, pb: pb2, cam: cam2, label: document.getElementById('insl'), right: document.getElementById('insr') };
  const uiEl = document.getElementById('ui');

  /* ---------- camera: one take, keyed in TRK 21's translating frame ----------
     Keys are offsets from PD.ship(0, tau(T)); the chase section is sampled from the analytic chase camera
     (behind the formation, then behind round 4) so the spline follows the rounds exactly. */
  const U = PD.U, RG = PD.RG, UP = [0, 1, 0], HIT = PD.HIT_REL;
  const lerpK = (T, ks) => { if (T <= ks[0][0]) return ks[0][1]; for (let i = 0; i < ks.length - 1; i++) if (T < ks[i + 1][0]) { const u = E.ss(ks[i][0], ks[i + 1][0], T); return ks[i][1] + (ks[i + 1][1] - ks[i][1]) * u; } return ks[ks.length - 1][1]; };
  const win = (T, a, b, c, d) => E.ss(a, b, T) * (1 - E.ss(c, d, T));
  const shipAt = T => PD.ship(0, PD.tau(T));
  const toRel = (T, p) => V.sub(p, shipAt(T));
  /* a view from yaw (heading of the look, deg), pitch (deg down), distance, around a world look point */
  const view = (T, look, yaw, pitch, dist, fov) => {
    const y = yaw * DEG, p = pitch * DEG, d = [Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p)];
    return { t: T, eye: toRel(T, V.mad(look, d, -dist)), target: toRel(T, look), fov };
  };
  const AB = [0, 0, 0];
  /* the chase rides with round 4, the one that gets through; from 94.6 its anchor eases to a stop at the hull
     (film-time exponential with unit slope at the knee, asymptote 95.0) while the round itself runs on into it */
  const anchorT = T => T < 94.6 ? T : 94.6 + .4 * (1 - Math.exp(-(T - 94.6) / .4));
  function anchorRel(T) { PD.relPos(3, PD.tau(anchorT(T)), AB); return AB.slice(); }
  /* offsets from round 4 along its flight (back), to its right (side), above it (h); the lens looks at TRK 21 */
  const CAMP = {
    back: [[38, 520], [44, 150], [50, 44], [54, 31], [58.5, 60], [64, 96], [74, 122], [82, 80], [88, 42], [92.6, 33], [95, 92]],
    side: [[38, -150], [44, -64], [50, -12], [54, -7.5], [60, -24], [66, -40], [76, -44], [84, -20], [92.6, -5], [95, -9]],
    h: [[38, 95], [44, 17], [50, 3.2], [54, 2.2], [60, 10], [66, 15], [76, 20], [84, 6], [92.6, 3.2], [95, 6.5]],
    fov: [[38, 44], [50, 42], [60, 40], [88, 36], [95, 34]],
  };
  function chase(T) {
    const A = anchorRel(T), b = lerpK(T, CAMP.back), s = lerpK(T, CAMP.side), h = lerpK(T, CAMP.h);
    const eye = [A[0] - U[0] * b + RG[0] * s, A[1] + h, A[2] - U[2] * b + RG[2] * s];
    return { t: T, eye, target: [HIT[0], 20, HIT[2]], fov: lerpK(T, CAMP.fov) };
  }
  const along = (T, back, side, up, ahead, fov) => {
    const A = anchorRel(T);
    return { t: T, eye: [A[0] - U[0] * back + RG[0] * side, A[1] + up, A[2] - U[2] * back + RG[2] * side], target: [A[0] + U[0] * ahead, 0, A[2] + U[2] * ahead], fov };
  };
  const hk = (T, bk, sd, up, tgtUp, fov) => ({ t: T, eye: [HIT[0] - U[0] * bk + RG[0] * sd, up, HIT[2] - U[2] * bk + RG[2] * sd], target: [HIT[0] * .3, tgtUp, HIT[2] * .3], fov });
  /* the scope views, along the raid's line: [look point: m along the flight from where round 4 comes over the
     scope's edge, m to its right; yaw off the flight heading (deg, + right); pitch down (deg); distance (m); fov] */
  const ENTRY = PD.round(3, PD.TE).p, HEAD = PD.PSI / DEG;
  const SCOPE = {
    k0: [12000, 0, 5, 18, 28000, 38],
    k1: [17000, 0, 4, 17, 23000, 38],
    k2: [24000, 0, 2, 20, 17000, 40],
    c1: [62000, 0, 3, 19, 14000, 38],
    c2: [44000, 0, 4, 18, 21000, 38],
    c3: [21000, 0, 5, 18, 26500, 38],
  };
  let K = [], path = null, K0 = null;
  function build() {
    K = [];
    const push = k => K.push(k), sv = (T, a) => view(T, [ENTRY[0] + U[0] * a[0] + RG[0] * a[1], 0, ENTRY[2] + U[2] * a[0] + RG[2] * a[1]], HEAD + a[2], a[3], a[4], a[5]);
    /* the scope: from high in the south-south-east, looking NNW across the picture */
    K0 = sv(0, SCOPE.k0); push(K0);
    push(sv(12, SCOPE.k1));
    push(sv(23.5, SCOPE.k2));
    /* down to the sea along the raid's line, behind round 4, looking ahead to the group: distance falls ~3x per key */
    push(along(28.5, 7200, -420, 2700, 9000, 40));
    push(along(32.2, 2400, -160, 760, 4200, 42));
    push(along(35.4, 800, -70, 170, 2600, 43));
    for (let t = 38.5; t <= 95.01; t += 1.5) push(chase(t));
    /* after the hit: up and off the starboard quarter, round towards the stern, then the long climb */
    push(hk(97.2, 150, -30, 22, 8, 36));
    push(hk(99.8, 225, -100, 46, 14, 38));
    push(hk(102.8, 300, -235, 80, 26, 40));
    push(hk(106.2, 390, -430, 140, 40, 40));
    push(hk(110.4, 620, -520, 250, 50, 40));
    push(hk(114.4, 1150, -580, 500, 40, 39));
    push(hk(118.2, 4600, -800, 2100, 0, 38));
    push(sv(123.5, SCOPE.c1));
    push(sv(134, SCOPE.c2));
    push(sv(144, SCOPE.c3));
    push(Object.assign({}, K0, { t: D }));
    // keys carry a direction, not a point: every target at the same distance ahead of its eye
    for (const k of K) k.target = V.mad(k.eye, V.norm(V.sub(k.target, k.eye)), 600);
    path = FILM.path(K, { loop: true });
  }
  build();
  /* the chase itself takes over between its keys (exact on the rounds) */
  const wChase = T => win(T, 38.6, 40.2, 94.9, 96.6);
  /* projection centre: the action sits right of the menu */
  const CXY = [[0, 1070, 560], [24, 1070, 560], [36, 1010, 520], [95, 1000, 540], [104, 1010, 560], [140, 1070, 560], [D, 1070, 560]];
  const cxcy = T => { let i = 0; while (i < CXY.length - 2 && CXY[i + 1][0] <= T) i++; const a = CXY[i], b = CXY[i + 1], u = E.ss(a[0], b[0], T); return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; };
  const slerpDir = (a, b, u) => { const d = E.clamp(V.dot(a, b), -1, 1), th = Math.acos(d); if (th < 1e-4) return V.norm(V.lerp(a, b, u)); const s = Math.sin(th); return V.add(V.mul(a, Math.sin((1 - u) * th) / s), V.mul(b, Math.sin(u * th) / s)); };
  function camRel(T) {
    const p = path(T);
    let eye = p.eye, dir = V.norm(V.sub(p.target, p.eye)), fov = p.fov;
    const w = wChase(T);
    if (w > 0) {
      const c = chase(T), cd = V.norm(V.sub(c.target, c.eye));
      eye = V.lerp(eye, c.eye, w); dir = slerpDir(dir, cd, w); fov = fov + (c.fov * DEG - fov) * w;
    }
    // a hand on the camera low over the sea
    const dr = FILM.drift(T, 1, 3), dk = win(T, 36, 42, 93, 97) * 2.2;
    eye = [eye[0] + dr[0] * dk, eye[1] + dr[1] * dk * .5, eye[2] + dr[2] * dk];
    // never under the sea
    if (eye[1] < 2.5) eye = [eye[0], 2.5, eye[2]];
    return { eye, dir, fov };
  }
  let camVel = [0, 0, 0];
  function camAt(T) {
    const c = camRel(T), s = shipAt(T);
    cam.eye = V.add(c.eye, s); cam.target = V.add(cam.eye, V.mul(c.dir, 100)); cam.fov = E.clamp(c.fov, .5 * DEG, 80 * DEG); cam.roll = 0;
    const xy = cxcy(T); cam.cx = xy[0]; cam.cy = xy[1];
    cam.near = cam.eye[1] > 3000 ? 5 : .3;
    const sk = PD.hitShake ? PD.hitShake(T) : 0;
    cam.shake = sk > .05 ? FILM.shake(T, sk, 2.6) : [0, 0];
    cam.update();
    // film-time velocity of the eye (for the speed streaks); the jump at TJ is inside the ship frame, so use relative + ship
    const dt = 1 / 60, c0 = camRel(Math.max(0, T - dt));
    camVel = V.mul(V.sub(c.eye, c0.eye), 1 / dt);
    camVel = V.add(camVel, V.mul(PD.FWD, PD.VS * PD.rate(T)));
  }

  /* ---------- layer envelopes ---------- */
  function scopeParams(T) {
    // the beam wipes the picture sweep by sweep on the way down and paints it back in on the way up
    const a = T < 60 ? 1 - E.ss(38.5, 40, T) : E.ss(111.8, 112.6, T);
    const far = T < 60 ? 1 - E.ss(22, 31, T) : E.ss(122, 140, T);
    return {
      a, T,
      // the returns' display height follows the lens: tall pillars from altitude, a low relief near the water
      hk: 2.5 + 60 * E.ss(1500, 9000, cam.eye[1]),
      big: 36000 + 110000 * far, gain: 2 + .4 * far + 1.3 * win(T, 110, 114, 125, 133), mcap: Math.round(9 + 7 * win(T, 108, 112, 124, 130)),
      land: 1, map: T < 60 ? 1 - E.ss(33, 38, T) : E.ss(113, 120, T), beam: 1, ships: 1, lod: 1,
      tracks: T < 60 ? 1 - E.ss(31, 35, T) : E.ss(118, 124, T), own: T < 60 ? 1 - E.ss(33, 37, T) : 1,
      hideFrom: T < 60 ? PD.T_WIPE : undefined, showFrom: T < 60 ? undefined : PD.tau(PD.T_PAINT),
      near: cam.near * 4, tagA: 1,
    };
  }
  PD.T_WIPE = 33.5; PD.T_PAINT = 112.5;
  const dotA = T => win(T, 29, 35, 117, 125);

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
      // the class sets the chip's size: apply it before measuring, or the width depends on what the tag was last frame
      const cls = 'tag' + (qq.cls ? ' ' + qq.cls : '');
      if (t.cls !== cls) { t.cls = cls; t.el.className = cls; }
      const w = t.el.offsetWidth || 150;
      const offAnchor = qq.ax !== undefined && (qq.ax < 4 || qq.ax > 1916 || qq.ay < 4 || qq.ay > 1076);
      let x = Math.min(Math.max(8, qq.x), 1912 - w), y = qq.y;
      for (let g = 0; g < 10; g++) { const hit = placed.find(p => x < p.x + p.w + 6 && p.x < x + w + 6 && Math.abs(y - p.y) < 24); if (!hit) break; y = hit.y + (qq.down ? 25 : -25); }
      const inMenu = x < MENU_BOX[2] && x + w > MENU_BOX[0] && y + 20 > MENU_BOX[1] && y < MENU_BOX[3];
      if (offAnchor || inMenu || qq.a <= .02 || y < 150 || y > 1040) { t.used = false; continue; }
      placed.push({ x, y, w });
      t.used = true;
      t.el.style.opacity = Math.min(1, qq.a).toFixed(2);
      t.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
      if (qq.ax !== undefined && qq.lead !== false && !FILM.uiHidden) {
        octx.strokeStyle = qq.leadCol || 'rgba(238,238,228,.7)'; octx.globalAlpha = Math.min(1, qq.a) * .8; octx.lineWidth = 1; octx.setLineDash([1, 2.5]);
        octx.beginPath(); octx.moveTo(qq.ax, qq.ay); octx.lineTo(x - 2, y + (y < qq.ay ? 20 : 0)); octx.stroke(); octx.setLineDash([]); octx.globalAlpha = 1;
      }
    }
    // an unused tag drops its inline opacity too, or that would keep it on screen over the .off rule
    for (const [, t] of tagPool) if (!t.used) { if (t.cls !== 'tag off') { t.cls = 'tag off'; t.el.className = 'tag off'; t.el.style.opacity = ''; } } else t.used = false;
    req = [];
  }
  /* corner brackets that fit a screen box, with a dotted outline */
  function bracket(b, col, a, pad, len) {
    const x0 = b[0] - pad, y0 = b[1] - pad, x1 = b[2] + pad, y1 = b[3] + pad, c = Math.min(len, (x1 - x0) * .35, (y1 - y0) * .35);
    octx.strokeStyle = col; octx.globalAlpha = a; octx.lineWidth = 1.5; octx.beginPath();
    for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { octx.moveTo(px + sx * c, py); octx.lineTo(px, py); octx.lineTo(px, py + sy * c); }
    octx.stroke(); octx.lineWidth = 1; octx.setLineDash([2, 4]); octx.globalAlpha = a * .45; octx.strokeRect(x0, y0, x1 - x0, y1 - y0); octx.setLineDash([]); octx.globalAlpha = 1;
    return [x0, y0, x1, y1];
  }
  /* screen box of a model-space AABB under transform Xf (null if any corner is behind the lens) */
  function boxOf(Xf, mn, mx) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const sx of [mn[0], mx[0]]) for (const sy of [mn[1], mx[1]]) for (const sz of [mn[2], mx[2]]) { const p = cam.project(X.ap(Xf, [sx, sy, sz])); if (!p) return null; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    return [x0, y0, x1, y1];
  }
  /* the destroyer's true bounds from its own coarse dots */
  const DDB = (() => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const s of DW.DDG_LV[2].parts) { const Tp = s.part.xf ? s.part.xf({}) : X.make(); for (let k = 0; k < s.pts.length; k += 6) { const p = X.ap(Tp, [s.pts[k], s.pts[k + 1], s.pts[k + 2]]); for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], p[c]); mx[c] = Math.max(mx[c], p[c]); } } } mn[1] = 0; return [mn, mx]; })();

  /* ---------- UI: kick caption, readout ---------- */
  const CH = [
    { t: 0, title: 'Scope', kick: 'Monolith-B / Surface picture' },
    { t: 25, title: 'Down to the sea', kick: 'OWN 1–4 / 3M55 Oniks · sea skim' },
    { t: 50, title: 'Defence', kick: 'TRK 21 / DDG · Arleigh Burke' },
    { t: 90, title: 'The hit', kick: 'OWN 4 / Terminal' },
    { t: 108, title: 'Picture', kick: 'Monolith-B / Surface picture' },
  ];
  const kickT = document.getElementById('kickt'), readEl = document.getElementById('read');
  let kickCur = '', readHTML = '', lastUi = -1;
  const fmt1 = n => n.toFixed(1);
  const rateTxt = r => r > .98 && r < 1.02 ? '' : '×' + (r < .95 ? r.toFixed(1) : r.toFixed(1));

  /* ---------- render ---------- */
  const RO = {};
  const PROF = {}; let pt0 = 0;
  const tick = k => { const n = performance.now(); PROF[k] = +((PROF[k] || 0) * .9 + (n - pt0) * .1).toFixed(2); pt0 = n; };
  function render(T) {
    pt0 = performance.now();
    const S = PD.S(T), tau = PD.tau(T), rate = PD.rate(T);
    camAt(T);
    pb.clear();
    octx.clearRect(0, 0, 1920, 1080);
    DW.sync(cam, pb);
    const dA = dotA(T), ctx = { S, tau, rate, dA, cam, pb, T, inset: INSET };
    tick('pre');
    // the dot world's backdrop: sky and sea
    if (dA > .01) { DW.drawSky(dA); DW.drawSea(T, dA, camVel); }
    tick('sea');
    // the scope
    const sp = scopeParams(T);
    if (sp.a > .003) { const sc = PD.scope(pb, cam, tau, sp); for (const tg of sc.tags) { if (tg.ship === 0 && T > 60) { const st = PD.scopeTag(T); if (st) tg.txt = st; if (PD.scopeTagA) tg.a *= PD.scopeTagA(T); } req.push(tg); } }
    DW.sync(cam, pb);
    if (sp.a > .003 && PD.hitScope) PD.hitScope(T, tau, sp, pb, cam);
    tick('scope');
    // the ships and the rounds
    if (dA > .01) {
      for (let j = PD.SHIPS.length - 1; j >= 0; j--) DW.drawShip(j, T, dA * (j ? .85 : 1));
      tick('ships');
      for (let k = 0; k < 4; k++) {
        PD.round(k, tau, RO);
        const a = RO.a * dA * (T < PD.TJ ? 1 : 0);
        if (a <= .01) continue;
        DW.drawTrail(k, T, a);
        DW.drawRound(k, T, RO, a);
      }
      tick('rounds');
      PD.defenceFx(T, ctx);
      PD.hitFx(T, ctx);
      tick('fx');
    }
    pb.blit();
    tick('blit');

    // overlay: calm the menu corner
    if (!FILM.uiHidden) {
      const g = octx.createRadialGradient(120, 1080, 0, 120, 1080, 900);
      g.addColorStop(0, 'rgba(11,12,10,.86)'); g.addColorStop(.55, 'rgba(11,12,10,.55)'); g.addColorStop(1, 'rgba(11,12,10,0)');
      octx.fillStyle = g; octx.fillRect(0, 180, 1100, 900);
      // and behind the logo, the kick and the readout
      const g2 = octx.createRadialGradient(150, 70, 0, 150, 70, 560);
      g2.addColorStop(0, 'rgba(11,12,10,.8)'); g2.addColorStop(.5, 'rgba(11,12,10,.45)'); g2.addColorStop(1, 'rgba(11,12,10,0)');
      octx.fillStyle = g2; octx.fillRect(0, 0, 720, 640);
      const g3 = octx.createRadialGradient(1700, 60, 0, 1700, 60, 420);
      g3.addColorStop(0, 'rgba(11,12,10,.7)'); g3.addColorStop(1, 'rgba(11,12,10,0)');
      octx.fillStyle = g3; octx.fillRect(1280, 0, 640, 480);
    }
    // range labels on the scope's rings
    if (sp.a > .2) {
      octx.font = '400 11px "Geist Mono", monospace'; octx.fillStyle = `rgba(255,255,255,${(.36 * sp.a).toFixed(2)})`; octx.textAlign = 'left';
      for (const rr of PD.RINGS) { const a = 58 * DEG, p = cam.project([Math.sin(a) * rr * 1000, 0, Math.cos(a) * rr * 1000]); if (p && p[0] > 620 && p[0] < 1900 && p[1] > 150 && p[1] < 1060) octx.fillText(rr + (rr === 64 ? ' KM' : ''), p[0] + 6, p[1] - 5); }
    }
    // the dot world's identification: TRK 21 ahead, bracketed on its true bounds; the raid tagged as we arrive
    const idA = dA * win(T, 36, 40, 93.1, 93.7);
    if (idA > .01) {
      const Xf = PD.shipX(0, tau), bb = boxOf(Xf, DDB[0], DDB[1]);
      if (bb) {
        const cxm = (bb[0] + bb[2]) / 2, cym = (bb[1] + bb[3]) / 2, hw = Math.max(9, (bb[2] - bb[0]) / 2), hh = Math.max(7, (bb[3] - bb[1]) / 2);
        const b2 = bracket([cxm - hw, cym - hh, cxm + hw, cym + hh], 'rgba(255,255,255,.85)', idA * .9, 3, 8);
        const rng = V.dist(cam.eye, X.ap(Xf, [0, 10, 0]));
        const st = PD.scopeTag(T);
        req.push({ key: 'dw21', id: 'TRK 21', txt: st || 'DDG · Arleigh Burke', v: (rng / 1000).toFixed(1) + ' km', cls: 'coral', ax: b2[2], ay: b2[1], x: b2[2] + 14, y: b2[1] - 34, a: idA, pri: 6 });
      }
    }
    const rtA = dA * win(T, 37, 40, 47, 50);
    if (rtA > .01) {
      PD.round(3, tau, RO);
      const p = cam.project(RO.p);
      if (p) req.push({ key: 'dwraid', id: 'OWN 4', txt: '3M55 Oniks', v: Math.round(RO.p[1]) + ' m · M2.0', cls: 'lime', ax: p[0] + 4, ay: p[1] + 4, x: p[0] + 40, y: p[1] + 44, a: rtA, pri: 5, down: true });
    }
    PD.defenceOverlay(T, octx, req, ctx);
    PD.hitOverlay(T, octx, req, ctx);
    const showInset = PD.defenceInset(T, ctx);
    insetEl.classList.toggle('off', !showInset);
    flushTags();
    tick('ui');

    // readout, 10 Hz
    if (Math.abs(T - lastUi) > .1 || FILM.seeking) {
      lastUi = T;
      const ch = FILM.chapter || { t: 0 };
      const rt = rateTxt(rate), rs = rt ? `<span>·</span><span class="rate">${rt}</span>` : '';
      let html;
      let alive = 0, own = 0;
      for (let k = 0; k < 4; k++) { PD.round(k, tau, RO); if (RO.a > .5) { alive++; if (Math.hypot(RO.p[0], RO.p[2]) < PD.RMAX) own++; } }
      PD.round(3, tau, RO);
      if (ch.t === 0 || ch.t === 108) {
        html = `<i></i><span>Sweep <b>${String(139 + Math.floor(PD.phase(tau) / TAU)).padStart(3, '0')}</b></span><span>·</span><span><b>3</b> tracks</span><span>·</span><span>Own <b>${own}</b></span>`;
      } else if (ch.t === 25) {
        html = `<i></i><span>OWN 4</span><span>·</span><span><b>${Math.round(RO.p[1])}</b> m</span><span>·</span><span><b>${fmt1(RO.d / 1000)}</b> km to go</span>${rs}`;
      } else if (ch.t === 50) {
        html = `<i></i><span>Rounds <b>${alive}</b>/4</span><span>·</span><span><b>${fmt1(Math.max(0, RO.d) / 1000)}</b> km</span><span>·</span><span>T–<b>${Math.max(0, RO.d / PD.VR).toFixed(1)}</b> s</span>${rs}`;
      } else if (T < PD.T_HIT) {
        html = `<i></i><span>OWN 4</span><span>·</span><span><b>${Math.max(0, Math.round(RO.d))}</b> m</span>${rs}`;
      } else {
        html = `<i></i><span>TRK 21</span><span>·</span><span><b>${PD.scopeTag(T) || 'DDG'}</b></span>${rs}`;
      }
      if (html !== readHTML) { readHTML = html; readEl.innerHTML = html; }
    }
    STAGE.dbg = { T: +T.toFixed(2), S: +S.toFixed(2), tau: +tau.toFixed(2), rate: +rate.toFixed(3), eye: cam.eye.map(v => Math.round(v)), prof: PROF };
  }

  /* ---------- sound: synthesized, fired only while playing forward ---------- */
  const cues = [];
  const cue = (t, fn) => { if (t >= 0 && t < D) cues.push([t, fn]); };
  // the antenna passing north while the scope is up
  for (let k = -60; k < 60; k++) { const tau = (TAU * k - PD.PH0) / PD.OMEGA; for (const T of [tau, tau + D]) if ((T > 0 && T < 36) || (T > 112 && T < D)) cue(T, () => SFX.tone(2100, 2100, .012, 'square', .01)); }
  // the raid comes over the scope's edge
  cue(PD.TE + D, () => { SFX.tone(1250, 1250, .05, 'square', .012); SFX.tone(1875, 1875, .04, 'square', .009, .06); });
  // the dive: air
  cue(27, () => SFX.noise(9, 900, .6, .05, 4));
  cue(36.5, () => { SFX.noise(2.2, 2400, .5, .05, .6); SFX.tone(140, 90, 3, 'sawtooth', .02); });
  // the ramjets, a low bed while we ride with them
  for (let t = 38; t < 92; t += 6) cue(t, () => SFX.noise(6.4, 320, .8, .035, .8));
  cue(PD.EV.stop1, () => SFX.tone(700, 500, .1, 'square', .006));
  cue(PD.EV.stop2, () => SFX.tone(700, 500, .1, 'square', .006));
  cue(93.2, () => SFX.tone(220, 70, 2.4, 'sine', .05));
  // the effect stages' own cues ([filmT, fn] lists)
  for (const c of [].concat(PD.defenceCues || [], PD.hitCues || [])) cue(c[0], c[1]);

  FILM.run({
    duration: D,
    chapters: CH.map(c => ({ t: c.t, title: c.title })),
    cues,
    render,
    onChapter(ch) { const c = CH.find(q => q.t === ch.t); if (c && c.kick !== kickCur) { kickCur = c.kick; kickT.textContent = c.kick; } },
  });
  /* tuning from the console: STAGE.PD.SCOPE / CAMP edits, then STAGE.PD.rebuild(); FILM.seek(t); STAGE.capture() */
  STAGE.PD = { cam, camAt, camRel, chase, SCOPE, CAMP, rebuild: build, get K() { return K; }, PROF };
})();
