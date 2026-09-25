/* Guba Ledyanaya: a high-latitude coast in the polar night. A low tundra plateau (60-200 m, bald hills to ~450 m in
   the south-west) ends at the sea in granite cliffs and bouldery bays; a broad peninsula runs north in the west; a
   glacial fjord cuts 30 km south into the plateau with the naval base and its closed town on its east shore; an island
   stands out in the pack. The sea is frozen: fast ice along the shore (walkable near it), the flaw lead, 20 km of
   pack with its leads, the marginal ice zone, then open water in the north where the fleet waits. An icebreaker keeps
   a channel open from the flaw lead up the fjord to the base (world/ice.js draws and classifies all of it). */
import { carve, blur } from '../grid.js';
import { ss } from '../noise.js';
import { wind, lineField, labelLand } from '../lines.js';
import { roughness, coastSpawn, fleetSpawn, bestSite, allLand, shorePoint } from './common.js';
import { buildIceSpec, classGrid } from '../ice.js';

const K = 1000;
// the fjord: centre line (km, mouth first), half width at the waterline [mouth, head] (m), deepest floor (m)
const FJ = [
  { name: 'Guba Ledyanaya', pts: [[15.5, -12], [14, -19], [11.5, -25], [9, -31], [6.5, -36], [3.5, -41], [0, -46], [-3, -51]], w: [1900, 750], deep: -210 },
  { name: 'Guba Olenya', pts: [[9, -31], [13, -33.5], [17.5, -35]], w: [650, 380], deep: -70, branch: true },
];
// the island in the pack and a few islets off the fjord mouth: [x, z, a, b, rot, top]
const ISL = [[-33000, 9500, 5200, 2500, .55, 78], [21500, -15000, 900, 600, .3, 22], [8500, -15500, 650, 420, 1.1, 16], [-2500, -17000, 500, 350, .4, 12]];

export default {
  plan(ctx, P) {
    const { noise } = ctx, n = P.cols * P.rows, d = P.data;
    const lines = FJ.map((f, fi) => {
      const pts = wind(f.pts.map(p => [p[0] * K, p[1] * K]), 400, f.branch ? 700 : 1500, f.branch ? 5000 : 9000, noise, fi + 3);
      return {
        f, pts,
        attr: s => {
          const w = (f.w[0] + (f.w[1] - f.w[0]) * s) * (1 + .22 * noise.fbm(s * 6 + fi * 2.3, .7, 2));
          // a sill at the mouth (35-40 m: the base's ships clear it), a deep basin, a shoaling head
          let b = f.deep * (.18 + .82 * ss(.03, .22, s)) * (1 - .55 * ss(.72, 1, s));
          if (f.branch) b = f.deep * (.6 + .4 * ss(0, .3, s)) * (1 - .6 * ss(.6, 1, s));
          return [w, b, 0];
        },
      };
    });
    ctx.lines = lines;
    const LF = lineField(P, lines, 7000);
    const M = new Float32Array(n), cl = new Float32Array(n);
    for (let j = 0; j < P.rows; j++) for (let i = 0; i < P.cols; i++) {
      const x = P.x0 + i * P.cell, z = P.z0 + j * P.cell, k = j * P.cols + i;
      const r = land(ctx, x, z);
      M[k] = r[0]; cl[k] = r[1];
    }
    // rivers: the plateau drains north in shallow valleys that cut canyons through the coastal step
    for (let k = 0; k < n; k++) d[k] = Math.min(M[k], trough(LF.dist[k], LF.a0[k], LF.a1[k], M[k]));
    carve(d, P.cols, P.rows, 3.6, .48, 70, h => ss(0, 40, h), (i, j) => 3 * noise.fbm(i / 6, j / 6, 2));
    blur(cl, P.cols, P.rows, 2, 2);
    ctx.aux = { M, dist: LF.dist, w: LF.a0, b: LF.a1, cl };
  },

  fine(ctx, x, z, raw, cell) {
    const { fbm, ridged, billow, n2 } = ctx.noise, a = ctx.aux;
    let h = raw;
    if (h > -20) {
      const land = ss(-2, 8, h), hi = ss(120, 380, h);
      // moraine hummocks and boulder fields on the tundra, frost-shattered ridges on the bald hills
      h += land * ((1 - hi) * (4.5 * (billow(x / 520, z / 520, 3) - .45) + 1.6 * fbm(x / 140, z / 140, 2)) + hi * 22 * (ridged(x / 2200, z / 2200, 3) - .45));
      // glacially polished knobs along the coast (roches moutonnees)
      h += land * 6 * ss(4, 30, h) * (1 - ss(60, 140, h)) * Math.max(0, n2(x / 380 + 3, z / 610) - .15);
      // the granite cliffs: where the plan's cliffiness is high the coastal step stands up
      const c = ctx.sampleP(a.cl, x, z);
      if (c > .05 && h > 0 && h < 90) h += c * 26 * ss(0, 8, h) * (1 - ss(40, 90, h));
      if (h < 0 && h > -12) h += 1.2 * fbm(x / 300, z / 300, 2);
    } else h += 4 * fbm(x / 2500, z / 2500, 2);
    // the fjord walls at full resolution
    const d0 = ctx.sampleP(a.dist, x, z);
    if (d0 < 6000) {
      const w = ctx.sampleP(a.w, x, z), b = ctx.sampleP(a.b, x, z);
      const d = Math.max(0, d0 + 160 * fbm(x / 1100 - 3, z / 1100 + 5, 3) * ss(0, 700, d0));
      const t = trough(d, w, b, Math.max(ctx.sampleP(a.M, x, z), 30));
      if (t < h) h = t;
    }
    return h;
  },

  layout(ctx, A) {
    const L = ctx.lines, at = (li, s) => { const p = L[li].pts; return p[Math.min(p.length - 1, Math.max(0, Math.round(s * (p.length - 1))))]; };
    const places = [];
    const fm = at(0, .45);
    places.push({ name: 'Guba Ledyanaya', kind: 'fjord', x: fm[0], z: fm[1], road: false });
    const ob = at(1, .7);
    places.push({ name: 'Guba Olenya', kind: 'bay', x: ob[0], z: ob[1], road: false });
    // the naval base: the east shore of the fjord, 10-15 km in, gentle ground at the water
    const bs = at(0, .36);
    const base = bestSite(A, (x, z) => {
      if (!A.isLand(x, z) || A.coastDist(x, z) > 300) return -Infinity;
      const dx = x - bs[0], dz = z - bs[1];
      if (dx < 400 || Math.hypot(dx, dz) > 6000) return -Infinity;          // the east shore
      return -roughness(A, x, z, 450) * 14 - Math.abs(A.h(x, z) - 10) / 25 - Math.hypot(dx, dz) / 3000;
    }, { box: [bs[0] - 6000, bs[1] - 6000, bs[0] + 6000, bs[1] + 6000], stride: 1, edge: 0 }) || { x: bs[0] + 1500, z: bs[1] };
    // the water off the base (the harbour basin the icebreaker keeps open): the fjord's middle abreast of it
    let basin = null, bd = 1e9;
    for (const p of L[0].pts) { const dd = Math.hypot(p[0] - base.x, p[1] - base.z); if (dd < bd) { bd = dd; basin = p; } }
    const bw = [base.x + (basin[0] - base.x) * .55, base.z + (basin[1] - base.z) * .55];
    // capes: the peninsula's tip, the fjord mouth's east head
    const cape = (x, z, R, name) => {
      const c = bestSite(A, (px, pz) => A.isLand(px, pz) && A.coastDist(px, pz) < 300 ? A.seaFrac(px, pz, 2200) * 3 - Math.hypot(px - x, pz - z) / R : -Infinity, { box: [x - R, z - R, x + R, z + R], stride: 1, edge: 800 });
      if (c) places.push({ name, kind: 'cape', x: c.x, z: c.z, road: false });
      return c;
    };
    cape(-42000, 1500, 7000, 'Mys Studyony');
    cape(19000, -19000, 5000, 'Mys Vkhodnoy');
    // the island: its north-west head carries the light
    const [ix, iz] = ISL[0];
    const isl = A.peakNear(ix, iz, 4000);
    places.push({ name: 'Ostrov Medvezhiy', kind: 'island', x: isl[0], z: isl[1], road: false });
    const light = bestSite(A, (x, z) => A.isLand(x, z) && A.coastDist(x, z) < 400 && Math.hypot(x - ix, z - iz) < 7000 ? A.seaFrac(x, z, 1800) * 2 + (z - iz) / 4000 - (x - ix) / 9000 + A.h(x, z) / 60 : -Infinity,
      { box: [ix - 7000, iz - 5000, ix + 7000, iz + 5000], stride: 1, edge: 0 }) || { x: ix, z: iz + 2000 };
    // the east bay and its fishing port
    places.push({ name: 'Guba Vostochnaya', kind: 'bay', x: 40000, z: -24000, road: false });
    const rp = bestSite(A, (x, z) => {
      if (!A.isLand(x, z) || A.coastDist(x, z) > 300) return -Infinity;
      return -roughness(A, x, z, 400) * 10 - A.h(x, z) / 40 + A.shelter(x, z, 5000) * 2 - Math.hypot(x - 40000, z - 30000) / 8000;
    }, { box: [28000, -40000, 54000, -18000], stride: 1, edge: 3000 }) || { x: 40000, z: -30000 };
    // the battery: the plateau east of the peninsula's root, over the sea, rising ground behind
    const { lab, sizes } = labelLand(A.P.data, A.P.cols, A.P.rows);
    let ML = 1; for (let i = 2; i < sizes.length; i++) if (sizes[i] > sizes[ML]) ML = i;
    const coast = coastSpawn(A, [-36000, -24000, -14000, -9000], {
      maxCoast: 4200, wantRise: 150, r: 2500,
      score: (x, z) => lab[A.idx(x, z)] !== ML || A.h(x, z) < 12 ? -Infinity : Math.min(A.h(x, z), 80) / 50 - Math.hypot(x + 26000, z + 17000) / 8000,
    }) || { x: -26000, z: -18000, r: 2500, hdg: A.seaward(-26000, -18000) };
    // the depot: the village at the battery (the coast holds it from the start; see balance.js)
    const dep = { x: coast.x, z: coast.z };
    // the fleet in open water north of the ice, ~95 km off
    const fleet = fleetSpawn(A, 30000, 51000, 5000, [coast.x, coast.z], { clear: 8000, depth: -120 });
    // radar hill: the highest ground within reach of the battery and the sea
    let rh = null;
    { let best = -1; for (let k = 0; k < A.P.data.length; k++) { const [x, z] = A.xz(k); if (x < -50000 || x > -5000 || z < -42000 || z > -6000) continue; if (A.coastDist(x, z) > 14000) continue; const h = A.P.data[k]; if (h > best) { best = h; rh = [x, z, h]; } } }
    // the airfield: the flattest long stretch of the plateau south of the base
    const af = bestSite(A, (x, z) => {
      const h = A.h(x, z); if (h < 40 || h > 220 || A.coastDist(x, z) < 2500) return -Infinity;
      if (!allLand(A, x, z, 2400)) return -Infinity;
      return -roughness(A, x, z, 1500) * 45 - Math.hypot(x - 22000, z + 44000) / 15000;
    }, { box: [5000, -56000, 50000, -34000], stride: 2, jitter: .05, seed: 5 }) || { x: 25000, z: -45000 };
    // the highest bald hill
    let top = [0, 0, -1]; for (let k = 0; k < A.P.data.length; k++) if (A.P.data[k] > top[2]) { const [x, z] = A.xz(k); if (Math.abs(x) < 56000 && z > -57000) top = [x, z, A.P.data[k]]; }
    places.push(
      { name: 'Zapolyarsk', kind: 'town', x: base.x, z: base.z },
      { name: 'Rybnoye', kind: 'village', x: rp.x, z: rp.z },
      { name: 'Olenka', kind: 'village', x: dep.x, z: dep.z },
      { name: 'Pestsovy', kind: 'village', x: af.x + 2600, z: af.z - 1800 },
      { name: `Tundra Pestsovaya ${Math.round(top[2])}`, kind: 'peak', x: top[0], z: top[1], road: false },
    );
    if (rh) places.push({ name: `Gora Dozornaya ${Math.round(rh[2])}`, kind: 'peak', x: rh[0], z: rh[1], road: false });
    const objectives = [
      { id: 'OBJ 01', name: 'Port · Zapolyarsk naval base', kind: 'port', x: base.x, z: base.z, r: 1100 },
      { id: 'OBJ 02', name: `Radar hill · ${Math.round(rh[2])}`, kind: 'radar_hill', x: rh[0], z: rh[1], r: 900 },
      { id: 'OBJ 03', name: 'Depot · Olenka', kind: 'depot', x: dep.x, z: dep.z, r: 800 },
      { id: 'OBJ 04', name: 'Airfield · Pestsovy', kind: 'airfield', x: af.x, z: af.z, r: 1400 },
      { id: 'OBJ 05', name: 'Lighthouse · Ostrov Medvezhiy', kind: 'lighthouse', x: light.x, z: light.z, r: 600 },
      { id: 'OBJ 06', name: 'Port · Rybnoye', kind: 'port', x: rp.x, z: rp.z, r: 900 },
    ];
    ctx.base = { x: base.x, z: base.z, basin: bw };
    return {
      places, objectives,
      spawns: { coast, fleet },
      // the replenishment point in open water at the north edge, 35 km west of the fleet's station (balance, 12-16 seeds:
      // 13 km off the coast won 0 in 12; 58 km off 11 in 16; here 6 in 12: the destroyers sail along the ice to restock)
      replenish: { x: -5000, z: 55000, r: 4500 },
      pads: [
        { x: coast.x, z: coast.z, r: 450, r1: 1100 },
        { x: rh[0], z: rh[1], r: 220, r1: 550 },
        { x: af.x, z: af.z, r: 1300, r1: 2300 },
        { x: base.x, z: base.z, r: 200, r1: 480, quay: true },
        { x: rp.x, z: rp.z, r: 170, r1: 420, quay: true },
        { x: light.x, z: light.z, r: 90, r1: 220 },
      ],
      extra: { fjord: L[0].pts.map(p => [Math.round(p[0]), Math.round(p[1])]), base: { x: base.x, z: base.z, basin: bw } },
    };
  },

  /* the sea ice (after the fine heights): zones, the major leads, the icebreaker channel; the sim's class grid */
  ice(ctx, F, L) {
    const { W, H, noise } = ctx, { fbm } = noise;
    const heights = F.data, cols = F.cols, rows = F.rows, cell = F.cell;
    const zone = (x, z) => {
      const n1 = .5 + .5 * fbm(x / 21000 + 3.1, z / 21000, 3), n2 = .5 + .5 * fbm(x / 15000 - 2, z / 15000 + 6, 2);
      const n3 = .5 + .5 * fbm(x / 26000 + 7, z / 26000 - 1, 2), n4 = .5 + .5 * fbm(x / 18000 - 5, z / 18000 - 4, 2);
      const ef = 2600 + 3400 * n1, fl = ef + 1900 + 1500 * n2, ep = fl + 16000 + 6500 * n3, em = ep + 5500 + 4000 * n4;
      return { ef, fl, ep, em };
    };
    // a first spec without leads or channel: its distance-to-land grid steers them
    const base = L.extra.base, fj = L.extra.fjord;
    const S = [2300, 460, 70, 2.4];
    const spec0 = buildIceSpec(W, H, heights, cols, rows, cell, { seed: ctx.seed, zone, S });
    const G = spec0.g, DS = spec0.ds, DM = spec0.dm;
    const bilG = (A_, x, z) => { const fx = (x - G.x0) / G.cell, fz = (z - G.z0) / G.cell, i = Math.max(0, Math.min(G.cols - 2, fx | 0)), j = Math.max(0, Math.min(G.rows - 2, fz | 0)), u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j)), o = j * G.cols + i; return (A_[o] * (1 - u) + A_[o + 1] * u) * (1 - v) + (A_[o + G.cols] * (1 - u) + A_[o + G.cols + 1] * u) * v; };
    const dmAt = (x, z) => bilG(DM, x, z);
    const dsAt = (x, z) => { const fx = (x - G.x0) / G.cell, fz = (z - G.z0) / G.cell, i = Math.max(0, Math.min(G.cols - 2, fx | 0)), j = Math.max(0, Math.min(G.rows - 2, fz | 0)), u = fx - i, v = fz - j, o = j * G.cols + i; return (DS[o] * (1 - u) + DS[o + 1] * u) * (1 - v) + (DS[o + G.cols] * (1 - u) + DS[o + G.cols + 1] * u) * v; };
    // the major leads: from the marginal zone down the distance field to the flaw lead, wandering, zig-zagging
    const leads = [];
    const starts = [[-53000, 32000, 1500], [-14000, 27000, 1250], [18000, 23000, 1700], [47000, 19000, 1350]];
    starts.forEach(([sx, sz, w], li) => {
      let x = sx, z = sz;
      const zn = zone(x, z);
      // walk toward the coast until inside the marginal zone's inner edge, then on to the flaw lead
      const pts = [[x, z]];
      for (let it = 0; it < 400; it++) {
        const e = 300, gx = (dmAt(x + e, z) - dmAt(x - e, z)) / (2 * e), gz = (dmAt(x, z + e) - dmAt(x, z - e)) / (2 * e), gl = Math.hypot(gx, gz) || 1;
        const turn = .75 * fbm(it / 9 + li * 5.3, li * 1.7, 2) + .35 * Math.sin(it * 1.9 + li);
        const c = Math.cos(turn), s = Math.sin(turn), dx = -gx / gl, dz = -gz / gl;
        x += (dx * c - dz * s) * 350; z += (dx * s + dz * c) * 350;
        pts.push([x, z]);
        const q = zone(x, z), d = dmAt(x, z);
        if (d < (q.ef + q.fl) / 2 + 200) break;
      }
      // the lead's width breathes: narrows and polynyas
      const out = pts.map((p, i) => [p[0], p[1], w * (.8 + .45 * (.5 + .5 * fbm(i / 7 + li * 3.3, 2.2, 2)))]);
      // the start reaches back out into the marginal zone
      const a = out[0], b = out[Math.min(4, out.length - 1)], L2 = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      out.unshift([a[0] + (a[0] - b[0]) / L2 * 4000, a[1] + (a[1] - b[1]) / L2 * 4000, w * 1.3]);
      void zn;
      leads.push({ pts: out, w });
    });
    // a branch off the middle lead toward the fjord mouth
    {
      const m = leads[2].pts, p = m[Math.floor(m.length * .45)];
      const pts = [[p[0], p[1], 1100]];
      let x = p[0], z = p[1];
      for (let it = 0; it < 200; it++) {
        const dx = 15000 - x, dz = -15500 - z, dl = Math.hypot(dx, dz) || 1;
        x += dx / dl * 350 + 120 * Math.sin(it * 1.3); z += dz / dl * 350;
        pts.push([x, z, 1050 + 250 * Math.sin(it * .37)]);
        const q = zone(x, z); if (dmAt(x, z) < (q.ef + q.fl) / 2) break;
      }
      leads.push({ pts, w: 1100 });
    }
    // the icebreaker channel: the harbour basin off the base, down the fjord to its mouth, then out to the flaw lead
    let k0 = 0, bd = 1e9;
    for (let i = 0; i < fj.length; i++) { const dd = Math.hypot(fj[i][0] - base.basin[0], fj[i][1] - base.basin[1]); if (dd < bd) { bd = dd; k0 = i; } }
    const chan = [[base.basin[0], base.basin[1]]];
    for (let i = k0; i >= 0; i--) chan.push(fj[i]);
    {
      let [x, z] = chan[chan.length - 1];
      const [px, pz] = chan[Math.max(0, chan.length - 3)];
      let hx = x - px, hz = z - pz; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
      for (let it = 0; it < 80; it++) {
        const e = 300, gx = (dmAt(x + e, z) - dmAt(x - e, z)) / (2 * e), gz = (dmAt(x, z + e) - dmAt(x, z - e)) / (2 * e), gl = Math.hypot(gx, gz) || 1;
        hx = hx * .8 + gx / gl * .2; hz = hz * .8 + gz / gl * .2; const nl = Math.hypot(hx, hz) || 1; hx /= nl; hz /= nl;
        x += hx * 400; z += hz * 400; chan.push([x, z]);
        const q = zone(x, z); if (dmAt(x, z) > (q.ef + q.fl) / 2 + 300) break;
      }
    }
    const channel = smooth(chan, 3);
    const hRaw = (x, z) => { const fx = (x + W / 2) / cell, fz = (z + H / 2) / cell, i = Math.max(0, Math.min(cols - 2, fx | 0)), j = Math.max(0, Math.min(rows - 2, fz | 0)), u = fx - i, v = fz - j, o = j * cols + i; return (heights[o] * (1 - u) + heights[o + 1] * u) * (1 - v) + (heights[o + cols] * (1 - u) + heights[o + cols + 1] * u) * v; };
    // the base's piers: along the shore 750 m to the left of the port (its breakwater is on its right, looking out),
    // on the fine shoreline; the tugs keep their water open (a second basin), joined to the channel's basin
    const basins = [[base.basin[0], base.basin[1], 650]];
    {
      const out = Math.atan2(base.basin[0] - base.x, base.basin[1] - base.z), ox = Math.sin(out), oz = Math.cos(out), rx = Math.cos(out), rz = -Math.sin(out);
      let best = null;
      for (const off of [-760, -900, -620, 760, 900]) {
        let x = base.x + rx * off, z = base.z + rz * off;
        for (let k = 0; k < 60 && hRaw(x, z) > .6; k++) { x += ox * 25; z += oz * 25; }
        if (hRaw(x, z) > .6) continue;
        // back onto the land edge; water at least 12 m deep 150 m out
        x -= ox * 20; z -= oz * 20;
        if (hRaw(x + ox * 160, z + oz * 160) > -12 || hRaw(x - ox * 60, z - oz * 60) < 1) continue;
        best = { x, z, hdg: out, off }; break;
      }
      if (best) {
        base.piers = { x: Math.round(best.x), z: Math.round(best.z), hdg: out, quayL: 620, piers: [{ off: -210, L: 290 }, { off: -40, L: 330 }, { off: 130, L: 290 }] };
        basins.push([best.x + ox * 200, best.z + oz * 200, 560]);
      }
    }
    const spec = buildIceSpec(W, H, heights, cols, rows, cell, { seed: ctx.seed, zone, S, leads, channel, chW: 620, walk: 1500, basins });
    const cls = classGrid(spec, hRaw, W, H, 200);
    return { spec, cls };
  },
};

/* Chaikin, keeping the ends */
function smooth(P, it) {
  let Q = P;
  for (let k = 0; k < it; k++) {
    const N = [Q[0]];
    for (let i = 0; i < Q.length - 1; i++) { const a = Q[i], b = Q[i + 1]; if (i > 0) N.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25]); if (i < Q.length - 2) N.push([a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); }
    N.push(Q[Q.length - 1]); Q = N;
  }
  return Q;
}

/* the land: [height m, cliffiness 0..1]. The mainland south of a ragged coast with the peninsula in the west and the
   east bay; the islands; the tundra plateau and its bald hills; the shelf sloping north to 250-300 m */
function land(ctx, x, z) {
  const { fbm, ridged, billow } = ctx.noise;
  const wx = x + 3800 * fbm(x / 16000 + 1.3, z / 16000, 3) + 1100 * fbm(x / 4200, z / 4200 + 2, 3);
  const wz = z + 3800 * fbm(x / 16000 - 4, z / 16000 + 2.5, 3) + 1100 * fbm(x / 4200 + 6, z / 4200, 3);
  const zc = -22000 + 23500 * Math.exp(-(((wx + 42000) / 12500) ** 2)) - 9500 * Math.exp(-(((wx - 39000) / 9500) ** 2))
    + 4500 * Math.exp(-(((wx - 23000) / 5000) ** 2)) + 2400 * fbm(wx / 13000 + 8, 1.1, 3);
  let f = zc - wz;                                  // m inland of the coast (approx.)
  // the islands (ellipses with ragged shores)
  let fi = -1e9, top = 0;
  for (const [ix, iz, a, b, rot, tp] of ISL) {
    const dx = x - ix, dz = z - iz, c = Math.cos(rot), s = Math.sin(rot), u = (dx * c - dz * s) / a, v = (dx * s + dz * c) / b;
    const q = (1 - Math.sqrt(u * u + v * v)) * b + .28 * b * fbm(x / 1600 + ix / 1e4, z / 1600, 3);
    if (q > fi) { fi = q; top = tp; }
  }
  let h, cl = 0;
  const cliffy = ss(-.15, .35, fbm(x / 9000 + 5.5, z / 9000 - 1, 2));
  if (f > 0) {
    // coastal step (cliffs where cliffy), the plateau rising inland, the bald hills
    const step = cliffy * 34 * ss(0, 700, f) + (1 - cliffy) * (1.5 + Math.min(f, 1600) * .012);
    const plat = 55 * ss(900, 9000, f) + 70 * ss(6000, 32000, f);
    const hills = 330 * Math.exp(-(((x + 31000) / 15000) ** 2) - (((z + 45000) / 11000) ** 2)) * (.45 + .75 * ridged(x / 14000 + 2, z / 14000, 4))
      + 210 * Math.exp(-(((x - 38000) / 13000) ** 2) - (((z + 52000) / 9000) ** 2)) * (.5 + .6 * ridged(x / 11000 - 3, z / 11000 + 1, 4))
      + 120 * Math.exp(-(((x + 44000) / 8000) ** 2) - (((z + 6000) / 9000) ** 2)) * (.4 + .7 * ridged(x / 9000, z / 9000 + 4, 3));
    const roll = 26 * fbm(x / 7000, z / 7000, 4) * ss(500, 4000, f) + 14 * (billow(x / 3000, z / 3000, 3) - .4) * ss(300, 3000, f);
    h = step + plat * (1 - cliffy * .15) + hills * ss(1500, 12000, f) + roll;
    if (h < 1.2) h = 1.2 + f * .004;
    cl = cliffy * (1 - ss(1000, 3000, f));
  } else {
    // the shelf: 10-60 m near the coast, 150-300 m far out, banks and troughs
    const dd = -f;
    h = -(4 + dd * .02) * (1 - ss(6000, 30000, dd)) - (110 + 90 * ss(30000, 70000, dd)) * ss(6000, 30000, dd);
    h += 18 * fbm(x / 9000, z / 9000, 3) * ss(2000, 8000, dd);
    h = Math.min(h, -1.5 - dd * .004);
  }
  if (fi > 0) {
    const ih = 3 + top * ss(0, 1600, fi) * (.75 + .35 * fbm(x / 1800, z / 1800, 2));
    if (ih > h) { h = ih; cl = .8 * (1 - ss(200, 700, fi)); }
  } else if (fi > -3000 && h < 0) h = Math.max(h, -3 + fi * .02);
  return [h, cl];
}

/* U-shaped trough (fjord.js), walls to the plateau */
function trough(d, w, b, M) {
  if (d >= 7000 || w <= 0) return 1e9;
  if (b > -2) b = -2;
  const top = Math.max(M, 30);
  const frac = -b / (top - b);
  const Wt = w / Math.cbrt(frac);
  const s = d / Wt;
  if (s >= 1) return 1e9;
  return b + (top - b) * s * s * s;
}
