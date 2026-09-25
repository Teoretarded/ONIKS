/* Bukhta Svetlaya: a port city on a deep bay, three prongs of land between two wide gulfs (Zaliv Zapadny, Zaliv
   Vostochny) and the city's own bay (the Vladivostok kind). The bay runs 40 km north from a mouth 7 km wide between Mys
   Svetly and Mys Vostochny; an island (Ostrov Zelyony) lies off the east prong across a strait 1-2 km wide; halfway up
   the bay a narrow curving harbour (Gavan Zolotaya) cuts east into the city; a river comes in at the bay's head
   through a long shallow estuary; a steep ridge (Khrebet Grozny, 700-1000 m) closes the city in from the north; a
   plain opens west with the airfield. The city (landmarks) fills the hills round the bay's head, the harbour and the
   estuary: the container terminal on reclaimed land on the west shore, the old harbour, the oil pier, a breakwater,
   the bridges over the harbour and the strait, blocks of flats and towers, private houses up the slopes, lit windows
   and street lights at night; the battery hides among the blocks by the estuary. */
import { carve } from '../grid.js';
import { ss } from '../noise.js';
import { roughness, coastSpawn, fleetSpawn, bestSite, allLand } from './common.js';

const K = 1000;
// the bay: centre line from the mouth to the head (km) and its half width at the waterline (m) along it
const BAY = { pts: [[1.5, -27], [.5, -19], [-.5, -11], [-1.5, -3], [-2.5, 4], [-3.5, 10], [-4.5, 14]], w: [3400, 5000, 6000, 5800, 4800, 3000, 1300] };
// the harbour: a narrow curving inlet east out of the bay (Gavan Zolotaya), and the river's estuary at the head
const HARB = { pts: [[.8, 2.2], [3.6, 2.8], [6.4, 4.2], [9, 6], [11.6, 7.1]], w: [760, 660, 580, 480, 360] };
const EST = { pts: [[-4.5, 14], [-6.2, 16], [-8.5, 17.2], [-11, 18.6], [-13.5, 20.2], [-16.2, 21.4]], w: [430, 350, 290, 240, 200, 160] };
// the island off the east cape: [x, z, a, b, rot, top]
const ISL = [10500, -25500, 6200, 3300, .3, 240];
// the container terminal: reclaimed land on the bay's west shore, a rectangle [x0, z0, x1, z1] (m) turned by rot
// (on the 100 m grid, square to it: the drawn waterline follows the quay face)
const TERM = { cx: -6000, cz: -8200, hx: 800, hz: 800, rot: 0, h: 4.2 };

/* distance from (x, z) to a polyline with per-vertex widths: [d - w(at nearest point), s along 0..1] */
function lineDist(L, x, z) {
  let best = 1e18, bw = 0, bs = 0;
  const P = L.pts, n = P.length;
  for (let i = 0; i < n - 1; i++) {
    const ax = P[i][0] * K, az = P[i][1] * K, bx = P[i + 1][0] * K, bz = P[i + 1][1] * K, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    let u = ((x - ax) * dx + (z - az) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const d = Math.hypot(ax + dx * u - x, az + dz * u - z);
    if (d < best) { best = d; bw = L.w[i] + (L.w[i + 1] - L.w[i]) * u; bs = (i + u) / (n - 1); }
  }
  return [best - bw, bs, best];
}
/* the terminal's signed distance (m, < 0 inside) */
function termD(x, z) {
  const c = Math.cos(TERM.rot), s = Math.sin(TERM.rot), dx = x - TERM.cx, dz = z - TERM.cz;
  const u = Math.abs(dx * c - dz * s) - TERM.hx, v = Math.abs(dx * s + dz * c) - TERM.hz;
  return Math.max(u, v);
}

export default {
  plan(ctx, P) {
    const d = P.data, n = P.cols * P.rows, cl = new Float32Array(n);
    for (let j = 0; j < P.rows; j++) for (let i = 0; i < P.cols; i++) {
      const x = P.x0 + i * P.cell, z = P.z0 + j * P.cell, k = j * P.cols + i;
      const r = shape(ctx, x, z);
      d[k] = r[0]; cl[k] = r[1];
    }
    const { fbm } = ctx.noise;
    // valleys down the hills and the ridge's flanks
    carve(d, P.cols, P.rows, 4.2, .47, 110, h => ss(0, 60, h), (i, j) => 3 * fbm(i / 6, j / 6, 2));
    ctx.aux = { cl };
  },

  fine(ctx, x, z, raw, cell) {
    const { fbm, ridged } = ctx.noise;
    let h = raw;
    if (h > -15) {
      const land = ss(-2, 10, h), hi = ss(250, 600, h);
      h += land * ((1 - hi) * (5 * fbm(x / 700, z / 700, 3) + 1.4 * fbm(x / 160, z / 160, 2)) + hi * 30 * (ridged(x / 2400, z / 2400, 3) - .45));
      const c = ctx.sampleP(ctx.aux.cl, x, z);
      if (c > .05 && h > 0 && h < 120) h += c * 30 * ss(0, 10, h) * (1 - ss(60, 120, h));
    } else h += 3 * fbm(x / 3000, z / 3000, 2);
    // the reclaimed terminal: flat at 4.2 m, its quay face sharp
    const td = termD(x, z);
    if (td <= 0) h = TERM.h;
    else if (td <= 100) h = Math.min(h, -40);                        // the berths dredged hard against the quay face
    // the harbour and the bay dredged to 16-22 m along their fairways
    return h;
  },

  layout(ctx, A) {
    const places = [];
    const at = (L, s) => { const p = L.pts, f = s * (p.length - 1), i = Math.min(p.length - 2, Math.floor(f)), u = f - i; return [(p[i][0] + (p[i + 1][0] - p[i][0]) * u) * K, (p[i][1] + (p[i + 1][1] - p[i][1]) * u) * K]; };
    const b1 = at(BAY, .45), h1 = at(HARB, .55), e1 = at(EST, .5);
    places.push({ name: 'Bukhta Svetlaya', kind: 'bay', x: b1[0], z: b1[1], road: false });
    places.push({ name: 'Gavan Zolotaya', kind: 'bay', x: h1[0], z: h1[1], road: false });
    places.push({ name: 'Ustye Svetloy', kind: 'channel', x: e1[0], z: e1[1], road: false });
    places.push({ name: 'Zaliv Zapadny', kind: 'bay', x: -22000, z: -12000, road: false }, { name: 'Zaliv Vostochny', kind: 'bay', x: 25000, z: -13000, road: false });
    // capes at the bay mouth: the west head carries the lighthouse
    const cape = (x, z, R, name) => {
      const c = bestSite(A, (px, pz) => A.isLand(px, pz) && A.coastDist(px, pz) < 300 ? A.seaFrac(px, pz, 2000) * 3 - Math.hypot(px - x, pz - z) / R : -Infinity, { box: [x - R, z - R, x + R, z + R], stride: 1, edge: 800 });
      if (c) places.push({ name, kind: 'cape', x: c.x, z: c.z, road: false });
      return c;
    };
    const cw = cape(-5500, -22500, 5000, 'Mys Svetly') || { x: -5500, z: -22000 };
    cape(6500, -20500, 4500, 'Mys Vostochny');
    const isl = A.peakNear(ISL[0], ISL[1], 4000);
    places.push({ name: 'Ostrov Zelyony', kind: 'island', x: isl[0], z: isl[1], road: false });
    places.push({ name: 'Proliv Zelyony', kind: 'strait', x: ISL[0] - 1500, z: ISL[1] + ISL[3] + 700, road: false });
    // the ridge's summit: the radar hill
    let rh = [0, 0, -1];
    for (let k = 0; k < A.P.data.length; k++) { const [x, z] = A.xz(k); if (x < -22000 || x > 20000 || z < 16000 || z > 34000) continue; const h = A.P.data[k]; if (h > rh[2]) rh = [x, z, h]; }
    places.push({ name: `Khrebet Grozny ${Math.round(rh[2])}`, kind: 'ridge', x: rh[0], z: rh[1], road: false });
    // the container terminal (its quay face on the bay), the old harbour on Gavan Zolotaya's north shore
    const tp = bestSite(A, (x, z) => A.isLand(x, z) && A.coastDist(x, z) < 300 ? -Math.hypot(x - (TERM.cx + 200), z - TERM.cz) / 400 : -Infinity, { box: [TERM.cx - 1500, TERM.cz - 1500, TERM.cx + 1500, TERM.cz + 1500], stride: 1, edge: 0 }) || { x: TERM.cx, z: TERM.cz };
    const hp = at(HARB, .35);
    const oh = bestSite(A, (x, z) => A.isLand(x, z) && A.coastDist(x, z) < 300 ? -roughness(A, x, z, 350) * 10 - Math.hypot(x - hp[0], z - (hp[1] + 900)) / 700 : -Infinity, { box: [hp[0] - 2500, hp[1] - 500, hp[0] + 2500, hp[1] + 2500], stride: 1, edge: 0 }) || { x: hp[0], z: hp[1] + 800 };
    // the airfield on the west plain
    const af = bestSite(A, (x, z) => {
      const h = A.h(x, z); if (h < 8 || h > 120 || A.coastDist(x, z) < 3000) return -Infinity;
      if (!allLand(A, x, z, 2400)) return -Infinity;
      return -roughness(A, x, z, 1500) * 45 - Math.hypot(x + 29000, z - 8000) / 12000;
    }, { box: [-48000, -2000, -16000, 18000], stride: 2, jitter: .05, seed: 5 }) || { x: -29000, z: 8000 };
    // the battery: among the blocks of Zarechye on the estuary's north bank, the city's north-west edge under the ridge
    // (balance, 12-16 seeds each: on the bay's west shore in the city the fleet won 16 in 16, its destroyers' scans
    // reaching it from the sea off the mouth; 3 km short of the estuary's end the coast won 4 in 16; here, at its end,
    // ~105 km from the fleet, 7 in 12)
    const coast = coastSpawn(A, [-20000, 19000, -14000, 24000], {
      maxCoast: 5000, wantRise: 200, r: 2400,
      score: (x, z) => A.h(x, z) < 8 ? -Infinity : -Math.hypot(x + 17000, z - 21000) / 1500,
    }) || { x: -17000, z: 21000, r: 2400, hdg: A.seaward(-17000, 21000) };
    const dep = { x: coast.x, z: coast.z };
    // the fleet off the south-east, ~90 km out; its replenishment point 13 km west of its station
    const fleet = fleetSpawn(A, 54000, -56500, 4000, [coast.x, coast.z], { clear: 8000, depth: -150 });
    // the city's districts (the landmarks build the city from these): centre, blocks of flats on the hills, private
    // houses on the slopes, the port and industry. kind, centre (m), radii (m), street bearing (rad)
    const bayAxis = Math.atan2((BAY.pts[5][0] - BAY.pts[2][0]), (BAY.pts[5][1] - BAY.pts[2][1]));
    const districts = [
      { name: 'Tsentr', kind: 'centre', x: 3600, z: 6800, a: 2900, b: 2000, rot: .5 },
      { name: 'Kirovsky', kind: 'mikro', x: -3200, z: 17500, a: 2400, b: 1500, rot: .2 },
      { name: 'Lugovaya', kind: 'mikro', x: 11500, z: 13000, a: 2200, b: 1600, rot: .4 },
      { name: 'Svetlomorsk', kind: 'centre', x: -8200, z: 13600, a: 1800, b: 1200, rot: bayAxis },
      { name: 'Pervaya Rechka', kind: 'mikro', x: 7800, z: 10800, a: 3000, b: 2200, rot: .1 },
      { name: 'Vtoraya Rechka', kind: 'mikro', x: 2000, z: 15300, a: 2700, b: 1800, rot: -.4 },
      { name: 'Churkin', kind: 'mikro', x: 8300, z: 1200, a: 2800, b: 1900, rot: .9 },
      { name: 'Zapadny', kind: 'mikro', x: -11000, z: 1200, a: 2900, b: 2300, rot: bayAxis },
      { name: 'Sedanka', kind: 'private', x: -12200, z: 10000, a: 3100, b: 2300, rot: -.6 },
      { name: 'Egersheld', kind: 'private', x: 6000, z: -4500, a: 2100, b: 1500, rot: .3 },
      { name: 'Gornostay', kind: 'private', x: -10000, z: -15500, a: 2000, b: 1300, rot: .5 },
      { name: 'Portovy', kind: 'industrial', x: -9200, z: -8200, a: 1500, b: 1400, rot: TERM.rot },
      { name: 'Sudoverf', kind: 'industrial', x: 12400, z: 8900, a: 1300, b: 900, rot: .6 },
      { name: 'Zarechye', kind: 'mikro', x: coast.x + 300, z: coast.z - 700, a: 2400, b: 1500, rot: -.45 },
    ];

    places.push(
      { name: 'Svetlomorsk', kind: 'town', x: 1500, z: 8500, road: true },
      { name: 'Zarechye', kind: 'village', x: coast.x, z: coast.z },
      { name: 'Aeroport Svetlomorsk', kind: 'village', x: af.x + 2800, z: af.z + 1500 },
    );
    const objectives = [
      { id: 'OBJ 01', name: 'Port · Container terminal', kind: 'port', x: tp.x, z: tp.z, r: 1200 },
      { id: 'OBJ 02', name: 'Port · Gavan Zolotaya', kind: 'port', x: oh.x, z: oh.z, r: 1000 },
      { id: 'OBJ 03', name: `Radar hill · ${Math.round(rh[2])}`, kind: 'radar_hill', x: rh[0], z: rh[1], r: 900 },
      { id: 'OBJ 04', name: 'Depot · Zarechye', kind: 'depot', x: dep.x, z: dep.z, r: 800 },
      { id: 'OBJ 05', name: 'Airfield · Svetlomorsk', kind: 'airfield', x: af.x, z: af.z, r: 1400 },
      { id: 'OBJ 06', name: 'Lighthouse · Mys Svetly', kind: 'lighthouse', x: cw.x, z: cw.z, r: 600 },
    ];
    return {
      places, objectives,
      spawns: { coast, fleet },
      // the replenishment point far west along the south edge (balance: 13 km from the fleet's station the air wing and
      // the destroyers never ran dry; 100 km off, the destroyers sail past the bay's mouth to restock)
      replenish: { x: -45000, z: -56500, r: 4500 },
      pads: [
        { x: coast.x, z: coast.z, r: 420, r1: 1000 },
        { x: rh[0], z: rh[1], r: 220, r1: 550 },
        { x: af.x, z: af.z, r: 1300, r1: 2300 },
        { x: oh.x, z: oh.z, r: 180, r1: 450, quay: true },
        { x: cw.x, z: cw.z, r: 90, r1: 220 },
      ],
      extra: {
        districts, terminal: TERM, bay: BAY, harbour: HARB, estuary: EST, island: ISL,
      },
    };
  },
};

/* the landform: [height m, cliffiness]. The mainland north of the outer coast; the bay, the harbour and the estuary cut
   out of it; the island; hills round the city, the ridge behind, the west plain; the shelf falling off to the south */
function shape(ctx, x, z) {
  const { fbm, ridged, billow } = ctx.noise;
  const wx = x + 3000 * fbm(x / 15000 + 2.1, z / 15000, 3) + 900 * fbm(x / 4000, z / 4000 + 3, 3);
  const wz = z + 3000 * fbm(x / 15000 - 3, z / 15000 + 1.5, 3) + 900 * fbm(x / 4000 + 5, z / 4000, 3);
  // the outer coast: west of the bay it sweeps south-west, east of it it runs east with bays
  // three prongs of land between two wide bays (the Vladivostok kind): the west bay, the city's bay cut into the middle
  // peninsula (below), the east bay; the far west coast bulging south
  // (balance: the prongs are narrow, 5-9 km, so the battery's launchers find no room out on them and stay round the
  // city; with prongs 13-19 km wide they strung out 25 km toward the fleet and the fleet won 12 matches in 12)
  const zc = -21000 + 19000 * Math.exp(-(((wx + 22000) / 10000) ** 2)) + 16500 * Math.exp(-(((wx - 25000) / 11000) ** 2))
    - 5000 * ss(-46000, -60000, wx) + 3200 * fbm(wx / 11000 + 7, 2.2, 3) + 1400 * fbm(wx / 3500 + 1, 5.5, 2);
  let f = wz - zc;
  // the bay and the harbour: water within their half widths (ragged), shoaling to their shores
  const bd = lineDist(BAY, x, z), hd = lineDist(HARB, x, z), ed = lineDist(EST, x, z);
  const rag = 380 * fbm(x / 2600 + 11, z / 2600, 3);
  const fb = bd[0] + rag * ss(.1, .3, bd[1]), fh = hd[0] + rag * .4, fe = ed[0] + rag * .25;
  if (bd[1] > .02 || bd[2] < 6000) f = Math.min(f, fb);
  f = Math.min(f, fh, fe);
  // the terminal is land
  const td = termD(x, z);
  if (td <= 0) f = Math.max(f, 50 - td);
  // the island
  const [ix, iz, a, b, rot, top] = ISL;
  const dx = x - ix, dz = z - iz, c = Math.cos(rot), s = Math.sin(rot), u = (dx * c - dz * s) / a, v = (dx * s + dz * c) / b;
  const fi = (1 - Math.sqrt(u * u + v * v)) * b + .3 * b * fbm(x / 2000 + 3, z / 2000, 3);
  let h, cl = 0;
  const cliffy = ss(-.1, .4, fbm(x / 8000 - 4, z / 8000 + 6, 2));
  if (f > 0 || fi > 0) {
    if (f > 0) {
      // hills round the city (the Vladivostok kind: rounded, 80-250 m), the ridge behind, the west plain
      const ridgeZ = 28000 + .12 * x + 2500 * fbm(x / 20000, 4.4, 2);
      const rk = Math.exp(-(((z - ridgeZ) / 4800) ** 2));
      const ridge = (420 + 330 * ridged(x / 9000 + 1.1, z / 9000 - 2, 4)) * rk * ss(-35000, -15000, x) * (1 - ss(30000, 55000, x));
      // low rounded hills round the bay (the city's), higher and wilder away from it
      const nearBay = Math.max(1 - ss(5000, 16000, Math.max(0, bd[2] - 3000)), 1 - ss(1500, 9000, f));
      const hills = ((70 + 110 * billow(x / 6000 + 2, z / 6000 - 1, 4)) * nearBay + (130 + 220 * billow(x / 9000 + 2, z / 9000 - 1, 4)) * (1 - nearBay)) * ss(400, 2500, f);
      const plain = ss(-16000, -26000, x) * ss(-6000, 2000, z) * (1 - ss(16000, 24000, z));
      const land = hills * (1 - .75 * plain) + 25 * plain + ridge + 60 * ss(20000, 45000, z) * (1 + fbm(x / 9000, z / 9000, 3));
      h = 2 + land * ss(0, 2200, f) + (cliffy * 30 * ss(0, 500, f));
      cl = cliffy * (1 - ss(500, 2500, f)) * ss(-.5, .5, -bd[0] / 3000 + 1);
    } else h = -30;
    if (fi > 0) {
      const ih = 3 + top * ss(0, 1800, fi) * (.7 + .4 * fbm(x / 2200, z / 2200, 2));
      if (ih > h) { h = ih; cl = .6 * (1 - ss(200, 900, fi)); }
    }
  } else {
    // water: the bay and the harbour 16-30 m (dredged fairways), the outer shelf falling off south to 300-900 m
    const dd = -Math.max(f, fi);
    const inner = bd[2] < BAY.w[2] * 1.4 || hd[2] < 1500 ? 1 : 0;
    const shelf = -(8 + dd * .02) * (1 - ss(3000, 25000, dd)) - (90 + 500 * ss(20000, 60000, -z - 20000)) * ss(3000, 25000, dd);
    h = inner ? -Math.min(32, 6 + Math.min(dd, 2000) * .018 + 10 * ss(.1, .9, bd[1])) : shelf + 12 * fbm(x / 8000, z / 8000, 3) * ss(2000, 6000, dd);
    if (td <= 100 && td > 0) h = Math.min(h, -40);
    h = Math.min(h, -1.5 - dd * .004);
  }
  return [h, cl];
}
