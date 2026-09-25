/* ONIKS · landmarks: where each map's set pieces and ambient life go, computed from the map itself (its heights,
   water, places, objectives, spawns and roads). Pure and deterministic: no DOM, no GL, no Math.random.

   import { planLandmarks } from './world/landmarks.js'
   const plan = planLandmarks(map)

   plan = {
     statics:  [{ key, x, z, hdg, y?, on: 'ground'|'sea'|'abs', r, name, float?, pitch?, roll?, dissolve?, st? }]
     builds:   [{ key, kind, x, z, r, name, ...params }]      parametric models (data/landmark_models.js buildLandmark)
     settlements: [{ name, kind, x, z, r, buildings: [{ t, x, z, yaw, w, d, e, r }], church, tower, lamps }]
     lights:   [{ x, z, y, on, ch, col, range, float? }]       navigation lights (characteristic, colour, nominal range m)
     beams:    [{ x, z, lampY, on, ch, n, rot, range, site? }] lighthouses: a rotating lens (site: the objective's)
     plumes:   [{ kind: 'steam'|'fumarole'|'mud', x, z, y?, scale, rate }]
     falls:    [{ path: [[x, z], ...], width, name }]         waterfalls (heights from the drawn ground)
     flares:   [{ x, z, hdg, tip?, small? }]                   gas flares (the platform's boom tip, or `tip` in the model)
     ships:    [{ key, mode: 'through'|'call'|'loop'|'shuttle', path: [[x, z], ...], speed, dwell, phase, name }]
     avoid:    spawn / objective zones the landmarks kept clear of
   }
   Heights: 'ground' sits on the drawn ground (the system resolves it), 'sea' on the swell, 'abs' at y. */
import { analyze, bestSite } from './analyze.js';
import { distance, Heap } from './grid.js';
import { rng, hash2, ss, sat, clamp, mix } from './noise.js';
import { labelLand } from './lines.js';

const TAU = Math.PI * 2, PI = Math.PI;
const KN = 0.5144;                                   // m/s per knot
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* structure footprints of the objective sites (render.js draws these models there), metres */
const SITE_R = { port: 330, depot: 140, radar_hill: 70, airfield: 1400, lighthouse: 45 };

export function planLandmarks(map) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const C = context(map);
  const plan = { id: map.id, statics: [], builds: [], settlements: [], lights: [], beams: [], plumes: [], falls: [], ships: [], flares: [], avoid: C.avoid, notes: [] };
  C.plan = plan;
  for (const pl of map.places || []) if (pl.kind === 'town' || pl.kind === 'village') {
    const s = settlement(C, pl, map.id === 'delta' ? { minH: .7 } : {});
    if (s && s.buildings.length) plan.settlements.push(s);
  }
  objectiveLights(C, plan);
  portBuoys(C, plan);
  const f = PER_MAP[map.id];
  if (f) { try { f(C, plan); } catch (e) { plan.notes.push('per-map: ' + (e && e.message)); if (typeof console !== 'undefined') console.warn('landmarks', map.id, e); } }
  try { traffic(C, plan); } catch (e) { plan.notes.push('traffic: ' + (e && e.message)); if (typeof console !== 'undefined') console.warn('landmarks traffic', e); }
  plan.ms = typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0;
  return plan;
}

/* ================================================================ context: a 200 m analysis grid of the map */
function context(map) {
  const cell = 200, cols = Math.floor(map.W / cell) + 1, rows = Math.floor(map.H / cell) + 1;
  const P = { cols, rows, cell, x0: -map.W / 2, z0: -map.H / 2, data: new Float32Array(cols * rows) };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) P.data[j * cols + i] = map.h(P.x0 + i * cell, P.z0 + j * cell);
  const A = analyze(P);
  const avoid = [];
  for (const k of ['coast', 'fleet']) { const s = map.spawns && map.spawns[k]; if (s) avoid.push({ x: s.x, z: s.z, r: s.r + (k === 'coast' ? 400 : 2500), what: 'spawn ' + k }); }
  if (map.replenish) avoid.push({ x: map.replenish.x, z: map.replenish.z, r: map.replenish.r + 1500, what: 'replenish', sea: true });
  for (const o of map.objectives || []) avoid.push({ x: o.x, z: o.z, r: (SITE_R[o.kind] || 200) + 60, what: o.id, site: o.kind });
  const C = {
    map, A, P, avoid, h: map.h, seed: hashStr(map.id),
    /* clear of spawns and the objective structures by `pad` metres (sea: also the fleet's areas) */
    clear(x, z, pad, sea) {
      for (const a of avoid) { if (a.sea && !sea) continue; const d = Math.hypot(x - a.x, z - a.z); if (d < a.r + (pad || 0)) return false; }
      return true;
    },
    inMap(x, z, m) { m = m || 0; return Math.abs(x) < map.W / 2 - m && Math.abs(z) < map.H / 2 - m; },
    /* flat dry land around (x, z) within radius r */
    dry(x, z, r, maxSlope) {
      if (map.h(x, z) < 1) return false;
      for (let a = 0; a < 8; a++) { const t = a / 8 * TAU; if (map.h(x + Math.sin(t) * r, z + Math.cos(t) * r) < .8) return false; }
      return map.slope(x, z) < (maxSlope || .2);
    },
    /* direction (rad, 0 north) of the lowest ground on a ring of radius r (the water side of a shore point) */
    downhill(x, z, r) {
      let best = 0, bh = 1e9;
      for (let k = 0; k < 32; k++) { const a = k / 32 * TAU, hh = map.h(x + Math.sin(a) * r, z + Math.cos(a) * r); if (hh < bh) { bh = hh; best = a; } }
      return best;
    },
  };
  return C;
}

/* ================================================================ settlements
   Southern towns and stanitsas (Krasnaya Kosa, the strait, the delta) are gridded: parallel streets a block
   apart along the main road, cross streets, houses on both sides with their gardens behind, blocks of flats
   round a town's centre, a church, a water tower, warehouses by a harbour. Northern villages (fjord, skerries,
   caldera) string out along the shore road with a street or two up the slope. Clear of the spawns and the
   objective structures; dry, fairly flat ground. */
const NORTH = new Set(['fjord', 'archipelago', 'caldera']);
function settlement(C, pl, opt) {
  const { map } = C, town = pl.kind === 'town', north = opt.linear !== undefined ? opt.linear : NORTH.has(map.id), r = rng(hashStr(pl.name) ^ C.seed);
  const R0 = opt.R0 || (town ? (north ? 760 : 1050) : (north ? 380 : 520));
  let cx = pl.x, cz = pl.z, shoreAxis = null;
  // a place that is an objective (a harbour, a depot): the town grows round it, its middle a little inland
  const site = (map.objectives || []).find(o => Math.hypot(o.x - cx, o.z - cz) < 600);
  if (site && !opt.axis) {
    const out = C.A.seaward(site.x, site.z), back = site.kind === 'port' ? R0 * .55 : R0 * .45;
    for (let k = 0; k < 6; k++) { const b = back * (1 - k * .15), x = site.x - Math.sin(out) * b, z = site.z - Math.cos(out) * b; if (map.h(x, z) > 1.5) { cx = x; cz = z; break; } }
    if (site.kind === 'port') shoreAxis = out + PI / 2;
  }
  // the axis: the road through the place, else along the shore, else anything
  let ax = null, bd = R0 * 1.2;
  for (const road of map.roads || []) for (let i = 0; i < road.length - 1; i++) {
    const a = road[i], b = road[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    let u = ((cx - a[0]) * dx + (cz - a[1]) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const d = Math.hypot(a[0] + dx * u - cx, a[1] + dz * u - cz);
    if (d < bd) { bd = d; ax = Math.atan2(dx, dz); }
  }
  if (shoreAxis !== null) ax = shoreAxis;
  if (opt.axis !== undefined) ax = opt.axis;
  if (ax === null) ax = C.A.coastDist(cx, cz) < 3000 ? C.A.seaward(cx, cz) + PI / 2 : r() * PI;
  const sa = Math.sin(ax), ca = Math.cos(ax);
  const W = (u, v) => [cx + u * sa + v * ca, cz + u * ca - v * sa];            // (along, across) -> world
  const A = R0, Bv = R0 * (opt.across || (north ? .5 : .78));
  // a ragged outline: lobes round the centre, and whole blocks left as gardens, fields or a park
  const ph = [r() * TAU, r() * TAU, r() * TAU, r() * TAU];
  const lobes = th => .8 + .17 * Math.sin(2 * th + ph[0]) + .13 * Math.sin(3 * th + ph[1]) + .08 * Math.sin(5 * th + ph[2]) + .05 * Math.sin(7 * th + ph[3]);
  const gap = (u, v) => hash2(Math.floor(u / 170 + 50), Math.floor(v / 105 + 50), hashStr(pl.name) & 4095) < (town ? .07 : .14);
  const inside = (u, v) => { const q = (u / A) ** 2 + (v / Bv) ** 2, th = Math.atan2(v / Bv, u / A); return q < lobes(th) ** 2 && !gap(u, v) ? q / lobes(th) ** 2 : -1; };
  // streets: [{ pts: [[x, z]...], main, cross, road }]
  const streets = [];
  const Sp = north ? 72 : 104 + r() * 12, Sc = north ? 150 : 170 + r() * 40;
  const wob = (s, k) => (north ? 14 : 5) * Math.sin(s / (north ? 160 : 400) + k * 1.7);
  for (let k = -Math.floor(Bv / Sp); k <= Math.floor(Bv / Sp); k++) {
    const v0 = k * Sp, span = A * Math.sqrt(Math.max(0, 1 - (v0 / Bv) ** 2)) * 1.1;
    if (span < 60) continue;
    const pts = [];
    for (let u = -span; u <= span; u += 20) pts.push(W(u, v0 + wob(u, k)));
    streets.push({ pts, main: k === 0, cross: false });
  }
  for (let j = -Math.floor(A / Sc); j <= Math.floor(A / Sc); j++) {
    const u0 = j * Sc + (r() - .5) * 20, span = Bv * Math.sqrt(Math.max(0, 1 - (u0 / A) ** 2)) * 1.05;
    if (span < 60) continue;
    const pts = [];
    for (let v = -span; v <= span; v += 20) pts.push(W(u0 + wob(v, j + 9) * .5, v));
    streets.push({ pts, main: false, cross: true });
  }
  // the real road through the place is a street too
  if (!opt.noRoads) for (const road of map.roads || []) {
    let cur = [];
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i], b = road[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 20));
      for (let q = 0; q < n; q++) {
        const p = [a[0] + (b[0] - a[0]) * q / n, a[1] + (b[1] - a[1]) * q / n];
        if (Math.hypot(p[0] - cx, p[1] - cz) < R0 * 1.6) cur.push(p);
        else if (cur.length) { if (cur.length > 3) streets.push({ pts: cur, main: true, road: true }); cur = []; }
      }
    }
    if (cur.length > 3) streets.push({ pts: cur, main: true, road: true });
  }
  // occupancy (9 m cells): streets and buildings
  const occ = new Set(), OC = 9;
  const cells = (x, z, yaw, hx, hz) => {
    const out = [], c = Math.cos(yaw), s = Math.sin(yaw), ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
    for (let gx = Math.floor((x - ex) / OC); gx <= Math.floor((x + ex) / OC); gx++) for (let gz = Math.floor((z - ez) / OC); gz <= Math.floor((z + ez) / OC); gz++) out.push(gx + ',' + gz);
    return out;
  };
  const free = (x, z, yaw, hx, hz) => { for (const k of cells(x, z, yaw, hx + 1.5, hz + 1.5)) if (occ.has(k)) return false; return true; };
  const take = (x, z, yaw, hx, hz) => { for (const k of cells(x, z, yaw, hx + .5, hz + .5)) occ.add(k); };
  for (const st of streets) for (const p of st.pts) occ.add(Math.floor(p[0] / OC) + ',' + Math.floor(p[1] / OC));
  const okGround = (x, z, yaw, hx, hz) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    let hmin = 1e9, hmax = -1e9;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
      const px = x + c * u * (hx + 4) + s * v * (hz + 4), pz = z - s * u * (hx + 4) + c * v * (hz + 4), hh = map.h(px, pz);
      if (hh < (opt.minH || 1.2)) return false;
      if (hh < hmin) hmin = hh; if (hh > hmax) hmax = hh;
    }
    return hmax - hmin < Math.max(north ? 6.5 : 3.2, (hx + hz) * (north ? .5 : .3)) && C.clear(x, z, Math.max(hx, hz) + 15);
  };
  const B = [];
  const local = (x, z) => { const dx = x - cx, dz = z - cz; return [dx * sa + dz * ca, dx * ca - dz * sa]; };
  const harbour = (map.objectives || []).find(o => o.kind === 'port' && Math.hypot(o.x - cx, o.z - cz) < R0 * 1.6);
  let tall = 0;
  const plots = (st, spacing, prob) => {
    const P = st.pts;
    for (let i = 1; i < P.length - 1; i++) {
      if (((i * 20) % spacing) >= 20) continue;
      const d = [P[i + 1][0] - P[i - 1][0], P[i + 1][1] - P[i - 1][1]], L = Math.hypot(d[0], d[1]) || 1, t = [d[0] / L, d[1] / L], n = [-t[1], t[0]];
      const yaw = Math.atan2(t[0], t[1]);
      for (const sg of [-1, 1]) {
        const [u, v] = local(P[i][0], P[i][1]);
        const q = inside(u, v);
        if (q < 0 && !st.road) continue;
        const qq = q < 0 ? Math.hypot(P[i][0] - cx, P[i][1] - cz) / R0 : q;
        if (r() > prob * (q < 0 ? .55 * (1.6 - qq) / .6 : 1 - .5 * qq)) continue;
        const dc = Math.sqrt(qq);
        if (town && dc < .14 && !st.road) continue;                                   // the square
        // blocks of flats round a town's centre
        if (town && !st.cross && dc < .42 && r() < (north ? .35 : .5)) {
          const len = r() < .5 ? 60 : 48, hz = len / 2, hx = 6.2, sb = 14 + hx;
          const x = P[i][0] + n[0] * sg * sb, z = P[i][1] + n[1] * sg * sb;
          if (free(x, z, yaw, hx, hz) && okGround(x, z, yaw, hx, hz)) {
            const fl = tall < (north ? 1 : 4) && dc < .28 && r() < .35 ? 9 : 5;
            if (fl === 9) tall++;
            B.push({ t: 'f', x, z, yaw, w: hx * 2, d: len, e: fl * 2.8 + .6, r: fl * 2.8 + .6, floors: fl }); take(x, z, yaw, hx, hz);
            continue;
          }
        }
        const big = town && r() < .4;
        const w = big ? 8 + r() * 3.5 : 6 + r() * 3, dd = big ? 9 + r() * 4 : 7 + r() * 4;
        const sb = 7 + r() * 5 + dd / 2, jig = north ? (r() - .5) * 10 : (r() - .5) * 2;
        const x = P[i][0] + n[0] * sg * sb + t[0] * jig, z = P[i][1] + n[1] * sg * sb + t[1] * jig;
        const hy = yaw + (north ? (r() - .5) * .5 : (r() - .5) * .06) + (r() < .5 ? PI / 2 : 0);
        if (!free(x, z, hy, w / 2, dd / 2) || !okGround(x, z, hy, w / 2, dd / 2)) continue;
        const two = town && r() < .3;
        const e = two ? 5.8 + r() * .6 : 2.7 + r() * .7, rr = e + (Math.max(w, dd) > 9 ? 3 : 2.4) + r() * .8;
        B.push({ t: 'h', x, z, yaw: hy, w, d: dd, e, r: rr });
        take(x, z, hy, w / 2, dd / 2);
        // a shed or a summer kitchen in the garden behind
        if (r() < (town ? .45 : .75)) {
          const sb2 = sb + dd / 2 + 7 + r() * 10, sx = P[i][0] + n[0] * sg * sb2 + t[0] * (r() - .5) * 10, sz = P[i][1] + n[1] * sg * sb2 + t[1] * (r() - .5) * 10;
          const w2 = 3.5 + r() * 2.5, d2 = 4 + r() * 3;
          if (free(sx, sz, yaw, w2 / 2, d2 / 2) && okGround(sx, sz, yaw, w2 / 2, d2 / 2)) { B.push({ t: 's', x: sx, z: sz, yaw, w: w2, d: d2, e: 2.2, r: 3.4 }); take(sx, sz, yaw, w2 / 2, d2 / 2); }
        }
      }
    }
  };
  const sp = town ? 21 : 24;
  for (const st of streets) if (st.road) plots(st, sp, .95);
  for (const st of streets) if (!st.road && !st.cross) plots(st, sp, north ? .8 : .92);
  for (const st of streets) if (st.cross) plots(st, 32, .45);
  // warehouses behind a harbour
  if (harbour) {
    const out = C.A.seaward(harbour.x, harbour.z);
    let nw = 0;
    for (let k = 0; k < 40 && nw < (town ? 7 : 3); k++) {
      const a = out + PI + (r() - .5) * 1.8, d = 420 + r() * 420, x = harbour.x + Math.sin(a) * d, z = harbour.z + Math.cos(a) * d, yaw = out + (r() < .5 ? 0 : PI / 2);
      const w = 18 + r() * 8, dd = 36 + r() * 30;
      if (free(x, z, yaw, w / 2, dd / 2) && okGround(x, z, yaw, w / 2, dd / 2)) { B.push({ t: 'w', x, z, yaw, w, d: dd, e: 6.5 + r() * 2, r: 9 + r() * 2 }); take(x, z, yaw, w / 2, dd / 2); nw++; }
    }
  }
  if (B.length < 4) return null;
  // the church by the square; the water tower at a town's edge
  let church = null, tower = null;
  for (let k = 0; k < 500 && !church && !opt.noChurch; k++) {
    const a = r() * TAU, d = (town ? 70 : 30) + k * 2.5, x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d, yaw = ax + (r() < .5 ? 0 : PI / 2);
    if (free(x, z, yaw, 8, 16) && okGround(x, z, yaw, 8, 16)) { church = { x, z, yaw }; take(x, z, yaw, 8, 16); }
  }
  if ((town || r() < .5) && !opt.noChurch) for (let k = 0; k < 500 && !tower; k++) {
    const a = r() * TAU, d = R0 * (town ? .55 : .4) + k * 2, x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
    if (free(x, z, 0, 5, 5) && okGround(x, z, 0, 4, 4)) { tower = { x, z }; take(x, z, 0, 5, 5); }
  }
  // street lights along the road and the central streets
  const lamps = [];
  for (const st of streets) {
    if (!(st.road || st.main || (town && !st.cross))) continue;
    const P = st.pts;
    for (let i = 1; i < P.length - 1; i += 2) {
      const [u, v] = local(P[i][0], P[i][1]), q = inside(u, v);
      if (q < 0 || q > (st.road || st.main ? .8 : .3)) continue;
      if (map.h(P[i][0], P[i][1]) < 1) continue;
      const d = [P[i + 1][0] - P[i - 1][0], P[i + 1][1] - P[i - 1][1]], L = Math.hypot(d[0], d[1]) || 1, sg = (i >> 1) & 1 ? 1 : -1;
      lamps.push([P[i][0] - d[1] / L * 6 * sg, P[i][1] + d[0] / L * 6 * sg]);
    }
  }
  let rad = 0; for (const b of B) rad = Math.max(rad, Math.hypot(b.x - cx, b.z - cz) + 40);
  return { name: pl.name, kind: pl.kind, x: cx, z: cz, r: rad, buildings: B, church, tower, lamps, axis: ax };
}

/* ================================================================ lights at the objective sites
   Lighthouses (a 4-panel lens: the flash period is a quarter turn) and the harbour breakwater heads. */
const LH_CH = { krasnaya_kosa: 10, fjord: 7.5, strait: 5, archipelago: 15, delta: 6, caldera: 4 };
function objectiveLights(C, plan) {
  const { map } = C;
  for (const o of map.objectives || []) {
    if (o.kind === 'lighthouse') {
      const per = LH_CH[map.id] || 10;
      plan.beams.push({ site: o.id, x: o.x, z: o.z, lampY: 24.9, on: 'ground', n: 4, rot: per * 4, ch: `Fl W ${per}s`, range: 18 * 1852, name: o.name + ' · Fl W ' + per + 's · 18 M' });
    } else if (o.kind === 'port') {
      // the render system turns the harbour to the lowest ground 350 m out (the water); the breakwater head is
      // at [74, 12.9, 206] in the harbour's frame (data/models.js PORT)
      const hdg = C.downhill(o.x, o.z, 350), s = Math.sin(hdg), c = Math.cos(hdg);
      const lx = 74, lz = 206;
      plan.lights.push({ x: o.x + c * lx + s * lz, z: o.z - s * lx + c * lz, y: 12.9 + .4, on: 'abs', ch: 'Fl G 3s', col: 'g', range: 5 * 1852, name: 'Breakwater head · Fl G 3s' });
    }
  }
}

/* ================================================================ buoyage
   Each harbour: a buoyed approach (lateral pairs, IALA A: red cans to port going in) and a safe-water buoy. */
function portBuoys(C, plan) {
  const { map } = C;
  for (const o of map.objectives || []) {
    if (o.kind !== 'port') continue;
    const out = C.A.seaward(o.x, o.z);
    const fin = out + PI, fx = Math.sin(fin), fz = Math.cos(fin), rx = Math.cos(fin), rz = -Math.sin(fin);
    const pair = (d, k) => {
      const cx = o.x + Math.sin(out) * d, cz = o.z + Math.cos(out) * d;
      for (const sg of [-1, 1]) {
        const x = cx + rx * sg * 160, z = cz + rz * sg * 160;
        if (map.h(x, z) > -4) continue;
        const port = sg < 0;
        buoyAt(plan, port ? 'can' : 'cone', x, z, port ? (k & 1 ? 'Fl(2) R 6s' : 'Fl R 4s') : (k & 1 ? 'Fl(2) G 6s' : 'Fl G 4s'), port ? 'r' : 'g', 'Approach ' + o.name.replace(/^Port · /, '') + ' · ' + (port ? 'port-hand' : 'starboard-hand'));
      }
    };
    let k = 0;
    for (const d of [900, 1700, 2500]) pair(d, k++);
    const sx = o.x + Math.sin(out) * 3600, sz = o.z + Math.cos(out) * 3600;
    if (map.h(sx, sz) < -6) buoyAt(plan, 'safe', sx, sz, 'LFl W 10s', 'w', 'Fairway ' + o.name.replace(/^Port · /, '') + ' · safe water');
    void fx; void fz;
  }
}
function buoyAt(plan, kind, x, z, ch, col, name) {
  plan.statics.push({ key: 'lm_buoy_' + kind, x, z, hdg: hash2(x | 0, z | 0, 3) * TAU, on: 'sea', float: true, r: 4, name, small: true });
  const top = kind === 'can' || kind === 'cone' ? 2.95 : 3.75;
  plan.lights.push({ x, z, y: top, on: 'sea', ch, col, range: 3 * 1852, float: true, name });
}

/* ================================================================ sea routing
   A 500 m grid of the water: depth (the shallowest of 9 samples) and the distance to land. A* keeps a ship's
   clearance from the shore and prefers open water; the path is string-pulled and rounded. */
function seaGrid(C) {
  if (C.sea) return C.sea;
  const { map } = C, cell = 500, pad = 16000;             // the grid runs 16 km past the map edge (open sea there)
  const W = map.W + 2 * pad, H = map.H + 2 * pad, cols = Math.floor(W / cell) + 1, rows = Math.floor(H / cell) + 1;
  const x0 = -W / 2, z0 = -H / 2, n = cols * rows;
  const top = new Float32Array(n), land = new Uint8Array(n);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = x0 + i * cell, z = z0 + j * cell, k = j * cols + i;
    let hmax = -1e9;
    if (!C.inMap(x, z, -cell)) hmax = -80;
    else for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) hmax = Math.max(hmax, map.h(x + a * cell * .45, z + b * cell * .45));
    top[k] = hmax; land[k] = hmax > -1.5 ? 1 : 0;
  }
  const dL = distance(land, cols, rows);
  for (let k = 0; k < n; k++) dL[k] *= cell;
  C.sea = { cell, cols, rows, x0, z0, top, dL, n,
    k: (x, z) => { const i = Math.round((x - x0) / cell), j = Math.round((z - z0) / cell); return i < 0 || j < 0 || i >= cols || j >= rows ? -1 : j * cols + i; },
    xz: k => [x0 + (k % cols) * cell, z0 + ((k / cols) | 0) * cell] };
  return C.sea;
}
/* o: { clear (m from land), depth (max top height), shore (weight of staying off the shore), avoid [{x,z,r}] } */
function seaRoute(C, a, b, o) {
  const G = seaGrid(C); o = o || {};
  const clear = o.clear || 800, depth = o.depth === undefined ? -8 : o.depth, shore = o.shore === undefined ? 2 : o.shore;
  // per-cell step cost (shore distance, the fleet's zones), cached per clearance / depth / shore weight
  const ck = clear + '/' + depth + '/' + shore;
  G.costs = G.costs || new Map();
  let cost = G.costs.get(ck);
  if (!cost) {
    const zones = C.avoid.filter(z => z.what === 'spawn fleet' || z.what === 'replenish');
    cost = new Float32Array(G.n);
    for (let q = 0; q < G.n; q++) {
      if (!(G.dL[q] >= clear && G.top[q] <= depth)) { cost[q] = -1; continue; }
      let c = G.cell * (1 + shore * Math.exp(-G.dL[q] / 2500));
      if (zones.length) { const x = G.x0 + (q % G.cols) * G.cell, z = G.z0 + ((q / G.cols) | 0) * G.cell; for (const zn of zones) { const dd = Math.hypot(x - zn.x, z - zn.z); if (dd < zn.r) c += G.cell * 6 * (1 - dd / zn.r); } }
      cost[q] = c;
    }
    // connected water (4-neighbour) under this clearance: a route between two components is not tried
    const comp = new Int32Array(G.n), st = new Int32Array(G.n); let nc = 0;
    for (let k0 = 0; k0 < G.n; k0++) {
      if (comp[k0] || cost[k0] < 0) continue;
      nc++; let sp = 0; st[sp++] = k0; comp[k0] = nc;
      while (sp) {
        const k = st[--sp], i = k % G.cols, j = (k / G.cols) | 0;
        if (i > 0 && !comp[k - 1] && cost[k - 1] >= 0) { comp[k - 1] = nc; st[sp++] = k - 1; }
        if (i < G.cols - 1 && !comp[k + 1] && cost[k + 1] >= 0) { comp[k + 1] = nc; st[sp++] = k + 1; }
        if (j > 0 && !comp[k - G.cols] && cost[k - G.cols] >= 0) { comp[k - G.cols] = nc; st[sp++] = k - G.cols; }
        if (j < G.rows - 1 && !comp[k + G.cols] && cost[k + G.cols] >= 0) { comp[k + G.cols] = nc; st[sp++] = k + G.cols; }
      }
    }
    cost.comp = comp;
    G.costs.set(ck, cost);
  }
  const ok = k => k >= 0 && cost[k] >= 0;
  const snap = (p) => {
    let k = G.k(p[0], p[1]); if (ok(k)) return k;
    let best = -1, bd = 1e18;
    for (let r = 1; r < 16 && best < 0; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = Math.round((p[0] - G.x0) / G.cell) + di, j = Math.round((p[1] - G.z0) / G.cell) + dj;
      if (i < 0 || j < 0 || i >= G.cols || j >= G.rows) continue;
      const q = j * G.cols + i; if (!ok(q)) continue;
      const d = di * di + dj * dj; if (d < bd) { bd = d; best = q; }
    }
    return best;
  };
  const ka = snap(a), kb = snap(b);
  if (ka < 0 || kb < 0 || cost.comp[ka] !== cost.comp[kb]) return null;
  const g = new Float32Array(G.n).fill(Infinity), from = new Int32Array(G.n).fill(-1), done = new Uint8Array(G.n);
  const heap = new Heap(4096);
  const [bx, bz] = G.xz(kb);
  g[ka] = 0; heap.push(0, ka);
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1], DL = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142];
  let found = false, guard = 0;
  while (heap.n) {
    const k = heap.pop();
    if (done[k]) continue; done[k] = 1;
    if (k === kb) { found = true; break; }
    if (++guard > G.n * 3) break;
    const i = k % G.cols, j = (k / G.cols) | 0;
    for (let d = 0; d < 8; d++) {
      const ii = i + DI[d], jj = j + DJ[d];
      if (ii < 0 || jj < 0 || ii >= G.cols || jj >= G.rows) continue;
      const q = jj * G.cols + ii; if (done[q] || cost[q] < 0) continue;
      const ng = g[k] + DL[d] * cost[q];
      if (ng < g[q]) { g[q] = ng; from[q] = k; const x = G.x0 + ii * G.cell, z = G.z0 + jj * G.cell; heap.push(ng + Math.hypot(x - bx, z - bz), q); }
    }
  }
  if (!found) return null;
  const cells = []; for (let k = kb; k >= 0; k = from[k]) cells.push(k);
  cells.reverse();
  let pts = cells.map(k => G.xz(k));
  pts[0] = [a[0], a[1]]; pts[pts.length - 1] = [b[0], b[1]];
  // string pulling: keep a point only when the straight line past it would leave the clear water
  const lineOk = (p, q) => {
    const L = dist2(p, q), n = Math.max(1, Math.ceil(L / (G.cell * .5)));
    for (let s = 1; s < n; s++) { const x = mix(p[0], q[0], s / n), z = mix(p[1], q[1], s / n); if (!ok(G.k(x, z))) return false; }
    return true;
  };
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineOk(pts[i], pts[j])) j--;
    out.push(pts[j]); i = j;
  }
  return round(out, 3);
}
/* Chaikin corner cutting (keeps the ends) */
function round(P, it) {
  let Q = P;
  for (let k = 0; k < it; k++) {
    if (Q.length < 3) return Q;
    const N = [Q[0]];
    for (let i = 0; i < Q.length - 1; i++) {
      const a = Q[i], b = Q[i + 1];
      if (i > 0) N.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25]);
      if (i < Q.length - 2) N.push([a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
    }
    N.push(Q[Q.length - 1]);
    Q = N;
  }
  return Q;
}
/* a point just outside the map edge on the side of (x, z) (ships come and go beyond the horizon of the map) */
function offMap(C, x, z, out) {
  const { map } = C, hw = map.W / 2, hh = map.H / 2;
  const dx = [hw - x, x + hw, hh - z, z + hh], m = dx.indexOf(Math.min(...dx));
  const o = out || 12000;
  return m === 0 ? [hw + o, z] : m === 1 ? [-hw - o, z] : m === 2 ? [x, hh + o] : [x, -hh - o];
}
/* gates: deep water near the map edges, clear of land by 3 km */
function edgeGates(C, clear) {
  const { map } = C, G = seaGrid(C), out = [], hw = map.W / 2, hh = map.H / 2, m = 4000;
  const add = (x, z, side) => { const k = G.k(x, z); if (k >= 0 && G.dL[k] >= (clear || 3000) && G.top[k] < -20 && C.clear(x, z, 1500, true)) out.push({ x, z, side }); };
  for (let s = -hw + 6000; s <= hw - 6000; s += 4000) { add(s, hh - m, 'n'); add(s, -hh + m, 's'); }
  for (let s = -hh + 6000; s <= hh - 6000; s += 4000) { add(hw - m, s, 'e'); add(-hw + m, s, 'w'); }
  return out;
}

/* ================================================================ traffic
   A few civilian ships on every map: through-lanes from edge to edge, calls at the harbours, fishing boats
   working their grounds. Their times are analytic (the system evaluates them at the sim time). */
function traffic(C, plan) {
  const { map } = C, r = rng(C.seed ^ 0x51f15e);
  const spec = TRAFFIC[map.id] || { through: 2, calls: 1, fishing: 2 };
  const gates = edgeGates(C, 3000);
  // through-lanes: gates on different sides, the longest routes first
  const lanes = [];
  for (let tries = 0; tries < 60 && lanes.length < spec.through && gates.length > 1; tries++) {
    const a = gates[Math.floor(r() * gates.length)], b = gates[Math.floor(r() * gates.length)];
    if (a.side === b.side || Math.hypot(a.x - b.x, a.z - b.z) < Math.min(map.W, map.H) * .6) continue;
    if (lanes.some(l => Math.hypot(l.a.x - a.x, l.a.z - a.z) < 15000 && Math.hypot(l.b.x - b.x, l.b.z - b.z) < 15000)) continue;
    const p = seaRoute(C, offMap(C, a.x, a.z), offMap(C, b.x, b.z), { clear: 1500, depth: -12 });
    if (!p) continue;
    lanes.push({ a, b, p });
  }
  lanes.forEach((l, i) => {
    const n = spec.perLane || 2;
    for (let k = 0; k < n; k++) {
      const key = (i + k) & 1 ? 'lm_tanker' : 'lm_cargo', v = (key === 'lm_tanker' ? 12 : 11) * KN;
      plan.ships.push({ key, mode: 'through', path: k & 1 ? l.p.slice().reverse() : l.p, speed: v * (1 + (r() - .5) * .12), phase: r(), name: (key === 'lm_tanker' ? 'Product tanker' : 'General cargo ship') + ' · ' + Math.round(v / KN) + ' kn' });
    }
  });
  // harbour calls: in from the nearest gate, a few hours alongside, out again
  let calls = 0;
  for (const o of map.objectives || []) {
    if (o.kind !== 'port' || calls >= spec.calls) continue;
    const out = C.A.seaward(o.x, o.z), ax = o.x + Math.sin(out) * 1700, az = o.z + Math.cos(out) * 1700;
    let g = null, gd = 1e18; for (const q of gates) { const d = Math.hypot(q.x - ax, q.z - az); if (d < gd) { gd = d; g = q; } }
    if (!g) continue;
    let p = null;
    for (const cl of [700, 400, 250]) { p = seaRoute(C, offMap(C, g.x, g.z), [ax, az], { clear: cl, depth: map.id === 'delta' ? -5 : -9 }); if (p) break; }
    if (!p) continue;
    plan.ships.push({ key: 'lm_cargo', mode: 'call', path: p, speed: 10 * KN, dwell: [2400, 3600], phase: r(), name: 'General cargo ship · bound for ' + o.name.replace(/^Port · /, '') });
    calls++;
  }
  // fishing: trawlers on the shelf, boats close in
  const fishing = spec.fishing || 0;
  const bases = (map.places || []).filter(p => p.kind === 'village' || p.kind === 'town');
  let made = 0;
  for (let tries = 0; tries < 200 && made < fishing; tries++) {
    const b = bases.length ? bases[Math.floor(r() * bases.length)] : { x: 0, z: 0 };
    const a = r() * TAU, d = 3000 + r() * 12000, cx = b.x + Math.sin(a) * d, cz = b.z + Math.cos(a) * d;
    const small = made % 2 === 1;
    const loop = fishingLoop(C, cx, cz, small ? 900 : 2200, small ? 250 : 900, r);
    if (!loop) continue;
    plan.ships.push({ key: small ? 'lm_boat' : 'lm_trawler', mode: 'loop', path: loop, speed: (small ? 5 : 3.5) * KN, phase: r(), name: small ? 'Fishing boat · 12 m' : 'Stern trawler · trawling 3.5 kn' });
    made++;
  }
}
const TRAFFIC = {
  krasnaya_kosa: { through: 2, calls: 1, fishing: 4 },
  fjord: { through: 1, calls: 2, fishing: 3, perLane: 1 },
  strait: { through: 0, calls: 1, fishing: 2 },
  archipelago: { through: 1, calls: 1, fishing: 5, perLane: 1 },
  delta: { through: 2, calls: 1, fishing: 3 },
  caldera: { through: 1, calls: 0, fishing: 3, perLane: 1 },
};
/* a closed working loop (an ellipse with a wobble) in water of fishing depth, clear of land */
function fishingLoop(C, cx, cz, R, clear, r) {
  const { map } = C, pts = [], a0 = r() * PI, e = .45 + r() * .35, n = 18;
  if (!C.clear(cx, cz, R + 1500, true)) return null;
  for (let i = 0; i < n; i++) {
    const t = i / n * TAU, w = 1 + .18 * Math.sin(t * 3 + a0), x0 = Math.cos(t) * R * w, z0 = Math.sin(t) * R * e * w;
    const x = cx + x0 * Math.cos(a0) - z0 * Math.sin(a0), z = cz + x0 * Math.sin(a0) + z0 * Math.cos(a0);
    if (!C.inMap(x, z, 2000)) return null;
    const hh = map.h(x, z); if (hh > -6 || hh < -400) return null;
    for (let k = 0; k < 6; k++) { const b = k / 6 * TAU; if (map.h(x + Math.sin(b) * clear, z + Math.cos(b) * clear) > -1) return null; }
    pts.push([x, z]);
  }
  return pts;
}

/* ================================================================ per map (filled in below) */
const PER_MAP = {};

/* ================================================================ crossings and bridges
   The straight crossings from a shore near `from` over water to other land: the shortest, with the ends high. */
function labels(C) {
  if (!C.lab) C.lab = labelLand(C.P.data, C.P.cols, C.P.rows);
  return C.lab;
}
const labAt = (C, x, z) => { const L = labels(C); return L.lab[C.A.idx(x, z)]; };
function crossings(C, o) {
  const { map } = C, out = [], R = o.R || 6000, step = 25;
  const [fx, fz] = o.from;
  for (let dz = -R; dz <= R; dz += 200) for (let dx = -R; dx <= R; dx += 200) {
    const ax = fx + dx, az = fz + dz;
    if (dx * dx + dz * dz > R * R || map.h(ax, az) <= 0 || C.A.coastDist(ax, az) > 200) continue;
    if (o.fromOk && !o.fromOk(ax, az)) continue;
    for (let k = 0; k < (o.dirs || 90); k++) {
      const a = k / (o.dirs || 90) * TAU, sx = Math.sin(a), sz = Math.cos(a);
      // leave the shore: find the water within 300 m
      let s = 0; while (s < 300 && map.h(ax + sx * s, az + sz * s) > 0) s += step;
      if (s >= 300) continue;
      const s0 = s; let deep = 0, sd = s;
      while (s < (o.maxW || 6000) && map.h(ax + sx * s, az + sz * s) <= 0) { const hh = map.h(ax + sx * s, az + sz * s); if (hh < deep) { deep = hh; sd = s; } s += step; }
      const w = s - s0;
      if (s >= (o.maxW || 6000) || w < (o.minW || 300)) continue;
      // land again: firm ground for 150 m on
      let firm = true; for (let q = 0; q < 150; q += step) if (map.h(ax + sx * (s + q), az + sz * (s + q)) <= 0) { firm = false; break; }
      if (!firm) continue;
      const bx = ax + sx * s, bz = az + sz * s;
      if (o.toOk && !o.toOk(bx, bz)) continue;
      out.push({ ax: ax + sx * s0, az: az + sz * s0, bx, bz, hdg: a, w, deep, sd: sd - s0 });
    }
  }
  return out;
}
/* a bridge along the line A -> B (both on the shore): runs inland at each end until its deck (level at `level`
   over the water, ramping down at `grade`) meets the ground; piers every `span` m; pylons round the deepest water */
function bridgeSpec(C, cr, o) {
  const { map } = C, sx = Math.sin(cr.hdg), sz = Math.cos(cr.hdg), level = o.level, grade = o.grade || .04;
  const hAt = (d) => map.h(cr.ax + sx * d, cr.az + sz * d);        // d along the line from the A shore
  // walk inland from each shore until the ramp meets the ground
  const land = (sgn, from) => {
    for (let d = 0; d < (o.maxRamp || 2500); d += 20) {
      const s = from + sgn * d, y = level - grade * d, g = hAt(s);
      if (g >= y - 1.5) return { s, y: Math.max(g + 1.5, y) };
      if (g < 0 && d > 60) return null;
    }
    return { s: from + sgn * (o.maxRamp || 2500), y: level - grade * (o.maxRamp || 2500) };
  };
  const eA = land(-1, 0), eB = land(1, cr.w);
  if (!eA || !eB) return null;
  const s0 = eA.s, L = eB.s - s0;
  const deck = [];
  for (let s = 0; s <= L + 1e-6; s += 20) {
    const d = s + s0, dA = Math.max(0, 0 - d), dB = Math.max(0, d - cr.w);
    let y = level;
    if (d < 0) y = Math.max(eA.y, level - grade * dA);
    if (d > cr.w) y = Math.max(eB.y, level - grade * dB);
    deck.push([s, Math.max(y, hAt(d) + 6)]);
  }
  if (deck[deck.length - 1][0] < L) deck.push([L, eB.y]);
  // vertical curves: smooth the profile
  for (let it = 0; it < 6; it++) for (let i = 1; i < deck.length - 1; i++) deck[i][1] = Math.max(deck[i][1] * .5 + (deck[i - 1][1] + deck[i + 1][1]) * .25, hAt(deck[i][0] + s0) + 6);
  const x0 = cr.ax + sx * s0, z0 = cr.az + sz * s0;
  const pylons = [], piers = [];
  if (o.type === 'cs') {
    const M = Math.min(o.main || 700, cr.w * .6), sc = cr.sd - s0, top = level + M * .22;
    pylons.push({ s: sc - M / 2, top, n: Math.round(M / 2 / 24), half: M / 2 }, { s: sc + M / 2, top, n: Math.round(M / 2 / 24), half: M / 2 });
  } else if (o.type === 'susp') {
    const t0 = -s0 - 15, t1 = cr.w - s0 + 15, top = level + (t1 - t0) / 9.5 + 3;
    pylons.push({ s: Math.max(40, t0), top }, { s: Math.min(L - 40, t1), top });
  }
  const span = o.span || 100;
  for (let s = span; s < L - 20; s += span) {
    if (pylons.some(p => Math.abs(p.s - s) < span * .55)) continue;
    if (o.type === 'susp' && s > pylons[0].s && s < pylons[1].s) continue;
    piers.push(s);
  }
  return { x: x0, z: z0, hdg: cr.hdg, L, deck, piers, pylons, cx: x0 + sx * L / 2, cz: z0 + sz * L / 2, r: L / 2 + 360, ends: ['abut', 'abut'] };
}
/* lamp posts along a bridge and the red obstruction lights on its tops, as navigation lights */
function bridgeLights(plan, B, every, name) {
  const sx = Math.sin(B.hdg), sz = Math.cos(B.hdg), cx = Math.cos(B.hdg), cz = -Math.sin(B.hdg), W = B.width || 20;
  const dy = s => { const D = B.deck; for (let i = 1; i < D.length; i++) if (s <= D[i][0]) { const a = D[i - 1], b = D[i]; return a[1] + (b[1] - a[1]) * (s - a[0]) / ((b[0] - a[0]) || 1); } return D[D.length - 1][1]; };
  for (let s = every / 2, k = 0; s < B.L; s += every, k++) {
    const side = k & 1 ? 1 : -1, lx = side * (W / 2 - 2.2);
    plan.lights.push({ x: B.x + sx * s + cx * lx, z: B.z + sz * s + cz * lx, y: dy(s) + 10, on: 'abs', ch: 'F', col: 'y', range: 9000, name: name + ' · street lights' });
  }
  for (const p of B.pylons || []) for (const side of [-1, 1]) {
    const lx = side * 2.5;
    plan.lights.push({ x: B.x + sx * p.s + cx * lx, z: B.z + sz * p.s + cz * lx, y: p.top + 1.5, on: 'abs', ch: 'Fl R 1.5s', col: 'r', range: 18000, name: name + ' · obstruction light' });
  }
}

/* ================================================================ Proliv Uzky
   A cable-stayed bridge from the mainland to Ostrov Sredny over the narrower channel (70 m clearance: the
   ships pass under it), the two channels buoyed, a light on the island (the objective's). */
PER_MAP.strait = (C, plan) => {
  const { map } = C;
  const isl = (map.places || []).find(p => p.kind === 'island' && /Sredny/.test(p.name)) || (map.places || []).find(p => p.kind === 'island');
  if (!isl) return;
  const L = labels(C), li = labAt(C, isl.x, isl.z);
  const cands = crossings(C, {
    from: [isl.x, isl.z], R: 7000, minW: 900, maxW: 7000, dirs: 120,
    fromOk: (x, z) => labAt(C, x, z) === li,
    toOk: (x, z) => { const l = labAt(C, x, z); return l && l !== li && L.sizes[l] > 20000; },
  });
  let best = null, bs = -1e18;
  for (const c of cands) {
    if (!C.clear(c.ax, c.az, 150) || !C.clear(c.bx, c.bz, 150)) continue;
    const hs = Math.min(map.h(c.ax + Math.sin(c.hdg) * -200, c.az + Math.cos(c.hdg) * -200), map.h(c.bx + Math.sin(c.hdg) * 200, c.bz + Math.cos(c.hdg) * 200));
    const sc = -c.w - 2 * Math.max(0, 60 - hs) * 25;
    if (sc > bs) { bs = sc; best = c; }
  }
  if (!best) { plan.notes.push('strait: no crossing'); return; }
  const B = bridgeSpec(C, best, { type: 'cs', level: 72, main: 720, span: 110, maxRamp: 2600 });
  if (!B) { plan.notes.push('strait: bridge failed'); return; }
  B.width = 28;
  plan.builds.push(Object.assign({ key: 'bridge', kind: 'bridge_cs', name: `Most Sredny · cable-stayed · ${(B.L / 1000).toFixed(1)} km · main span ${Math.round(B.pylons[1].s - B.pylons[0].s)} m`, farParts: 4 }, B));
  bridgeLights(plan, B, 50, 'Most Sredny');
  // the navigation span's channel lights under the girder, and lateral buoys up and down both channels
  C.bridge = B;
  channelBuoys(C, plan, isl, li);
};
/* buoys along the channels either side of an island: pairs every ~3 km on the channel edges */
function channelBuoys(C, plan, isl, li) {
  const { map } = C, G = seaGrid(C);
  for (const side of [-1, 1]) {
    for (let k = -3; k <= 3; k++) {
      // walk out from the island across the channel at stations along its axis (north-south)
      const z = isl.z + k * 3200, x0 = isl.x;
      let xa = null, xb = null;
      for (let d = 0; d < 12000; d += 100) { const x = x0 + side * d; if (map.h(x, z) < -12) { xa = x; break; } }
      if (xa === null) continue;
      for (let d = 0; d < 14000; d += 100) { const x = xa + side * d; if (map.h(x, z) > -12) { xb = x - side * 100; break; } }
      if (xb === null || Math.abs(xb - xa) < 800) continue;
      if (!C.clear(xa, z, 400, true) || !C.clear(xb, z, 400, true)) continue;
      // direction of buoyage: northbound in both channels (IALA A: red to port, i.e. on the west side going north)
      const west = side < 0 ? xb : xa, east = side < 0 ? xa : xb;
      const inset = 250 * (side < 0 ? -1 : 1);
      buoyAt(plan, 'can', west + Math.abs(inset), z, (k & 1) ? 'Fl(2) R 6s' : 'Fl R 4s', 'r', 'Channel ' + (side < 0 ? 'west' : 'east') + ' · port-hand');
      buoyAt(plan, 'cone', east - Math.abs(inset), z, (k & 1) ? 'Fl(2) G 6s' : 'Fl G 4s', 'g', 'Channel ' + (side < 0 ? 'west' : 'east') + ' · starboard-hand');
    }
  }
  void G;
}

/* ================================================================ helpers for the set pieces */
/* downhill from (x, z) in steps of `st` m along the steepest descent of the map, to the water (or max n steps) */
function descend(C, x, z, st, n) {
  const { map } = C, out = [[x, z]], e = 12;
  for (let i = 0; i < (n || 400); i++) {
    const h = map.h(x, z); if (h <= 0) break;
    let gx = (map.h(x + e, z) - map.h(x - e, z)) / (2 * e), gz = (map.h(x, z + e) - map.h(x, z - e)) / (2 * e);
    const g = Math.hypot(gx, gz);
    if (g < 1e-4) { gx = Math.sin(i); gz = Math.cos(i); } else { gx /= g; gz /= g; }
    x -= gx * st; z -= gz * st; out.push([x, z]);
  }
  return out;
}
/* uphill from (x, z) along the steepest ascent until the ground flattens or reaches maxH */
function ascend(C, x, z, st, maxH, n) {
  const { map } = C, out = [[x, z]], e = 12;
  for (let i = 0; i < (n || 300); i++) {
    const h = map.h(x, z); if (h >= maxH) break;
    const gx = (map.h(x + e, z) - map.h(x - e, z)) / (2 * e), gz = (map.h(x, z + e) - map.h(x, z - e)) / (2 * e), g = Math.hypot(gx, gz);
    if (g < .06 && h > maxH * .5) break;
    if (g < 1e-4) break;
    x += gx / g * st; z += gz / g * st; out.push([x, z]);
  }
  return out;
}
/* candidate points on a grid in a box, filtered and scored */
function scan(C, box, step, score, keep) {
  keep = keep || 800;
  let out = [], floor = -Infinity;
  for (let z = box[1]; z <= box[3]; z += step) for (let x = box[0]; x <= box[2]; x += step) {
    const s = score(x, z); if (s <= floor) continue;
    out.push({ x, z, s });
    if (out.length > keep * 3) { out.sort((a, b) => b.s - a.s); out.length = keep; floor = out[keep - 1].s; }
  }
  return out.sort((a, b) => b.s - a.s);
}
/* pick up to n of the best, at least `gap` m apart */
function spread(list, n, gap) {
  const out = [];
  for (const c of list) { if (out.length >= n) break; if (out.every(o => Math.hypot(o.x - c.x, o.z - c.z) >= gap)) out.push(c); }
  return out;
}
const mapBox = (C, m) => [-C.map.W / 2 + m, -C.map.H / 2 + m, C.map.W / 2 - m, C.map.H / 2 - m];
/* the direction of the deepest water within r of a shore point, toward `pref` if given */
function toWater(C, x, z, r, pref) {
  let best = 0, bs = 1e9;
  for (let k = 0; k < 48; k++) {
    const a = k / 48 * TAU, hh = C.map.h(x + Math.sin(a) * r, z + Math.cos(a) * r);
    const s = hh + (pref !== undefined ? 3 * (1 - Math.cos(a - pref)) : 0);
    if (s < bs) { bs = s; best = a; }
  }
  return best;
}
const cardinalCh = { n: 'Q W', e: 'Q(3) W 10s', s: 'Q(6)+LFl W 15s', w: 'Q(9) W 15s' };

/* resample a polyline every `st` m */
function resample(pl, st) {
  const out = [pl[0]];
  let carry = 0;
  for (let i = 0; i < pl.length - 1; i++) {
    const a = pl[i], b = pl[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = st - carry;
    for (; s <= L; s += st) out.push([a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L]);
    carry = L - (s - st);
  }
  out.push(pl[pl.length - 1]);
  return out;
}
/* where a road climbs steeper than `grade`, replace the stretch by hairpins zigzagging up the slope inside a
   corridor of +-120 m, so the grade stays near the limit; the hairpins are rounded */
function switchbacks(C, P, grade) {
  const { map } = C, out = [], n = P.length;
  const gAt = i => { const a = P[Math.max(0, i - 3)], b = P[Math.min(n - 1, i + 3)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return Math.abs(map.h(b[0], b[1]) - map.h(a[0], a[1])) / L; };
  let i = 0;
  while (i < n) {
    if (gAt(i) <= grade * 1.15) { out.push(P[i]); i++; continue; }
    let j = i; while (j < n - 1 && gAt(j) > grade * .8) j++;
    const i0 = Math.max(0, i - 2), j1 = Math.min(n - 1, j + 2), A = P[i0], B = P[j1];
    const D = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, dh = Math.abs(map.h(B[0], B[1]) - map.h(A[0], A[1])), Lr = dh / grade;
    if (Lr <= D * 1.1) { for (let k = i; k <= j; k++) out.push(P[k]); i = j + 1; continue; }
    const w = Math.min(160, Math.max(60, Lr / 10)), legs = Math.max(2, Math.ceil(Lr / (2 * w)));
    const ux = (B[0] - A[0]) / D, uz = (B[1] - A[1]) / D, nx = -uz, nz = ux;
    const Z = [[A[0], A[1]]];
    for (let k = 1; k < legs; k++) { const t = k / legs, lat = (k & 1 ? 1 : -1) * w; Z.push([A[0] + ux * D * t + nx * lat, A[1] + uz * D * t + nz * lat]); }
    Z.push([B[0], B[1]]);
    const zz = resample(round(Z, 3), 10);
    while (out.length && Math.hypot(out[out.length - 1][0] - A[0], out[out.length - 1][1] - A[1]) < 25 && out.length > 1 && P.indexOf(out[out.length - 1]) >= i0) out.pop();
    for (const p of zz) out.push(p);
    i = j1 + 1;
  }
  return out;
}

/* ================================================================ Krasnaya Kosa
   Seven mud volcanoes breathing faint wisps from the gryphons in their craters (the Taman sopkas), the fishing
   camp on the red sand spit with its jetty into Bukhta Tikhaya and the boats, a road bridge over a balka, the TV
   mast of Chernomorka; the lighthouse on Ostrov Chaika sweeps the sea at night. */
// the generator's mud volcanoes (gens/krasnaya.js MUDV), theatre km -> map metres: x = (xk + 5) km, z = (zk - 37) km
const MUDV = [[-20, -8, 42, 1300], [14, -12, 30, 1000], [33, -19, 55, 1500], [-45, -25, 36, 1200], [5, -31, 48, 1400], [-58, -12, 26, 900], [47, -30, 34, 1100]];
PER_MAP.krasnaya_kosa = (C, plan) => {
  const { map } = C;
  MUDV.forEach(([xk, zk, vh, vr], i) => {
    const x = (xk + 5) * 1000, z = (zk - 37) * 1000;
    if (!C.inMap(x, z, 1000) || map.h(x, z) < 6 || !C.clear(x, z, 150)) return;
    const r = rng(9100 + i), n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = r() * TAU, d = r() * vr * .12;
      const gx = x + Math.sin(a) * d, gz = z + Math.cos(a) * d;
      plan.plumes.push({ kind: 'mud', x: gx, z: gz, on: 'ground', dy: 2.4, scale: .8 + r() * .9, name: 'Mud volcano · gryphon' });
      plan.statics.push({ key: 'lm_gryphon', x: gx, z: gz, hdg: r() * TAU, on: 'ground', r: 11, small: true, name: 'Mud volcano · gryphon' });
    }
    plan.notes.push(`mud volcano ${i} h ${Math.round(map.h(x, z))}`);
  });
  // the fishing camp on the spit: low sand, water on both sides, the bay behind
  const bay = (map.places || []).find(p => p.kind === 'bay') || (map.places || []).find(p => p.kind === 'spit');
  const spit = (map.places || []).find(p => p.kind === 'spit');
  if (bay && spit) {
    const box = [Math.min(bay.x, spit.x) - 9000, Math.min(bay.z, spit.z) - 6000, Math.max(bay.x, spit.x) + 6000, Math.max(bay.z, spit.z) + 6000];
    const cands = scan(C, box, 100, (x, z) => {
      const h = map.h(x, z); if (h < 1.3 || h > 5) return -Infinity;
      if (C.A.seaFrac(x, z, 500) < .45 || !C.clear(x, z, 700)) return -Infinity;
      const db = Math.hypot(x - bay.x, z - bay.z);
      return -Math.abs(db - 3500) / 1000 - Math.hypot(x - spit.x, z - spit.z) / 6000;
    });
    const c = cands[0];
    if (c) {
      // the spit's axis (along the dunes) and the bay side
      const wa = toWater(C, c.x, c.z, 450, Math.atan2(bay.x - c.x, bay.z - c.z));
      const axis = wa + PI / 2;
      const S = settlement(C, { name: 'Rybatsky stan Kosa', kind: 'village', x: c.x, z: c.z }, { R0: 380, axis, linear: true, across: .3, noRoads: true, minH: 1.1, noChurch: true });
      if (S) plan.settlements.push(S);
      // the jetty from the bay shore
      let sx = c.x, sz = c.z;
      for (let d = 0; d < 600; d += 10) { const x = c.x + Math.sin(wa) * d, z = c.z + Math.cos(wa) * d; if (map.h(x, z) < .3) { sx = x - Math.sin(wa) * 4; sz = z - Math.cos(wa) * 4; break; } }
      const L = 170;
      plan.builds.push({ kind: 'jetty', key: 'jetty', x: sx, z: sz, hdg: wa, L, r: L + 60, cx: sx + Math.sin(wa) * L / 2, cz: sz + Math.cos(wa) * L / 2, name: 'Fishing jetty · Kosa · 170 m' });
      const r = rng(4411), px = Math.cos(wa), pz = -Math.sin(wa);
      for (let k = 0; k < 7; k++) {
        const s = 30 + k * 20, side = k & 1 ? 1 : -1;
        plan.statics.push({ key: 'lm_boat', x: sx + Math.sin(wa) * s + px * side * 5.2, z: sz + Math.cos(wa) * s + pz * side * 5.2, hdg: wa + (r() - .5) * .15 + (r() < .5 ? PI : 0), on: 'sea', float: true, r: 8, name: 'Fishing boat · moored', alpha: .8 });
      }
      for (let k = 0; k < 4; k++) {
        const s = -14 - r() * 10, lat = 30 + k * 16;
        plan.statics.push({ key: 'lm_boat', x: sx + Math.sin(wa) * s + px * lat, z: sz + Math.cos(wa) * s + pz * lat, hdg: wa + PI + (r() - .5) * .4, on: 'ground', dy: -.3, roll: .12, r: 8, name: 'Fishing boat · hauled up', alpha: .8 });
      }
      plan.lights.push({ x: sx + Math.sin(wa) * (L + 3), z: sz + Math.cos(wa) * (L + 3), y: 5.5, on: 'abs', ch: 'Fl Y 5s', col: 'y', range: 3 * 1852, name: 'Jetty head light' });
    } else plan.notes.push('krasnaya: no spit site');
  }
  // a road bridge over a balka
  const br = gullyCrossing(C);
  if (br) { plan.builds.push(br); plan.notes.push('gully bridge ' + Math.round(br.L) + ' m'); }
  // the TV mast of the largest town
  tvMast(C, plan);
};
/* a road that dips through a balka: bridge it where the dip is deepest */
function gullyCrossing(C) {
  const { map } = C;
  let best = null, bs = 0;
  for (const road of map.roads || []) {
    const P = [];
    for (let i = 0; i < road.length - 1; i++) { const a = road[i], b = road[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 20)); for (let k = 0; k < n; k++) P.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
    const HP = P.map(p => map.h(p[0], p[1]));
    for (let i = 0; i < P.length; i++) for (let j = i + 6; j < Math.min(P.length, i + 22); j++) {
      const A = P[i], B = P[j], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      if (L < 110 || L > 420) continue;
      const hA = HP[i], hB = HP[j];
      if (hA < 8 || hB < 8 || Math.abs(hA - hB) > 7) continue;
      let lo = 1e9; for (let k = i + 1; k < j; k++) if (HP[k] < lo) lo = HP[k];
      const dip = Math.min(hA, hB) - lo;
      if (lo < 1 || dip < 12) continue;
      if (!C.clear(A[0], A[1], 200) || !C.clear(B[0], B[1], 200)) continue;
      const sc = dip - L / 60;
      if (sc > bs) { bs = sc; best = { A, B, L, hA, hB }; }
    }
  }
  if (!best) {
    // no road dips through one: the deepest balka near a town, bridged across its rims
    const towns = (map.places || []).filter(p => p.kind === 'town' || p.kind === 'village');
    for (const t of towns.filter(p => p.kind === 'town')) for (let dz = -3600; dz <= 3600; dz += 200) for (let dx = -3600; dx <= 3600; dx += 200) {
      const x = t.x + dx, z = t.z + dz, h = map.h(x, z);
      if (h < 3 || !C.clear(x, z, 400)) continue;
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * PI, sx = Math.sin(a), sz = Math.cos(a);
        let ra = null, rb = null;
        for (let d = 40; d <= 220 && (ra === null || rb === null); d += 20) {
          if (ra === null && map.h(x + sx * d, z + sz * d) > h + 16) ra = d;
          if (rb === null && map.h(x - sx * d, z - sz * d) > h + 16) rb = d;
        }
        if (ra === null || rb === null) continue;
        const A = [x - sx * (rb + 20), z - sz * (rb + 20)], B = [x + sx * (ra + 20), z + sz * (ra + 20)], hA = map.h(A[0], A[1]), hB = map.h(B[0], B[1]);
        if (Math.abs(hA - hB) > 6) continue;
        const L = ra + rb + 40, dip = Math.min(hA, hB) - h, sc = dip - L / 60 - Math.hypot(dx, dz) / 800;
        if (sc > bs) { bs = sc; best = { A, B, L, hA, hB }; }
      }
    }
  }
  if (!best) return null;
  const { A, B, L, hA, hB } = best, hdg = Math.atan2(B[0] - A[0], B[1] - A[1]);
  const deck = [[0, hA + 1.5], [L, hB + 1.5]], piers = [];
  const n = Math.max(2, Math.round(L / 36)); for (let k = 1; k < n; k++) piers.push(L * k / n);
  return { kind: 'bridge_beam', key: 'gully', x: A[0], z: A[1], hdg, L, deck, piers, width: 12, r: L / 2 + 360, cx: (A[0] + B[0]) / 2, cz: (A[1] + B[1]) / 2, cy: (hA + hB) / 2, name: `Road bridge · balka · ${Math.round(L)} m` };
}
/* a guyed TV mast on high ground near the largest town, its obstruction lights */
function tvMast(C, plan) {
  const { map } = C;
  const towns = plan.settlements.filter(s => s.kind === 'town').sort((a, b) => b.buildings.length - a.buildings.length);
  const t = towns[0]; if (!t) return;
  const c = scan(C, [t.x - 5000, t.z - 5000, t.x + 5000, t.z + 5000], 250, (x, z) => {
    if (!C.dry(x, z, 130, .15) || !C.clear(x, z, 500)) return -Infinity;
    const d = Math.hypot(x - t.x, z - t.z); if (d < t.r + 300) return -Infinity;
    return map.h(x, z) / 20 - d / 1500;
  })[0];
  if (!c) return;
  plan.statics.push({ key: 'lm_mast', x: c.x, z: c.z, hdg: 0, on: 'ground', r: 190, name: `TV mast · ${t.name} · 192 m` });
  for (const y of [60, 120, 192]) plan.lights.push({ x: c.x, z: c.z, y, on: 'ground', ch: y > 150 ? 'Fl R 2s' : 'F R', col: 'r', range: 25000, name: 'TV mast · obstruction light' });
}

/* ================================================================ Dolgaya Guba
   A suspension bridge high over a side fjord (towers on the shores, tunnels into the rock), the car ferry
   across the main fjord between its two berths, the hydro power station at a fjord head with its penstocks up
   the wall and the 110 kV line along the shore, waterfalls down the fjord walls. */
PER_MAP.fjord = (C, plan) => {
  const { map } = C;
  // the bridge: a side fjord (branch), crossed where it is narrow and the walls are high
  const fj = (map.places || []).filter(p => p.kind === 'fjord');
  let best = null, bs = -1e18;
  for (const f of fj) {
    const cands = crossings(C, { from: [f.x, f.z], R: 9000, minW: 350, maxW: 1400, dirs: 72 });
    for (const c of cands) {
      const sx = Math.sin(c.hdg), sz = Math.cos(c.hdg);
      const hA = map.h(c.ax - sx * 150, c.az - sz * 150), hB = map.h(c.bx + sx * 150, c.bz + sz * 150);
      if (hA < 50 || hB < 50) continue;
      if (!C.clear(c.ax, c.az, 800) || !C.clear(c.bx, c.bz, 800)) continue;
      // the water under it must be a side fjord's (narrow both ways): not the open main channel
      const sc = -c.w / 100 + Math.min(hA, hB) / 40 - Math.abs(hA - hB) / 30 + (/Uzkaya|Sukhaya|Tikhaya|Olenya/.test(f.name) ? 3 : 0);
      if (sc > bs) { bs = sc; best = Object.assign({ f }, c, { hA, hB }); }
    }
  }
  if (best) {
    const level = Math.max(67, Math.min(95, Math.min(best.hA, best.hB) - 4));        // 63 m under the girder: a carrier's mast clears it
    const B = bridgeSpec(C, best, { type: 'susp', level, grade: .05, span: 40, maxRamp: 900 });
    if (B) {
      B.width = 20.5;
      const sx = Math.sin(B.hdg), sz = Math.cos(B.hdg);
      B.ends = [0, 1].map(i => { const s = i ? B.L + 160 : -160, g = map.h(B.x + sx * s, B.z + sz * s), y = B.deck[i ? B.deck.length - 1 : 0][1]; return g > y + 25 ? 'tunnel' : 'abut'; });
      B.anchorY = [B.deck[0][1] - 4, B.deck[B.deck.length - 1][1] - 4];
      B.piers = B.piers.filter(s => s < B.pylons[0].s - 30 || s > B.pylons[1].s + 30);
      plan.builds.push(Object.assign({ key: 'bridge', kind: 'bridge_susp', name: `Most ${best.f.name.replace('Guba ', '')} · suspension · main span ${Math.round(B.pylons[1].s - B.pylons[0].s)} m`, farParts: 4 }, B));
      bridgeLights(plan, B, 40, 'Suspension bridge');
      C.bridge = B;
    }
  } else plan.notes.push('fjord: no bridge site');
  // the car ferry: across the main fjord near its port
  const port = (map.objectives || []).find(o => o.kind === 'port');
  if (port) {
    const cands = crossings(C, { from: [port.x, port.z], R: 9000, minW: 1200, maxW: 4500, dirs: 72 });
    let fb = null, fs = -1e18;
    for (const c of cands) {
      const sx = Math.sin(c.hdg), sz = Math.cos(c.hdg);
      const hA = map.h(c.ax - sx * 120, c.az - sz * 120), hB = map.h(c.bx + sx * 120, c.bz + sz * 120);
      if (hA > 40 || hB > 40 || hA < 2 || hB < 2) continue;
      if (Math.hypot(c.ax - port.x, c.az - port.z) < 1200 || Math.hypot(c.bx - port.x, c.bz - port.z) < 1200) continue;
      if (!C.clear(c.ax, c.az, 400) || !C.clear(c.bx, c.bz, 400)) continue;
      if (C.bridge && segDist(C.bridge, c) < 2500) continue;
      const sc = -Math.abs(c.w - 2600) / 500 - Math.hypot(c.ax - port.x, c.az - port.z) / 4000 - (C.A.slope(c.ax, c.az) + C.A.slope(c.bx, c.bz)) * 20;
      if (sc > fs) { fs = sc; fb = c; }
    }
    if (fb) {
      const h = fb.hdg, sx = Math.sin(h), sz = Math.cos(h);
      const A = [fb.ax - sx * 6, fb.az - sz * 6], Bp = [fb.bx + sx * 6, fb.bz + sz * 6];
      plan.statics.push({ key: 'lm_slip', x: A[0], z: A[1], hdg: h, on: 'abs', y: 0, r: 40, name: 'Ferry berth · linkspan', lights: [{ p: [0, 14.8, 17.7], ch: 'Iso G 4s', col: 'g', range: 5000 }] });
      plan.statics.push({ key: 'lm_slip', x: Bp[0], z: Bp[1], hdg: h + PI, on: 'abs', y: 0, r: 40, name: 'Ferry berth · linkspan', lights: [{ p: [0, 14.8, 17.7], ch: 'Iso G 4s', col: 'g', range: 5000 }] });
      const a = [A[0] + sx * 66, A[1] + sz * 66], b = [Bp[0] - sx * 66, Bp[1] - sz * 66];
      const mid = [(a[0] + b[0]) / 2 + Math.cos(h) * 120, (a[1] + b[1]) / 2 - Math.sin(h) * 120];
      plan.ships.push({ key: 'lm_ferry', mode: 'shuttle', path: round([a, mid, b], 2), speed: 11 * KN, dwell: [420, 420], phase: .15, name: 'Car ferry · 86 m · 11 kn' });
    } else plan.notes.push('fjord: no ferry crossing');
  }
  // the hydro power station at the head of a fjord, the penstocks up the wall, the line to the town
  hydro(C, plan);
  // waterfalls down the walls
  waterfalls(C, plan, 2);
};
function segDist(B, c) {
  const sx = Math.sin(B.hdg), sz = Math.cos(B.hdg), mx = B.x + sx * B.L / 2, mz = B.z + sz * B.L / 2;
  return Math.min(Math.hypot(c.ax - mx, c.az - mz), Math.hypot(c.bx - mx, c.bz - mz));
}
function hydro(C, plan) {
  const { map } = C;
  const towns = (map.places || []).filter(p => p.kind === 'town');
  // a shore point with a steep wall behind it rising to the fjell (350 m within 1.5 km)
  const cands = scan(C, mapBox(C, 8000), 400, (x, z) => {
    const h = map.h(x, z); if (h < 2 || h > 12 || C.A.coastDist(x, z) > 200) return -Infinity;
    if (!C.clear(x, z, 900) || x < -20000) return -Infinity;
    let rise = 0; for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; rise = Math.max(rise, map.h(x + Math.sin(a) * 1500, z + Math.cos(a) * 1500)); }
    if (rise < 380) return -Infinity;
    const t = towns.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), 1e9);
    if (t < 1800 || t > 16000) return -Infinity;
    return rise / 200 - t / 5000 - C.A.slope(x, z) * 10 + C.A.shelter(x, z, 4000) * 2;
  });
  const c = cands[0];
  if (!c) { plan.notes.push('fjord: no hydro site'); return; }
  const wa = toWater(C, c.x, c.z, 250);
  plan.statics.push({ key: 'lm_powerhouse', x: c.x, z: c.z, hdg: wa, on: 'ground', r: 70, name: 'Hydro power station · 180 MW' });
  // penstocks: from behind the hall straight up the wall
  const bx = c.x - Math.sin(wa) * 30, bz = c.z - Math.cos(wa) * 30;
  const up = ascend(C, bx, bz, 20, 460, 120);
  if (up.length > 10) {
    const route = [];
    for (let i = up.length - 1; i >= 0; i -= 3) route.push(up[i]);
    if (route[route.length - 1] !== up[0]) route.push(up[0]);
    const simp = [route[0]];
    for (let i = 1; i < route.length - 1; i++) { const a = simp[simp.length - 1], b = route[i], d = route[i + 1]; const t1 = Math.atan2(b[0] - a[0], b[1] - a[1]), t2 = Math.atan2(d[0] - b[0], d[1] - b[1]); if (Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1))) > .12 || Math.hypot(b[0] - a[0], b[1] - a[1]) > 400) simp.push(b); }
    simp.push(route[route.length - 1]);
    const top = simp[0], mx = (top[0] + c.x) / 2, mz = (top[1] + c.z) / 2, rr = Math.hypot(top[0] - c.x, top[1] - c.z) / 2 + 80;
    plan.builds.push({ kind: 'penstock', key: 'penstock', x: mx, z: mz, route: simp, r: rr, name: `Penstocks · 2 × Ø 2.4 m · head ${Math.round(map.h(top[0], top[1]))} m` });
  }
  // the 110 kV line: from the switchyard to the nearest town, then out along its road to the grid
  const t = towns.reduce((m, p) => (!m || Math.hypot(p.x - c.x, p.z - c.z) < Math.hypot(m.x - c.x, m.z - c.z)) ? p : m, null);
  const path = [[c.x + Math.cos(wa) * 70, c.z - Math.sin(wa) * 70]];
  if (t) {
    path.push([t.x, t.z]);
    // the road leaving the town, the far end first
    let road = null, bd2 = 1e9, end = 0;
    for (const rd of map.roads || []) for (const e of [0, rd.length - 1]) { const d = Math.hypot(rd[e][0] - t.x, rd[e][1] - t.z); if (d < bd2 && rd.length > 4) { bd2 = d; road = rd; end = e; } }
    if (road && bd2 < 3000) { const seq = end ? road.slice().reverse() : road; let acc = 0; for (let i = 1; i < seq.length && acc < 14000; i++) { acc += Math.hypot(seq[i][0] - seq[i - 1][0], seq[i][1] - seq[i - 1][1]); path.push(seq[i]); } }
  }
  const towers = [];
  let carry = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / (L || 1), nz = (b[0] - a[0]) / (L || 1);
    for (let d = carry; d < L; d += 330) {
      let x = a[0] + (b[0] - a[0]) * d / L + nx * 30, z = a[1] + (b[1] - a[1]) * d / L + nz * 30;
      // off the water, off the settlements' streets: nudge inland (up the slope) until dry
      for (let k = 0; k < 12 && map.h(x, z) < 3; k++) { const g = C.downhill(x, z, 60) + PI; x += Math.sin(g) * 40; z += Math.cos(g) * 40; }
      if (map.h(x, z) >= 3 && C.clear(x, z, 40)) towers.push([x, z]);
      carry = d + 330 - L;
    }
  }
  if (towers.length > 3) {
    let mx = 0, mz = 0; for (const p of towers) { mx += p[0] / towers.length; mz += p[1] / towers.length; }
    let rr = 0; for (const p of towers) rr = Math.max(rr, Math.hypot(p[0] - mx, p[1] - mz) + 60);
    plan.builds.push({ kind: 'powerline', key: 'line', x: mx, z: mz, towers, r: rr, name: 'Power line · 110 kV · double circuit', farParts: 2 });
  }
}
/* waterfalls: a hanging valley's stream plunging down a fjord wall */
function waterfalls(C, plan, n) {
  const { map } = C;
  const cands = scan(C, mapBox(C, 6000), 300, (x, z) => {
    const h = map.h(x, z); if (h < 170 || h > 700) return -Infinity;
    const cd = C.A.coastDist(x, z); if (cd > 1000 || cd < 150) return -Infinity;
    if (!C.clear(x, z, 1500)) return -Infinity;
    // a gully: the ground either side (across the fall line) is higher
    const e = 14, gx = (map.h(x + e, z) - map.h(x - e, z)) / (2 * e), gz = (map.h(x, z + e) - map.h(x, z - e)) / (2 * e), g = Math.hypot(gx, gz) || 1;
    const px = -gz / g, pz = gx / g, side = (map.h(x + px * 150, z + pz * 150) + map.h(x - px * 150, z - pz * 150)) / 2 - h;
    return side / 10 + g * 3 + (h - 170) / 200;
  });
  const picks = [];
  for (const c of cands) {
    if (picks.length >= n) break;
    if (picks.some(p => Math.hypot(p.x - c.x, p.z - c.z) < 12000)) continue;
    const down = descend(C, c.x, c.z, 8, 500);
    const end = down[down.length - 1];
    if (map.h(end[0], end[1]) > 0) continue;
    // the steep part: at least 120 m of drop over 250 m of run
    let drop = 0; for (let i = 0; i + 30 < down.length; i++) drop = Math.max(drop, map.h(down[i][0], down[i][1]) - map.h(down[i + 30][0], down[i + 30][1]));
    if (drop < 110) continue;
    // start a little upstream of the lip: the stream on the fjell
    const up = ascend(C, c.x, c.z, 10, map.h(c.x, c.z) + 40, 40).reverse();
    picks.push({ x: c.x, z: c.z, path: up.concat(down.slice(1)), drop });
  }
  picks.forEach((p, i) => plan.falls.push({ path: p.path, width: 9 + i * 4, name: `Waterfall · ${Math.round(p.drop)} m drop` }));
}

/* ================================================================ Belye Shkhery
   Wrecks on the reefs, skerry lights on the outer rocks, cardinal buoys marking the reefs, a weather radar on
   an island summit, Pomor crosses and stone cairns (the old White Sea sea-marks) on the headlands. */
PER_MAP.archipelago = (C, plan) => {
  const { map } = C, L = labels(C);
  // reefs: just under the surface, no land within 350 m, deep water within 1.2 km
  const reefs = scan(C, mapBox(C, 7000), 200, (x, z) => {
    const h = map.h(x, z); if (h > -.6 || h < -4.5) return -Infinity;
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; if (map.h(x + Math.sin(a) * 350, z + Math.cos(a) * 350) > 0) return -Infinity; }
    let deep = 0; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; deep = Math.min(deep, map.h(x + Math.sin(a) * 1200, z + Math.cos(a) * 1200)); }
    if (deep > -15 || !C.clear(x, z, 1500, true)) return -Infinity;
    return -deep / 20 + hash2(x | 0, z | 0, 5);
  });
  const wr = spread(reefs, 3, 9000);
  wr.forEach((w, i) => plan.statics.push({ key: i === 1 ? 'lm_wreck_trawler' : 'lm_wreck_cargo', x: w.x, z: w.z, hdg: hash2(i, 7, 9) * TAU, on: 'abs', y: 0, r: 50, dissolve: .2, alpha: .82, name: i === 1 ? 'Wreck · trawler · on the reef' : 'Wreck · coaster · broken in two' }));
  // cardinal marks at other reefs: on the side of the deep water
  const marks = spread(reefs.filter(r => wr.every(w => Math.hypot(w.x - r.x, w.z - r.z) > 3000)), 6, 7000);
  for (const m of marks) {
    let best = 0, bh = 1e9; for (let k = 0; k < 4; k++) { const a = k * PI / 2, hh = map.h(m.x + Math.sin(a) * 700, m.z + Math.cos(a) * 700); if (hh < bh) { bh = hh; best = k; } }
    const q = ['n', 'e', 's', 'w'][best], a = best * PI / 2;
    buoyAt(plan, q, m.x + Math.sin(a) * 350, m.z + Math.cos(a) * 350, cardinalCh[q], 'w', `${{ n: 'North', e: 'East', s: 'South', w: 'West' }[q]} cardinal · reef`);
  }
  // skerry lights: small islands out in the open, facing the sea
  const obj = (map.objectives || []).find(o => o.kind === 'lighthouse');
  const sk = scan(C, mapBox(C, 6000), 200, (x, z) => {
    if (map.h(x, z) < 3) return -Infinity;
    const l = labAt(C, x, z); if (!l || L.sizes[l] > 45) return -Infinity;
    if (obj && Math.hypot(obj.x - x, obj.z - z) < 8000) return -Infinity;
    if (!C.clear(x, z, 800, true)) return -Infinity;
    return C.A.seaFrac(x, z, 2500) * 3 + map.h(x, z) / 30;
  });
  const CHS = ['Fl(3) W 12s', 'Oc W 6s', 'Fl(2) W 8s', 'Iso W 4s'];
  spread(sk, 4, 11000).forEach((s, i) => {
    plan.statics.push({ key: 'lm_skerry_light', x: s.x, z: s.z, hdg: 0, on: 'ground', r: 10, name: `Skerry light · ${CHS[i]} · 10 M` });
    plan.lights.push({ x: s.x, z: s.z, y: 10.6, on: 'ground', ch: CHS[i], col: 'w', range: 10 * 1852, name: 'Skerry light' });
  });
  // the weather radar on the summit of an island other than the radar hill's
  const rh = (map.objectives || []).find(o => o.kind === 'radar_hill');
  const rhL = rh ? labAt(C, rh.x, rh.z) : -1;
  const ws = scan(C, mapBox(C, 8000), 300, (x, z) => {
    const h = map.h(x, z); if (h < 25 || labAt(C, x, z) === rhL || !C.dry(x, z, 45, .3) || !C.clear(x, z, 600)) return -Infinity;
    return h / 10;
  }, 50)[0];
  if (ws) plan.statics.push({ key: 'lm_weather', x: ws.x, z: ws.z, hdg: hash2(3, 4, 5) * TAU, on: 'ground', r: 45, name: 'Weather station · radar', lights: [{ p: [8, 36.4, 22], ch: 'Fl R 2s', col: 'r', range: 12000 }] });
  // Pomor crosses on headlands, cairns on skerries
  const heads = scan(C, mapBox(C, 6000), 300, (x, z) => {
    const h = map.h(x, z); if (h < 4 || C.A.coastDist(x, z) > 200 || !C.clear(x, z, 300)) return -Infinity;
    return C.A.seaFrac(x, z, 900) * 2 + h / 40 + hash2(x | 0, z | 0, 11) * .5;
  });
  spread(heads, 6, 9000).forEach((p, i) => plan.statics.push({ key: 'lm_cross', x: p.x, z: p.z, hdg: hash2(i, 1, 2) * TAU, on: 'ground', r: 5, small: true, name: 'Pomor cross · sea-mark' }));
  spread(sk.slice(8), 6, 7000).forEach((p, i) => plan.statics.push({ key: 'lm_cairn', x: p.x + 20, z: p.z, hdg: i, on: 'ground', r: 3, small: true, name: 'Stone cairn · sea-mark' }));
};

/* ================================================================ Ust-Solyonaya
   Gas production platforms on the shelf with their flares lighting the sea, wellhead platforms round them, a
   supply vessel on the run from the port, the river port's quay with its cranes and barges up the channel. */
PER_MAP.delta = (C, plan) => {
  const { map } = C;
  const W = (map.weather && map.weather.wind) || [3, 1], wh = Math.atan2(W[0], W[1]);
  const port = (map.objectives || []).find(o => o.kind === 'port');
  const shelf = scan(C, mapBox(C, 9000), 500, (x, z) => {
    const h = map.h(x, z); if (h > -9 || h < -35) return -Infinity;
    const sd = C.A.shoreDist(x, z); if (sd < 9000 || sd > 30000) return -Infinity;
    if (!C.clear(x, z, 4000, true)) return -Infinity;
    return -Math.abs(sd - 16000) / 5000 - (port ? Math.hypot(x - port.x, z - port.z) / 40000 : 0) + hash2(x | 0, z | 0, 3) * .4;
  });
  const plats = spread(shelf, 2, 14000);
  plats.forEach((p, i) => {
    const hdg = wh - PI / 4;
    plan.statics.push({ key: 'lm_platform', x: p.x, z: p.z, hdg, on: 'abs', y: 0, r: 60, name: `Gas production platform · ${['Shtormovaya', 'Arkhangelskaya'][i]}`,
      lights: [{ p: [15, 21, -15], ch: 'Mo(U) W 15s', col: 'w', range: 10 * 1852 }, { p: [-11, 31.5, -.2], ch: 'F', col: 'g', range: 4000 }, { p: [-.2, 31.5, -11], ch: 'F', col: 'g', range: 4000 }, { p: [-6, 43.5, 24], ch: 'F R', col: 'r', range: 8000 }] });
    plan.flares.push({ x: p.x, z: p.z, hdg, name: 'Flare' });
    // two wellheads round it
    for (let k = 0; k < 2; k++) {
      const a = hash2(i, k, 21) * TAU, d = 1800 + hash2(i, k, 22) * 1600, x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (map.h(x, z) > -7 || !C.clear(x, z, 2000, true)) continue;
      plan.statics.push({ key: 'lm_wellhead', x, z, hdg: a, on: 'abs', y: 0, r: 20, name: 'Wellhead platform', lights: [{ p: [4.8, 22.4, 4.8], ch: 'Mo(U) W 15s', col: 'w', range: 8 * 1852 }] });
    }
    // the supply vessel's run from the port approach
    if (port && i === 0) {
      const out = C.A.seaward(port.x, port.z), a = [port.x + Math.sin(out) * 1500, port.z + Math.cos(out) * 1500];
      const b = [p.x - Math.sin(hdg) * 120, p.z - Math.cos(hdg) * 120];
      const path = seaRoute(C, a, b, { clear: 400, depth: -5 });
      if (path) plan.ships.push({ key: 'lm_psv', mode: 'call', path, speed: 12 * KN, dwell: [1800, 1500], phase: .35, name: 'Platform supply vessel · 70 m' });
    }
  });
  if (!plats.length) plan.notes.push('delta: no shelf site');
  // the pipeline's landfall on the delta front nearest the first platform, the terminal 2-4 km inland
  if (plats.length) {
    const p0 = plats[0];
    const lf = scan(C, [p0.x - 30000, p0.z - 30000, p0.x + 30000, p0.z + 30000], 200, (x, z) => {
      const h = map.h(x, z); if (h < .6 || h > 4 || C.A.coastDist(x, z) > 200 || !C.clear(x, z, 1500)) return -Infinity;
      return -Math.hypot(x - p0.x, z - p0.z) / 1000;
    }, 50)[0];
    if (lf) {
      const inl = C.A.seaward(lf.x, lf.z) + PI;
      const tm = scan(C, [lf.x - 6000, lf.z - 6000, lf.x + 6000, lf.z + 6000], 150, (x, z) => {
        if (!C.dry(x, z, 170, .08) || !C.clear(x, z, 400)) return -Infinity;
        const d = Math.hypot(x - lf.x, z - lf.z); if (d < 1800 || d > 5000) return -Infinity;
        for (const s of plan.settlements) if (Math.hypot(s.x - x, s.z - z) < s.r + 300) return -Infinity;
        const a = Math.atan2(x - lf.x, z - lf.z);
        return -Math.abs(Math.atan2(Math.sin(a - inl), Math.cos(a - inl))) - d / 4000;
      }, 60)[0];
      if (tm) {
        const hdg = Math.atan2(lf.x - tm.x, lf.z - tm.z) + PI;               // -Z (the arrival side) toward the landfall
        plan.statics.push({ key: 'lm_terminal', x: tm.x, z: tm.z, hdg, on: 'ground', r: 170, name: 'Gas terminal · Ust-Solyonaya', lights: [{ p: [-95, 63, -70], ch: 'Fl R 2s', col: 'r', range: 15000 }] });
        plan.flares.push({ x: tm.x, z: tm.z, hdg, tip: [-95, 63.5, -70], small: true, name: 'Terminal flare · pilot' });
        const s = Math.sin(hdg), c = Math.cos(hdg), end = [tm.x - s * 95, tm.z - c * 95];
        const route = [[lf.x + Math.sin(inl + PI) * 30, lf.z + Math.cos(inl + PI) * 30], [lf.x, lf.z], [(lf.x + end[0]) / 2, (lf.z + end[1]) / 2], end];
        let mx = 0, mz = 0; for (const p of route) { mx += p[0] / route.length; mz += p[1] / route.length; }
        plan.builds.push({ kind: 'pipeline', key: 'pipeline', x: mx, z: mz, route, r: Math.hypot(end[0] - lf.x, end[1] - lf.z) / 2 + 200, name: 'Gas pipeline · Ø 1.2 m · to Shtormovaya' });
      } else plan.notes.push('delta: no terminal site');
    }
  }
  // reed beds along the banks of the channels and lagoons: low wet ground at the water's edge
  const reedC = scan(C, mapBox(C, 6000), 200, (x, z) => {
    const h = map.h(x, z); if (h < .1 || h > 1.4 || C.A.coastDist(x, z) > 200 || !C.clear(x, z, 300)) return -Infinity;
    return hash2(x | 0, z | 0, 41) + (1.4 - h);
  }, 3000);
  const patches = spread(reedC, 60, 1400).map((p, i) => {
    const wa = toWater(C, p.x, p.z, 120);
    // the patch straddles the waterline, running along the shore
    let ex = p.x, ez = p.z; for (let d = 0; d < 200; d += 10) { if (map.h(p.x + Math.sin(wa) * d, p.z + Math.cos(wa) * d) < 0) { ex = p.x + Math.sin(wa) * d; ez = p.z + Math.cos(wa) * d; break; } }
    return { x: ex, z: ez, len: 50 + hash2(i, 3, 5) * 90, wid: 14 + hash2(i, 4, 5) * 22, ang: wa + PI / 2, seed: 300 + i };
  });
  // group the patches into builds of neighbours (one model each, so each gets its own level of detail)
  const groups = [];
  for (const p of patches) { let g = groups.find(q => Math.hypot(q.x - p.x, q.z - p.z) < 6000); if (!g) groups.push(g = { x: p.x, z: p.z, patches: [] }); g.patches.push(p); }
  for (const g of groups) {
    let r = 0; for (const p of g.patches) r = Math.max(r, Math.hypot(p.x - g.x, p.z - g.z) + p.len);
    plan.builds.push({ kind: 'reeds', key: 'reeds', x: g.x, z: g.z, cy: 1, patches: g.patches, wind: W, h: map.h, r: r + 20, alpha: .6, name: 'Reed beds · Phragmites' });
  }
  // the river port: a straight bank of the main channel upstream of the port town
  const town = (map.places || []).find(p => p.kind === 'town' && port && Math.hypot(p.x - port.x, p.z - port.z) < 3000) || (map.places || []).find(p => p.kind === 'town');
  if (town) {
    const cands = scan(C, [town.x - 7000, town.z - 7000, town.x + 7000, town.z + 7000], 100, (x, z) => {
      const h = map.h(x, z); if (h < .8 || h > 6 || C.A.coastDist(x, z) > 200) return -Infinity;
      if (!C.clear(x, z, 450)) return -Infinity;
      const wa = toWater(C, x, z, 150);
      if (map.h(x + Math.sin(wa) * 150, z + Math.cos(wa) * 150) > -1) return -Infinity;
      // the water across must be a channel 180-700 m wide
      let w = 0; for (let d = 60; d < 1200; d += 20) { if (map.h(x + Math.sin(wa) * d, z + Math.cos(wa) * d) > 0) { w = d; break; } }
      if (w < 150 || w > 1000) return -Infinity;
      // a straight bank: the shore 150 m either way along it
      const px = Math.cos(wa), pz = -Math.sin(wa);
      let bad = 0;
      for (const sg of [-1, 1]) { const qx = x + px * sg * 150, qz = z + pz * sg * 150; if (map.h(qx, qz) < .5) bad++; if (map.h(qx + Math.sin(wa) * 90, qz + Math.cos(wa) * 90) > 0) bad++; }
      if (bad > 1) return -Infinity;
      return -Math.hypot(x - town.x, z - town.z) / 2000 - Math.abs(w - 350) / 400 - bad;
    });
    const q = cands[0];
    if (q) {
      const wa = toWater(C, q.x, q.z, 150);
      let fx = q.x, fz = q.z; for (let d = 0; d < 200; d += 5) { if (map.h(q.x + Math.sin(wa) * d, q.z + Math.cos(wa) * d) < .2) { fx = q.x + Math.sin(wa) * (d - 3); fz = q.z + Math.cos(wa) * (d - 3); break; } }
      const L = 320;
      plan.builds.push({ kind: 'quay', key: 'quay', x: fx, z: fz, hdg: wa, L, r: L / 2 + 80, seed: 7, name: `River port · ${town.name} · quay ${L} m` });
      const px = Math.cos(wa), pz = -Math.sin(wa);
      for (const [off, lat] of [[-95, 7], [0, 19], [95, 7]]) plan.statics.push({ key: 'lm_barge', x: fx + px * off + Math.sin(wa) * lat, z: fz + pz * off + Math.cos(wa) * lat, hdg: wa + PI / 2, on: 'sea', float: true, r: 42, name: 'River barge · alongside', alpha: .82 });
    } else plan.notes.push('delta: no quay site');
  }
};

/* ================================================================ Chyortova Past
   The young cone steaming from its crater (the plume leans with the storm and its vent glows at night),
   fumaroles on the crater rim and the caldera wall, steam off the hot beach, the volcano observatory on the rim,
   basalt sea stacks off the outer cliffs, leading lights and buoys through Vorota. */
PER_MAP.caldera = (C, plan) => {
  const { map } = C;
  const peak = (map.places || []).find(p => p.kind === 'peak' && /Molodoy/.test(p.name)) || (map.places || []).find(p => p.kind === 'peak');
  if (peak) {
    // the crater: the lowest point near the cone's top ringed by higher ground
    let cr = null, ch = 1e9;
    for (let dz = -900; dz <= 900; dz += 25) for (let dx = -900; dx <= 900; dx += 25) {
      const x = peak.x + dx, z = peak.z + dz, h = map.h(x, z); if (h <= 0 || h >= ch) continue;
      if (h < map.h(peak.x, peak.z) - 220) continue;
      let ring = 1e9; for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; ring = Math.min(ring, map.h(x + Math.sin(a) * 320, z + Math.cos(a) * 320)); }
      if (ring > h + 12) { ch = h; cr = [x, z]; }
    }
    const v = cr || [peak.x, peak.z];
    plan.plumes.push({ kind: 'steam', x: v[0], z: v[1], on: 'ground', scale: 1, glow: 1, name: 'Vulkan Molodoy · steam plume' });
    const rr = rng(3131);
    for (let k = 0; k < 6; k++) { const a = rr() * TAU, d = 220 + rr() * 200; plan.plumes.push({ kind: 'fumarole', x: v[0] + Math.sin(a) * d, z: v[1] + Math.cos(a) * d, on: 'ground', scale: .8 + rr() * .8, name: 'Fumarole · crater rim' }); }
    C.vent = v;
  }
  // fumaroles on the inner caldera wall, and steam off the hot beach
  const wall = scan(C, mapBox(C, 6000), 250, (x, z) => {
    const h = map.h(x, z); if (h < 60 || h > 350 || C.A.slope(x, z) < .35 || !C.clear(x, z, 300)) return -Infinity;
    if (C.vent && Math.hypot(x - C.vent[0], z - C.vent[1]) < 3000) return -Infinity;
    return hash2(x | 0, z | 0, 17);
  });
  spread(wall, 4, 5000).forEach(p => plan.plumes.push({ kind: 'fumarole', x: p.x, z: p.z, on: 'ground', scale: 1.2, name: 'Fumarole field · caldera wall' }));
  const beach = (map.places || []).find(p => /Goryachy/.test(p.name));
  if (beach) {
    const b = scan(C, [beach.x - 5000, beach.z - 5000, beach.x + 5000, beach.z + 5000], 100, (x, z) => {
      const h = map.h(x, z); if (h < .5 || h > 6 || C.A.coastDist(x, z) > 150 || !C.clear(x, z, 200)) return -Infinity;
      return -Math.hypot(x - beach.x, z - beach.z) / 3000;
    });
    spread(b, 4, 250).forEach(p => plan.plumes.push({ kind: 'fumarole', x: p.x, z: p.z, on: 'ground', scale: .6, name: 'Hot springs · steam' }));
  }
  // the observatory on the rim, looking at the cone
  if (C.vent) {
    const ob = scan(C, mapBox(C, 6000), 200, (x, z) => {
      const h = map.h(x, z); if (h < 250 || !C.dry(x, z, 40, .28) || !C.clear(x, z, 700)) return -Infinity;
      return -Math.hypot(x - C.vent[0], z - C.vent[1]) / 2000 + h / 400;
    })[0];
    if (ob) plan.statics.push({ key: 'lm_observatory', x: ob.x, z: ob.z, hdg: Math.atan2(C.vent[0] - ob.x, C.vent[1] - ob.z), on: 'ground', r: 40, name: 'Volcano observatory', lights: [{ p: [10, 30.4, 14], ch: 'Fl R 2s', col: 'r', range: 12000 }] });
  }
  // sea stacks off the outer cliffs
  const st = scan(C, mapBox(C, 5000), 150, (x, z) => {
    const h = map.h(x, z); if (h > -2 || h < -14) return -Infinity;
    const sd = C.A.shoreDist(x, z); if (sd < 150 || sd > 500) return -Infinity;
    let cliff = 0; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; cliff = Math.max(cliff, map.h(x + Math.sin(a) * 700, z + Math.cos(a) * 700)); }
    if (cliff < 70 || !C.clear(x, z, 800, true)) return -Infinity;
    return cliff / 100 + hash2(x | 0, z | 0, 29);
  });
  const clusters = spread(st, 3, 9000);
  clusters.forEach((c, i) => {
    const r = rng(700 + i), S = [];
    for (let k = 0; k < 3 + Math.floor(r() * 2); k++) {
      const a = r() * TAU, d = k ? 60 + r() * 160 : 0, x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d;
      if (map.h(x, z) > -1.5) continue;
      S.push({ x, z, h: 24 + r() * 36, r: 4.5 + r() * 4.5, seed: 17 + i * 13 + k });
    }
    if (S.length) plan.builds.push({ kind: 'stacks', key: 'stacks', x: c.x, z: c.z, stacks: S, r: 260, name: 'Sea stacks · basalt' });
  });
  // the rim road: the map's road round the crest, drawn narrow, with hairpins where it climbs too steeply
  const ring = (map.roads || []).reduce((m, r) => (!m || r.length > m.length ? r : m), null);
  if (ring && ring.length > 20) {
    const pts = switchbacks(C, resample(ring, 10), .09);
    let mx = 0, mz = 0; for (const p of pts) { mx += p[0] / pts.length; mz += p[1] / pts.length; }
    let rr = 0; for (const p of pts) rr = Math.max(rr, Math.hypot(p[0] - mx, p[1] - mz));
    plan.builds.push({ kind: 'road', key: 'road', x: mx, z: mz, pts, width: 6, r: rr + 50, farParts: 3, alpha: .7, name: 'Rim road · 6 m · marker posts' });
  }
  // Vorota: lateral pairs through the breach and a leading light
  const gate = (map.places || []).find(p => p.kind === 'strait');
  if (gate) {
    const cx = -4000, cz = -3000;              // (only the direction matters: the lagoon's centre)
    void cx; void cz;
    const lag = (map.places || []).find(p => p.kind === 'lagoon') || { x: 0, z: 0 };
    const inb = Math.atan2(lag.x - gate.x, lag.z - gate.z), rx = Math.cos(inb), rz = -Math.sin(inb);
    for (const d of [-2200, -900, 400]) {
      const x0 = gate.x + Math.sin(inb) * d, z0 = gate.z + Math.cos(inb) * d;
      // the channel's edges across the breach at this station
      let l = null, rgt = null;
      for (let s = 0; s < 3000 && (l === null || rgt === null); s += 50) {
        if (l === null && map.h(x0 - rx * s, z0 - rz * s) > -10) l = s - 150;
        if (rgt === null && map.h(x0 + rx * s, z0 + rz * s) > -10) rgt = s - 150;
      }
      if (l === null || rgt === null || l < 100 || rgt < 100) continue;
      buoyAt(plan, 'can', x0 - rx * l, z0 - rz * l, 'Fl R 3s', 'r', 'Vorota · port-hand');
      buoyAt(plan, 'cone', x0 + rx * rgt, z0 + rz * rgt, 'Fl G 3s', 'g', 'Vorota · starboard-hand');
    }
  }
};

export { context as _context, settlement as _settlement, seaRoute as _seaRoute, edgeGates as _edgeGates, PER_MAP, TRAFFIC, round as _round, offMap as _offMap, buoyAt as _buoyAt, hashStr, KN };
