/* Ust-Solyonaya: a river delta. The river leaves its valley between low terraces and fans out into
   distributaries across a plain one to five metres above the sea: levees, marsh and lagoons, lobes at
   every mouth, barrier bars a few kilometres off the front, and a shelf that stays shallow far out.
   A limestone ridge on the west shore is the only high ground. */
import { ss, sat } from '../noise.js';
import { wind, lineField } from '../lines.js';
import { roughness, coastSpawn, fleetSpawn, bestSite, allLand } from './common.js';

const AX = 0, AZ = -40000;                  // the delta apex
const MOUTHS = [-40, -4, 33].map(d => d * Math.PI / 180);

function frontR(ctx, th) {
  // the delta front: an arc that bulges ~17 km past the regional coast and meets it at the fan's
  // edges, with a lobe at every mouth and a ragged edge in between
  const base = 27000 / Math.max(0.35, Math.cos(th));
  let p = 16000 * Math.pow(Math.max(0, Math.cos(th / 1.05 * Math.PI / 2)), 0.45);
  p += 2500 * ctx.noise.fbm(th * 3.2 + 3, 1.1, 3) * ss(1.05, 0.7, Math.abs(th));
  for (const m of MOUTHS) p += 4200 * Math.exp(-((th - m) ** 2) / (2 * 0.08 ** 2));
  return base + p;
}
function coastZ(ctx, x) { return -13000 + 3000 * ctx.noise.fbm(x / 16000 + 2, 3.3, 3) + 5000 * ss(-30000, -60000, x); }

export default {
  plan(ctx, P) {
    const { noise } = ctx;
    const K = 1000, lines = [];
    const add = (pts, w0, w1, dep, amp, wl, id) => {
      // meanders: loops about 12 channel widths long, 2-3 widths across
      const L = { pts: wind(pts, 250, amp, wl, noise, id, [w0 * 2.6, w0 * 12]), attr: s => [w0 + (w1 - w0) * s, dep * (1 - 0.35 * s), s] };
      lines.push(L); return L;
    };
    const at = (L, s) => L.pts[Math.min(L.pts.length - 1, Math.round(s * (L.pts.length - 1)))];
    const end = th => [AX + Math.sin(th) * (frontR(ctx, th) + 4000), AZ + Math.cos(th) * (frontR(ctx, th) + 4000)];
    // the trunk from the south edge to the apex
    add([[6 * K, -58 * K], [3 * K, -50 * K], [AX, AZ]], 520, 480, -12, 1600, 9000, 1);
    // three distributaries, each with a branch, each branch with a creek
    MOUTHS.forEach((th, i) => {
      const D = add([[AX, AZ], end(th)], 420, 300, -9, 2200, 8500, 10 + i);
      const sgn = i === 0 ? -1 : i === 2 ? 1 : (ctx.rng() < 0.5 ? -1 : 1);
      const p = at(D, 0.42), tb = th + sgn * 0.42;
      const B = add([[p[0], p[1]], end(tb)], 230, 170, -5, 1500, 5500, 20 + i);
      const q = at(B, 0.5), tc = tb + sgn * 0.2;
      add([[q[0], q[1]], end(tc)], 120, 90, -2.6, 900, 3500, 30 + i);
      const q2 = at(D, 0.7), td = th - sgn * 0.25;
      add([[q2[0], q2[1]], end(td)], 140, 100, -3, 1000, 4000, 40 + i);
    });
    ctx.lines = lines;
    const LF = lineField(P, lines, 2600);
    ctx.aux = { dist: LF.dist, w: LF.a0, dep: LF.a1 };
    const d = P.data;
    for (let j = 0; j < P.rows; j++) for (let i = 0; i < P.cols; i++) {
      const x = P.x0 + i * P.cell, z = P.z0 + j * P.cell, k = j * P.cols + i;
      d[k] = channel(ground(ctx, x, z), LF.dist[k], LF.a0[k], LF.a1[k]);
    }
  },

  fine(ctx, x, z, raw, cell) {
    const { fbm, n2 } = ctx.noise, a = ctx.aux;
    let g = ground(ctx, x, z);
    // micro relief: 20-40 cm on the plain, dunes on the bars, meander scars
    if (g > -3 && g < 8) g += 0.25 * fbm(x / 350, z / 350, 3) + 0.5 * ss(0.5, 2.5, g) * Math.abs(n2(x / 180, z / 180));
    const d = ctx.sampleP(a.dist, x, z), w = ctx.sampleP(a.w, x, z), dep = ctx.sampleP(a.dep, x, z);
    return channel(g, d, w, dep);
  },

  layout(ctx, A) {
    const L = ctx.lines, at = (li, s) => { const p = L[li].pts; return p[Math.min(p.length - 1, Math.round(s * (p.length - 1)))]; };
    const places = [];
    // the main mouth (the middle distributary) and its port on the lobe
    const mouthLine = 1 + 4;                    // lines: trunk, then per mouth [D, B, creek, side] -> middle D is index 5
    const mEnd = at(5, 0.86);
    const port = bestSite(A, (x, z) => {
      if (!A.isLand(x, z) || A.coastDist(x, z) > 500) return -Infinity;
      const dm = Math.hypot(x - mEnd[0], z - mEnd[1]); if (dm > 9000) return -Infinity;
      return -dm / 3000 + A.shelter(x, z, 4000) * 2 + A.h(x, z) / 3;
    }, { box: [mEnd[0] - 9000, mEnd[1] - 9000, mEnd[0] + 9000, mEnd[1] + 9000], stride: 1, edge: 0 });
    // the apex town and depot
    const apex = bestSite(A, (x, z) => A.isLand(x, z) && A.h(x, z) > 1.5 ? -Math.hypot(x - AX + 2500, z - AZ) / 2000 - roughness(A, x, z, 300) * 30 : -Infinity,
      { box: [AX - 9000, AZ - 9000, AX + 9000, AZ + 9000], stride: 1, edge: 0 });
    // the west ridge: radar hill on its crest
    const rh = A.peakNear(-50000, -20000, 16000);
    // lighthouse on a barrier bar off the main mouth
    const lh = bestSite(A, (x, z) => {
      if (!A.isLand(x, z)) return -Infinity;
      const s = A.seaFrac(x, z, 1500); if (s < 0.5) return -Infinity;
      return s - Math.hypot(x - mEnd[0], z - mEnd[1] - 5000) / 8000;
    }, { box: [mEnd[0] - 16000, mEnd[1] - 4000, mEnd[0] + 16000, mEnd[1] + 16000], stride: 1, edge: 0 });
    // airfield on the east terrace
    const af = bestSite(A, (x, z) => {
      if (!allLand(A, x, z, 2200) || x < 18000 || x > 48000 || A.h(x, z) < 4) return -Infinity;
      return -roughness(A, x, z, 1500) * 80 - Math.abs(z + 30000) / 30000;
    }, { stride: 2, seed: 5 });
    // spawns ~94 km apart (balance): the battery on the plain by the main channel, the fleet off the north-east shelf
    const coast = { x: 4000, z: -25000, r: 2500, hdg: A.seaward(4000, -25000) };
    const fleet = { x: 60000, z: 50000, r: 6000, hdg: Math.atan2(coast.x - 60000, coast.z - 50000) };
    // the depot: the village on the plain at the battery (balance: the coast holds it from the start; with the depot
    // at the apex, 15 km behind, the fleet won 2 matches in 3)
    const dep = { x: coast.x, z: coast.z };
    places.push(
      { name: 'Ust-Solyonaya', kind: 'town', x: port.x, z: port.z },
      { name: 'Razvilka', kind: 'town', x: apex.x, z: apex.z },
      { name: 'Kamyshino', kind: 'village', ...(bestSite(A, (x, z) => allLand(A, x, z, 600) && A.h(x, z) > 1 ? -Math.hypot(x - at(2, 0.55)[0] - 3000, z - at(2, 0.55)[1]) / 3000 : -Infinity, { stride: 1, box: [-40000, -30000, 0, 5000], edge: 0 }) || { x: -20000, z: -10000 }) },
      { name: 'Zaplavnoye', kind: 'village', x: dep.x, z: dep.z },
      { name: 'Stepanovka', kind: 'village', x: af.x - 3000, z: af.z - 2500 },
      { name: 'Rukav Glavny', kind: 'channel', x: at(5, 0.5)[0], z: at(5, 0.5)[1], road: false },
      { name: 'Kosa Peschanaya', kind: 'bar', x: lh.x, z: lh.z, road: false },
      { name: 'Gryada Kamennaya', kind: 'ridge', x: rh[0], z: rh[1], road: false },
      { name: 'Liman Zapadny', kind: 'lagoon', x: -24000, z: 2000, road: false },
    );
    const objectives = [
      { id: 'OBJ 01', name: 'Port · Ust-Solyonaya', kind: 'port', x: port.x, z: port.z, r: 1000 },
      { id: 'OBJ 02', name: 'Depot · Zaplavnoye', kind: 'depot', x: dep.x, z: dep.z, r: 900 },
      { id: 'OBJ 03', name: `Radar hill · ${Math.round(rh[2])}`, kind: 'radar_hill', x: rh[0], z: rh[1], r: 900 },
      { id: 'OBJ 04', name: 'Lighthouse · Kosa Peschanaya', kind: 'lighthouse', x: lh.x, z: lh.z, r: 500 },
      { id: 'OBJ 05', name: 'Airfield · Stepanovka', kind: 'airfield', x: af.x, z: af.z, r: 1500 },
    ];
    return {
      places, objectives,
      spawns: { coast, fleet },
      // the replenishment point out on the shelf, 40 km short of the fleet's spawn (balance: at the spawn, with the
      // depot at the battery, the coast won 2 matches in 3)
      replenish: { x: 30000, z: 22000, r: 5000 },
      pads: [
        { x: coast.x, z: coast.z, r: 450, r1: 1100 },
        { x: rh[0], z: rh[1], r: 200, r1: 500 },
        { x: apex.x, z: apex.z, r: 250, r1: 500 },
        { x: af.x, z: af.z, r: 1400, r1: 2300 },
        { x: port.x, z: port.z, r: 180, r1: 450, quay: true },
        { x: lh.x, z: lh.z, r: 60, r1: 160, h: 2.5 },
      ],
      roadOpts: { ford: -13, bridge: 22 },
    };
  },
};

/* the ground without channels: terraces and the west ridge, the fan plain, the shelf and bars */
function ground(ctx, x, z) {
  const { fbm, n2, ridged } = ctx.noise;
  const dx = x - AX, dz = z - AZ, r = Math.hypot(dx, dz), th = Math.atan2(dx, dz);
  const Rf = frontR(ctx, th);
  const fan = ss(1.1, 0.98, Math.abs(th)) * (dz > -3000 ? 1 : 0);           // inside the fan sector
  const zc = coastZ(ctx, x);
  // mainland: terraces rising south, the limestone ridge in the west, low hills in the east
  const inl = zc - z;                                                      // m inland of the regional coast
  let main;
  if (inl > 0) {
    const ridge = ss(-22000, -42000, x) * (22 + 70 * ridged(x / 14000 + 3, z / 9000, 4)) * ss(0, 5000, inl);
    main = 1.5 + 22 * ss(0, 30000, inl) ** 1.3 + 6 * fbm(x / 6000, z / 6000, 3) * ss(0, 4000, inl) + ridge;
    // the river valley cuts the terraces south of the apex
    const vx = Math.abs(x - (AX + 3000 * Math.sin(z / 9000)));
    main = main - (main - 2.5 - 0.00012 * Math.max(0, -z - 40000)) * (1 - ss(5000, 9000, vx)) * ss(-35000, -45000, z);
  } else {
    main = -(0.6 + 0.0008 * -inl + 0.00006 * Math.max(0, -inl - 20000));
  }
  // the fan: a plain sloping from ~5 m at the apex to the front
  const u = r / Rf;
  let fanH;
  if (u < 1) {
    fanH = 0.4 + 4.6 * (1 - u) ** 1.6 + 0.35 * fbm(x / 2500, z / 2500, 3);
    // marsh lakes and lagoons near the front
    const lake = ss(0.22, 0.42, fbm(x / 5000 + 7, z / 5000 - 2, 4)) * ss(0.45, 0.8, u);
    fanH -= lake * 2.2;
  } else {
    const dist = (u - 1) * Rf;
    fanH = -(0.4 + 0.0008 * dist + 0.00005 * Math.max(0, dist - 15000));
    // barrier bars 3-6 km off the front, broken by inlets
    const bar = Math.exp(-(((dist - 3300 - 900 * n2(th * 5, 7.1)) / 380) ** 2)) * ss(-0.02, 0.22, n2(th * 17 + 2, 0.5)) * 5.2;
    fanH += bar;
  }
  const f = fan * (inl > -4000 || u < 1.6 ? 1 : 0);
  // the fan sits on the coast: its plain replaces the terraces inside the sector
  let h;
  if (f > 0) {
    const blend = f * (fanH > main || u < 1 ? 1 : ss(0, -6, main - fanH) );
    h = main + (fanH - main) * (u < 1 ? f : blend);
  } else h = main;
  return h;
}

/* cut a channel: flat bed, steep banks, natural levees */
function channel(g, d, w, dep) {
  if (!(w > 0) || d > w * 3) return g;
  if (d < w) {
    const t = d / w, bed = dep * (1 - t * t * t * 0.8);
    return Math.min(g, bed);
  }
  const lev = g > -0.5 ? 0.9 * Math.exp(-(((d - w * 1.4) / (w * 0.6)) ** 2)) : 0;
  const bank = dep * (1 - ss(w, w * 1.35, d)) * 0.2;
  return Math.min(g + lev, g + lev + bank);
}
