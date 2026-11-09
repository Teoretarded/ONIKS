/* Hit data as files an agent (or a spreadsheet) can read: LAB.export(name) ->
   game/shots/lab/<name>/
     report.json     LAB.report() (charge, patch, sim, picture vs sim, perf, timeline, events)
     plates.csv      one row a solver plate: patch, plate, axis, plane, size, thickness, material, max / mean displacement,
                     torn / gone / edge / unsupported area, sooted area
     texels.csv      one row a plate texel that moved (> 5 mm) or is flagged: where it was built (model frame, m), how far
                     the damage moved it (model frame, m), |d| mm, its outward normal, the flags, soot
     pieces.csv      the loose pieces flying or lying (kind, dots, position and velocity in the blast system's frame, spin, heat)
     mesh.obj        the target's rest mesh (the debug style's triangles; model frame, m) - import it anywhere
   Model frame: +X starboard, +Y up from the waterline, +Z bow. Texel flags: 1 torn, 2 gone, 4 torn edge, 8 unsupported. */

const r4 = v => Math.round(v * 1e4) / 1e4;
const csv = (head, rows) => head.join(',') + '\n' + rows.map(r => r.map(v => typeof v === 'number' ? (Number.isFinite(v) ? r4(v) : '') : v === undefined || v === null ? '' : String(v).replace(/,/g, ';')).join(',')).join('\n') + '\n';

/* the plate texel (i, j) of rect r in patch B: its rest point and its displacement, both in the model frame */
function texelGeo(B, pl, r, i, j, out) {
  const F = B.spec && B.spec.frame, S = (B.spec && B.spec.S) || .25;
  const u = r.u0 + i * S, v = r.v0 + j * S, val = r.val;
  const l = r.ax === 0 ? [val, v, u] : r.ax === 1 ? [u, val, v] : [u, v, val];
  const k = 4 * (j * (r.nu + 1) + i), c = r.cpu;
  const d = [c[k], c[k + 1], c[k + 2]];
  if (!F) { out.p = l; out.d = d; out.n = [0, 0, 0]; return out; }
  const { O, X, Y, Z } = F;
  out.p = [O[0] + X[0] * l[0] + Y[0] * l[1] + Z[0] * l[2], O[1] + X[1] * l[0] + Y[1] * l[1] + Z[1] * l[2], O[2] + X[2] * l[0] + Y[2] * l[1] + Z[2] * l[2]];
  out.d = [X[0] * d[0] + Y[0] * d[1] + Z[0] * d[2], X[1] * d[0] + Y[1] * d[1] + Z[1] * d[2], X[2] * d[0] + Y[2] * d[1] + Z[2] * d[2]];
  const A = r.ax === 0 ? X : r.ax === 1 ? Y : Z;
  out.n = A.slice();
  out.flags = Math.floor(c[k + 3]); out.soot = c[k + 3] - out.flags; out.S = S;
  return out;
}

export function hitTables(core, game) {
  const P = core.patches(), plates = [], texels = [], g = {};
  for (const B of P) {
    const sp = B.spec || {}, S = sp.S || .25;
    for (const r of B.rects || []) {
      const pl = (sp.plates || [])[r.p] || {};
      let mx = 0, sum = 0, n = 0, torn = 0, gone = 0, edge = 0, uns = 0, soot = 0;
      for (let j = 0; j <= r.nv; j++) for (let i = 0; i <= r.nu; i++) {
        texelGeo(B, pl, r, i, j, g);
        const m = Math.hypot(g.d[0], g.d[1], g.d[2]);
        mx = Math.max(mx, m); sum += m; n++;
        if (g.flags & 1) torn++; if (g.flags & 2) gone++; if (g.flags & 4) edge++; if (g.flags & 8) uns++; if (g.soot > .05) soot++;
        if (m > .005 || g.flags || g.soot > .05)
          texels.push([B.id, r.p, i, j, g.p[0], g.p[1], g.p[2], g.d[0], g.d[1], g.d[2], m * 1000, g.d[0] * g.n[0] + g.d[1] * g.n[1] + g.d[2] * g.n[2], g.n[0], g.n[1], g.n[2], g.flags & 1 ? 1 : 0, g.flags & 2 ? 1 : 0, g.flags & 4 ? 1 : 0, g.flags & 8 ? 1 : 0, g.soot]);
      }
      const a = S * S;
      plates.push([B.id, B.solver || sp.solver || '', r.p, ['x', 'y', 'z'][r.ax], r.val, r.nu * S, r.nv * S, pl.h ? pl.h * 1000 : '', pl.mat || '', pl.skin ? 1 : 0, mx * 1000, n ? sum / n * 1000 : 0, torn * a, gone * a, edge * a, uns * a, soot * a]);
    }
  }
  const pieces = [];
  const bl = game.blast && game.blast.bodies ? game.blast.bodies.list : [];
  for (let k = 0; k < bl.length; k++) {
    const b = bl[k];
    if (b.gone || !b.p) continue;
    const p = b.p, v = b.v || [0, 0, 0], w = b.w || [0, 0, 0];
    pieces.push([k, b.uid ?? '', b.kind || '', b.n || 0, p[0], p[1], p[2], v[0], v[1], v[2], Math.hypot(v[0], v[1], v[2]), w[0], w[1], w[2], b.hot || 0, b.rest ? 1 : 0, b.sea ? 1 : 0, b.t || 0]);
  }
  return {
    plates: csv(['patch', 'solver', 'plate', 'axis', 'plane_m', 'w_m', 'h_m', 'thick_mm', 'mat', 'skin', 'max_disp_mm', 'mean_disp_mm', 'torn_m2', 'gone_m2', 'edge_m2', 'unsupported_m2', 'soot_m2'], plates),
    texels: csv(['patch', 'plate', 'i', 'j', 'x', 'y', 'z', 'dx', 'dy', 'dz', 'disp_mm', 'disp_normal_m', 'nx', 'ny', 'nz', 'torn', 'gone', 'edge', 'unsupported', 'soot'], texels),
    pieces: csv(['i', 'uid', 'kind', 'dots', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'speed', 'wx', 'wy', 'wz', 'hot', 'resting', 'in_sea', 'age_s'], pieces),
    counts: { plates: plates.length, texels: texels.length, pieces: pieces.length },
  };
}

export async function exportHit(core, game, name, key) {
  const post = (path, body) => fetch('/save?path=' + encodeURIComponent(path), { method: 'POST', body }).then(r => r.ok).catch(() => false);
  const dir = `game/shots/lab/${name}`, files = [];
  const T = hitTables(core, game);
  const rep = core.report();
  rep.tables = T.counts;
  for (const [f, body] of [['report.json', JSON.stringify(rep, null, 1)], ['plates.csv', T.plates], ['texels.csv', T.texels], ['pieces.csv', T.pieces]])
    if (await post(`${dir}/${f}`, body)) files.push(`${dir}/${f}`);
  const R = game.R, S = R && (R.solid || (R._solid && R._solid()));
  if (S && key) { try { if (await post(`${dir}/mesh.obj`, S.exportOBJ(key))) files.push(`${dir}/mesh.obj`); } catch (e) { console.warn('export: mesh', e); } }
  return { dir, files, counts: T.counts };
}
