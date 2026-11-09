/* How aircraft deliver their rounds (the F/A-18's SLAM-ER, the MH-60R's Hellfire), for attack orders at a unit or at
   a point. The order's weapon range is not the whole story: the aircraft climbs out and accelerates first, flies
   fast and low to a release point chosen outside the threat rings it knows of (classified SAMs of the other side),
   turns to face the target, releases level-ish and on the heading of the target (the round leaves along the
   aircraft's axis off its pylon / rail, then turns), and egresses the way it came.

   airEngage(sim, u, o, w, x, z) -> 'close' | 'fire'      (orders.js engageFrom, for air units)
   airReady(sim, u, w, x, z)     -> true when a release now is sensible (weapons.js gates every air launch on it)
   airEgress(sim, u, x, z)       -> after the last round of a volley: turn away and leave (weapons.js)
   Per unit: u.altT (ordered height over the ground), u.vAir (ordered airspeed, 0 = cruise), u.faceTo ([x, z] a
   hovering helicopter points its nose at), u.strk (a strike profile is on: dynamics.js resets it when the order ends).
   Deterministic, no allocation per tick beyond the order's own state (made once per order). */
import { UNITS } from '../data/units.js';
import { clamp, angTo, dxz } from './util.js';

/* the profile per aircraft type: ingress height over the ground (m), ingress speed (x cruise), climb-out (m, s),
   release: heading error (rad), bank (rad), how slow (x cruise, fixed wing) */
const PROF = {
  fighter: { alt: 450, fast: 1.25, outAlt: 350, outT: 14, hdgTol: .14, bank: .3, vMin: .8 },
  helo: { alt: 60, fast: 1, outAlt: 25, outT: 8, hdgTol: .08, bank: .2, vMax: 12 },
};
const DEF = { alt: 300, fast: 1.1, outAlt: 200, outT: 10, hdgTol: .2, bank: .4, vMin: .6 };
export const profOf = u => PROF[u.type] || DEF;

/* the other side's air-defence rings the side knows of: [x, z, r] per classified launcher, cached per second */
const RINGS = { coast: { t: -1, v: [] }, fleet: { t: -1, v: [] } };
function ringsFor(sim, side) {
  const R = RINGS[side];
  if (R.t === sim.tick - (sim.tick % 20) && R.sim === sim) return R.v;
  R.t = sim.tick - (sim.tick % 20); R.sim = sim; R.v.length = 0;
  for (const c of sim.sides[side].contacts.values()) {
    if (c.dead || c.dom === 'air' || c.dom === 'sub' || c.cls !== 'SAM') continue;
    const e = sim.units.get(c.unitId); if (!e) continue;
    let r = 0;
    const W = UNITS[e.type].weapons;
    for (const k in W) { const q = W[k]; if (q.auto && q.vs.includes('air')) r = Math.max(r, q.airRange || q.range); }
    if (r > 0) R.v.push(c.pos[0], c.pos[2], r + 2500);
  }
  return R.v;
}
/* how deep (m) a point lies inside the rings, summed; and how much of a straight leg crosses them */
function inRings(L, x, z) { let s = 0; for (let i = 0; i < L.length; i += 3) { const d = dxz(x, z, L[i], L[i + 1]); if (d < L[i + 2]) s += L[i + 2] - d; } return s; }
function legCross(L, ax, az, bx, bz) {
  let s = 0;
  const vx = bx - ax, vz = bz - az, ll = vx * vx + vz * vz || 1;
  for (let i = 0; i < L.length; i += 3) {
    const t = clamp(((L[i] - ax) * vx + (L[i + 1] - az) * vz) / ll, 0, 1), d = dxz(ax + vx * t, az + vz * t, L[i], L[i + 1]);
    if (d < L[i + 2]) s += L[i + 2] - d;
  }
  return s;
}

/* the release point: on a circle round the target at a release range inside the weapon's envelope, on the side the
   aircraft comes from, moved round (±60 deg) and out (to 95 % of the range) to stay clear of the rings; scored by
   the ring depth of the point and of the leg to it, and the extra distance flown */
function releasePoint(sim, u, w, x, z, out) {
  const L = ringsFor(sim, u.side), min = w.min || 0, rng = w.range;
  const r0 = clamp(rng * (u.type === 'helo' ? .8 : .7), min * 1.6, rng * .9), b0 = Math.atan2(u.pos[0] - x, u.pos[2] - z), d0 = dxz(u.pos[0], u.pos[2], x, z);
  let best = 1e18;
  for (let ri = 0; ri < 4; ri++) {
    const r = r0 + (rng * .95 - r0) * ri / 3;
    for (let k = 0; k < 7; k++) {
      const b = b0 + (k === 0 ? 0 : (k & 1 ? 1 : -1) * Math.ceil(k / 2) * .35);
      const px = x + Math.sin(b) * r, pz = z + Math.cos(b) * r;
      const s = inRings(L, px, pz) * 20 + legCross(L, u.pos[0], u.pos[2], px, pz) * 3 + dxz(u.pos[0], u.pos[2], px, pz) * .2 + Math.abs(r - r0) * .05;
      if (s < best) { best = s; out[0] = px; out[1] = pz; out[2] = r; }
    }
    if (best < d0 * .2 + 1 && !L.length) break;
  }
  return out;
}

function begin(u) {
  if (u.strk) return;
  u.strk = true;
}
/* the strike is over (order ended or egress): back to the type's own height and cruise */
export function endStrike(u) {
  u.strk = false; u.strkPh = ''; u.vAir = 0; u.faceTo = null; u.altT = u.def.altDef || 0;
}

export function airEngage(sim, u, o, w, x, z) {
  const P = profOf(u), t = sim.t, heli = u.type === 'helo';
  const A = o._air || (o._air = { rp: [0, 0, 0], rpT: -1e9, ph: 'out' });
  begin(u);
  const d = dxz(u.pos[0], u.pos[2], x, z);
  // climb-out: straight on, gaining height and speed, before anything else
  const young = t - (u.born || 0) < P.outT || u.pos[1] - Math.max(0, sim.map.h(u.pos[0], u.pos[2])) < P.outAlt || (!heli && u.speed < u.def.speed * .85);
  u.strkPh = A.ph;
  if (A.ph === 'out' && young) {
    u.goal = [u.pos[0] + Math.sin(u.hdg) * 6000, u.pos[2] + Math.cos(u.hdg) * 6000]; u.orbitR = 0;
    u.altT = Math.max(P.alt, P.outAlt + 50); u.vAir = 0;
    return 'close';
  }
  if (A.ph === 'out') A.ph = u.strkPh = 'in';
  if (t - A.rpT > 2 || A.x !== x || A.z !== z) { releasePoint(sim, u, w, x, z, A.rp); A.rpT = t; A.x = x; A.z = z; }
  const rr = A.rp[2];
  u.altT = P.alt; u.orbitR = 0; u.faceTo = null;
  if (d < (w.min || 0) * 1.15) {
    // too close to release: open out along the way it came and come round again
    const k = ((w.min || 0) * 1.6) / Math.max(1, d);
    u.goal = [x + (u.pos[0] - x) * k, z + (u.pos[2] - z) * k]; u.vAir = u.def.speed * P.fast; A.ph = u.strkPh = 'in';
    return 'close';
  }
  if (A.ph === 'in') {
    // ingress: fast and low to the release point
    const dr = dxz(u.pos[0], u.pos[2], A.rp[0], A.rp[1]);
    if (dr > (heli ? 400 : 2500) && d > rr * .98) {
      u.goal = [A.rp[0], A.rp[1]]; u.vAir = u.def.speed * P.fast;
      if (heli && dr < 1500) u.vAir = Math.max(P.vMax, u.def.speed * dr / 1500);
      return 'close';
    }
    A.ph = 'rel';
  }
  u.strkPh = A.ph;
  if (d > w.range * .97) { A.ph = u.strkPh = 'in'; return 'close'; }
  // release: face the target (fixed wing: fly at it; a helicopter: slow to a near hover, nose on it, and pop up
  // until it sees the target over the ground between: its Hellfire needs the line of sight)
  if (heli) {
    u.goal = [u.pos[0], u.pos[2]]; u.vAir = 0; u.faceTo = [x, z];
    if (w.proj === 'hellfire' && !sight(sim, u, x, z)) { A.pop = Math.min(450, (A.pop || P.alt) + 2); }
    u.altT = Math.max(P.alt, A.pop || 0);
  }
  else { u.goal = [x, z]; u.vAir = u.def.speed; }
  return 'fire';
}

/* the line of sight from the aircraft to the ground point (x, z) (+3 m), over the terrain every 200 m */
function sight(sim, u, x, z) {
  const m = sim.map, ax = u.pos[0], ay = u.pos[1], az = u.pos[2], dx = x - ax, dz = z - az, d = Math.sqrt(dx * dx + dz * dz);
  const by = Math.max(0, m.h(x, z)) + 3, n = Math.min(60, Math.ceil(d / 200));
  for (let i = 1; i < n; i++) { const f = i / n; if (Math.max(0, m.h(ax + dx * f, az + dz * f)) > ay + (by - ay) * f) return false; }
  return true;
}
/* a release now: airborne and past the climb-out, nose on the target, wings near level, flying level, fast enough (a
   helicopter: nearly stopped); inside the envelope */
export function airReady(sim, u, w, x, z) {
  if (u.aboard || u.deck) return false;
  const P = profOf(u), d = dxz(u.pos[0], u.pos[2], x, z);
  if (d > w.range || d < (w.min || 0)) return false;
  if (sim.t - (u.born || 0) < P.outT || (u.strk && u.strkPh !== 'rel')) return false;
  const e = angTo(u.hdg, Math.atan2(x - u.pos[0], z - u.pos[2]));
  if (e > P.hdgTol || e < -P.hdgTol) return false;
  if (u.roll > P.bank || u.roll < -P.bank || u.pitch > .2 || u.pitch < -.15) return false;
  if (u.type === 'helo') return u.speed <= P.vMax + 2 && (!(w.proj === 'hellfire') || sight(sim, u, x, z));
  return u.speed >= u.def.speed * P.vMin;
}

/* the volley is away: turn and leave the way it came, 25 km out (a helicopter 12), clear of the rings */
export function airEgress(sim, u, x, z) {
  const P = profOf(u), L = ringsFor(sim, u.side), heli = u.type === 'helo';
  const b0 = Math.atan2(u.pos[0] - x, u.pos[2] - z), R = Math.max(dxz(u.pos[0], u.pos[2], x, z), 0) + (heli ? 12000 : 25000);
  let best = 1e18, gx = 0, gz = 0;
  for (let k = 0; k < 5; k++) {
    const b = b0 + (k === 0 ? 0 : (k & 1 ? 1 : -1) * Math.ceil(k / 2) * .4);
    const px = x + Math.sin(b) * R, pz = z + Math.cos(b) * R, s = inRings(L, px, pz) * 20 + legCross(L, u.pos[0], u.pos[2], px, pz) * 3 + Math.abs(k) * 500;
    if (s < best) { best = s; gx = px; gz = pz; }
  }
  u.goal = [gx, gz]; u.orbitR = 0; u.faceTo = null; u.vAir = heli ? 0 : u.def.speed * P.fast; u.altT = P.alt;
  u.egressT = sim.t;
}
