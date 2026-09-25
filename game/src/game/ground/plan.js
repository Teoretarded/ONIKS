/* Ground detail · what is built on the ground, as static returns (ground/static.js) and the segments that keep the
   vegetation off it (ground/veg.js). Deterministic (seeded from the map); runs once at load.

   - roads (map.roads): paved (7 m, two dotted edges close up, one centre line far off) where they run through the
     places, tracks (4 m, fainter) elsewhere; draped on the drawn ground; low beam bridges with piers where a road
     crosses water (the landmarks' own bridges are left to their models)
   - streets of the settlements that have houses on them (world/landmarks.js settlement streets)
   - more houses: along the roads out of every settlement (ribbon development), dacha plots near the towns, farms
     (long barns) on the southern maps, homesteads along the northern valley roads; lit windows at night
   - garden and street trees in and round the settlements
   - 110 kV lines (lattice towers, six conductors and the earth wire in catenaries) along the paved roads
   - fences round the objective sites (outer perimeters; the depot's and the radar's own fences are in their models) */
import { Dots, KIND } from './static.js';
import { rng } from '../../world/noise.js';

const TAU = Math.PI * 2, PI = Math.PI;
const NORTH = new Set(['fjord', 'archipelago', 'caldera', 'arctic']);
const SOUTH_FARMS = new Set(['krasnaya_kosa', 'strait', 'delta', 'harbour']);
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const ctz = i => { if (!i) return 14; let n = 0; while (!(i & 1)) { i >>= 1; n++; } return n; };
const rk = (i, cap) => Math.min(ctz(i), cap);

export function planGround(o) {
  const t0 = performance.now();
  const { map, T, plan } = o;
  const north = NORTH.has(map.id), R = rng(hashStr(map.id) ^ 0x9e3779b9);
  const D = new Dots(), clear = [];
  const gy = (x, z) => Math.max(0, T.heightAt(x, z));
  const stats = { roads: 0, roadKm: 0, bridges: 0, streets: 0, houses: 0, dachas: 0, farms: 0, trees: 0, towers: 0, lineKm: 0, fences: 0, windows: 0, fail: { ground: 0, free: 0, clear: 0 }, ribbonTry: 0 };

  /* ---------- occupancy (9 m cells): buildings, roads, streets, sites ---------- */
  const OC = 9, occ = new Set();
  const ok = (gx, gz) => (gx + 20000) * 40000 + (gz + 20000);
  const cellsBox = (x, z, yaw, hx, hz, f) => {
    const c = Math.cos(yaw), s = Math.sin(yaw), ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
    for (let gx = Math.floor((x - ex) / OC); gx <= Math.floor((x + ex) / OC); gx++) for (let gz = Math.floor((z - ez) / OC); gz <= Math.floor((z + ez) / OC); gz++) if (f(ok(gx, gz)) === false) return false;
    return true;
  };
  const free = (x, z, yaw, hx, hz) => cellsBox(x, z, yaw, hx + 1.5, hz + 1.5, k => !occ.has(k));
  const take = (x, z, yaw, hx, hz) => cellsBox(x, z, yaw, hx + .5, hz + .5, k => { occ.add(k); });
  const takeDisc = (x, z, r) => { for (let gx = Math.floor((x - r) / OC); gx <= Math.floor((x + r) / OC); gx++) for (let gz = Math.floor((z - r) / OC); gz <= Math.floor((z + r) / OC); gz++) occ.add(ok(gx, gz)); };
  const settlements = (plan && plan.settlements) || [];
  for (const S of settlements) {
    for (const b of S.buildings) take(b.x, b.z, b.yaw, b.w / 2 + 1, b.d / 2 + 1);
    if (S.church) take(S.church.x, S.church.z, S.church.yaw, 9, 17);
    if (S.tower) takeDisc(S.tower.x, S.tower.z, 7);
    for (const st of S.streets || []) for (const p of st.pts) takeDisc(p[0], p[1], 5);
  }
  // no-go: the objective sites, the spawns, the landmarks' builds
  const SITE_R = { port: 330, depot: 140, radar_hill: 70, airfield: 1400, lighthouse: 45 };
  const avoid = [];
  for (const ob of map.objectives || []) avoid.push([ob.x, ob.z, (SITE_R[ob.kind] || 200) + 90]);
  for (const k of ['coast', 'fleet']) { const s = map.spawns && map.spawns[k]; if (s) avoid.push([s.x, s.z, s.r * (k === 'coast' ? .75 : 1)]); }
  if (plan) for (const b of plan.builds || []) {
    if (b.kind === 'settlement' || b.kind === 'powerline' || b.kind === 'penstock') continue;
    if (/^bridge/.test(b.kind || '') && b.L) { const sx = Math.sin(b.hdg), sz = Math.cos(b.hdg); for (let s = 0; s <= b.L; s += 40) avoid.push([b.x + sx * s, b.z + sz * s, (b.width || 20) / 2 + 40]); continue; }
    avoid.push([b.cx !== undefined ? b.cx : b.x, b.z !== undefined && b.cz !== undefined ? b.cz : b.z, Math.min(700, (b.r || 150) * .7)]);
  }
  const clearOf = (x, z, pad) => { for (const a of avoid) if (Math.hypot(x - a[0], z - a[1]) < a[2] + pad) return false; return true; };
  const bridges = plan ? (plan.builds || []).filter(b => /^bridge/.test(b.kind || '') && b.L) : [];
  const onBridge = (x, z, m) => {
    for (const b of bridges) {
      const sx = Math.sin(b.hdg), sz = Math.cos(b.hdg), dx = x - b.x, dz = z - b.z, s = dx * sx + dz * sz, l = dx * sz - dz * sx;
      if (s > -m && s < b.L + m && Math.abs(l) < (b.width || 20) / 2 + m) return true;
    }
    return false;
  };

  /* ---------- roads ---------- */
  const places = (map.places || []).filter(p => p.kind === 'town' || p.kind === 'village');
  const roadInfo = [];
  for (const road of map.roads || []) {
    if (!road || road.length < 2) continue;
    // paved where it runs through the places, tracks elsewhere
    let near = 0, town = false;
    for (const p of places) {
      let bd = 1e9;
      for (let i = 0; i < road.length - 1; i++) bd = Math.min(bd, segD(p.x, p.z, road[i], road[i + 1]));
      if (bd < 1500) { near++; if (p.kind === 'town') town = true; }
    }
    const paved = town || near >= 2;
    const pts = resample(road, 1.5);
    roadInfo.push({ pts, paved, len: pts.length * 1.5 });
    stats.roads++; stats.roadKm += pts.length * 1.5 / 1000;
  }
  for (const rd of roadInfo) {
    const P = rd.pts, n = P.length, half = rd.paved ? 3.5 : 2, kE = rd.paved ? KIND['road-edge'] : KIND['track-edge'], kC = rd.paved ? KIND['road-centre'] : KIND['track-centre'];
    // water runs (bridges)
    const wet = new Uint8Array(n);
    for (let i = 0; i < n; i++) wet[i] = T.mapH(P[i][0], P[i][1]) < .5 ? 1 : 0;
    let i = 0;
    while (i < n) {
      if (!wet[i]) {
        const [x, z, tx, tz] = P[i];
        if (!onBridge(x, z, 5)) {
          const nx = tz, nz = -tx;
          const s = 1.5 * Math.pow(2, rk(i, 11));
          D.push(x + nx * half, gy(x + nx * half, z + nz * half) + .12, z + nz * half, s, kE);
          D.push(x - nx * half, gy(x - nx * half, z - nz * half) + .12, z - nz * half, s, kE);
          if (!(i & 1)) D.push(x, gy(x, z) + .1, z, 3 * Math.pow(2, rk(i >> 1, 10)), kC);
        }
        if (i % 40 === 0) takeDisc(x, z, half + 4);
        i++; continue;
      }
      // a run over the water: a beam bridge unless a landmark bridge carries the road here
      let j = i; while (j < n && wet[j]) j++;
      const a = Math.max(0, i - 1), b = Math.min(n - 1, j);
      const mid = P[(i + j) >> 1];
      if (!onBridge(mid[0], mid[1], 30)) {
        const deck = Math.max(gy(P[a][0], P[a][1]), gy(P[b][0], P[b][1]), 0) + 3.2;
        for (let k = a; k <= b; k++) {
          const [x, z, tx, tz] = P[k], nx = tz, nz = -tx, s = 1.5 * Math.pow(2, rk(k, 11));
          // ramps where the bridge meets the bank
          const y = Math.max(deck - Math.max(0, (Math.min(k - a, b - k) < 6 ? (6 - Math.min(k - a, b - k)) * .3 : 0)), gy(x, z) + .1);
          for (const sd of [-1, 1]) {
            D.push(x + nx * sd * (half + .6), y, z + nz * sd * (half + .6), s, KIND.bridge, 0, 1, 0);
            D.push(x + nx * sd * (half + .8), y + 1.05, z + nz * sd * (half + .8), s * 1.4, KIND.bridge, nx * sd, 0, nz * sd);
          }
          if (!(k & 1)) D.push(x, y, z, 3 * Math.pow(2, rk(k >> 1, 10)), kC);
          // piers every 24 m
          if ((k - a) % 16 === 8 && k > a + 4 && k < b - 4) for (const sd of [-1, 1]) for (let yy = y - .4; yy > -3; yy -= .6) D.push(x + nx * sd * half * .6, yy, z + nz * sd * half * .6, 1.2 * (yy < y - 2 ? 1 : 4), KIND.bridge, nx * sd, 0, nz * sd);
        }
        stats.bridges++;
      }
      i = j;
    }
    // the vegetation keeps off the road (verges)
    for (let k = 0; k < n - 1; k += 40) { const b = Math.min(n - 1, k + 40); clear.push([P[k][0], P[k][1], P[b][0], P[b][1], half + 2.5]); }
  }

  /* ---------- the settlements' streets (those with houses on them) ---------- */
  for (const S of settlements) {
    if (!S.streets || !S.streets.length) continue;
    const bh = new Map(), BC = 50;
    for (const b of S.buildings) { const k = Math.floor(b.x / BC) * 100003 + Math.floor(b.z / BC); if (!bh.has(k)) bh.set(k, []); bh.get(k).push(b); }
    const housed = (x, z) => {
      const gx = Math.floor(x / BC), gz = Math.floor(z / BC);
      for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) { const L = bh.get((gx + a) * 100003 + gz + c); if (L) for (const b of L) if (Math.hypot(b.x - x, b.z - z) < 38) return true; }
      return false;
    };
    for (const st of S.streets) {
      // runs of the street with houses along them
      let run = [];
      const flush = () => {
        if (run.length >= 3) {
          const P = resample(run, 1.5);
          for (let k = 0; k < P.length; k++) {
            const [x, z, tx, tz] = P[k], nx = tz, nz = -tx, s = 1.5 * Math.pow(2, rk(k, 10));
            if (T.mapH(x, z) < .6) continue;
            for (const sd of [-1, 1]) D.push(x + nx * sd * 3, gy(x + nx * sd * 3, z + nz * sd * 3) + .1, z + nz * sd * 3, s, KIND['street-edge']);
            if (!(k & 1)) D.push(x, gy(x, z) + .1, z, 3 * Math.pow(2, rk(k >> 1, 9)), KIND.street);
          }
          for (let k = 0; k < P.length - 1; k += 30) { const b = Math.min(P.length - 1, k + 30); clear.push([P[k][0], P[k][1], P[b][0], P[b][1], 5]); }
          stats.streets++;
        }
        run = [];
      };
      for (const p of st.pts) { if (housed(p[0], p[1])) run.push(p); else flush(); }
      flush();
    }
  }

  /* ---------- houses ---------- */
  const houses = [];                 // { x, z, yaw, w, d, e, r, y, t, lit }
  const okGround = (x, z, yaw, hx, hz, tol) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    let lo = 1e9, hi = -1e9;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
      const px = x + c * u * (hx + 3) + s * v * (hz + 3), pz = z - s * u * (hx + 3) + c * v * (hz + 3), h = T.mapH(px, pz);
      if (h < 1.3) return null;
      if (h < lo) lo = h; if (h > hi) hi = h;
    }
    if (hi - lo > tol) return null;
    // the base: the lowest corner of the drawn ground
    let m = 1e9;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) m = Math.min(m, gy(x + c * u * hx + s * v * hz, z - s * u * hx + c * v * hz));
    return m;
  };
  const addHouse = (b, lit) => {
    const y = okGround(b.x, b.z, b.yaw, b.w / 2, b.d / 2, b.tol || (north ? 5.5 : 3.2));
    if (y === null) { stats.fail.ground++; return false; }
    if (!free(b.x, b.z, b.yaw, b.w / 2, b.d / 2)) { stats.fail.free++; return false; }
    if (!clearOf(b.x, b.z, Math.max(b.w, b.d))) { stats.fail.clear++; return false; }
    b.y = y; b.lit = lit;
    houses.push(b); take(b.x, b.z, b.yaw, b.w / 2, b.d / 2);
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), L = b.d >= b.w ? [0, b.d / 2] : [b.w / 2, 0];
    clear.push([b.x - c * L[0] - s * L[1], b.z + s * L[0] - c * L[1], b.x + c * L[0] + s * L[1], b.z - s * L[0] + c * L[1], Math.min(b.w, b.d) / 2 + 3.5]);
    return true;
  };
  const houseDims = (big) => {
    if (north) return { w: 6 + R() * 3, d: 7 + R() * 4, e: 2.8 + R() * .6, rr: 2.4 + R() * .8 };
    return big ? { w: 8 + R() * 3, d: 9 + R() * 4, e: 3 + R() * .5, rr: 2.6 + R() * .7 } : { w: 6 + R() * 3, d: 7 + R() * 4, e: 2.7 + R() * .6, rr: 2.3 + R() * .7 };
  };
  // (a) ribbon development along the roads out of each settlement
  for (const S of settlements) {
    if (S.kind === 'district' || S.buildings.length > 4000) continue;
    const town = S.kind === 'town', ext = (town ? 1500 : 800) * (north ? .75 : 1);
    for (const rd of roadInfo) {
      const P = rd.pts;
      // the nearest point of this road to the settlement
      let bi = -1, bd = 1e9;
      for (let k = 0; k < P.length; k += 8) { const d = Math.hypot(P[k][0] - S.x, P[k][1] - S.z); if (d < bd) { bd = d; bi = k; } }
      if (bi < 0 || bd > S.r + 250) continue;
      for (const dir of [-1, 1]) {
        let gap = 0;
        for (let k = bi + dir; k >= 0 && k < P.length; k += dir) {
          const [x, z, tx, tz] = P[k], dc = Math.hypot(x - S.x, z - S.z);
          if (dc < S.r * .85) continue;
          const t = (dc - S.r * .85) / ext;
          if (t > 1) break;
          gap -= 1.5;
          if (gap > 0) continue;
          gap = 20 + R() * 14;
          for (const sd of [-1, 1]) {
            if (R() > .88 * Math.pow(1 - t, 1.1)) continue;
            stats.ribbonTry++;
            const dm = houseDims(town && R() < .35), nx = tz * sd, nz = -tx * sd;
            // now and then a flat-roofed block by the road: a shop, a workshop, a garage row
            if (R() < (town ? .16 : .08) && t < .6) { dm.w = 9 + R() * 5; dm.d = 14 + R() * 12; dm.e = 3.4 + R() * 1.8; dm.rr = 0; }
            const sb = 10 + dm.d / 2 + R() * 4;
            const hx = x + nx * sb, hz = z + nz * sb, yaw = Math.atan2(tx, tz) + (R() < .5 ? 0 : PI / 2) + (north ? (R() - .5) * .4 : (R() - .5) * .05);
            if (addHouse({ x: hx, z: hz, yaw, w: dm.w, d: dm.d, e: dm.e, r: dm.e + dm.rr, t: 'h' }, R() < .8)) {
              stats.houses++;
              if (R() < .55) { const sb2 = sb + dm.d / 2 + 6 + R() * 8; addHouse({ x: x + nx * sb2 + tx * (R() - .5) * 8, z: z + nz * sb2 + tz * (R() - .5) * 8, yaw, w: 3.5 + R() * 2.5, d: 4 + R() * 3, e: 2.2, r: 3.3, t: 's' }, false); }
            }
          }
        }
      }
    }
  }
  // (b) dacha plots near the towns, (c) farms on the southern maps, homesteads on the northern ones
  const siteNear = (S, d0, d1, box) => {
    for (let tries = 0; tries < 60; tries++) {
      const a = R() * TAU, d = d0 + R() * (d1 - d0), x = S.x + Math.sin(a) * d, z = S.z + Math.cos(a) * d;
      if (!clearOf(x, z, box)) continue;
      if (T.mapH(x, z) < 2.5) continue;
      const rg = T.rangeOver(x - box, z - box, x + box, z + box);
      if (rg[0] < 1.5 || rg[1] - rg[0] > (north ? 14 : 7)) continue;
      if (!free(x, z, 0, box * .5, box * .5)) continue;
      return { x, z, yaw: Math.atan2(S.x - x, S.z - z) };
    }
    return null;
  };
  for (const S of settlements) {
    if (S.kind === 'district' || S.buildings.length > 4000) continue;
    const town = S.kind === 'town';
    const nD = map.id === 'arctic' ? 0 : town ? 1 + (R() < .6 ? 1 : 0) : (north ? 0 : R() < .5 ? 1 : 0);
    for (let q = 0; q < nD; q++) {
      const nu = 5 + Math.floor(R() * 5), nv = 4 + Math.floor(R() * 4), pw = 26, pd = 30, box = Math.max(nu * pw, nv * pd) * .55;
      const site = siteNear(S, S.r + 250, S.r + 1600, box);
      if (!site) continue;
      const c = Math.cos(site.yaw), s = Math.sin(site.yaw);
      const W = (u, v) => [site.x + c * u + s * v, site.z - s * u + c * v];
      // lanes between every second row of plots
      for (let j = 0; j <= nv; j += 2) {
        const v = (j - nv / 2) * pd, pts = [];
        for (let u = -nu / 2 * pw; u <= nu / 2 * pw + .1; u += 10) pts.push(W(u, v));
        const P = resample(pts, 1.5);
        for (let k = 0; k < P.length; k++) { const [x, z] = P[k]; if (T.mapH(x, z) > 1) D.push(x, gy(x, z) + .1, z, 1.5 * Math.pow(2, rk(k, 9)), KIND.lane); }
      }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        if (R() < .18) continue;
        const lane = (j % 2 === 0) ? -1 : 1;                                       // the house by its lane
        const u = (i + .5 - nu / 2) * pw + (R() - .5) * 8, v = (j + .5 - nv / 2) * pd + lane * (pd / 2 - 7 - R() * 3);
        const [x, z] = W(u, v), w = 4 + R() * 2, d = 5 + R() * 2.5;
        if (addHouse({ x, z, yaw: site.yaw + (R() < .5 ? 0 : PI / 2), w, d, e: 2.5 + R() * .4, r: 4.3 + R() * .8, t: 'h', tol: 4 }, R() < .22)) {
          stats.dachas++;
          // fruit trees in the plot
          for (let m = 0; m < 1 + Math.floor(R() * 3); m++) { const [tx, tz] = W(u + (R() - .5) * 18, v - lane * (6 + R() * 10)); gardenTree(tx, tz, 1.8 + R() * 1.2, 4 + R() * 3); }
        }
      }
      const e = [W(-nu / 2 * pw, 0), W(nu / 2 * pw, 0)];
      clear.push([e[0][0], e[0][1], e[1][0], e[1][1], nv * pd / 2 + 6]);
    }
    // farms (south): a row of long barns and a yard; homesteads (north): a house, sheds
    if (SOUTH_FARMS.has(map.id) && (town || R() < .75)) {
      const nB = 3 + Math.floor(R() * 4), L = 60 + R() * 30, gapB = 26, box = Math.max(L, nB * gapB) * .6 + 30;
      const site = siteNear(S, S.r + 900, S.r + 3800, box);
      if (site) {
        const c = Math.cos(site.yaw), s = Math.sin(site.yaw);
        let nb = 0;
        for (let q = 0; q < nB; q++) {
          const u = (q - (nB - 1) / 2) * gapB, x = site.x + c * u, z = site.z - s * u;
          if (addHouse({ x, z, yaw: site.yaw, w: 12, d: L, e: 3.2, r: 6.4, t: 'b', tol: 5 }, false)) nb++;
        }
        if (nb) {
          stats.farms++;
          const x = site.x + c * (-(nB / 2) * gapB - 18) + s * (L * .3), z = site.z - s * (-(nB / 2) * gapB - 18) + c * (L * .3);
          addHouse({ x, z, yaw: site.yaw, w: 8, d: 14, e: 3.2, r: 5.8, t: 'h' }, true);
          // lamps over the barn doors
          for (const b of houses.slice(-nb - 1)) if (b.t === 'b') { const cc = Math.cos(b.yaw), ss2 = Math.sin(b.yaw); D.push(b.x + ss2 * (b.d / 2 + .4), b.y + 3.6, b.z + cc * (b.d / 2 + .4), 64, KIND.lamp); stats.windows++; }
        }
      }
    }
  }
  if (north && map.id !== 'arctic') {
    // homesteads along the valley roads, away from the villages
    for (const rd of roadInfo) {
      const P = rd.pts;
      for (let k = 200; k < P.length - 200; k += 900 + Math.floor(R() * 1400)) {
        const [x, z, tx, tz] = P[k];
        if (settlements.some(S => Math.hypot(S.x - x, S.z - z) < S.r + 900)) continue;
        if (R() < .45) continue;
        const sd = R() < .5 ? -1 : 1, nx = tz * sd, nz = -tx * sd, n = 1 + Math.floor(R() * 3), yaw = Math.atan2(tx, tz);
        for (let q = 0; q < n; q++) {
          const sb = 16 + R() * 20, al = (R() - .5) * 60, dm = houseDims(false);
          if (addHouse({ x: x + nx * sb + tx * al, z: z + nz * sb + tz * al, yaw: yaw + (R() - .5) * .5, w: q ? 4 + R() * 3 : dm.w, d: q ? 5 + R() * 4 : dm.d, e: q ? 2.4 : dm.e, r: q ? 3.6 : dm.e + dm.rr, t: q ? 's' : 'h' }, !q && R() < .75)) stats.houses++;
        }
      }
    }
  }
  // the houses: models like the landmarks' settlements (data/landmark_models.js house(), sampled with levels of detail
  // by the renderer), in clusters of 1.2 km cells; their lit windows as static returns
  const clusters = new Map(), CC = 1200;
  for (const b of houses) {
    const k = Math.floor(b.x / CC) * 100003 + Math.floor(b.z / CC);
    let c = clusters.get(k); if (!c) clusters.set(k, c = []);
    c.push(b);
  }
  const specs = [];
  for (const L of clusters.values()) {
    let cx = 0, cz = 0; for (const b of L) { cx += b.x / L.length; cz += b.z / L.length; }
    let r = 0; for (const b of L) r = Math.max(r, Math.hypot(b.x - cx, b.z - cz) + Math.hypot(b.w, b.d) / 2 + 8);
    const S = { kind: 'settlement', name: `Houses · ${map.id} · ${specs.length}`, x: cx, z: cz, r, alpha: .62,
      buildings: L.map(b => ({ t: b.t === 's' || b.t === 'b' ? 's' : 'h', x: b.x, z: b.z, yaw: b.yaw, w: b.w, d: b.d, e: b.e, r: b.r })), base: L.map(b => b.y), lit: L };
    specs.push(S);
  }
  for (const b of houses) if (b.lit) houseWindows(D, b, stats, R);

  /* ---------- garden and street trees ---------- */
  function gardenTree(x, z, Rc, H) {
    const gx = Math.floor(x / OC), gz = Math.floor(z / OC);
    if (occ.has(ok(gx, gz)) || T.mapH(x, z) < 1.2) return false;
    occ.add(ok(gx, gz));
    const y = gy(x, z) - .2, ph = R() * TAU, hb = H * (.3 + R() * .15), Dh = (H - hb) / 2;
    const K = 72;
    for (let k = 0; k < K; k++) {
      const u = vdc(k), q = vdc3(k), ct = 1 - 2 * Math.pow(u, .78), st = Math.sqrt(Math.max(0, 1 - ct * ct)), a = k * 2.39996323 + ph;
      const lob = 1 + .18 * Math.sin(2 * a + ph * 5) * Math.sin(3 * ct + ph * 3), inner = 1 - .45 * q * q;
      const nx = Math.cos(a) * st, nz = Math.sin(a) * st;
      D.push(x + nx * Rc * lob * inner, y + hb + Dh + ct * Dh * inner, z + nz * Rc * lob * inner, Rc * Math.sqrt(PI / (k + 1)) * .9, KIND.crown, nx, ct, nz);
    }
    for (let k = 0; k < 4; k++) D.push(x, y + hb * (k + .5) / 4, z, .5, KIND.trunk);
    stats.trees++;
    return true;
  }
  const treesPer = north ? .5 : map.id === 'harbour' ? 1 : 1.8, CAP = 8000;
  const allHouses = [];
  for (const S of settlements) for (const b of S.buildings) if (b.t === 'h') allHouses.push(b);
  for (const b of houses) if (b.t === 'h' && b.w > 5.5) allHouses.push(b);
  for (const b of allHouses) {
    if (stats.trees >= CAP) break;
    let n = Math.floor(treesPer + R());
    for (let m = 0; m < n * 3 && n > 0; m++) {
      const a = R() * TAU, d = 9 + R() * 14;
      if (gardenTree(b.x + Math.sin(a) * d, b.z + Math.cos(a) * d, north ? 1.6 + R() * 1.2 : 2.4 + R() * 2, north ? 5 + R() * 5 : 6 + R() * 5)) n--;
    }
  }
  // lines of trees along the main streets of the southern towns
  if (!north) for (const S of settlements) {
    if (S.kind !== 'town') continue;
    for (const st of S.streets || []) {
      if (!st.main && st.cross) continue;
      for (let k = 0; k < st.pts.length - 1 && stats.trees < CAP; k++) {
        const a = st.pts[k], b = st.pts[k + 1], tx = b[0] - a[0], tz = b[1] - a[1], L = Math.hypot(tx, tz) || 1;
        for (const sd of [-1, 1]) if (R() < .5) gardenTree(a[0] + tz / L * sd * 7, a[1] - tx / L * sd * 7, 2.4 + R(), 8 + R() * 5);
      }
    }
  }

  /* ---------- 110 kV lines along the paved roads ---------- */
  const lines = roadInfo.filter(r => r.paved).sort((a, b) => b.len - a.len), towerList = [];
  let lineLeft = map.id === 'arctic' ? 30000 : 90000;
  for (const rd of lines) {
    if (lineLeft <= 0) break;
    const P = rd.pts, side = R() < .5 ? -1 : 1, towers = [];
    const push = () => { if (towers.length > 1) powerLine(towers); towers.length = 0; };
    for (let k = 0; k < P.length && lineLeft > 0; k += 200) {        // ~300 m spans
      const [x, z, tx, tz] = P[k];
      let placed = null;
      for (const off of [75, 110, 50]) {
        const px = x + tz * side * off, pz = z - tx * side * off;
        if (T.mapH(px, pz) < 2.5 || T.map.slope(px, pz) > .45 || !clearOf(px, pz, 30)) continue;
        if (settlements.some(S => Math.hypot(S.x - px, S.z - pz) < S.r + 40)) continue;
        if (!free(px, pz, 0, 4, 4)) continue;
        placed = [px, pz]; break;
      }
      if (!placed) { push(); continue; }
      if (towers.length && Math.hypot(placed[0] - towers[towers.length - 1][0], placed[1] - towers[towers.length - 1][1]) > 460) push();
      towers.push(placed);
      if (towers.length > 1) lineLeft -= Math.hypot(placed[0] - towers[towers.length - 2][0], placed[1] - towers[towers.length - 2][1]);
    }
    push();
  }
  function powerLine(tw) {
    const n = tw.length, fr = [];
    for (let i = 0; i < n; i++) {
      const a = tw[Math.max(0, i - 1)], b = tw[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
      const t = [dx / L, dz / L], rgt = [t[1], -t[0]], y = gy(tw[i][0], tw[i][1]) - .3;
      fr.push({ x: tw[i][0], z: tw[i][1], y, t, r: rgt });
      takeDisc(tw[i][0], tw[i][1], 6);
    }
    const W = (F, lx, ly, lz) => [F.x + F.r[0] * lx + F.t[0] * lz, F.y + ly, F.z + F.r[1] * lx + F.t[1] * lz];
    for (const F of fr) { pylonDots(D, F, W); stats.towers++; towerList.push([Math.round(F.x), Math.round(F.z)]); }
    const ARMS = [[-4.2, 15.6], [4.2, 15.6], [-5.4, 20.6], [5.4, 20.6], [-4.2, 25.6], [4.2, 25.6], [0, 33]];
    for (let i = 0; i < n - 1; i++) {
      const A = fr[i], B = fr[i + 1], span = Math.hypot(B.x - A.x, B.z - A.z), sag = 7 + span / 120;
      for (let w = 0; w < ARMS.length; w++) {
        const [lx, ly] = ARMS[w], a = W(A, lx, ly, 0), b = W(B, lx, ly, 0), m = Math.max(2, Math.round(span / 1.6)), sg = w === 6 ? sag * .8 : sag;
        for (let k = 0; k <= m; k++) {
          const t = k / m;
          D.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * sg * t * (1 - t), a[2] + (b[2] - a[2]) * t, 1.6 * Math.pow(2, rk(k, 8)), KIND.wire);
        }
      }
      clear.push([A.x, A.z, B.x, B.z, 16]);
      stats.lineKm += span / 1000;
    }
  }

  /* ---------- fences round the objective sites ---------- */
  const RH = new Map(), RC = 40;
  for (const rd of roadInfo) for (let k = 0; k < rd.pts.length; k += 2) { const p = rd.pts[k], key = Math.floor(p[0] / RC) * 100003 + Math.floor(p[1] / RC); let L = RH.get(key); if (!L) RH.set(key, L = []); L.push(p[0], p[1]); }
  const nearRoad = (x, z, r) => {
    const gx = Math.floor(x / RC), gz = Math.floor(z / RC);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const L = RH.get((gx + a) * 100003 + gz + b); if (L) for (let q = 0; q < L.length; q += 2) if (Math.hypot(L[q] - x, L[q + 1] - z) < r) return true; }
    return false;
  };
  for (const ob of map.objectives || []) {
    const hdg = siteHeading(map, ob), c = Math.cos(hdg), s = Math.sin(hdg);
    // local rectangles (x right, z along the site's heading) per kind: [x0, x1, z0, z1, open side]
    const F = { port: [-135, 135, -100, -4, 'zmax'], airfield: [-160, 430, -1420, 1420, null], depot: [-82, 82, -110, 110, null], radar_hill: [-46, 46, -56, 56, null], lighthouse: [-22, 22, -22, 22, 'zmax'] }[ob.kind];
    if (!F) continue;
    const [x0, x1, z0, z1, open] = F;
    const W = (u, v) => [ob.x + c * u + s * v, ob.z - s * u + c * v];
    const edges = [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]];
    if (open === 'zmax') edges.splice(2, 1);
    let idx = 0;
    for (const [pa, pb] of edges) {
      const L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), m = Math.round(L / .5);
      for (let k = 0; k <= m; k++, idx++) {
        const t = k / m, [x, z] = W(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t);
        if (T.mapH(x, z) < .5) continue;
        if (nearRoad(x, z, 6)) continue;                                              // the gates
        const y = gy(x, z);
        const sp = .5 * Math.pow(2, rk(idx, 9));
        for (const hh of [.8, 1.5, 2.2]) D.push(x, y + hh, z, sp, KIND['fence-wire']);
        if (idx % 6 === 0) for (let q = 0; q < 6; q++) D.push(x, y + .1 + q * .48, z, 3 * Math.pow(2, rk(idx / 6, 7)) * (q === 5 ? 2 : 1), KIND['fence-post']);
      }
      const a = W(pa[0], pa[1]), b = W(pb[0], pb[1]);
      clear.push([a[0], a[1], b[0], b[1], 4]);
      stats.fences++;
    }
  }

  stats.returns = D.n; stats.clear = clear.length; stats.ms = Math.round(performance.now() - t0);
  for (const S of specs) delete S.lit;
  return { dots: D, clear, stats, clusters: specs, towers: towerList, houses: houses.map(b => [Math.round(b.x), Math.round(b.z), b.t]) };
}

/* ---------------------------------------------------------------- helpers */
function segD(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
  let u = ((x - a[0]) * dx + (z - a[1]) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(a[0] + dx * u - x, a[1] + dz * u - z);
}
/* polyline [[x, z], ...] -> points every `st` m: [x, z, tx, tz] with a smoothed tangent */
function resample(pl, st) {
  const out = [];
  let carry = 0;
  for (let i = 0; i < pl.length - 1; i++) {
    const a = pl[i], b = pl[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    let s = carry;
    for (; s < L; s += st) out.push([a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L, 0, 0]);
    carry = s - L;
  }
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const p = out[Math.max(0, i - 3)], q = out[Math.min(n - 1, i + 3)], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1;
    out[i][2] = dx / L; out[i][3] = dz / L;
  }
  return out;
}
function vdc(k) { let r = 0, f = .5; while (k) { if (k & 1) r += f; k >>= 1; f *= .5; } return r; }
function vdc3(k) { let r = 0, f = 1 / 3; while (k) { r += f * (k % 3); k = Math.floor(k / 3); f /= 3; } return r; }
/* the objective structure's heading, as game/render.js sets it */
export function siteHeading(map, o) {
  const key = o.kind;
  let best = 0, bh = 1e9, flat = 0, fv = 1e9;
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * TAU, r = key === 'airfield' ? 1300 : 350;
    const h1 = map.h(o.x + Math.sin(a) * r, o.z + Math.cos(a) * r), h2 = map.h(o.x - Math.sin(a) * r, o.z - Math.cos(a) * r);
    if (h1 < bh) { bh = h1; best = a; }
    const v = Math.abs(h1 - h2) + Math.abs(h1 - map.h(o.x, o.z)) * .5;
    if (v < fv) { fv = v; flat = a; }
  }
  return key === 'port' || key === 'lighthouse' ? best : flat;
}

/* a house's lit windows at night (the house itself is a model, as the landmarks' settlements): on its walls, facing out */
function houseWindows(D, b, stats, R) {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), hx = b.w / 2, hz = b.d / 2;
  const n = b.t === 'h' ? 1 + Math.floor(R() * 3) : 2;
  for (let k = 0; k < n; k++) {
    const side = Math.floor(R() * 4), u = (R() - .5) * .6, yy = 1.6 + (b.e > 5 && R() < .5 ? 2.9 : 0);
    const P = side === 0 ? [u * b.w, -hz - .12, 0, -1] : side === 1 ? [u * b.w, hz + .12, 0, 1] : side === 2 ? [-hx - .12, u * b.d, -1, 0] : [hx + .12, u * b.d, 1, 0];
    // one return far off; close up (under ~2 km) the lit pane, four returns 0.4 m apart
    const nx = c * P[2] + s * P[3], nz = -s * P[2] + c * P[3], tx = -nz, tz = nx;
    const wx = b.x + c * P[0] + s * P[1], wz = b.z - s * P[0] + c * P[1];
    D.push(wx, b.y + yy, wz, 64, KIND.window, nx, 0, nz);
    for (const [a, v] of [[.4, 0], [0, .45], [.4, .45]]) D.push(wx + tx * a, b.y + yy + v, wz + tz * a, 1.4, KIND.window, nx, 0, nz);
    stats.windows++;
  }
}

/* a 110 kV double-circuit lattice tower (as data/landmark_models.js pylonPrims): legs, X bracing, three crossarms a
   side with their insulators, the earth-wire peak. Local frame: x across the line, z along it */
function pylonDots(D, F, W) {
  const K = KIND.pylon;
  let idx = 0;
  const seg = (a, b, st) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = Math.max(1, Math.round(L / (st || .5)));
    for (let k = 0; k <= m; k++, idx++) { const t = k / m, p = W(F, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); D.push(p[0], p[1], p[2], .5 * Math.pow(2, Math.min(rk(k, 5), 5) + (k === 0 || k === m ? 1 : 0)), K); }
  };
  const c0 = [[-3, 0, -3], [3, 0, -3], [3, 0, 3], [-3, 0, 3]], c1 = [[-1, 30, -1], [1, 30, -1], [1, 30, 1], [-1, 30, 1]];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let k = 0; k < 4; k++) seg(c0[k], c1[k]);
  const np = 7;
  for (let i = 0; i < np; i++) {
    const t0 = i / np, t1 = (i + 1) / np;
    for (let k = 0; k < 4; k++) {
      const a0 = lerp(c0[k], c1[k], t0), b0 = lerp(c0[(k + 1) % 4], c1[(k + 1) % 4], t0), a1 = lerp(c0[k], c1[k], t1), b1 = lerp(c0[(k + 1) % 4], c1[(k + 1) % 4], t1);
      seg(a0, b1, .7); seg(b0, a1, .7);
      if (i) seg(a0, b0, .7);
    }
  }
  for (const [y, w] of [[18, 4.2], [23, 5.4], [28, 4.2]]) {
    seg([-w, y, 0], [w, y, 0], .45);
    seg([-w, y, 0], [-1.3, y - 1.4, 0], .5); seg([w, y, 0], [1.3, y - 1.4, 0], .5);
    for (const sx of [-1, 1]) seg([sx * w, y, 0], [sx * w, y - 2.4, 0], .4);
  }
  seg([-1, 30, 0], [0, 33, 0], .45); seg([1, 30, 0], [0, 33, 0], .45);
}
