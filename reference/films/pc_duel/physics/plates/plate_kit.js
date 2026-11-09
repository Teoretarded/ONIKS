/* PHYSICS PLATES (window.PL): stills in the Duel's Point Cloud look for the physics notes. One frame per page, drawn
   once: dots into the menus' PointBuf (max blend), hairlines on the overlay canvas, tags and the readout in the DOM
   (pc.css). ?s= sets the raster scale (default 4/3: 2560 x 1440 under a 1920 x 1080 stage). When the frame is drawn
   and the fonts are in, document.title becomes 'done'. */
(function () {
'use strict';
const { V, X } = M3;
const Q = new URLSearchParams(location.search);
const S = +Q.get('s') || 4 / 3;
const W = Math.round(1920 * S), H = Math.round(1080 * S);
const $ = id => document.getElementById(id);
const cv = $('c'), ov = $('o');
cv.width = ov.width = W; cv.height = ov.height = H;
const buf = new PointBuf(cv, [11, 12, 10], { vignette: .55 });
buf.clear();
const octx = ov.getContext('2d');
const cam = new M3.Cam(W, H);
const LIME = [198, 244, 50], CORAL = [255, 106, 61], WH = [255, 255, 255];
const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;

/* fit the stage to the window (a viewer); headless runs at 1920 x 1080 and needs none */
function fit() { const k = Math.min(innerWidth / 1920, innerHeight / 1080); $('stage').style.transform = `scale(${k})`; }
addEventListener('resize', fit); fit();

/* stride-6 points (xyz + normal, zero normal two-sided) from plain [x, y, z] */
function pts(list) { const a = new Float32Array(list.length * 6); list.forEach((p, i) => { a[i * 6] = p[0]; a[i * 6 + 1] = p[1]; a[i * 6 + 2] = p[2]; }); return a; }
/* sample prims into one stride-6 cloud */
function sample(prims, s, seed) { return GEO.sample({ parts: [{ name: 'p', prims }] }, s, seed || 7, {})[0].pts; }

/* a cloud: col a colour or fn(x, y, z) -> colour, a alpha, o.size px, o.back the back faces' share, o.fade a depth
   range [near, far] over which the dots fall to o.fadeTo */
function cloud(P, col, a, o) {
  o = o || {};
  const n = P.length / 6, out = new Float32Array(n * 4), T = o.T || X.make();
  DOTS.project(cam, T, P, out);
  const sz = Math.max(1, Math.round((o.size || 1) * S * .75)), back = o.back === undefined ? .4 : o.back, fn = typeof col === 'function';
  for (let i = 0; i < n; i++) {
    const z = out[i * 4 + 2]; if (z <= 0) continue;
    const f = out[i * 4 + 3];
    let al = a * (f === 2 || f >= 0 ? 1 : back);
    if (o.fade) al *= 1 - (1 - (o.fadeTo || 0)) * E01((z - o.fade[0]) / (o.fade[1] - o.fade[0]));
    const c = fn ? col(P[i * 6], P[i * 6 + 1], P[i * 6 + 2]) : col;
    if (!c || al <= .003) continue;
    buf.dot(out[i * 4], out[i * 4 + 1], sz, c[0], c[1], c[2], Math.min(1, al));
  }
}
const E01 = t => t < 0 ? 0 : t > 1 ? 1 : t;

/* dotted line a -> b in the dot buffer (step m) */
function dline(a, b, step, col, al, o) {
  const n = Math.max(1, Math.round(V.dist(a, b) / step)), L = [];
  for (let k = 0; k <= n; k++) L.push(V.lerp(a, b, k / n));
  cloud(pts(L), col, al, o);
}
/* hairline through 3D points on the overlay (dash: [on, off] in stage px) */
function hair(P3, col, al, o) {
  o = o || {};
  octx.save(); octx.strokeStyle = css(col); octx.globalAlpha = al; octx.lineWidth = (o.w || 1) * S;
  if (o.dash) octx.setLineDash(o.dash.map(v => v * S));
  octx.beginPath(); let on = false;
  for (const p of P3) { const s = cam.project(p); if (!s) { on = false; continue; } if (on) octx.lineTo(s[0], s[1]); else { octx.moveTo(s[0], s[1]); on = true; } }
  octx.stroke(); octx.restore();
}
/* an arrow a -> b: a dotted shaft and a hairline head */
function arrow(a, b, col, al, head) {
  hair([a, b], col, al, { w: 1.4 });
  const sa = cam.project(a), sb = cam.project(b); if (!sa || !sb) return;
  const ang = Math.atan2(sb[1] - sa[1], sb[0] - sa[0]), h = (head || 12) * S;
  octx.save(); octx.fillStyle = css(col); octx.globalAlpha = al; octx.beginPath();
  octx.moveTo(sb[0], sb[1]);
  octx.lineTo(sb[0] - h * Math.cos(ang - .32), sb[1] - h * Math.sin(ang - .32));
  octx.lineTo(sb[0] - h * Math.cos(ang + .32), sb[1] - h * Math.sin(ang + .32));
  octx.closePath(); octx.fill(); octx.restore();
}

/* a tag at a world point (or [sx, sy] raster px): a leader from the point to the chip (dx, dy stage px; dx < 0 puts the
   tag to the left), a small square on the point. cls: '' | 'lime' | 'coral' | 'sm' */
function tag(p, chip, label, val, dx, dy, cls) {
  const s = p.length === 3 ? cam.project(p) : p; if (!s) return;
  const x = s[0] / S, y = s[1] / S, tx = x + dx, ty = y + dy;
  const col = /coral/.test(cls || '') ? CORAL : /lime/.test(cls || '') ? LIME : WH;
  octx.save(); octx.strokeStyle = css(col); octx.globalAlpha = .75; octx.lineWidth = S;
  octx.beginPath(); octx.moveTo(s[0], s[1]); octx.lineTo(tx * S, ty * S); octx.stroke();
  octx.globalAlpha = 1; octx.fillStyle = css(col); octx.fillRect(s[0] - 2.5 * S, s[1] - 2.5 * S, 5 * S, 5 * S); octx.restore();
  const el = document.createElement('div');
  el.className = 'tag ' + (cls || '');
  el.innerHTML = `<b>${chip}</b>${label ? `<i>${label}</i>` : ''}${val ? `<span class="v">${val}</span>` : ''}`;
  el.style.transform = `translate(${tx}px, ${ty}px) translate(${dx < 0 ? -100 : 0}%, -50%)`;
  $('ui').appendChild(el);
}
/* a free mono label at a world point (axis ticks) */
function label(p, text, dx, dy, cls) {
  const s = p.length === 3 ? cam.project(p) : p; if (!s) return;
  const el = document.createElement('div'); el.className = 'ax ' + (cls || ''); el.textContent = text;
  el.style.transform = `translate(${s[0] / S + (dx || 0)}px, ${s[1] / S + (dy || 0)}px) translate(${dx < 0 ? -100 : 0}%, -50%)`;
  $('ui').appendChild(el);
}

/* the readout: kick (number, title), lines of [text, cls] */
function readout(n, title, lines) {
  $('kick').textContent = `${String(n).padStart(2, '0')} · ${title}`;
  $('ro').innerHTML = lines.map(l => `<div>${l}</div>`).join('');
}

/* a sea lattice: dots on y = 0 every step m over the box, fading with distance */
function sea(x0, x1, z0, z1, step, al, fade) {
  const L = [];
  for (let x = x0; x <= x1; x += step) for (let z = z0; z <= z1; z += step) L.push([x, 0, z]);
  cloud(pts(L), WH, al, { fade, fadeTo: 0 });
}
/* stars: seeded points on a far shell */
function stars(n, r, al, seed) {
  const g = M3.rng(seed || 3), L = [];
  for (let i = 0; i < n; i++) { const u = g() * 2 - 1, t = g() * Math.PI * 2, q = Math.sqrt(1 - u * u); L.push(V.add(cam.eye, [q * Math.cos(t) * r, u * r, q * Math.sin(t) * r])); }
  cloud(pts(L), WH, al);
}

function done() { buf.blit(); document.fonts.ready.then(() => { document.title = 'done'; }); }

window.PL = { S, W, H, cam, buf, octx, LIME, CORAL, WH, pts, sample, cloud, dline, hair, arrow, tag, label, readout, sea, stars, done };
})();
