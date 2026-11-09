/* Visibility concepts: the same scene in the game's own renderer, drawn four ways (0 current, 1 A outline,
   2 B contrast, 3 C markers). Standalone: nothing in game/src is changed; the renderer, models and terrain are
   imported read-only, shader changes are patched copies (post.js).
   Keys: 0-3 the look · N / M / F near / mid / far · T follow the next unit · P pause · [ ] slower / faster ·
   S still (game/shots/vis_<look>_<view>.png) · H hide the text. Mouse: right-drag orbit, wheel zoom, WASD pan.
   Console: VIS.series() takes every look at near / mid / far (and the jet close up). */
import { Renderer } from '../src/engine/renderer.js';
import { Wake } from '../src/engine/fx.js';
import { stubMap } from '../src/engine/stubmap.js';
import { buildScene, CYCLE } from './scene.js';
import { Post } from './post.js';

const DEG = Math.PI / 180;
const $ = id => document.getElementById(id);
export const LOOKS = { '0': 'Current', a: 'Outline', b: 'Contrast', c: 'Markers' };
const ORDER = ['0', 'a', 'b', 'c'];
const RATES = [1, .5, .25, .1];
const T_SHOW = CYCLE * 3 + 6.4;                 // skimmers ~1 km short of the destroyer, the SM-6 climbing

async function getMap() {
  try { const W = await import('../src/world/maps.js'); const m = await W.loadMap('krasnaya_kosa'); if (m && m.heights) return m; }
  catch (e) { console.warn('vis: real map unavailable, stub coast', e); }
  return stubMap();
}

export async function boot(look, opts) {
  opts = opts || {};
  const map = await getMap();
  const R = new Renderer({ canvas: $('gl'), overlay: $('ov'), map, renderScale: 1, terrain: { densNear: 140, densFar: 380 } });
  const cam = R.camera;
  cam.attach($('gl'));
  cam.edge = false;
  try { const DM = await import('../src/data/models.js'); R.models.registerAll(DM.EXTRA_MODELS, DM.MODEL_INFO); }
  catch (e) { console.warn('vis: data/models.js not registered', e); }
  const S = buildScene(R, map), U = S.U;
  let post = null;
  try { post = new Post(R); } catch (e) { console.error('vis: post passes unavailable', e); }
  for (const d of S.LIST) R.models.warm(d.key);

  // the jet's racetrack phase: at the showcase moment it passes ~700 m shoreward of the destroyer
  { const d = S.ddgPath(T_SHOW), goal = [d.x - S.ax * 700, d.z - S.az * 700]; let best = 0, bd = 1e18;
    for (let q = 0; q < 170; q += .1) { const j = S.jet(q); const dd = (j.x - goal[0]) ** 2 + (j.z - goal[1]) ** 2; if (dd < bd) { bd = dd; best = q; } }
    const jet0 = S.jet; S.jet = t => jet0(t - T_SHOW + best);
    // scene.update calls its own jet(): route it through the phased one
    const upd = S.update; S.update = t => { const L = upd(t), j = S.jet(t); Object.assign(U.jet, { hdg: j.hdg, roll: j.roll }); U.jet.T[0] = j.x; U.jet.T[1] = j.y; U.jet.T[2] = j.z; return L; }; }

  // the near moment: the first skimmer ~250 m before its closest pass by the destroyer
  let T_NEAR = T_SHOW;
  { let bd = 1e18; for (let q = T_SHOW - 4; q < T_SHOW + 8; q += .02) { const a = S.skimmer(q, 0), d = S.ddgPath(q); if (!a) continue; const dd = (a.x - d.x) ** 2 + (a.z - d.z) ** 2; if (dd < bd) { bd = dd; T_NEAR = q; } } T_NEAR -= .35; }
  const st = { look: ORDER.includes(look) ? look : '0', t: T_SHOW - 5, rate: 1, paused: false, follow: -1, view: 'mid', ui: true };
  const seaYaw = Math.atan2(-S.ax, -S.az);       // looking from the sea toward the shore
  // the views: near (the destroyer as the skimmers pass her bow), mid (the whole scene at play range), far (~20 km)
  const mid = () => { const p = U.ddg.T, c = U.cvn.T, s = U.s1.live ? U.s1.T : S.tel; return [(p[0] * 2 + c[0] + s[0]) / 4, 0, (p[2] * 2 + c[2] + s[2]) / 4]; };
  const VIEWS = {
    near: () => { const p = S.ddgPath(st.t), h = S.ddgPath(st.t).hdg; return { target: [p.x - S.ax * 120 + S.px * 170, 0, p.z - S.az * 120 + S.pz * 170], dist: 700, yaw: Math.atan2(S.px, S.pz) + Math.PI - 20 * DEG, pitch: 9 * DEG }; },
    mid: () => ({ target: mid(), dist: 6500, yaw: seaYaw + 58 * DEG, pitch: 16 * DEG }),
    far: () => ({ target: mid(), dist: 20000, yaw: seaYaw + 52 * DEG, pitch: 24 * DEG }),
    jet: () => { const j = U.jet.T; return { target: [j[0], 0, j[2]], dist: 400, yaw: U.jet.hdg + 125 * DEG, pitch: 12 * DEG }; },
  };
  function view(name, jump) {
    const v = VIEWS[name](); st.view = name; st.follow = -1; cam.follow(null);
    if (jump) cam.set(v); else cam.flyTo(v.target, { dist: v.dist, yaw: v.yaw, pitch: v.pitch, time: 1.2 });
    st.chase = name === 'jet';
  }
  /* the jet close up: an exact view each frame from off its right rear quarter, a little above */
  function chase() {
    const j = U.jet.T, h = U.jet.hdg, f = [Math.sin(h), Math.cos(h)], r = [Math.cos(h), -Math.sin(h)];
    const eye = [j[0] - f[0] * 95 + r[0] * 70, j[1] + 16, j[2] - f[1] * 95 + r[1] * 70];
    cam.view = { eye, look: [j[0] + f[0] * 6, j[1], j[2] + f[1] * 6] };
    cam.goal.target = [j[0], 0, j[2]]; cam.target = cam.goal.target.slice();
  }
  S.update(st.t); view('mid', true);
  const FOLLOW = [U.ddg, U.cvn, U.jet, U.s1, U.sm6, U.tel];

  // ---------- per look ----------
  function styleUnits(list) {
    for (const d of list) {
      d.bright = st.look === 'b' ? 1.1 : undefined;
      // A: aircraft and rounds keep every return (no per-pixel thinning): a fin seen face-on stays a solid plate
      d.dotSpacing = st.look === 'a' && (d.kind === 'air' || d.kind === 'msl') ? 0 : undefined;
      // C: a faint fill of the side's colour over the whole unit, not only its silhouette
      d.tintFace = st.look === 'c' ? (d.side === 'hostile' ? .42 : .34) : undefined;
      d.tintK = st.look === 'c' ? .75 : d.kind === 'msl' ? .45 : undefined;
    }
  }
  /* B: the sea-skimmers' short bright trail, and a streak on the water under them */
  const trail = new Float32Array(3 * 256); let nTrail = 0;
  function skimTrails() {
    const fx = R.fx; nTrail = 0;
    for (const d of [U.s1, U.s2]) {
      if (!d.live || !d.dir) continue;
      const a0 = d.alpha === undefined ? 1 : d.alpha, dx = d.dir[0], dz = d.dir[1];
      for (let k = 1; k <= 100; k++) {
        const b = k * 1.6, u = k / 100;
        if (b > d.s) break;
        const x = d.T[0] - dx * b, z = d.T[2] - dz * b;
        fx.dotXYZ(x, d.T[1] + .4, z, 2, 255, 250, 240, a0 * Math.pow(1 - u, 1.3), 'max');
        if (k % 3 === 0 && u < .75 && nTrail < 256) { trail[nTrail * 3] = x; trail[nTrail * 3 + 1] = d.T[1] + .4; trail[nTrail * 3 + 2] = z; nTrail++; }
        const g = Math.max(0, R.terrain.heightAt(x, z));
        if (g < .5 && (k & 1)) fx.dotXYZ(x, .3, z, 1, 235, 235, 225, a0 * .6 * (1 - u), 'max');
      }
    }
  }
  /* C: the markers: corner brackets that fit the unit (never under 18 px), the name, a dotted drop line to the
     surface with the height for what flies, a 1 s velocity tick for the rounds */
  const LIME = '#C6F432', CORAL = '#FF6A3D';
  function markers(list) {
    const ov = R.overlay; if (!ov) return;
    const c = ov.ctx, k = ov.ui, q = [0, 0, 0], q2 = [0, 0, 0], taken = [];
    const free = (x0, y0, x1, y1) => { for (const r of taken) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return false; taken.push([x0, y0, x1, y1]); return true; };
    for (const d of list) {
      if (!d.live || (d.alpha !== undefined && d.alpha < .1)) continue;
      const col = d.side === 'hostile' ? CORAL : LIME;
      let b = R.screenBox(d);
      if (!b) continue;
      if (b[2] < -40 || b[0] > ov.W + 40 || b[3] < -40 || b[1] > ov.H + 40) continue;
      const min = 18 * k, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      const w = Math.max(min, b[2] - b[0] + 6 * k), h = Math.max(min, b[3] - b[1] + 6 * k);
      const x0 = Math.round(cx - w / 2) + .5, x1 = Math.round(cx + w / 2) + .5, y0 = Math.round(cy - h / 2) + .5, y1 = Math.round(cy + h / 2) + .5;
      const L = Math.max(4 * k, Math.min(12 * k, Math.min(w, h) * .3));
      c.strokeStyle = col; c.lineWidth = 1.5; c.globalAlpha = .95; c.beginPath();
      for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { c.moveTo(px + sx * L, py); c.lineTo(px, py); c.lineTo(px, py + sy * L); }
      c.stroke(); c.globalAlpha = 1;
      const air = d.kind === 'air' || d.kind === 'msl';
      // the rounds: where they will be in 1 s (capped on screen), a thin tick ahead
      let tickR = false;
      if (d.kind === 'msl' && d.v > 50) {
        const p = d.pitch || 0, v = Math.min(d.v, 1200);
        const f = [Math.sin(d.hdg) * Math.cos(p), Math.sin(p), Math.cos(d.hdg) * Math.cos(p)];
        if (cam.project(d.T, q) && cam.project([d.T[0] + f[0] * v, d.T[1] + f[1] * v, d.T[2] + f[2] * v], q2)) {
          let dx = q2[0] - q[0], dy = q2[1] - q[1]; const l = Math.hypot(dx, dy) || 1, cap = Math.min(l, 46 * k);
          dx /= l; dy /= l; tickR = dx > .35;
          const r0 = Math.max(w, h) * .5 + 3 * k;
          c.strokeStyle = col; c.globalAlpha = .85; c.lineWidth = 1; c.beginPath();
          c.moveTo(q[0] + dx * r0, q[1] + dy * r0); c.lineTo(q[0] + dx * (r0 + cap), q[1] + dy * (r0 + cap)); c.stroke(); c.globalAlpha = 1;
        }
      }
      // the name by the top corner away from the tick, the height under it for what flies
      const lw = 66 * k, lx = tickR ? x0 - 5 * k : x1 + 5 * k, al = tickR ? 'right' : 'left';
      const lab = tickR ? free(x0 - 3 * k - lw, y0 - 2 * k, x0 - 3 * k, y0 + (air ? 24 : 12) * k) : free(x1 + 3 * k, y0 - 2 * k, x1 + 3 * k + lw, y0 + (air ? 24 : 12) * k);
      if (lab) ov.text(lx, y0 + 9 * k, d.name, { size: 10.5, col, a: .95, align: al });
      // drop line to the surface under it
      if (air && d.T[1] > 3) {
        const g = Math.max(0, R.terrain.heightAt(d.T[0], d.T[2]));
        if (cam.project([d.T[0], g, d.T[2]], q)) {
          if (q[1] - y1 > 6 * k) ov.dline(cx, y1 + 2, q[0], q[1], 3 * k, 1, col, .7);
          c.fillStyle = col; c.globalAlpha = .9; c.fillRect(Math.round(q[0] - 4 * k), Math.round(q[1]), Math.round(8 * k), 1); c.globalAlpha = 1;
          const alt = Math.round(d.T[1] - g);
          if (lab) ov.text(lx, y0 + 21 * k, alt >= 1000 ? (alt / 1000).toFixed(1) + ' km' : alt + ' m', { size: 10, col: 'rgba(255,255,255,.72)', upper: false, align: al });
        }
      }
    }
  }

  // ---------- UI ----------
  const lookEl = $('look'), readEl = $('read'), rowEl = $('row');
  function setLook(l) {
    st.look = l; lookEl.textContent = LOOKS[l];
    if (rowEl) for (const el of rowEl.children) el.classList.toggle('on', el.dataset.k === l);
    document.title = 'ONIKS · ' + LOOKS[l];
  }
  if (rowEl) {
    rowEl.innerHTML = ORDER.map((l, i) => `<span data-k="${l}"><b>${i}</b>${LOOKS[l]}</span>`).join('');
    for (const el of rowEl.children) el.addEventListener('click', () => setLook(el.dataset.k));
  }
  setLook(st.look);
  window.addEventListener('keydown', e => {
    if (e.repeat && !/Bracket/.test(e.code)) return;
    const c = e.code;
    if (c === 'Digit0' || c === 'Numpad0') setLook('0');
    else if (c === 'Digit1' || c === 'Numpad1') setLook('a');
    else if (c === 'Digit2' || c === 'Numpad2') setLook('b');
    else if (c === 'Digit3' || c === 'Numpad3') setLook('c');
    else if (c === 'KeyN') view('near'); else if (c === 'KeyM') view('mid'); else if (c === 'KeyF') view('far');
    else if (c === 'KeyJ') view('jet');
    else if (c === 'KeyT') { st.chase = false;  st.follow = (st.follow + 1) % FOLLOW.length; const d = FOLLOW[st.follow]; cam.follow(() => d.T, false); cam.flyTo(d.T, { dist: Math.max(120, Math.min(cam.dist, 2500)), time: .9 }); cam.fly.track = () => d.T; }
    else if (c === 'KeyP') st.paused = !st.paused;
    else if (c === 'BracketLeft') st.rate = RATES[Math.min(RATES.length - 1, RATES.indexOf(st.rate) + 1)];
    else if (c === 'BracketRight') st.rate = RATES[Math.max(0, RATES.indexOf(st.rate) - 1)];
    else if (c === 'KeyS') still(`vis_${st.look}_${st.view}`);
    else if (c === 'KeyH') { st.ui = !st.ui; document.body.classList.toggle('noui', !st.ui); }
  });

  // ---------- frame ----------
  let last = performance.now(), msAvg = 0;
  function render(dt) {
    const t0 = performance.now();
    const list = S.update(st.t);
    if (st.chase) chase();
    R.frame(dt, st.t);
    styleUnits(list);
    for (const d of list) if (d.live && !(d.alpha !== undefined && d.alpha <= .02)) R.draw(d);
    S.drawFx(st.t, Wake);
    if (st.look === 'b') skimTrails();
    const pp = post && (st.look === 'a' || st.look === 'b');
    if (pp) { post.begin(); if (st.look === 'a') post.thickOn(); }
    try { R.end(); } finally { if (pp && st.look === 'a') post.thickOff(); }
    if (pp) {
      if (st.look === 'a') { post.thickSpecks(list); post.mask(list); post.outline(); }
      else { post.mask(list); post.maskPoints(trail, nTrail, 'hostile', 2); post.grade(); }
    }
    if (st.look === 'c') markers(list);
    const ms = performance.now() - t0; msAvg += (ms - msAvg) * .05;
    if (st.ui) {
      const dist = cam.dist, ds = dist >= 1000 ? (dist / 1000).toFixed(dist < 10000 ? 1 : 0) + ' km' : Math.round(dist) + ' m';
      readEl.innerHTML = `<span>range <b>${ds}</b></span><span><b>${st.rate === 1 ? 'x1' : 'x' + st.rate}</b>${st.paused ? ' paused' : ''}</span><span>cpu <b>${msAvg.toFixed(1)}</b> ms</span>`;
    }
  }
  function loop(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (!st.paused) st.t += dt * st.rate;
    render(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- stills ----------
  async function still(name) {
    // render now and read back in the same task (no preserveDrawingBuffer), with the overlay composited on top
    render(0);
    const gl = $('gl'), ov = $('ov'), cv = document.createElement('canvas');
    cv.width = gl.width; cv.height = gl.height;
    const c = cv.getContext('2d');
    c.drawImage(gl, 0, 0);
    c.drawImage(ov, 0, 0, cv.width, cv.height);
    // the look's name, as on the page
    c.font = `500 ${Math.round(15 * cv.height / 1080)}px 'Geist Mono', monospace`; c.fillStyle = 'rgba(255,255,255,.85)';
    c.fillText(LOOKS[st.look].toUpperCase(), Math.round(40 * cv.height / 1080), Math.round(56 * cv.height / 1080));
    const url = cv.toDataURL('image/png');
    await fetch('/save?path=game/shots/' + name + '.png', { method: 'POST', body: url });
    console.log('vis: still', name);
    return name;
  }
  /* every look at near / mid / far and the jet, frozen at the showcase moment (times per view) */
  async function series(looks, views) {
    const was = { paused: st.paused, t: st.t, look: st.look };
    st.paused = true;
    const out = [];
    for (const v of views || ['near', 'mid', 'far', 'jet']) {
      st.t = v === 'near' ? T_NEAR : T_SHOW;
      S.update(st.t);
      const vv = VIEWS[v](); st.view = v; cam.follow(null); cam.set(vv); st.chase = v === 'jet';
      for (let i = 0; i < 40; i++) { render(1 / 60); await new Promise(r => setTimeout(r, 16)); }   // let the sampling budget fill the levels
      for (const l of looks || ORDER) { setLook(l); render(1 / 60); await new Promise(r => setTimeout(r, 30)); out.push(await still(`vis_${l}_${v}`)); }
    }
    st.paused = was.paused; setLook(was.look); st.chase = false;
    return out;
  }
  async function bench(n) {
    const gl = R.gl, px = new Uint8Array(4); let tot = 0;
    for (let i = 0; i < (n || 60); i++) { const t0 = performance.now(); render(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); tot += performance.now() - t0; }
    return +(tot / (n || 60)).toFixed(2);
  }
  window.VIS = { R, S, st, post, cam, view, setLook, still, series, bench, render, T_SHOW };
  document.body.classList.add('ready');
}
