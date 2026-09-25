/* Ground detail · the vegetation of each map: where trees, scrub and rocks grow, by height, slope, relief, the
   distance from the water and the latitude, as two masks on the map's node grid (100 m) that the vegetation pass
   samples (ground/veg.js). Pure; runs once at load (~40-90 ms).

   mask A (RGBA8): trees, scrub (bushes / reeds / dwarf pine / tundra shrub), boulders, conifer share
   mask B (RGBA8): windbreaks allowed (field belts), shore rocks allowed, spare, spare
   The shader breaks these smooth fields into stands and glades with its own noise (50-500 m) and places each tree.

   Per map (the realism the user asks for: what grows there, how tall):
     krasnaya_kosa  steppe coast (Kuban): isolated acacia and elm, woods in the balkas, steppe scrub, poplar
                    windbreaks along the fields, bare clay bluff and sand spit
     fjord          Kola coast: spruce, pine and birch in the valleys and on the lower slopes up to a tree line near
                    330 m (birch at the limit), dwarf birch and juniper above it, bare fjell and cliffs, rocky shores
     arctic         tundra: dwarf birch and willow in the hollows, a few stunted birch woods at the head of the fjord
                    (sheltered), boulder fields on the hills, bouldery bays
     archipelago    White Sea skerries: pine on the bigger islands and in the hollows, bare rock domes, bare skerries
     delta          willows and poplars along the channels and levees, reed beds on the marsh, woods on the terraces
     caldera        Kuril volcano: stone birch and pine on the outer flanks, dwarf pine thickets above them, bare rim,
                    cliffs and the young cone
     strait         mixed forest on the western hills, groves and windbreaks on the eastern plain
     harbour        broadleaf-mixed forest on the hills round the city, a few windbreaks on the western plain */
import { distance } from '../../world/grid.js';
import { makeNoise, ss, sat } from '../../world/noise.js';

/* per map: tree heights (m), crown radius factor, shader knobs */
export const CLIMATE = {
  krasnaya_kosa: { treeH: [6, 13], crownK: 1.1, dens: .55, patch: 260, contrast: 1.0, treeline: 9999, scrub: 'bush', windbreak: 1, poplar: .55, rockShore: 0, rockK: .8, seed: 11 },
  fjord: { treeH: [8, 17], crownK: .9, dens: .55, patch: 190, contrast: 1.1, treeline: 330, scrub: 'bush', windbreak: 0, poplar: 0, rockShore: .75, rockK: 1, seed: 12 },
  arctic: { treeH: [3, 6.5], crownK: .9, dens: .5, patch: 150, contrast: 1.1, treeline: 140, scrub: 'tundra', windbreak: 0, poplar: 0, rockShore: .9, rockK: 1.1, seed: 13 },
  archipelago: { treeH: [9, 18], crownK: .95, dens: .5, patch: 140, contrast: 1.0, treeline: 9999, scrub: 'bush', windbreak: 0, poplar: 0, rockShore: .85, rockK: 1.2, seed: 14 },
  delta: { treeH: [8, 17], crownK: 1.15, dens: .6, patch: 200, contrast: .9, treeline: 9999, scrub: 'reeds', windbreak: .55, poplar: .4, rockShore: 0, rockK: .8, seed: 15 },
  caldera: { treeH: [5, 11], crownK: 1.05, dens: .6, patch: 190, contrast: 1.15, treeline: 420, scrub: 'dwarfpine', windbreak: 0, poplar: 0, rockShore: .8, rockK: 1.2, seed: 16 },
  strait: { treeH: [9, 18], crownK: 1, dens: .58, patch: 240, contrast: 1.25, treeline: 9999, scrub: 'bush', windbreak: .75, poplar: .35, rockShore: .45, rockK: 1, seed: 17 },
  harbour: { treeH: [10, 20], crownK: 1.05, dens: .6, patch: 240, contrast: 1.2, treeline: 720, scrub: 'bush', windbreak: .3, poplar: .2, rockShore: .35, rockK: 1, seed: 18 },
};
const DEFAULT = { treeH: [8, 15], crownK: 1, dens: .65, patch: 200, contrast: 1, treeline: 9999, scrub: 'bush', windbreak: .3, poplar: .2, rockShore: .4, rockK: 1, seed: 19 };
export const climateOf = id => CLIMATE[id] || DEFAULT;
const SITE_R = { port: 330, depot: 140, radar_hill: 70, airfield: 1400, lighthouse: 45 };

/* the caldera's geometry (world/gens/caldera.js) */
const CAL = { cx: -4000, cz: -3000, rim: 15500, cone: [-2200, -4200] };

/* per-node rules: n = { h, slope, curv (+ convex, - hollow), dc (m to the water), x, z, reg (-1..1 regional noise) }
   -> sets o[0..3] = trees, scrub, rock, conifer share */
const RULES = {
  krasnaya_kosa(n, o) {
    const gully = ss(.35, 2.2, -n.curv), steep = ss(.5, .95, n.slope);
    const beach = n.h < 3 && n.dc < 400 ? 1 : 0;
    o[0] = (.03 + .08 * sat(n.reg) + .78 * gully * (1 - steep)) * (1 - beach);
    o[1] = (.06 + .1 * sat(-n.reg) + .35 * gully + .25 * ss(.1, .4, n.slope) * (1 - steep)) * (1 - .7 * beach);
    o[2] = .18 * steep;
    o[3] = .03;
  },
  fjord(n, o) {
    const tl = 330, alt = 1 - ss(tl - 160, tl + 30, n.h), steep = 1 - ss(.55, .95, n.slope), vall = ss(-1.2, 2, -n.curv);
    const exposed = n.dc < 250 && n.h < 25 ? .55 : 1;
    o[0] = alt * steep * (.62 + .38 * vall) * exposed * (.84 + .16 * n.reg);
    o[1] = (.4 * ss(tl - 120, tl + 60, n.h) * (1 - ss(620, 820, n.h)) + .12 * alt) * (1 - ss(.75, 1.1, n.slope));
    o[2] = .3 * ss(.45, .9, n.slope) + .25 * ss(480, 800, n.h) * (1 - ss(.9, 1.3, n.slope)) + .08 * ss(-.2, 1.5, n.curv);
    o[3] = .15 + .55 * (1 - ss(90, 300, n.h));
  },
  arctic(n, o) {
    const hollow = ss(.2, 1.8, -n.curv), head = ss(-30000, -41000, n.z);
    o[0] = .4 * head * hollow * (1 - ss(50, 140, n.h)) * (1 - ss(.25, .6, n.slope)) * (n.dc > 250 ? 1 : .3);
    o[1] = (.22 + .45 * hollow) * (1 - ss(220, 380, n.h)) * (1 - ss(.5, .9, n.slope));
    o[2] = .12 + .35 * ss(230, 420, n.h) + .4 * ss(.35, .85, n.slope) + .15 * ss(0, 2, n.curv);
    o[3] = .02;
  },
  archipelago(n, o) {
    const dome = ss(.4, 2.6, n.curv), island = ss(60, 320, n.dc);
    o[0] = .76 * (1 - .8 * dome) * (1 - ss(.5, .9, n.slope)) * island * (n.h > 2 ? 1 : 0);
    o[1] = (.18 + .15 * (1 - island)) * (1 - ss(.8, 1.2, n.slope));
    o[2] = .18 + .45 * dome + .3 * (1 - ss(60, 220, n.dc));
    o[3] = .85;
  },
  delta(n, o) {
    const bank = 1 - ss(70, 320, n.dc), terrace = ss(6, 12, n.h);
    o[0] = (.78 * ss(1, 2.2, n.h) * bank + .62 * terrace * (1 - ss(.4, .8, n.slope)) + .03) * (.85 + .15 * n.reg);
    o[1] = .95 * (1 - ss(1.8, 3.6, n.h)) * (1 - ss(500, 1800, n.dc)) + .07;
    o[2] = .3 * ss(.4, .8, n.slope);
    o[3] = 0;
  },
  caldera(n, o) {
    const r = Math.hypot(n.x - CAL.cx, n.z - CAL.cz), outer = ss(CAL.rim + 300, CAL.rim + 1600, r);
    const cone = 1 - ss(1800, 3200, Math.hypot(n.x - CAL.cone[0], n.z - CAL.cone[1]));
    const steep = 1 - ss(.5, .9, n.slope);
    o[0] = (.72 * outer * ss(12, 50, n.h) * (1 - ss(200, 380, n.h)) + .2 * (1 - outer) * (1 - ss(40, 160, n.h))) * steep * (1 - cone);
    o[1] = .62 * ss(160, 300, n.h) * (1 - ss(500, 640, n.h)) * (1 - ss(.7, 1.1, n.slope)) * (1 - cone);
    o[2] = .3 * ss(470, 640, n.h) + .45 * ss(.5, .95, n.slope) + .45 * cone;
    o[3] = .65;
  },
  strait(n, o) {
    const hill = ss(45, 120, n.h), steep = 1 - ss(.7, 1.05, n.slope);
    o[0] = (.6 * hill + .05 + .2 * ss(-.5, 2, -n.curv) * (1 - hill) + .12 * ss(-.5, 2, -n.curv) * hill) * steep * (.8 + .2 * n.reg);
    o[1] = .1 + .2 * ss(.15, .45, n.slope) * steep;
    o[2] = .35 * ss(.55, .95, n.slope);
    o[3] = .35;
  },
  harbour(n, o) {
    const hill = ss(15, 70, n.h), steep = 1 - ss(.75, 1.1, n.slope);
    o[0] = .72 * hill * steep * (1 - ss(650, 780, n.h)) * (.5 + .5 * ss(30, 110, n.h)) * (.85 + .15 * n.reg);
    o[1] = .14 + .1 * (1 - hill);
    o[2] = .32 * ss(.6, 1, n.slope);
    o[3] = .2;
  },
};
RULES.default = RULES.strait;

/* build the masks. ctx: { map, T (terrain: NT gradients), plan (landmarks' plan or null) } ->
   { A: Uint8Array cols*rows*4, B: Uint8Array cols*rows*4, presence: { cell, cols, rows, SA }, ms } */
export function buildMasks(ctx) {
  const t0 = performance.now();
  const { map, T, plan } = ctx, cl = climateOf(map.id), rule = RULES[map.id] || RULES.default;
  const cols = T.cols, rows = T.rows, cell = T.cell, x0 = T.x0, z0 = T.z0, H = map.heights, NT = T.NT;
  const N = cols * rows;
  // distance to the water (m)
  const wet = new Uint8Array(N);
  for (let k = 0; k < N; k++) wet[k] = H[k] <= 0 ? 1 : 0;
  const dcell = distance(wet, cols, rows);
  // regional noise on a 1 km grid (forest regions, open regions), bilinear
  const nz = makeNoise((cl.seed * 7919) ^ 0x5f3759df), gc = 1000, gcols = Math.ceil(map.W / gc) + 2, grows = Math.ceil(map.H / gc) + 2, G = new Float32Array(gcols * grows);
  for (let j = 0; j < grows; j++) for (let i = 0; i < gcols; i++) G[j * gcols + i] = nz.fbm((x0 + i * gc) / 9000, (z0 + j * gc) / 9000, 3) * 1.6;
  const reg = (x, z) => {
    const fx = Math.min(gcols - 1.001, Math.max(0, (x - x0) / gc)), fz = Math.min(grows - 1.001, Math.max(0, (z - z0) / gc)), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, o = j * gcols + i;
    return (G[o] * (1 - u) + G[o + 1] * u) * (1 - v) + (G[o + gcols] * (1 - u) + G[o + gcols + 1] * u) * v;
  };
  // exclusions: a multiplier per channel, from the places the ground must stay open
  const ex = [];      // { x, z, r0, r1, k: [trees, scrub, rock, belts] }
  for (const o of map.objectives || []) { const r = (SITE_R[o.kind] || 200) + 70; ex.push({ x: o.x, z: o.z, r0: r, r1: r + (o.kind === 'airfield' ? 400 : 180), k: [0, 0, .05, 0] }); }
  const sc = map.spawns && map.spawns.coast;
  if (sc) ex.push({ x: sc.x, z: sc.z, r0: sc.r * .55, r1: sc.r * 1.1, k: [.45, .6, .5, .6] });
  if (plan) {
    for (const S of plan.settlements || []) ex.push({ x: S.x, z: S.z, r0: S.r * .92, r1: S.r * 1.25 + 60, k: [.05, .15, .05, 0] });
    for (const b of plan.builds || []) {
      if (/^bridge/.test(b.kind || '')) continue;                 // bridges: a corridor, below
      if (b.kind === 'powerline' || b.kind === 'penstock') continue;
      if (b.kind === 'settlement') continue;
      const r = Math.min(b.r || 200, 700);
      ex.push({ x: b.cx !== undefined ? b.cx : b.x, z: b.cz !== undefined ? b.cz : b.z, r0: r * .6, r1: r * .9 + 40, k: [.1, .3, .4, 0] });
    }
    for (const p of plan.plumes || []) if (p.kind === 'mud') ex.push({ x: p.x, z: p.z, r0: 350 * (p.scale || 1), r1: 700 * (p.scale || 1), k: [0, .2, .2, 0] });
  }
  const exA = new Uint8Array(N * 4).fill(255);        // exclusion multipliers x 255
  for (const e of ex) {
    const i0 = Math.max(0, Math.floor((e.x - e.r1 - x0) / cell)), i1 = Math.min(cols - 1, Math.ceil((e.x + e.r1 - x0) / cell));
    const j0 = Math.max(0, Math.floor((e.z - e.r1 - z0) / cell)), j1 = Math.min(rows - 1, Math.ceil((e.z + e.r1 - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(x0 + i * cell - e.x, z0 + j * cell - e.z);
      if (d >= e.r1) continue;
      const t = ss(e.r0, e.r1, d), o = (j * cols + i) * 4;
      for (let c = 0; c < 4; c++) { const m = 255 * (e.k[c] + (1 - e.k[c]) * t); if (m < exA[o + c]) exA[o + c] = m; }
    }
  }
  // corridors under the landmarks' bridges and power lines
  if (plan) for (const b of plan.builds || []) {
    if (/^bridge/.test(b.kind || '') && b.L) {
      const sx = Math.sin(b.hdg), sz = Math.cos(b.hdg);
      corridor(exA, cols, rows, cell, x0, z0, [[b.x, b.z], [b.x + sx * b.L, b.z + sz * b.L]], (b.width || 20) / 2 + 60);
    } else if (b.kind === 'powerline' && b.towers) corridor(exA, cols, rows, cell, x0, z0, b.towers, 30);
  }
  const A = new Uint8Array(N * 4), Bm = new Uint8Array(N * 4), o4 = [0, 0, 0, 0];
  const n = { h: 0, slope: 0, curv: 0, dc: 0, x: 0, z: 0, reg: 0 };
  const wb = cl.windbreak || 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i, h = H[k], o = k * 4;
    if (h <= .3) continue;
    n.h = h; n.x = x0 + i * cell; n.z = z0 + j * cell;
    n.slope = Math.hypot(NT[o], NT[o + 1]); n.curv = NT[o + 2]; n.dc = dcell[k] * cell; n.reg = reg(n.x, n.z);
    rule(n, o4);
    A[o] = sat(o4[0]) * exA[o]; A[o + 1] = sat(o4[1]) * exA[o + 1]; A[o + 2] = sat(o4[2]) * exA[o + 2]; A[o + 3] = 255 * sat(o4[3]);
    // field belts: flat farmland (the terrain draws its fields there), not in towns or on the sites
    if (wb > 0) Bm[o] = sat(wb * (1 - ss(.02, .05, n.slope)) * ss(3, 9, h) * (1 - ss(140, 260, h)) * (.55 + .45 * sat(n.reg + .6))) * exA[o + 3];
    // rocks on the shore: rocky coasts, not the beaches
    if (cl.rockShore > 0 && n.dc < 450) Bm[o + 1] = sat(cl.rockShore) * exA[o + 2];
  }
  // soft edges round the exclusions and the rules' steps (one cell)
  const presence = presenceGrid(A, Bm, cols, rows, cell, x0, z0, map);
  return { A, B: Bm, presence, ms: Math.round(performance.now() - t0) };
}

function corridor(exA, cols, rows, cell, x0, z0, pts, half) {
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s], b = pts[s + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - half - x0) / cell)), i1 = Math.min(cols - 1, Math.ceil((Math.max(a[0], b[0]) + half - x0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - half - z0) / cell)), j1 = Math.min(rows - 1, Math.ceil((Math.max(a[1], b[1]) + half - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + i * cell, z = z0 + j * cell;
      let u = ((x - a[0]) * dx + (z - a[1]) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
      const d = Math.hypot(a[0] + dx * u - x, a[1] + dz * u - z);
      if (d >= half + cell) continue;
      const m = 255 * ss(half, half + cell, d), o = (j * cols + i) * 4;
      if (m < exA[o]) exA[o] = m;
      if (m < exA[o + 1]) exA[o + 1] = Math.max(m, 76);
    }
  }
}

/* 1 km presence of anything the vegetation pass could draw (a summed-area table: a tile with none is never drawn) */
function presenceGrid(A, Bm, cols, rows, cell, x0, z0, map) {
  const pc = 1000, pcols = Math.ceil(map.W / pc) + 1, prows = Math.ceil(map.H / pc) + 1, raw = new Uint8Array(pcols * prows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const o = (j * cols + i) * 4;
    if (A[o] < 3 && A[o + 1] < 3 && A[o + 2] < 3 && Bm[o] < 3 && Bm[o + 1] < 3) continue;
    // a node's value reaches half a cell round it (the shader's bilinear) and the rocks' shore band
    for (const [di, dj] of [[0, 0], [.6, 0], [-.6, 0], [0, .6], [0, -.6]]) {
      const pi = Math.floor((i + di) * cell / pc), pj = Math.floor((j + dj) * cell / pc);
      if (pi >= 0 && pj >= 0 && pi < pcols && pj < prows) raw[pj * pcols + pi] = 1;
    }
  }
  const SA = new Int32Array((pcols + 1) * (prows + 1)), W1 = pcols + 1;
  for (let j = 0; j < prows; j++) for (let i = 0; i < pcols; i++) SA[(j + 1) * W1 + i + 1] = raw[j * pcols + i] + SA[j * W1 + i + 1] + SA[(j + 1) * W1 + i] - SA[j * W1 + i];
  return {
    cell: pc, cols: pcols, rows: prows, SA, x0, z0,
    any(ax, az, bx, bz) {
      const i0 = Math.max(0, Math.floor((ax - x0) / pc)), i1 = Math.min(pcols, Math.ceil((bx - x0) / pc)), j0 = Math.max(0, Math.floor((az - z0) / pc)), j1 = Math.min(prows, Math.ceil((bz - z0) / pc));
      if (i1 <= i0 || j1 <= j0) return false;
      return SA[j1 * W1 + i1] - SA[j0 * W1 + i1] - SA[j1 * W1 + i0] + SA[j0 * W1 + i0] > 0;
    },
  };
}
