/* Blast lab drawing (dev/lab): the analysis layer over the view (2D, the camera's projection), the solver's plates
   as maps (the GPU solve's own state, read from the CPU copy of its texels: what the picture is drawn from), and the
   timeline graphs.

   Over the view (each a toggle, index.js):
     aim      the aim point, the round's line in, the angle; the struck point once landed (the part, the zone, the
              plating, the fuze and the charge as the game took them), its normal
     patch    the solver's patch: its box, its plates (the skin lime), the charge (coral), the fireball's radius, the
              shock front's radius at the time shown (Kinney-Graham arrival: blast/phys.js shockR) while it runs
     ruler    a metre rule along the plating through the hit (1 m ticks, 5 m long each way), a scale bar, the model axes
     holes    the sim's holes (sim/ship.js: what floods her; coral) against the solved tear (lime), m^2
     pieces   the loose pieces (blast/support.js bodies): moving (lime) / at rest (white)
     qa       the floating-dot check's flags (blast/qa.js) where they are
   Plate map: displacement (|d|), normal (signed along the plate's normal: lime out, coral in), flags (torn coral, gone
   black, torn edge hot white, unsupported amber), soot; the charge's foot marked; hover reads a texel. */
import { shockR, fireR } from '../../blast/phys.js';

const LIME = '#C6F432', CORAL = '#FF6A3D', WHITE = '#FFFFFF', AMBER = '#F2B33D';
const MONO = "'Geist Mono', Consolas, monospace";
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const f1 = v => (Math.round(v * 10) / 10).toFixed(1), f2 = v => (Math.round(v * 100) / 100).toFixed(2);

/* local patch frame -> model */
const loc2m = (F, l) => [F.O[0] + F.X[0] * l[0] + F.Y[0] * l[1] + F.Z[0] * l[2], F.O[1] + F.X[1] * l[0] + F.Y[1] * l[1] + F.Z[1] * l[2], F.O[2] + F.X[2] * l[0] + F.Y[2] * l[1] + F.Z[2] * l[2]];
/* a plate's (u, v) at its value on its axis -> local */
const plateL = (ax, val, u, v) => ax === 2 ? [u, v, val] : ax === 1 ? [u, val, v] : [val, v, u];

/* the labels placed this frame (a later one steps down past those it would cover) */
const placed = [];
let LABELS = true;
function label(ctx, x, y, lines, col, o = {}) {
  if (!LABELS) return;
  ctx.font = `500 ${o.px || 10.5}px ${MONO}`;
  const lh = (o.px || 10.5) + 4, w = Math.max(...lines.map(s => ctx.measureText(s).width)) + 10, h = lh * lines.length + 3;
  const bx = o.left ? x - w - 6 : x + 6;
  let by = y - lh * .5 - 2;
  for (let k = 0; k < 12; k++) { const hit = placed.find(r => bx < r[2] && bx + w > r[0] && by < r[3] && by + h > r[1]); if (!hit) break; by = hit[3] + 3; }
  placed.push([bx, by, bx + w, by + h]);
  ctx.fillStyle = 'rgba(11,12,10,.78)'; ctx.fillRect(bx, by, w, lh * lines.length + 3);
  ctx.fillStyle = col; ctx.fillRect(o.left ? bx + w - 2 : bx, by, 2, lh * lines.length + 3);
  lines.forEach((s, i) => { ctx.fillStyle = i ? 'rgba(255,255,255,.72)' : col; ctx.fillText(s, bx + 6, by + lh * (i + 1) - 3); });
}

export function createDraw(core, game) {
  const R = game.R, cam = R.camera, L = core.L;
  const P = w => cam.project(w);
  function seg(ctx, a, b, col, alpha, dash, wid) {
    const p = P(a), q = P(b); if (!p || !q) return;
    ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = wid || 1; ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  function ring(ctx, w, rM, col, alpha, dash) {
    const p = P(w); if (!p) return null;
    const r = cam.fl * rM / p[2]; if (!(r > 1.5) || r > 6000) return p;
    ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    return [p[0], p[1], r];
  }
  function diamond(ctx, p, s, col, fill) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(p[0], p[1] - s); ctx.lineTo(p[0] + s, p[1]); ctx.lineTo(p[0], p[1] + s); ctx.lineTo(p[0] - s, p[1]); ctx.closePath();
    fill ? ctx.fill() : ctx.stroke();
  }

  /* ------------------------------------------------------------ over the view */
  function overlay(ctx, o) {
    const u = core.unit(); if (!u) return;
    const F = core.frameOf(u), W = (q) => core.toWorld(u, q, F);
    const s = L.shot, t = core.tau();
    placed.length = 0; LABELS = L.labels !== false;
    ctx.save();
    // ---- aim (and the round's line before it lands)
    if (o.aim && (!s || s.pending || s.mode === 'mission')) {
      const a = s && s.loc ? s.loc : L.aim.loc, f = s && s.from ? s.from : L.aim.from;
      const aw = W(a), p = P(aw);
      if (p && f) {
        seg(ctx, aw, W([a[0] + f[0] * 30, a[1] + f[1] * 30, a[2] + f[2] * 30]), LIME, .8, [5, 4]);
        ctx.strokeStyle = LIME; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, Math.PI * 2); ctx.stroke();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(p[0] + dx * 10, p[1] + dy * 10); ctx.lineTo(p[0] + dx * 16, p[1] + dy * 16); ctx.stroke(); }
        const az = Math.round(Math.atan2(f[0], f[2]) * 57.3), el = Math.round(Math.asin(clamp(f[1], -1, 1)) * 57.3);
        label(ctx, p[0] + 14, p[1] - 14, [`AIM ${f1(a[0])} ${f1(a[1])} ${f1(a[2])}`, `FROM ${az}° (0 AHEAD · 90 STBD) · ${el}° UP`].concat(L.aim.part ? ['ON ' + L.aim.part.toUpperCase()] : []), LIME);
      }
    }
    // ---- the struck point
    if (o.aim && s && s.landed) {
      const Ld = s.landed, aw = W(Ld.at), p = P(aw);
      if (p) {
        seg(ctx, aw, W([Ld.at[0] + Ld.n[0] * 1.5, Ld.at[1] + Ld.n[1] * 1.5, Ld.at[2] + Ld.n[2] * 1.5]), CORAL, .9);
        diamond(ctx, p, 5, CORAL, true);
        const C = s.C || {};
        label(ctx, p[0] + 10, p[1] + 26, [`HIT ${(s.res && s.res.part || '').toUpperCase()} · ${(Ld.zone || '').toUpperCase()} · ${Ld.tmm} MM`,
          `${(C.name || s.kind).toUpperCase()} · ${f1(C.W || 0)} KG TNT · FUZE ${(C.fz || Ld.fz || '').toUpperCase()}${C.fz === 'in' ? ' ' + f1(C.delay) + ' M' : ''}${C.standoff ? ' · STANDOFF ' + f1(C.standoff) + ' M' : ''}`,
          `AT ${f1(Ld.at[0])} ${f1(Ld.at[1])} ${f1(Ld.at[2])} · ${Ld.solved ? 'GPU SOLVE' : 'ANALYTIC MARK ' + (Ld.mark || '').toUpperCase()}`], CORAL);
      }
    }
    // ---- the patches
    const PL = core.patches();
    if (o.patch) for (const B of PL) {
      const sp = B.spec; if (!sp || !sp.frame) continue;
      const Fr = sp.frame, b = sp.box, M = l => W(loc2m(Fr, l));
      if (b) {
        const c = [[b[0], b[1], b[2]], [b[3], b[1], b[2]], [b[3], b[4], b[2]], [b[0], b[4], b[2]], [b[0], b[1], b[5]], [b[3], b[1], b[5]], [b[3], b[4], b[5]], [b[0], b[4], b[5]]].map(M);
        for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(ctx, c[i], c[j], WHITE, .28, [2, 4]);
      }
      for (const pl of sp.plates || []) {
        const q = [[pl.u0, pl.v0], [pl.u1, pl.v0], [pl.u1, pl.v1], [pl.u0, pl.v1]].map(([uu, vv]) => M(plateL(pl.ax, pl.val, uu, vv)));
        for (let i = 0; i < 4; i++) seg(ctx, q[i], q[(i + 1) % 4], pl.skin ? LIME : WHITE, pl.skin ? .55 : .2);
      }
      if (sp.charge) {
        const cw = M(sp.charge.C), p = P(cw), Wk = sp.charge.W || 0;
        if (p) {
          diamond(ctx, p, 4, CORAL, false);
          ring(ctx, cw, fireR(Math.max(Wk, .01)), CORAL, .35, [3, 5]);
          const lines = [`CHARGE ${f1(Wk)} KG TNT · ${sp.charge.inside ? 'INSIDE' : 'OUTSIDE'} · ${f2(Math.abs(sp.charge.C[2]))} M OFF THE PLATE`, `FIREBALL R ${f1(fireR(Math.max(Wk, .01)))} M · PATCH ${sp.kind ? sp.kind.toUpperCase() : ''} · GRID ${sp.gridS} M`];
          if (t !== null && t > 0 && t < .25) {
            const Rs = shockR(t, Math.max(Wk, .01));
            if (Rs > 0) { ring(ctx, cw, Rs, CORAL, clamp(1 - t * 4, .25, .9)); lines.push(`SHOCK FRONT R ${f1(Rs)} M AT ${(t * 1000).toFixed(2)} MS`); }
          }
          label(ctx, p[0] - 12, p[1] - 30, lines, CORAL, { left: true });
        }
      }
    }
    // ---- the metre rule, the scale bar, the axes
    if (o.ruler) {
      const B = PL[0], sp = B && B.spec;
      const at = s && s.landed ? s.landed.at : (s && s.loc) || L.aim.loc;
      let X = [0, 0, 1], Y = [0, 1, 0];
      if (sp && sp.frame) { X = sp.frame.X; Y = sp.frame.Y; } else if (s && s.landed && Math.abs(s.landed.n[1]) > .7) { X = [0, 0, 1]; Y = [1, 0, 0]; }
      const below = k => W([at[0] + X[0] * k - Y[0] * 2.2, at[1] + X[1] * k - Y[1] * 2.2, at[2] + X[2] * k - Y[2] * 2.2]);
      seg(ctx, below(-5), below(5), WHITE, .75, null, 1.2);
      for (let k = -5; k <= 5; k++) {
        const a = below(k), tl = k % 5 === 0 ? .55 : .25;
        seg(ctx, a, W([at[0] + X[0] * k - Y[0] * (2.2 - tl), at[1] + X[1] * k - Y[1] * (2.2 - tl), at[2] + X[2] * k - Y[2] * (2.2 - tl)]), WHITE, .75, null, 1.2);
        if (k % 5 === 0) { const p = P(a); if (p) { ctx.font = `500 10px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(k === 0 ? '0' : Math.abs(k) + ' M', p[0] - 6, p[1] + 14); } }
      }
      // the scale bar at the hit's distance, and the model's axes there
      const fw = W(at), p = P(fw);
      if (p) {
        const pxm = cam.fl / p[2], nice = [.5, 1, 2, 5, 10, 20, 50, 100, 200, 500].find(v => v * pxm >= 70) || 500, len = nice * pxm;
        const x0 = o.safe[0] + 24, y0 = o.safe[3] - 30;
        ctx.strokeStyle = WHITE; ctx.globalAlpha = .85; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + len, y0); ctx.moveTo(x0, y0 - 5); ctx.lineTo(x0, y0 + 5); ctx.moveTo(x0 + len, y0 - 5); ctx.lineTo(x0 + len, y0 + 5); ctx.stroke();
        ctx.globalAlpha = 1; ctx.font = `500 10.5px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.fillText(`${nice} M AT THE HIT · ${Math.round(p[2])} M AWAY`, x0, y0 - 9);
        const ax = [[[1, 0, 0], 'STBD', WHITE], [[0, 1, 0], 'UP', WHITE], [[0, 0, 1], 'BOW', LIME]], cx = x0 + 34, cy = y0 - 64;
        for (const [d, nm, col] of ax) {
          const q = P(W([at[0] + d[0], at[1] + d[1], at[2] + d[2]])); if (!q) continue;
          let dx = q[0] - p[0], dy = q[1] - p[1]; const l = Math.hypot(dx, dy); if (l < .01) continue; dx /= l; dy /= l;
          ctx.strokeStyle = col; ctx.globalAlpha = .9; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * 26, cy + dy * 26); ctx.stroke();
          ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.fillText(nm, cx + dx * 30 - 8, cy + dy * 30 + 4);
        }
      }
    }
    // ---- the sim's holes against the solved tear
    if (o.holes) {
      const S = core.simState(u);
      if (S && S.holes) for (const h of S.holes) {
        const r = Math.sqrt(h.A / Math.PI), q = ring(ctx, W(h.at), r, CORAL, .85, [4, 3]);
        if (q) label(ctx, q[0] + q[2] * .7, q[1] - q[2] * .7, [`SIM HOLE ${h.space} ${f1(h.A)} M²${h.sea ? ' · SEA' : ''}`], CORAL);
      }
      for (const B of PL) {
        if (!(B.torn > .02)) continue;
        const c = B.res && B.res.hole && B.res.hole.c ? B.res.hole.c : s && s.landed ? s.landed.at : null; if (!c) continue;
        const q = ring(ctx, W(c), Math.sqrt(B.torn / Math.PI), LIME, .8);
        if (q) label(ctx, q[0] - q[2] * .7, q[1] + q[2] * .7, [`SOLVED TEAR ${f1(B.torn)} M² · FLAPS ${f1(B.openM2 || 0)} M²${B.below > .05 ? ' · ' + f1(B.below) + ' UNDER WL' : ''}`], LIME, { left: true });
      }
    }
    // ---- loose pieces
    if (o.pieces && game.blast && game.blast.bodies) {
      let nM = 0, nR = 0;
      for (const b of game.blast.bodies.list) {
        if (b.gone || b.uid !== u.id || b.kind !== 'clump') continue;
        const p = P(W(b.p)); if (!p) continue;
        const mv = !b.rest; mv ? nM++ : nR++;
        ctx.strokeStyle = mv ? LIME : WHITE; ctx.fillStyle = LIME; ctx.globalAlpha = .85;
        mv ? ctx.fillRect(p[0] - 2, p[1] - 2, 4, 4) : ctx.strokeRect(p[0] - 2.5, p[1] - 2.5, 5, 5);
      }
      ctx.globalAlpha = 1;
      o.pieceCount = [nM, nR];
    }
    // ---- QA flags
    if (o.qa && L.qa && L.qa.flags) for (const fl of L.qa.flags) {
      if (!fl.at) continue;
      const p = P(W(fl.at)); if (!p) continue;
      ctx.strokeStyle = CORAL; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p[0] - 6, p[1] - 6); ctx.lineTo(p[0] + 6, p[1] + 6); ctx.moveTo(p[0] + 6, p[1] - 6); ctx.lineTo(p[0] - 6, p[1] + 6); ctx.stroke();
      label(ctx, p[0] + 8, p[1], [`QA ${fl.kind.toUpperCase()}${fl.n ? ' × ' + fl.n : ''}${fl.what ? ' · ' + String(fl.what).toUpperCase() : ''}`], CORAL);
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------ the plate maps */
  const ramp = (k, a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const G0 = [24, 26, 22], G1 = [235, 235, 230], LM = [198, 244, 50], CR = [255, 106, 61];
  let lay = [];   // the last layout: [{ B, r, x, y, w, h, S }]
  function plateMaps(cv, mode) {
    const dpr = window.devicePixelRatio || 1, Wc = cv.clientWidth || 300;
    const PL = core.patches().filter(B => B.rects && B.rects.some(r => r.cpu));
    // the layout (each plate to the width, at most 150 px tall)
    lay = []; let y = 4;
    for (const B of PL.slice(0, 3)) {
      const S = B.spec.shellS || B.spec.gridS || .25;
      for (const r of B.rects.slice().sort((a, b) => a.p - b.p)) {
        if (!r.cpu) continue;
        const k = Math.min((Wc - 8) / (r.nu + 1), 150 / (r.nv + 1)), w = (r.nu + 1) * k, h = (r.nv + 1) * k;
        lay.push({ B, r, x: 4, y: y + 16, w, h, k, S }); y += h + 26;
      }
    }
    const Hc = Math.max(40, y + 4);
    if (cv.height !== Math.round(Hc * dpr) || cv.width !== Math.round(Wc * dpr)) { cv.width = Math.round(Wc * dpr); cv.height = Math.round(Hc * dpr); cv.style.height = Hc + 'px'; }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, Wc, Hc);
    if (!lay.length) { ctx.font = `500 10.5px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillText('NO SOLVED PLATING YET', 6, 22); return; }
    for (const e of lay) {
      const { B, r, x, w, h, k } = e, y0 = e.y, n = r.nu + 1, m = r.nv + 1, cpu = r.cpu;
      const pl = (B.spec.plates || [])[r.p] || {};
      let mx = .02; if (mode === 'disp' || mode === 'normal') for (let i = 0; i < n * m; i++) { const q = 4 * i; mx = Math.max(mx, mode === 'disp' ? Math.hypot(cpu[q], cpu[q + 1], cpu[q + 2]) : Math.abs(cpu[q + r.ax])); }
      const img = ctx.createImageData(n, m), D = img.data;
      for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
        const q = 4 * (j * n + i), w4 = cpu[q + 3], fl = Math.floor(w4), soot = w4 - fl;
        let c;
        if (mode === 'flags') c = fl & 2 ? [0, 0, 0] : fl & 1 ? CR : fl & 4 ? [255, 228, 210] : fl & 8 ? [242, 179, 61] : [70, 72, 66];
        else if (mode === 'soot') c = ramp(clamp(soot * 1.2, 0, 1), G1, G0);
        else if (mode === 'normal') { const v = cpu[q + r.ax] / mx; c = v >= 0 ? ramp(clamp(v, 0, 1), G0, LM) : ramp(clamp(-v, 0, 1), G0, CR); }
        else { const v = Math.hypot(cpu[q], cpu[q + 1], cpu[q + 2]) / mx; c = v < .5 ? ramp(v * 2, G0, G1) : ramp((v - .5) * 2, G1, LM); }
        if (mode !== 'flags' && (fl & 2)) c = [0, 0, 0]; else if (mode !== 'flags' && (fl & 1)) c = ramp(.55, c, CR);
        // (v grows up the plate: image rows top-down)
        const o = 4 * ((m - 1 - j) * n + i); D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = 255;
      }
      const tmp = e.tmp || (e.tmp = document.createElement('canvas')); tmp.width = n; tmp.height = m; tmp.getContext('2d').putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(tmp, x, y0, w, h);
      ctx.strokeStyle = pl.skin ? 'rgba(198,244,50,.6)' : 'rgba(255,255,255,.18)'; ctx.strokeRect(x + .5, y0 + .5, w - 1, h - 1);
      // the charge's foot on the plate
      const C = B.spec.charge && B.spec.charge.C;
      if (C) {
        const uu = r.ax === 2 ? C[0] : r.ax === 1 ? C[0] : C[2], vv = r.ax === 2 ? C[1] : r.ax === 1 ? C[2] : C[1];
        const px = x + ((uu - r.u0) / e.S + .5) * k, py = y0 + h - ((vv - r.v0) / e.S + .5) * k;
        if (px > x && px < x + w && py > y0 && py < y0 + h) { ctx.strokeStyle = CORAL; ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.stroke(); }
      }
      ctx.font = `500 10px ${MONO}`; ctx.fillStyle = pl.skin ? LIME : 'rgba(255,255,255,.7)';
      const tornP = (B.byPlate || [])[r.p];
      ctx.fillText(`P${r.p} ${pl.skin ? 'SKIN' : r.ax === 1 ? 'DECK' : 'BHD'} ${pl.h ? Math.round(pl.h * 1000) : '?'} MM ${(pl.mat || '').toUpperCase()} · ${f1(n * e.S)}×${f1(m * e.S)} M${tornP ? ' · TORN ' + f1(tornP) + ' M²' : ''}${mode === 'disp' || mode === 'normal' ? ' · MAX ' + Math.round(mx * 1000) + ' MM' : ''}`, x, y0 - 5);
    }
  }
  /* the texel under a point of the map canvas (CSS px) */
  function plateAt(x, y) {
    for (const e of lay) {
      if (x < e.x || y < e.y || x > e.x + e.w || y > e.y + e.h) continue;
      const i = Math.floor((x - e.x) / e.k), j = e.r.nv - Math.floor((y - e.y) / e.k), q = 4 * (j * (e.r.nu + 1) + i), c = e.r.cpu;
      if (!(i >= 0 && j >= 0 && i <= e.r.nu && j <= e.r.nv)) return null;
      const w4 = c[q + 3], fl = Math.floor(w4);
      const flags = [fl & 1 && 'torn', fl & 2 && 'gone', fl & 4 && 'torn edge', fl & 8 && 'unsupported'].filter(Boolean);
      return { plate: e.r.p, i, j, u: +(e.r.u0 + i * e.S).toFixed(2), v: +(e.r.v0 + j * e.S).toFixed(2), dmm: Math.round(Math.hypot(c[q], c[q + 1], c[q + 2]) * 1000),
        nmm: Math.round(c[q + e.r.ax] * 1000), flags, soot: +(w4 - fl).toFixed(2) };
    }
    return null;
  }

  /* ------------------------------------------------------------ the graphs (symlog time: ms and seconds on one axis) */
  const g = t => Math.sign(t) * Math.log10(1 + Math.abs(t) / .001);
  function graphs(cv, tNow) {
    const dpr = window.devicePixelRatio || 1, Wc = cv.clientWidth || 300, Hc = cv.clientHeight || 150;
    if (cv.width !== Math.round(Wc * dpr)) { cv.width = Math.round(Wc * dpr); cv.height = Math.round(Hc * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, Wc, Hc);
    const tl = L.tl; ctx.font = `500 9.5px ${MONO}`;
    if (tl.length < 2) { ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillText('NO SAMPLES YET (FIRE, THEN STEP OR PLAY)', 4, 16); return; }
    const t0 = Math.min(tl[0].tau, 0), t1 = Math.max(tl[tl.length - 1].tau, .01), X0 = 6, X1 = Wc - 6, Y0 = 18, Y1 = Hc - 16;
    const gx = t => X0 + (g(t) - g(t0)) / Math.max(1e-6, g(t1) - g(t0)) * (X1 - X0);
    // the time ticks
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.fillStyle = 'rgba(255,255,255,.4)';
    for (const [tt, nm] of [[0, '0'], [.001, '1MS'], [.01, '10MS'], [.1, '100MS'], [1, '1S'], [10, '10S'], [100, '100S']]) {
      if (tt > t1 || tt < t0) continue; const x = gx(tt); ctx.beginPath(); ctx.moveTo(x, Y0); ctx.lineTo(x, Y1); ctx.stroke(); ctx.fillText(nm, x + 2, Hc - 4);
    }
    const series = [['torn', 'TORN M²', LIME, 1], ['set', 'SET MM', WHITE, 1000], ['bodies', 'PIECES', 'rgba(255,255,255,.5)', 1], ['frameMs', 'FRAME MS', CORAL, 1]];
    let lx = X0;
    for (const [k, nm, col, mul] of series) {
      let mx = k === 'frameMs' ? 33.4 : 1e-6; for (const x of tl) mx = Math.max(mx, (x[k] || 0) * mul);
      ctx.strokeStyle = col; ctx.globalAlpha = k === 'frameMs' ? .55 : .95; ctx.lineWidth = 1.2; ctx.beginPath();
      tl.forEach((x, i) => { const px = gx(x.tau), py = Y1 - (x[k] || 0) * mul / mx * (Y1 - Y0); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke(); ctx.globalAlpha = 1;
      const last = (tl[tl.length - 1][k] || 0) * mul, txt = `${nm} ${k === 'set' || k === 'bodies' ? Math.round(last) : f1(last)}`;
      ctx.fillStyle = col; ctx.fillText(txt, lx, 11); lx += ctx.measureText(txt).width + 12;
    }
    // 16.7 ms
    { const y = Y1 - 16.7 / 33.4 * (Y1 - Y0); ctx.strokeStyle = 'rgba(255,106,61,.25)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X0, y); ctx.lineTo(X1, y); ctx.stroke(); ctx.setLineDash([]); }
    if (tNow !== null && tNow !== undefined) { const x = gx(clamp(tNow, t0, t1)); ctx.strokeStyle = LIME; ctx.beginPath(); ctx.moveTo(x, Y0 - 4); ctx.lineTo(x, Y1); ctx.stroke(); }
  }

  return { overlay, plateMaps, plateAt, graphs };
}
