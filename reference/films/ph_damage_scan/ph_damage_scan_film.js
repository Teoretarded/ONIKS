/* DAMAGE SCAN (Point Cloud, defence P5) · the film. One take, 165 s: the destroyer under way on a dot sea; a raid
   of four rounds in low off the port bow, seen past her toward the horizon; the interceptors' paths; the one that
   gets through reaches her hangar block (slow motion); a lightning strike pours down onto her mast and its fronts
   branch through her steel, the X-ray opens her; the aft section's assemblies float apart, tagged and boxed, and
   glide back together as she steams on; the scan closes and the loop returns to the calm ship before the raid.
   render(T) is a pure function of film time T. Combat effects live in ph_damage_scan_fx.js (PH.fx hooks). */
(() => {
  'use strict';
  const { V, R, X, E, Cam } = M3;
  const { D, DEG, TAU, LIME, WH, CORAL } = PH;
  const DW = PH.DW, SHIP = PH.SHIP, XS = SHIP.XS, DA = HD.destroyer.A, hD = DA.deckY;
  const ss = E.ss, sat = E.sat, mix = E.mix;
  const win = (T, a, b, c, d) => ss(a, b, T) * (1 - ss(c, d, T));
  STAGE.fit();
  const SFX = STAGE.SFX; SFX.kind = 'pc';
  const $ = id => document.getElementById(id);
  const PROF = SHIP.PROF;
  const pf = (k, t0) => { if (PROF) PROF[k] = (PROF[k] || 0) + performance.now() - t0; };

  /* ---------- menu: the column on the left ---------- */
  const menuEl = $('menu');
  menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
  const veil = $('veil');
  STAGE.menu({ el: menuEl, blurb: $('blurb'), onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });
  const MENU_BOX = [70, 590, 610, 960];

  /* ---------- canvases ---------- */
  const cv = $('c'), ov = $('o'), octx = ov.getContext('2d');
  const pb = new PointBuf(cv, [11, 12, 10], { vignette: .5 });
  const cam = new Cam(); cam.near = .3;
  const uiEl = $('ui');

  /* ---------- chapters ---------- */
  const T_STRIKE = 80.2;                             // the return stroke on the mast
  const XC0 = 122.4, XC1 = 127.6;                      // the X-ray closes, stern to bow
  const CH = [
    { t: 0, title: 'Under way', sub: 'DDG-51 · Arleigh Burke' },
    { t: 15, title: 'Raid', sub: '4 inbound · 3M55 · port bow' },
    { t: 26, title: 'Defence', sub: 'Mk 41 · SM-6 · ESSM' },
    { t: 61.5, title: 'Terminal', sub: 'TRK 44 · hangar block' },
    { t: 74, title: 'Scan', sub: 'Strike · damage scan' },
    { t: 93.2, title: 'Exploded', sub: 'Aft section · 12 assemblies' },
    { t: 119.6, title: 'Steaming on', sub: 'DDG-51 · 20 kn' },
    { t: 148, title: 'Calm', sub: 'DDG-51 · Arleigh Burke' },
  ];

  /* ---------- camera: one take in her frame ----------
     Keys carry a direction, not a point: every target is put 400 m ahead of its eye so the Hermite path turns the
     look smoothly between the far horizon shots and the close ones. */
  const hdg = (h, p) => [Math.sin(h * DEG) * Math.cos(p * DEG), -Math.sin(p * DEG), Math.cos(h * DEG) * Math.cos(p * DEG)];
  const K = [];
  const key = (t, eye, tgt, fov) => K.push({ t, eye, target: tgt, fov });
  const far = (eye, h, p) => V.mad(eye, hdg(h, p), 400);
  // 1 · under way: close off her starboard bow, low; the lens backs off along her side
  key(0, [78, 12, 128], [0, 13, 22], 40);
  key(6, [118, 15, 98], [0, 12, 10], 40);
  key(13, [192, 19, 54], [-40, 12, 2], 40);
  // 2-3 · low on the sea past her toward the port-bow horizon, where the raid comes from
  key(21, [252, 22, -2], far([252, 22, -2], 274, 1.1), 40);
  key(31, [258, 23, -9], far([258, 23, -9], 274.5, 1.1), 40);
  key(41, [262, 24, -15], far([262, 24, -15], 275, 1.2), 40);
  key(51, [262, 26, -24], far([262, 26, -24], 275.5, 1.3), 40);
  key(57, [248, 32, -38], far([248, 32, -38], 276.5, 2.6), 40);
  // 4 · terminal: up over her starboard quarter, the hangar block below, the raid's line beyond it
  key(63.5, [232, 50, -112], [-30, 8, -28], 40);
  key(69.4, [219, 54, -123], [-25, 8, -34], 38);
  key(70.6, [217, 54.5, -125], [-25, 8, -35], 38);
  key(75.5, [110, 84, -205], [-10, 12, -30], 42);
  // 5 · scan: over her stern to the port quarter, high; the whole ship under the strike
  key(80.5, [-112, 78, -172], [0, 16, -8], 44);
  key(87, [-160, 60, -102], [0, 16, -14], 42);
  key(93, [-138, 32, -56], [0, 19, -22], 44);
  // 6 · exploded: in close and low along her port side, the pieces against the sky
  key(99, [-126, 23, -40], [0, 21, -22], 46);
  key(106, [-124, 21.5, -23], [0, 21, -22], 46);
  key(112.5, [-126, 21.5, -6], [0, 19, -20], 46);
  key(119, [-148, 24, 20], [0, 15, -14], 44);
  // 7 · steaming on: forward along her port side, round the bow
  key(126, [-172, 26, 94], [0, 12, 0], 40);
  key(134, [-100, 20, 222], [0, 12, 20], 40);
  key(142, [30, 16, 252], [0, 12, 30], 40);
  // 8 · calm: back down her starboard bow
  key(150, [70, 14, 190], [0, 12, 30], 40);
  key(157, [76, 12.5, 152], [0, 13, 24], 40);
  K.push(Object.assign({}, K[0], { t: D }));
  for (const k of K) k.target = V.mad(k.eye, V.norm(V.sub(k.target, k.eye)), 400);
  const PATH = FILM.path(K, { loop: true });
  /* the lens looks up after each launch and settles back on the horizon */
  const tilt = T => 6.5 * win(T, 28.1, 29.8, 33.4, 37) + 4 * win(T, 41.9, 43.4, 46, 48.8);
  function camAt(T) {
    const s = PATH(T);
    let eye = s.eye, dir = V.norm(V.sub(s.target, s.eye));
    const tl = tilt(T) * DEG;
    if (tl > 0) { const h = Math.hypot(dir[0], dir[2]), el = Math.atan2(dir[1], h) + tl; dir = [dir[0] / h * Math.cos(el), Math.sin(el), dir[2] / h * Math.cos(el)]; }
    // a hand on the camera low over the sea (none near the seam)
    const dk = win(T, 16, 22, 58, 63), dr = FILM.drift(T, 1, 5);
    if (dk > 0) eye = [eye[0] + dr[0] * dk * .9, eye[1] + dr[1] * dk * .45, eye[2] + dr[2] * dk * .9];
    cam.eye = eye; cam.target = V.add(eye, V.mul(dir, 100)); cam.fov = s.fov; cam.roll = s.roll || 0;
    cam.cx = 1080; cam.cy = 430;
    const sk = PH.fx.shake ? PH.fx.shake(T) : 0;
    cam.shake = sk > .05 ? FILM.shake(T, sk, 16) : [0, 0];
    cam.near = .3;
    cam.update();
  }

  /* ---------- the strike: bolt, flash, live links over her steel ---------- */
  const FLASH = { v: 0 };
  const BOLT = SHIP.BOLT;
  function drawBolt(T) {
    const c = T - T_STRIKE + BOLT.lead; if (c < -.05 || c > BOLT.lead + 1.6) return;
    const tr = c - BOLT.lead, leading = tr < 0, m = BOLT.main;
    // the stepped leader: jumps every 70 ms, feeling its way down
    const reach = leading ? Math.pow(sat(Math.floor(c / .07) * .07 / BOLT.lead), 1.15) : 1;
    const I = leading ? .5 : Math.max(0, Math.exp(-tr * 5.5) + .7 * Math.exp(-Math.pow((tr - .11) * 30, 2)) + .5 * Math.exp(-Math.pow((tr - .24) * 26, 2)));
    const path = (pts, to, inten, core) => {
      for (let i = 0; i < Math.min(pts.length - 1, to); i++) {
        const a = pts[i], bq = pts[i + 1], n = Math.max(1, Math.ceil(V.dist(a, bq) / .45));
        for (let k = 0; k < n; k++) {
          const p = cam.project(V.lerp(a, bq, k / n)); if (!p || p[0] < -40 || p[0] > 1960 || p[1] < -40 || p[1] > 1120) continue;
          SHIP.dot(p[0], p[1], core || 2, 248, 255, 232, Math.min(1, inten));
          if (k % 3 === 0) { pb.add(p[0], p[1], 9, LIME[0], LIME[1], LIME[2], .035 * inten); pb.add(p[0], p[1], 23, LIME[0] * .6, LIME[1] * .6, LIME[2] * .6, .011 * inten); }
        }
      }
    };
    if (I > .01) {
      const vis = reach * m.length;
      path(m, vis, I * 1.1, leading ? 2 : 3);
      for (const b of BOLT.br) { const s = b.at * m.length; if (vis > s) path(b.pts, (vis - s) / (m.length * .2) * b.pts.length, I * b.w * (leading ? 1 : .8)); }
      if (!leading) FLASH.v = 20 * Math.min(1, I);
    }
    if (!leading) for (const q of BOLT.sp) {
      if (tr > q[3]) continue;
      const p = cam.project([BOLT.hit[0] + q[0] * tr, BOLT.hit[1] + q[1] * tr - 11 * tr * tr, BOLT.hit[2] + q[2] * tr]); if (!p) continue;
      const a = 1 - tr / q[3]; SHIP.dot(p[0], p[1], 2, 230, 255, 170, a); pb.add(p[0], p[1], 4, LIME[0], LIME[1], LIME[2], a * .08);
    }
  }
  function drawWires(T, SW) {
    const tb = T - T_STRIKE, XR = SHIP.XR; if (tb < 0 || tb > XR.SPAN + .3) return;
    octx.globalCompositeOperation = 'lighter'; octx.lineWidth = 1.2; octx.strokeStyle = 'rgba(210,255,120,.8)'; octx.beginPath();
    const N = XR.nodes, TS_ = XR.ts, PAR = XR.par;
    for (let i = 0; i < N.length; i++) {
      const tn = TS_[i]; if (tb < tn || tb > tn + .16 || PAR[i] < 0) continue;
      const p = cam.project(X.ap(SW, N[i].p)), q = cam.project(X.ap(SW, N[PAR[i]].p)); if (!p || !q) continue;
      octx.moveTo(q[0], q[1]); octx.lineTo(p[0], p[1]);
    }
    octx.stroke(); octx.globalCompositeOperation = 'source-over';
  }
  /* the scan pours down onto her: a lime drop falls onto each voxel of her steel and lands as the front reaches it */
  function drawPour(T, SW) {
    const tb = T - T_STRIKE, XR = SHIP.XR; if (tb < -.6 || tb > XR.SPAN + .1) return;
    const N = XR.nodes, TS_ = XR.ts, P3 = DW.P3, q = DW.q, put = DW.put, M = SW.R, t = SW.T;
    for (let i = 0; i < N.length; i++) {
      const lead = TS_[i] - tb; if (lead < 0 || lead > .6) continue;
      if (PH.hsh(i, 17) > .55) continue;
      const p = N[i].p, x = M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + t[0], y = M[3] * p[0] + M[4] * p[1] + M[5] * p[2] + t[1], z = M[6] * p[0] + M[7] * p[1] + M[8] * p[2] + t[2];
      const h = lead * 70, a = .35 + .65 * (1 - lead / .6);
      for (let k = 0; k < 4; k++) {
        if (!P3(x, y + h + k * 1.6, z)) continue;
        const w = 1 - k / 4;
        put(q.x, q.y, q.z < 90 && !k ? 2 : 1, k ? LIME[0] : 236, k ? LIME[1] : 255, k ? LIME[2] : 190, a * w);
      }
    }
  }
  /* the closing slice as a drawn section: her outline at z, the plane's frame round it */
  function drawSlice(z, SW, a) {
    if (a < .02 || z < -77.6 || z > 77.6) return;
    const c = [226, 255, 150], P3 = DW.P3, q = DW.q;
    const put = (x, y) => { const p = X.ap(SW, [x, y, z]); if (P3(p[0], p[1], p[2])) DW.dset(q.x, q.y, 2, c, a); };
    const d = hD(z), bw = PH.hW(z), bt = bw * 1.11;
    for (let y = 0; y < d; y += .3) { const x = bw + (bt - bw) * y / d; put(x, y); put(-x, y); }
    for (let x = -bt; x < bt; x += .3) put(x, d);
    for (let x = -bw; x < bw; x += .6) put(x, 0);
    const put2 = (x, y) => { const p = X.ap(SW, [x, y, z]); if (DW.P3(p[0], p[1], p[2])) DW.put(q.x, q.y, 1, LIME[0], LIME[1], LIME[2], .45 * a); };
    for (let y = -2; y < 50; y += .9) { put2(-15, y); put2(15, y); }
    for (let x = -15; x < 15; x += .9) { put2(x, -2); put2(x, 50); }
  }

  /* ---------- tags ---------- */
  const tagPool = new Map();
  function tagOf(key) {
    let t = tagPool.get(key);
    if (!t) { const el = document.createElement('div'); el.className = 'tag off'; el.innerHTML = '<b></b><i></i><span class="v"></span>'; uiEl.insertBefore(el, menuEl); t = { el, b: el.children[0], i: el.children[1], v: el.children[2], key: '', w: -1, on: false, x: 0, y: 0 }; tagPool.set(key, t); }
    return t;
  }
  const GLY = '·:+×/\\|-=';
  function condense(s, cond, T, seed) {
    if (cond >= 1) return s;
    const n = s.length, keep = Math.floor(n * Math.max(0, cond)), fr = Math.floor(T * 24);
    let o = s.slice(0, keep);
    for (let i = keep; i < n; i++) o += s[i] === ' ' ? ' ' : (((i * 7 + fr * 13 + seed * 5) % 11) < 3 + 8 * cond ? GLY[(i * 3 + fr + seed) % GLY.length] : ' ');
    return o;
  }
  function setTag(key, id, lab, val, cls, x, y, a, cond, T) {
    const t = tagOf(key);
    if (cond !== undefined && cond < 1) { lab = condense(lab, cond, T, id.length); val = cond > .75 ? val : ''; }
    const k = id + '|' + lab + '|' + val + '|' + (cls || '');
    if (t.key !== k) { t.key = k; t.w = -1; t.b.textContent = id; t.i.textContent = lab; t.i.style.display = lab ? '' : 'none'; t.v.textContent = val || ''; t.v.style.display = val ? '' : 'none'; t.el.className = 'tag ' + (cls || ''); }
    t.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    t.el.style.opacity = Math.min(1, a).toFixed(2);
    t.on = true; t.x = x; t.y = y;
    return t;
  }
  const placeTag = (t, x, y) => { t.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; t.x = x; t.y = y; };
  const tagW = t => { if (t.w < 0) t.w = t.el.offsetWidth || 150; return t.w; };
  const inMenu = (x, y, w) => x < MENU_BOX[2] && x + w > MENU_BOX[0] && y + 20 > MENU_BOX[1] && y < MENU_BOX[3];
  function bracket(b, col, a, pad, len) {
    const x0 = b[0] - pad, y0 = b[1] - pad, x1 = b[2] + pad, y1 = b[3] + pad, c = Math.min(len, (x1 - x0) * .35, (y1 - y0) * .35);
    octx.strokeStyle = col; octx.globalAlpha = a; octx.lineWidth = 1.5; octx.beginPath();
    for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { octx.moveTo(px + sx * c, py); octx.lineTo(px, py); octx.lineTo(px, py + sy * c); }
    octx.stroke(); octx.lineWidth = 1; octx.setLineDash([2, 4]); octx.globalAlpha = a * .45; octx.strokeRect(x0, y0, x1 - x0, y1 - y0); octx.setLineDash([]); octx.globalAlpha = 1;
    return [x0, y0, x1, y1];
  }
  function leader(x0, y0, x1, y1, col, a) { octx.strokeStyle = col; octx.globalAlpha = a; octx.lineWidth = 1; octx.setLineDash([2, 3]); octx.beginPath(); octx.moveTo(x0, y0); octx.lineTo(x1, y1); octx.stroke(); octx.setLineDash([]); octx.globalAlpha = 1; }
  function ring(x, y, r, col, a) { octx.strokeStyle = col; octx.globalAlpha = a; octx.lineWidth = 1.5; octx.beginPath(); octx.arc(x, y, r, 0, TAU); octx.stroke(); octx.globalAlpha = 1; }
  const stem = (x, y, len, a) => { for (let yy = 6; yy <= len; yy += 3) SHIP.dot(x, y - yy, 1, LIME[0], LIME[1], LIME[2], a); };
  const LIMEc = '#C6F432', WHc = '#ffffff', CORALc = '#FF6A3D';
  const MENU_Y = 800;

  /* ---------- the scan's tags: what the fronts reach, condensing ---------- */
  const SCAN_TAGS = [
    ['SPS-67', 'surface search · mast', '', [0, 29.6, 21.6], 50],
    ['SPY', 'AN/SPY-1D(V) · aft arrays', '', DA.spy[3], 66],
    ['UPT 2', 'Uptake · LM2500 ×2', '', [-2.1, 22.5, -18], 44],
    ['VLS', 'Mk 41 · aft', '64 cells', [-3.2, 7.4, -29.4], 88],
    ['SPG-62', 'Mk 99 · illuminators ×2', '', [-1.8, 18, -37.4], 62],
    ['CIWS', 'Phalanx 1B · aft', '', DA.ciws({}, 1), 104],
    ['HGR', 'Hangar block · MH-60R', '', [-8.4, 12.4, -46], 36],
  ].map(([id, lab, val, anchor, st]) => ({ id, lab, val, anchor, st, rt: SHIP.XR.rtAt(anchor[0], anchor[1], anchor[2]) }));

  /* ---------- exploded view: numbered placards (fore to aft), a leader to each assembly, a box as it settles ---------- */
  const A = SHIP.ASM, BS = SHIP.BS;
  const PL = [
    ['01', ['mast'], 'Mast · AN/SPS-67 · URN-25 TACAN', '', [0, 38.2, 16.5], 'L'],
    ['02', ['spyAP', 'spyAS'], 'AN/SPY-1D(V) · aft arrays ×2', '', DA.spy[3], 'L'],
    ['03', ['stack2'], 'Uptake 2 · LM2500 ×2', '', [-2.1, 21.8, -18.6], 'L'],
    ['04', ['boatP', 'boatS'], '7 m RHIB ×2 · davits', '', [-8.9, 10, -10.2], 'L'],
    ['05', ['deckhouse'], 'Midships deckhouse · Mk 38 ×2', '', [-6.2, 9.6, -12], 'L'],
    ['06', ['svttP', 'svttS'], 'Mk 32 SVTT ×2', '324 mm', [-7.5, hD(-29.4) + 1.2, -28.4], 'R'],
    ['07', ['vlsA', 'vlsBA'], 'Mk 41 VLS · aft · block of cells', '64 cells', [-4.2, hD(-29.4) - 3.4, -29.4], 'R'],
    ['08', ['spg'], 'Mk 99 FCS · AN/SPG-62 ×2', '', [-1.8, 17.4, -37.4], 'R'],
    ['09', ['ciwsA'], 'Phalanx CIWS 1B · aft', '20 mm', DA.ciws({}, 1), 'R'],
    ['10', ['hangarBlk'], 'Aft deckhouse · hangar block', '', [-8.5, 12, -44], 'R'],
    ['11', ['hdoor', 'helo'], 'Hangar doors ×2 · MH-60R', '', [-3.7, 8.6, -53.1], 'R'],
    ['12', ['mach2'], 'MER 2 · LM2500 ×2 · reduction gear', '2 × 25 000 shp', [-4.0, -1.2, -16], 'L'],
  ].map(([id, names, lab, val, anchor, side]) => ({ id, names, lab, val, anchor, side, a0: A[names[0]] }));
  function plBounds(p, T, SW) {
    let b = null;
    for (const n of p.names) {
      const a = A[n], W = SHIP.asmXf(a, T, SW);
      if (n === 'ciwsA') b = SHIP.pbounds(BS.ciwsMount, W, b);
      else if (n === 'mast') { b = SHIP.pbounds(BS.mast, W, b); b = SHIP.pbounds(BS.spsRest, W, b); }
      else b = SHIP.pbounds(BS[n], W, b);
    }
    return b;
  }
  const settleT = w0 => SHIP.EX.O + SHIP.EX.OD * (w0 * .8 + .55);

  /* ---------- readout, kick ---------- */
  const kickT = $('kickt'), readEl = $('read');
  let kickCur = '', readHTML = '', lastUi = -1;
  const KN = (PH.VS / .5144).toFixed(1);
  const RO = {};
  function readout(T, S) {
    const rate = PH.rate(T), rt = rate < .98 ? `<span>·</span><span class="rate">×${rate.toFixed(2)}</span>` : '';
    const nAlive = () => { let n = 0; for (let k = 0; k < 4; k++) { PH.round(k, S, RO); if (RO.a > .5 || (RO.d < 34000 && !RO.stopped && PH.fate(k, S) > .5)) n++; } return n; };
    const nearest = () => { let d = 1e9; for (let k = 0; k < 4; k++) { PH.round(k, S, RO); if (PH.fate(k, S) > .5 && RO.d < 36000) d = Math.min(d, Math.hypot(RO.p[0], RO.p[2])); } return d; };
    let h;
    if (T < 15 || T >= 148) h = `<i></i><span>DDG-51</span><span>·</span><span><b>${KN}</b> kn</span>`;
    else if (T < 26) { const n = nAlive(), d = nearest(); h = n ? `<i class="c"></i><span><b>${n}</b> inbound</span><span>·</span><span><b>${(d / 1000).toFixed(1)}</b> km</span>` : `<i></i><span>DDG-51</span><span>·</span><span><b>${KN}</b> kn</span>`; }
    else if (T < PH.T_HIT) { const n = nAlive(), d = nearest(); h = `<i class="c"></i><span>Rounds <b>${n}</b>/4</span><span>·</span><span><b>${d < 2000 ? Math.round(d) + '</b> m' : (d / 1000).toFixed(1) + '</b> km'}</span>${rt}`; }
    else if (T < T_STRIKE - 1.4) h = `<i class="c"></i><span>Hit</span><span>·</span><span><b>hangar block</b> · port</span>${rt}`;
    else if (T < 94.6) h = `<i></i><span>Scan</span><span>·</span><span><b>${Math.round(100 * sat((T - T_STRIKE) / SHIP.XR.SPAN))}</b> %</span>`;
    else if (T < 120) h = `<i></i><span>Exploded</span><span>·</span><span><b>${Math.round(100 * SHIP.explodeK(0, T))}</b> %</span>`;
    else if (T < XC1 + .5) h = `<i></i><span>X-ray</span><span>·</span><span><b>closing</b></span>`;
    else h = `<i></i><span>DDG-51</span><span>·</span><span><b>${KN}</b> kn</span>`;
    if (h !== readHTML) { readHTML = h; readEl.innerHTML = h; }
  }

  /* ---------- overlays ---------- */
  const IHd = {};
  function overlays(T, S, SW) {
    if (!FILM.uiHidden) {
      // calm the menu corner, the logo and the readout
      const g = octx.createRadialGradient(120, 1080, 0, 120, 1080, 900);
      g.addColorStop(0, 'rgba(11,12,10,.86)'); g.addColorStop(.55, 'rgba(11,12,10,.55)'); g.addColorStop(1, 'rgba(11,12,10,0)');
      octx.fillStyle = g; octx.fillRect(0, 180, 1100, 900);
      const g2 = octx.createRadialGradient(150, 70, 0, 150, 70, 560);
      g2.addColorStop(0, 'rgba(11,12,10,.8)'); g2.addColorStop(.5, 'rgba(11,12,10,.45)'); g2.addColorStop(1, 'rgba(11,12,10,0)');
      octx.fillStyle = g2; octx.fillRect(0, 0, 720, 640);
      const g3 = octx.createRadialGradient(1700, 60, 0, 1700, 60, 420);
      g3.addColorStop(0, 'rgba(11,12,10,.7)'); g3.addColorStop(1, 'rgba(11,12,10,0)');
      octx.fillStyle = g3; octx.fillRect(1280, 0, 640, 480);
    }
    drawWires(T, SW);

    /* 1 / 8 · her own box and tag, while she is calm */
    const shA = T < 20 ? 1 - ss(11, 12.6, T) : ss(151.5, 153.2, T);
    if (shA > .02) {
      const b = SHIP.pbounds(BS.whole, SW);
      if (b && b[2] - b[0] < 1150 && b[1] > 130) {
        const br = bracket([Math.max(620, b[0]), b[1], Math.min(1896, b[2]), Math.min(b[3], MENU_Y - 24)], WHc, .5 * shA, 10, 16);
        setTag('ship', 'DDG-51', 'Arleigh Burke · Flight IIA', `${KN} kn`, '', br[0], br[1] - 30, shA);
      } else {
        // close in, she fills the frame: the tag stands on her bridge instead of boxing her
        const p = cam.project(X.ap(SW, DA.spy[0]));
        if (p && p[1] > 200 && p[1] < MENU_Y && p[0] > 640 && p[0] < 1700) { stem(p[0], p[1], 92, shA); SHIP.dot(p[0], p[1], 3, LIME[0], LIME[1], LIME[2], shA); setTag('ship', 'DDG-51', 'Arleigh Burke · Flight IIA', `${KN} kn`, '', p[0] - 1, p[1] - 113, shA); }
      }
    }

    /* 2-4 · the raid: a coral ring on each round, its tag; a drop tag where one is stopped */
    if (T > 17 && T < PH.T_HIT + .3) {
      const placed = [];
      for (let k = 0; k < 4; k++) {
        PH.round(k, S, RO);
        const r = PH.RND[k], tS = PH.filmStop[k];
        let a = RO.a * ss(0, .6, T - PH.filmOf(r.sArr - 34000 / PH.VR) - .2);
        if (k === 3 && T > PH.T_HIT - .9) a *= 1 - ss(PH.T_HIT - .9, PH.T_HIT - .5, T);
        const p = cam.project(RO.p); if (!p) continue;
        if (T >= tS && k < 3) {
          const al = win(T, tS, tS + .2, tS + 1.8, tS + 2.6);
          if (al > .02 && p[1] < MENU_Y && p[0] > 620) { const t = setTag('rs' + k, r.id, 'stopped', '', 'sm drop', p[0] + 20, p[1] - 40, al); leader(p[0], p[1], p[0] + 18, p[1] - 20, 'rgba(238,238,228,.7)', al * .7); }
          continue;
        }
        if (a < .02 || p[0] < 0 || p[0] > 1920 || p[1] < 60 || p[1] > MENU_Y) continue;
        ring(p[0], p[1], 7, CORALc, a);
        const rng = Math.hypot(RO.p[0], RO.p[2]);
        let x = p[0] + 26, y = p[1] - 54;
        for (let g = 0; g < 6; g++) { const hit = placed.find(o => x < o.x + 200 && o.x < x + 200 && Math.abs(y - o.y) < 25); if (!hit) break; y = hit.y - 26; }
        placed.push({ x, y });
        leader(p[0] + 5, p[1] - 5, x - 2, y + 20, 'rgba(255,106,61,.8)', .8 * a);
        setTag('r' + k, r.id, '3M55', rng < 2000 ? `${Math.round(rng)} m` : `${(rng / 1000).toFixed(1)} km`, 'sm coral', x, y, a);
      }
    }
    /* interceptors: a lime tag on the head for a few seconds after launch */
    for (const m of PH.ICP) {
      const t = S - m.sL; if (t < .2 || t > 5.2) continue;
      const hd_ = PH.icHead(m, S); if (!hd_) continue;
      const p = cam.project(hd_.p); if (!p || p[1] < 120 || p[1] > MENU_Y || p[0] < 620 || p[0] > 1860) continue;
      const al = ss(.2, .6, t) * (1 - ss(4.4, 5.2, t));
      leader(p[0], p[1], p[0] + 26, p[1] - 38, 'rgba(198,244,50,.8)', .8 * al);
      setTag('ic' + m.n, m.id, m.n < 3 ? `cell ${m.cell} · fwd` : `cell ${m.cell} · aft`, '', 'sm lime', p[0] + 28, p[1] - 58, al);
    }
    /* 4-5 · the hit: a coral mark at the breach */
    { const al = win(T, PH.T_HIT + .06, PH.T_HIT + .35, 77.5, 79);
      if (al > .02) {
        const p = cam.project(X.ap(SW, PH.HIT_L));
        if (p && p[1] < MENU_Y && p[0] > 620) { leader(p[0], p[1], p[0] + 30, p[1] - 70, CORALc, .8 * al); setTag('hit', 'HIT', 'Hangar block · port', '', 'sm coral', p[0] + 32, p[1] - 90, al); }
      } }
    /* 5 · the scan: the fronts reach each system and its tag condenses */
    if (T > T_STRIKE + .3 && T < 95) {
      const tb = T - T_STRIKE, fadeOut = 1 - ss(93.2, 94.8, T);
      for (let i = 0; i < SCAN_TAGS.length; i++) {
        const q = SCAN_TAGS[i], age = tb - q.rt - .2; if (age < 0) continue;
        const p = cam.project(X.ap(SW, q.anchor)); if (!p || p[1] - q.st < 90 || p[1] > MENU_Y || p[0] < 640) continue;
        const a = ss(0, .35, age) * fadeOut; if (a < .02) continue;
        stem(p[0], p[1], q.st, a);
        SHIP.dot(p[0], p[1], 3, LIME[0], LIME[1], LIME[2], a);
        setTag('sc' + i, q.id, q.lab, q.val, 'lime sm', p[0] - 1, p[1] - q.st - 21, a, sat(age / .9), T);
      }
      const a = win(T, T_STRIKE + 6.5, T_STRIKE + 7.5, 92.8, 94.4), b = SHIP.pbounds(BS.whole, SW);
      if (b && a > .02) { const br = bracket([Math.max(640, b[0]), b[1], Math.min(1896, b[2]), Math.min(b[3], MENU_Y - 24)], WHc, .5 * a, 10, 16); setTag('scan', 'DDG-51', 'damage scan · strike on the mast', `${Math.round(100 * sat(tb / SHIP.XR.SPAN))} %`, '', br[0], br[1] - 30, a, sat((T - T_STRIKE - 6.5) / 1.2), T); }
    }
    /* 6 · the exploded view: placard columns beside the section, a dotted leader to each assembly, a box that fits
       it while it settles */
    if (T > SHIP.EX.O + 1.2 && T < SHIP.EX.B + SHIP.EX.BD * 1.3) {
      const rows = []; let bx0 = 1e9, bx1 = -1e9;
      for (const p of PL) {
        const xp = SHIP.explodeK(p.a0.w0, T), b = plBounds(p, T, SW);
        if (b) { if (b[0] < bx0) bx0 = b[0]; if (b[2] > bx1) bx1 = b[2]; }
        if (xp < .8) continue;
        const a = ss(.8, .97, xp) * (T > SHIP.EX.B ? ss(.55, .9, xp) : 1), q = cam.project(X.ap(SHIP.asmXf(p.a0, T, SW), p.anchor));
        if (q && a > .02) rows.push({ p, a, q, b, y: q[1] });
      }
      // two placard columns stacked from the top at the frame's edges, clear of the pieces; each column fanned by the
      // leaders' angle so no two leaders cross
      const colX = { L: 640, R: 1580 }, Y0 = 176;
      for (const side of ['L', 'R']) {
        const cx0 = colX[side], ang = r => Math.atan2(r.q[1] - Y0, side === 'L' ? r.q[0] - cx0 : cx0 - r.q[0]);
        const rs = rows.filter(r => r.p.side === side).sort((u, v) => ang(u) - ang(v));
        rs.forEach((r, i) => { r.y = Y0 + i * 30; });
        for (const r of rs) {
          const p = r.p, x = colX[side];
          leader(r.q[0], r.q[1], x, r.y, LIMEc, .6 * r.a);
          SHIP.dot(r.q[0], r.q[1], 3, LIME[0], LIME[1], LIME[2], r.a);
          const t = setTag('pl' + p.id, p.id, p.lab, p.val, 'lime sm', x + 6, r.y - 11, r.a);
          if (side === 'L') placeTag(t, x - 6 - tagW(t), r.y - 11);
          const te = settleT(p.a0.w0), bk = ss(te - .5, te - .1, T) * (1 - ss(te + .8, te + 2.2, T));
          if (bk > .02 && T < SHIP.EX.B && r.b) bracket(r.b, LIMEc, .85 * bk * r.a, 4, 8);
        }
      }
    }
    PH.fx.overlay(T, octx, CTX);
  }

  /* ---------- render ---------- */
  const CTX = { octx, cam, pb };
  Object.assign(CTX, { put: DW.put, P3: DW.P3, q: DW.q, glow: DW.glow, dset: DW.dset, dline3: DW.dline3, add: DW.add });
  // the overlay kit for the effect stage's tags
  Object.assign(CTX, { tag: setTag, place: placeTag, tagW, leader, ring, bracket, MENU_Y });
  function render(T) {
    const S = PH.S(T), rate = PH.rate(T), SW = PH.shipX(S);
    for (const t of tagPool.values()) t.on = false;
    camAt(T);
    // X-ray state
    XS.on = T >= T_STRIKE - .05 && T < XC1;
    XS.tb = T - T_STRIKE;
    XS.zs = T < XC0 ? -99 : -84 + 168 * E.inOut(sat((T - XC0) / (XC1 - XC0)));
    XS.solid = ss(94, 97.5, T) * (1 - ss(115, 119, T));
    DW.OCC_DIM = XS.on ? .13 : .07;
    const st = PH.fx.shipStateFx(SHIP.state(T, S), T), hole = PH.fx.breach(T);
    Object.assign(CTX, { T, S, rate, SW, st });
    pb.clear(); octx.clearRect(0, 0, 1920, 1080);
    DW.sync(cam, pb); SHIP.use(cam, pb);
    let t0 = performance.now();
    DW.occClear();
    SHIP.draw(T, S, SW, st, hole); pf('ship', t0); t0 = performance.now();
    DW.occClose();
    // the world steps back while the scan has her
    const gh = win(T, 80.4, 85, 119, 124.5);
    DW.drawSky(1 - .45 * gh); pf('sky', t0); t0 = performance.now();
    DW.drawSea(T, 1 - .6 * gh); pf('sea', t0); t0 = performance.now();
    DW.drawWake(T, 1 - .5 * gh); pf('wake', t0); t0 = performance.now();
    if (T < XC0) {
      for (let k = 0; k < 4; k++) {
        PH.round(k, S, RO); if (RO.a <= .01) continue;
        DW.drawTrail(k, T, RO.a); DW.drawRound(k, T, RO, RO.a);
      }
    }
    if (T > XC0 - .1 && T < XC1 + .1) drawSlice(XS.zs, SW, ss(XC0 - .1, XC0 + .3, T) * (1 - ss(XC1 - .3, XC1 + .1, T)));
    pf('rounds', t0); t0 = performance.now();
    PH.fx.launchFx(T, CTX); PH.fx.interceptFx(T, CTX); PH.fx.ciwsFx(T, CTX); PH.fx.hitFx(T, CTX); PH.fx.damageFx(T, CTX);
    pf('fx', t0); t0 = performance.now();
    drawPour(T, SW);
    FLASH.v = 0; drawBolt(T);
    pb.blit();
    if (FLASH.v > .5) { octx.fillStyle = `rgba(236,244,226,${(FLASH.v / 255).toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); }
    overlays(T, S, SW);
    for (const t of tagPool.values()) if (!t.on && t.el.className !== 'tag off') { t.el.className = 'tag off'; t.el.style.opacity = ''; t.key = ''; }
    if (Math.abs(T - lastUi) > .1 || FILM.seeking || !FILM.playing) { lastUi = T; readout(T, S); }
    pf('ui', t0);
  }

  /* ---------- sound ---------- */
  const cues = [];
  const cue = (t, fn) => { if (t >= 0 && t < D) cues.push([t, fn]); };
  // the raid comes over the horizon, one track at a time
  PH.RND.forEach((r, k) => cue(PH.filmOf(r.sArr - 34000 / PH.VR) + .3 + k * .05, () => { SFX.tone(1250, 1250, .05, 'square', .012); SFX.tone(1875, 1875, .04, 'square', .009, .06); }));
  cue(15.2, () => SFX.tone(220, 180, 1.2, 'sine', .03));
  cue(PH.T_HIT - 1.2, () => SFX.tone(220, 70, 2.2, 'sine', .04));
  // the strike, the fronts, the exploded view, the X-ray closing
  cue(T_STRIKE - .15, () => SFX.tone(90, 60, .5, 'sine', .05));
  cue(T_STRIKE, () => { SFX.crack(); SFX.rumble(4, .16); });
  cue(T_STRIKE + .3, () => { SFX.tone(980, 980, .05, 'square', .012); SFX.noise(6, 3200, .4, .012, 1.2); });
  cue(SHIP.EX.O, () => SFX.tone(220, 330, 1.6, 'sine', .035));
  cue(SHIP.EX.B, () => SFX.tone(330, 220, 1.6, 'sine', .035));
  cue(XC0, () => SFX.noise(XC1 - XC0, 1200, .7, .03, .3));
  for (const c of PH.fx.cues || []) cue(c[0], c[1]);

  FILM.run({
    duration: D,
    chapters: CH.map(c => ({ t: c.t, title: c.title })),
    cues,
    render,
    onChapter(ch) { const i = CH.findIndex(q => q.t === ch.t), c = CH[i]; const k = c ? `${String(i + 1).padStart(2, '0')} · ${c.title} · ${c.sub}` : ''; if (k !== kickCur) { kickCur = k; kickT.textContent = k; } },
  });
  STAGE.dbg = () => ({ log: SHIP.LOG, npts: SHIP.NPTS, sTot: PH.S_TOT, vs: PH.VS, sHit: PH.S_HIT, stops: PH.filmStop, ic: PH.ICP.map(m => [m.tLf, m.tIf, m.tEf, Math.round(m.vmax)]), seaN: Array.from(DW.seaN) });
  STAGE.prof = () => { const o = PROF || {}; const c = {}; for (const k in o) { c[k] = +o[k].toFixed(2); o[k] = 0; } return c; };
  STAGE.PH = { cam, camAt, K, PATH };
})();
