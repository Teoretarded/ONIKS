/* Inspect subject: one model key's anatomy (data/anatomy.js) resolved against the engine's model entry.

   makeSubject(R, AN, DM, key) -> subject | null
     key        anatomy / model key (tel, destroyer, oniks, sam57e6 ...)
     cutKey     the model drawn in Inspect (the cutaway when there is one)
     parts[]    { P (engine part), name, en (anatomy entry), cls 'shell' | 'part' | 'hidden', pts (thinned local xyz) }
     entries[]  placards: { en, id, label, size, parts[], anchor: { pi, local } }
     axis       { i (0 x, 1 y, 2 z), u (the 'up' index for the slice tag), z0, z1, L } extent along the axis the
                slice runs along: the model's long axis (+Z for vehicles, ships and rounds; +Y for a canister on end)
     profile    per z-bin: top y, the part the slice is cutting (station names)
   subject.pose(F) fills per-part offsets / partX and the world transform for a frame state
     F = { R0, T0, st, e (explode 0..1) }
   The rest (drawing, tags) lives in inspect.js and overlay.js. Public-reference level only. */

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;

/* the cut model's parts under the sim's damageable part names (data/units.js), by model key; a sim part whose
   name is a model part maps to itself */
const SIM_PARTS = {
  tel: { chassis: ['frame', 'tank', 'boxes', 'bay', 'fans', 'engine', 'engacc', 'radL', 'radR', 'gearbox', 'transfer', 'shafts'],
    wheels: ['tyresL', 'tyresR', 'hubL', 'hubR', 'axles'], cab: ['cab'], launcher: ['launcher', 'capL', 'capR'], ram: ['ram'],
    jacks: ['jacksL', 'jacksR', 'outrigL', 'outrigR'] },
  radar: { chassis: ['frame', 'bay', 'fans', 'engine'], wheels: ['wheelsL', 'wheelsR'], body: ['body', 'inside'] },
  pantsir: { chassis: ['frame', 'body', 'engine', 'power'], wheels: ['wheelsL', 'wheelsR'], turret: ['turret', 'ring'], guns: ['gunL', 'gunR'],
    missiles: ['packL', 'packR'] },
  drone: { wing: ['wingL', 'wingR', 'wingC'] },
  destroyer: { hull: ['hullMid', 'bow', 'stern', 'mach', 'trunks', 'shaftIn', 'props'], super: ['superF'], spy: ['superF'],
    vlsF: ['vlsF', 'vlsBF'], vlsA: ['vlsA', 'vlsBA'], hangar: ['hangar', 'hdoor', 'helo'], boats: ['boatsS', 'boatsP'] },
  helo: { gear: ['gearL', 'gearR', 'gearT'], pylons: ['pylonsL', 'pylonsR'] },
  fighter: { lex: ['lexL', 'lexR'], wings: ['wingsL', 'wingsR'], tails: ['tailsL', 'tailsR'], stabs: ['stabsL', 'stabsR'],
    intakes: ['intakesL', 'intakesR', 'intakesC'], nozzles: ['nozzlesL', 'nozzlesR', 'nozzlesC'], pylons: ['pylonsL', 'pylonsR', 'pylonsC'] },
};

/* short names for what the x-ray finds in a container (the confidence classes: empty, inert, the round) */
const CONTENT = { oniks: '3M55', oniks_booster: 'Booster', pantsir_missile: '57E6', sam57e6: '57E6', mk41_can: 'Mk 41', tlc: 'TLC' };

/* the slice tag's word for the thing it runs through */
const KIND_WORD = { unit: 'body', structure: 'site', munition: 'body', cut: 'body' };
const KEY_WORD = { destroyer: 'hull', carrier: 'hull', helo: 'airframe', fighter: 'airframe', drone: 'airframe', catapult: 'trailer', hq: 'site' };

export function stateDefaults(DM, key) {
  const f = (DM && DM.MODEL_STATES && DM.MODEL_STATES[key]) || {}, d = {};
  for (const k of Object.keys(f)) { const v = f[k]; d[k] = Array.isArray(v) ? v[2] : v; }
  return d;
}

/* up to n points of a cloud (stride 4) as local xyz (stride 3) */
function thin(cl, n) {
  if (!cl || !cl.n || !cl.pts) return new Float32Array(0);
  const step = Math.max(1, Math.ceil(cl.n / n)), m = Math.ceil(cl.n / step), o = new Float32Array(m * 3);
  for (let i = 0, j = 0; i < cl.n && j < m; i += step, j++) { o[j * 3] = cl.pts[i * 4]; o[j * 3 + 1] = cl.pts[i * 4 + 1]; o[j * 3 + 2] = cl.pts[i * 4 + 2]; }
  return o;
}
function xfOf(part, st) { try { return part.xf ? part.xf(st) : null; } catch (e) { return null; } }
/* rigid {R, T} (row-major R) applied to a point */
function apX(X, x, y, z, o) {
  if (!X) { o[0] = x; o[1] = y; o[2] = z; return o; }
  const M = X.R, T = X.T;
  o[0] = M[0] * x + M[1] * y + M[2] * z + T[0]; o[1] = M[3] * x + M[4] * y + M[5] * z + T[1]; o[2] = M[6] * x + M[7] * y + M[8] * z + T[2];
  return o;
}

export function makeSubject(R, AN, DM, key) {
  const A = (AN && AN.ANATOMY[key]) || null;
  const cutKey = A && R.models.has(A.model) ? A.model : key;
  if (!R.models.has(cutKey)) return null;
  const e = R.models.get(cutKey);
  const info = (DM && DM.MODEL_INFO && (DM.MODEL_INFO[key] || DM.MODEL_INFO[cutKey])) || {};
  const st0 = Object.assign(stateDefaults(DM, cutKey), stateDefaults(DM, key), (A && A.st) || {}, { xray: 1 });
  const lod = Math.min(e.lods.length - 1, 2);
  const q = [0, 0, 0];

  const parts = e.parts.map((P, i) => {
    const en = A ? AN.entryOf(key, P.name) : null;
    const cls = P.part.inside ? 'hidden' : en ? en.cls : 'part';
    let cl = null;
    try { cl = R.models.cloud(e, P, lod, st0, true); } catch (err) { cl = null; }
    return { P, name: P.name, i, en, cls, pts: thin(cl, 140), off: [0, 0, 0], k: 0, X: null, px: { R: I3, T: [0, 0, 0] }, dmg: 0 };
  });
  const byName = new Map(parts.map(p => [p.name, p]));

  /* the long axis: model-space z extent at the default state, and a profile along it (top of the model; the part
     the slice is cutting through, interior parts first) */
  let z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
  const modelPts = parts.map(p => {
    const X = xfOf(p.P.part, st0), n = p.pts.length / 3, o = new Float32Array(n * 3);
    for (let j = 0; j < n; j++) {
      apX(X, p.pts[j * 3], p.pts[j * 3 + 1], p.pts[j * 3 + 2], q);
      o[j * 3] = q[0]; o[j * 3 + 1] = q[1]; o[j * 3 + 2] = q[2];
      if (q[2] < z0) z0 = q[2]; if (q[2] > z1) z1 = q[2];
      if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
      if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
    }
    return o;
  });
  if (z0 > z1) { z0 = -1; z1 = 1; y0 = 0; y1 = 1; x0 = -1; x1 = 1; }
  // the slice's axis: z unless another extent is clearly the long one (a canister stood on end, a mast)
  const ext = [x1 - x0, y1 - y0, z1 - z0], mxE = Math.max(...ext);
  const ai = ext[2] >= mxE * .7 ? 2 : ext.indexOf(mxE), ui = ai === 1 ? 0 : 1;
  const lo = [x0, y0, z0][ai], hi = [x1, y1, z1][ai];
  const zx0 = z0, zx1 = z1; z0 = lo; z1 = hi;
  const L = Math.max(.1, z1 - z0);
  const NB = 48, top = new Float32Array(NB).fill(-1e9), stn = new Array(NB).fill(null);
  {
    const score = Array.from({ length: NB }, () => new Map());
    parts.forEach((p, pi) => {
      const o = modelPts[pi], w = p.cls === 'hidden' ? 3 : p.cls === 'part' ? 1.6 : 1;
      const en = p.en && p.en.id ? p.en : null;
      for (let j = 0; j < o.length; j += 3) {
        const b = Math.max(0, Math.min(NB - 1, Math.floor((o[j + ai] - z0) / L * NB)));
        if (p.cls !== 'hidden' && o[j + ui] > top[b]) top[b] = o[j + ui];
        if (en) score[b].set(en, (score[b].get(en) || 0) + w);
      }
    });
    for (let b = 0; b < NB; b++) {
      if (top[b] < -1e8) top[b] = b ? top[b - 1] : [x1, y1, zx1][ui];
      let best = null, bs = 0; for (const [en, s] of score[b]) if (s > bs) { bs = s; best = en; }
      stn[b] = best;
    }
  }

  /* placards: entries with an id; anchor = the given one (first part's frame) or the part point nearest the
     entry's centre (so the dot sits on metal) */
  const entries = [];
  if (A) for (const en of A.parts) {
    const ps = en.parts.map(n => byName.get(n)).filter(Boolean);
    if (!ps.length) continue;
    let anchor;
    if (en.anchor) anchor = { pi: ps[0].i, local: en.anchor.slice() };
    else {
      let cx = 0, cy = 0, cz = 0, n = 0;
      for (const p of ps) { const o = modelPts[p.i]; for (let j = 0; j < o.length; j += 3) { cx += o[j]; cy += o[j + 1]; cz += o[j + 2]; n++; } }
      if (n) { cx /= n; cy /= n; cz /= n; }
      let best = null, bd = 1e18;
      for (const p of ps) {
        const o = modelPts[p.i];
        for (let j = 0; j < o.length; j += 3) { const d = (o[j] - cx) ** 2 + (o[j + 1] - cy) ** 2 * 1.5 + (o[j + 2] - cz) ** 2; if (d < bd) { bd = d; best = { pi: p.i, local: [p.pts[j], p.pts[j + 1], p.pts[j + 2]] }; } }
      }
      anchor = best || { pi: ps[0].i, local: [0, 0, 0] };
    }
    const ent = { en, id: en.id, label: en.label, size: en.size || '', side: en.side || null, parts: ps, anchor,
      az: 0, world: [0, 0, 0], model: [0, 0, 0], k: 0, dmg: 0, box: null, scr: null };
    // model-space z of the anchor at rest: when the slice reaches it
    apX(xfOf(parts[anchor.pi].P.part, st0), anchor.local[0], anchor.local[1], anchor.local[2], q); ent.az = q[ai];
    if (en.id) entries.push(ent);
    for (const p of ps) p.ent = ent;
  }

  const title = (A && A.title) || info.name || key;
  const S = {
    key, cutKey, A, e, info, title, size: (A && A.size) || '', note: (A && A.note) || '', kind: info.kind || 'unit',
    parts, byName, entries, st0, lod,
    axis: { i: ai, u: ui, dir: [ai === 0 ? 1 : 0, ai === 1 ? 1 : 0, ai === 2 ? 1 : 0], name: 'xyz'[ai], z0, z1, L, y0, y1, x0, x1, zx0, zx1 },
    top, stn, NB,
    radius: e.radius, center: e.center,
    scanWord: (A && A.frame) || KEY_WORD[key] || KIND_WORD[info.kind] || 'body',
    shortTitle: title.split(' · ')[0],
    xrayGroups: A && A.xray ? A.xray : [],
    contentName: m => CONTENT[m] || m,
    /* per cut part: the sim part names that damage it */
    simMap: null,
  };
  S.topAt = z => { const b = Math.max(0, Math.min(NB - 1, Math.floor((z - z0) / L * NB))); return top[b]; };
  S.stationAt = z => { if (z < z0 || z > z1) return null; const b = Math.max(0, Math.min(NB - 1, Math.floor((z - z0) / L * NB))); return stn[b]; };

  /* damage: cut part -> sim parts (the unit model's part names) */
  S.mapDamage = (baseKey, simParts) => {
    const m = new Map(), tab = SIM_PARTS[baseKey] || {};
    for (const sp of Object.keys(simParts || {})) {
      const list = tab[sp] || (byName.has(sp) ? [sp] : parts.filter(p => p.name.startsWith(sp)).map(p => p.name));
      for (const n of list) { if (!m.has(n)) m.set(n, []); m.get(n).push(sp); }
    }
    S.simMap = m;
    return m;
  };

  /* dyn parts (telescoping rams, cranes): re-take their thinned points at the state now (engine-cached per
     quantized state; not forced, so it never stalls a frame) */
  S.refreshDyn = st => {
    for (const p of parts) {
      if (!p.P.dyn) continue;
      let cl = null;
      try { cl = R.models.cloud(e, p.P, lod, st, false); } catch (err) { cl = null; }
      if (cl && cl.n && cl !== p.cl) { p.cl = cl; p.pts = thin(cl, 140); }
    }
  };
  /* the frame: explode offsets, partX (part-local), world anchors. F = { R0, T0, st, e } */
  S.pose = (F, AN_) => {
    const st = F.st, ex = F.e || 0;
    for (const p of parts) {
      p.X = xfOf(p.P.part, st);
      const en = p.en;
      let k = 0;
      if (en && ex > 0) k = AN_.explodeK(en.w0, ex);
      p.k = k;
      const o = p.off;
      if (k > 0) { o[0] = en.explode[0] * k; o[1] = en.explode[1] * k; o[2] = en.explode[2] * k; }
      else { o[0] = o[1] = o[2] = 0; }
      // partX is in part space: T = X.R^T * off
      if (k > 0) {
        const M = p.X ? p.X.R : I3, T = p.px.T;
        T[0] = M[0] * o[0] + M[3] * o[1] + M[6] * o[2]; T[1] = M[1] * o[0] + M[4] * o[1] + M[7] * o[2]; T[2] = M[2] * o[0] + M[5] * o[1] + M[8] * o[2];
      }
    }
    const R0 = F.R0, T0 = F.T0;
    for (const ent of entries) {
      const p = parts[ent.anchor.pi];
      apX(p.X, ent.anchor.local[0], ent.anchor.local[1], ent.anchor.local[2], q);
      const eo = ent.parts[0].off;
      ent.model[0] = q[0] + eo[0]; ent.model[1] = q[1] + eo[1]; ent.model[2] = q[2] + eo[2];
      ent.k = ent.parts[0].k;
      toWorld(R0, T0, ent.model, ent.world);
    }
  };

  /* screen box of a part as drawn (thinned points through part xf + explode offset + instance) */
  const w = [0, 0, 0], sp = [0, 0, 0];
  S.partBox = (p, R0, T0, cam, box) => {
    const P = p.pts, n = P.length / 3; if (!n) return box;
    let bx0 = box ? box[0] : 1e9, by0 = box ? box[1] : 1e9, bx1 = box ? box[2] : -1e9, by1 = box ? box[3] : -1e9, ok = false;
    for (let j = 0; j < n; j++) {
      apX(p.X, P[j * 3], P[j * 3 + 1], P[j * 3 + 2], q);
      q[0] += p.off[0]; q[1] += p.off[1]; q[2] += p.off[2];
      toWorld(R0, T0, q, w);
      if (!cam.project(w, sp)) continue;
      ok = true;
      if (sp[0] < bx0) bx0 = sp[0]; if (sp[0] > bx1) bx1 = sp[0]; if (sp[1] < by0) by0 = sp[1]; if (sp[1] > by1) by1 = sp[1];
    }
    if (!ok) return box;
    if (!box) return [bx0, by0, bx1, by1];
    box[0] = bx0; box[1] = by0; box[2] = bx1; box[3] = by1; return box;
  };
  /* model-space bounds of a set of parts at the current pose (with offsets): [[min], [max]] */
  S.partsBounds = ps => {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const p of ps) {
      const P = p.pts;
      for (let j = 0; j < P.length; j += 3) {
        apX(p.X, P[j], P[j + 1], P[j + 2], q);
        for (let k = 0; k < 3; k++) { const v = q[k] + p.off[k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
      }
    }
    return mn[0] > mx[0] ? null : [mn, mx];
  };
  return S;
}

export function toWorld(R0, T0, m, o) {
  o[0] = R0[0] * m[0] + R0[1] * m[1] + R0[2] * m[2] + T0[0];
  o[1] = R0[3] * m[0] + R0[4] * m[1] + R0[5] * m[2] + T0[1];
  o[2] = R0[6] * m[0] + R0[7] * m[1] + R0[8] * m[2] + T0[2];
  return o;
}
export { sat, apX, I3 };
