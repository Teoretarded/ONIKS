/* Layout helpers shared by the generated maps. */
import { bestSite } from '../analyze.js';
import { ss } from '../noise.js';

/* a land point on the shore (within `shore` m of water) near (x, z), best by score */
export function shorePoint(A, x, z, R, score, shore) {
  shore = shore || 400;
  let best = null, bs = -Infinity;
  const st = A.P.cell;
  for (let dz = -R; dz <= R; dz += st) for (let dx = -R; dx <= R; dx += st) {
    const px = x + dx, pz = z + dz;
    if (!A.isLand(px, pz) || A.coastDist(px, pz) > shore) continue;
    const s = (score ? score(px, pz) : 0) - Math.hypot(dx, dz) / (R * 4);
    if (s > bs) { bs = s; best = { x: px, z: pz }; }
  }
  return best;
}

/* flatness over a radius: mean slope sampled on two rings (lower is flatter) */
export function roughness(A, x, z, r) {
  let s = A.slope(x, z);
  for (let a = 0; a < 8; a++) {
    const t = a / 8 * Math.PI * 2;
    s += A.slope(x + Math.sin(t) * r, z + Math.cos(t) * r) + A.slope(x + Math.sin(t) * r * 0.5, z + Math.cos(t) * r * 0.5);
  }
  return s / 17;
}

/* all land within radius r? */
export function allLand(A, x, z, r) {
  if (!A.isLand(x, z)) return false;
  for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2; if (!A.isLand(x + Math.sin(t) * r, z + Math.cos(t) * r)) return false; }
  return true;
}
/* all water deeper than d within radius r? */
export function allSea(A, x, z, r, d) {
  d = d == null ? -20 : d;
  if (A.h(x, z) > d) return false;
  for (let ring = 1; ring <= 2; ring++) for (let a = 0; a < 16; a++) {
    const t = a / 16 * Math.PI * 2; if (A.h(x + Math.sin(t) * r * ring / 2, z + Math.cos(t) * r * ring / 2) > d) return false;
  }
  return true;
}

/* the coast spawn: land near water, fairly flat, with high ground within 10 km; facing the sea */
export function coastSpawn(A, box, opt) {
  opt = opt || {};
  const s = bestSite(A, (x, z) => {
    if (!allLand(A, x, z, 900)) return -Infinity;
    const cd = A.coastDist(x, z);
    if (cd > (opt.maxCoast || 4000) || cd < 700) return -Infinity;
    const r = roughness(A, x, z, 700);
    const pk = A.peakNear(x, z, 9000)[2] - A.h(x, z);
    return -r * 25 + Math.min(pk, opt.wantRise || 250) / 60 - cd / 3000 + (opt.score ? opt.score(x, z) : 0);
  }, { box, stride: 2, jitter: 0.2 });
  if (!s) return null;
  return { x: s.x, z: s.z, r: opt.r || 2500, hdg: A.seaward(s.x, s.z) };
}

/* a fleet spawn: deep water, clear of land by `clear` m, near (x, z) */
export function fleetSpawn(A, x, z, R, hdgTo, opt) {
  opt = opt || {};
  const s = bestSite(A, (px, pz) => {
    if (!allSea(A, px, pz, opt.clear || 6000, opt.depth || -30)) return -Infinity;
    return -Math.hypot(px - x, pz - z) / 1000 + A.shoreDist(px, pz) / 4000;
  }, { box: [x - R, z - R, x + R, z + R], stride: 4, edge: 2500 });
  const p = s || { x, z };
  const hdg = Math.atan2(hdgTo[0] - p.x, hdgTo[1] - p.z);
  return { x: p.x, z: p.z, r: opt.r || 6000, hdg };
}

export { bestSite, ss };
