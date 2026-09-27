/* Ships: compartments, systems, flooding, fire and damage control (the rules: sim/README.md, "Ships: compartments,
   systems, flooding"). Deterministic, allocation-light, no draws of its own (a module's cook-off roll stays damage.js').

   Every ship with a subdivision (data/ship_layouts.js) carries u.ship:
     water[c]       m^3 of floodwater in space c          fire[c]   0..1 a fire's intensity (fireT: s burning)
     torn[k]        m^2 of boundary k torn open            door[k]   0 shut, 1 open (cruising), 2 blown; shore[k] m^2 shored
     holes          [{ c, x, y, z, r, A, A0, sea }]: the shell torn (model frame; A m^2 now, A0 when made)
     h[i]           0..1 the damage of system node i (a module's is u.mods, in its hp)
     ok[i]          node i works (intact, supplied)        caps      { token: bool }
     sink, list, trim (m, rad, rad), gm (m): the flooded ship's attitude; w (m^3 in her)
   A hit (shipHit, from damage.js applyDamage) is a charge at a point: the gas and shock of its space, the boundaries it
   tears (torn plating passes the blast and the water; doors and hatches blow at their pressures), then every node in
   reach: overpressure and impulse through what stands between (intact steel ~3 %, torn or open ~50 %), fragments on a
   line of sight, a fire in the space. A torpedo under the keel tears the bottom and shocks the machinery over it.
   The step (every SHIPK.step ticks, stepShips): orifice flow through the holes and the openings, the pumps, the
   stability (sinkage, list, trim from the floodwater's weight and moment, a free-surface penalty), fires growing,
   spreading and burning what is in them, damage control (fires, plugging holes, shoring, casualty power), the doors
   shut at general quarters, and the system graph re-walked when something changed. She founders when a deck edge goes
   under, capsizes past SHIPK.capsize or with no metacentric height left.
   Events: 'system' { unit, side, node, label, cls, state 'out' | 'restored', why ('blast' | 'frag' | 'fire' | 'flood' |
   'shock' | 'power' | 'supply'), caps (tokens lost / back), pos }, 'compartment' { unit, side, comp, label, state
   'breach' | 'flooding' | 'flooded' | 'dry' | 'fire' | 'fireout' | 'torn' }, 'foundered' { unit, side, why 'foundered' |
   'capsized' }. */
import { layoutOf, hasLayout, SEA, AIR } from '../data/ship_layouts.js';
import { SYSTEMS, TOL, MODCLS, SHIPK, chargeOf } from '../data/ship_systems.js';
import { COOK } from '../data/modules.js';
import { DT } from './consts.js';
import { toWorld } from './bodies.js';
import { hurtModule, moduleOut, kill } from './damage.js';

const G = 9.81, P0 = 101325, RHO = 1.025;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
/* Kinney-Graham free-air shock (the blast bench's, game/src/blast/phys.js) */
const kinneyPs = Z => { const a = Z / 4.5, b = Z / .048, c = Z / .32, d = Z / 1.35; return P0 * 808 * (1 + a * a) / Math.sqrt((1 + b * b) * (1 + c * c) * (1 + d * d)); };
const kinneyIs = (Z, W13) => .067 * Math.sqrt(1 + Math.pow(Z / .23, 4)) / (Z * Z * Math.cbrt(1 + Math.pow(Z / 1.55, 3))) * 100 * W13;
const reflect = Ps => 2 * Ps * (7 * P0 + 4 * Ps) / (7 * P0 + Ps);
const qsp = (W, V) => 2.25e6 * Math.pow(W / Math.max(1, V), .72);
const hash01 = (a, b) => { let h = Math.imul((a | 0) ^ Math.imul(b | 0, 0x9E3779B1), 0x85EBCA77); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

/* ================================================================== the compiled system spec per class */
const SPECS = new Map();
export function shipSpec(type) {
  if (SPECS.has(type)) return SPECS.get(type);
  const S = hasLayout(type) && SYSTEMS[type] ? compile(type) : null;
  SPECS.set(type, S);
  return S;
}
export { layoutOf };

function compile(type) {
  const L = layoutOf(type), D = SYSTEMS[type];
  // the ship's module table comes with the unit type; resolved lazily (units.js imports this module's importers)
  return { type, L, D, nodes: null, byId: null };
}
function resolve(sp, def) {
  if (sp.nodes) return sp;
  const L = sp.L, D = sp.D, nodes = [], byId = new Map();
  const boxOf = at => {
    if (Array.isArray(at)) return Float64Array.from(at);
    if (typeof at === 'string') {
      const [id, f] = at.split(':'), c = L.ids.indexOf(id);
      if (c < 0) throw new Error(`ship ${sp.type}: no space ${id}`);
      const fr = f.split(',').map(Number), b = L.box, o = c * 6;
      return Float64Array.from([0, 1, 2].flatMap(k => [b[o + k] + (b[o + k + 3] - b[o + k]) * fr[k]]).concat([0, 1, 2].map(k => b[o + k] + (b[o + k + 3] - b[o + k]) * fr[k + 3])));
    }
    return null;
  };
  const add = (o) => { o.i = nodes.length; nodes.push(o); byId.set(o.id, o); return o; };
  // modules
  const mc = MODCLS[sp.type] || {};
  for (const m of def.modules) {
    const cls = mc[m.id] || (m.cook ? 'mag' : m.slow ? 'mach' : m.disables && m.disables.some(k => k === 'radar' || k === 'scan' || k === 'sonar' || k === 'camera') ? 'array' : 'space');
    const x = (D.mods && D.mods[m.id]) || {};
    add({ id: m.id, label: m.label, cls, T: TOL[cls], box: Float64Array.from(m.box), pts: null, mod: m, pw: !!x.pw, needsSrc: x.needs || null });
  }
  for (const n of D.nodes) add({ id: n.id, label: n.label, cls: n.cls, T: TOL[n.cls], box: n.at.line ? null : boxOf(n.at), pts: n.at.line ? n.at.line.flat() : null, mod: null, pw: !!n.pw, needsSrc: n.needs || null });
  // cable ways: a segment between each pair of neighbouring watertight bulkheads
  const bz = [];
  for (let k = 0; k < L.bn; k++) if (L.bKind[k] === 'bulkhead') { const z = (L.bBox[k * 6 + 2] + L.bBox[k * 6 + 5]) / 2; if (!bz.some(v => Math.abs(v - z) < 1)) bz.push(z); }
  bz.sort((a, b) => a - b);
  const zs = [L.hydro.zmin + 2, ...bz.filter(z => z > L.hydro.zmin + 3 && z < L.hydro.zmax - 3), L.hydro.zmax - 2];
  const trunks = [];
  for (const [id, label, x, y] of D.power.trunks) {
    const segs = [];
    for (let s = 0; s < zs.length - 1; s++) {
      segs.push(add({ id: `cw${id}${s}`, label: `${label} · ${Math.round(zs[s])}…${Math.round(zs[s + 1])} m`, cls: 'cable', T: TOL.cable, box: null,
        pts: [x, y, zs[s], x, y, zs[s + 1]], mod: null, pw: false, needsSrc: null, trunk: trunks.length, seg: s }).i);
    }
    trunks.push({ id, label, x, y, segs });
  }
  sp.stations = zs; sp.trunks = trunks;
  const station = z => { let b = 0, bd = 1e9; for (let s = 0; s < zs.length; s++) { const d = Math.abs(zs[s] - z); if (d < bd) { bd = d; b = s; } } return b; };
  // geometry: centre, space(s), exposed area, the station it draws power at
  for (const n of nodes) {
    if (n.box) {
      const b = n.box, cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
      n.c = [cx, cy, cz];
      n.comp = L.at(cx, cy, cz);
      const dx = Math.max(.3, b[3] - b[0]), dy = Math.max(.3, b[4] - b[1]), dz = Math.max(.3, b[5] - b[2]);
      n.area = Math.min(25, (dx * dy + dy * dz + dx * dz) / 4);        // ~ its area presented to a burst
      const mx = Math.max(dx, dy, dz);
      n.big = mx > 8; n.bigAx = mx === dx ? 0 : mx === dy ? 1 : 2;
      n.route = null;
    } else {
      const P = n.pts, m = P.length / 3;
      let len = 0; const route = new Map();
      for (let s = 0; s < m - 1; s++) {
        const ax = P[s * 3], ay = P[s * 3 + 1], az = P[s * 3 + 2], bx = P[s * 3 + 3], by = P[s * 3 + 4], bzz = P[s * 3 + 5];
        const l = Math.hypot(bx - ax, by - ay, bzz - az), k = Math.max(1, Math.ceil(l));
        for (let q = 0; q < k; q++) { const f = (q + .5) / k, c = L.at(ax + (bx - ax) * f, ay + (by - ay) * f, az + (bzz - az) * f); if (c >= 0) route.set(c, (route.get(c) || 0) + l / k); }
        len += l;
      }
      n.route = [...route.entries()].map(([c, l]) => [c, l / Math.max(1e-6, len)]);
      n.c = [(P[0] + P[P.length - 3]) / 2, (P[1] + P[P.length - 2]) / 2, (P[2] + P[P.length - 1]) / 2];
      n.comp = n.route.length ? n.route[0][0] : AIR;
      n.area = Math.min(10, len * .15);
      n.big = false; n.bigAx = 2;
    }
    n.st = station(n.c[2]);
  }
  // needs: [[alt: [node indices or cap names]]]
  const parse = src => (src || []).map(e => e.split('|').map(a => a.split('+').map(id => byId.has(id) ? byId.get(id).i : id)));
  for (const n of nodes) n.needs = parse(n.needsSrc);
  sp.caps = {}; sp.capNames = Object.keys(D.caps);
  for (const k of sp.capNames) sp.caps[k] = parse(D.caps[k]);
  sp.gens = D.power.gens.map(id => byId.get(id).i);
  sp.buses = D.power.buses.map(([b, g]) => ({ bus: byId.get(b).i, gen: byId.has(g) ? byId.get(g).i : -1, st: nodes[byId.get(b).i].st }));
  sp.fire = (D.fire || []).map(id => byId.get(id).i);
  sp.steer = D.steer && byId.has(D.steer) ? byId.get(D.steer).i : -1;
  sp.prop = D.prop ? { total: D.prop.total, shafts: D.prop.shafts.map(s => ({ label: s.label, units: s.units.map(([id, k]) => [byId.get(id).i, k]), via: s.via.map(id => byId.get(id).i) })) } : null;
  sp.modNode = new Map(def.modules.map(m => [m.id, byId.get(m.id).i]));
  sp.propMods = new Set(D.prop ? D.prop.shafts.flatMap(s => s.units.map(([id]) => id)) : []);
  sp.nodes = nodes; sp.byId = byId;
  sp.nN = nodes.length;
  return sp;
}

/* ================================================================== per unit */
export function hasShip(u) { return !!u.ship; }
/* at spawn (sim.spawn): a ship class with a subdivision gets its state */
export function shipInit(sim, u) {
  const d = u.def;
  if (d.domain !== 'sea' || !hasLayout(u.type) || !SYSTEMS[u.type]) return;
  const sp = resolve(shipSpec(u.type), d), L = sp.L;
  const S = {
    sp, L, n: L.n,
    water: new Float64Array(L.n), fire: new Float32Array(L.n), fireT: new Float32Array(L.n), H: new Float64Array(L.n),
    torn: new Float32Array(L.bn), tornY: new Float32Array(2 * L.bn), door: new Uint8Array(L.bn), shore: new Float32Array(L.bn), doorT: new Float32Array(L.bn),
    holes: [], h: new Float32Array(sp.nN), ok: new Uint8Array(sp.nN).fill(1), why: new Array(sp.nN).fill(''), cas: new Float32Array(sp.nN),
    caps: {}, powered: new Uint8Array(sp.nN).fill(1), jn: null,
    sink: 0, list: 0, trim: 0, gm: L.hydro.GM, w: 0, xw: 0, zw: 0,
    gq: false, gqT: -1e9, lastHit: -1e9, lastThreat: -1e9, nextThreat: 0, dirty: true, active: false, cf: false, cfMark: new Uint8Array(L.n),
    flagged: new Uint8Array(L.n), prop: 1, steerK: 1, floodK: 1, lost: false, hits: 0, blastMs: 0,
  };
  for (const k of sp.capNames) S.caps[k] = true;
  // cruising (Yoke): some doors and hatches stand open
  for (let k = 0; k < L.bn; k++) if (L.bDoor[k] > 0 && hash01(u.id * 131 + 7, k) < SHIPK.yokeOpen) S.door[k] = 1;
  u.ship = S;
  evaluate(sim, u, S, '');
}

/* ================================================================== a hit */
const MQ = new Float64Array(3), SEG = new Int16Array(256);
/* a world point -> the ship's model frame (heading only: her own list and trim are small) */
function toModelShip(u, wx, wy, wz, out) {
  const dx = wx - u.pos[0], dy = wy - u.pos[1], dz = wz - u.pos[2], c = Math.cos(u.hdg), s = Math.sin(u.hdg);
  out[0] = dx * c - dz * s; out[1] = dy; out[2] = dx * s + dz * c;
  return out;
}

/* damage.js applyDamage: the charge of this hit on a ship with a subdivision. ev: the 'hit' event (kind, under, vel,
   burst / blast: a proximity burst). Returns true when it was taken here (modules included). */
export function shipHit(sim, u, dmg, src, pos, ev) {
  const S = u.ship;
  if (!S) return false;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const kind = ev && ev.target === u.id ? ev.kind : null;
  const C = chargeOf(kind, dmg);
  let fz = C.fz;
  if (ev && ev.target === u.id && ev.under) fz = 'under';
  else if (ev && ev.target === u.id && (ev.burst || ev.blast) && fz === 'in') fz = 'frag';
  // where it went off: a delayed fuze goes on a little way inside along its path
  const p = [0, 0, 0];
  if (pos) toModelShip(u, pos[0], pos[1], pos[2], p);
  else { const b = S.L.box; p[0] = 0; p[1] = 0; p[2] = 0; }
  // the sim's hit point is on its collision boxes (a box round the hull: at the ends and under the flare it stands off
  // the plating): the round goes on along its path to the real hull, and a delayed fuze a little way inside it
  if (fz !== 'frag' && fz !== 'under') {
    let dx = 0, dy = 0, dz = 0;
    const v = ev && ev.vel, l = v ? Math.hypot(v[0], v[1], v[2]) : 0;
    if (l > 1e-6) { toModelShip(u, u.pos[0] + v[0], u.pos[1] + v[1], u.pos[2] + v[2], MQ); dx = MQ[0] / l; dy = MQ[1] / l; dz = MQ[2] / l; }
    else if (Math.abs(p[0]) > 1) dx = -Math.sign(p[0]); else dy = -1;
    const L = S.L;
    if (L.at(p[0], p[1], p[2]) < 0) {
      for (let s = .25; s <= 16; s += .25) if (L.at(p[0] + dx * s, p[1] + dy * s, p[2] + dz * s) >= 0) { p[0] += dx * (s - .25); p[1] += dy * (s - .25); p[2] += dz * (s - .25); break; }
    }
    if (fz === 'in' && l > 1e-6) {
      // the hole it punches on the way in (its body, the petals round it): in the plating between the space it entered
      // and the outside
      const ci = L.at(p[0] + dx * .5, p[1] + dy * .5, p[2] + dz * .5);
      if (ci >= 0 && C.H) {
        const k = L.pair(ci, p[1] < 0 ? SEA : AIR) >= 0 ? L.pair(ci, p[1] < 0 ? SEA : AIR) : L.pair(ci, p[1] < 0 ? AIR : SEA);
        if (k >= 0 && S.torn[k] < C.H) { S.torn[k] = Math.max(S.torn[k], C.H); S.tornY[k * 2] = p[1] - .7; S.tornY[k * 2 + 1] = p[1] + .7; makeHole(sim, u, S, ci, k, p[0], p[1], p[2], C.H, L.bB[k]); }
      }
      const k = Math.min(COOK.pen, 1.6); p[0] += dx * k; p[1] += dy * k; p[2] += dz * k;
    }
  }
  // a round with no charge of its own (a unit hit by a script, a kinetic round): scaled from its damage
  const W = fz === 'gun' ? Math.max(.02, C.W) : Math.max(.05, C.W);
  S.lastHit = sim.t; S.hits++;
  if (fz === 'under') undex(sim, u, S, W, p, src);
  else blastAt(sim, u, S, W, C.F, C.pen, fz, p, src, 0);
  S.active = true;
  if (u.alive) evaluate(sim, u, S, 'hit');
  S.blastMs += (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  return true;
}

/* a cook-off inside her (damage.js cookoff 'heavy'): the module's contents as a charge at its centre */
export function shipCook(sim, u, m, dmg, src, depth) {
  const S = u.ship;
  if (!S) return false;
  const c = m.contents, b = m.box;
  const W = c ? Math.min(3000, (c.he || 0) * (c.det !== undefined ? c.det : .5) + .1 * ((c.he || 0) * (1 - (c.det || 0)) + (c.prop || 0)) + (c.vapour || 0) * 4) : dmg * 1.5;
  const p = [(b[0] + b[3]) / 2, b[4] - Math.min(2, (b[4] - b[1]) * .3), (b[2] + b[5]) / 2];
  blastAt(sim, u, S, Math.max(5, W), 200, 10, 'in', p, src, depth, m.id);
  const c0 = S.L.at(p[0], p[1], p[2]);
  if (c0 >= 0 && c && (c.fuel || c.prop)) { if (S.fire[c0] <= 0) fireStart(sim, u, S, c0); S.fire[c0] = 1; }
  S.active = true;
  if (u.alive) evaluate(sim, u, S, 'hit');
  return true;
}

/* the blast in her: gas and shock, boundaries torn, then every node in reach */
const GASC = new Int16Array(64), GASG = new Float64Array(64);
function blastAt(sim, u, S, W, F, pen, fz, p, src, depth, skip) {
  const L = S.L, sp = S.sp, W13 = Math.cbrt(W), px = p[0], py = p[1], pz = p[2];
  let c0 = L.at(px, py, pz);
  const inside = c0 >= 0;
  // outside (a contact, a shell, a proximity burst): the space behind the plating it met
  let skinK = -1;
  if (!inside) {
    let best = -1, bd = 1e9;
    for (let a = 0; a < 7; a++) {
      const ax = a === 0 ? -Math.sign(px || 1) : a === 1 ? 0 : a === 2 ? 0 : a === 3 ? Math.sign(px || 1) : 0, ay = a === 1 ? -1 : a === 4 ? 1 : 0, az = a === 2 ? -Math.sign(pz || 1) : 0;
      for (let s = .25; s <= 2.5; s += .25) {
        const c = L.at(px + ax * s, py + ay * s, pz + az * s);
        if (c >= 0) { if (s < bd) { bd = s; best = c; } break; }
      }
    }
    c0 = best;
    if (c0 >= 0) skinK = L.pair(c0, py < 0 ? SEA : AIR);
    if (skinK < 0 && c0 >= 0) skinK = L.pair(c0, py < 0 ? AIR : SEA);
  }
  // 1. gas in the space, boundaries torn, doors blown; the gas reaches the next spaces through what opened, in
  //    proportion to the opening (a door passes little of it, a torn deck most)
  let nG = 0, Veff = 0;
  if (c0 >= 0 && inside) { GASC[nG] = c0; GASG[nG++] = 1; Veff = L.vol[c0]; }
  let P0 = inside ? qsp(W, Veff) : 0;
  const tornNow = [], shellHit = [];
  const front = c0 >= 0 ? [c0] : [];
  for (let ring = 0; ring < 3 && front.length; ring++) {
    const next = [];
    for (const c of front) {
      const gi = gasIx(c, nG), Pgc = gi >= 0 ? P0 * GASG[gi] : 0;
      let shA = 0, shK = -1;
      for (const k of L.cb[c]) {
        if (!inside && k !== skinK) continue;                 // a burst outside meets only the plating it struck
        const o = L.bA[k] === c ? L.bB[k] : L.bA[k];
        const d = Math.max(.3, bndDist(L, k, px, py, pz));
        const Z = d / W13, t = Math.max(3, L.bT[k]);
        // the shock at the plate (reflected; through what stood between the charge and this space), the gas behind it
        const tr = ring === 0 ? 1 : SHIPK.trans;
        const Pr = reflect(kinneyPs(Math.max(.05, Z))) * tr;
        const P = Math.max(Pr, Pgc);
        // tearing: the plating within the scaled distance of the charge (inside / outside), or split by the gas
        let A = 0, yc = py;
        if (ring === 0 || Pgc > 0) {
          const zt = (inside ? SHIPK.zTearIn : SHIPK.zTearOut) * Math.sqrt(10 / t);
          const rT = zt * W13 * (ring === 0 ? 1 : .6);
          if (d < rT) A = Math.PI * (rT * rT - d * d);
          const pf = SHIPK.pGas * t;
          if (Pgc > pf) A = Math.max(A, L.bArea[k] * Math.min(.5, SHIPK.gasTear * Pgc / pf));
          A = Math.min(A, L.bArea[k] * .6);
          yc = Math.max(L.bBox[k * 6 + 1], Math.min(L.bBox[k * 6 + 4], py));
        }
        if (A > S.torn[k] + .05) {
          const was = S.torn[k];
          S.torn[k] = A; S.shore[k] = Math.min(S.shore[k], A * .5);
          const r = Math.sqrt(A / Math.PI);
          S.tornY[k * 2] = Math.max(L.bBox[k * 6 + 1], yc - r); S.tornY[k * 2 + 1] = Math.min(L.bBox[k * 6 + 4], yc + r);
          // (a space's shell is several boundaries, split at the waterline: one tear through it a blast)
          if (o < 0) { if (A > shA) { shA = A; shK = k; } }
          else if (was < .5 && A >= .5) tornNow.push(k);
        }
        if (o >= 0 && L.bDoor[k] > 0 && S.door[k] !== 2 && P > L.bDoorP[k]) S.door[k] = 2;
        if (o >= 0 && inside && Pgc > 0 && nG < 60) {
          const Ao = S.torn[k] + (S.door[k] > 0 ? L.bDoor[k] : 0) + L.bOpen[k];
          const g = Math.min(1, Ao / (.2 * Math.pow(L.vol[o], 2 / 3))) * GASG[gi];
          const go = gasIx(o, nG);
          if (g > .05 && go < 0) { GASC[nG] = o; GASG[nG++] = g; Veff += g * L.vol[o]; next.push(o); }
          else if (go >= 0 && g > GASG[go]) { Veff += (g - GASG[go]) * L.vol[o]; GASG[go] = g; }
        }
      }
      // a space's shell is several boundaries (split at the waterline): one tear through it a blast, the largest
      if (shK >= 0 && shellHit.indexOf(c) < 0) { shellHit.push(c); makeHole(sim, u, S, c, shK, px, py, pz, shA, L.bB[shK]); }
    }
    P0 = inside ? qsp(W, Veff) : 0;
    front.length = 0; for (const c of next) front.push(c);
  }
  for (const k of tornNow) sim.emit('compartment', { unit: u.id, side: u.side, comp: L.ids[L.bA[k]], label: `${L.names[L.bA[k]]} · ${L.bKind[k]} torn`, state: 'torn', to: L.bB[k] >= 0 ? L.ids[L.bB[k]] : null });
  // 2. fire where it went off (and where the gas went, less)
  if (c0 >= 0 && W >= 2 && (inside || W >= 10)) {
    const fuel = L.use[c0] === 'F' || L.use[c0] === 'J';
    const f0 = inside ? Math.min(1, .25 + W / 300 + (fuel ? .5 : 0)) : .25;
    if (f0 > S.fire[c0]) { if (S.fire[c0] <= 0) fireStart(sim, u, S, c0); S.fire[c0] = f0; }
    for (let g = 1; g < nG; g++) { const c = GASC[g]; if (GASG[g] > .5 && S.fire[c] < .2 && W >= 20) { if (S.fire[c] <= 0) fireStart(sim, u, S, c); S.fire[c] = .2; } }
  }
  // 3. the nodes
  const Rmax = SHIPK.reach * W13, tg = SHIPK.tGas, [wa, wb] = SHIPK.wreck;
  for (const n of sp.nodes) {
    if (n.id === skip) continue;
    const q = nearest(n, px, py, pz);
    const R = Math.max(.3, q[3]);
    const gasG = inside ? gasNode(n, nG) : 0;
    if (R > Rmax && gasG <= 0) continue;
    // a big node (an engine room, a hangar, a magazine block) is wrecked where the blast reaches it: its damage is
    // the mean over its nearest point, its middle and two points along its length
    let f = 0, why = '';
    if (n.big) {
      const b = n.box, ax = n.bigAx, qx = q[0], qy = q[1], qz = q[2];
      const wn = Math.min(.4, 6 / (b[ax + 3] - b[ax])), wo = (1 - wn) / 3;     // the nearest point counts less on a long one
      nodeAt(n, qx, qy, qz, px, py, pz, W13, Rmax, gasG, P0, F, pen, S, wn);
      for (let s = 0; s < 3; s++) {
        SP3[0] = n.c[0]; SP3[1] = n.c[1]; SP3[2] = n.c[2];
        if (s) SP3[ax] = b[ax] + (b[ax + 3] - b[ax]) * (s === 1 ? .25 : .75);
        nodeAt(n, SP3[0], SP3[1], SP3[2], px, py, pz, W13, Rmax, gasG, P0, F, pen, S, wo);
      }
      f = NF[0]; why = NF[1] > NF[2] ? 'frag' : 'blast';
      NF[0] = NF[1] = NF[2] = 0;
    } else {
      nodeAt(n, q[0], q[1], q[2], px, py, pz, W13, Rmax, gasG, P0, F, pen, S, 1);
      f = NF[0]; why = NF[1] > NF[2] ? 'frag' : 'blast';
      NF[0] = NF[1] = NF[2] = 0;
    }
    if (f > .01) damageNode(sim, u, S, n, f, why, src, depth);
    if (!u.alive) return;
  }
  S.dirty = true;
}
/* the damage (NF[0] += w x f; NF[1] frag share, NF[2] blast share) at a node's point from the charge: overpressure and
   impulse through what stands between (intact plating ~3 %, torn or open ~50 %), the gas of its space, fragments on
   the line (through plating thinner than pen) */
const NF = [0, 0, 0], SP3 = [0, 0, 0];
function nodeAt(n, qx, qy, qz, px, py, pz, W13, Rmax, gasG, P0, F, pen, S, w) {
  const R = Math.max(.3, Math.hypot(qx - px, qy - py, qz - pz));
  const T = pathT(S, px, py, pz, qx, qy, qz, pen);
  let Pn = 0, In = 0;
  if (R <= Rmax) { const Z = R / W13; Pn = kinneyPs(Z) * SHIPK.refl * T[0]; In = kinneyIs(Z, W13) * SHIPK.refl * T[0]; }
  if (gasG > 0) { Pn = Math.max(Pn, P0 * gasG); In = Math.max(In, P0 * gasG * SHIPK.tGas); }
  const Tn = n.T, D = Math.min(Pn / Tn.P, In / Tn.I), [wa, wb] = SHIPK.wreck;
  const fb = D > wa ? Math.min(4, (D - wa) / wb) : 0;            // (past 1: a blast that overwhelms an armoured module)
  let ff = 0;
  if (F > 0 && T[1] > 0) { ff = F * n.area / (4 * Math.PI * R * R) * T[1] * Tn.frag; if (ff <= .02) ff = 0; }
  NF[0] += w * (fb + ff); NF[1] += w * ff; NF[2] += w * fb;
}
function gasIx(c, nG) { for (let g = 0; g < nG; g++) if (GASC[g] === c) return g; return -1; }
/* the gas share at a node (a cable way: the most of the spaces on its route) */
function gasNode(n, nG) {
  if (n.route) { let m = 0; for (const [c, sh] of n.route) { const g = gasIx(c, nG); if (sh > .1 && g >= 0 && GASG[g] > m) m = GASG[g]; } return m; }
  const g = n.comp >= 0 ? gasIx(n.comp, nG) : -1;
  return g >= 0 ? GASG[g] : 0;
}
/* the distance from a point to a boundary: the shell's from the hull surface (its box spans both sides), others' box */
function bndDist(L, k, x, y, z) {
  if (L.bKind[k] === 'shell' && L.bB[k] < 0 && L.at(x, y, z) >= 0) {
    const o = k * 6, zc = Math.max(L.bBox[o + 2], Math.min(L.bBox[o + 5], z)), dz = Math.abs(z - zc);
    const hb = L.hb(zc, y), side = hb > 0 ? hb - Math.abs(x) : 1e9, bot = y - L.keel(zc), top = y < 0 ? 1e9 : L.deck(zc) - y;
    let d = Math.min(side, bot, L.bBox[o + 4] > L.deck(zc) - .5 ? top : 1e9);
    if (y > L.bBox[o + 4] + .5) d = Math.max(d, y - L.bBox[o + 4]);
    if (y < L.bBox[o + 1] - .5) d = Math.max(d, L.bBox[o + 1] - y);
    return Math.hypot(Math.max(0, d), dz);
  }
  return boxDist(L.bBox, k * 6, x, y, z);
}
function boxDist(B, o, x, y, z) {
  let dd = 0, v;
  v = B[o] - x; if (v > 0) dd += v * v; else { v = x - B[o + 3]; if (v > 0) dd += v * v; }
  v = B[o + 1] - y; if (v > 0) dd += v * v; else { v = y - B[o + 4]; if (v > 0) dd += v * v; }
  v = B[o + 2] - z; if (v > 0) dd += v * v; else { v = z - B[o + 5]; if (v > 0) dd += v * v; }
  return Math.sqrt(dd);
}
/* the nearest point of a node to a point: [x, y, z, distance] */
const NQ = [0, 0, 0, 0];
function nearest(n, x, y, z) {
  if (n.box) {
    const b = n.box;
    NQ[0] = x < b[0] ? b[0] : x > b[3] ? b[3] : x; NQ[1] = y < b[1] ? b[1] : y > b[4] ? b[4] : y; NQ[2] = z < b[2] ? b[2] : z > b[5] ? b[5] : z;
  } else {
    const P = n.pts, m = P.length / 3;
    let bd = 1e18;
    for (let s = 0; s < m - 1; s++) {
      const ax = P[s * 3], ay = P[s * 3 + 1], az = P[s * 3 + 2], dx = P[s * 3 + 3] - ax, dy = P[s * 3 + 4] - ay, dz = P[s * 3 + 5] - az;
      const l2 = dx * dx + dy * dy + dz * dz, t = l2 > 0 ? sat(((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / l2) : 0;
      const qx = ax + dx * t, qy = ay + dy * t, qz = az + dz * t, d = (qx - x) ** 2 + (qy - y) ** 2 + (qz - z) ** 2;
      if (d < bd) { bd = d; NQ[0] = qx; NQ[1] = qy; NQ[2] = qz; }
    }
  }
  NQ[3] = Math.hypot(NQ[0] - x, NQ[1] - y, NQ[2] - z);
  return NQ;
}
/* the blast and fragment transmission along a line (the spaces it crosses; each boundary: torn or open -> trans,
   intact -> wall; fragments through plating up to pen mm, a torn one freely) */
const PT = [1, 1];
function pathT(S, ax, ay, az, bx, by, bz, pen) {
  const L = S.L, len = Math.hypot(bx - ax, by - ay, bz - az), k = Math.min(250, Math.max(1, Math.ceil(len / .5)));
  let tb = 1, tf = 1, prev = L.at(ax, ay, az);
  for (let s = 1; s <= k; s++) {
    const f = s / k, c = L.at(ax + (bx - ax) * f, ay + (by - ay) * f, az + (bz - az) * f);
    if (c === prev) continue;
    const kb = L.pair(prev, c);
    if (kb >= 0) {
      // the open share of the boundary (torn plating, a blown or open door, the uptakes) passes the blast at trans and
      // fragments freely; the rest is plating (fragments through what is thinner than pen)
      const sh = Math.min(1, (S.torn[kb] + (S.door[kb] > 0 ? L.bDoor[kb] : 0) + L.bOpen[kb]) / Math.max(1, L.bArea[kb] * .3));
      tb *= SHIPK.wall + (SHIPK.trans - SHIPK.wall) * sh;
      const pl = L.bT[kb] > pen ? .1 : .4;
      tf *= pl + (1 - pl) * sh;
    } else if (prev >= 0 || c >= 0) { tb *= SHIPK.wall; tf *= .3; }   // outside -> inside across plating not in the table
    prev = c;
    if (tb < 1e-4 && tf < 1e-3) break;
  }
  PT[0] = tb; PT[1] = tf;
  return PT;
}

/* a torpedo under her keel: the bottom torn under it, the shock whipping the machinery over it */
function undex(sim, u, S, W, p, src) {
  const L = S.L, W13 = Math.cbrt(W), r = SHIPK.zTearUnder * W13, x = p[0], z = p[2];
  for (let c = 0; c < L.n; c++) {
    const b = L.box, o = c * 6;
    if (L.kind[c] === 'house' || b[o + 2] > z + r || b[o + 5] < z - r) continue;
    // the lowest spaces over the burst: their bottom (the shell under them) opens over the length it spans
    const k = L.pair(c, SEA);
    if (k < 0 || L.bBox[k * 6 + 1] > L.keel(z) + 2.5) continue;
    const zl = Math.max(b[o + 2], z - r), zh = Math.min(b[o + 5], z + r), span = Math.max(0, zh - zl);
    if (span <= 0) continue;
    const A = Math.min(L.bArea[k] * .6, span * Math.min(2 * r, b[o + 3] - b[o]) * .7);
    if (A > S.torn[k]) { S.torn[k] = A; S.tornY[k * 2] = L.keel(z); S.tornY[k * 2 + 1] = L.keel(z) + Math.min(3, r); makeHole(sim, u, S, c, k, x * .3, L.keel(z) + .5, (zl + zh) / 2, A, SEA); }
  }
  // the shock: every node within reach, heavy machinery shaken off its seats
  for (const n of S.sp.nodes) {
    const q = nearest(n, x, p[1], z), R = Math.max(1, q[3]);
    const idx = SHIPK.shockUnder * W13 / R;
    const f = sat((idx * (n.cls === 'heavy' || n.cls === 'mag' ? .5 : n.cls === 'elec' || n.cls === 'array' ? 1.4 : 1) - .6) / .8);
    if (f > .01) damageNode(sim, u, S, n, f, 'shock', src, 0);
    if (!u.alive) return;
  }
  S.dirty = true;
}

function makeHole(sim, u, S, c, k, px, py, pz, A, out, depth) {
  const L = S.L;
  let r = Math.sqrt(A / Math.PI);
  // on the plating: the side (half-breadth at the point) or the bottom, whichever is nearer
  let hx = px, hy = py, hz = pz;   // (hy may move: the part of the tear in this space)
  const bz = L.bBox, o = k * 6;
  hz = Math.max(bz[o + 2], Math.min(bz[o + 5], pz));
  if (L.bAx[k] === 1 || (bz[o + 4] - bz[o + 1]) < 1) { hy = (bz[o + 1] + bz[o + 4]) / 2; }
  else { hy = Math.max(bz[o + 1], Math.min(bz[o + 4], py)); const hb = L.hb(hz, hy); hx = (px < 0 ? -1 : 1) * (hb > 0 ? hb : Math.abs(px)); }
  // a tear wider than the space's side runs on into the space above or below (its own plating, its own hole)
  const y0 = L.box[c * 6 + 1], y1 = L.box[c * 6 + 4];
  if (!depth && L.bAx[k] !== 1) for (const dir of [-1, 1]) {
    const edge = dir < 0 ? y0 : y1, over = dir < 0 ? edge - (hy - r) : (hy + r) - edge;
    if (over < .3) continue;
    const c2 = L.at(hx - Math.sign(hx) * .6, edge + dir * .4, hz);
    if (c2 < 0 || c2 === c) continue;
    const k2 = L.pair(c2, edge + dir * .4 < 0 ? SEA : AIR) >= 0 ? L.pair(c2, edge + dir * .4 < 0 ? SEA : AIR) : L.pair(c2, edge + dir * .4 < 0 ? AIR : SEA);
    if (k2 < 0) continue;
    const share = Math.min(.5, over / (2 * r)), A2 = A * share;
    if (A2 < .05) continue;
    S.torn[k2] = Math.max(S.torn[k2], A2);
    makeHole(sim, u, S, c2, k2, hx, edge + dir * Math.min(over, r) * .5, hz, A2, L.bB[k2], 1);
    A -= A2; r = Math.sqrt(A / Math.PI);
    hy = dir < 0 ? Math.max(hy, y0 + r * .8) : Math.min(hy, y1 - r * .8);
  }
  // merge with a hole already in this space's plating nearby (it grows, and reaches lower)
  let h = null;
  for (const o of S.holes) if (o.c === c && Math.hypot(o.x - hx, o.y - hy, o.z - hz) < o.r + r) { h = o; break; }
  if (h) {
    const A2 = Math.min(L.bArea[k] * .6, Math.max(h.A0, A) + Math.min(h.A0, A) * .5), r2 = Math.sqrt(A2 / Math.PI);
    const lo = Math.min(h.y - h.r, hy - r), hi = Math.max(h.y + h.r, hy + r);
    h.A0 = A2; h.A = Math.max(h.A, A2); h.r = r2; h.y = Math.max(lo + r2, Math.min(hi - r2, (lo + hi) / 2));
  } else S.holes.push(h = { c, k, x: hx, y: hy, z: hz, r, A, A0: A, sea: false, low: false, told: 0 });
  // (the part of it in this space's side: the space's floor is its lowest point)
  const bot = Math.max(y0, h.y - h.r);
  h.sea = h.sea || out === SEA || bot < .5;
  if (bot < .5 && h.A0 > (h.told || 0) * 1.5) { h.low = true; h.told = h.A0; sim.emit('compartment', { unit: u.id, side: u.side, comp: L.ids[c], label: L.names[c], state: 'breach', A: +h.A0.toFixed(1), below: bot < 0 }); }
}

/* damage f (0..1 of it) to a node: a module takes it in its hp (damage.js: cook-off rolls, 'module' event) */
function damageNode(sim, u, S, n, f, why, src, depth) {
  if (n.mod) {
    const m = n.mod;
    if (u.mods[m.id] >= m.hp) return;
    S.why[n.i] = why;
    hurtModule(sim, u, m, Math.min(1, f * (1 - (m.armor || 0))) * m.hp, src, depth);
  } else {
    if (S.h[n.i] >= 1) return;
    S.h[n.i] = Math.min(1, S.h[n.i] + f);
    if (S.h[n.i] >= 1) S.why[n.i] = why;
  }
  S.dirty = true;
}
function nodeDamage(u, S, n) { return n.mod ? Math.min(1, u.mods[n.mod.id] / n.mod.hp) : S.h[n.i]; }
export function nodeState(u, n) { const S = u.ship; return { dmg: nodeDamage(u, S, n), ok: !!S.ok[n.i], why: S.why[n.i] }; }

function fireStart(sim, u, S, c) {
  S.fireT[c] = 0;
  sim.emit('compartment', { unit: u.id, side: u.side, comp: S.L.ids[c], label: S.L.names[c], state: 'fire' });
}

/* ================================================================== the system graph */
/* intact -> generators -> switchboards and cable ways (power) -> nodes (their needs) -> capabilities */
const JN = new Uint8Array(2048), QU = new Int16Array(2048);
function evaluate(sim, u, S, cause) {
  const sp = S.sp, nodes = sp.nodes, nN = nodes.length, L = S.L;
  const intact = S._intact || (S._intact = new Uint8Array(nN));
  for (let i = 0; i < nN; i++) {
    const n = nodes[i];
    let ok = nodeDamage(u, S, n) < 1;
    if (ok && n.T.flood && n.comp >= 0 && !n.route) {
      const c = n.comp, lv = level(S, c), b = n.box;
      if (lv > (b[1] + b[4]) / 2) { ok = false; if (!S.why[i] || S.why[i] === 'power' || S.why[i] === 'supply') S.why[i] = 'flood'; }
    }
    intact[i] = ok ? 1 : 0;
  }
  // power: generators feed their switchboards; energy runs along intact cable way segments and through intact
  // switchboards (each ties the cable ways at its station together)
  const nT = sp.trunks.length, nS = sp.stations.length;
  JN.fill(0, 0, nT * nS);
  let qh = 0, qt = 0;
  const busOn = S._busOn || (S._busOn = new Uint8Array(sp.buses.length));
  busOn.fill(0);
  const needsOk = (i, okA) => {
    const nd = nodes[i].needs;
    for (let a = 0; a < nd.length; a++) {
      const alts = nd[a];
      let any = false;
      for (let b = 0; b < alts.length && !any; b++) {
        const all = alts[b];
        let good = true;
        for (let q = 0; q < all.length && good; q++) { const r = all[q]; good = typeof r === 'number' ? !!okA[r] : !!S.caps[r]; }
        any = good;
      }
      if (!any) return false;
    }
    return true;
  };
  const ok = S._ok || (S._ok = new Uint8Array(nN));
  for (let i = 0; i < nN; i++) ok[i] = intact[i];
  // generators: intact and their needs (a first pass without power)
  for (const g of sp.gens) ok[g] = intact[g] && needsOk(g, intact) ? 1 : 0;
  const light = (b) => {
    busOn[b] = 1;
    const st = sp.buses[b].st;
    for (let t = 0; t < nT; t++) { const j = t * nS + st; if (!JN[j]) { JN[j] = 1; QU[qt++] = j; } }
  };
  for (let b = 0; b < sp.buses.length; b++) { const B = sp.buses[b]; if (intact[B.bus] && B.gen >= 0 && ok[B.gen]) light(b); }
  while (qh < qt) {
    const j = QU[qh++], t = (j / nS) | 0, s = j - t * nS, segs = sp.trunks[t].segs;
    // along the trunk
    if (s > 0 && intact[segs[s - 1]] && !JN[j - 1]) { JN[j - 1] = 1; QU[qt++] = j - 1; }
    if (s < nS - 1 && intact[segs[s]] && !JN[j + 1]) { JN[j + 1] = 1; QU[qt++] = j + 1; }
    // a switchboard here ties the trunks
    for (let b = 0; b < sp.buses.length; b++) if (!busOn[b] && sp.buses[b].st === s && intact[sp.buses[b].bus]) light(b);
  }
  const powered = S.powered;
  for (let i = 0; i < nN; i++) {
    const n = nodes[i];
    if (!n.pw) { powered[i] = 1; continue; }
    let p = 0;
    for (let t = 0; t < nT && !p; t++) if (JN[t * nS + n.st]) p = 1;
    if (!p && S.cas[i] < 0) p = 1;                                    // casualty power rigged
    powered[i] = p;
  }
  for (let b = 0; b < sp.buses.length; b++) ok[sp.buses[b].bus] = intact[sp.buses[b].bus] && busOn[b] ? 1 : 0;
  // nodes: intact, powered, their needs (a few passes: needs reach through other nodes and capabilities)
  for (let pass = 0; pass < 4; pass++) {
    let ch = false;
    for (let i = 0; i < nN; i++) {
      if (sp.gens.includes(i) || nodes[i].trunk !== undefined) continue;
      if (sp.buses.some(B => B.bus === i)) continue;
      const v = intact[i] && powered[i] && needsOk(i, ok) ? 1 : 0;
      if (v !== ok[i]) { ok[i] = v; ch = true; }
    }
    for (const k of sp.capNames) {
      const nd = sp.caps[k];
      let good = true;
      for (let a = 0; a < nd.length && good; a++) {
        let any = false;
        for (const all of nd[a]) { let g = true; for (const r of all) g = g && (typeof r === 'number' ? !!ok[r] : r === k ? false : !!S.caps[r]); if (g) { any = true; break; } }
        good = any;
      }
      if (good !== S.caps[k]) { S.caps[k] = good; ch = true; }
    }
    if (!ch) break;
  }
  // what changed: events, tokens, propulsion, steering
  const lostCaps = [], backCaps = [];
  for (const k of sp.capNames) {
    const off = !S.caps[k];
    if (off && !u.off[k]) { u.off[k] = true; lostCaps.push(k); }
    else if (!off && u.off[k]) { u.off[k] = false; backCaps.push(k); }
  }
  let first = true;
  for (let i = 0; i < nN; i++) {
    if (ok[i] === S.ok[i]) continue;
    const n = nodes[i];
    const why = !intact[i] ? (S.why[i] || cause || 'blast') : !powered[i] ? 'power' : 'supply';
    if (!ok[i]) S.why[i] = why;
    if (cause !== '') sim.emit('system', { unit: u.id, side: u.side, node: n.id, label: n.label, cls: n.cls, state: ok[i] ? 'restored' : 'out', why: ok[i] ? '' : why,
      caps: first ? (ok[i] ? backCaps : lostCaps) : [], pos: toWorld(u, n.c[0], n.c[1], n.c[2], [0, 0, 0]) });
    first = false;
    S.ok[i] = ok[i];
  }
  if (cause !== '' && first && (lostCaps.length || backCaps.length)) sim.emit('system', { unit: u.id, side: u.side, node: null, label: null, cls: null, state: lostCaps.length ? 'out' : 'restored', why: '', caps: lostCaps.length ? lostCaps : backCaps, pos: u.pos.slice() });
  if (u.off.radar && u.radarOn) sim.setRadar(u, false, true);
  // propulsion: the power left on the shafts (speed ~ its cube root); steering
  if (sp.prop) {
    let P = 0, lines = 0;
    for (const sh of sp.prop.shafts) {
      let via = true; for (const v of sh.via) via = via && !!ok[v];
      if (!via) continue;
      let k = 0; for (const [ix, cnt] of sh.units) if (ok[ix]) k += cnt;
      if (k > 0) { P += k; lines++; }
    }
    S.prop = P <= 0 ? 0 : Math.cbrt(P / sp.prop.total) * (lines < sp.prop.shafts.length ? .95 : 1);
  } else S.prop = 1;
  S.steerK = sp.steer >= 0 && !ok[sp.steer] ? .35 : 1;
  applySpeed(u, S);
  S.dirty = false;
}
export function applySpeed(u, S) { u.sysK = S.prop * S.floodK; u.slowK = u.slowB * u.sysK; u.steerK = S.steerK; }

/* ================================================================== the step: flooding, fire, damage control */
export function stepShips(sim) {
  const list = sim.list(), dt = SHIPK.step * DT;
  for (let i = 0; i < list.length; i++) {
    const u = list[i], S = u.ship;
    if (!S || !u.alive) continue;
    gqWatch(sim, u, S);
    if (!S.active) continue;
    stepShip(sim, u, S, dt);
  }
}

/* general quarters: she has fired, been hit, or a hostile round is near: the open doors are shut over the next minutes;
   15 quiet minutes and she goes back to cruising */
function gqWatch(sim, u, S) {
  const t = sim.t;
  if (t >= S.nextThreat) {
    S.nextThreat = t + 2 + (u.id % 7) * .05;
    for (const p of sim.projectiles.values()) {
      if (p.side === u.side || !p.P.threat) continue;
      const dx = p.pos[0] - u.pos[0], dz = p.pos[2] - u.pos[2];
      if (dx * dx + dz * dz < 4e8) { S.lastThreat = t; break; }
    }
  }
  const hot = t - u.lastFire < SHIPK.gqHold || t - S.lastHit < SHIPK.gqHold || t - S.lastThreat < SHIPK.gqHold;
  if (hot && !S.gq) { S.gq = true; S.gqT = t; S.active = true; }
  else if (!hot && S.gq) {
    S.gq = false;
    const L = S.L;
    for (let k = 0; k < L.bn; k++) if (L.bDoor[k] > 0 && S.door[k] === 0 && hash01(u.id * 131 + 7, k) < SHIPK.yokeOpen && S.water[L.bA[k]] <= 0 && (L.bB[k] < 0 || S.water[L.bB[k]] <= 0)) S.door[k] = 1;
  }
}

function level(S, c) { const L = S.L, o = c * 6; return L.box[o + 1] + S.water[c] / Math.max(1e-6, L.perm[c] * L.floorA[c]); }
/* the sea surface in her frame at (x, z) */
function seaAt(u, S, x, z) {
  if (u.def.sub && u.depth > u.def.draught + .5) return u.depth - u.def.draught;
  return S.sink - z * Math.sin(S.trim) + x * Math.sin(S.list);
}
/* flow (m^3/s, + from a to b) through an opening spanning [yb, yt] between heads Ha and Hb */
function orifice(cd, A, yb, yt, Ha, Hb) {
  if (A <= 0) return 0;
  let sg = 1;
  if (Ha < Hb) { const t = Ha; Ha = Hb; Hb = t; sg = -1; }
  if (Ha <= yb) return 0;
  const top = Math.min(Ha, yt), fa = yt > yb + 1e-3 ? (top - yb) / (yt - yb) : 1;
  const hd = Ha - Math.max(Hb, (yb + top) / 2);
  return hd > 0 ? sg * cd * A * fa * Math.sqrt(2 * G * hd) : 0;
}

const FLOW = new Float64Array(512);
function stepShip(sim, u, S, dt) {
  const L = S.L, n = L.n, W = S.water, H = S.H, sp = S.sp, t = sim.t;
  // doors shut at general quarters (each at its own time)
  if (S.gq && t - S.gqT < SHIPK.zebra[1] + 1) for (let k = 0; k < L.bn; k++) if (S.door[k] === 1 && t - S.gqT > SHIPK.zebra[0] + hash01(u.id * 977 + 3, k) * (SHIPK.zebra[1] - SHIPK.zebra[0])) S.door[k] = 0;
  // dry, nothing open to the sea, nothing burning: only the doors and the system graph (casualty power) to mind
  let wet = false;
  for (let c = 0; c < n && !wet; c++) if (W[c] > 0) wet = true;
  for (let i = 0; i < S.holes.length && !wet; i++) { const h = S.holes[i]; if (h.A > .005 && h.y - h.r < seaAt(u, S, h.x, h.z) + 1.5) wet = true; }
  let burning = false;
  for (let c = 0; c < n && !burning; c++) if (S.fire[c] > 0) burning = true;
  if (!wet && !burning) {
    quiet(sim, u, S, dt, t);
    return;
  }
  // heads: a space's water level; a full space passes on the head of what fills it
  for (let c = 0; c < n; c++) H[c] = level(S, c);
  for (let pass = 0; pass < 2; pass++) for (let c = 0; c < n; c++) {
    if (W[c] < L.vol[c] * L.perm[c] * .995) continue;
    let h = L.box[c * 6 + 4];
    for (const hl of S.holes) if (hl.c === c && hl.A > 0) h = Math.max(h, seaAt(u, S, hl.x, hl.z));
    for (const k of L.cb[c]) { const o = L.bA[k] === c ? L.bB[k] : L.bA[k]; if (o >= 0 && openArea(S, k) > 0) h = Math.max(h, Math.min(H[o], H[o])); }
    H[c] = h;
  }
  const fl = FLOW.length >= n ? FLOW : new Float64Array(n);
  fl.fill(0, 0, n);
  let inflow = 0;
  // the sea through the holes
  for (const h of S.holes) {
    if (h.A <= .005) continue;
    const c = h.c, yb = Math.max(L.box[c * 6 + 1], h.y - h.r), yt = Math.min(L.box[c * 6 + 4], h.y + h.r);
    const q = orifice(SHIPK.cd, h.A, yb, Math.max(yb, yt), seaAt(u, S, h.x, h.z), H[c]);
    fl[c] += q; if (q > 0) inflow += q;
  }
  // between spaces: torn plating (less what is shored) and open doors
  for (let k = 0; k < L.bn; k++) {
    const b = L.bB[k];
    if (b < 0) continue;
    const A = openArea(S, k);
    if (A <= 0) continue;
    const a = L.bA[k];
    if (W[a] <= 0 && W[b] <= 0) continue;
    let yb, yt;
    if (L.bAx[k] === 1) { yb = yt = (L.bBox[k * 6 + 1] + L.bBox[k * 6 + 4]) / 2; }
    else if (S.torn[k] > .3) { yb = S.tornY[k * 2]; yt = Math.max(yb, S.tornY[k * 2 + 1]); }
    else { yb = Math.max(L.box[a * 6 + 1], L.box[b * 6 + 1]); yt = yb + 2; }
    let q = orifice(SHIPK.cdIn, A, yb, yt, H[a], H[b]);
    // no more than evens the two levels in a step
    const cap = .5 * Math.abs(H[a] - H[b]) * Math.min(L.floorA[a] * L.perm[a], L.floorA[b] * L.perm[b]) / dt;
    if (Math.abs(q) > cap) q = Math.sign(q) * cap;
    fl[a] -= q; fl[b] += q;
  }
  // pumps (the firemain's eductors): sealed spaces first, then the one leaking least
  let pumps = 0;
  for (const f of sp.fire) if (S.ok[f]) pumps++;
  let Qp = pumps * SHIPK.pump;
  if (Qp > 0) {
    for (let pass = 0; pass < 2 && Qp > 1e-6; pass++) for (let c = 0; c < n && Qp > 1e-6; c++) {
      if (W[c] <= 0 || S.cfMark[c]) continue;                       // (not the tanks counter-flooded on purpose)
      const leak = fl[c] > 0;
      if (pass === 0 && leak) continue;
      const q = Math.min(Qp, W[c] / dt + fl[c]);
      if (q > 0) { fl[c] -= q; Qp -= q; }
    }
  }
  // integrate
  let wsum = 0, wx = 0, wy = 0, wz = 0, fs = 0;
  for (let c = 0; c < n; c++) {
    const cap = L.vol[c] * L.perm[c], before = W[c];
    W[c] = Math.max(0, Math.min(cap, W[c] + fl[c] * dt));
    const o = c * 6;
    if (W[c] > 0) {
      const lv = level(S, c);
      // the water pools toward the side it came in by (the frames, tanks and partitions of a real space are not
      // symmetric): a space holed on one side holds its water a little off the centre line
      let xc = (L.box[o] + L.box[o + 3]) / 2;
      for (const h of S.holes) if (h.c === c && h.sea) { xc += .04 * h.x; break; }
      wsum += W[c]; wx += W[c] * xc; wy += W[c] * (L.box[o + 1] + lv) / 2; wz += W[c] * (L.box[o + 2] + L.box[o + 5]) / 2;
      const fill = W[c] / cap;
      if (fill > .03 && fill < .97) {
        // free surface: breadth^3 length / 12, less while the water is shallow against its breadth (it pockets)
        const b = L.box[o + 3] - L.box[o], l = L.box[o + 5] - L.box[o + 2], dep = lv - L.box[o + 1];
        fs += l * b * b * b / 12 * L.perm[c] * Math.min(1, dep / (.08 * b)) * Math.min(1, (1 - fill) / .1);
      }
    }
    // the log: a space flooding, flooded, dry again
    const fl0 = before / cap, fl1 = W[c] / cap;
    if (fl1 > .05 && !(S.flagged[c] & 1)) { S.flagged[c] |= 1; sim.emit('compartment', { unit: u.id, side: u.side, comp: L.ids[c], label: L.names[c], state: 'flooding' }); }
    if (fl1 > .9 && !(S.flagged[c] & 2)) { S.flagged[c] |= 2; sim.emit('compartment', { unit: u.id, side: u.side, comp: L.ids[c], label: L.names[c], state: 'flooded' }); S.dirty = true; }
    if (fl1 < .01 && (S.flagged[c] & 1)) { S.flagged[c] = 0; sim.emit('compartment', { unit: u.id, side: u.side, comp: L.ids[c], label: L.names[c], state: 'dry' }); S.dirty = true; }
    if (fl0 < .5 && fl1 >= .5 || fl0 >= .5 && fl1 < .5) S.dirty = true;       // flood-sensitive systems go out / come back
  }
  S.w = wsum;
  stability(sim, u, S, wsum, wsum > 0 ? wx / wsum : 0, wsum > 0 ? wy / wsum : 0, wsum > 0 ? wz / wsum : 0, fs);
  if (!u.alive) return;
  fires(sim, u, S, dt);
  control(sim, u, S, dt);
  quiet(sim, u, S, dt, t);
}
/* casualty power, the graph, whether she still needs stepping */
function quiet(sim, u, S, dt, t) {
  const sp = S.sp;
  // casualty power: an intact load without its supply gets a temporary cable after a while
  for (let i = 0; i < sp.nN; i++) {
    const nd = sp.nodes[i];
    if (!nd.pw || S.powered[i] || S.cas[i] < 0 || nodeDamage(u, S, nd) >= 1) continue;
    S.cas[i] += dt;
    if (S.cas[i] > SHIPK.casualty && S.caps !== null && anyBus(S)) { S.cas[i] = -1; S.dirty = true; }
  }
  if (S.dirty) evaluate(sim, u, S, 'step');
  // quiet: nothing in her, nothing burning, nothing open
  let waiting = false;
  for (let i = 0; i < sp.nN && !waiting; i++) if (sp.nodes[i].pw && !S.powered[i] && S.cas[i] >= 0 && nodeDamage(u, S, sp.nodes[i]) < 1) waiting = true;
  if (!S.water.some(w => w > 0) && !waiting && !S.holes.some(h => h.A > .005 && h.sea) && !S.fire.some(f => f > 0) && !(S.gq && t - S.gqT < SHIPK.zebra[1] + 1)) S.active = false;
}
function anyBus(S) { const b = S._busOn; if (!b) return false; for (let i = 0; i < b.length; i++) if (b[i]) return true; return false; }
function openArea(S, k) {
  const L = S.L;
  let A = Math.max(0, S.torn[k] - S.shore[k]);
  if (S.door[k] > 0) A += L.bDoor[k] * (S.door[k] === 2 ? 1 : 1);
  return A + L.bOpen[k] * 0;
}

/* sinkage, trim and list from the floodwater (lost buoyancy as added weight), a free-surface penalty; foundering */
function stability(sim, u, S, w, xw, yw, zw, fs) {
  const L = S.L, Hy = L.hydro, d = u.def;
  const wt = w * RHO, D1 = Hy.disp + wt;
  if (L.sub || d.sub) {
    S.sink = 0; S.trim = 0; S.list = 0;
    if (w > Hy.reserve * SHIPK.subReserve) return founder(sim, u, S, 'foundered');
    S.floodK = Math.max(.4, 1 - w / Math.max(1, Hy.reserve));
    setFloodFields(u, S, w, xw, zw);
    return;
  }
  S.sink = w / Hy.Awp;
  S.trim = D1 > 0 ? Math.max(-.25, Math.min(.25, -(wt * (zw - Hy.zF)) / (D1 * Hy.GML))) : 0;
  const KG1 = (Hy.disp * Hy.KG + wt * (yw + Hy.T)) / D1;
  const gm = Hy.KM - KG1 - SHIPK.fsK * fs * RHO / D1;
  S.gm = gm;
  // list: the floodwater's moment over her metacentric height; with none left she lolls (tan = sqrt(2 |GM| / BM))
  let list = wt * xw / (D1 * Math.max(gm, .05));
  if (gm < .05) list = (Math.sign(xw) || 1) * Math.atan(Math.sqrt(2 * (.05 - gm) / Math.max(1, Hy.KM - .55 * Hy.T))) + list * .5;
  S.list = Math.max(-.9, Math.min(.9, list));
  S.floodK = Math.max(.5, 1 - .5 * wt / Hy.disp - .4 * Math.abs(S.list) - 2 * Math.abs(S.trim));
  setFloodFields(u, S, w, xw, zw);
  if (Math.abs(S.list) > SHIPK.capsize) return founder(sim, u, S, 'capsized');
  // the deck edge at the ends and amidships
  let fb = 1e9;
  for (const z of [Hy.zmax - 4, Hy.zF, Hy.zmin + 4]) {
    const e = L.deck(z) - (S.sink - z * Math.sin(S.trim)) - Math.max(0, L.hb(z, L.deck(z) - .1)) * Math.abs(Math.sin(S.list));
    if (e < fb) fb = e;
  }
  S.fb = fb;
  if (fb < SHIPK.awash || w > Hy.reserve) founder(sim, u, S, 'foundered');
  else applySpeed(u, S);
}
function setFloodFields(u, S, w, xw, zw) {
  const Hy = S.L.hydro;
  u.flood = Math.min(.5, w / Math.max(1, Hy.reserve));
  if (w > 0) {
    // (for her sinking, damage.js sinkPlan: the side her holes are on, the end her water is in)
    let sa = 0, sw = 0;
    for (const h of S.holes) if (h.sea && h.A0 > 0) { sa += h.A0 * Math.sign(h.x); sw += h.A0; }
    u.fSide = Math.max(-1, Math.min(1, sw > 0 ? .8 * sa / sw + xw / Hy.B : xw / (Hy.B / 2)));
    u.fEnd = Math.max(-1, Math.min(1, (zw - Hy.zF) / (Hy.L / 2)));
    u.fW = Math.max(u.fW || 0, 1);
  }
}
function founder(sim, u, S, why) {
  if (!u.alive) return;
  S.lost = why;
  u.flood = .5;
  sim.emit('foundered', { unit: u.id, side: u.side, why, w: Math.round(S.w), list: +S.list.toFixed(2), trim: +S.trim.toFixed(3) });
  if (why === 'capsized') u.fSide = Math.sign(u.fSide || S.list || 1);
  kill(sim, u, null);
}

/* fires: they grow to a developed fire, burn what is in their space, spread through open or torn boundaries (slowly
   through intact steel); water puts them out; damage control fights them (fires()' partner: control()) */
function fires(sim, u, S, dt) {
  const L = S.L, sp = S.sp;
  let any = false;
  for (let c = 0; c < L.n; c++) {
    let f = S.fire[c];
    if (f <= 0) continue;
    any = true;
    S.fireT[c] += dt;
    if (level(S, c) > L.box[c * 6 + 1] + .5 * (L.box[c * 6 + 4] - L.box[c * 6 + 1])) f = 0;
    else f = Math.min(1, f + dt / SHIPK.fireGrow * .5);
    if (S.fireT[c] > 900) f -= dt / 300;                   // burnt out
    if (f <= 0) { S.fire[c] = 0; S.fireT[c] = 0; sim.emit('compartment', { unit: u.id, side: u.side, comp: L.ids[c], label: L.names[c], state: 'fireout' }); S.dirty = true; continue; }
    S.fire[c] = f;
    // spread
    if (f > .7) for (const k of L.cb[c]) {
      const o = L.bA[k] === c ? L.bB[k] : L.bA[k];
      if (o < 0 || S.fire[o] > 0 || L.kind[o] === 'tank' && L.use[o] === 'W') continue;
      if (level(S, o) > L.box[o * 6 + 1] + .5 * (L.box[o * 6 + 4] - L.box[o * 6 + 1])) continue;     // flooded
      const open = openArea(S, k) > 0 || L.bOpen[k] > 0;
      if (!open) continue;                                      // intact steel holds (boundary cooling)
      if (S.fireT[c] > SHIPK.fireSpread * (1 + hash01(c, k) * .5)) { S.fire[o] = .25; fireStart(sim, u, S, o); }
    }
  }
  if (!any) return;
  // burning what is in them
  for (const n of sp.nodes) {
    const T = n.T;
    if (!T.fire) continue;
    let f = 0;
    if (n.route) { for (const [c, sh] of n.route) f += S.fire[c] * sh; }
    else if (n.comp >= 0) f = S.fire[n.comp];
    if (f <= 0) continue;
    const add = f * dt / T.fire;
    if (n.mod) {
      const m = n.mod;
      if (u.mods[m.id] >= m.hp) continue;
      const before = u.mods[m.id];
      u.mods[m.id] = Math.min(m.hp, before + add * m.hp);
      if (before < m.hp && u.mods[m.id] >= m.hp) { S.why[n.i] = 'fire'; moduleOut(sim, u, m); S.dirty = true; }
    } else if (S.h[n.i] < 1) {
      S.h[n.i] = Math.min(1, S.h[n.i] + add);
      if (S.h[n.i] >= 1) { S.why[n.i] = 'fire'; S.dirty = true; }
    }
  }
}

/* damage control: its teams fight the fires (worst first), plug the holes, shore torn bulkheads and blown doors round
   the flooded spaces */
function control(sim, u, S, dt) {
  const L = S.L, sp = S.sp;
  let teams = SHIPK.teams[u.type] || 2;
  let main = 0; for (const f of sp.fire) if (S.ok[f]) main++;
  // fires, worst first
  while (teams > 0) {
    let best = -1, bf = 0;
    for (let c = 0; c < L.n; c++) if (S.fire[c] > bf && !(S._fought && S._fought[c] === sim.tick)) { bf = S.fire[c]; best = c; }
    if (best < 0) break;
    (S._fought || (S._fought = new Int32Array(L.n)))[best] = sim.tick;
    S.fire[best] = Math.max(0, S.fire[best] - dt / (SHIPK.fireFight * (main ? 1 : 4)));
    if (S.fire[best] <= 0) { S.fireT[best] = 0; sim.emit('compartment', { unit: u.id, side: u.side, comp: L.ids[best], label: L.names[best], state: 'fireout' }); S.dirty = true; }
    teams--;
  }
  // holes: the ones a team can reach and plug (not too big, not too deep, the space not full)
  for (const h of S.holes) {
    if (teams <= 0) break;
    if (h.A <= .005 || h.A0 > 1.5) continue;
    const head = seaAt(u, S, h.x, h.z) - h.y;
    if (head > 4 || S.water[h.c] > L.vol[h.c] * L.perm[h.c] * .8) continue;
    h.A = Math.max(0, h.A - SHIPK.patch * dt); teams--;
  }
  // shoring round the flooded spaces
  for (let k = 0; k < L.bn && teams > 0; k++) {
    const a = L.bA[k], b = L.bB[k];
    if (b < 0) continue;
    const wetA = S.water[a] > 1, wetB = S.water[b] > 1;
    if (wetA === wetB) continue;
    const torn = S.torn[k] - S.shore[k];
    if (torn > .05 && torn < 6) { S.shore[k] = Math.min(S.torn[k], S.shore[k] + SHIPK.shore * dt); teams--; }
    else if (S.door[k] === 2) { S.door[k] = 0; teams--; }            // a blown door wedged and shored shut
  }
  // counter-flooding: a list past SHIPK.cfList with metacentric height to spare: flood an intact tank or void low on the
  // other side (her buoyancy for her uprightness) until she is back under half of it
  if (!L.sub && S.gm > .3 && Math.abs(S.list) > (S.cf ? SHIPK.cfList * .5 : SHIPK.cfList)) {
    const side = -Math.sign(S.list);
    let best = -1, bv = 0;
    for (let c = 0; c < L.n; c++) {
      const o = c * 6, xc = (L.box[o] + L.box[o + 3]) / 2;
      if (xc * side < 1 || L.kind[c] === 'house' || (L.kind[c] !== 'tank' && L.kind[c] !== 'void')) continue;
      if (S.holes.some(h => h.c === c && h.A > .005)) continue;
      const room = L.vol[c] * L.perm[c] - S.water[c];
      if (room > bv) { bv = room; best = c; }
    }
    if (best >= 0) {
      if (!S.cf) sim.emit('compartment', { unit: u.id, side: u.side, comp: L.ids[best], label: L.names[best], state: 'counterflood' });
      S.cf = true; S.cfMark[best] = 1;
      S.water[best] = Math.min(L.vol[best] * L.perm[best], S.water[best] + SHIPK.cfRate * dt);
    }
  } else S.cf = false;
}

/* ================================================================== readouts (UI, tests) */
/* the flooded share of a hull section (z0..z1, side -1 port / 1 starboard / 0 both): game/structure seeds its flooding */
export function floodShare(u, z0, z1, side) {
  const S = u.ship; if (!S) return 0;
  const L = S.L;
  let w = 0, v = 0;
  for (let c = 0; c < L.n; c++) {
    if (L.kind[c] === 'house') continue;
    const o = c * 6, a = Math.max(z0, L.box[o + 2]), b = Math.min(z1, L.box[o + 5]);
    if (b <= a) continue;
    const xm = (L.box[o] + L.box[o + 3]) / 2;
    if (side && xm * side < -.5) continue;
    const f = (b - a) / Math.max(.1, L.box[o + 5] - L.box[o + 2]);
    w += S.water[c] * f; v += L.vol[c] * L.perm[c] * f;
  }
  return v > 0 ? w / v : 0;
}
/* a summary for the HUD and tests */
export function shipSummary(u) {
  const S = u.ship; if (!S) return null;
  const sp = S.sp, out = [];
  for (const n of sp.nodes) if (!S.ok[n.i]) out.push(n.id);
  let fires = 0, flooded = 0;
  for (let c = 0; c < S.L.n; c++) { if (S.fire[c] > 0) fires++; if (S.water[c] > S.L.vol[c] * S.L.perm[c] * .5) flooded++; }
  return { out, fires, flooded, w: S.w, sink: S.sink, list: S.list, trim: S.trim, gm: S.gm, prop: S.prop, steer: S.steerK, holes: S.holes.length, caps: Object.assign({}, S.caps) };
}
/* re-walk the system graph now (tests, scripts that set node damage directly) */
export function shipRefresh(sim, u) { if (u.ship) { u.ship.active = true; evaluate(sim, u, u.ship, 'script'); } }
