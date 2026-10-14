/* ORBITAL RAILGUN world (window.ORW(K) -> the world): the Earth seen from orbit (a dot globe, land brighter, the
   coast brightest, the limb's air glow, a thin cloud deck), the stars, and the coast the rod hits: a headland with
   a coastal battery, drawn as heightfield patches on regular lattices (dense round the strike and round the ground
   camera, coarse out to 15 km) and a moving sea, all with per-dot power-of-two LOD (no popping).
   World frame: metres, the site's plateau at the origin, +Y up, +Z inland (north), the sea to the south; the Earth's
   centre at (0, -RE, 0); far points drop under the curve. Everything is a pure function of the times passed in. */
window.ORW = function (K, OPT) {
OPT = OPT || {};
'use strict';
const { V, R, X, E, rng, noise, fbm } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const BW = 1920, BH = 1080;
const C = K.C;
const LIME = K.LIME, HOT = K.HOT, WH = K.WH;
const RE = 6371000, CE = [0, -RE, 0];
const CTZ = new Uint8Array(65536); CTZ[0] = 16; for (let i = 1; i < 65536; i++) { let c = 0, v = i; while (!(v & 1)) { v >>= 1; c++; } CTZ[i] = c; }
const IP2 = new Float32Array(17); for (let i = 0; i < 17; i++) IP2[i] = 1 / (1 << i);
const pow2 = x => { let p = 1; while (p < x && p < 65536) p <<= 1; return p; };
const SNT = new Float32Array(4096); for (let i = 0; i < 4096; i++) SNT[i] = Math.sin(i / 4096 * 2 * Math.PI);
const fsin = a => SNT[((a * 651.8986469) | 0) & 4095];
const drop = (x, z) => (x * x + z * z) / (2 * RE);
let U32_ = null;
const u32 = () => { const d = K.pb.d; if (!U32_ || U32_.buffer !== d.buffer) U32_ = new Uint32Array(d.buffer); return U32_; };
function lapW(s) { if (window.ORW_LOG) window.ORW_LOG.push(s + ' ' + (performance.now() | 0)); }

/* ---------------- the coast ---------------- */
function coastZ(x) { return -430 + 170 * noise(x / 900, 1.3) + 55 * noise(x / 260, 4.1) - 200 * E.ss(600, 2400, Math.abs(x)) + 260 * noise(x / 4200, 7.7) + 1400 * noise(x / 16000, 2.9) * E.ss(3000, 12000, Math.abs(x)); }
function coastBig(x) { return coastZ(x) + 42000 * noise(x / 230000, 3.3) * E.ss(15000, 80000, Math.abs(x)) + 90000 * fbm(x / 900000, 1.7, 2.2, 3) * E.ss(60000, 300000, Math.abs(x)); }
const SITE_C = [5, 20];                                    // the plateau centre
function ground(x, z) {
  const d = z - coastZ(x);
  if (d <= 0) return -1;
  const xk = x / 1000, zk = z / 1000;
  const cliff = 24 * E.ss(0, 55, d);
  const hill = 170 * (1 - Math.exp(-Math.max(0, d - 300) / 2600)) * (.45 + .55 * fbm(xk * .5 + 3.3, zk * .5 - 1.2, 2.1, 4));
  const rough = 5 * fbm(xk * 3.1, zk * 3.1, 7.7, 3) + 1.1 * noise(xk * 25, zk * 25, 5.5);
  let h = cliff + hill * E.ss(80, 600, d) + rough * E.ss(0, 40, d);
  const pr = Math.hypot(x - SITE_C[0], z - SITE_C[1]), flat = 1 - E.ss(110, 190, pr);
  h = E.mix(h, 29, flat);
  const rd = Math.abs(z - (60 + 40 * Math.sin(x / 210) + .12 * x)); if (rd < 5 && d > 60) h -= .25 * (1 - rd / 5);
  return Math.max(.4, h);
}
const roadD = (x, z) => Math.abs(z - (60 + 40 * Math.sin(x / 210) + .12 * x));

/* ---------------- heightfield patches (land) ---------------- */
/* a patch: corner (x0, z0), cell, nx x nz cells; heights with the curve's drop baked in; brightness 0..255 (0: not land) */
const SUN = V.norm([-.5, .55, -.4]);
function makePatch(x0, z0, cell, nx, nz, skip, hf, bmul) {
  const N = (nx + 1) * (nz + 1), H = new Float32Array(N), B = new Uint8Array(N), r = rng(Math.round(x0 * 7 + z0 * 13 + cell * 101));
  const CZ = new Float32Array(nx + 1); for (let i = 0; i <= nx; i++) CZ[i] = coastZ(x0 + i * cell);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const k = j * (nx + 1) + i, x = x0 + i * cell, z = z0 + j * cell;
    if (z - CZ[i] <= 0 || (skip && skip(x, z))) { H[k] = -1; continue; }
    H[k] = hf ? hf(x, z, CZ[i]) : ground(x, z);
  }
  const Hraw = new Float32Array(H);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const k = j * (nx + 1) + i, h = H[k]; if (h < .45) { B[k] = 0; continue; }
    const x = x0 + i * cell, z = z0 + j * cell;
    const hx = H[j * (nx + 1) + Math.min(nx, i + 1)] - H[j * (nx + 1) + Math.max(0, i - 1)], hz = H[Math.min(nz, j + 1) * (nx + 1) + i] - H[Math.max(0, j - 1) * (nx + 1) + i];
    const n = V.norm([-hx / (2 * cell), 1, -hz / (2 * cell)]), sh = Math.max(0, V.dot(n, SUN));
    const band = (h / 10) % 1 < .12 && h > 4 ? .14 : 0, rd = roadD(x, z) < 3.4 && z - CZ[i] > 60 ? .22 : 0;
    const coast = Math.exp(-(z - CZ[i]) / 30) * .4;
    const bm = bmul ? bmul(x, z) : 1; if (bm < .01) { B[k] = 0; continue; }
    B[k] = Math.max(1, Math.min(255, Math.round(255 * bm * Math.min(1, .16 + .62 * Math.pow(sh, 1.2) + band + rd + coast + .06 * r()))));
  }
  for (let k = 0; k < N; k++) if (H[k] >= 0) { const i = k % (nx + 1), j = (k / (nx + 1)) | 0, x = x0 + i * cell, z = z0 + j * cell; H[k] -= drop(x, z); }
  // blocks of 32 cells with height bounds
  const BS = 32, bx = Math.ceil(nx / BS), bz = Math.ceil(nz / BS), BL = new Float32Array(bx * bz * 2);
  for (let J = 0; J < bz; J++) for (let I = 0; I < bx; I++) {
    let lo = 1e9, hi = -1e9;
    for (let j = J * BS; j <= Math.min(nz, (J + 1) * BS); j++) for (let i = I * BS; i <= Math.min(nx, (I + 1) * BS); i++) { const h = H[j * (nx + 1) + i]; if (h < -1e5 || B[j * (nx + 1) + i] === 0) continue; if (h < lo) lo = h; if (h > hi) hi = h; }
    BL[(J * bx + I) * 2] = lo; BL[(J * bx + I) * 2 + 1] = hi;
  }
  return { x0, z0, cell, nx, nz, H, B, BS, bx, bz, BL, Hraw };
}
/* a height function interpolated from a coarser patch (exact near the coast), with a little detail */
function interpH(Pa) {
  const { x0, z0, cell, nx, nz, Hraw } = Pa, W1 = nx + 1;
  return (x, z, cz) => {
    if (z - cz < 110) return ground(x, z);
    const fi = (x - x0) / cell, fj = (z - z0) / cell, i = Math.max(0, Math.min(nx - 1, Math.floor(fi))), j = Math.max(0, Math.min(nz - 1, Math.floor(fj))), u = fi - i, v = fj - j;
    const a = Hraw[j * W1 + i], b = Hraw[j * W1 + i + 1], c = Hraw[(j + 1) * W1 + i], d = Hraw[(j + 1) * W1 + i + 1];
    if (a < 0 || b < 0 || c < 0 || d < 0) return ground(x, z);
    const h = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    return Math.max(.5, h + 1.4 * noise(x / 46, z / 46, 2.2) * E.ss(110, 300, z - cz));
  };
}
/* draw a land patch: per block a frustum test, then cells at the needed power-of-two step with a per-dot fade.
   fx(x, z, out) -> optional per-dot lime / hide (the strike's rings), keyed on world x z */
const SH = { x: 0, z: 0, r0: -1, r1: -1, k: 0, hole: 0, glow: 0 };
/* exp(-x) for x in [0, 16) as a table; per-frame strike-light bounds (only where a term is above .02) */
const EXN = new Float32Array(1025); for (let i = 0; i <= 1024; i++) EXN[i] = Math.exp(-i / 64);
const SHP = { on: false, rA2: 0, h2: 0, r0: 0, rIn: 0, wdi: 0, k: 0, gR: 0, gri: 0, g: 0, dark: 0, dr: 0, x: 0, z: 0 };
function shPrep() {
  const k = SH.k > .02 ? SH.k : 0, g = SH.glow > .02 ? SH.glow : 0;
  const rIn = k ? SH.r0 - SH.wd * Math.min(15.9, Math.log(k / .02)) : 0, gR = g ? SH.gr * Math.min(15.9, Math.log(g / .02)) : 0;
  const rAct = Math.min(SH.r1, Math.max(k ? SH.r0 : 0, gR, SH.dark > 0 ? SH.dr : 0, SH.hole || 0));
  SHP.on = SH.r1 > 0 && rAct > 0; SHP.rA2 = rAct * rAct; SHP.h2 = (SH.hole || 0) * (SH.hole || 0);
  SHP.r0 = k ? SH.r0 : -1; SHP.rIn = rIn; SHP.wdi = 64 / (SH.wd || 1); SHP.k = k; SHP.gR = gR; SHP.gri = 64 / (SH.gr || 1); SHP.g = g;
  SHP.dark = SH.dark || 0; SHP.dr = SH.dr || 0; SHP.x = SH.x; SHP.z = SH.z;
  return SHP;
}
/* per-block anisotropic LOD: the screen size of one cell step along x and along z at the block's centre ->
   need-per-depth factors (a grazing view thins the rows that crowd together) */
const AN = [0, 0];
function aniso(mx, my, mz, cell, PXF, kq) {
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl;
  const dx = mx - e[0], dy = my - e[1], dz = mz - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2];
  if (zc < 60) { AN[0] = AN[1] = kq; return; }
  const sx = (dx * r[0] + dy * r[1] + dz * r[2]) / zc, sy = (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
  const zi = zc + cell * f[0], zj = zc + cell * f[2];
  const ix = F * ((dx + cell) * r[0] + dy * r[1] + dz * r[2] - sx * zi) / zi, iy = F * ((dx + cell) * u[0] + dy * u[1] + dz * u[2] - sy * zi) / zi;
  const jx = F * (dx * r[0] + dy * r[1] + (dz + cell) * r[2] - sx * zj) / zj, jy = F * (dx * u[0] + dy * u[1] + (dz + cell) * u[2] - sy * zj) / zj;
  // the step along a row, and the gap between rows (not the j step's length: off to the side a grazing view shears the
  // lattice, and rows that look a pixel apart along the j step are a fraction of one apart across)
  const pi = Math.hypot(ix, iy), pj = Math.abs(ix * jy - iy * jx) / Math.max(1e-6, pi);
  AN[0] = Math.max(kq, PXF / Math.max(1e-3, pi) / zc); AN[1] = Math.max(kq, PXF / Math.max(1e-3, pj) / zc);
}
function drawPatch(Pa, vis, pxf, lit) {
  if (vis < .01) return 0;
  const { x0, z0, cell, nx, nz, H, B, BS, bx, bz, BL } = Pa, W1 = nx + 1;
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, D = K.pb.d, U32 = u32();
  const ex = e[0], ey = e[1], ez = e[2];
  const PXF = pxf || 2.4, kq = PXF / (cell * F);
  const g0 = 1.2, g1 = .45 / Math.max(500, LG.zref * 2.4), gm = .62, HZ = hazeK(), vs = vis / 255;
  let cnt = 0;
  const Q = shPrep(), sh = Q.on, rA2 = Q.rA2, hx = Q.x, hz = Q.z;
  // blocks of 32 cells, split into quarters (to 4 cells) while their depth range is large, each piece at its own step
  const sub = (i0, j0, n, lo, hi) => {
    const ax = x0 + i0 * cell, az = z0 + j0 * cell, ext = n * cell;
    const mx = ax + ext / 2, mz = az + ext / 2, my = (lo + hi) / 2, rad = Math.hypot(ext * .7071, (hi - lo) / 2) + 1;
    if (!K.wIn(mx, my, mz, rad)) return;
    const ddx = Math.max(ax - ex, 0, ex - (ax + ext)), ddy = Math.max(lo - ey, 0, ey - hi), ddz = Math.max(az - ez, 0, ez - (az + ext));
    const dmin = Math.max(near, Math.hypot(ddx, ddy, ddz));
    if (dmin * HZ > 5) return;
    if (n > 4) { const fx_ = Math.max(Math.abs(ax - ex), Math.abs(ax + ext - ex)), fz_ = Math.max(Math.abs(az - ez), Math.abs(az + ext - ez)), dmax = Math.hypot(fx_, Math.max(Math.abs(lo - ey), Math.abs(hi - ey)), fz_);
      if (dmax > 2.2 * dmin) { const h = n >> 1; sub(i0, j0, h, lo, hi); sub(i0 + h, j0, h, lo, hi); sub(i0, j0 + h, h, lo, hi); sub(i0 + h, j0 + h, h, lo, hi); return; } }
    aniso(mx, my, mz, cell, PXF, kq);
    const kqi = AN[0], kqj = AN[1];
    const sti = Math.max(1, pow2(kqi * dmin * .5)), stj = Math.max(1, pow2(kqj * dmin * .5));
    const i1 = Math.min(nx, i0 + n), j1 = Math.min(nz, j0 + n);
    for (let j = Math.ceil(j0 / stj) * stj; j < j1; j += stj) {
      const cj = CTZ[j & 65535], lj = 1 << cj, ilj = IP2[cj], z = z0 + j * cell;
      for (let i = Math.ceil(i0 / sti) * sti; i < i1; i += sti) {
        const k = j * W1 + i, bb = B[k]; if (!bb) continue;
        const x = x0 + i * cell, y = H[k];
        const dx = x - ex, dy = y - ey, dz = z - ez;
        const zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < near) continue;
        const ni = kqi * zc, nj = kqj * zc, ci = CTZ[i & 65535], li = 1 << ci;
        if (ni >= 2 * li || nj >= 2 * lj) continue;
        let a = (ni <= li ? 1 : 2 - ni * IP2[ci]) * (nj <= lj ? 1 : 2 - nj * ilj);
        if (a < .06) continue;
        const iz = F / zc, sx = cx + (dx * r[0] + dy * r[1] + dz * r[2]) * iz; if (sx < 0 || sx >= BW) continue;
        const sy = cy - (dx * u[0] + dy * u[1] + dz * u[2]) * iz; if (sy < 0 || sy >= BH) continue;
        let gg = g0 - g1 * zc; if (gg < gm) gg = gm;
        const hq = zc * HZ, hv = 1 / (1 + hq * hq);
        let cmp = 1;
        if (ni < 1 || nj < 1) { const gz = (-dy / zc - .003) * 58.8, gt = gz <= 0 ? 0 : gz >= 1 ? 1 : gz * gz * (3 - 2 * gz), c0 = 1 / ((ni < 1 ? ni : 1) * (nj < 1 ? nj : 1)); cmp = 1 + ((c0 > 3.2 ? 3.2 : c0) - 1) * gt; }
        let b = bb * vs * gg * a * cmp * hv, cr = WH[0], cg = WH[1], cb = WH[2];
        if (sh) {
          const qx = x - hx, qz = z - hz, d2 = qx * qx + qz * qz;
          if (d2 < rA2) {
            if (d2 < Q.h2) continue;
            const d = Math.sqrt(d2); let kl = 0;
            if (d < Q.r0 && d > Q.rIn) kl = Q.k * EXN[((Q.r0 - d) * Q.wdi) | 0];
            if (d < Q.gR) { const gl = Q.g * EXN[(d * Q.gri) | 0]; if (gl > kl) kl = gl; }
            if (kl > .02) { const fl = kl * .9 * a * cmp * gg * hv * Math.min(1, bb / 255 * 2.4); if (b < fl) b = fl; const kk = kl > 1 ? 1 : kl; cr += (SH.col[0] - cr) * kk; cg += (SH.col[1] - cg) * kk; cb += (SH.col[2] - cb) * kk; }
            if (d < Q.dr) b *= 1 - Q.dark * (1 - d / Q.dr);
          }
        }
        if (b < .015) continue;
        if (b > 1) b = 1;
        const q = ((sy | 0) * BW + (sx | 0)) << 2, R_ = cr * b, G_ = cg * b, B_ = cb * b;
        if (D[q + 1] < G_) U32[q >> 2] = 0xff000000 | ((B_ > 255 ? 255 : B_) << 16) | ((G_ > 255 ? 255 : G_) << 8) | (R_ > 255 ? 255 : R_);
        cnt++;
      }
    }
  };
  for (let J = 0; J < bz; J++) for (let I = 0; I < bx; I++) {
    const lo = BL[(J * bx + I) * 2], hi = BL[(J * bx + I) * 2 + 1]; if (lo > hi) continue;
    sub(I * BS, J * BS, BS, lo, hi);
  }
  return cnt;
}
const LG = { zref: 2000 };
/* air haze near the ground: 1 / (1 + (d / H)^2), H from 3.8 km for a camera on the ground (a soft horizon, not a bar of
   piled-up far dots) to 7 km by 1.5 km up, then growing with the height */
function hazeK() { const e = C.eye, alt = Math.max(0, Math.hypot(e[0], e[1] + RE, e[2]) - RE); return 1 / (3800 + 3200 * E.ss(0, 1500, alt) + alt * 5.5); }

/* ---------------- the sea: a flat lattice (curved), waves as a brightness ripple ---------------- */
function makeSea(x0, z0, cell, nx, nz, skip, bmul) {
  const N = (nx + 1) * (nz + 1), B = new Uint8Array(N), r = rng(Math.round(x0 * 3 + z0 * 5 + cell));
  const CZ = new Float32Array(nx + 1); for (let i = 0; i <= nx; i++) CZ[i] = coastZ(x0 + i * cell);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * cell, z = z0 + j * cell, k = j * (nx + 1) + i;
    const cz = CZ[i]; if (z > cz - 1) continue;
    if (skip && skip(x, z)) continue;
    const tex = Math.exp(1.1 * (.6 * noise(x * .003, z * .0012, 3.7) + .3 * noise(x * .011, z * .005, 1.1)) - .2), surf = Math.exp(-Math.max(0, cz - z) / 40);
    const bm = bmul ? bmul(x, z) : 1; if (bm < .01) continue;
    B[k] = Math.max(1, Math.min(255, Math.round(255 * bm * Math.min(1, .17 + .13 * tex + .45 * surf * (.6 + .4 * r()) + .06 * r()))));
  }
  const Hd = new Float32Array(N); for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const k = j * (nx + 1) + i; if (B[k]) Hd[k] = -drop(x0 + i * cell, z0 + j * cell); }
  return { x0, z0, cell, nx, nz, B, Hd, BS: 32, bx: Math.ceil(nx / 32), bz: Math.ceil(nz / 32) };
}
function drawSea(S, vis, seaT, pxf) {
  if (vis < .01) return 0;
  const { x0, z0, cell, nx, nz, B, Hd, BS, bx, bz } = S, W1 = nx + 1;
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, D = K.pb.d, U32 = u32();
  const ex = e[0], ey = e[1], ez = e[2], PXF = (pxf || 2.6), kq = PXF / (cell * F), ph = seaT * TAU / 6;
  const g0 = 1.15, g1 = .45 / Math.max(500, LG.zref * 2.4), gm = .58, HZ = hazeK(), vs = vis / 255;
  const Q = shPrep(), sh = Q.on, rA2 = Q.rA2, hx = Q.x, hz = Q.z;
  let cnt = 0;
  const sub = (i0, j0, n) => {
    const ax = x0 + i0 * cell, az = z0 + j0 * cell, ext = n * cell, mx = ax + ext / 2, mz = az + ext / 2;
    const my = -drop(mx, mz);
    if (!K.wIn(mx, my, mz, ext * .7072 + 2)) return;
    const ddx = Math.max(ax - ex, 0, ex - (ax + ext)), ddz = Math.max(az - ez, 0, ez - (az + ext)), ddy = Math.abs(ey - my);
    const dmin = Math.max(near, Math.hypot(ddx, ddy, ddz));
    if (dmin * HZ > 5) return;
    if (n > 4) { const fx_ = Math.max(Math.abs(ax - ex), Math.abs(ax + ext - ex)), fz_ = Math.max(Math.abs(az - ez), Math.abs(az + ext - ez)), dmax = Math.hypot(fx_, ddy + 1, fz_);
      if (dmax > 2.2 * dmin) { const h = n >> 1; sub(i0, j0, h); sub(i0 + h, j0, h); sub(i0, j0 + h, h); sub(i0 + h, j0 + h, h); return; } }
    aniso(mx, my, mz, cell, PXF, kq);
    const kqi = AN[0], kqj = AN[1], sti = Math.max(1, pow2(kqi * dmin * .5)), stj = Math.max(1, pow2(kqj * dmin * .5));
    const i1 = Math.min(nx, i0 + n), j1 = Math.min(nz, j0 + n);
    for (let j = Math.ceil(j0 / stj) * stj; j < j1; j += stj) {
      const cj = CTZ[j & 65535], lj = 1 << cj, ilj = IP2[cj], z = z0 + j * cell;
      for (let i = Math.ceil(i0 / sti) * sti; i < i1; i += sti) {
        const k = j * W1 + i, bb = B[k]; if (!bb) continue;
        const x = x0 + i * cell;
        const y = Hd[k] + .3 * fsin(ph + x * .021 + z * .013 + 1e4);
        const dx = x - ex, dy = y - ey, dz = z - ez;
        const zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < near) continue;
        const ni = kqi * zc, nj = kqj * zc, ci = CTZ[i & 65535], li = 1 << ci;
        if (ni >= 2 * li || nj >= 2 * lj) continue;
        let a = (ni <= li ? 1 : 2 - ni * IP2[ci]) * (nj <= lj ? 1 : 2 - nj * ilj);
        if (a < .06) continue;
        const iz = F / zc, sx = cx + (dx * r[0] + dy * r[1] + dz * r[2]) * iz; if (sx < 0 || sx >= BW) continue;
        const sy = cy - (dx * u[0] + dy * u[1] + dz * u[2]) * iz; if (sy < 0 || sy >= BH) continue;
        let gg = g0 - g1 * zc; if (gg < gm) gg = gm;
        const wv = .82 + .1 * fsin(ph * 1.7 + x * .05 - z * .031 + 1e4) + .08 * fsin(ph * 1.1 - x * .021 - z * .043 + 1e4);
        const hq = zc * HZ, hv = 1 / (1 + hq * hq);
        let cmp = 1;
        if (ni < 1 || nj < 1) { const gz = (-dy / zc - .003) * 58.8, gt = gz <= 0 ? 0 : gz >= 1 ? 1 : gz * gz * (3 - 2 * gz), c0 = 1 / ((ni < 1 ? ni : 1) * (nj < 1 ? nj : 1)); cmp = 1 + ((c0 > 3.2 ? 3.2 : c0) - 1) * gt; }
        let b = bb * vs * gg * a * wv * cmp * hv, cr = WH[0], cg = WH[1], cb = WH[2];
        if (sh) {
          const qx = x - hx, qz = z - hz, d2 = qx * qx + qz * qz;
          if (d2 < rA2) { const d = Math.sqrt(d2); let kl = 0; if (d < Q.r0 && d > Q.rIn) kl = Q.k * EXN[((Q.r0 - d) * Q.wdi) | 0]; if (d < Q.gR) { const gl = Q.g * EXN[(d * Q.gri) | 0]; if (gl > kl) kl = gl; } if (kl > .02) { const fl = kl * .8 * a * cmp * gg * hv * Math.min(1, bb / 255 * 2.4); if (b < fl) b = fl; const kk = kl > 1 ? 1 : kl; cr += (SH.col[0] - cr) * kk; cg += (SH.col[1] - cg) * kk; cb += (SH.col[2] - cb) * kk; } }
        }
        if (b < .015) continue;
        if (b > 1) b = 1;
        const q = ((sy | 0) * BW + (sx | 0)) << 2, R_ = cr * b, G_ = cg * b, B_ = cb * b;
        if (D[q + 1] < G_) U32[q >> 2] = 0xff000000 | ((B_ > 255 ? 255 : B_) << 16) | ((G_ > 255 ? 255 : G_) << 8) | (R_ > 255 ? 255 : R_);
        cnt++;
      }
    }
  };
  for (let J = 0; J < bz; J++) for (let I = 0; I < bx; I++) sub(I * BS, J * BS, BS);
  return cnt;
}

/* ---------------- the globe (orbit to 15 km): precomputed dots in tiles, thinned per tile by their spacing ---------------- */
/* foci: [x, z] ground points that get the finest spacing (the site, the platform's nadir); levels double the spacing */
const GLV = [[700, 70000], [1400, 170000], [2800, 380000], [5600, 800000], [11200, 1600000], [22400, 2800000]];
function globeSet(seed, foci) {
  const A = [], r = rng(seed);
  const hsh = (x, z) => { const v = Math.sin(x * 1.37e-4 + z * 2.71e-4) * 43758.5453; return v - Math.floor(v); };
  const lvOf = (x, z) => { let best = 99; const j = 1 + .3 * (hsh(x, z) - .5); for (const [fx, fz] of foci) { const d = Math.hypot(x - fx, z - fz) * j; for (let L = 0; L < GLV.length; L++) if (d < GLV[L][1]) { if (L < best) best = L; break; } } return best; };
  const put = (x, z, sp) => {
    const d = Math.hypot(x, z); if (d > 2800000) return;
    const cz = coastBig(x), m = z - cz, land = m > 0;
    const k = d / RE, nn = [Math.sin(k) * x / (d || 1), Math.cos(k), Math.sin(k) * z / (d || 1)];
    const coast = Math.exp(-Math.abs(m) / (sp * .6));
    let b;
    if (land) { const t = fbm(x / 60000, z / 60000, 4.4, 3), t2 = noise(x / 9000, z / 9000, 1.9); b = .22 + .2 * t + .07 * t2 + .08 * r() + .55 * coast; }
    else { if (r() > .55 + .45 * coast) return; b = .1 + .07 * r() + .5 * coast; }
    A.push(CE[0] + nn[0] * RE, CE[1] + nn[1] * RE, CE[2] + nn[2] * RE, Math.min(1, b), sp);
  };
  for (let L = 0; L < GLV.length; L++) {
    const [sp, R1] = GLV[L];
    foci.forEach(([fx, fz], fi) => {
      const R2 = R1 * 1.2, x0 = Math.floor((fx - R2) / sp) * sp, z0 = Math.floor((fz - R2) / sp) * sp;
      for (let x = x0; x < fx + R2; x += sp) for (let z = z0; z < fz + R2; z += sp) {
        if (Math.hypot(x - fx, z - fz) > R2) continue;
        if (lvOf(x, z) !== L) continue;
        // the owner focus is the first one that gives this level
        let own = -1, bd = 1e18; for (let k = 0; k < foci.length; k++) { const d = Math.hypot(x - foci[k][0], z - foci[k][1]); if (d < bd) { bd = d; own = k; } }
        if (own !== fi) continue;
        put(x + (r() - .5) * sp * .9, z + (r() - .5) * sp * .9, sp);
      }
    });
  }
  return A;
}
const GLB = (() => {
  const A = globeSet(8080, OPT.foci || [[0, 0]]);
  // the coastlines, a dense bright string
  const r = rng(77);
  for (let x = -2800000; x < 2800000; x += Math.abs(x) < 60000 ? 120 : Math.abs(x) < 400000 ? 500 : 2500) {
    const z = coastBig(x) + (r() - .5) * 200, d = Math.hypot(x, z); if (d > 2800000) continue;
    const k = d / RE; A.push(CE[0] + Math.sin(k) * x / d * RE, CE[1] + Math.cos(k) * RE, CE[2] + Math.sin(k) * z / d * RE, .85, Math.abs(x) < 60000 ? 120 : 500);
  }
  return K.tiled(new Float32Array(A), 5, 60000);
})();
lapW('globe ' + GLB.F.length / 5);
/* the cloud deck: patches of dots 7 km up */
const CLOUD = (() => {
  const A = [], r = rng(3131), HC = 7000, F1 = (OPT.foci && OPT.foci[1]) || [0, 0], CM = [F1[0] * .5, F1[1] * .5];
  for (let x = -1500000; x < 1500000; x += 3000) for (let z = -1500000; z < 1500000; z += 3000) {
    const xx = x + (r() - .5) * 3000, zz = z + (r() - .5) * 3000, d = Math.hypot(xx, zz); if (d > 1500000 || d < 30000) { r(); continue; }
    // a broad weather system round the coast (clear over the site itself): the Earth under the shot reads as a deck
    const mx = xx - CM[0], mz = zz - CM[1];
    const c = fbm(xx / 160000 + 9, zz / 160000 - 3, 1.7, 4) + .18 * noise(xx / 22000, zz / 22000, 4.2) + (.14 * Math.exp(-(d * d) / 2.6e11) + .3 * Math.exp(-(mx * mx + mz * mz) / 4.4e10)) * E.ss(30000, 80000, d);
    if (c < .1) continue;
    const k = d / RE, Rr = RE + HC + 900 * r();
    A.push(CE[0] + Math.sin(k) * xx / d * Rr, CE[1] + Math.cos(k) * Rr, CE[2] + Math.sin(k) * zz / d * Rr, Math.min(1, (c - .1) * 2.6) * (.5 + .5 * r()), 3000);
  }
  return K.tiled(new Float32Array(A), 5, 120000);
})();
function drawGlobeSet(G, vis, pxf, inner, kind) {
  const P = G.F, TL = G.TL, D = K.pb.d, U32 = u32();
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const ed = V.dist(e, CE), hz = Math.sqrt(Math.max(0, ed * ed - RE * RE));
  const PXF = pxf || 2.8;
  let cnt = 0;
  for (let t = 0; t < G.nt; t++) {
    const q = t * 6, tcx = TL[q + 2], tcy = TL[q + 3], tcz = TL[q + 4], trr = TL[q + 5];
    const dt = Math.hypot(tcx - e[0], tcy - e[1], tcz - e[2]);
    if (dt - trr > hz + 60000) continue;
    if (!K.wIn(tcx, tcy, tcz, trr)) continue;
    const k0 = TL[q], k1 = TL[q + 1], n = k1 - k0;
    const zt = Math.max(1000, K.WZ[0] - trr * .5);
    for (let k = k0; k < k1; k++) {
      const j = k * 5, px = P[j], py = P[j + 1], pz = P[j + 2], sp = P[j + 4];
      const dx = px - e[0], dy = py - e[1], dz = pz - e[2];
      if ((px - CE[0]) * dx + (py - CE[1]) * dy + (pz - CE[2]) * dz > 0 && kind !== 1) continue;
      const zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < 50) continue;
      // thin by the dot's own spacing on screen
      const spx = sp * F / zc; let a = 1;
      if (kind === 1 && spx > PXF * 2.2) {
        // a cloud seen close: fill its 3 km cell with jittered dots so the deck stays a deck, not a grid
        const m = Math.min(12, Math.floor((spx / PXF) * (spx / PXF) * .7)), as = P[j + 3] * vis * .9 * 1.15;
        for (let i = 0; i < m; i++) {
          const h1 = HJ[(k * 7 + i * 3) & 4095], h2 = HJ[(k * 13 + i * 5 + 1) & 4095], h3 = HJ[(k * 3 + i * 11 + 2) & 4095];
          const qx = dx + (h1 - .5) * sp, qz = dz + (h2 - .5) * sp, qy = dy + (h3 - .5) * 500;
          const zq = qx * f[0] + qy * f[1] + qz * f[2]; if (zq < 50) continue;
          const sx = cx + F * (qx * r[0] + qy * r[1] + qz * r[2]) / zq; if (sx < 0 || sx >= BW) continue;
          const sy = cy - F * (qx * u[0] + qy * u[1] + qz * u[2]) / zq; if (sy < 0 || sy >= BH) continue;
          if (K.occT(sx, sy, zq)) continue;
          const bb = as * (.55 + .9 * h3); if (bb < .02) continue;
          const qq = ((sy | 0) * BW + (sx | 0)) << 2, R_ = 236 * bb, G_ = 238 * bb, B_ = 230 * bb;
          if (D[qq + 1] < G_) U32[qq >> 2] = 0xff000000 | ((B_ > 255 ? 255 : B_) << 16) | ((G_ > 255 ? 255 : G_) << 8) | (R_ > 255 ? 255 : R_);
          cnt++;
        }
        continue;
      }
      if (spx < PXF) { const keep = (spx / PXF) * (spx / PXF), h = (k * .6180339887) % 1; if (h > keep) continue; }
      else a = Math.min(2.4, (spx / PXF) * (spx / PXF));
      if (kind !== 1 && inner < 1) { const d2 = px * px + pz * pz; if (d2 < 1.6e9) { a *= 1 - (1 - inner) * (1 - E.ss(OUT_R[0], OUT_R[1], Math.sqrt(d2))); if (a < .02) continue; } }
      const sx = cx + F * (dx * r[0] + dy * r[1] + dz * r[2]) / zc; if (sx < 0 || sx >= BW) continue;
      const sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc; if (sy < 0 || sy >= BH) continue;
      if (K.occT(sx, sy, zc)) continue;
      let bb = P[j + 3] * vis * a;
      if (kind === 1) bb *= .9;
      if (bb < .02) continue;
      const qq = ((sy | 0) * BW + (sx | 0)) << 2, R_ = 236 * bb, G_ = 238 * bb, B_ = 230 * bb;
      if (D[qq + 1] < G_) U32[qq >> 2] = 0xff000000 | ((B_ > 255 ? 255 : B_) << 16) | ((G_ > 255 ? 255 : G_) << 8) | (R_ > 255 ? 255 : R_);
      cnt++;
    }
  }
  return cnt;
}
function drawGlobe(vis, pxm) {
  pxm = pxm || 1;
  const alt = V.dist(C.eye, CE) - RE;
  if (alt < 2500) return 0;
  const fade = vis * E.ss(2500, 20000, alt);
  const siteVis = 1 - E.ss(60000, 120000, alt);
  let n = drawGlobeSet(GLB, fade * 1.9, 3.0 * pxm, 1 - siteVis, 0);
  if (alt > 30000) n += drawGlobeSet(CLOUD, fade * E.ss(30000, 120000, alt), 3.2 * pxm, 0, 1);
  return n;
}
const HJ = (() => { const r = rng(5151), A = new Float32Array(4096); for (let i = 0; i < 4096; i++) A[i] = r(); return A; })();
const LIMB_H = [0, 9000, 20000, 34000, 52000, 75000], LIMB_B = [.6, .46, .32, .2, .11, .05];
function drawLimb(vis) {
  const e = C.eye, d = V.dist(e, CE), alt = d - RE; if (alt < 40000) return;
  const w = V.norm(V.sub(e, CE)), [U, W] = GEO.perp(w), a = vis * E.ss(40000, 160000, alt);
  const f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], nr = C.near;
  // outcode of a world point (16 behind the camera; 1, 2, 4, 8 off the left, right, top, bottom)
  const oc = (x, y, z) => { const dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < nr) return 16; const sx = cx + F * (dx * r[0] + dy * r[1] + dz * r[2]) / zc, sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc; return (sx < -40 ? 1 : 0) | (sx > BW + 40 ? 2 : 0) | (sy < -40 ? 4 : 0) | (sy > BH + 40 ? 8 : 0); };
  for (let s = 0; s < LIMB_H.length; s++) {
    const Rs = RE + LIMB_H[s], k = Rs * Rs / (d * d), cc = V.add(CE, V.mul(V.sub(e, CE), k)), rr = Rs * Math.sqrt(1 - k);
    const col = s ? [200, 214, 205] : WH, al = LIMB_B[s] * a; if (al < .004) continue;
    const ph = s * .37, P = (t, o) => { const c_ = Math.cos(t) * rr, s_ = Math.sin(t) * rr; o[0] = cc[0] + U[0] * c_ + W[0] * s_; o[1] = cc[1] + U[1] * c_ + W[1] * s_; o[2] = cc[2] + U[2] * c_ + W[2] * s_; return o; };
    // the ring in 140 arcs of 30 dots: an arc whose ends are both behind or both off one side of the frame is skipped
    let c0 = oc(...P(ph, LP));
    for (let g = 0; g < LSEG; g++) {
      const c1 = oc(...P(ph + (g + 1) * LPER / LIMB_N * TAU, LP));
      if (!((c0 & c1 & 16) || (c0 & c1 & 15))) {
        for (let q = 0; q < LPER; q++) {
          P(ph + (g * LPER + q) / LIMB_N * TAU, LP);
          if (K.pj(LP[0], LP[1], LP[2]) && !(K.occOn() && K.occT(K.PJ[0], K.PJ[1], K.PJ[2]))) K.dot(K.PJ[0], K.PJ[1], 1, col[0], col[1], col[2], al);
        }
      }
      c0 = c1;
    }
  }
}
const LIMB_N = 4200, LSEG = 140, LPER = 30, LP = [0, 0, 0];
const STARS = K.stars(9000, 19);

/* ---------------- the site ---------------- */
const HIT = [2, 0, 13]; HIT[1] = ground(HIT[0], HIT[2]);
const SPAN = 15000;
const GC = OPT.gcam || [2000, 0, 6200];
/* nested patches with feathered borders: inside its band a finer patch fades out toward its edge while the coarser
   one fades in, so the change of lattice is a gradient, not an edge (the weights are baked into the brightness) */
const R_I = [HIT[0] - 1300, HIT[2] - 1300, 2.5, 1040], R_G = [GC[0] - 900, GC[2] - 900, 3, 600];
const R_M = [HIT[0] - 7000, HIT[2] - 7000, 10, 1400], R_R = [-SPAN, -SPAN, 24, Math.round(2 * SPAN / 24)];
const R_SN = [HIT[0] - 1800, HIT[2] - 1800, 4, 900];
const edgeD = (x, z, R_) => { const [x0, z0, c, n] = R_, L = c * n; return Math.min(x - x0, x0 + L - x, z - z0, z0 + L - z); };
const BAND = new Map([[R_I, 260], [R_G, 200], [R_M, 700], [R_R, 1500], [R_SN, 300]]);
const wIn_ = (x, z, R_) => E.ss(0, BAND.get(R_), edgeD(x, z, R_));                // a patch's own weight near its border
const deep = (x, z, R_) => edgeD(x, z, R_) > BAND.get(R_);                       // fully covered by that finer patch
const under = (x, z, list) => { let w = 1; for (const R_ of list) { const d = edgeD(x, z, R_); if (d > 0) w *= 1 - E.ss(0, BAND.get(R_), d); } return w; };
const OUT_R = [32000, 40000], OUTER = 40400;
const outerFade = (x, z) => 1 - E.ss(OUT_R[0], OUT_R[1], Math.hypot(x, z));
const PR = makePatch(R_R[0], R_R[1], R_R[2], R_R[3], R_R[3], (x, z) => deep(x, z, R_M), null, (x, z) => wIn_(x, z, R_R) * under(x, z, [R_M]));
lapW('region patch');
const PO = makePatch(-OUTER, -OUTER, 40, Math.round(2 * OUTER / 40), Math.round(2 * OUTER / 40), (x, z) => deep(x, z, R_R), (() => { const R0 = makePatch(-OUTER - 320, -OUTER - 320, 160, Math.round(2 * OUTER / 160) + 4, Math.round(2 * OUTER / 160) + 4); return interpH(R0); })(), (x, z) => outerFade(x, z) * under(x, z, [R_R]));
lapW('outer patch');
const PM = makePatch(R_M[0], R_M[1], R_M[2], R_M[3], R_M[3], (x, z) => deep(x, z, R_I) || deep(x, z, R_G), (() => { const R0 = makePatch(R_M[0] - 48, R_M[1] - 48, 24, 590, 590); return interpH(R0); })(), (x, z) => wIn_(x, z, R_M) * under(x, z, [R_I, R_G]));
lapW('mid patch');
const PI_ = makePatch(R_I[0], R_I[1], R_I[2], R_I[3], R_I[3], null, null, (x, z) => wIn_(x, z, R_I));
lapW('impact patch');
const PG_ = makePatch(R_G[0], R_G[1], R_G[2], R_G[3], R_G[3], null, interpH(PM), (x, z) => wIn_(x, z, R_G));
lapW('camera patch');
const SO = makeSea(-OUTER, -OUTER, 40, Math.round(2 * OUTER / 40), Math.round(2 * OUTER / 40), (x, z) => deep(x, z, R_R), (x, z) => outerFade(x, z) * under(x, z, [R_R]));
const SR = makeSea(R_R[0], R_R[1], R_R[2], R_R[3], R_R[3], (x, z) => deep(x, z, R_M), (x, z) => wIn_(x, z, R_R) * under(x, z, [R_M]));
const SM = makeSea(R_M[0], R_M[1], R_M[2], R_M[3], R_M[3], (x, z) => deep(x, z, R_SN), (x, z) => wIn_(x, z, R_M) * under(x, z, [R_SN]));
const SN = makeSea(R_SN[0], R_SN[1], R_SN[2], R_SN[3], R_SN[3], null, (x, z) => wIn_(x, z, R_SN));
lapW('sea');
function drawSite(vis, seaT, pxf) {
  let n = 0;
  n += drawPatch(PO, vis, pxf); n += drawPatch(PR, vis, pxf); n += drawPatch(PM, vis, pxf); n += drawPatch(PI_, vis, pxf); n += drawPatch(PG_, vis, pxf);
  const ps = pxf * 1.4;
  n += drawSea(SO, vis, seaT, ps); n += drawSea(SR, vis, seaT, ps); n += drawSea(SM, vis, seaT, ps); n += drawSea(SN, vis, seaT, ps);
  return n;
}
/* the battery's vehicles (HD models as LOD clouds) */
const VEH = [
  ['tel1', 'tel', -22, 8, PI + .32, 'TEL'], ['tel2', 'tel', 19, -3, PI - .22, 'TEL'], ['rdr', 'radar', -5, 33, PI + .1, 'RDR'],
  ['sam', 'pantsir', 32, 27, PI - .5, 'SAM'], ['tel3', 'tel', -128, 96, PI + .9, 'TEL'], ['tel4', 'tel', 148, 118, PI - .7, 'TEL'],
  ['sam2', 'pantsir', -190, 22, PI + 1.3, 'SAM'], ['rdr2', 'radar', 205, 30, PI - 1.1, 'RDR'],
];
const VM = {};
const vehModel = kind => VM[kind] || (VM[kind] = K.lodModel(kind === 'tel' ? HD.tel() : kind === 'radar' ? HD.radar() : HD.pantsir(), kind === 'radar' ? { mast: 1, ant: PI * .5 } : {}, [.06, .12, .24, .48, .96], 77 + kind.length, .9));
const VEHS = VEH.map(([key, kind, x, z, yaw, chip]) => { const gy = ground(x, z) - drop(x, z); const Wv = X.make(R.y(yaw), [x, gy, z]); const parts = vehModel(kind); return { key, kind, x, z, chip, W: Wv, parts, d: Math.hypot(x - HIT[0], z - HIT[2]), c: [x, gy + 2, z] }; });
lapW('vehicles');
const VO = { a: 1.25, fade: 1600, px: 3.2, px0: 10, keep: 1 };
function drawVehicles(gone) { for (const v of VEHS) { if (gone && gone(v)) continue; for (const p of v.parts) K.drawLod(p.ml, v.W, VO); } }

return { RE, CE, coastZ, coastBig, ground, roadD, HIT, makePatch, drawPatch, makeSea, drawSea, drawGlobe, drawLimb, STARS, CLOUD, GLB, PO, PR, PM, PI_, PG_, SO, SR, SM, SN, SH, LG, drop, SPAN, drawSite, VEHS, drawVehicles, GC };
};
