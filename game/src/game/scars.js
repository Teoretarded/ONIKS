/* Scars: a hit leaves its mark in the model's own dots, where it struck, for the rest of the match.

   On a sim 'hit' (a ship, a vehicle, a site; not an aircraft, not a boat under the water):
     where    the sim's hit point (the part box the round entered) is carried along the round's path onto the model's
              real surface (its sampled dots), in the model frame, with that surface's normal: the mark moves with the
              hull as she rolls, turns and sinks
     size     from the warhead (kg, public figures, WH below) and the target's build (steel hull, a carrier's heavy
              plating, a light vehicle or container): hole radius k * 0.5 * cbrt(kg) (an Oniks on a Burke: a ~6 m
              hole; a 5" round: under 2 m; a Hellfire on a truck: ~2.5 m), capped by the target's size; the scorch
              reaches 2-3 hole radii, stretched up the side (smoke rising over the plating)
     look     (engine/models.js, the models' vertex shader, d.scars): the dots inside the hole are gone except a few
              torn ones bent in; the rim's plating is bent in (petals, torn in strips) and glows for a while; around
              it the dots are charred (dimmer, sparser, grey), the stain taller above than below
     ejecta   the very dots that left the hole (sampled from the model's cloud there) are blown out along the normal:
              some fast as debris, most at a few tens of m/s arcing into the sea / onto the ground, some just falling
              away down the side; hot ones glowing for their first half second
     fire     one fx Fire per scar, seated at the hole (just outside it, on the right face) in the model frame:
              flames rising from the hole, embers, a flickering light on the nearby dots, a smoke column that leans
              downwind; it grows over the first seconds, dies back to a smoulder as the damage control gains
              (faster for a small hit), flares when the unit is lost. A hit at a ship's waterline vents smoke with
              hardly a flame; a flooded hole goes out
   Merged: a hit landing on an old scar enlarges it; up to 8 scars a unit (the shader's arrays).

   Hooks: game.scars = { surface(ev) (the snapped world point of the hit just handled: the fx blast sits there),
   burning(id), heavy(id) (> 1: the warhead was far too big for the target: a catastrophic break-up), of(id), clear(id)
   (the marks, fires and ejecta off at once: the Inspect impact test's reset), stats }. WH (warhead kg) is exported.
   The render instance gets d.scars (drawn this frame, game.drawn) for engine/models.js. Console: ONIKS.game.scars.

   createScars(game) -> system 'scars' (priority 12: its events before debris (11) and fx (5); draws after render). */
import { Fire } from '../fx/lib/impact.js';
import { attitudeM } from './debris/math.js';

/* warhead (kg): public figures, rounded */
export const WH = { oniks: 250, kalibr: 200, tlam: 450, slam: 360, uran: 145, hellfire: 9, kornet: 7, shell: 3.6, shell130: 3.6,
  shell57: .4, sm6: 64, pdms: 39, sam: 20, sam48: 180, ram: 11, aam: 18, mk48: 290, mk54: 44, t53: 300, ciws: .05, gun30: .1, rws: .05 };
const MAXS = 8, MAXE = 700, GROUPS = 16, EJ_LIFE = 7;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function hsh(i, s) { let h = Math.imul((i | 0) ^ Math.imul(s | 0, 0x9E3779B1), 0x85EBCA77); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

/* the target's build: hole scale k, scorch reach (x hole radius), petal depth (x hole radius) */
function buildOf(def) {
  if (def.domain === 'sea') {
    if (def.size[0] > 250) return { k: .95, reach: 3.4, petal: .3, sea: true };           // a carrier's plating, decks
    if (def.size[0] < 45 || def.hover) return { k: 1.25, reach: 2.6, petal: .5, sea: true };   // small craft
    return { k: 1, reach: 3.2, petal: .42, sea: true };                                    // a steel warship
  }
  if (def.static) return { k: 1.1, reach: 2.8, petal: .3, sea: false };
  return { k: 1.2, reach: 2.6, petal: .5, sea: false };                                    // trucks, containers, cabs
}

export function createScars(game) {
  const sim = game.sim, R = game.R;
  const recs = new Map();                 // unit id -> { id, n, L (8 x [x y z r nx ny nz seed]), C (8 x [0 reach petal heat]), list, M, now, dead }
  const groups = [];                      // ejecta: { t0, n, P, V, K, gy, sea, near }
  const M9 = [1, 0, 0, 0, 1, 0, 0, 0, 1], W3 = [0, 0, 0];
  let lastEv = null, lastPos = [0, 0, 0], lastN = [0, 1, 0], lastW = 0;
  const stats = { scars: 0, fires: 0, ejecta: 0, snapMs: 0, drawMs: 0 };
  // scratch for the snap: the dots near the hit (model frame + normal), reused
  let TMP = new Float32Array(6 * 20000);

  const fxSys = () => game.getSystem('fx');
  const ground = (x, z) => (game.ground ? game.ground(x, z) : 0);

  /* ------------------------------------------------------------ the model's dots near a point */
  /* Per model, once: its static parts' dots (model frame, rest state; the level of about L / 300 spacing, else the
     finest sampled so far) with their normals, bucketed in a grid of CELL-m cells. Rebuilt once a finer level is there.
     A hit then looks only at the cells round it (no pass over the whole cloud). */
  const CELL = 4, GRIDS = new Map();
  const ck = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
  function gridOf(ent, st) {
    const want = Math.max(.15, ent.L / 300);
    let G = GRIDS.get(ent.key);
    if (G && (G.sp <= want * 1.01 || G.tries > 3)) return G;
    // what the clouds have now (a level not yet sampled is not waited for)
    let sp = 0, n = 0;
    const use = [];
    for (const P of ent.parts) {
      if (P.dyn) continue;
      let shown = true; try { shown = !P.part.show || !!P.part.show(st); } catch (e) { shown = true; }
      if (!shown) continue;
      let cl = null;
      for (let k = P.clouds.length - 1; k >= 0; k--) { const c = P.clouds[k]; if (c && c.pts && c.n) { cl = c; if (c.sp <= want) break; } }
      if (!cl) continue;
      let X = null; try { X = P.part.xf ? P.part.xf(st) : null; } catch (e) { X = null; }
      use.push([cl, X]); n += cl.n; sp = Math.max(sp, cl.sp);
    }
    if (!n) return G || null;
    if (G && sp >= G.sp) { G.tries++; return G; }
    const D = new Float32Array(n * 6), cells = new Map();
    let m = 0;
    for (const [cl, X] of use) {
      const f = cl.pts, by = new Int8Array(f.buffer, f.byteOffset, cl.n * 16);
      for (let i = 0; i < cl.n; i++, m++) {
        let x = f[i * 4], y = f[i * 4 + 1], z = f[i * 4 + 2], nx = by[i * 16 + 12] / 127, ny = by[i * 16 + 13] / 127, nz = by[i * 16 + 14] / 127;
        if (X) {
          const RR = X.R, T = X.T;
          const x2 = RR[0] * x + RR[1] * y + RR[2] * z + T[0], y2 = RR[3] * x + RR[4] * y + RR[5] * z + T[1], z2 = RR[6] * x + RR[7] * y + RR[8] * z + T[2];
          const n0 = RR[0] * nx + RR[1] * ny + RR[2] * nz, n1 = RR[3] * nx + RR[4] * ny + RR[5] * nz, n2 = RR[6] * nx + RR[7] * ny + RR[8] * nz;
          x = x2; y = y2; z = z2; nx = n0; ny = n1; nz = n2;
        }
        D[m * 6] = x; D[m * 6 + 1] = y; D[m * 6 + 2] = z; D[m * 6 + 3] = nx; D[m * 6 + 4] = ny; D[m * 6 + 5] = nz;
        const key = ck(Math.floor(x / CELL), Math.floor(y / CELL), Math.floor(z / CELL));
        let a = cells.get(key); if (!a) { a = []; cells.set(key, a); } a.push(m);
      }
    }
    const idx = new Map();
    for (const [k, a] of cells) idx.set(k, Int32Array.from(a));
    G = { sp, D, idx, tries: G ? G.tries + 1 : 0 };
    GRIDS.set(ent.key, G);
    return G;
  }
  /* the dots within rad of (cx, cy, cz), model frame -> cb(x, y, z, nx, ny, nz) */
  function eachDot(ent, st, cb, cx, cy, cz, rad) {
    const G = gridOf(ent, st);
    if (!G) return;
    const D = G.D, r2 = rad * rad;
    const i0 = Math.floor((cx - rad) / CELL), i1 = Math.floor((cx + rad) / CELL), j0 = Math.floor((cy - rad) / CELL), j1 = Math.floor((cy + rad) / CELL);
    const k0 = Math.floor((cz - rad) / CELL), k1 = Math.floor((cz + rad) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const a = G.idx.get(ck(i, j, k));
      if (!a) continue;
      for (let q = 0; q < a.length; q++) {
        const o = a[q] * 6, x = D[o], y = D[o + 1], z = D[o + 2], dx = x - cx, dy = y - cy, dz = z - cz;
        if (dx * dx + dy * dy + dz * dz <= r2) cb(x, y, z, D[o + 3], D[o + 4], D[o + 5]);
      }
    }
  }

  /* the hit carried along the round's path onto the model's surface: the first dot along the path within rs of it,
     facing the round (else the nearest dot). h, din: model frame (din: the round's direction of travel) */
  function snap(ent, st, h, din, rs, out) {
    let bs = 1e9, fb = 1e9, found = false;
    const o = out;
    const along = (x, y, z, nx, ny, nz) => {
      const vx = x - h[0], vy = y - h[1], vz = z - h[2];
      const s = vx * din[0] + vy * din[1] + vz * din[2], d2 = vx * vx + vy * vy + vz * vz;
      const two = nx * nx + ny * ny + nz * nz < .01;
      if (s > -12 && s < 36 && d2 - s * s < rs * rs && (two || nx * din[0] + ny * din[1] + nz * din[2] < .25)) {
        if (s < bs) { bs = s; found = true; o[0] = x; o[1] = y; o[2] = z; o[3] = two ? -din[0] : nx; o[4] = two ? -din[1] : ny; o[5] = two ? -din[2] : nz; }
      }
    };
    // along the path, a short sphere at a time, until the first surface
    for (let s0 = -12; s0 <= 36 && !found; s0 += 3) eachDot(ent, st, along, h[0] + din[0] * s0, h[1] + din[1] * s0, h[2] + din[2] * s0, rs + 1.6);
    if (found) return true;
    // else the nearest dot to the hit
    eachDot(ent, st, (x, y, z, nx, ny, nz) => {
      const d2 = (x - h[0]) ** 2 + (y - h[1]) ** 2 + (z - h[2]) ** 2, two = nx * nx + ny * ny + nz * nz < .01;
      if (d2 < fb) { fb = d2; o[0] = x; o[1] = y; o[2] = z; o[3] = two ? -din[0] : nx; o[4] = two ? -din[1] : ny; o[5] = two ? -din[2] : nz; }
    }, h[0], h[1], h[2], 10);
    return fb < 1e9;
  }

  /* ------------------------------------------------------------ a hit */
  function onHit(e) {
    const u = sim.units.get(e.target);
    if (!u || !e.pos || u.aboard) return;
    const def = u.def;
    if (def.domain === 'air' || (def.sub && (u.depth || 0) > def.draught + 1)) return;
    const Wk = WH[e.kind] !== undefined ? WH[e.kind] : ((game.PROJ[e.kind] && game.PROJ[e.kind].dmg) || 10) * 2.5;
    if (Wk < .2 && !e.under) return;                              // gun rounds: the blast only
    if (!R.models.has(def.model)) return;
    const t0 = performance.now();
    const ent = R.models.get(def.model), st = (def.modelState ? def.modelState(u, game.t) : u.st) || {};
    const B = buildOf(def), pose = game.unitPose(u), M = attitudeM(pose.hdg, pose.pitch || 0, pose.roll || 0, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // the hit and the round's path in the model frame
    const dx = e.pos[0] - pose.pos[0], dy = e.pos[1] - pose.pos[1], dz = e.pos[2] - pose.pos[2];
    const h = [M[0] * dx + M[3] * dy + M[6] * dz, M[1] * dx + M[4] * dy + M[7] * dz, M[2] * dx + M[5] * dy + M[8] * dz];
    let din;
    const v = e.vel;
    if (e.under) {
      // a torpedo under the keel: the hull broken at the waterline on the side it ran in from
      const sx = h[0] >= 0 ? 1 : -1;
      h[0] = sx * (def.size[1] * .5 + 12); h[1] = Math.min(1.2, def.size[2] * .03); din = [-sx, 0, 0];
    } else if (v && Math.hypot(v[0], v[1], v[2]) > 1) {
      const l = Math.hypot(v[0], v[1], v[2]);
      din = [(M[0] * v[0] + M[3] * v[1] + M[6] * v[2]) / l, (M[1] * v[0] + M[4] * v[1] + M[7] * v[2]) / l, (M[2] * v[0] + M[5] * v[1] + M[8] * v[2]) / l];
    } else {
      const l = Math.hypot(h[0], h[2] * .3) || 1;
      din = [-h[0] / l, 0, -h[2] * .3 / l];
    }
    const cap = .35 * Math.max(def.size[1], def.size[2]);
    const r0 = B.k * .95 * Math.cbrt(Wk) * (e.under ? 1.25 : 1), r = Math.min(r0, cap);
    const o = new Array(12), ts = performance.now();
    if (!snap(ent, st, h, din, e.under ? .8 : Math.max(1.5, r * .55), o)) { o[0] = h[0]; o[1] = h[1]; o[2] = h[2]; o[3] = -din[0]; o[4] = -din[1]; o[5] = -din[2]; }
    const nl = Math.hypot(o[3], o[4], o[5]) || 1;
    const S = { x: o[0], y: o[1], z: o[2], nx: o[3] / nl, ny: o[4] / nl, nz: o[5] / nl, r, r0, W: Wk, t0: sim.t, seed: (u.id * 131 + Math.floor(sim.t * 20)) % 997,
      reach: B.reach, petal: B.petal, sea: B.sea, wl: B.sea && (o[1] < 1.8 || !!e.under) && !def.hover, fire: null, merged: 0 };
    // the world point of the surface hit (the fx blast is laid there)
    lastEv = e;
    lastPos[0] = pose.pos[0] + M[0] * S.x + M[1] * S.y + M[2] * S.z;
    lastPos[1] = pose.pos[1] + M[3] * S.x + M[4] * S.y + M[5] * S.z;
    lastPos[2] = pose.pos[2] + M[6] * S.x + M[7] * S.y + M[8] * S.z;
    lastN[0] = M[0] * S.nx + M[1] * S.ny + M[2] * S.nz; lastN[1] = M[3] * S.nx + M[4] * S.ny + M[5] * S.nz; lastN[2] = M[6] * S.nx + M[7] * S.ny + M[8] * S.nz;
    lastW = Wk;
    stats.surfMs = performance.now() - ts;
    addScar(u, S);
    const te = performance.now();
    ejecta(u, ent, st, S, M, pose);
    stats.ejMs = performance.now() - te;
    stats.snapMs = performance.now() - t0;
  }

  function recOf(u) {
    let rec = recs.get(u.id);
    if (!rec) { rec = { id: u.id, n: 0, L: new Float32Array(MAXS * 8), C: new Float32Array(MAXS * 4), list: [], M: [1, 0, 0, 0, 1, 0, 0, 0, 1], now: 0, dead: false, heavy: 0 }; recs.set(u.id, rec); }
    return rec;
  }
  function addScar(u, S) {
    const rec = recOf(u), L = rec.list;
    rec.heavy = Math.max(rec.heavy, S.r0 / Math.max(.5, .35 * Math.max(u.def.size[1], u.def.size[2])));
    // on an old scar: it grows (the volumes add), its fire flares
    for (const P of L) {
      const d = Math.hypot(P.x - S.x, P.y - S.y, P.z - S.z);
      if (d < (P.r + S.r) * .6 || (L.length >= MAXS && d < (P.r + S.r) * 2.5)) {
        const w = S.r ** 3 / (P.r ** 3 + S.r ** 3);
        P.x += (S.x - P.x) * w; P.y += (S.y - P.y) * w; P.z += (S.z - P.z) * w;
        P.r = Math.min(Math.max(P.r, S.r) * 1.6, Math.cbrt(P.r ** 3 + S.r ** 3) * 1.05); P.W += S.W; P.merged++;
        P.t0h = S.t0;
        if (P.fire) P.kick = Math.min(1, (P.kick || 0) + .5);
        else startFire(u, P);
        return P;
      }
    }
    if (L.length >= MAXS) {
      // full: the smallest old one makes room
      let mi = 0; for (let i = 1; i < L.length; i++) if (L[i].r < L[mi].r) mi = i;
      const Q = L[mi]; if (Q.fire) Q.fire.stop(sim.t); L.splice(mi, 1);
    }
    L.push(S);
    startFire(u, S);
    return S;
  }

  /* a fire seated at the scar (none for a small hit on a steel hull that only scorches) */
  function startFire(u, S) {
    const f = fxSys();
    if (!f || !f.add) return;
    if (S.W < 2 && !S.wl) return;
    const sea = S.sea, sz = Math.max(.12, Math.min(1.1, .18 + Math.sqrt(S.W) / 18));
    const r = S.r;
    const F = new Fire({ t0: sim.t, seed: S.seed * 7 + 3, size: sz, local: [0, 0, 0],
      spread: [r * .9 + .4, r * 2.6 + (sea ? 3 : 1), r * .55 + .3], ceiling: (sea ? 900 : 240) * sz + 60,
      life: sea ? (sz > .5 ? 220 : 130) : 90, flame: S.wl ? .15 : 1, embers: S.wl ? .25 : 1.6, lightR: 8 + r * 5, lightI: 1.1, lightRgb: [255, 170, 90], dense: S.wl ? 13 : 12 });
    F.k = 0;
    f.add(F, 0);
    S.fire = F;
    stats.fires++;
  }

  /* how hard a scar burns now: grows over the first seconds, then the damage control gains (a smoulder left), faster
     for a small hit; flares on a new hit there; full while the ship is lost; out under the water */
  function kOf(u, S, rec, t) {
    const a = t - S.t0, big = sat(Math.sqrt(S.W) / 16);
    let k = (.35 + .65 * big) * (.45 + .55 * ss(0, 6 + 6 * big, a));
    const hold = 40 + 160 * big, tau = 60 + 240 * big;
    k *= a < hold ? 1 : .18 + .82 * Math.exp(-(a - hold) / tau);
    if (!S.sea && a > 30 + 60 * big) k *= Math.exp(-(a - 30 - 60 * big) / 40);
    if (S.kick) { k = Math.min(1, k + S.kick); S.kick = Math.max(0, S.kick - .002); }
    if (u.alive) k = Math.max(k, sat((.4 - u.hp / u.hpMax) * 1.6) * (.4 + .6 * big));
    else if (rec.dead) k = u.def.domain === 'sea' ? (u.dying < .85 ? Math.max(k, .7 + .3 * big) : k * (1 - ss(.85, .97, u.dying))) : 0;
    return k;
  }

  /* ------------------------------------------------------------ ejecta: the dots that left the hole */
  function ejecta(u, ent, st, S, M, pose) {
    const cap = Math.round(Math.min(MAXE, 60 + 700 * (S.r / 3) ** 2));
    let m = 0;
    const r = S.r;
    eachDot(ent, st, (x, y, z, nx, ny, nz) => {
      if (m >= TMP.length / 6) return;
      TMP[m * 6] = x; TMP[m * 6 + 1] = y; TMP[m * 6 + 2] = z; TMP[m * 6 + 3] = nx; TMP[m * 6 + 4] = ny; TMP[m * 6 + 5] = nz; m++;
    }, S.x, S.y, S.z, r * 1.05);
    const n = Math.min(cap, Math.max(m, Math.round(cap * .5)));
    if (!n) return;
    const g = groups.length >= GROUPS ? groups.shift() : null;
    const G = g && g.P.length >= n * 3 ? g : { P: new Float32Array(Math.max(n, 64) * 3), V: new Float32Array(Math.max(n, 64) * 3), K: new Float32Array(Math.max(n, 64) * 2) };
    G.t0 = sim.t; G.n = n; G.seed = S.seed; G.unit = u.id;
    const sp = u.def.domain === 'sea' ? (u.speed || 0) : 0, vbx = Math.sin(pose.hdg) * sp, vbz = Math.cos(pose.hdg) * sp;
    const Nw = [M[0] * S.nx + M[1] * S.ny + M[2] * S.nz, M[3] * S.nx + M[4] * S.ny + M[5] * S.nz, M[6] * S.nx + M[7] * S.ny + M[8] * S.nz];
    const kick = Math.sqrt(S.W / 100);
    for (let i = 0; i < n; i++) {
      let x, y, z;
      if (m) { const j = m <= n ? i % m : Math.floor(i * m / n); x = TMP[j * 6]; y = TMP[j * 6 + 1]; z = TMP[j * 6 + 2]; }
      else { x = S.x + (hsh(i, S.seed) - .5) * r; y = S.y + (hsh(i, S.seed + 1) - .5) * r; z = S.z + (hsh(i, S.seed + 2) - .5) * r; }
      if (m && i >= m) { x += (hsh(i, S.seed + 3) - .5) * .3; y += (hsh(i, S.seed + 4) - .5) * .3; z += (hsh(i, S.seed + 5) - .5) * .3; }
      const wx = pose.pos[0] + M[0] * x + M[1] * y + M[2] * z, wy = pose.pos[1] + M[3] * x + M[4] * y + M[5] * z, wz = pose.pos[2] + M[6] * x + M[7] * y + M[8] * z;
      // out along the normal and away from the middle of the hole, with a scatter
      const ox = wx - lastPos[0], oy = wy - lastPos[1], oz = wz - lastPos[2], ol = Math.hypot(ox, oy, oz) || 1;
      const c = hsh(i, S.seed + 6);
      // a quarter fall away down the side, most go as debris, a fifth fly fast
      const spd = c < .25 ? .5 + 3 * hsh(i, S.seed + 7) : c < .8 ? (6 + 22 * hsh(i, S.seed + 7)) * Math.min(2.2, .6 + kick) : (30 + 70 * hsh(i, S.seed + 7)) * Math.min(2, .5 + kick);
      const sc = c < .25 ? .35 : 1;
      let vx = Nw[0] + ox / ol * .8 * sc + (hsh(i, S.seed + 8) - .5) * .9, vy = Nw[1] + oy / ol * .8 * sc + (hsh(i, S.seed + 9) - .5) * .9 + (c < .25 ? -.6 : .35), vz = Nw[2] + oz / ol * .8 * sc + (hsh(i, S.seed + 10) - .5) * .9;
      const vl = Math.hypot(vx, vy, vz) || 1;
      G.P[i * 3] = wx; G.P[i * 3 + 1] = wy; G.P[i * 3 + 2] = wz;
      G.V[i * 3] = vbx + vx / vl * spd; G.V[i * 3 + 1] = vy / vl * spd; G.V[i * 3 + 2] = vbz + vz / vl * spd;
      G.K[i * 2] = c < .25 ? .3 + .5 * hsh(i, S.seed + 11) : .5 + 1.6 * hsh(i, S.seed + 11);      // drag (1/s): plates flutter
      G.K[i * 2 + 1] = hsh(i, S.seed + 12) < .35 ? 1 : 0;                                         // hot for a moment
    }
    G.sea = u.def.domain === 'sea';
    G.gy = G.sea ? 0 : ground(lastPos[0], lastPos[2]);
    G.cx = lastPos[0]; G.cy = lastPos[1]; G.cz = lastPos[2];
    groups.push(G);
  }

  function drawEjecta(frame) {
    const sink = frame.sink, t = frame.t;
    if (!sink || !sink.cam) return 0;
    const eye = sink.cam.eye;
    let drawn = 0;
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const G = groups[gi], a = t - G.t0;
      if (a > EJ_LIFE) { groups.splice(gi, 1); continue; }
      if (a < 0) continue;
      const dist = Math.hypot(G.cx - eye[0], G.cy - eye[1], G.cz - eye[2]);
      if (dist > 9000) continue;
      const sz = dist < 350 ? 2 : 1, fade = 1 - ss(EJ_LIFE - 2.5, EJ_LIFE, a), P = G.P, V = G.V, K = G.K;
      for (let i = 0; i < G.n; i++) {
        const k = K[i * 2], e = Math.exp(-k * a), f1 = (1 - e) / k, f2 = (a - f1) / k;
        const x = P[i * 3] + V[i * 3] * f1, z = P[i * 3 + 2] + V[i * 3 + 2] * f1;
        let y = P[i * 3 + 1] + V[i * 3 + 1] * f1 - 9.81 * f2;
        if (y < G.gy) {
          if (G.sea) continue;
          y = G.gy + .05;                                     // on the ground: lies there, dim
        }
        const hot = K[i * 2 + 1] > 0 ? 1 - ss(.05, .7, a) : 0;
        if (hot > .02) sink.add(x, y, z, sz, 255, 214 + 30 * hot, 170 + 60 * hot, hot);
        const w = (.7 + .3 * hsh(i, G.seed)) * fade * (y <= G.gy + .06 ? .5 : 1);
        sink.dot(x, y, z, sz, 226 * w, 228 * w, 220 * w, 1);
        drawn++;
      }
    }
    return drawn;
  }

  /* ------------------------------------------------------------ per frame */
  /* the grids built ahead of the hits, one model a while, from what the renderer has sampled (a first hit on a type then
     costs no build) */
  let prepN = 0;
  function prep() {
    if (++prepN % 45) return;
    for (const u of sim.units.values()) {
      const m = u.def.model;
      if (!u.alive || u.def.domain === 'air' || !m || !R.models.has(m)) continue;
      const G = GRIDS.get(m), ent = R.models.entries.get(m);
      if (!ent || (G && (G.sp <= Math.max(.15, ent.L / 300) * 1.01 || G.tries > 3))) continue;
      if (!game.drawn.has(u.id)) continue;
      gridOf(ent, (u.def.modelState ? u.def.modelState(u, game.t) : u.st) || {});
      return;
    }
  }

  function update() {
    const t = sim.t;
    let ns = 0;
    try { prep(); } catch (e) { /* the next frame */ }
    for (const [id, rec] of recs) {
      const u = sim.units.get(id);
      if (!u) { for (const S of rec.list) if (S.fire) S.fire.stop(t); recs.delete(id); continue; }
      const pose = game.unitPose(u), M = attitudeM(pose.hdg, pose.pitch || 0, pose.roll || 0, rec.M);
      const vis = !sim.fog || u.side === game.side || !!(game.vis && (game.vis(u) === 'own' || game.vis(u) === 'track'));
      const L = rec.L, C = rec.C, list = rec.list;
      rec.n = list.length; ns += rec.n;
      for (let i = 0; i < list.length; i++) {
        const S = list[i], a = game.t - S.t0, ah = game.t - (S.t0h || S.t0);
        // the hole opens in a few hundredths of a second; the rim glows, cooling over half a minute
        const grow = Math.min(1, .3 + Math.max(0, ah) / .12);
        L[i * 8] = S.x; L[i * 8 + 1] = S.y; L[i * 8 + 2] = S.z; L[i * 8 + 3] = a < 0 ? 0 : S.r * grow;
        L[i * 8 + 4] = S.nx; L[i * 8 + 5] = S.ny; L[i * 8 + 6] = S.nz; L[i * 8 + 7] = S.seed;
        C[i * 4] = 0; C[i * 4 + 1] = S.reach; C[i * 4 + 2] = S.petal;
        C[i * 4 + 3] = ah < 0 ? 0 : .05 + .95 * Math.exp(-ah / 28) * (S.W > 2 ? 1 : .5);
        if (S.fire) {
          // seated just outside the hole, at its upper edge on a side (the flames lick up the plating from the tear;
          // the hole itself stays dark), in the crater on a deck
          const deck = S.ny > .7, off = S.r * (deck ? .15 : .5), up = deck ? 0 : S.r * .55;
          const lx = S.x + S.nx * off, ly = S.y + S.ny * off + up, lz = S.z + S.nz * off;
          W3[0] = pose.pos[0] + M[0] * lx + M[1] * ly + M[2] * lz; W3[1] = pose.pos[1] + M[3] * lx + M[4] * ly + M[5] * lz; W3[2] = pose.pos[2] + M[6] * lx + M[7] * ly + M[8] * lz;
          let k = kOf(u, S, rec, t);
          if (W3[1] < -.4 && S.sea) k = 0;                                   // under the water: out
          S.fire.k = k;
          S.fire.follow(t, W3, pose.hdg, vis ? k : 0);
        }
      }
      rec.now = game.t;
    }
    stats.scars = ns;
  }

  const sys = {
    name: 'scars', priority: 12,
    stats, groups,
    /* the snapped world point of the hit event just handled (fx lays its blast there) */
    surface(ev) { return ev && ev === lastEv ? lastPos : null; },
    /* the world normal of the surface there and the warhead (kg) of the hit just handled */
    normal(ev) { return ev && ev === lastEv ? lastN : null; },
    charge(ev) { return ev && ev === lastEv ? lastW : 0; },
    burning(id) { const r = recs.get(id); return !!(r && r.list.some(S => S.fire)); },
    heavy(id) { const r = recs.get(id); return r ? r.heavy : 0; },
    /* the latest scar of a unit, model frame: { x, y, z, nx, ny, nz, r, W } */
    last(id) { const r = recs.get(id); return r && r.list.length ? r.list.reduce((a, b) => ((b.t0h || b.t0) >= (a.t0h || a.t0) ? b : a)) : null; },
    of(id) { return recs.get(id) || null; },
    /* take a unit's marks off now (the Inspect impact test's reset): its scars, their fires and smoke (out of the fx
       list at once), its ejecta */
    clear(id) {
      const rec = recs.get(id), f = fxSys();
      if (rec) for (const S of rec.list) if (S.fire) { S.fire.stop(sim.t); const i = f && f.fx ? f.fx.indexOf(S.fire) : -1; if (i >= 0) f.fx.splice(i, 1); }
      recs.delete(id);
      for (let i = groups.length - 1; i >= 0; i--) if (groups[i].unit === id) groups.splice(i, 1);
      const d = game.drawn && game.drawn.get(id); if (d) d.scars = null;
      if (lastEv && lastEv.target === id) lastEv = null;
    },
    init() { game.scars = sys; },
    onEvent(e) {
      switch (e.type) {
        case 'hit': if (e.target !== undefined && !e.miss) { try { onHit(e); } catch (err) { console.error('scars: hit', err); } } return;
        case 'destroyed': {
          const rec = recs.get(e.unit);
          if (!rec) return;
          rec.dead = true;
          // a vehicle's wreck fire is the fx system's (it burns on the ground after the wreck is gone)
          const u = sim.units.get(e.unit);
          if (u && u.def.domain !== 'sea') for (const S of rec.list) if (S.fire) { S.fire.stop(sim.t); S.fire = null; }
          return;
        }
        case 'removed': {
          const rec = recs.get(e.unit);
          if (rec) { for (const S of rec.list) if (S.fire) S.fire.stop(sim.t); recs.delete(e.unit); }
          return;
        }
        default: return;
      }
    },
    update,
    draw3d(frame) {
      const t0 = performance.now();
      // the marks ride on this frame's render instance of each unit
      for (const [id, rec] of recs) { const d = game.drawn.get(id); if (d) d.scars = rec.n ? rec : null; }
      if (!R.pcOff && groups.length) stats.ejecta = drawEjecta(frame);
      else stats.ejecta = 0;
      stats.drawMs = performance.now() - t0;
    },
    dispose() { for (const rec of recs.values()) for (const S of rec.list) if (S.fire) S.fire.stop(sim.t); recs.clear(); if (game.scars === sys) game.scars = null; },
  };
  return sys;
}
