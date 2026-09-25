/* Minimap (bottom right), in the films' inset frame: the map's dot preview (rendered once) with the live picture on
   top. Own units lime, classified tracks coral, contacts a white ?, missiles in flight, the sites by owner, own
   radars' sweeps as a turning line with a short afterglow, the camera's ground footprint as a dotted lime outline.
   Left click / drag moves the camera, right click orders the selection to move there, the wheel zooms. */
import { renderPreview } from '../../world/preview.js';
import { TAU } from './fmt.js';

const LIME = '#C6F432', CORAL = '#FF6A3D';
const W0 = 340;                       // frame width, px at 1080p

export function createMinimap(game, hud) {
  const { sim, map } = game, cam = game.camera;
  const el = hud.div('h-br');
  el.innerHTML = `<div class="h-map frame"><div class="fl"><span>Picture</span><i></i><span class="sp"></span><span class="ct"></span></div><canvas class="hit"></canvas></div>`;
  const frame = el.firstChild, cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
  const ctEl = el.querySelector('.ct');
  el.querySelector('.fl i').textContent = `${Math.round(map.W / 1000)} × ${Math.round(map.H / 1000)} km`;
  // the frame takes the map's shape: 340 px on the long side at 1080p (300 when the map is taller than wide)
  const cw = map.W >= map.H ? W0 : Math.round(Math.max(200, 300 * map.W / map.H));
  const ch = map.W >= map.H ? Math.round(Math.max(190, W0 * map.H / map.W)) : 300;
  frame.style.width = cw + 'px'; frame.style.height = ch + 'px';
  let base = null, M = null, k = 1, bw = 0, bh = 0, last = -1, ctKey = '';
  const pings = [];                   // { x, z, t0, col, dur }

  function build() {
    k = hud.scale * (window.devicePixelRatio || 1);
    const w = Math.round(cw * k), h = Math.round(ch * k);
    if (w === bw && h === bh && base) return;
    bw = w; bh = h;
    cv.width = w; cv.height = h; cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    base = document.createElement('canvas'); base.width = w; base.height = h;
    const t0 = performance.now();
    M = renderPreview(map, base, { labels: false, objectives: false, spawns: false, contours: true, pad: 0, dpr: k, density: .9 });
    hud.stats.previewMs = Math.round(performance.now() - t0);
    last = -1;
  }
  const X = x => M.ox + x * M.scale, Z = z => M.oy - z * M.scale;
  function toWorld(e) {
    const r = cv.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * bw, py = (e.clientY - r.top) / r.height * bh;
    const x = (px - M.ox) / M.scale, z = (M.oy - py) / M.scale;
    return [Math.max(-map.W / 2, Math.min(map.W / 2, x)), Math.max(-map.H / 2, Math.min(map.H / 2, z))];
  }

  /* ---------- input ---------- */
  let drag = false;
  const lookAt = (w, instant) => {
    const d = game.getSystem('director'); if (d && d.on && d.set) d.set(false);
    if (game.follow) game.follow(null); else cam.follow(null);
    cam.fly = null;
    const y = Math.max(0, game.R.terrain.heightAt(w[0], w[1]));
    cam.goal.target = [w[0], y, w[1]];
    if (instant) { cam.target[0] = w[0]; cam.target[2] = w[1]; }
  };
  cv.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    if (!M) return;
    const w = toWorld(e);
    if (e.button === 0) { drag = true; lookAt(w, false); }
    else if (e.button === 2) moveOrder(w, e.shiftKey);
  });
  window.addEventListener('mousemove', e => { if (drag && M) lookAt(toWorld(e), true); });
  window.addEventListener('mouseup', () => { drag = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); cam.zoomAt(undefined, undefined, Math.exp(Math.max(-600, Math.min(600, e.deltaY)) * .0016)); }, { passive: false });

  function moveOrder([x, z], queue) {
    const us = game.selected().filter(u => u.def.speed > 0 && (!u.aboard || u.def.domain === 'air'));
    if (!us.length) { game.bus.emit('toast', { text: 'Select units to move', bad: true }); hud.click(true); return; }
    const h = map.h(x, z), land = [], sea = [], helo = [], orbit = [];
    for (const u of us) {
      const d = u.def;
      if (d.domain === 'land') { if (h > .5 && map.slope(x, z) < (d.slopeMax || .4) + .15) land.push(u.id); }
      else if (d.domain === 'sea') { if (h < -(d.draught || 5) - 2) sea.push(u.id); }
      else if (u.type === 'helo') helo.push(u.id);
      else orbit.push(u.id);
    }
    if (!land.length && !sea.length && !helo.length && !orbit.length) { game.bus.emit('toast', { text: 'No route', bad: true }); hud.click(true); return; }
    if (land.length) game.order(land, { kind: 'move', x, z, queue });
    if (sea.length) game.order(sea, { kind: 'move', x, z, queue });
    if (helo.length) game.order(helo, { kind: 'move', x, z, queue });
    if (orbit.length) game.order(orbit, { kind: 'patrol', x, z, r: 1500, queue });
    ping(x, z, LIME, 1.4);
    hud.click();
  }
  function ping(x, z, col, dur) { pings.push({ x, z, col, t0: game.realT, dur: dur || 2 }); if (pings.length > 12) pings.shift(); }

  /* ---------- drawing helpers (backing px) ---------- */
  function sq(x, y, s, col, a) { ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s); }
  /* dotted strokes: one dashed path each (1 px dashes read as the films' square dots, and stay cheap) */
  const dash = [0, 0];
  function dotted(col, a, step) { const s = Math.max(1, Math.round(k * .9)); dash[0] = s; dash[1] = Math.max(1, (step || 3 * k) - s); ctx.setLineDash(dash); ctx.lineWidth = s; ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineCap = 'butt'; }
  function dcirc(x, y, r, col, a, step) { dotted(col, a, step); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
  function dline(x0, y0, x1, y1, col, a, step) { dotted(col, a, step); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]); }
  /* the camera's footprint on the ground: the four screen corners' rays on the sea-level plane (far ones capped) */
  function footprint(out) {
    const W = cam.W, H = cam.H, far = Math.max(cam.dist * 6, 25000), e = cam.eye;
    const C = [[0, 0], [W, 0], [W, H], [0, H]];
    for (let i = 0; i < 4; i++) {
      const r = cam.ray(C[i][0], C[i][1]), d = r.d, gy = cam.target[1];
      let t;
      if (d[1] < -1e-4) t = Math.min((gy - e[1]) / d[1], far / Math.max(1e-3, Math.hypot(d[0], d[2])));
      else t = far / Math.max(1e-3, Math.hypot(d[0], d[2]));
      out[i][0] = e[0] + d[0] * t; out[i][1] = e[2] + d[2] * t;
    }
    return out;
  }
  const fp = [[0, 0], [0, 0], [0, 0], [0, 0]];

  function draw() {
    const me = game.side, t = game.t, fog = sim.fog;
    ctx.globalAlpha = 1; ctx.fillStyle = '#0B0C0A'; ctx.fillRect(0, 0, bw, bh);
    ctx.globalAlpha = .5;               // the ground stays behind the picture
    ctx.drawImage(base, 0, 0);
    // sites by owner
    for (const o of sim.objectives) {
      const x = X(o.x), y = Z(o.z), col = o.owner === me ? LIME : o.owner ? CORAL : '#FFFFFF';
      dcirc(x, y, Math.max(3 * k, o.r * M.scale), col, o.owner ? .7 : .35);
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(Math.PI / 4); ctx.globalAlpha = o.owner ? .95 : .55; ctx.fillStyle = col;
      const s = 3.4 * k; ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore();
    }
    // radar sweeps of own radiating radars
    for (const u of sim.alive(me)) {
      const R = u.def.sensors.radar;
      if (!R || !u.radarOn || u.aboard || u.antW <= 0) continue;
      const x = X(u.pos[0]), y = Z(u.pos[2]), rr = Math.max(R.surf, R.air) * M.scale;
      const a = u.hdg + u.antA + u.antW * (t - u.antT);
      const spin = u.antW * game.timeRate;                 // rad per real second on screen
      dcirc(x, y, rr, LIME, .16, 5 * k);
      if (spin < 14) {
        // the beam: a dotted lime edge with a short afterglow of fainter dotted lines behind it (the films' scope)
        for (let j = 3; j >= 0; j--) {
          const b = a - j * .07;
          dline(x, y, x + Math.sin(b) * rr, y - Math.cos(b) * rr, LIME, j ? .3 - j * .07 : .8, j ? 4 * k : 2.5 * k);
        }
      }
    }
    // hostile picture
    let ntr = 0, nct = 0;
    ctx.font = `500 ${Math.round(9 * k)}px 'Geist Mono', monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const u of sim.list()) {
      if (u.side === me || !u.alive || u.aboard) continue;
      const v = game.vis(u);
      if (!v) continue;
      const c = sim.contact(me, u.id), p = c && fog ? c.pos : u.pos;
      const x = X(p[0]), y = Z(p[2]);
      if (v === 'track') {
        ntr++;
        const s = (u.def.domain === 'sea' ? 4.2 : u.def.domain === 'air' ? 2.6 : 3.4) * k;
        sq(x, y, s, CORAL, game.selection.has(u.id) ? 1 : .95);
        if (game.selection.has(u.id)) { ctx.globalAlpha = 1; ctx.strokeStyle = CORAL; ctx.lineWidth = k; ctx.strokeRect(Math.round(x - s) + .5, Math.round(y - s) + .5, Math.round(s * 2), Math.round(s * 2)); }
      } else {
        nct++;
        if (c && c.err * M.scale > 5 * k) dcirc(x, y, Math.min(c.err * M.scale, 40 * k), '#FFFFFF', .28, 4 * k);
        ctx.globalAlpha = .9; ctx.fillStyle = '#FFFFFF'; ctx.fillText('?', Math.round(x), Math.round(y));
      }
    }
    // missiles in flight (own; hostile ones the side can see)
    for (const p of sim.projectiles.values()) {
      if (!p.alive || !p.P || p.P.mode === 'ballistic') continue;
      const own = p.side === me;
      if (!own && !sim.projVisible(me, p)) continue;
      if (own && !p.P.threat) continue;
      sq(X(p.pos[0]), Z(p.pos[2]), 2 * k, own ? LIME : CORAL, 1);
    }
    // own units
    for (const u of sim.alive(me)) {
      if (u.aboard) continue;
      const x = X(u.pos[0]), y = Z(u.pos[2]), sel = game.selection.has(u.id);
      const s = (u.def.domain === 'sea' ? 4.2 : u.def.domain === 'air' ? 2.4 : 3.2) * k * (u.def.hq ? 1.3 : 1);
      sq(x, y, s, LIME, 1);
      if (sel) { ctx.globalAlpha = .95; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(1, k * .8); ctx.strokeRect(Math.round(x - s) + .5, Math.round(y - s) + .5, Math.round(s * 2), Math.round(s * 2)); }
    }
    // pings
    for (let i = pings.length - 1; i >= 0; i--) {
      const P = pings[i], a = (game.realT - P.t0) / P.dur;
      if (a >= 1) { pings.splice(i, 1); continue; }
      dcirc(X(P.x), Z(P.z), (3 + a * 14) * k, P.col, 1 - a, 2.5 * k);
    }
    // camera footprint
    footprint(fp);
    for (let i = 0; i < 4; i++) { const a = fp[i], b = fp[(i + 1) % 4]; dline(X(a[0]), Z(a[1]), X(b[0]), Z(b[1]), LIME, .9, 3 * k); }
    sq(X(cam.target[0]), Z(cam.target[2]), 2 * k, LIME, 1);
    ctx.globalAlpha = 1;
    const ck = `${ntr} trk · ${nct} ?`;
    if (ck !== ctKey) { ctKey = ck; ctEl.innerHTML = `<b>${ntr}</b> trk · <b>${nct}</b> ?`; }
  }

  return {
    ping,
    resize() { build(); },
    update() {
      if (!M) build();
      if (game.realT - last < 1 / 30) return;
      last = game.realT;
      const t0 = performance.now();
      draw();
      hud.stats.mapMs = hud.stats.mapMs * .9 + (performance.now() - t0) * .1;
    },
  };
}
