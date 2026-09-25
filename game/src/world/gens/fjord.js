/* Dolgaya Guba: a fjord coast. Open sea and skerries to the west, a strandflat, then a high fjell cut by
   long glacial troughs: U-shaped, walls of 40-60 degrees, flat floors 150-400 m deep behind a shallow
   sill at each mouth, rivers carved down to the fjords. */
import { flow, blur, carve } from '../grid.js';
import { ss, sat } from '../noise.js';
import { wind, lineField } from '../lines.js';
import { shorePoint, roughness, coastSpawn, fleetSpawn, bestSite } from './common.js';

const K = 1000;
// centre lines (km); w: half width at the waterline [mouth, head] (m); deep: deepest floor (m).
// floor > 0 makes a dry glacial valley (w is then the floor half width)
const FJ = [
  { name: 'Dolgaya Guba', pts: [[-66, -5], [-44, -3], [-28, 2], [-12, -2], [4, 6], [20, 2], [34, 9], [46, 13]], w: [3100, 950], deep: -460 },
  { name: 'Guba Olenya', pts: [[-66, 33], [-44, 31], [-28, 37], [-12, 41], [2, 49], [12, 55]], w: [2500, 850], deep: -360 },
  { name: 'Guba Kamennaya', pts: [[-66, -37], [-44, -33], [-28, -37], [-10, -42], [6, -35], [21, -40], [31, -49]], w: [2700, 800], deep: -390 },
  { name: 'Guba Uzkaya', pts: [[-12, -2], [-5, 12], [2, 25], [7, 36]], w: [1500, 620], deep: -280, branch: true },
  { name: 'Guba Tikhaya', pts: [[20, 2], [27, -9], [31, -21]], w: [1300, 560], deep: -250, branch: true },
  { name: 'Guba Sukhaya', pts: [[-28, -37], [-22, -22], [-19, -12]], w: [1100, 500], deep: -200, branch: true },
  // dry glacial valleys running on from the fjord heads
  { pts: [[46, 13], [52, 18], [60, 21]], w: [700, 450], floor: [30, 260], valley: true },
  { pts: [[7, 36], [14, 45], [22, 50]], w: [600, 400], floor: [30, 300], valley: true },
  { pts: [[31, -21], [37, -30], [45, -33]], w: [600, 400], floor: [25, 280], valley: true },
  { pts: [[31, -49], [40, -54], [52, -52]], w: [650, 420], floor: [25, 240], valley: true },
  { pts: [[-19, -12], [-14, -18], [-6, -22]], w: [500, 350], floor: [20, 180], valley: true },
];

export default {
  plan(ctx, P) {
    const { noise } = ctx, { n2, fbm, ridged } = noise;
    const lines = FJ.map((f, fi) => {
      const pts = wind(f.pts.map(p => [p[0] * K, p[1] * K]), 500, f.valley ? 1500 : f.branch ? 2400 : 3800, f.branch ? 9000 : 13000, noise, fi + 1);
      return {
        f, pts,
        attr: s => {
          // the width breathes along the fjord: basins and narrows
          const w = (f.w[0] + (f.w[1] - f.w[0]) * s) * (1 + 0.28 * noise.fbm(s * 7 + fi * 3.1, 0.5, 2));
          if (f.valley) return [w, f.floor[0] + (f.floor[1] - f.floor[0]) * s, 1];
          // sill at the mouth, deep basin, shoaling head
          let b = f.deep * (0.25 + 0.75 * ss(0.02, 0.2, s)) * (1 - 0.6 * ss(0.7, 1, s));
          if (f.branch) b = f.deep * (0.55 + 0.45 * ss(0, 0.3, s)) * (1 - 0.6 * ss(0.6, 1, s));
          if (f.lead) b = f.deep * (0.8 + 0.2 * noise.fbm(s * 5, 2.2, 2));
          return [w, b, 0];
        },
      };
    });
    ctx.lines = lines;
    const LF = lineField(P, lines, 9000);
    // ragged shores: bays and headlands along every trough
    for (let j = 0; j < P.rows; j++) for (let i = 0; i < P.cols; i++) { const k = j * P.cols + i; LF.dist[k] = Math.max(0, LF.dist[k] + 700 * fbm((P.x0 + i * P.cell) / 5200 + 7, (P.z0 + j * P.cell) / 5200, 3) * ss(0, 1500, LF.dist[k])); }
    const n = P.cols * P.rows, M = new Float32Array(n);
    for (let j = 0; j < P.rows; j++) for (let i = 0; i < P.cols; i++) {
      const x = P.x0 + i * P.cell, z = P.z0 + j * P.cell, k = j * P.cols + i;
      M[k] = mountain(ctx, x, z);
    }
    // rivers: carve the mountain along the drainage of mountain + troughs
    const d = P.data;
    for (let k = 0; k < n; k++) d[k] = Math.min(M[k], trough(LF.dist[k], LF.a0[k], LF.a1[k], M[k], LF.a2[k]));
    const { acc } = flow(d, P.cols, P.rows);
    const cut = new Float32Array(n);
    for (let k = 0; k < n; k++) if (d[k] > 0) cut[k] = Math.min(230, 8 * Math.pow(acc[k], 0.45)) * ss(0, 120, d[k]);
    blur(cut, P.cols, P.rows, 1, 2);
    for (let k = 0; k < n; k++) { M[k] -= cut[k]; d[k] = Math.min(M[k], trough(LF.dist[k], LF.a0[k], LF.a1[k], M[k], LF.a2[k])); }
    ctx.aux = { M, dist: LF.dist, w: LF.a0, b: LF.a1, v: LF.a2 };
  },

  fine(ctx, x, z, raw, cell) {
    const { n2, fbm, ridged } = ctx.noise, a = ctx.aux;
    let M = ctx.cubicP(a.M, x, z);
    // rock: sharp small ridges and scree on the high ground, polished knobs on the strandflat
    const hi = ss(40, 500, M);
    M += hi * (55 * (ridged(x / 2600, z / 2600, 4) - 0.45) + 14 * fbm(x / 500, z / 500, 3));
    // glacially scoured knobs on the strandflat
    M += (1 - hi) * (4 * fbm(x / 700, z / 700, 3) + 14 * (0.45 - billowK(ctx, x, z)) * ss(2, 30, M));
    // skerries: knobs that break the surface off the strandflat
    if (M < 8 && M > -30) M += 9 * (Math.abs(n2(x / 900 + 4, z / 900)) * 2 - 0.55) * ss(-30, -6, M);
    const d0 = ctx.sampleP(a.dist, x, z), w = ctx.sampleP(a.w, x, z), b = ctx.sampleP(a.b, x, z);
    const d = Math.max(0, d0 + 260 * fbm(x / 1400 - 3, z / 1400 + 5, 3) * ss(0, 800, d0));
    const t = trough(d, w, b, M, ctx.sampleP(a.v, x, z));
    return t < M ? t : M;
  },

  layout(ctx, A) {
    const L = ctx.lines, at = (li, s) => { const p = L[li].pts; return p[Math.min(p.length - 1, Math.round(s * (p.length - 1)))]; };
    const places = [];
    // fjord names along their middles
    FJ.forEach((f, i) => { if (!f.name) return; const p = at(i, f.branch ? 0.55 : 0.42); places.push({ name: f.name, kind: 'fjord', x: p[0], z: p[1], road: false }); });
    // the main mouth's cape: the most exposed land within 9 km of it
    const m0 = at(0, 0.12);
    const cape = bestSite(A, (x, z) => A.isLand(x, z) && A.coastDist(x, z) < 300 ? A.seaFrac(x, z, 1600) * 3 - Math.hypot(x - m0[0], z - m0[1]) / 9000 : -Infinity,
      { box: [m0[0] - 9000, m0[1] - 9000, m0[0] + 9000, m0[1] + 9000], stride: 1, edge: 500 });
    places.push({ name: 'Mys Navolok', kind: 'cape', x: cape.x, z: cape.z, road: false });
    // port: a sheltered, gentle shore inside the main fjord (a river delta at a bend)
    const port = bestSite(A, (x, z) => {
      if (!A.isLand(x, z) || A.coastDist(x, z) > 300 || x < -30000 || x > 20000) return -Infinity;
      return -roughness(A, x, z, 500) * 12 - Math.abs(A.h(x, z) - 12) / 30 + A.shelter(x, z, 6000) * 3 + (Math.abs(z) < 15000 ? 1 : 0);
    }, { stride: 2, jitter: 0.1, seed: 3 });
    // second town at the head of the main fjord
    const head = at(0, 0.97);
    const town2 = shorePoint(A, head[0], head[1], 5000, (x, z) => -roughness(A, x, z, 400) * 10 - A.h(x, z) / 60, 350) || { x: head[0], z: head[1] };
    // airfield on the strandflat: the flattest low stretch near the open coast
    const af = bestSite(A, (x, z) => {
      const h = A.h(x, z); if (h < 6 || h > 120 || x > -15000 || Math.abs(z) > 50000) return -Infinity;
      if (A.coastDist(x, z) < 1200) return -Infinity;
      return -roughness(A, x, z, 1400) * 40 - h / 80;
    }, { stride: 2, jitter: 0.05, seed: 5 });
    // radar hill: the highest summit within 30 km of the open coast
    let rh = null;
    { let best = -1; for (let k = 0; k < A.P.data.length; k++) { const [x, z] = A.xz(k); if (x < -42000 || x > -8000 || Math.abs(z) > 52000) continue; const h = A.P.data[k]; if (h > best) { best = h; rh = [x, z, h]; } } }
    // depot: a valley floor inland of the port
    const dep = bestSite(A, (x, z) => {
      if (!A.isLand(x, z) || A.coastDist(x, z) < 1200) return -Infinity;
      const dp = Math.hypot(x - port.x, z - port.z); if (dp < 6000 || dp > 18000) return -Infinity;
      return -roughness(A, x, z, 500) * 20 - A.h(x, z) / 150;
    }, { stride: 2, seed: 9 });
    const coast = coastSpawn(A, [-34000, -30000, -10000, 30000], { maxCoast: 3500, wantRise: 450 });
    const fleet = fleetSpawn(A, -62000, 2000, 7000, [0, 0], { clear: 5000, depth: -40 });
    places.push(
      { name: 'Rybachy', kind: 'town', x: port.x, z: port.z },
      { name: 'Lodeinoye', kind: 'town', x: town2.x, z: town2.z },
      { name: 'Zaozyorny', kind: 'village', x: dep.x, z: dep.z },
      { name: 'Vaida', kind: 'village', x: af.x + 2500, z: af.z + 1500 },
      { name: `Tundra Kamennaya ${Math.round(rh[2])}`, kind: 'peak', x: rh[0], z: rh[1], road: false },
    );
    // the highest peak on the map
    let top = [0, 0, -1]; for (let k = 0; k < A.P.data.length; k++) if (A.P.data[k] > top[2]) { const [x, z] = A.xz(k); if (Math.abs(x) < 57000 && Math.abs(z) < 57000) top = [x, z, A.P.data[k]]; }
    places.push({ name: `Gora Vysokaya ${Math.round(top[2])}`, kind: 'peak', x: top[0], z: top[1], road: false });
    const objectives = [
      { id: 'OBJ 01', name: 'Port · Rybachy', kind: 'port', x: port.x, z: port.z, r: 1000 },
      { id: 'OBJ 02', name: `Radar hill · ${Math.round(rh[2])}`, kind: 'radar_hill', x: rh[0], z: rh[1], r: 900 },
      { id: 'OBJ 03', name: 'Depot · Zaozyorny', kind: 'depot', x: dep.x, z: dep.z, r: 800 },
      { id: 'OBJ 04', name: 'Airfield · Vaida', kind: 'airfield', x: af.x, z: af.z, r: 1400 },
      { id: 'OBJ 05', name: 'Lighthouse · Mys Navolok', kind: 'lighthouse', x: cape.x, z: cape.z, r: 600 },
      { id: 'OBJ 06', name: 'Port · Lodeinoye', kind: 'port', x: town2.x, z: town2.z, r: 900 },
    ];
    return {
      places, objectives,
      spawns: { coast, fleet },
      replenish: { x: -63000, z: -52000, r: 4500 },
      pads: [
        { x: coast.x, z: coast.z, r: 450, r1: 1100 },
        { x: rh[0], z: rh[1], r: 220, r1: 550 },
        { x: dep.x, z: dep.z, r: 300, r1: 700 },
        { x: af.x, z: af.z, r: 1300, r1: 2300 },
        { x: port.x, z: port.z, r: 180, r1: 450, quay: true },
        { x: town2.x, z: town2.z, r: 180, r1: 450, quay: true },
        { x: cape.x, z: cape.z, r: 100, r1: 250 },
      ],
    };
  },
};

function billowK(ctx, x, z) { return ctx.noise.billow(x / 900 + 2, z / 900, 3); }

/* the fjell: strandflat on the coast rising to a high plateau with ridged summits */
function mountain(ctx, x, z) {
  const { fbm, ridged, n2 } = ctx.noise;
  const xc = -44000 + 5000 * fbm(z / 22000 + 3.3, 1.7, 3) + 3000 * fbm(z / 6000, 5.1, 3);
  const c = x - xc;                                   // metres inland of the outer coast
  // the island belt: a drowned strandflat broken into islands by sounds running along the coast
  const isl = fbm(x / 3600 + 5.5, z / 8000 - 2.1, 4) + 0.45 * fbm(x / 1800, z / 2600 + 8, 3);
  const t = ss(-10000, 12000, c);
  const amp = 150 * Math.sqrt(Math.max(0, 1 - Math.abs(t * 2 - 1)));
  let hb = -40 + 80 * t + amp * isl - 70 * ss(10000, 26000, -c) - 40 * ss(18000, 32000, -c);
  // the inner lead: sounds running along the coast behind the outer islands
  const lead = Math.max(0, 1 - Math.abs(c - 4500 - 2500 * fbm(z / 9000, 1.3, 2)) / 1400);
  hb -= 70 * lead * lead * (1 - ss(40000, 55000, Math.abs(z)));
  if (hb > 0) hb = hb * 0.9 + 3 * ss(0, 3, hb) + 10 * ss(4000, 14000, c) * fbm(x / 4000, z / 4000, 3);
  const env = ss(6000, 24000, c);                     // how much of the fjell is here
  const high = 420 + 480 * ss(0, 60000, c + 8000 * fbm(x / 30000, z / 30000 + 2, 2));
  const massif = ridged(x / 36000 + 4.1, z / 36000 - 2.2, 3);
  const r = ridged(x / 13000 + 1.3, z / 13000 - 0.7, 5);
  const mtn = high * (0.3 + 0.5 * massif + 0.6 * r) + 60 * fbm(x / 5000, z / 5000, 4);
  return hb + (mtn - hb) * env;
}

/* U-shaped trough: flat floor, walls steepening to 50-60 degrees, shoulder at the fjell.
   v > 0.5: a dry glacial valley whose flat floor sits at b (above the sea) */
function trough(d, w, b, M, v) {
  if (d >= 9000 || w <= 0) return 1e9;
  if (v > 0.5) {
    const Wt = w * 3.2, s = d / Wt;
    if (s >= 1) return 1e9;
    const floor = Math.min(b, M), t = s < 0.3 ? 0 : (s - 0.3) / 0.7;
    return floor + (Math.max(M, floor) - floor) * t * t * (1.6 - 0.6 * t);
  }
  if (b > -2) b = -2;                               // (a blend towards a dry valley stays a fjord here)
  const top = Math.max(M, 40);
  const frac = -b / (top - b);                      // where the waterline sits on f(s) = s^3
  const Wt = w / Math.cbrt(frac);
  const s = d / Wt;
  if (s >= 1) return 1e9;
  const f = s * s * s;
  return b + (top - b) * f;
}
