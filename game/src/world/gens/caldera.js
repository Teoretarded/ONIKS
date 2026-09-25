/* Chyortova Past: a drowned caldera. A ring island of layered lava around a lagoon 300-500 m deep; the
   inner wall drops in cliffs, the outer flanks fall gently to the sea, scored by radial gullies; one
   breach in the north-east lets the sea in over a shallow sill; a young cone rises in the middle. */
import { carve } from '../grid.js';
import { ss, sat } from '../noise.js';
import { roughness, coastSpawn, fleetSpawn, bestSite, allLand } from './common.js';

const CX = -4000, CZ = -3000;              // caldera centre
const RIM = 15500;                          // rim crest radius
const GAP = 0.78;                           // breach bearing (radians from north, ~45 deg = NE)
const CONE = { x: CX + 1800, z: CZ - 1200 };
const PCONE = { x: CX + 14000, z: CZ - 15500 };

function polar(x, z) { const dx = x - CX, dz = z - CZ; return [Math.hypot(dx, dz), Math.atan2(dx, dz)]; }
const adiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export default {
  plan(ctx, P) {
    const d = P.data, n = P.cols * P.rows;
    // the smooth fields of the edifice (radius wobble, crest height, lagoon floor, flank reach)
    const dr = new Float32Array(n), crest = new Float32Array(n), floor = new Float32Array(n), reach = new Float32Array(n);
    ctx.aux = { dr, crest, floor, reach };
    for (let j = 0; j < P.rows; j++) for (let i = 0; i < P.cols; i++) {
      const x = P.x0 + i * P.cell, z = P.z0 + j * P.cell, k = j * P.cols + i;
      const f = fields(ctx, x, z); dr[k] = f[0]; crest[k] = f[1]; floor[k] = f[2]; reach[k] = f[3];
      d[k] = volcano(ctx, x, z, f[0], f[1], f[2], f[3]);
    }
    // gullies down the outer flanks follow the drainage
    const { fbm } = ctx.noise;
    ctx.aux.cut = carve(d, P.cols, P.rows, 4.5, 0.5, 90, h => ss(0, 80, h), (i, j) => 4 * fbm(i / 5, j / 5, 2));
  },

  fine(ctx, x, z, raw, cell) {
    const { fbm, ridged, n2 } = ctx.noise;
    // the ring is recomputed at full resolution (its cliffs are sharper than the plan grid)
    const a = ctx.aux, S = ctx.sampleP;
    let h = volcano(ctx, x, z, S(a.dr, x, z), S(a.crest, x, z), S(a.floor, x, z), S(a.reach, x, z)) - S(a.cut, x, z);
    const land = ss(-4, 12, h);
    h += land * (6 * fbm(x / 700, z / 700, 3) + 18 * ss(150, 500, h) * (ridged(x / 1800, z / 1800, 3) - 0.45));
    return h;
  },

  layout(ctx, A) {
    const at = (r, th) => [CX + Math.sin(th) * r, CZ + Math.cos(th) * r];
    const places = [];
    // the breach and its two heads
    const g = at(RIM, GAP);
    places.push({ name: 'Vorota', kind: 'strait', x: g[0], z: g[1], road: false });
    const head = side => bestSite(A, (x, z) => {
      if (!A.isLand(x, z) || A.coastDist(x, z) > 400) return -Infinity;
      const [r, th] = polar(x, z), da = adiff(th, GAP) * side;
      if (da < 0.05 || da > 0.5 || r < RIM - 4000 || r > RIM + 4000) return -Infinity;
      return -da * 6 + A.seaFrac(x, z, 1500);
    }, { box: [g[0] - 9000, g[1] - 9000, g[0] + 9000, g[1] + 9000], stride: 1, edge: 0 });
    const hL = head(-1), hR = head(1);
    places.push({ name: 'Mys Strazh', kind: 'cape', x: hL.x, z: hL.z, road: false }, { name: 'Mys Klyk', kind: 'cape', x: hR.x, z: hR.z, road: false });
    // the cone
    const cone = A.peakNear(CONE.x, CONE.z, 3000);
    places.push({ name: `Vulkan Molodoy ${Math.round(cone[2])}`, kind: 'peak', x: cone[0], z: cone[1], road: false });
    places.push({ name: 'Bukhta Kraternaya', kind: 'lagoon', x: CX - 6000, z: CZ + 5500, road: false });
    // the rim's high point
    let top = [0, 0, -1]; for (let k = 0; k < A.P.data.length; k++) { const [x, z] = A.xz(k); const [r, th] = polar(x, z); if (r > RIM - 3000 && Math.abs(adiff(th, GAP)) > 0.9 && A.P.data[k] > top[2]) top = [x, z, A.P.data[k]]; }
    places.push({ name: `Pik Kolco ${Math.round(top[2])}`, kind: 'peak', x: top[0], z: top[1], road: false });
    // port: inside the lagoon, the gentlest shore on the inner side
    const port = bestSite(A, (x, z) => {
      if (!A.isLand(x, z) || A.coastDist(x, z) > 300) return -Infinity;
      const [r, th] = polar(x, z); if (r > RIM || r < RIM - 6000) return -Infinity;
      return -roughness(A, x, z, 400) * 10 - A.h(x, z) / 60 - Math.abs(adiff(th, GAP + 0.9)) * 0.8;
    }, { stride: 1, box: [CX - RIM, CZ - RIM, CX + RIM, CZ + RIM], edge: 0 });
    // the coast spawn: the gentler south-west outer flank, rim crest behind it
    // spawns ~90 km apart (balance): the battery on the south-west flank, the fleet in the far north-east corner
    const coast = { x: -26000, z: -18000, r: 2500, hdg: A.seaward(-26000, -18000) };
    // depot on the outer flank, south-east
    const dep = bestSite(A, (x, z) => {
      if (!allLand(A, x, z, 900)) return -Infinity;
      const [r, th] = polar(x, z); if (r < RIM + 2500) return -Infinity;
      return -roughness(A, x, z, 500) * 20 - Math.abs(adiff(th, 2.3)) * 1.5 - A.h(x, z) / 200;
    }, { stride: 2, seed: 4 });
    const fleet = { x: 42000, z: 42000, r: 6000, hdg: Math.atan2(coast.x - 42000, coast.z - 42000) };
    places.push(
      { name: 'Kraterny', kind: 'town', x: port.x, z: port.z },
      { name: 'Goryachy Plyazh', kind: 'village', x: dep.x, z: dep.z },
    );
    const objectives = [
      { id: 'OBJ 01', name: 'Port · Kraterny', kind: 'port', x: port.x, z: port.z, r: 1000 },
      { id: 'OBJ 02', name: 'Lighthouse · Mys Strazh', kind: 'lighthouse', x: hL.x, z: hL.z, r: 600 },
      { id: 'OBJ 03', name: `Radar hill · ${Math.round(top[2])}`, kind: 'radar_hill', x: top[0], z: top[1], r: 900 },
      { id: 'OBJ 04', name: 'Depot · Goryachy Plyazh', kind: 'depot', x: dep.x, z: dep.z, r: 800 },
      { id: 'OBJ 05', name: `Radar hill · Molodoy`, kind: 'radar_hill', x: cone[0], z: cone[1], r: 700 },
    ];
    return {
      places, objectives,
      spawns: { coast, fleet },
      replenish: { x: 43000, z: 43000, r: 4500 },
      pads: [
        { x: coast.x, z: coast.z, r: 450, r1: 1100 },
        { x: top[0], z: top[1], r: 200, r1: 500 },
        { x: dep.x, z: dep.z, r: 300, r1: 700 },
        { x: port.x, z: port.z, r: 180, r1: 450, quay: true },
        { x: hL.x, z: hL.z, r: 90, r1: 220 },
        { x: cone[0], z: cone[1], r: 120, r1: 300 },
      ],
    };
  },
};

/* smooth fields: [radius wobble m, crest height m, lagoon floor m, flank reach m] */
function fields(ctx, x, z) {
  const { fbm } = ctx.noise;
  const [r0, th] = polar(x, z);
  const sx = Math.sin(th), cz = Math.cos(th);
  const dr = r0 * 0.11 * fbm(sx * 1.1 + 2, cz * 1.1, 3) + 1300 * fbm(x / 7000, z / 7000, 3);
  const crest = 430 + 300 * fbm(sx * 1.4 + 5, cz * 1.4 - 1, 3) - 120 * Math.max(0, Math.cos(th - GAP));   // lower towards the breach
  const floor = -400 - 80 * fbm(x / 5000, z / 5000, 3);
  // the flanks reach further in the south-west (an old lava plain) than elsewhere
  const reach = 9000 * (1 + 0.55 * Math.max(0, Math.cos(th + 2.3)) + 0.25 * fbm(sx * 2 + 9, cz * 2, 2));
  return [dr, crest, floor, reach];
}

/* the volcano: rim profile (steep inside, gentle outside), the breach, the lagoon floor and the cone */
function volcano(ctx, x, z, dr, crest, floorB, reach) {
  const { n2 } = ctx.noise;
  const [r0, th] = polar(x, z);
  const r = r0 + dr;
  let h;
  if (r < RIM) {
    // inner wall: cliffs from the crest down to the lagoon floor
    const t = (RIM - r) / 1300;                                   // 0 at the crest
    const floor = floorB + 220 * ss(RIM - 6000, RIM - 2600, r);
    h = crest + (floor - crest) * (1 - Math.exp(-t * t * 2.2));
    // benches of old lava flows on the inner wall
    h += 30 * ss(0.3, 0.6, t) * (1 - ss(0.8, 1.3, t)) * n2(th * 7, 1.7);
  } else {
    // outer flank: concave, gentle, into the sea
    const u = (r - RIM) / reach;
    h = crest * Math.exp(-u * 1.9) - 60 * u;
    // gullies down the flanks, fading out before the shore so the coastline stays whole
    const { fbm, ridged } = ctx.noise;
    h -= 38 * ridged(th * 16 + 1.6 * fbm(x / 8000, z / 8000, 2), u * 1.6, 3) * ss(0.04, 0.3, u) * (1 - ss(0.55, 0.9, u));
    if (h < 0) h = Math.max(h * 3 - 20 * u, -120 - 900 * ss(1.2, 4.2, u));
  }
  // the breach: a notch through the rim to a sill
  const da = Math.abs(adiff(th, GAP)), nw = 0.075 + 0.02 * n2(r / 2000, 4);
  if (da < nw * 2.2 && r > RIM - 5000 && r < RIM + 16000) {
    const cut = ss(nw * 2.2, nw * 0.7, da);
    const sill = -34 - 20 * ss(RIM, RIM - 3500, r) - 30 * ss(RIM + 2000, RIM + 6000, r);
    h = h + (Math.min(h, sill) - h) * cut;
  }
  // the young cone with its crater
  const dc = Math.hypot(x - CONE.x, z - CONE.z);
  if (dc < 8000) {
    const cone = -400 + 840 * Math.exp(-((dc / 3400) ** 1.5));
    const crater = 80 * Math.exp(-((dc / 450) ** 2));
    h = Math.max(h, cone - crater);
  }
  // a parasitic cone on the south-east flank
  const dp = Math.hypot(x - PCONE.x, z - PCONE.z);
  if (dp < 3500) h = Math.max(h, h + 160 * Math.exp(-((dp / 1200) ** 1.6)) - 35 * Math.exp(-((dp / 220) ** 2)));
  return h;
}
