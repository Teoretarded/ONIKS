/* Floating-dot check (dev, QA): after a hit settles, nothing of a hit ship may hang in the air.
     const QA = await import('/game/src/blast/qa.js');
     QA.check(ONIKS)            -> { ok, flags: [{ kind, unit, patch, n, at: [x y z] (model frame), what }], stats }
     QA.check(ONIKS, { unit })  one unit; { settledOnly: false } judges patches still solving too
   What is flagged:
     'floating'   a cluster of the model's dots (joined within 0.6 m) the shader still draws round a patch that touches
                  nothing that holds it: no untouched part of the model, no intact plating, nothing standing on plating
     'orphan'     dots the shader leaves out (their plating tore or lost its support) that no loose piece carries
                  (they vanished instead of falling: not floating, reported so it can be fixed)
     'hovering'   a loose piece (a clump of the model or the solver's plating) neither falling nor at rest on a surface
     'resting-air' a piece at rest more than 0.35 m over the surface under it
     'hanging'    a cluster of the model's dots held only from 1.5 m or more above its foot while 20 or more of its dots
                  stand over torn plating (a part left hanging into a hole from its top: a frame, a davit, a sheer line)
     'big-piece'  a loose piece more than 8 m from its middle to its edge (a whole section taken as one block)
   The model's dots are the renderer's CPU clouds at ~0.3 m (support.js modelDots); the shader's test is replayed on the
   CPU copy of each patch's skin texels (support.js classify). */
import { modelDots, connectivity } from './support.js';

export function check(O, o = {}) {
  const g = O.game, b = g.blast, sim = g.sim;
  if (!b) return { ok: false, err: 'no blast system' };
  const flags = [], stats = { units: 0, patches: 0, dotsNear: 0, dropped: 0, carried: 0, bodies: 0, bodyDots: 0 };
  const units = o.unit !== undefined ? [o.unit] : [...b.byUnit.keys()];
  for (const uid of units) {
    const u = sim.units.get(uid), L = (b.byUnit.get(uid) || []).filter(B => B.rects.some(r => r.cpu) && (o.settledOnly === false || B.state === 'done'));
    if (!L.length) continue;
    stats.units++; stats.patches += L.length;
    if (!u) continue;
    let ent = null; try { ent = g.R.models.get(u.def.model); } catch (e) { ent = null; }
    const Md = ent ? modelDots(ent) : null;
    if (!Md || !Md.n) { flags.push({ kind: 'no-model-dots', unit: uid }); continue; }
    const T = b.taken.get(uid), C = connectivity(Md, L, T), D = Md.D;
    stats.dotsNear += C.n; stats.dropped += C.dropped.length; stats.carried += C.dropped.length - C.orphan.length;
    const at = l => { let x = 0, y = 0, z = 0; for (const i of l) { x += D[7 * i]; y += D[7 * i + 1]; z += D[7 * i + 2]; } return [x / l.length, y / l.length, z / l.length].map(v => +v.toFixed(2)); };
    for (const grp of C.floating) flags.push({ kind: 'floating', unit: uid, n: grp.length, at: at(grp), what: Md.parts[D[7 * grp[0] + 6]] });
    for (const grp of C.hanging) flags.push({ kind: 'hanging', unit: uid, n: grp.length, at: at(grp), what: Md.parts[D[7 * grp[0] + 6]] });
    if (C.orphan.length) flags.push({ kind: 'orphan', unit: uid, n: C.orphan.length, at: at(C.orphan), what: [...new Set(C.orphan.slice(0, 50).map(i => Md.parts[D[7 * i + 6]]))].join(',') });
  }
  // the loose pieces
  for (const B2 of b.bodies.list) {
    if (B2.gone || (o.unit !== undefined && B2.uid !== o.unit)) continue;
    stats.bodies++; stats.bodyDots += B2.n;
    if (B2.kind === 'clump') {
      if (B2.sea) continue;
      const moving = !B2.rest && !(B2.idle > .3) || Math.hypot(...B2.v) > .05;
      const gap = clumpGap(b, B2);
      let ex = 0; for (let i = 0; i < B2.n; i++) ex = Math.max(ex, Math.hypot(B2.rel[4 * i], B2.rel[4 * i + 1], B2.rel[4 * i + 2]));
      if (ex > 8) flags.push({ kind: 'big-piece', unit: B2.uid, n: B2.n, at: B2.p.map(v => +v.toFixed(2)), extent: +ex.toFixed(1) });
      if (B2.rest && gap > .35) flags.push({ kind: 'resting-air', unit: B2.uid, n: B2.n, at: B2.p.map(v => +v.toFixed(2)), gap: +gap.toFixed(2) });
      else if (!B2.rest && !moving) flags.push({ kind: 'hovering', unit: B2.uid, n: B2.n, at: B2.p.map(v => +v.toFixed(2)) });
    } else {
      let bad = 0, where = null;
      for (let i = 0; i < B2.n; i++) {
        if (B2.st[i] !== 1) continue;
        const o7 = 7 * i, f = b.floorAt(B2.uid, B2.P[o7], B2.P[o7 + 1] + .05, B2.P[o7 + 2]);
        if (!f.wall && f.y > -1e8 && B2.P[o7 + 1] - f.y > .35) { bad++; where = where || [B2.P[o7], B2.P[o7 + 1], B2.P[o7 + 2]].map(v => +v.toFixed(2)); }
      }
      if (bad) flags.push({ kind: 'resting-air', unit: B2.uid, n: bad, at: where, what: 'solver plating' });
    }
  }
  const hard = flags.filter(f => f.kind === 'floating' || f.kind === 'hovering' || f.kind === 'resting-air' || f.kind === 'hanging' || f.kind === 'big-piece');
  return { ok: hard.length === 0, flags, stats };
}
function clumpGap(b, B2) {
  let best = 1e9;
  for (let q = 0; q < B2.low.length; q++) {
    const i = B2.low[q], R = B2.R, x0 = B2.rel[4 * i], y0 = B2.rel[4 * i + 1], z0 = B2.rel[4 * i + 2];
    const x = B2.p[0] + R[0] * x0 + R[1] * y0 + R[2] * z0, y = B2.p[1] + R[3] * x0 + R[4] * y0 + R[5] * z0, z = B2.p[2] + R[6] * x0 + R[7] * y0 + R[8] * z0;
    const f = b.floorAt(B2.uid, x, y + .05, z);
    if (f.wall || f.y < -1e8) continue;
    best = Math.min(best, y - f.y);
  }
  return best === 1e9 ? 0 : best;
}
