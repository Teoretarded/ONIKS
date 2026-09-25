/* What is about to happen to a round (presentation only: reads the sim, never changes it). For one round p:
     interceptors   rounds whose target is p: time to go from the range and the closing speed (the standard estimate;
                    good for a guided round on a collision course), the meet point along p's path
     gun bursts     bursts at p: their rounds in the air (closest approach of each to p's straight path) or, before the
                    first is fired, the burst's time of flight
     gun ahead      a defended unit's gun whose reach p is about to enter (the engagement to come: the camera pulls back
                    for it early; the time rate waits for the burst itself)
     impact         p's target unit: distance over speed
   predict(game, p, out) -> out = { tEv, kind ('intercept' | 'gun' | ''), src, qId, gunUnit, meet, q (the threat's position now),
   tImpact, gunSoon, gunSoonUnit } in game seconds; FAR (1e9) when nothing is coming. */

const FAR = 1e9;
const GUN_CACHE = new Map();       // round id -> { t, list: [{ u, w }] } the guns that may reach it (rebuilt every 1 s of game time)

export function newPrediction() {
  return { tEv: FAR, kind: '', src: 0, meet: [0, 0, 0], q: [0, 0, 0], tImpact: FAR, gunSoon: FAR, gunPos: [0, 0, 0], qId: 0, gunUnit: 0, gunSoonUnit: 0 };
}

export function predict(game, p, out) {
  const { sim } = game;
  out.tEv = FAR; out.kind = ''; out.src = 0; out.tImpact = FAR; out.gunSoon = FAR; out.qId = 0; out.gunUnit = 0; out.gunSoonUnit = 0;
  if (!p || !p.alive) return out;
  const P = p.pos, v = p.vel || [0, 0, 0];
  const vx = v[0], vy = v[1], vz = v[2];
  // interceptors
  for (const q of sim.projectiles.values()) {
    if (!q.alive || q.tk !== 'proj' || q.target !== p.id || !sim.projVisible(game.side, q)) continue;
    const dx = q.pos[0] - P[0], dy = q.pos[1] - P[1], dz = q.pos[2] - P[2];
    const w = q.vel || [0, 0, 0];
    const wx = w[0] - vx, wy = w[1] - vy, wz = w[2] - vz;
    const R = Math.hypot(dx, dy, dz) || 1;
    const close = -(dx * wx + dy * wy + dz * wz) / R;
    if (close < 5) continue;
    const t = R / close;
    if (t < out.tEv) {
      out.tEv = t; out.kind = 'intercept'; out.src = q.id; out.qId = q.id;
      out.q[0] = q.pos[0]; out.q[1] = q.pos[1]; out.q[2] = q.pos[2];
      out.meet[0] = P[0] + vx * t; out.meet[1] = P[1] + vy * t; out.meet[2] = P[2] + vz * t;
    }
  }
  // gun bursts at it
  const L = sim.bursts;
  if (L) for (const B of L) {
    if (B.tk !== 'proj' || B.target !== p.id) continue;
    let best = FAR, bx = 0, by = 0, bz = 0, any = false;
    for (let i = 0; i < B.n; i += 2) {
      const st = B.st[i];
      if (st === 2) continue;
      any = true;
      if (st !== 1) continue;
      const k = i * 3, dx = B.x[k] - P[0], dy = B.x[k + 1] - P[1], dz = B.x[k + 2] - P[2];
      const wx = B.v[k] - vx, wy = B.v[k + 1] - vy, wz = B.v[k + 2] - vz;
      const w2 = wx * wx + wy * wy + wz * wz || 1;
      const t = -(dx * wx + dy * wy + dz * wz) / w2;
      if (t < -.05) continue;
      if (t < best) { best = Math.max(0, t); bx = B.x[k]; by = B.x[k + 1]; bz = B.x[k + 2]; }
    }
    if (!any) continue;
    if (best === FAR) {
      // nothing in the air yet (or only rounds already past): the burst's own time of flight
      const t = B.t0 + B.tof - sim.t;
      if (t < -.3) continue;
      best = Math.max(0, t); bx = B.aim[0]; by = B.aim[1]; bz = B.aim[2];
    }
    if (best < out.tEv) {
      out.tEv = best; out.kind = 'gun'; out.src = B.id; out.qId = 0; out.gunUnit = B.unit;
      out.q[0] = bx; out.q[1] = by; out.q[2] = bz;
      out.meet[0] = P[0] + vx * best; out.meet[1] = P[1] + vy * best; out.meet[2] = P[2] + vz * best;
    }
  }
  // guns it is about to come within reach of (for the camera)
  let G = GUN_CACHE.get(p.id);
  if (!G || sim.t - G.t > 1) {
    G = { t: sim.t, list: [] };
    for (const u of sim.units.values()) {
      if (!u.alive || u.side === p.side || u.aboard) continue;
      const W = u.def.weapons; if (!W) continue;
      for (const wn in W) {
        const w = W[wn];
        if (!w.gun || !w.vs || !w.vs.includes('missile') || !(u.ammo && u.ammo[wn] > 0)) continue;
        if (Math.hypot(u.pos[0] - P[0], u.pos[2] - P[2]) > w.range + 12000) continue;
        const vu = game.vis ? game.vis(u) : 'own';
        if (vu !== 'own' && vu !== 'track') continue;
        G.list.push({ u, w });
      }
    }
    GUN_CACHE.set(p.id, G);
    if (GUN_CACHE.size > 64) for (const k of GUN_CACHE.keys()) { if (!sim.projectiles.has(k)) GUN_CACHE.delete(k); }
  }
  for (const { u, w } of G.list) {
    if (!u.alive) continue;
    const dx = P[0] - u.pos[0], dy = P[1] - (u.pos[1] + 5), dz = P[2] - u.pos[2];
    const Rg = w.range * .95;
    // |d + v t| = Rg: the first root
    const a = vx * vx + vy * vy + vz * vz || 1, b = 2 * (dx * vx + dy * vy + dz * vz), c = dx * dx + dy * dy + dz * dz - Rg * Rg;
    let tIn;
    if (c <= 0) tIn = 0;
    else { const D = b * b - 4 * a * c; if (D < 0 || b > 0) continue; tIn = (-b - Math.sqrt(D)) / (2 * a); }
    const t = tIn + Math.min(3, Rg / (w.v0 || 1100));
    if (t < out.gunSoon) { out.gunSoon = t; out.gunSoonUnit = u.id; out.gunPos[0] = u.pos[0]; out.gunPos[1] = u.pos[1] + 4; out.gunPos[2] = u.pos[2]; }
  }
  // impact on its target unit
  if (p.tk === 'unit') {
    const u = sim.units.get(p.target);
    if (u && u.alive && !u.aboard) {
      const H = Math.min(u.def.size[2] * .4, 14);
      const d = Math.max(0, Math.hypot(u.pos[0] - P[0], u.pos[1] + H - P[1], u.pos[2] - P[2]) - Math.max(6, u.def.size[1] * .5));
      out.tImpact = d / Math.max(80, Math.hypot(vx, vy, vz) || p.spd || 200);
    }
  }
  return out;
}
