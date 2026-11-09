/* Lab probe (dev/lab): what a hit has done to the target at tau, as numbers and vectors, the same for both pictures:
   'dots' (the game's model dots with the GPU blast patch, game/src/blast) and 'vox' (the voxel prototype, src/vox).
   Model frame throughout (+X starboard, +Y up from the waterline, +Z bow; m, m/s).

   probe(core, game, o) -> {
     mode, tau,
     defects: { vanished   plating dots / cells gone with nothing carrying them (metal that just disappears)
                floating   pieces or clusters held by nothing and not falling (metal hanging in the air)
                hanging    clusters held only from far above their foot over torn plating
                farSide    m2 of plating moved (> 5 cm) or gone on the far side of the hull from the hit (|x| > 2.2 m, the other
                           side of the centreline): an inside hit can reach it; a hit from outside should not
                restingAir pieces at rest over air }
     pieces: [{ kind, n, p, v, speed, rest, sea }]     the loose pieces (bodies), their centres and velocities
     frags:  [[x, y, z, vx, vy, vz, state]]           single loose dots / cells (fragments), capped at o.max (2000)
     plating: { moved, vmax, nodes: [[x, y, z, vx, vy, vz, flags]] }   (vox, phase A: the plating moving)
     numbers: the system's own (torn m2, opened m2, steps, solve ms...)
   }
   record(LAB, o) steps the shot through o.taus and saves every probe to game/shots/lab/<name>/data.json. */
import { modelDots, connectivity, classify } from '../../blast/support.js';

const r2 = v => Math.round(v * 100) / 100;

export function probe(core, game, o = {}) {
  const u = core.unit(), s = core.L.shot, tau = core.tau();
  if (!u || !s) return { mode: null, tau, err: 'no shot' };
  if (game.vox && game.vox.on(u.id)) return probeVox(core, game, u, s, tau, o);
  return probeDots(core, game, u, s, tau, o);
}

/* ------------------------------------------------------------------ the game's model dots + blast patches */
function probeDots(core, game, u, s, tau, o) {
  const max = o.max || 2000, B = game.blast, hitX = s.loc ? s.loc[0] : 0, side = Math.sign(hitX) || 1;
  const out = { mode: 'dots', tau, defects: { vanished: 0, floating: 0, floatingGroups: 0, hanging: 0, farSide: 0, restingAir: 0, hovering: 0 }, pieces: [], frags: [], plating: null, numbers: {} };
  const P = core.patches();
  out.numbers.patches = P.map(b => ({ id: b.id, state: b.state, torn: r2(b.torn || 0), flaps: r2(b.openM2 || 0), below: r2(b.below || 0), steps: b.steps || 0, wallMs: Math.round(b.wallMs || 0), tSolveMs: r2((b.tSolve || 0) * 1000) }));
  if (s.landed && !s.landed.solved) out.numbers.analytic = { mark: s.landed.mark, r: s.landed.r };
  // the model's dots round the patches: dropped (gone from the picture), carried by a piece or not (vanished), the
  // clusters left held by nothing (floating) or only from far above (hanging), and what went on the far side
  let ent = null; try { ent = game.R.models.get(u.def.model); } catch (e) { ent = null; }
  const Md = ent ? modelDots(ent) : null;
  const L = B ? (B.byUnit.get(u.id) || []).filter(b => b.rects && b.rects.some(r => r.cpu)) : [];
  if (Md && Md.n && L.length) {
    const T = B.taken.get(u.id), C = connectivity(Md, L, T), D = Md.D;
    out.defects.vanished = C.orphan.length;
    out.defects.floatingGroups = C.floating.length;
    out.defects.floating = C.floating.reduce((a, g) => a + g.length, 0);
    out.defects.hanging = C.hanging.reduce((a, g) => a + g.length, 0);
    let far = 0; for (const i of C.dropped) if (Math.abs(D[7 * i]) > 2.2 && Math.sign(D[7 * i]) !== side) far++;
    // (and the plating the patch moves on the far side: its texels displaced more than 5 cm, as area)
    let farMoved = 0;
    for (const b of L) {
      const F = b.spec.frame, S = b.spec.gridS || .25;
      for (const r of b.rects) {
        if (!r.cpu) continue;
        const W = r.nu + 1, ax = r.ax;
        for (let j = 0; j <= r.nv; j++) for (let i = 0; i <= r.nu; i++) {
          const t = 4 * (j * W + i), T = r.cpu; if (T[t] * T[t] + T[t + 1] * T[t + 1] + T[t + 2] * T[t + 2] < .0025) continue;
          const uu = r.u0 + i * S, vv = r.v0 + j * S, l = ax === 0 ? [r.val, vv, uu] : ax === 1 ? [uu, r.val, vv] : [uu, vv, r.val];
          const x = F.O[0] + F.X[0] * l[0] + F.Y[0] * l[1] + F.Z[0] * l[2];
          if (Math.abs(x) > 2.2 && Math.sign(x) !== side) farMoved += S * S;
        }
      }
    }
    // (m2: a dropped dot stands for ~0.09 m2 of plating at the clouds' 0.3 m)
    out.defects.farSide = r2(far * .09 + farMoved);
    out.numbers.dots = { near: C.n, dropped: C.dropped.length, carried: C.dropped.length - C.orphan.length };
    // where the vanished dots were (a few, for the overlay)
    out.vanishedAt = C.orphan.slice(0, 400).map(i => [D[7 * i], D[7 * i + 1], D[7 * i + 2]].map(r2));
    out.floatingAt = C.floating.slice(0, 40).map(g => { let x = 0, y = 0, z = 0; for (const i of g) { x += D[7 * i]; y += D[7 * i + 1]; z += D[7 * i + 2]; } return [x / g.length, y / g.length, z / g.length, g.length].map(r2); });
  }
  // the loose pieces and the solver's loose plating
  if (B) {
    let QA = null; try { QA = o.qa; } catch (e) { QA = null; }
    for (const b of B.bodies.list) {
      if (b.gone || b.uid !== u.id) continue;
      if (b.kind === 'clump') {
        const sp = Math.hypot(b.v[0], b.v[1], b.v[2]);
        out.pieces.push({ kind: 'clump', n: b.n, p: b.p.map(r2), v: b.v.map(r2), speed: r2(sp), rest: !!b.rest, sea: !!b.sea });
        if (!b.rest && !b.sea && sp < .05) out.defects.hovering++;
      } else {
        for (let i = 0; i < b.n && out.frags.length < max; i++) { const q = 7 * i; out.frags.push([b.P[q], b.P[q + 1], b.P[q + 2], b.P[q + 3], b.P[q + 4], b.P[q + 5], b.st[i]].map(r2)); }
      }
    }
    if (QA && QA.flags) out.defects.restingAir = QA.flags.filter(f => f.kind === 'resting-air').reduce((a, f) => a + (f.n || 1), 0);
  }
  const sm = core.sample() || {};
  Object.assign(out.numbers, { tornM2: sm.torn, flapsM2: sm.open, belowWlM2: sm.below, setMm: Math.round((sm.set || 0) * 1000), frameMs: sm.frameMs, solverShareMs: sm.budget });
  return out;
}

/* ------------------------------------------------------------------ the voxel prototype */
function probeVox(core, game, u, s, tau, o) {
  const d = game.vox.data(u.id, { tau, max: o.max || 2000 }) || {};
  const m = d.metrics || {}, st = game.vox.state(u.id);
  const side = Math.sign(s.loc ? s.loc[0] : 0) || 1;
  const out = { mode: 'vox', tau, phase: d.phase, defects: { vanished: 0, floating: 0, floatingGroups: 0, hanging: 0, farSide: 0, restingAir: 0, hovering: 0 },
    pieces: (d.bodies || []).map(b => ({ kind: 'body', n: b.n, p: b.c, v: b.v, speed: b.speed, rest: b.rest, sea: b.sea, low: b.low, touch: b.touch })), frags: d.frags || [], plating: d.plating || null,
    numbers: { solve: { state: st.state, wallMs: Math.round(st.wall || 0), lead: r2(st.lead || 0), tSolved: st.tSolved }, meta: st.meta, metrics: m } };
  // (by construction nothing vanishes: every cell is attached, in a piece or a fragment; a piece at rest is on a floor)
  // (hovering: a piece neither falling nor touching anything nor in the sea)
  for (const p of out.pieces) if (!p.rest && !p.sea && !p.touch && p.speed < .05 && out.phase === 'B') out.defects.hovering++;
  out.defects.farSide = r2((m.farSideMoved || 0) * .0625);
  return out;
}

/* ------------------------------------------------------------------ the displacement field (vectors), both pictures
   field(core, game) -> { mode, S (cell m), C (charge, model frame), cells: Float32Array 11 a cell:
     x y z (where it was built), dx dy dz (where it is now - that), nx ny nz (its normal as built; 0 0 0 unknown),
     flags (1 torn edge, 2 loose / gone, 4 fragment, 8 pocked, 16 in the sea), cls (0 outer plating, 1 interior) }
   dots: the blast patch's plates (each texel a cell of its grid; its normal the plate's axis) and the model dots the
   patch dropped (flag 2, no displacement known: they are gone from the picture or carried by a piece). vox: every
   cell of the hit's region. Only cells moved more than 1 cm, or torn / loose, are kept. */
export function field(core, game) {
  const u = core.unit(), s = core.L.shot; if (!u || !s) return null;
  const out = []; let S = .25, C = null;
  const push = (x, y, z, dx, dy, dz, nx, ny, nz, f, c) => { if (dx * dx + dy * dy + dz * dz < 1e-4 && !(f & 7)) return; out.push(x, y, z, dx, dy, dz, nx, ny, nz, f, c); };
  if (game.vox && game.vox.on(u.id)) {
    const F = game.vox.field(u.id); if (!F) return null;
    S = F.S; C = F.C;
    for (let a = 0; a < F.n; a++) { const q = 3 * a; push(F.rest[q], F.rest[q + 1], F.rest[q + 2], F.d[q], F.d[q + 1], F.d[q + 2], F.n0[q], F.n0[q + 1], F.n0[q + 2], F.flg[a], F.ins[a]); }
    return { mode: 'vox', S, C, n: out.length / 11, cells: Float32Array.from(out) };
  }
  const B = game.blast; if (!B) return null;
  const L = (B.byUnit.get(u.id) || []).filter(b => b.rects && b.rects.some(r => r.cpu));
  for (const b of L) {
    const F = b.spec.frame, G = b.spec.gridS || .25; S = G;
    if (!C && b.spec.charge) { const c = b.spec.charge.C; C = [0, 1, 2].map(k => F.O[k] + F.X[k] * c[0] + F.Y[k] * c[1] + F.Z[k] * c[2]); }
    for (const r of b.rects) {
      if (!r.cpu) continue;
      const W = r.nu + 1, ax = r.ax, A = ax === 0 ? F.X : ax === 1 ? F.Y : F.Z, T = r.cpu;
      for (let j = 0; j <= r.nv; j++) for (let i = 0; i <= r.nu; i++) {
        const t = 4 * (j * W + i), uu = r.u0 + i * G, vv = r.v0 + j * G, l = ax === 0 ? [r.val, vv, uu] : ax === 1 ? [uu, r.val, vv] : [uu, vv, r.val];
        const P = [0, 1, 2].map(k => F.O[k] + F.X[k] * l[0] + F.Y[k] * l[1] + F.Z[k] * l[2]);
        const dl = [T[t], T[t + 1], T[t + 2]], D = [0, 1, 2].map(k => F.X[k] * dl[0] + F.Y[k] * dl[1] + F.Z[k] * dl[2]);
        const fl = T[t + 3] | 0;
        push(P[0], P[1], P[2], D[0], D[1], D[2], A[0], A[1], A[2], (fl & 4 ? 1 : 0) | (fl & 3 ? 2 : 0), (b.spec.plates && b.spec.plates[r.p] && b.spec.plates[r.p].skin) ? 0 : 1);
      }
    }
  }
  // the model's dots the patch dropped (gone, or flying in a piece)
  let ent = null; try { ent = game.R.models.get(u.def.model); } catch (e) { ent = null; }
  const Md = ent ? modelDots(ent) : null;
  if (Md && Md.n && L.length) { const Cn = connectivity(Md, L, B.taken.get(u.id)), D = Md.D; for (const i of Cn.dropped) out.push(D[7 * i], D[7 * i + 1], D[7 * i + 2], 0, 0, 0, D[7 * i + 3], D[7 * i + 4], D[7 * i + 5], 2 | 32, Md.ins[D[7 * i + 6]] ? 1 : 0); }
  return { mode: 'dots', S, C, n: out.length / 11, cells: Float32Array.from(out) };
}
/* the field in numbers: how much moved how far, which way (away from the charge or toward it), out to where, by
   distance from the charge, the outer plating and the interior apart, and on the far side of the hull */
export function deformStats(Fd, hitX) {
  if (!Fd || !Fd.C) return null;
  const A = Fd.S * Fd.S, C = Fd.C, side = Math.sign(hitX || C[0]) || 1, c = Fd.cells, n = Fd.n;
  const th = [.05, .2, .5, 1], st = { cellM2: +A.toFixed(4), moved: [0, 0, 0, 0], movedShell: [0, 0, 0, 0], loose: 0, torn: 0, away: 0, toward: 0, outward: 0, inward: 0, maxM: 0, maxAt: null,
    reach: 0, farSide: 0, bins: [] };
  const bins = []; for (let k = 0; k < 16; k++) bins.push({ r: k, n: 0, moved: 0, sum: 0, max: 0, toward: 0 });
  for (let i = 0; i < n; i++) {
    const o = 11 * i, x = c[o], y = c[o + 1], z = c[o + 2], dx = c[o + 3], dy = c[o + 4], dz = c[o + 5], f = c[o + 9], cls = c[o + 10];
    const m = Math.hypot(dx, dy, dz), rx = x - C[0], ry = y - C[1], rz = z - C[2], R = Math.hypot(rx, ry, rz) || 1;
    if (f & 2) st.loose += A; if (f & 1) st.torn += A;
    if (m > st.maxM) { st.maxM = m; st.maxAt = [x, y, z].map(r2); }
    for (let k = 0; k < 4; k++) if (m > th[k]) { st.moved[k] += A; if (!cls) st.movedShell[k] += A; }
    const b = bins[Math.min(15, Math.floor(R))];
    b.n++; b.sum += m; b.max = Math.max(b.max, m);
    if (m > .05) {
      b.moved += A; st.reach = Math.max(st.reach, R);
      const rad = (dx * rx + dy * ry + dz * rz) / (m * R);
      if (rad > .2) st.away += A; else if (rad < -.2) { st.toward += A; b.toward += A; }
      const nn = c[o + 6] * dx + c[o + 7] * dy + c[o + 8] * dz; if (nn > 0) st.outward += A; else st.inward += A;
      if (Math.abs(x) > 2.2 && Math.sign(x) !== side) st.farSide += A;
    }
  }
  for (const k of ['loose', 'torn', 'away', 'toward', 'outward', 'inward', 'farSide', 'maxM', 'reach']) st[k] = r2(st[k]);
  st.moved = st.moved.map(r2); st.movedShell = st.movedShell.map(r2);
  st.thresholds = th;
  st.bins = bins.filter(b => b.n).map(b => ({ r: b.r, cells: b.n, movedM2: r2(b.moved), meanM: r2(b.sum / b.n), maxM: r2(b.max), towardM2: r2(b.toward) }));
  return st;
}

/* ------------------------------------------------------------------ the recorder */
export const TAUS = [0, .001, .002, .005, .01, .02, .035, .05, .1, .2, .35, .5, .75, 1, 1.5, 2, 3];
/* the taus whose whole displacement field is saved (field_<ms>.json: the vectors of every moved cell) */
export const FIELD_TAUS = [.005, .02, .05, .1, .5, 3];
export async function record(core, game, o = {}) {
  const name = o.name || `${core.L.type}_${core.L.kind}_${(game.vox && core.unit() && game.vox.on(core.unit().id)) ? 'vox' : 'dots'}_${Date.now().toString(36)}`;
  const taus = (o.taus || TAUS).filter(t => t <= (o.to || 3) + 1e-9);
  const rows = [];
  for (const t of taus) {
    await core.to(t);
    let qa = null; if (!(game.vox && game.vox.on(core.unit().id))) { try { qa = await core.qa(); } catch (e) { qa = null; } }
    const p = probe(core, game, { max: o.max || 2000, qa });
    // the displacement field: in numbers every row, the vectors themselves at FIELD_TAUS (and the last)
    let Fd = null; try { Fd = field(core, game); } catch (e) { console.error('lab field', e); }
    p.deform = deformStats(Fd, core.L.shot && core.L.shot.loc ? core.L.shot.loc[0] : 0);
    if (Fd && o.save !== false && (FIELD_TAUS.some(x => Math.abs(x - t) < 1e-6) || t === taus[taus.length - 1])) {
      const path = `game/shots/lab/${name}/field_${Math.round(t * 1000)}ms.json`;
      const body = JSON.stringify({ tau: t, mode: Fd.mode, S: Fd.S, C: Fd.C, n: Fd.n, columns: ['x', 'y', 'z', 'dx', 'dy', 'dz', 'nx', 'ny', 'nz', 'flags', 'cls'], cells: Array.from(Fd.cells, v => Math.round(v * 1000) / 1000) });
      await fetch('/save?path=' + encodeURIComponent(path), { method: 'POST', body }).catch(() => false);
    }
    rows.push(p);
    if (o.onStep) o.onStep(t, p);
  }
  const doc = { at: new Date().toISOString(), name, shot: core.report({ samples: 60 }).shot, target: core.L.type, kind: core.L.kind, taus, rows,
    summary: summarize(rows) };
  let saved = null;
  if (o.save !== false) {
    const path = `game/shots/lab/${name}/data.json`;
    const ok = await fetch('/save?path=' + encodeURIComponent(path), { method: 'POST', body: JSON.stringify(doc) }).then(r => r.ok).catch(() => false);
    saved = ok ? path : null;
  }
  return { name, saved, summary: doc.summary, rows: rows.length };
}
export function summarize(rows) {
  const last = rows[rows.length - 1] || {}, D = k => Math.max(0, ...rows.map(r => (r.defects && r.defects[k]) || 0));
  const dm = rows.map(r => r.deform).filter(Boolean), lastD = dm[dm.length - 1] || null;
  return { deformEnd: lastD && { movedM2: lastD.moved, shellMovedM2: lastD.movedShell, looseM2: lastD.loose, tornM2: lastD.torn, awayM2: lastD.away, towardM2: lastD.toward, outwardM2: lastD.outward, inwardM2: lastD.inward, reachM: lastD.reach, farSideM2: lastD.farSide, maxM: lastD.maxM },
    mode: last.mode, worst: { vanished: D('vanished'), floating: D('floating'), hanging: D('hanging'), farSide: D('farSide'), hovering: D('hovering'), restingAir: D('restingAir') },
    end: { pieces: (last.pieces || []).length, piecesAtRest: (last.pieces || []).filter(p => p.rest).length, piecesInSea: (last.pieces || []).filter(p => p.sea).length, frags: (last.frags || []).length },
    numbers: last.numbers };
}

/* the vectors over the view (the lab's overlay): pieces and fragments with their velocity (0.05 s of travel), the
   vanished dots as coral crosses, the floating clusters as coral rings */
export function drawVectors(ctx, P, core, game) {
  if (!P) return;
  const u = core.unit(); if (!u) return;
  const cam = game.R.camera, F = core.frameOf(u), pj = q => cam.project(core.toWorld(u, q, F));
  ctx.save(); ctx.lineWidth = 1;
  const arrow = (p, v, col, k = .05) => {
    const a = pj(p), b = pj([p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k]); if (!a || !b) return;
    ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(a[0] - 1, a[1] - 1, 2, 2);
  };
  for (const f of P.frags || []) arrow(f.slice(0, 3), f.slice(3, 6), 'rgba(255,255,255,.55)');
  for (const p of P.pieces || []) arrow(p.p, p.v, p.rest ? 'rgba(198,244,50,.6)' : 'rgba(198,244,50,1)', .1);
  if (P.plating) for (const n of P.plating.nodes.slice(0, 1500)) arrow(n.slice(0, 3), n.slice(3, 6), 'rgba(160,200,255,.45)', .004);
  // the displacement field: from where each cell was built to where it is (every k-th, up to ~2500), coloured by size
  if (P.field && P.field.n) {
    const c = P.field.cells, n = P.field.n, k = Math.max(1, Math.ceil(n / 2500));
    for (let i = 0; i < n; i += k) {
      const o = 11 * i; if (c[o + 9] & 32) continue;
      const m = Math.hypot(c[o + 3], c[o + 4], c[o + 5]); if (m < .05) continue;
      arrow([c[o], c[o + 1], c[o + 2]], [c[o + 3], c[o + 4], c[o + 5]], m > 1 ? 'rgba(255,106,61,.8)' : m > .25 ? 'rgba(255,240,180,.6)' : 'rgba(198,244,50,.5)', 1);
    }
  }
  ctx.strokeStyle = 'rgba(255,106,61,.9)';
  for (const q of P.vanishedAt || []) { const a = pj(q); if (!a) continue; ctx.beginPath(); ctx.moveTo(a[0] - 2, a[1] - 2); ctx.lineTo(a[0] + 2, a[1] + 2); ctx.moveTo(a[0] + 2, a[1] - 2); ctx.lineTo(a[0] - 2, a[1] + 2); ctx.stroke(); }
  for (const q of P.floatingAt || []) { const a = pj(q); if (!a) continue; ctx.beginPath(); ctx.arc(a[0], a[1], 4 + Math.sqrt(q[3]), 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}
