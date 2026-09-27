/* Inspect · a ship's insides (sim/ship.js): her compartments, the water in them, fires, the holes, and her systems lit
   (lime: working), damaged (white) or out (coral), the cable ways and shaft lines as lines. Drawn in the Inspect X-ray
   (once the slice has opened her) and in the impact test (ui/inspect/impact.js), over the model, in its own pose.

   createShipView(I) -> { draw2d(ctx, W, H, A, V, mode), panel(ctx, x, y, A, u) -> bottom y, readout(F, Wt, u) -> lines }
   I = { game, sim, O, pcam }; V: the open view (R0, T0: the drawn pose); mode 'xray' | 'impact' */
import { shipSpec } from '../../sim/ship.js';

const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const WATER = 'rgba(150,196,255,', HULLC = 'rgba(255,255,255,';
const E12 = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

export function createShipView(I) {
  const { game, sim, O } = I;
  const LIME = O.LIME, CORAL = O.CORAL;
  const P8 = Array.from({ length: 8 }, () => [0, 0, 0]), Q = [0, 0, 0], W3 = [0, 0, 0];
  const S2 = Array.from({ length: 8 }, () => [0, 0]);
  let hoverComp = -1;

  function proj(V, x, y, z, out) {
    const R0 = V.R0, T0 = V.T0;
    W3[0] = R0[0] * x + R0[1] * y + R0[2] * z + T0[0];
    W3[1] = R0[3] * x + R0[4] * y + R0[5] * z + T0[1];
    W3[2] = R0[6] * x + R0[7] * y + R0[8] * z + T0[2];
    return I.pcam.project(W3, out);
  }
  /* a box's 8 corners on screen (false when one is behind the camera) */
  function boxScreen(V, x0, y0, z0, x1, y1, z1) {
    for (let k = 0; k < 8; k++) {
      const r = proj(V, k & 1 ? x1 : x0, k & 2 ? y1 : y0, k & 4 ? z1 : z0, Q);
      if (!r) return false;
      S2[k][0] = r[0]; S2[k][1] = r[1];
    }
    return true;
  }
  function hullOf(pts) {                  // the screen outline of a box: convex hull of its 8 corners
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), lo = [], up = [];
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }

  /* the picture over the model */
  function draw2d(ctx, W, H, A, V, mode) {
    const u = V && V.u;
    if (!u || !u.ship || A <= .01) return;
    const S = u.ship, L = S.L, sp = S.sp, t = game.realT;
    ctx.save();
    ctx.lineWidth = 1;
    // compartments: faint hairline boxes (the hull's spaces; the deckhouses fainter), the watertight ones a little
    // brighter; a space burning glows coral, one flooding fills from its floor to the water in it
    for (let c = 0; c < L.n; c++) {
      const o = c * 6, b = L.box, house = L.kind[c] === 'house';
      const x0 = Math.max(b[o], -L.hydro.B / 2 - 3), x1 = Math.min(b[o + 3], L.hydro.B / 2 + 3);
      if (!boxScreen(V, x0, b[o + 1], b[o + 2], x1, b[o + 4], b[o + 5])) continue;
      const fire = S.fire[c], cap = L.vol[c] * L.perm[c], fl = cap > 0 ? S.water[c] / cap : 0;
      const hov = c === hoverComp;
      ctx.strokeStyle = fire > 0 ? CORAL : HULLC + (hov ? .55 : house ? .09 : fl > .005 ? .4 : .18) + ')';
      ctx.globalAlpha = A * (fire > 0 ? .35 + .25 * fire * (.8 + .2 * Math.sin(t * 7 + c)) : 1);
      ctx.beginPath();
      for (const [i, j] of E12) { ctx.moveTo(S2[i][0], S2[i][1]); ctx.lineTo(S2[j][0], S2[j][1]); }
      ctx.stroke();
      if (fire > 0) {
        const hl = hullOf(S2);
        ctx.fillStyle = CORAL; ctx.globalAlpha = A * .07 * (.5 + fire);
        ctx.beginPath(); hl.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
      }
      if (fl > .005) {
        const yl = Math.min(b[o + 4], b[o + 1] + (b[o + 4] - b[o + 1]) * Math.min(1, S.water[c] / Math.max(1e-6, L.perm[c] * L.floorA[c]) / Math.max(.1, b[o + 4] - b[o + 1])));
        if (boxScreen(V, x0, b[o + 1], b[o + 2], x1, yl, b[o + 5])) {
          const hl = hullOf(S2);
          ctx.globalAlpha = A * (.16 + .2 * fl);
          ctx.fillStyle = WATER + '1)';
          ctx.beginPath(); hl.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
          // the free surface
          ctx.globalAlpha = A * .85; ctx.strokeStyle = WATER + '1)';
          ctx.beginPath(); ctx.moveTo(S2[2][0], S2[2][1]); ctx.lineTo(S2[3][0], S2[3][1]); ctx.lineTo(S2[7][0], S2[7][1]); ctx.lineTo(S2[6][0], S2[6][1]); ctx.closePath(); ctx.stroke();
        }
      }
    }
    // the holes in her plating (coral rings; under the water, a ring of water inside)
    for (const h of S.holes) {
      if (!proj(V, h.x, h.y, h.z, Q)) continue;
      const r = Math.max(3, Math.min(26, h.r * 3));
      ctx.globalAlpha = A * (h.A > .005 ? .95 : .35); ctx.strokeStyle = CORAL;
      ctx.beginPath(); ctx.arc(Q[0], Q[1], r, 0, Math.PI * 2); ctx.stroke();
      if (h.sea && h.A > .005) { ctx.strokeStyle = WATER + '1)'; ctx.beginPath(); ctx.arc(Q[0], Q[1], r * .6, 0, Math.PI * 2); ctx.stroke(); }
    }
    // systems: squares at their middles, lines for cable ways and shafting
    for (const n of sp.nodes) {
      const dm = n.mod ? Math.min(1, u.mods[n.mod.id] / n.mod.hp) : S.h[n.i], ok = S.ok[n.i];
      const col = !ok ? CORAL : dm > .05 ? '#FFFFFF' : LIME;
      ctx.globalAlpha = A * (ok ? .8 : .95);
      if (n.pts) {
        ctx.strokeStyle = col; ctx.setLineDash(n.cls === 'cable' ? [2, 3] : []);
        ctx.beginPath();
        for (let k = 0; k < n.pts.length / 3; k++) { if (!proj(V, n.pts[k * 3], n.pts[k * 3 + 1], n.pts[k * 3 + 2], Q)) { ctx.beginPath(); continue; } k ? ctx.lineTo(Q[0], Q[1]) : ctx.moveTo(Q[0], Q[1]); }
        ctx.stroke(); ctx.setLineDash([]);
      } else if (proj(V, n.c[0], n.c[1], n.c[2], Q)) {
        const s = n.mod ? 5 : 4;
        ctx.fillStyle = col;
        if (ok) ctx.fillRect(Math.round(Q[0] - s / 2), Math.round(Q[1] - s / 2), s, s);
        else { ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(Q[0] - s, Q[1] - s); ctx.lineTo(Q[0] + s, Q[1] + s); ctx.moveTo(Q[0] + s, Q[1] - s); ctx.lineTo(Q[0] - s, Q[1] + s); ctx.stroke(); }
      }
    }
    ctx.restore();
    // tags on the spaces that matter now: flooding, burning (the worst few)
    const hot = [];
    for (let c = 0; c < L.n; c++) {
      const cap = L.vol[c] * L.perm[c], fl = cap > 0 ? S.water[c] / cap : 0;
      if (fl > .03 || S.fire[c] > 0) hot.push([c, fl + S.fire[c]]);
    }
    hot.sort((a, b) => b[1] - a[1]);
    // the worst few, in a column above the model (sorted left to right), leaders down to their spaces
    const tags = [];
    for (const [c] of hot) {
      if (tags.length >= 6) break;
      const o = c * 6, b = L.box;
      if (!proj(V, (b[o] + b[o + 3]) / 2, b[o + 4], (b[o + 2] + b[o + 5]) / 2, Q)) continue;
      tags.push({ c, x: Q[0], y: Q[1] });
    }
    if (tags.length) {
      tags.sort((a, b) => a.x - b.x);
      const top = Math.min(...tags.map(t => t.y)) - 40 - tags.length * 19;
      tags.forEach((tg, i) => {
        const c = tg.c, cap = L.vol[c] * L.perm[c], fl = cap > 0 ? S.water[c] / cap : 0;
        const val = `${fl > .03 ? Math.round(fl * 100) + ' % water' : ''}${fl > .03 && S.fire[c] > 0 ? ' · ' : ''}${S.fire[c] > 0 ? 'fire' : ''}`;
        const x = tg.x + 18, y = top + i * 19;
        O.leader(ctx, tg.x, tg.y, x, y + 10, S.fire[c] > 0 ? CORAL : '#FFFFFF', .6 * A);
        O.adot(ctx, tg.x, tg.y, S.fire[c] > 0 ? CORAL : '#FFFFFF', A);
        O.tag(ctx, x + 4, y, L.nums[c] || L.ids[c], L.names[c], val, { kind: S.fire[c] > 0 ? 'coral' : 'white', a: A, size: 10 });
      });
    }
  }

  /* a block of lines: attitude, water, power, what is out (inspect.js readout; the impact test's) */
  function readout(F, Wt, u) {
    if (!u || !u.ship) return [];
    const S = u.ship, L = S.L, sp = S.sp, out = [];
    let wet = 0, fires = 0;
    for (let c = 0; c < L.n; c++) { if (S.water[c] > L.vol[c] * L.perm[c] * .03) wet++; if (S.fire[c] > 0) fires++; }
    const deg = r => `${(r * 57.2958).toFixed(1)}°`;
    out.push([['Hull ', F], [`${L.n} spaces · ${countBulkheads(L)} WT bulkheads`, Wt], [' · ', F], [S.gq ? 'Zebra' : 'Yoke', S.gq ? LIME : Wt], [` · doors ${openDoors(S)} open`, F]]);
    out.push([['Water ', F], [`${Math.round(S.w)} m³`, S.w > 1 ? CORAL : Wt], [` in ${wet} · `, F], [`sink ${S.sink.toFixed(2)} m · list ${deg(S.list)} · trim ${deg(S.trim)}`, Wt], [` · GM ${S.gm.toFixed(2)} m`, S.gm < .5 ? CORAL : F]]);
    const buses = sp.buses.map(B => `${sp.nodes[B.bus].id.replace('swbd', 'SB')}${S.ok[B.bus] ? '' : '×'}`).join(' ');
    const kn = u.def.speed * u.slowK / .5144;
    out.push([['Power ', F], [buses, Wt], [' · speed ', F], [`${kn.toFixed(0)} kn`, S.prop < 1 ? CORAL : Wt], [' · steering ', F], [S.steerK < 1 ? 'emergency' : 'ok', S.steerK < 1 ? CORAL : Wt], [fires ? ` · ${fires} fire${fires > 1 ? 's' : ''}` : '', CORAL]]);
    let lit = 0, hurt = 0, dead = 0;
    for (const n of sp.nodes) { const dm = n.mod ? Math.min(1, u.mods[n.mod.id] / n.mod.hp) : S.h[n.i]; if (!S.ok[n.i]) dead++; else if (dm > .05) hurt++; else lit++; }
    out.push([['Systems ', F], [`${sp.nodes.length}`, Wt], [' · lit ', F], [`${lit}`, LIME], [' · damaged ', F], [`${hurt}`, Wt], [' · out ', F], [`${dead}`, dead ? CORAL : Wt]]);
    const lost = [];
    for (const n of sp.nodes) if (!S.ok[n.i] && n.cls !== 'cable') lost.push(`${short(n.label)}${S.why[n.i] ? ' (' + S.why[n.i] + ')' : ''}`);
    const cw = sp.nodes.filter(n => n.cls === 'cable' && !S.ok[n.i]).length;
    if (cw) lost.push(`${cw} cable way segment${cw > 1 ? 's' : ''}`);
    if (lost.length) out.push([['Out ', F], [lost.slice(0, 4).join(' · ') + (lost.length > 4 ? ` · +${lost.length - 4}` : ''), CORAL]]);
    const caps = sp.capNames.filter(k => !S.caps[k]);
    if (caps.length) out.push([['Lost ', F], [caps.join(' · ').toUpperCase(), CORAL]]);
    return out;
  }
  const short = s => String(s).split(' · ')[0];
  const countBulkheads = L => {         // watertight transverse bulkheads (planes: a bulkhead is many boundaries)
    const zs = [];
    for (let k = 0; k < L.bn; k++) if (L.bKind[k] === 'bulkhead') { const z = (L.bBox[k * 6 + 2] + L.bBox[k * 6 + 5]) / 2; if (!zs.some(v => Math.abs(v - z) < 1)) zs.push(z); }
    return zs.length;
  };
  const openDoors = S => { let n = 0; for (let k = 0; k < S.L.bn; k++) if (S.door[k] > 0) n++; return n; };

  return { draw2d, readout, set hover(c) { hoverComp = c; } };
}

/* the spec of a type, for a legend (inspect's museum can show a class's layout without a unit) */
export function layoutFor(type) { const sp = shipSpec(type); return sp ? sp.L : null; }
