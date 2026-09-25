/* Top-down dot preview of a Map in the film style (Point Cloud): graphite ground, land as white LiDAR
   dots lit by height and slope, the sea as sparse dim returns with depth contours, a crisp coastline,
   objectives as small lime marks, spawns labelled in small mono text.

   renderPreview(map, canvas, opts) -> { scale, ox, oy, toCanvas(x, z) -> [px, py], toWorld(px, py) -> [x, z] }
   opts: { fit: 'contain'|'cover' (contain), pad: px (12), labels: true, places: false, roads: false,
           objectives: true, spawns: true, contours: true, font: 'Geist Mono', dpr: 1 (canvas px per css px
           for text and marks), bg: true, view: [x0, z0, x1, z1] world box to frame instead of the whole map }
   Draws into the canvas's current pixel size. ~15-60 ms at 640x360. */

const LIME = '#C6F432', CORAL = '#FF6A3D', BG = [11, 12, 10];
const L = (() => { const v = [0.5, 0.75, 0.62], n = Math.hypot(...v); return v.map(c => c / n); })();

function hsh(i, j) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function renderPreview(map, canvas, opts) {
  opts = opts || {};
  const Wc = canvas.width, Hc = canvas.height, ctx = canvas.getContext('2d');
  const dpr = opts.dpr || 1, pad = (opts.pad == null ? 12 : opts.pad) * dpr;
  const view = opts.view || [-map.W / 2, -map.H / 2, map.W / 2, map.H / 2];
  const vw = view[2] - view[0], vh = view[3] - view[1];
  const sx = (Wc - 2 * pad) / vw, sy = (Hc - 2 * pad) / vh;
  const scale = opts.fit === 'cover' ? Math.max(Wc / vw, Hc / vh) : Math.min(sx, sy);   // px per metre
  const cx = (view[0] + view[2]) / 2, cz = (view[1] + view[3]) / 2;
  const ox = Wc / 2 - cx * scale, oy = Hc / 2 + cz * scale;
  const toCanvas = (x, z) => [ox + x * scale, oy - z * scale];
  const toWorld = (px, py) => [(px - ox) / scale, (oy - py) / scale];

  const img = ctx.createImageData(Wc, Hc), D = img.data;
  // background: graphite with a soft vignette
  for (let y = 0; y < Hc; y++) {
    const vy = (y / Hc - 0.5) * 2;
    for (let x = 0; x < Wc; x++) {
      const vx = (x / Wc - 0.5) * 2, v = 1 - 0.22 * Math.min(1, (vx * vx * 0.6 + vy * vy * 0.9));
      const o = (y * Wc + x) * 4;
      D[o] = BG[0] * v; D[o + 1] = BG[1] * v; D[o + 2] = BG[2] * v; D[o + 3] = 255;
    }
  }
  // sample heights on the pixel grid (one per pixel inside the map), then shade
  const { heights, cols, rows, cell } = map, inv = 1 / cell, x0 = -map.W / 2, z0 = -map.H / 2;
  const px0 = Math.max(0, Math.floor(ox + x0 * scale)), px1 = Math.min(Wc - 1, Math.ceil(ox - x0 * scale));
  const py0 = Math.max(0, Math.floor(oy + z0 * scale)), py1 = Math.min(Hc - 1, Math.ceil(oy - z0 * scale));
  const bw = px1 - px0 + 1, bh = py1 - py0 + 1;
  if (bw <= 0 || bh <= 0) { ctx.putImageData(img, 0, 0); return { scale, ox, oy, toCanvas, toWorld }; }
  const HS = new Float32Array((bw + 2) * (bh + 2));
  const hAt = (x, z) => {
    let fx = (x - x0) * inv, fz = (z - z0) * inv;
    if (fx < 0) fx = 0; else if (fx > cols - 1) fx = cols - 1;
    if (fz < 0) fz = 0; else if (fz > rows - 1) fz = rows - 1;
    let i = fx | 0, j = fz | 0; if (i >= cols - 1) i = cols - 2; if (j >= rows - 1) j = rows - 2;
    const u = fx - i, v = fz - j, o = j * cols + i;
    return (heights[o] * (1 - u) + heights[o + 1] * u) * (1 - v) + (heights[o + cols] * (1 - u) + heights[o + cols + 1] * u) * v;
  };
  const SW = bw + 2;
  for (let y = -1; y <= bh; y++) {
    const z = (oy - (py0 + y + 0.5)) / scale;
    for (let x = -1; x <= bw; x++) HS[(y + 1) * SW + x + 1] = hAt((px0 + x + 0.5 - ox) / scale, z);
  }
  // relief exaggeration so every map's relief reads from above (display only): scale the steep end of
  // the land's slopes (at this pixel size) to a fixed shading strength
  const mpp = 1 / scale;                                     // metres per pixel
  let hmax = 1;
  const gs = [];
  for (let y = 1; y < bh; y += 3) for (let x = 1; x < bw; x += 3) {
    const k = (y + 1) * SW + x + 1, h = HS[k]; if (h <= 0) continue;
    if (h > hmax) hmax = h;
    gs.push(Math.abs(HS[k + 1] - HS[k - 1]) + Math.abs(HS[k - SW] - HS[k + SW]));
  }
  gs.sort((a, b) => a - b);
  const g90 = gs.length ? Math.max(1e-3, gs[Math.floor(gs.length * 0.9)] / (2 * mpp)) : 0.05;
  const ve = opts.ve || Math.max(1, Math.min(400, 0.9 / g90));
  // land contour step: about a dozen bands from the shore to the top
  const steps = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200];
  let cstep = steps[steps.length - 1]; for (const st of steps) if (hmax / st <= 14) { cstep = st; break; }
  const levels = opts.contours === false ? [] : [-5, -10, -20, -50, -100, -200, -400];
  const dens = opts.density || 1;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const k = (y + 1) * SW + x + 1, h = HS[k];
      const X = px0 + x, Y = py0 + y, o = (Y * Wc + X) * 4;
      const hl = HS[k - 1], hr = HS[k + 1], hu = HS[k - SW], hd = HS[k + SW];
      const r1 = hsh(X, Y), r2 = hsh(Y + 7919, X);
      let b = 0;
      if (h > 0) {
        if (hl <= 0 || hr <= 0 || hu <= 0 || hd <= 0) b = 0.92 + 0.08 * r2;       // the coastline: every pixel
        else {
          const gx = (hr - hl) * ve / (2 * mpp), gz = (hu - hd) * ve / (2 * mpp);
          const n = 1 / Math.sqrt(gx * gx + gz * gz + 1);
          const sh = Math.max(0, (-gx * L[0] + L[1] - gz * L[2]) * n);
          const lap = (hl + hr + hu + hd - 4 * h) * ve / (mpp * mpp) * mpp;        // - on crests, + in valleys
          const ht = Math.min(1, h / Math.max(40, hmax));
          let v = 0.06 + 0.78 * Math.pow(sh, 2.2) + 0.16 * ht - Math.max(-0.25, Math.min(0.25, lap * 0.35));
          // contour bands
          const c0 = Math.floor(h / cstep);
          if (c0 !== Math.floor(hr / cstep) || c0 !== Math.floor(hd / cstep)) v += 0.22;
          v = Math.max(0.03, Math.min(1.1, v));
          // stipple: brighter ground returns more dots
          if (r1 < (0.3 + 0.55 * v) * dens) b = 0.26 + 0.74 * v * (0.8 + 0.2 * r2);
        }
      } else {
        // sea: sparse dim returns, denser over the shallows and along the surf; depth contours dotted
        // (only where the floor really slopes: flat noisy floors would scribble)
        let c = false;
        if (Math.max(Math.abs(h - hr), Math.abs(h - hd)) > 0.0025 * mpp) {
          for (const lv of levels) { if ((h > lv) !== (hr > lv) || (h > lv) !== (hd > lv)) { c = true; break; } }
        }
        if (c && ((X + Y) % 3) === 0) b = 0.30;
        else {
          const sh = Math.max(0, 1 + h / 25);
          if (r1 < (0.03 + 0.10 * sh) * dens) b = 0.10 + 0.12 * r2 + 0.12 * sh;
        }
      }
      if (b <= 0) continue;
      const v = Math.min(255, b * 255);
      D[o] = Math.max(D[o], v); D[o + 1] = Math.max(D[o + 1], v); D[o + 2] = Math.max(D[o + 2], v * 0.96);
    }
  }
  ctx.putImageData(img, 0, 0);

  const font = opts.font || 'Geist Mono, DM Mono, ui-monospace, monospace';
  const fs = (opts.fontSize || 10) * dpr;
  ctx.save();
  ctx.textBaseline = 'middle';
  // roads: fine dotted lines
  if (opts.roads && map.roads) {
    // asphalt returns little light: a dark cut through the dots with a faint dotted centre line
    ctx.strokeStyle = 'rgba(11,12,10,0.7)'; ctx.lineWidth = 1.8 * dpr; ctx.lineJoin = 'round';
    for (const pl of map.roads) {
      ctx.beginPath();
      pl.forEach((p, i) => { const [x, y] = toCanvas(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(246,245,242,0.8)';
    const st = Math.max(2, 2.5 * dpr);
    for (const pl of map.roads) {
      for (let i = 0; i < pl.length - 1; i++) {
        const [ax, ay] = toCanvas(pl[i][0], pl[i][1]), [bx, by] = toCanvas(pl[i + 1][0], pl[i + 1][1]);
        const L2 = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.floor(L2 / st));
        for (let s = 0; s < n; s++) { const t = s / n; ctx.fillRect(ax + (bx - ax) * t - 0.5 * dpr, ay + (by - ay) * t - 0.5 * dpr, dpr, dpr); }
      }
    }
  }
  if (opts.places && map.places) {
    ctx.font = `${fs * 0.95}px ${font}`;
    for (const p of map.places) {
      const [x, y] = toCanvas(p.x, p.z);
      const water = p.kind === 'bay' || p.kind === 'strait' || p.kind === 'lagoon' || p.kind === 'channel';
      ctx.fillStyle = water ? 'rgba(246,245,242,0.38)' : 'rgba(246,245,242,0.62)';
      if (!water) ctx.fillRect(x - 1.5 * dpr, y - 1.5 * dpr, 3 * dpr, 3 * dpr);
      if (water) label(ctx, p.name, x, y, 'rgba(246,245,242,0.5)', 'center', dpr, 0);
      else label(ctx, p.name, x + 5 * dpr, y, 'rgba(246,245,242,0.72)', 'left', dpr, 0.72);
    }
  }
  if (opts.objectives !== false && map.objectives) {
    ctx.font = `${fs}px ${font}`;
    for (const ob of map.objectives) {
      const [x, y] = toCanvas(ob.x, ob.z), r = Math.max(3 * dpr, ob.r * scale);
      ctx.strokeStyle = 'rgba(198,244,50,0.55)'; ctx.lineWidth = dpr;
      dottedCircle(ctx, x, y, r, dpr);
      ctx.fillStyle = LIME;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-2.2 * dpr, -2.2 * dpr, 4.4 * dpr, 4.4 * dpr); ctx.restore();
      if (opts.labels !== false) {
        label(ctx, opts.labels === 'full' ? `${ob.id}  ${ob.name}` : ob.id, x + r + 4 * dpr, y, 'rgba(198,244,50,0.95)', 'left', dpr, 0.8);
      }
    }
  }
  if (opts.spawns !== false && map.spawns) {
    ctx.font = `${fs}px ${font}`;
    const sp = [['coast', map.spawns.coast, LIME], ['fleet', map.spawns.fleet, CORAL]];
    for (const [name, s, col] of sp) {
      if (!s) continue;
      const [x, y] = toCanvas(s.x, s.z), r = Math.max(5 * dpr, s.r * scale);
      ctx.strokeStyle = col; ctx.globalAlpha = 0.8; ctx.lineWidth = dpr;
      bracket(ctx, x, y, r, dpr);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col; ctx.fillRect(x - 1.5 * dpr, y - 1.5 * dpr, 3 * dpr, 3 * dpr);
      // heading tick
      const hx = Math.sin(s.hdg || 0), hy = -Math.cos(s.hdg || 0);
      ctx.beginPath(); ctx.moveTo(x + hx * r * 0.5, y + hy * r * 0.5); ctx.lineTo(x + hx * r * 1.0, y + hy * r * 1.0); ctx.stroke();
      if (opts.labels !== false) {
        label(ctx, name.toUpperCase(), x + r + 5 * dpr, y - r * 0.5, col, 'left', dpr, 0.8);
      }
    }
    if (map.replenish && opts.labels !== false) {
      const [x, y] = toCanvas(map.replenish.x, map.replenish.z), r = Math.max(4 * dpr, map.replenish.r * scale);
      ctx.strokeStyle = 'rgba(246,245,242,0.45)'; dottedCircle(ctx, x, y, r, dpr);
      label(ctx, 'RAS', x + r + 4 * dpr, y, 'rgba(246,245,242,0.6)', 'left', dpr, 0.6);
    }
  }
  ctx.restore();
  return { scale, ox, oy, toCanvas, toWorld };
}

/* text on a dark chip (the films' tag label), so it reads over bright ground */
function label(ctx, text, x, y, color, align, dpr, chip) {
  ctx.textAlign = align;
  const w = ctx.measureText(text).width, fs = parseFloat(ctx.font) || 10;
  if (chip > 0) {
    const x0 = align === 'center' ? x - w / 2 : x;
    ctx.fillStyle = `rgba(11,12,10,${chip})`;
    ctx.fillRect(x0 - 3 * dpr, y - fs * 0.62, w + 6 * dpr, fs * 1.24);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function dottedCircle(ctx, x, y, r, dpr) {
  const n = Math.max(12, Math.floor(2 * Math.PI * r / (3 * dpr)));
  const fs = ctx.fillStyle; ctx.fillStyle = ctx.strokeStyle;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ctx.fillRect(x + Math.cos(a) * r - 0.5 * dpr, y + Math.sin(a) * r - 0.5 * dpr, dpr, dpr); }
  ctx.fillStyle = fs;
}
function bracket(ctx, x, y, r, dpr) {
  const l = r * 0.45;
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.moveTo(x + sx * r, y + sy * (r - l)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - l), y + sy * r);
  }
  ctx.stroke();
}
