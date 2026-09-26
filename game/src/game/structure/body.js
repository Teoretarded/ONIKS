/* Structure physics: a ship's hull as rigid pieces in the water (game/structure/index.js drives it).

   A piece is a run of the hull's sections (layout.js) that still hangs together: one rigid body (6 degrees of freedom:
   the centre of mass p, the orientation q model -> world, velocity v, spin w, all world), its mass and inertia summed
   from its sections. Each step (fixed, sim seconds; semi-implicit Euler):
     buoyancy   every section's columns (vertical, keel to deck, model frame) cut by the water surface: rho g V of the
                part under water, at its centre, less what the flooded compartment has lost (flood 0..1 per section and
                side); a column lifted clear carries nothing, a capsized one pushes the other way
     water      damping per column (linear + quadratic, weak along the hull, strong across and up), added mass
     gravity    per section at its centre of mass
     hinge      a joint just failed holds at the keel (hogging) or the deck (sagging) for a few seconds as a stiff
                spring between the two new pieces: the break sags, the plating tears through, then they are free
   Bending: the moment the hull girder carries at each joint inside a piece (the forces on one side, less their
   inertia, about the joint, across the hull) is checked against the joint's strength (game/structure/index.js
   sets it from the hits); a joint that gives way splits the piece there.
   Flooding (index.js): each section and side floods through its holes, an open torn end under water (fast), from a
   flooded neighbour (a bulkhead giving way: slow), and a slow leak once she is lost.
   Nothing here allocates per step. */

const G = 9.81, RHO = 1025;

export function qMat(q, o) {
  const w = q[0], x = q[1], y = q[2], z = q[3];
  o[0] = 1 - 2 * (y * y + z * z); o[1] = 2 * (x * y - w * z); o[2] = 2 * (x * z + w * y);
  o[3] = 2 * (x * y + w * z); o[4] = 1 - 2 * (x * x + z * z); o[5] = 2 * (y * z - w * x);
  o[6] = 2 * (x * z - w * y); o[7] = 2 * (y * z + w * x); o[8] = 1 - 2 * (x * x + y * y);
  return o;
}
export function matQ(m, q) {
  const tr = m[0] + m[4] + m[8];
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q[0] = .25 * s; q[1] = (m[7] - m[5]) / s; q[2] = (m[2] - m[6]) / s; q[3] = (m[3] - m[1]) / s; }
  else if (m[0] > m[4] && m[0] > m[8]) { const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; q[0] = (m[7] - m[5]) / s; q[1] = .25 * s; q[2] = (m[1] + m[3]) / s; q[3] = (m[2] + m[6]) / s; }
  else if (m[4] > m[8]) { const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; q[0] = (m[2] - m[6]) / s; q[1] = (m[1] + m[3]) / s; q[2] = .25 * s; q[3] = (m[5] + m[7]) / s; }
  else { const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; q[0] = (m[3] - m[1]) / s; q[1] = (m[2] + m[6]) / s; q[2] = (m[5] + m[7]) / s; q[3] = .25 * s; }
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
  return q;
}
function qTurn(q, wx, wy, wz, h) {
  const a = Math.hypot(wx, wy, wz) * h;
  if (a < 1e-12) return;
  const s = Math.sin(a / 2) / (a / h), c = Math.cos(a / 2), dx = wx * s, dy = wy * s, dz = wz * s;
  const w = q[0], x = q[1], y = q[2], z = q[3];
  q[0] = c * w - dx * x - dy * y - dz * z; q[1] = c * x + dx * w + dy * z - dz * y; q[2] = c * y - dx * z + dy * w + dz * x; q[3] = c * z + dx * y - dy * x + dz * w;
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
}
export function slerpM(qa, qb, t, o, tmp) {
  let d = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3], s = 1;
  if (d < 0) { d = -d; s = -1; }
  for (let i = 0; i < 4; i++) tmp[i] = qa[i] * (1 - t) + qb[i] * s * t;
  const l = Math.hypot(tmp[0], tmp[1], tmp[2], tmp[3]) || 1; tmp[0] /= l; tmp[1] /= l; tmp[2] /= l; tmp[3] /= l;
  return qMat(tmp, o);
}

/* a piece of ship `S` (index.js) made of sections i0..i1 */
export function newPiece(S, i0, i1) {
  const P = {
    S, i0, i1, m: 0, cm: [0, 0, 0], I: [1, 1, 1],
    p: [0, 0, 0], q: [1, 0, 0, 0], v: [0, 0, 0], w: [0, 0, 0], pp: [0, 0, 0], pq: [1, 0, 0, 0],
    R: [1, 0, 0, 0, 1, 0, 0, 0, 1], cut0: null, cut1: null, sunk: false, sunkT: -1, wetK: 0, low: 0, top: 0, over: new Float32Array(S.n + 1),
    lastFail: -1e9, id: S.pieceN++, inst: null, instB: null, keep: 0,
  };
  massOf(P);
  return P;
}
export function massOf(P) {
  const S = P.S, L = S.L, sec = L.sec;
  let m = 0, z = 0;
  for (let i = P.i0; i <= P.i1; i++) { m += sec[i].m; z += sec[i].m * sec[i].zc; }
  z /= m;
  P.m = m; P.cm[0] = 0; P.cm[1] = L.yG; P.cm[2] = z;
  let Ix = 0, Iy = 0, Iz = 0;
  for (let i = P.i0; i <= P.i1; i++) {
    const s = sec[i], lx = 2 * S.H.beam(s.zc), ly = S.H.deck(s.zc) + S.H.keel(s.zc), lz = s.len, dz = s.zc - z;
    s.Ix = s.m / 12 * (ly * ly + lz * lz);
    Ix += s.Ix + s.m * dz * dz;
    Iy += s.m / 12 * (lx * lx + lz * lz) + s.m * dz * dz;
    Iz += s.m / 12 * (lx * lx + ly * ly);
  }
  P.I[0] = Ix; P.I[1] = Iy; P.I[2] = Iz;
}

/* scratch */
const F = [0, 0, 0], TQ = [0, 0, 0], VB = [0, 0, 0], T3 = [0, 0, 0], A3 = [0, 0, 0], AL = [0, 0, 0];

/* one step of every piece of ship S over h (sim s); sea(x, z) -> the water's height there */
export function stepShip(S, h, sea, t, bed) {
  const L = S.L, sec = L.sec, n = L.n, FS = S.FS, MS = S.MS;
  for (const P of S.pieces) {
    P.pp[0] = P.p[0]; P.pp[1] = P.p[1]; P.pp[2] = P.p[2];
    P.pq[0] = P.q[0]; P.pq[1] = P.q[1]; P.pq[2] = P.q[2]; P.pq[3] = P.q[3];
    if (P.sunk) continue;
    qMat(P.q, P.R);
    P.fx = 0; P.fy = 0; P.fz = 0; P.tx = 0; P.ty = 0; P.tz = 0;
  }
  // hinges: the two pieces of a fresh break held at the keel or the deck, tearing free
  for (const J of S.hinges) {
    if (J.gone) continue;
    const A = J.A, B = J.B, age = t - J.t0;
    const k = J.k * (1 - ss(J.hold, J.hold + J.tear, age));
    if (k <= 0 || A.sunk || B.sunk) { J.gone = true; continue; }
    const hm = J.hm;
    const ax = hm[0] - A.cm[0], ay = hm[1] - A.cm[1], az = hm[2] - A.cm[2], bx = hm[0] - B.cm[0], by = hm[1] - B.cm[1], bz = hm[2] - B.cm[2];
    const RA = A.R, RB = B.R;
    const rax = RA[0] * ax + RA[1] * ay + RA[2] * az, ray = RA[3] * ax + RA[4] * ay + RA[5] * az, raz = RA[6] * ax + RA[7] * ay + RA[8] * az;
    const rbx = RB[0] * bx + RB[1] * by + RB[2] * bz, rby = RB[3] * bx + RB[4] * by + RB[5] * bz, rbz = RB[6] * bx + RB[7] * by + RB[8] * bz;
    const dx = B.p[0] + rbx - A.p[0] - rax, dy = B.p[1] + rby - A.p[1] - ray, dz = B.p[2] + rbz - A.p[2] - raz;
    const vax = A.v[0] + A.w[1] * raz - A.w[2] * ray, vay = A.v[1] + A.w[2] * rax - A.w[0] * raz, vaz = A.v[2] + A.w[0] * ray - A.w[1] * rax;
    const vbx = B.v[0] + B.w[1] * rbz - B.w[2] * rby, vby = B.v[1] + B.w[2] * rbx - B.w[0] * rbz, vbz = B.v[2] + B.w[0] * rby - B.w[1] * rbx;
    const c = J.c * k / J.k;
    const fx = k * dx + c * (vbx - vax), fy = k * dy + c * (vby - vay), fz = k * dz + c * (vbz - vaz);
    J.gap = Math.hypot(dx, dy, dz);
    A.fx += fx; A.fy += fy; A.fz += fz; A.tx += ray * fz - raz * fy; A.ty += raz * fx - rax * fz; A.tz += rax * fy - ray * fx;
    B.fx -= fx; B.fy -= fy; B.fz -= fz; B.tx -= rby * fz - rbz * fy; B.ty -= rbz * fx - rbx * fz; B.tz -= rbx * fy - rby * fx;
    // the load it carries (for the sparks and the grinding)
    J.load = Math.hypot(fx, fy, fz);
  }
  for (const P of S.pieces) {
    if (P.sunk) continue;
    const R = P.R, cm = P.cm;
    const ex = R[0], ey = R[3], ez = R[6];             // model +X in the world (across)
    const lx = R[2], ly = R[5], lz = R[8];             // model +Z (along)
    let sub = 0, colN = 0, low = 1e9, top = -1e9, vmax = 0;
    for (let i = P.i0; i <= P.i1; i++) {
      const s = sec[i];
      let fsx = 0, fsy = 0, fsz = 0, msx = 0, msy = 0, msz = 0;
      // the water under the section (the swell as drawn, at its middle)
      const zc = s.zc - cm[2], ycm = -cm[1];
      const wx = P.p[0] + R[1] * ycm + R[2] * zc, wz = P.p[2] + R[7] * ycm + R[8] * zc;
      const yw = sea(wx, wz);
      for (let c = 0; c < s.cols.length; c++) {
        const C = s.cols[c];
        const mx = C.x, mz = C.z - cm[2];
        const bx0 = mx, by0 = C.yb - cm[1], tx0 = mx, ty0 = C.yt - cm[1];
        // world ends (relative to the COM)
        const bX = R[0] * bx0 + R[1] * by0 + R[2] * mz, bY = R[3] * bx0 + R[4] * by0 + R[5] * mz, bZ = R[6] * bx0 + R[7] * by0 + R[8] * mz;
        const tX = R[0] * tx0 + R[1] * ty0 + R[2] * mz, tY = R[3] * tx0 + R[4] * ty0 + R[5] * mz, tZ = R[6] * tx0 + R[7] * ty0 + R[8] * mz;
        const yb = P.p[1] + bY, yt = P.p[1] + tY;
        vmax += C.A * (C.yt - C.yb) * (1 - S.flood[i * 2 + C.side]);
        if (yb < low) low = yb; if (yt < low) low = yt; if (yb > top) top = yb; if (yt > top) top = yt;
        let fr, fx0, fy0, fz0;                           // fraction under water, the wet end
        if (yb <= yw && yt <= yw) { fr = 1; }
        else if (yb > yw && yt > yw) { fr = 0; }
        else fr = yb < yt ? (yw - yb) / (yt - yb) : (yw - yt) / (yb - yt);
        colN++;
        if (fr <= 0) continue;
        sub += fr;
        // the centre of the wet part
        let cx, cy, cz;
        if (fr >= 1) { cx = (bX + tX) * .5; cy = (bY + tY) * .5; cz = (bZ + tZ) * .5; }
        else if (yb < yt) { const k = fr * .5; cx = bX + (tX - bX) * k; cy = bY + (tY - bY) * k; cz = bZ + (tZ - bZ) * k; }
        else { const k = fr * .5; cx = tX + (bX - tX) * k; cy = tY + (bY - tY) * k; cz = tZ + (bZ - tZ) * k; }
        const vol = C.A * (C.yt - C.yb) * fr, fl = S.flood[i * 2 + C.side];
        let fy = RHO * G * vol * (1 - fl);
        // the water's drag at that point: strong across and up, weak along the hull
        const vx = P.v[0] + P.w[1] * cz - P.w[2] * cy, vy = P.v[1] + P.w[2] * cx - P.w[0] * cz, vz = P.v[2] + P.w[0] * cy - P.w[1] * cx;
        const va = vx * lx + vy * ly + vz * lz;          // along
        const kl = C.k1 * fr, kq = C.k2 * fr, sp = Math.hypot(vx, vy, vz);
        let dx = -(kl + kq * sp) * (vx - lx * va * .93), dy = -(kl + kq * sp) * (vy - ly * va * .93), dz = -(kl + kq * sp) * (vz - lz * va * .93);
        fy += dy;
        fsx += dx; fsy += fy; fsz += dz;
        msx += cy * dz - cz * fy; msy += cz * dx - cx * dz; msz += cx * fy - cy * dx;
      }
      // gravity at the section's centre of mass
      const gx = R[1] * (s.m ? 0 : 0) + R[2] * zc + R[1] * 0, gy = R[5] * zc, gz = R[8] * zc;   // (its y is the piece's: cm y)
      const wgt = -s.m * G;
      fsy += wgt; msx += -gz * wgt; msz += gx * wgt;
      FS[i * 3] = fsx; FS[i * 3 + 1] = fsy; FS[i * 3 + 2] = fsz;
      MS[i * 3] = msx; MS[i * 3 + 1] = msy; MS[i * 3 + 2] = msz;
      P.fx += fsx; P.fy += fsy; P.fz += fsz; P.tx += msx; P.ty += msy; P.tz += msz;
    }
    P.wetK = colN ? sub / colN : 0; P.low = low; P.top = top;
    // added mass: the water round a hull moves with it
    const ka = P.ka = 1 + .7 * Math.min(1, P.wetK * 1.5);
    const im = 1 / (P.m * ka);
    A3[0] = P.fx * im; A3[1] = P.fy * im; A3[2] = P.fz * im;
    // angular: I_w^-1 tau = R I^-1 R^T tau
    const bx = R[0] * P.tx + R[3] * P.ty + R[6] * P.tz, by = R[1] * P.tx + R[4] * P.ty + R[7] * P.tz, bz = R[2] * P.tx + R[5] * P.ty + R[8] * P.tz;
    const ax = bx / (P.I[0] * ka), ay = by / (P.I[1] * ka), az = bz / (P.I[2] * ka);
    AL[0] = R[0] * ax + R[1] * ay + R[2] * az; AL[1] = R[3] * ax + R[4] * ay + R[5] * az; AL[2] = R[6] * ax + R[7] * ay + R[8] * az;
    // the girder: the moment across the hull at each joint inside the piece
    if (P.i1 > P.i0) bending(P, S, t);
    P.v[0] += A3[0] * h; P.v[1] += A3[1] * h; P.v[2] += A3[2] * h;
    P.w[0] += AL[0] * h; P.w[1] += AL[1] * h; P.w[2] += AL[2] * h;
    // a little air and water damping of the spin (numerical calm; the columns do the real work)
    const wd = Math.exp(-h * .02); P.w[0] *= wd; P.w[1] *= wd; P.w[2] *= wd;
    P.p[0] += P.v[0] * h; P.p[1] += P.v[1] * h; P.p[2] += P.v[2] * h;
    qTurn(P.q, P.w[0], P.w[1], P.w[2], h);
    // the bottom (shallow water, a beach): she comes to rest on it
    if (bed) {
      const gy = bed(P.p[0], P.p[2]);
      if (low < gy) { P.p[1] += Math.min(1, gy - low); if (P.v[1] < 0) P.v[1] = 0; const k = Math.exp(-h * 1.5); P.v[0] *= k; P.v[2] *= k; P.w[0] *= k; P.w[1] *= k; P.w[2] *= k; P.aground = true; }
    }
    // under for good: what buoyancy is left (every column under) can no longer carry her, and she is well down
    P.reserve = RHO * vmax / P.m - 1;
    if (P.reserve < 0 && top < -6 && (P.v[1] < 0 || P.aground)) { P.sunk = true; P.sunkT = t; }
  }
}

/* the moments across the hull at the joints inside piece P (the forces on the bow side of each, less their inertia,
   about the joint, on the model's X axis); P.over[j] = moment / strength (> 1: it gives way) */
function bending(P, S, t) {
  const L = S.L, sec = L.sec, R = P.R, cm = P.cm, FS = S.FS, MS = S.MS;
  const ex = R[0], ey = R[3], ez = R[6];
  for (let j = P.i0 + 1; j <= P.i1; j++) {
    const zj = L.zc[j] - cm[2];
    const jx = R[2] * zj, jy = R[5] * zj, jz = R[8] * zj;            // the joint relative to the COM (world)
    let Mx = 0, My = 0, Mz = 0;
    for (let i = j; i <= P.i1; i++) {
      const s = sec[i], zs = s.zc - cm[2];
      const rx = R[2] * zs, ry = R[5] * zs, rz = R[8] * zs;
      // external: the moment about the COM less the force's about the joint
      const fx = FS[i * 3], fy = FS[i * 3 + 1], fz = FS[i * 3 + 2];
      Mx += MS[i * 3] - (jy * fz - jz * fy); My += MS[i * 3 + 1] - (jz * fx - jx * fz); Mz += MS[i * 3 + 2] - (jx * fy - jy * fx);
      // inertial: -m a_s at the section, a_s = a + alpha x r_s
      const asx = A3[0] + AL[1] * rz - AL[2] * ry, asy = A3[1] + AL[2] * rx - AL[0] * rz, asz = A3[2] + AL[0] * ry - AL[1] * rx;
      // (with its share of the water carried along: the added mass the piece moves with)
      const mk = s.m * P.ka, ix = -mk * asx, iy = -mk * asy, iz = -mk * asz, dx = rx - jx, dy = ry - jy, dz = rz - jz;
      Mx += dy * iz - dz * iy; My += dz * ix - dx * iz; Mz += dx * iy - dy * ix;
    }
    let m = Mx * ex + My * ey + Mz * ez;
    // the sections' own turning inertia (about the hull's cross axis)
    const ax = AL[0] * ex + AL[1] * ey + AL[2] * ez;
    for (let i = j; i <= P.i1; i++) m -= P.ka * sec[i].Ix * ax;
    P.over[j] = m / Math.max(1, S.cap[j]);
  }
}

export const ss = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };

/* split piece P at joint j (P.i0 < j <= P.i1) into two, keeping its motion; -> [A (stern side), B (bow side)] */
export function splitPiece(S, P, j) {
  const A = newPiece(S, P.i0, j - 1), B = newPiece(S, j, P.i1);
  for (const X of [A, B]) {
    const dx = X.cm[0] - P.cm[0], dy = X.cm[1] - P.cm[1], dz = X.cm[2] - P.cm[2], R = P.R;
    const rx = R[0] * dx + R[1] * dy + R[2] * dz, ry = R[3] * dx + R[4] * dy + R[5] * dz, rz = R[6] * dx + R[7] * dy + R[8] * dz;
    X.p[0] = P.p[0] + rx; X.p[1] = P.p[1] + ry; X.p[2] = P.p[2] + rz;
    X.v[0] = P.v[0] + P.w[1] * rz - P.w[2] * ry; X.v[1] = P.v[1] + P.w[2] * rx - P.w[0] * rz; X.v[2] = P.v[2] + P.w[0] * ry - P.w[1] * rx;
    X.w[0] = P.w[0]; X.w[1] = P.w[1]; X.w[2] = P.w[2];
    for (let i = 0; i < 4; i++) { X.q[i] = P.q[i]; X.pq[i] = P.q[i]; }
    X.pp[0] = X.p[0]; X.pp[1] = X.p[1]; X.pp[2] = X.p[2];
    qMat(X.q, X.R);
  }
  A.cut0 = P.cut0; B.cut1 = P.cut1;
  return [A, B];
}

/* the columns' water damping, once per ship (k1 linear, k2 quadratic, per column) */
export function dampOf(L, zeta) {
  for (const s of L.sec) {
    const mc = s.m / s.cols.length;
    for (const C of s.cols) {
      const kst = RHO * G * C.A;                           // heave stiffness of the column
      C.k1 = 2 * zeta * Math.sqrt(kst * mc * 1.7);
      C.k2 = .5 * RHO * 1.0 * C.A * .6;
    }
  }
}
