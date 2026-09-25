/* Landmarks system: each map's set pieces and its ambient life, drawn as the films' dots.

   game.addSystem(await createLandmarks(game, ctx))      // name 'landmarks', priority 12 (draws after render)

   What it does
   - plans the map's landmarks once (world/landmarks.js, pure, from the map) and registers their models with the
     renderer (data/landmark_models.js: fixed models, plus the parametric builds made on first use, each with a
     merged far version so a distant build is a few draw calls);
   - every frame queues the visible ones (distance and frustum culled, near / far model by distance);
   - civilian ships on their routes at the sim time (analytic: exact at any rate, scrubbing, fast-forward), with
     Kelvin wakes and their navigation lights at night;
   - navigation lights at their real characteristics (Fl, LFl, Q, VQ, Iso, Oc, groups) on real time, so a
     time-lapse never strobes them; lighthouses: a turning lens, the beams sweeping out over the sea at night
     and the flash when a beam faces the lens (the objective lighthouse's lens is turned to match);
   - plumes (volcanic steam, fumaroles, mud volcanoes), gas flares that light what is near, waterfalls, lit
     windows and street lights at night.
   Clocks: ships game.t (sim), plumes and water game.seaT (the swell clock, at most x2), lights game.realT.
   Detail follows the Effects setting (game.settings.effects, live; DETAIL): plume, flare and waterfall dots and
   the weakest dynamic lights (nav lights, beam fill, vent glow) thin out on medium and low.
   Cost target: under 1 ms of CPU a frame. stats: { ms, inst, dots, ships, detail }. */
import { PRI } from './game.js';
import { planLandmarks } from '../world/landmarks.js';
import { LM_MODELS, LM_INFO, buildLandmark, spacingFor, mergeParts, settlementBase, settlementLights, PLAT } from '../data/landmark_models.js';
import { Wake } from '../engine/fx.js';
import { attitude } from '../engine/models.js';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const TIME_K = { night: 1, dusk: .72, day: .28 };
const COL = { w: [255, 250, 236], g: [198, 244, 50], r: [255, 196, 178], y: [255, 236, 170] };
const WARM = [255, 226, 184], STEAM = [226, 229, 222];
const NEAR = 3500;                    // m: inside this (from the build's bounding sphere) the chunked model, else the far one
/* the Effects setting -> dot share of the plumes, flares and falls, and the weakest dynamic light cast */
const DETAIL = { low: { k: .35, light: .3 }, medium: { k: .65, light: .1 }, high: { k: 1, light: 0 } };

/* hash -> [0, 1) */
function hsh(a, b) {
  let h = Math.imul(a ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(b + 0x7f4a7c15, 0x85EBCA77);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
  return ((h >>> 0) + .5) / 4294967296;
}
/* gaussian-ish offsets table */
const GN = 4096, GM = GN - 1, GT = new Float32Array(GN);
for (let i = 0; i < GN; i++) { const u = hsh(i, 11), v = hsh(i, 12); GT[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v) * .5; }

/* ---------------------------------------------------------------- light characteristics
   'Fl(2) R 6s', 'LFl W 10s', 'Q', 'VQ(3) 5s', 'Q(6)+LFl 15s', 'Iso 4s', 'Oc 6s', 'F' -> { P, on: [[t0, t1], ...] } */
export function parseCh(ch) {
  if (/^Mo\(U\)/.test(ch || '')) { const pm = /(\d+(?:\.\d+)?)s\b/.exec(ch), P = pm ? +pm[1] : 15; return { P, on: [[0, .5], [1, 1.5], [2, 3.5]] }; }
  const m = /^(VQ|Q|LFl|Fl|Iso|Oc|F)(?:\((\d+)\))?(\+LFl)?/.exec(ch || 'F') || [];
  const kind = m[1] || 'F', n = +(m[2] || 1), plusL = !!m[3];
  const pm = /(\d+(?:\.\d+)?)s\b/.exec(ch || ''), P0 = pm ? +pm[1] : 0;
  const on = [];
  if (kind === 'F') return { P: 1, on: [[0, 1]] };
  if (kind === 'Iso') { const P = P0 || 4; return { P, on: [[0, P / 2]] }; }
  if (kind === 'Oc') { const P = P0 || 6, d = Math.min(2, P * .25); return { P, on: [[0, P - d]] }; }
  if (kind === 'LFl') { const P = P0 || 10; return { P, on: [[0, 2]] }; }
  if (kind === 'Q' || kind === 'VQ') {
    const q = kind === 'Q' ? 1 : .5, d = kind === 'Q' ? .3 : .15;
    if (!m[2] && !P0) return { P: q, on: [[0, d]] };
    for (let i = 0; i < n; i++) on.push([i * q, i * q + d]);
    if (plusL) on.push([n * q, n * q + 2]);
    return { P: P0 || (n * q + 3), on };
  }
  // Fl, Fl(n): .5 s flashes 1.5 s apart in a group
  const P = P0 || 4;
  for (let i = 0; i < n; i++) on.push([i * 1.5, i * 1.5 + .5]);
  return { P, on };
}
function chAt(C, t) {
  let u = t % C.P; if (u < 0) u += C.P;
  let v = 0;
  for (let i = 0; i < C.on.length; i++) {
    const a = C.on[i][0], b = C.on[i][1];
    if (u >= a - .06 && u <= b + .06) { const k = Math.min(sat((u - a + .06) / .1), sat((b + .06 - u) / .1)); if (k > v) v = k; }
  }
  return v;
}

/* ---------------------------------------------------------------- routes (analytic ship motion) */
function prepRoute(sp) {
  const P = sp.mode === 'loop' ? sp.path.concat([sp.path[0]]) : sp.path;
  const S = [0];
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  return { P, S, L: S[S.length - 1] };
}
function along(rt, s, out) {
  const { P, S, L } = rt;
  if (s <= 0) s = 0; else if (s >= L) s = L;
  let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], seg = S[hi] - S[lo] || 1, u = (s - S[lo]) / seg;
  out.x = a[0] + (b[0] - a[0]) * u; out.z = a[1] + (b[1] - a[1]) * u;
  // heading from a short chord round the point (smooth through the rounded corners)
  const s0 = Math.max(0, s - 40), s1 = Math.min(L, s + 40);
  if (s1 - s0 > 1) {
    pt(rt, s0, P0_); pt(rt, s1, P1_);
    out.hdg = Math.atan2(P1_.x - P0_.x, P1_.z - P0_.z);
  }
  return out;
}
const P0_ = { x: 0, z: 0 }, P1_ = { x: 0, z: 0 };
function pt(rt, s, o) {
  const { P, S } = rt; let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], u = (s - S[lo]) / ((S[hi] - S[lo]) || 1);
  o.x = a[0] + (b[0] - a[0]) * u; o.z = a[1] + (b[1] - a[1]) * u;
}
/* distance along a leg of length L at time u, speed v, easing in (acc) / out (dec) over D m */
function legS(L, v, u, acc, dec) {
  const D = Math.min(600, L / 3), Ta = acc ? 2 * D / v : 0, Td = dec ? 2 * D / v : 0, sA = acc ? D : 0, sD = dec ? D : 0;
  const Tm = (L - sA - sD) / v;
  if (u < Ta) return { s: v * u * u / (2 * Ta), k: u / Ta };
  if (u < Ta + Tm) return { s: sA + v * (u - Ta), k: 1 };
  const w = Math.min(Td, u - Ta - Tm);
  return { s: sA + v * Tm + v * w - v * w * w / (2 * Td || 1), k: Td ? 1 - w / Td : 0 };
}
function legT(L, v, acc, dec) { const D = Math.min(600, L / 3); return (L - (acc ? D : 0) - (dec ? D : 0)) / v + (acc ? 2 * D / v : 0) + (dec ? 2 * D / v : 0); }
/* ship state at sim time t -> { x, z, hdg, v (m/s, signed along the path), vis } */
function shipAt(sh, t, o) {
  const sp = sh.spec, rt = sh.rt, v = sp.speed;
  o.vis = true;
  if (sp.mode === 'through' || sp.mode === 'loop') {
    let s = (v * t + sp.phase * rt.L) % rt.L; if (s < 0) s += rt.L;
    along(rt, s, o); o.v = v; o.dir = 1; return o;
  }
  if (sp.mode === 'call' || sp.mode === 'shuttle') {
    const d0 = sp.dwell ? sp.dwell[0] : 600, d1 = sp.dwell ? sp.dwell[1] : 600;
    const shuttle = sp.mode === 'shuttle';
    const T1 = legT(rt.L, v, !shuttle ? false : true, true), T2 = legT(rt.L, v, true, !shuttle ? false : true);
    const cyc = T1 + d0 + T2 + d1;
    let u = (t + sp.phase * cyc) % cyc; if (u < 0) u += cyc;
    if (u < T1) { const q = legS(rt.L, v, u, shuttle, true); along(rt, q.s, o); o.v = v * q.k; o.dir = 1; return o; }
    u -= T1;
    if (u < d0) {
      along(rt, rt.L, o); o.v = 0; o.dir = 1;
      if (!shuttle) { const h0 = o.hdg, k = ss(0, 240, u); o.hdg = h0 + Math.PI * k; }
      return o;
    }
    u -= d0;
    if (u < T2) { const q = legS(rt.L, v, u, true, shuttle); along(rt, rt.L - q.s, o); o.v = v * q.k; o.dir = shuttle ? -1 : 1; if (!shuttle) o.hdg += Math.PI; return o; }
    u -= T2;
    along(rt, 0, o); o.v = 0; o.dir = 1;
    if (!shuttle) { o.vis = false; }
    return o;
  }
  along(rt, 0, o); o.v = 0; return o;
}

/* ---------------------------------------------------------------- plumes */
const PLUME = {
  steam: { rate: .8, life: 320, H: 520, tau: 60, climb: .8, r0: 30, grow: 8.5, B: .75, cap: 75, wk: .85, big: true, budget: 9000 },
  fumarole: { rate: 1.4, life: 50, H: 45, tau: 10, climb: .35, r0: 2.6, grow: 2, B: .95, cap: 46, wk: .9, budget: 1800 },
  mud: { rate: .7, life: 20, H: 10, tau: 5, climb: .25, r0: .8, grow: .7, B: 1, cap: 30, wk: .7, budget: 500 },
};

export async function createLandmarks(game, ctx) {
  const R = game.R, T = R.terrain, map = game.map, M = R.models;
  const t0 = performance.now();
  const plan = planLandmarks(map);
  const ground = (x, z) => T.heightAt(x, z);
  const stats = { ms: 0, inst: 0, dots: 0, ships: 0, plan: plan.ms, build: 0 };

  /* ---------- models ---------- */
  for (const [k, f] of Object.entries(LM_MODELS)) if (!M.has(k)) M.registerModel(k, f, { lods: LM_INFO[k].s });
  const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const items = [];              // static instances: { d, cx, cy, cz, r, far, float, x, z, near }
  const addItem = (d, r, o) => { const it = Object.assign({ d, cx: d.T[0], cy: d.T[1], cz: d.T[2], r, far: null }, o || {}); items.push(it); return it; };
  for (const s of plan.statics) {
    if (!M.has(s.key)) continue;
    const y = s.on === 'abs' ? s.y : s.on === 'sea' ? 0 : Math.max(0, ground(s.x, s.z)) + (s.dy || 0);
    const d = { key: s.key, T: [s.x, y, s.z], R: attitude(s.hdg || 0, s.pitch || 0, s.roll || 0), st: s.st || {}, tint: 'neutral', alpha: s.alpha === undefined ? .9 : s.alpha, dissolve: s.dissolve || 0 };
    const info = LM_INFO[s.key];
    const r = s.r || (info ? Math.hypot(info.size[0], info.size[1], info.size[2]) / 2 : 30);
    addItem(d, r, { float: !!s.float, hdg: s.hdg || 0, x: s.x, z: s.z, small: !!s.small, name: s.name, spec: s });
    for (const l of s.lights || []) {
      const q = l.p, Rm = d.R;
      plan.lights.push({ x: s.x + Rm[0] * q[0] + Rm[1] * q[1] + Rm[2] * q[2], y: y + Rm[3] * q[0] + Rm[4] * q[1] + Rm[5] * q[2], z: s.z + Rm[6] * q[0] + Rm[7] * q[1] + Rm[8] * q[2], on: 'abs', ch: l.ch, col: l.col, range: l.range || 8000, name: s.name });
    }
  }
  // settlements and parametric builds: a chunked model near, a merged one far
  const built = new Map();
  const buildOnce = (key, spec) => { let m = built.get(key); if (!m) { const a = performance.now(); m = buildLandmark(spec, ground); built.set(key, m); stats.build += performance.now() - a; } return m; };
  const addBuild = (spec, i) => {
    const key = 'lmb_' + map.id + '_' + i, lods = spacingFor(spec);
    M.registerModel(key, () => buildOnce(key, spec), { lods });
    M.registerModel(key + '_far', () => { const m = buildOnce(key, spec); return { parts: mergeParts(m.parts, spec.farParts || 3) }; }, { lods: [lods[2], lods[3], lods[3] * 2.5, lods[3] * 6] });
    const cx = spec.cx !== undefined ? spec.cx : spec.x, cz = spec.cz !== undefined ? spec.cz : spec.z;
    const cy = spec.cy !== undefined ? spec.cy : Math.max(0, ground(cx, cz));
    const d = { key: key + '_far', T: [spec.x, 0, spec.z], R: spec.hdg !== undefined ? attitude(spec.hdg, 0, 0) : I3, st: {}, tint: 'neutral', alpha: spec.alpha === undefined ? .9 : spec.alpha };
    return addItem(d, spec.r, { cx, cy, cz, near: key, far: key + '_far', name: spec.name, spec });
  };
  const lit = [];                // settlements' windows and lamps
  plan.settlements.forEach((S, i) => {
    S.kind = 'settlement'; S.base = settlementBase(S, ground); S.alpha = .62;
    addBuild(S, 's' + i);
    const L = settlementLights(S, ground);
    lit.push({ S, windows: L.windows, lamps: L.lamps, cx: S.x, cz: S.z, r: S.r });
  });
  plan.builds.forEach((b, i) => { const it = addBuild(b, 'b' + i); if (b.lights) b.lights.forEach(l => plan.lights.push(l)); void it; });

  /* ---------- ships ---------- */
  const ships = plan.ships.filter(s => M.has(s.key) && s.path && s.path.length > 1).map((spec, i) => {
    const info = LM_INFO[spec.key];
    return { spec, rt: prepRoute(spec), info, d: { key: spec.key, T: [0, 0, 0], R: I3.slice(), st: {}, tint: 'neutral', alpha: .78 },
      wake: new Wake({ L: info.size[0], B: info.size[1], len: Math.min(900, info.size[0] * 6 + 150), rate: info.size[0] > 60 ? 2.5 : 4, seed: 900 + i }), pose: { x: 0, z: 0, hdg: 0, v: 0 } };
  });
  stats.ships = ships.length;

  /* ---------- lights ---------- */
  const lights = plan.lights.map((l, i) => ({ l, C: parseCh(l.ch), ph: hsh(i, 77) * 97, rgb: COL[l.col] || COL.w, y0: l.on === 'ground' ? Math.max(0, ground(l.x, l.z)) + l.y : l.y }));
  const beams = plan.beams.map((b, i) => {
    const gy = Math.max(0, ground(b.x, b.z));
    // beam dots in the beam's frame: log-spaced out to 2.4 km, inside a 2 x 4 degree cone
    // a pencil of light (1.5 degrees) out to 3.3 km: denser near the lens, soft across
    const N = 900, P = new Float32Array(N * 4);
    for (let k = 0; k < N; k++) {
      const u = hsh(k, 31 + i), s = 14 + 3300 * Math.pow(u, 1.45), g = GT[(k * 7 + i * 131) & GM], g2 = GT[(k * 13 + 5 + i * 17) & GM];
      P[k * 4] = s; P[k * 4 + 1] = g * 2 * s * Math.tan(1.5 * DEG); P[k * 4 + 2] = g2 * 2 * s * Math.tan(1.1 * DEG) - s * .003; P[k * 4 + 3] = hsh(k, 34);
    }
    return { b, x: b.x, z: b.z, y: gy + b.lampY, P, site: null, hdg: 0, ph: hsh(i, 5) };
  });
  const plumes = plan.plumes.map((p, i) => ({ p, K: PLUME[p.kind] || PLUME.fumarole, y: p.on === 'abs' ? p.y : Math.max(0, ground(p.x, p.z)) + (p.dy || 0), seed: 101 + i * 37 }));

  /* gas flares: the tip of each platform's flare boom */
  const flares = plan.flares.map((f, i) => {
    const Rm = attitude(f.hdg || 0, 0, 0), q = f.tip || [PLAT.FLARE[0], PLAT.FLARE[1] + 3.2, PLAT.FLARE[2]], y0 = f.tip ? Math.max(0, ground(f.x, f.z)) : 0;
    return { x: f.x + Rm[0] * q[0] + Rm[1] * q[1] + Rm[2] * q[2], y: y0 + Rm[3] * q[0] + Rm[4] * q[1] + Rm[5] * q[2], z: f.z + Rm[6] * q[0] + Rm[7] * q[1] + Rm[8] * q[2], seed: 31 + i * 17, k: f.small ? .3 : 1 };
  });
  /* waterfalls: the path on the drawn ground, and the time along it (the water speeds up as it drops) */
  const falls = plan.falls.map((f, i) => {
    const n = f.path.length, P = new Float32Array(n * 3), Tt = new Float32Array(n);
    for (let k = 0; k < n; k++) { const p = f.path[k]; P[k * 3] = p[0]; P[k * 3 + 1] = Math.max(0, ground(p[0], p[1])) + .6; P[k * 3 + 2] = p[1]; }
    const h0 = P[1];
    for (let k = 1; k < n; k++) {
      const seg = Math.hypot(P[k * 3] - P[k * 3 - 3], P[k * 3 + 1] - P[k * 3 - 2], P[k * 3 + 2] - P[k * 3 - 1]);
      const v = Math.max(1.6, .72 * Math.sqrt(2 * 9.81 * Math.max(0, h0 - P[k * 3 + 1])));
      Tt[k] = Tt[k - 1] + seg / v;
    }
    let cx = 0, cy = 0, cz = 0; for (let k = 0; k < n; k++) { cx += P[k * 3] / n; cy += P[k * 3 + 1] / n; cz += P[k * 3 + 2] / n; }
    let r = 0; for (let k = 0; k < n; k++) r = Math.max(r, Math.hypot(P[k * 3] - cx, P[k * 3 + 1] - cy, P[k * 3 + 2] - cz));
    return { f, P, T: Tt, total: Tt[n - 1], n, w: f.width || 10, seed: 51 + i * 23, cx, cy, cz, r: r + 40 };
  });
  /* ---------- the frame ---------- */
  const tmp = { x: 0, z: 0, hdg: 0, v: 0 };
  let warmI = 0;
  const warmList = [];
  for (const it of items) warmList.push(it.far || it.d.key);
  for (const s of ships) warmList.push(s.spec.key);

  function camInfo() {
    const cam = game.camera, fl1080 = 540 / Math.tan(cam.fov / 2);
    return { cam, e: cam.eye, f: cam.f, r: cam.r, u: cam.u, tx: (cam.W / 2) / cam.fl * 1.08, ty: (cam.H / 2) / cam.fl * 1.08, fl1080 };
  }
  /* in the view (with a margin r) -> distance, else -1 */
  function view(C, x, y, z, r) {
    const dx = x - C.e[0], dy = y - C.e[1], dz = z - C.e[2];
    const zc = dx * C.f[0] + dy * C.f[1] + dz * C.f[2];
    if (zc < -r) return -1;
    const xc = dx * C.r[0] + dy * C.r[1] + dz * C.r[2], yc = dx * C.u[0] + dy * C.u[1] + dz * C.u[2];
    const zz = Math.max(zc, 1);
    if (Math.abs(xc) - r > zz * C.tx || Math.abs(yc) - r > zz * C.ty) return -1;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function drawItems(C) {
    let n = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const dist = view(C, it.cx, it.cy, it.cz, it.r);
      if (dist < 0) continue;
      const px = it.r * C.fl1080 / Math.max(1, dist);
      if (px < (it.small ? 1.2 : .6)) continue;
      const d = it.d;
      if (it.near) {
        d.key = dist - it.r < NEAR ? it.near : it.far;
        // far off, a build thins to a haze of returns rather than a white blot
        const a0 = it.spec.alpha === undefined ? .9 : it.spec.alpha;
        d.alpha = a0 * (1 - .45 * ss(8000, 40000, dist));
      }
      if (it.float) {
        const sa = T.seaAt(it.x, it.z, game.seaT);
        d.T[1] = sa.y;
        if (dist < 2500) d.R = attitude(it.hdg, Math.atan(sa.gz) * .6, -Math.atan(sa.gx) * .6);
      }
      R.draw(d); n++;
    }
    return n;
  }

  function drawShips(C, sink, night) {
    let dots = 0;
    for (const sh of ships) {
      const p = shipAt(sh, game.t, sh.pose);
      if (!p.vis) continue;
      const L = sh.info.size[0], dist = view(C, p.x, 0, p.z, L);
      if (dist < 0 && !sh.wake.rows.length) continue;
      const sa = T.seaAt(p.x, p.z, game.seaT), k = Math.min(1, 50 / L);
      sh.d.T[0] = p.x; sh.d.T[1] = sa.y * k; sh.d.T[2] = p.z;
      const px = L * C.fl1080 / Math.max(1, dist);
      if (dist >= 0 && px > .8) {
        sh.d.R = attitude(p.hdg, -Math.atan(sa.gx * Math.sin(p.hdg) + sa.gz * Math.cos(p.hdg)) * k * .5, Math.atan(sa.gx * Math.cos(p.hdg) - sa.gz * Math.sin(p.hdg)) * k * .6);
        R.draw(sh.d);
      }
      // the wake along the way it is going
      const mh = p.dir < 0 ? p.hdg + Math.PI : p.hdg;
      if (Math.abs(p.v) > .3 && dist >= 0 && dist < 30000) sh.wake.update([p.x, 0, p.z], mh, Math.abs(p.v), game.t);
      if (sh.wake.rows.length && dist >= 0 && dist < 30000 && px > 3) { sh.wake.draw(R.fx, .55 * Math.min(1, Math.abs(p.v) / 5 + .3)); dots += sh.wake.rows.length * 6; }
      // navigation lights
      if (night > .2 && dist >= 0 && dist < 22000 && sh.info.lights) {
        const Rm = sh.d.R, rel = Math.atan2(C.e[0] - p.x, C.e[2] - p.z) - p.hdg;
        const rw = Math.atan2(Math.sin(rel), Math.cos(rel)) / DEG;     // + to starboard
        for (const l of sh.info.lights) {
          if (l.arc === 'mast' && Math.abs(rw) > 112.5) continue;
          if (l.arc === 'stbd' && (rw < 0 || rw > 112.5)) continue;
          if (l.arc === 'port' && (rw > 0 || rw < -112.5)) continue;
          if (l.arc === 'stern' && Math.abs(rw) < 112.5) continue;
          const q = l.p, x = p.x + Rm[0] * q[0] + Rm[1] * q[1] + Rm[2] * q[2], y = sh.d.T[1] + Rm[3] * q[0] + Rm[4] * q[1] + Rm[5] * q[2], z = p.z + Rm[6] * q[0] + Rm[7] * q[1] + Rm[8] * q[2];
          const c = COL[l.col] || COL.w, a = night * sat(1.3 - dist / 12000);
          sink.add(x, y, z, dist < 600 ? -.5 : 2, c[0], c[1], c[2], a);
          sink.glow(x, y, z, dist < 1500 ? -4 : 7, c[0], c[1], c[2], .26 * a);
          dots += 2;
        }
      }
    }
    return dots;
  }

  function drawLights(C, sink, night) {
    let dots = 0;
    const tr = game.realT;
    for (const L of lights) {
      const l = L.l;
      const y = l.on === 'sea' ? L.y0 + T.seaAt(l.x, l.z, game.seaT).y : L.y0;
      const dist = view(C, l.x, y, l.z, 10);
      if (dist < 0 || dist > l.range * 2.4) continue;
      const v = chAt(L.C, tr + L.ph);
      const a = v * night * (dist < l.range ? 1 : .35 + .65 * sat((l.range * 2.4 - dist) / (l.range * 1.4)));
      if (a < .02) continue;
      const c = L.rgb;
      sink.add(l.x, y, l.z, dist < 1500 ? -Math.max(.35, dist * .0012) : 2, c[0], c[1], c[2], a);
      sink.glow(l.x, y, l.z, dist < 3000 ? -6 : 6, c[0], c[1], c[2], .22 * a);
      if (dist < 1200) sink.light(l.x, y, l.z, c[0], c[1], c[2], .12 * a, 14);
      dots += 2;
    }
    return dots;
  }

  /* the objective's lighthouse lens: turn the site the render system queued (it keeps its st object) */
  function siteFor(b) {
    for (const d of R.queue) if (d.key === 'lighthouse' && d.id === undefined && Math.abs(d.T[0] - b.x) < 3 && Math.abs(d.T[2] - b.z) < 3) return d;
    return null;
  }
  function drawBeams(C, sink, night) {
    let dots = 0;
    const tr = game.realT;
    for (const B of beams) {
      const b = B.b;
      if (!B.site && b.site) { B.site = siteFor(B); if (B.site) { B.y = B.site.T[1] + b.lampY; B.hdg = B.site.hdg || 0; } }
      const lens = (tr / b.rot + B.ph) * TAU;
      if (B.site) B.site.st.lamp = lens % TAU;
      const dist = view(C, B.x, B.y, B.z, 2600);
      if (dist < 0 || dist > b.range * 3) continue;
      // the flash: the nearest beam's angle to the line of sight
      const toEye = Math.atan2(C.e[0] - B.x, C.e[2] - B.z);
      let best = 1e9;
      for (let k = 0; k < b.n; k++) { const h = B.hdg + lens + k * TAU / b.n, dd = Math.atan2(Math.sin(toEye - h), Math.cos(toEye - h)); if (Math.abs(dd) < best) best = Math.abs(dd); }
      const fl = Math.exp(-((best / (1.6 * DEG)) ** 2));
      const a0 = night * (dist < b.range ? 1 : .4 + .6 * sat((b.range * 3 - dist) / (b.range * 2)));
      const aL = a0 * (.12 + .88 * fl);
      sink.add(B.x, B.y, B.z, dist < 2000 ? -1.2 : fl > .3 ? 3 : 2, 255, 252, 240, Math.min(1, aL * 1.3));
      sink.glow(B.x, B.y, B.z, dist < 4000 ? -(4 + 40 * fl) : 4 + 34 * fl, 255, 250, 236, .32 * aL);
      if (fl > .05 && dist < 6000) sink.light(B.x, B.y, B.z, 255, 250, 236, .5 * fl * night, 90);
      sink.light(B.x, B.y, B.z, 255, 250, 236, .1 * night, 12);
      // the beams in the air (dusk and night)
      if (night > .5 && dist < 26000) {
        const q = dist < 8000 ? 1 : dist < 16000 ? 2 : 4, P = B.P, bk = (night - .5) * 2;
        for (let k = 0; k < b.n; k++) {
          const h = B.hdg + lens + k * TAU / b.n, s = Math.sin(h), c = Math.cos(h);
          for (let j = 0; j < P.length; j += 4 * q) {
            const d = P[j], lx = P[j + 1], ly = P[j + 2];
            const x = B.x + s * d + c * lx, z = B.z + c * d - s * lx, y = B.y + ly;
            const al = bk * .62 * Math.pow(1 - d / 3400, 1.2) * Math.min(1, d / 160) * (.4 + .6 * P[j + 3]) * q;
            if (al < .015) continue;
            sink.add(x, y, z, dist < 5000 && d < 900 ? 2 : 1, 238, 240, 226, al > 1 ? 1 : al);
            dots++;
          }
        }
      }
    }
    return dots;
  }

  /* plumes: each puff's place from its age (rises under its ceiling, drifts downwind, more with height, spreads);
     a dot budget per plume (two passes: count, then draw thinned with the alpha compensated) */
  const PB = new Float32Array(1024 * 8);
  function drawPlumes(C, sink, night) {
    let dots = 0;
    const t = game.seaT, W = (game.weather && game.weather.wind) || (map.weather && map.weather.wind) || [0, 0];
    for (const pl of plumes) {
      const K = pl.K, sc = pl.p.scale || 1, H = K.H * sc;
      const dist = view(C, pl.p.x + W[0] * K.life * .25, pl.y + H * .5, pl.p.z + W[1] * K.life * .25, H * 1.5 + Math.hypot(W[0], W[1]) * K.life * .5);
      if (dist < 0) continue;
      const pxm = C.fl1080 / Math.max(1, dist);
      if (K.r0 * sc * pxm < .15 && K.grow * sc * 5 * pxm < .4) continue;
      const dtE = 1 / K.rate, iNow = Math.floor(t / dtE), nP = Math.min(1024, Math.ceil(K.life / dtE));
      const thin = pxm * K.r0 * sc < .6 ? 3 : pxm * K.r0 * sc < 2 ? 1 : 0;
      // pass 1: the puffs and their dot counts
      let n = 0, want = 0;
      for (let c = 0; c < nP; c++) {
        const idx = iNow - c; if (idx & thin) continue;
        const a = t - idx * dtE; if (a <= 0 || a > K.life) continue;
        const e = 1 - Math.exp(-a / K.tau);
        const h = H * e * (.75 + .5 * hsh(idx, pl.seed)) + K.climb * a;
        const wk = K.wk * (1 + h / 300);
        const dr = a - K.tau * .6 * (1 - Math.exp(-a / (K.tau * .6)));
        const tb = (1.2 + .35 * Math.sqrt(a)) * K.r0 * sc * .6;
        const n1 = Math.sin(idx * 1.7 + a * .11) + Math.sin(idx * .61 + a * .07), n2 = Math.sin(idx * 2.3 + a * .09 + 1) + Math.sin(idx * .43 + a * .13);
        const rad = K.r0 * sc + K.grow * sc * Math.sqrt(a) + .06 * h, rp = rad * pxm;
        const nd = Math.max(1, Math.round(Math.min(K.cap, 2 + rp * rp * (K.big ? .05 : .03))));
        const o = n * 8;
        PB[o] = pl.p.x + W[0] * dr * wk + n1 * tb; PB[o + 1] = pl.y + h; PB[o + 2] = pl.p.z + W[1] * dr * wk + n2 * tb;
        PB[o + 3] = rad; PB[o + 4] = nd; PB[o + 5] = a; PB[o + 6] = idx; PB[o + 7] = h;
        want += nd; n++;
      }
      const q = Math.min(1, K.budget * DK / Math.max(1, want)), qa = 1 / Math.sqrt(q);
      // pass 2: draw
      for (let i = 0; i < n; i++) {
        const o = i * 8, rad = PB[o + 3], a = PB[o + 5], idx = PB[o + 6], h = PB[o + 7], rp = rad * pxm;
        const nd = Math.max(1, Math.round(PB[o + 4] * q));
        const al = K.B * sat(a / 3) * Math.pow(1 - a / K.life, 1.1) * Math.min(1, 3.2 / Math.sqrt(PB[o + 4] / 3)) * (thin ? 1.5 : 1) * (.6 + .8 * hsh(idx, pl.seed + 1)) * Math.min(1.8, qa);
        if (al < .01) continue;
        // a volcano's vent glow on the underside of its plume at night
        const glow = pl.p.glow ? night * pl.p.glow * Math.exp(-h / 160) : 0;
        const cr = STEAM[0] + (WARM[0] - STEAM[0]) * glow, cg = STEAM[1] + (WARM[1] - STEAM[1]) * glow * .6, cb = STEAM[2] + (WARM[2] - STEAM[2]) * glow;
        const g0 = (idx * 37 + pl.seed) & GM, sz = rp > (K.big ? 22 : 40) || (K.r0 < 1 && rp > 10) ? 2 : 1;
        const bx = PB[o], by = PB[o + 1], bz = PB[o + 2], aa = Math.min(1, al * (1 + glow));
        for (let m = 0; m < nd; m++) {
          const j = (g0 + m * 1733) & GM;
          sink.dot(bx + GT[j] * rad, by + GT[(j + 1) & GM] * rad * .7, bz + GT[(j + 2) & GM] * rad, sz, cr, cg, cb, aa);
        }
        dots += nd;
      }
      if (pl.p.glow && night > .3 && dist < 20000) {
        const fl = .75 + .25 * Math.sin(game.realT * .7 + pl.seed) * Math.sin(game.realT * 1.9);
        sink.light(pl.p.x, pl.y + 20, pl.p.z, 255, 226, 184, .22 * pl.p.glow * night * fl, 420);
        sink.glow(pl.p.x, pl.y + 10, pl.p.z, -60, 255, 226, 184, .05 * night * fl);
      }
    }
    return dots;
  }

  /* a gas flare: tongues of flame off the tip, white-hot at the seat and thinning, leaning downwind, flickering in
     real time; its light on the platform and the water round it */
  function drawFlares(C, sink, night) {
    let dots = 0;
    const tr = game.realT, W = (game.weather && game.weather.wind) || (map.weather && map.weather.wind) || [0, 0];
    for (const F of flares) {
      const dist = view(C, F.x, F.y + 8, F.z, 30);
      if (dist < 0) continue;
      const pxm = C.fl1080 / Math.max(1, dist), fl = .78 + .22 * Math.sin(tr * 7.3 + F.seed) * Math.sin(tr * 2.9 + F.seed * .7);
      if (dist < 30000) sink.light(F.x, F.y + 8 * F.k, F.z, 240, 255, 190, (.35 + .4 * night) * fl * F.k, 220 * F.k);
      if (pxm * 16 < 3) {
        sink.add(F.x, F.y + 5, F.z, dist > 20000 ? 2 : 3, 255, 252, 230, fl);
        sink.glow(F.x, F.y + 5, F.z, 10, 240, 255, 190, (.16 + .22 * night) * fl);
        dots += 2; continue;
      }
      const nF = Math.round(Math.min(900, 90 + (16 * pxm * F.k) ** 2 * .12) * DK), big = pxm > 1.2 ? 2 : 1;
      for (let j = 0; j < nF; j++) {
        const H = (9 + 15 * Math.pow(hsh(j, F.seed + 3), 1.3)) * F.k, ph = tr * (1.1 + 1.1 * hsh(j, F.seed + 5)) + hsh(j, F.seed + 6), u = ph - Math.floor(ph);
        const sr = (1 + u * 2.6) * Math.sqrt(F.k), a0 = hsh(j, F.seed + 1) * TAU, rr = Math.sqrt(hsh(j, F.seed + 2)) * sr;
        const lean = u * u * H * .16, sway = Math.sin(tr * 2.3 + j) * .5 * u;
        const x = F.x + Math.cos(a0) * rr + W[0] * lean + sway, z = F.z + Math.sin(a0) * rr + W[1] * lean, y = F.y + u * H;
        const hot = 1 - u, al = Math.pow(1 - u, .7) * (.55 + .45 * hsh(j + Math.floor(ph), F.seed + 7)) * fl;
        if (al < .04) continue;
        sink.add(x, y, z, big, 198 + 57 * hot, 255, 50 + 185 * hot * hot, al > 1 ? 1 : al);
      }
      sink.glow(F.x, F.y + 8, F.z, -26, 240, 255, 190, (.1 + .14 * night) * fl);
      dots += nF;
    }
    return dots;
  }

  /* a waterfall: droplets along the fall line (spread out as they speed up), the stream above the lip, and the
     spray drifting off the foot */
  function drawFalls(C, sink, night) {
    let dots = 0;
    const t = game.seaT, W = (game.weather && game.weather.wind) || [0, 0];
    for (const F of falls) {
      const dist = view(C, F.cx, F.cy, F.cz, F.r);
      if (dist < 0 || dist > 40000) continue;
      const q = Math.max(1, Math.round((dist < 2500 ? 1 : dist < 7000 ? 2 : dist < 16000 ? 4 : 8) / DK)), rate = 110, P = F.P, T = F.T;
      const i0 = Math.floor(t * rate), N = Math.ceil(F.total * rate);
      const bright = .5 + .15 * night, sz = dist < 1200 ? -.45 : 1;
      let k = 0;
      for (let j = 0; j < N; j += q) {
        const idx = i0 - j, a = t - idx / rate;
        if (a < 0 || a > F.total) continue;
        while (k > 0 && T[k] > a) k--;
        while (k < F.n - 2 && T[k + 1] < a) k++;
        const u = (a - T[k]) / ((T[k + 1] - T[k]) || 1), o = k * 3;
        const x = P[o] + (P[o + 3] - P[o]) * u, y = P[o + 1] + (P[o + 4] - P[o + 1]) * u, z = P[o + 2] + (P[o + 5] - P[o + 2]) * u;
        const dx = P[o + 3] - P[o], dz = P[o + 5] - P[o + 2], L = Math.hypot(dx, dz) || 1;
        const steep = Math.min(1, Math.abs(P[o + 4] - P[o + 1]) / L), fa = a / F.total;
        // braided strands that fan out as the water falls, swaying a little in the wind
        const strand = ((idx % 3) - 1) * F.w * .3 * (1 + fa), spreadW = F.w * (.2 + 1.3 * Math.pow(fa, .8)) * (.3 + .7 * steep);
        const lat = strand + (hsh(idx, F.seed) - .5) * spreadW + Math.sin(t * .7 + a * .9 + F.seed) * 2.2 * fa * steep;
        const out = hsh(idx, F.seed + 1) * (2 + 5 * fa) * steep;
        sink.dot(x - dz / L * lat + dx / L * out * .2, y + out * .3, z + dx / L * lat + dz / L * out * .2, sz, 232, 238, 236, bright * (.6 + .4 * hsh(idx, F.seed + 2)) * (q > 1 ? 1.3 : 1));
        dots++;
      }
      // spray at the foot: drifting with the wind, rising a little, fading
      const e = (F.n - 1) * 3, bx = P[e], by = P[e + 1], bz = P[e + 2], nM = Math.round((dist < 6000 ? 320 : 80) * DK), big = Math.min(1.8, Math.max(.6, (P[1] - by) / 300));
      for (let m = 0; m < nM; m++) {
        const life = 7, ph = (t / life + hsh(m, F.seed + 9)) % 1, a = ph * life;
        const ang = hsh(m, F.seed + 10) * TAU, rad = (3 + 22 * Math.sqrt(ph)) * big * (.5 + hsh(m, F.seed + 11));
        sink.dot(bx + Math.cos(ang) * rad + W[0] * a * .6, by + 1 + a * 1.3 * hsh(m, F.seed + 12), bz + Math.sin(ang) * rad + W[1] * a * .6, 1, 226, 232, 230, .35 * (1 - ph));
      }
      dots += nM;
    }
    return dots;
  }

  function drawWindows(C, sink, night) {
    let dots = 0;
    if (night < .35) return 0;
    const k = (night - .35) / .65, e = C.e;
    for (const Lt of lit) {
      const dist = view(C, Lt.cx, 20, Lt.cz, Lt.r);
      if (dist < 0 || dist > 110000) continue;
      const W = Lt.windows, step = dist < 6000 ? 1 : dist < 15000 ? 2 : dist < 40000 ? 4 : 8, near = dist < 3500;
      for (let i = 0; i < W.length; i += 6 * step) {
        const x = W[i], y = W[i + 1], z = W[i + 2], h = W[i + 3];
        if (near && (e[0] - x) * W[i + 4] + (e[2] - z) * W[i + 5] < 0) continue;       // the wall faces away
        const a = k * (.55 + .45 * h);
        // near: additive (they glow); far: max blend, so a town's thousand windows never pile up into a blot
        if (dist < 7000) sink.add(x, y, z, near ? 2 : 1, WARM[0], WARM[1], WARM[2], a > 1 ? 1 : a);
        else sink.dot(x, y, z, 1, WARM[0], WARM[1], WARM[2], a * (dist < 30000 ? 1 : .8));
        if (near && h > .82) sink.glow(x, y, z, -2.2, WARM[0], WARM[1], WARM[2], .1 * k);
        dots++;
      }
      const Lp = Lt.lamps;
      for (let i = 0; i < Lp.length; i += 6 * (dist < 15000 ? 1 : dist < 40000 ? 2 : 4)) {
        if (dist < 7000) sink.add(Lp[i], Lp[i + 1], Lp[i + 2], dist < 2500 ? -.8 : 1, 255, 222, 176, .6 * k);
        else sink.dot(Lp[i], Lp[i + 1], Lp[i + 2], 1, 255, 222, 176, .75 * k);
        if (dist < 5000) sink.glow(Lp[i], Lp[i + 1], Lp[i + 2], -6, 255, 222, 176, .06 * k);
        dots++;
      }
    }
    return dots;
  }

  let DK = 1, minLight = 0, lsink = null;
  stats.init = Math.round(performance.now() - t0);
  console.log(`ONIKS: landmarks on ${map.id}: ${items.length} sites, ${plan.settlements.length} settlements, ${ships.length} ships, ${lights.length} lights, ${beams.length} lighthouses, ${plumes.length} plumes; plan ${plan.ms} ms, init ${stats.init} ms` + (plan.notes.length ? ' · ' + plan.notes.join('; ') : ''));

  return {
    name: 'landmarks', priority: (PRI.render || 10) + 2,
    plan, items, ships, stats, lights, beams, plumes, flares, falls,
    update() {
      // pre-sample one model's coarse levels a frame (no stall at the start)
      if (warmI < warmList.length) { const k = warmList[warmI++]; try { if (M.has(k)) M.warm(k); } catch (e) { console.warn('landmarks: warm ' + k, e); } }
    },
    draw3d(frame) {
      const a = performance.now();
      // the Effects setting: dot share and the weakest light cast (the sink's lights go through a filter)
      const lvl = (game.settings && game.settings.effects) || 'high', D = DETAIL[lvl] || DETAIL.high;
      DK = D.k; minLight = D.light; stats.detail = lvl;
      if (!lsink || lsink.base !== frame.sink) {
        const base = frame.sink;
        lsink = Object.create(base); lsink.base = base;
        lsink.light = (x, y, z, r, g, b, i, rad) => { if (i >= minLight) base.light(x, y, z, r, g, b, i, rad); };
      }
      const C = camInfo(), sink = lsink, night = TIME_K[T.time] !== undefined ? TIME_K[T.time] : 1;
      let dots = 0;
      stats.inst = drawItems(C);
      dots += drawShips(C, sink, night);
      dots += drawLights(C, sink, night);
      dots += drawBeams(C, sink, night);
      dots += drawPlumes(C, sink, night);
      dots += drawWindows(C, sink, night);
      dots += drawFlares(C, sink, night);
      dots += drawFalls(C, sink, night);
      stats.dots = dots;
      stats.ms = stats.ms * .9 + (performance.now() - a) * .1;
    },
  };
}
