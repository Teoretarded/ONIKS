/* ORBITAL RAILGUN world (window.ORW(K) -> the world): the Earth seen from orbit (a dot globe, land brighter, the
   coast brightest, the limb's air glow, a thin cloud deck), the stars, and the coast the rod hits: a headland with
   a coastal battery, drawn as heightfield patches on regular lattices (dense round the strike and round the ground
   camera, coarse out to 15 km) and a moving sea, all with per-dot power-of-two LOD (no popping); the crater the
   strike digs (the land lattice deformed into a bowl with a rim and ejecta rays, CRA.a set by the FX module); a
   forest round the site (dot-model trees, scorched, lit by the passing shock, stripped, thrown and laid flat by it).
   The ground camera's patch sits round G2, where the FX module films the strike from the forest (OPT.gcam is kept
   for the film but no longer places a patch).
   World frame: metres, the site's plateau at the origin, +Y up, +Z inland (north), the sea to the south; the Earth's
   centre at (0, -RE, 0); far points drop under the curve. Everything is a pure function of the times passed in. */
window.ORW = function (K, OPT) {
OPT = OPT || {};
'use strict';
const { V, R, X, E, rng, noise, fbm } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const BW = 1920, BH = 1080;
const C = K.C;
const LIME = K.LIME, HOT = K.HOT, WH = K.WH, FIRE_ = [255, 196, 138];
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
/* ---------------- the crater: the land lattice deformed into a bowl round the strike ----------------
   CRA.a (sim s since the strike, set each frame by the FX module before the ground is drawn): a bowl 2R wide and D deep
   with a sharp raised rim, the ejecta blanket thinning outward, bright ejecta rays over a scorched skirt, the floor
   glowing for a while. Shaded from its own slopes so it reads from above. */
const CRA = { a: -1, R: 95, D: 26, H: 10, x: 0, z: 0 };
const RAYN = 1024, RAY = new Float32Array(RAYN);
{ const r = rng(5858), sp = []; for (let i = 0; i < 30; i++) sp.push([r() * TAU, .018 + .06 * r() * r(), .4 + .6 * r(), 2.5 + 5.5 * r()]);
  for (let i = 0; i < RAYN; i++) { const t = i / RAYN * TAU; let v = 0; for (const [c, w, h] of sp) { let d = Math.abs(t - c); if (d > PI) d = TAU - d; const q = h * Math.exp(-(d * d) / (w * w)); if (q > v) v = q; } RAY[i] = v; }
  CRA.RL = new Float32Array(RAYN); for (let i = 0; i < RAYN; i++) { const t = i / RAYN * TAU; let L = 3; for (const [c, w, h, l] of sp) { let d = Math.abs(t - c); if (d > PI) d = TAU - d; if (d < w * 1.5 && l > L) L = l; } CRA.RL[i] = L; } }
/* height offset of the crater at d m from its centre (fully formed) and its radial slope */
function craterDy(d) { const u = d / CRA.R; if (u < 1) { const u2 = u * u; return -CRA.D * (1 - u2) + CRA.H * u2 * u2 * u2; } const v = 1 / u, v2 = v * v; return CRA.H * v2 * v2; }
function craterSl(d) { const u = d / CRA.R; if (u < 1) { const u2 = u * u; return (2 * CRA.D * u + 6 * CRA.H * u2 * u2 * u) / CRA.R; } const v = 1 / u, v2 = v * v; return -4 * CRA.H * v2 * v2 * v / CRA.R; }
const craterG = a => a <= 0 ? 0 : E.ss(0, .75, a);
/* the crater's per-dot terms for a lattice point at (qx, qz) from the centre, distance d (< CR_OUT): the height offset,
   a brightness factor and a heat 0..1 (written to CRO) */
const CRO = [0, 1, 0];
const CR_OUT = 95 * 8;
function craterAt(qx, qz, d, g, a) {
  const R_ = CRA.R, u = d / R_;
  CRO[0] = craterDy(d) * g;
  // light from the bowl's own slope (relative to flat ground), weighted in near the rim
  const sl = craterSl(d) * g, id = d > .01 ? 1 / d : 0, nx = -sl * qx * id, nz = -sl * qz * id, nl = 1 / Math.sqrt(1 + sl * sl);
  const lam = (nx * SUN[0] + SUN[1] + nz * SUN[2]) * nl;
  const w = 1 - E.ss(R_ * 1.4, R_ * 2.6, d);
  let f = 1 + ((.08 + .92 * (lam > 0 ? lam : 0)) / (.08 + .92 * SUN[1]) - 1) * w;
  // the rim crest catches the light; the ejecta blanket: scorched, with bright rays
  if (u > .9) {
    // a fast atan2 (to ~0.005 rad), in 0..TAU
    const ax = qx < 0 ? -qx : qx, az = qz < 0 ? -qz : qz, mn = ax < az ? ax : az, mx = ax < az ? az : ax, q_ = mn / (mx + 1e-9), q2 = q_ * q_;
    let ti = ((-.0464964749 * q2 + .15931422) * q2 - .327622764) * q2 * q_ + q_;
    if (az > ax) ti = 1.5707963 - ti; if (qx < 0) ti = 3.1415927 - ti; if (qz < 0) ti = TAU - ti;
    const k = (ti * (RAYN / TAU)) | 0, ry = RAY[k & (RAYN - 1)], L = CRA.RL[k & (RAYN - 1)];
    const ex = u - 1, ray = ry * Math.exp(-ex / L);
    f *= (1 - .62 * g * Math.exp(-ex / 2.4) * (1 - ray)) * (1 + 1.5 * g * ray);
    if (u < 1.12) f *= 1 + .5 * g * (1 - Math.abs(u - 1.03) / .09);
  }
  CRO[1] = f;
  CRO[2] = u < .92 ? Math.min(1, 1.25 * Math.exp(-a / 70) * (1 - u * u / .85)) * g : 0;
  return CRO;
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
  const crA = CRA.a, crG = craterG(crA), crOn = crG > 0, crx = CRA.x, crz = CRA.z, crR2 = CR_OUT * CR_OUT;
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
        const x = x0 + i * cell;
        let y = H[k], crf = 1, crh = 0;
        if (crOn) { const qx = x - crx, qz = z - crz, d2 = qx * qx + qz * qz; if (d2 < crR2) { const o = craterAt(qx, qz, Math.sqrt(d2), crG, crA); y += o[0]; crf = o[1]; crh = o[2]; } }
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
        let b = bb * vs * gg * a * cmp * hv * crf, cr = WH[0], cg = WH[1], cb = WH[2];
        if (sh) {
          const qx = x - hx, qz = z - hz, d2 = qx * qx + qz * qz;
          if (d2 < rA2) {
            if (!crOn && d2 < Q.h2) continue;
            const d = Math.sqrt(d2); let kl = 0;
            if (d < Q.r0 && d > Q.rIn) kl = Q.k * EXN[((Q.r0 - d) * Q.wdi) | 0];
            if (d < Q.gR) { const gl = Q.g * EXN[(d * Q.gri) | 0]; if (gl > kl) kl = gl; }
            if (kl > .02) { const fl = kl * .9 * a * cmp * gg * hv * Math.min(1, bb / 255 * 2.4); if (b < fl) b = fl; const kk = kl > 1 ? 1 : kl; cr += (SH.col[0] - cr) * kk; cg += (SH.col[1] - cg) * kk; cb += (SH.col[2] - cb) * kk; }
            if (!crOn && d < Q.dr) b *= 1 - Q.dark * (1 - d / Q.dr);
          }
        }
        if (crh > .02) { const hb = crh * a * hv * 1.1; if (b < hb) b = hb; const kk = crh > 1 ? 1 : crh; cr += (FIRE_[0] - cr) * kk; cg += (FIRE_[1] - cg) * kk; cb += (FIRE_[2] - cb) * kk; if (crh > .5) { const k2 = (crh - .5) * 2; cr += (HOT[0] - cr) * k2; cg += (HOT[1] - cg) * k2; cb += (HOT[2] - cb) * k2; } }
        if (b < .015) continue;
        if (b > 1) b = 1;
        const q = ((sy | 0) * BW + (sx | 0)) << 2, R_ = cr * b, G_ = cg * b, B_ = cb * b;
        if (D[q + 1] < G_) U32[q >> 2] = 0xff000000 | ((B_ > 255 ? 255 : B_) << 16) | ((G_ > 255 ? 255 : G_) << 8) | (R_ > 255 ? 255 : R_);
        cnt++;
      }
    }
  };
  for (let J = 0; J < bz; J++) for (let I = 0; I < bx; I++) {
    let lo = BL[(J * bx + I) * 2], hi = BL[(J * bx + I) * 2 + 1]; if (lo > hi) continue;
    if (crOn) { const mx = x0 + (I + .5) * BS * cell - crx, mz = z0 + (J + .5) * BS * cell - crz; if (Math.hypot(mx, mz) < CR_OUT + BS * cell) { lo -= CRA.D; hi += CRA.H; } }
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
CRA.x = HIT[0]; CRA.z = HIT[2];
/* the ground camera's clearing (the FX module films the strike from here) */
const G2 = (() => { const d = V.norm([-.55, 0, .83]), x = HIT[0] + d[0] * 2300, z = HIT[2] + d[2] * 2300; return [x, ground(x, z) - drop(x, z), z]; })();
const SPAN = 15000;
const GC = OPT.gcam || [2000, 0, 6200];
/* nested patches with feathered borders: inside its band a finer patch fades out toward its edge while the coarser
   one fades in, so the change of lattice is a gradient, not an edge (the weights are baked into the brightness) */
const R_I = [HIT[0] - 1300, HIT[2] - 1300, 2.5, 1040], R_G = [G2[0] - 900, G2[2] - 900, 3, 600];   // the camera patch round the FX module's ground camera
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
  { const h = C.eye[1] - HIT[1], dh = Math.hypot(C.eye[0] - HIT[0], C.eye[2] - HIT[2]); pxf *= 1 + .28 * E.ss(900, 2600, h) * (1 - E.ss(6000, 12000, dh)); }
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

/* ---------------- the ground round the strike as a polar table (heights to 8.8 km, for effects that sit on it) ---------------- */
const PG_DR = 8, PG_NR = 1100, PG_NA = 720, PG = new Float32Array(PG_NR * PG_NA);
for (let i = 0; i < PG_NR; i++) for (let j = 0; j < PG_NA; j++) { const r = i * PG_DR, t = j / PG_NA * TAU, x = HIT[0] + Math.cos(t) * r, z = HIT[2] + Math.sin(t) * r; const g = ground(x, z); PG[i * PG_NA + j] = (g < 0 ? 0 : g) - drop(x, z); }
function gP(r, t) { const i = Math.min(PG_NR - 1, Math.max(0, Math.round(r / PG_DR))); let j = Math.round(t / TAU * PG_NA) % PG_NA; if (j < 0) j += PG_NA; return PG[i * PG_NA + j]; }
/* with the crater (as formed at CRA.a) */
function gPc(r, t) { const g = gP(r, t), cg = craterG(CRA.a); return cg > 0 && r < CR_OUT ? g + craterDy(r) * cg : g; }
lapW('polar ground');

/* ---------------- the forest round the site ----------------
   Trees (conifers and broadleaves) in stands with clearings, from 150 m to 2.5 km out, each a dot model from one of six
   templates (shuffled points: any prefix is an even subset, so the LOD is a count, capped per frame by a budget). The
   strike: the flash scorches the side facing it; the shock front lights each tree as it passes (like the scan), strips
   the crowns into flying leaves, throws the near trees tumbling out, snaps the middle ring flat above their stumps
   (all pointing away from the strike) and bends the outer ones, which swing back part way. */
const NTP = 900, NTPL = 6, TPS = 7;
const TPL = (() => {
  const A = new Float32Array(NTPL * NTP * TPS), r = rng(6363);
  for (let t = 0; t < NTPL; t++) {
    const pts = [], con = t < 3;
    const nTr = Math.round(NTP * (con ? .07 : .085)), trunkTop = con ? .9 : .55, trR = con ? .011 : .018;
    for (let i = 0; i < nTr; i++) { const y = r() * trunkTop, th = r() * TAU; pts.push([Math.cos(th) * trR, y, Math.sin(th) * trR, Math.cos(th), 0, Math.sin(th), .3 + .3 * y]); }
    if (con) {
      const Rk = .19 + .035 * t, y0 = .13 + .04 * t, nt = 7 + t;
      while (pts.length < NTP) {
        const y = y0 + (1 - y0) * Math.pow(r(), .8), f = ((y - y0) * nt) % 1, tier = .7 + .3 * (1 - f);
        const rc = Rk * Math.pow(Math.max(0, 1 - (y - y0) / (1 - y0)), .9) * tier, th = r() * TAU, q = .45 + .55 * Math.sqrt(r());
        const nl = 1 / Math.hypot(1, .5);
        pts.push([Math.cos(th) * rc * q, y, Math.sin(th) * rc * q, Math.cos(th) * nl, .5 * nl, Math.sin(th) * nl, .35 + .65 * q * (.7 + .3 * (1 - f))]);
      }
    } else {
      const P = [], np = 4 + (t - 3) * 2;
      for (let k = 0; k < np; k++) { const a = r() * TAU, o = k ? .07 + .11 * r() : 0; P.push([Math.cos(a) * o, .66 + (r() - .4) * .18, Math.sin(a) * o, .14 + .09 * r()]); }
      while (pts.length < NTP) {
        const p = P[(r() * np) | 0], u = r() * 2 - 1, th = r() * TAU, h = Math.sqrt(1 - u * u), q = .6 + .4 * Math.sqrt(r());
        const nx = Math.cos(th) * h, ny = u, nz = Math.sin(th) * h;
        const x = p[0] + nx * p[3] * q, y = p[1] + ny * p[3] * q * .85, z = p[2] + nz * p[3] * q;
        let inside = false; for (const o of P) if (o !== p && Math.hypot(x - o[0], (y - o[1]) / .85, z - o[2]) < o[3] * .8) { inside = true; break; }
        if (inside && r() < .85) continue;
        pts.push([x, y, z, nx, ny, nz, .4 + .6 * (ny * .5 + .5)]);
      }
    }
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const s = pts[i]; pts[i] = pts[j]; pts[j] = s; }
    for (let i = 0; i < NTP; i++) for (let q = 0; q < TPS; q++) A[(t * NTP + i) * TPS + q] = pts[i][q];
  }
  return A;
})();
const RTH = 640, RFL = 1900, RBD = 3000;            // thrown inside, laid flat inside, bent inside
const FOR = (() => {
  const r = rng(6161), SP = 11, R1 = 3000, L = [];
  for (let gz = -R1; gz <= R1; gz += SP) for (let gx = -R1; gx <= R1; gx += SP) {
    const jx = r(), jz = r(), rr = r(), r2 = r(), r3 = r(), r4 = r(), r5 = r();
    const x = HIT[0] + gx + (jx - .5) * SP * .95, z = HIT[2] + gz + (jz - .5) * SP * .95;
    const d = Math.hypot(x - HIT[0], z - HIT[2]); if (d < 150 || d > R1) continue;
    const cz = coastZ(x); if (z - cz < 60) continue;
    if (roadD(x, z) < 7 || Math.hypot(x - SITE_C[0], z - SITE_C[1]) < 175 || Math.hypot(x - G2[0], z - G2[2]) < 70) continue;
    const st = .5 + .45 * noise(x / 360, z / 360, 6.1) + .3 * noise(x / 95, z / 95, 2.3);
    const dg = Math.hypot(x - G2[0], z - G2[2]), dens = Math.max(E.ss(.42, .7, st), .85 * (1 - E.ss(160, 420, dg))) * (1 - E.ss(2300, R1, d)) * E.ss(60, 170, z - cz);
    if (rr > dens * .92) continue;
    const g = ground(x, z); if (g < 1) continue;
    const con = noise(x / 700, z / 700, 3.9) + (g - 60) / 220 > -.1;
    L.push(x, g - drop(x, z), z, con ? 15 + 11 * r2 : 11 + 8 * r2, .85 + .35 * r3, (con ? 0 : 3) + Math.min(2, Math.floor(r4 * 3)), r5 * TAU, rr);
  }
  const n = L.length / 8;
  // near trees (thrown) first, then the rest in 96 m tiles
  const TS = 96, key = i => { const x = L[i * 8], z = L[i * 8 + 2], d = Math.hypot(x - HIT[0], z - HIT[2]); return d < RTH ? -1 : (Math.floor(x / TS) + 512) * 1024 + Math.floor(z / TS) + 512; };
  const idx = [...Array(n).keys()], keys = idx.map(key); idx.sort((a, b) => keys[a] - keys[b]);
  const O = { n, X: new Float32Array(n), Y: new Float32Array(n), Z: new Float32Array(n), H: new Float32Array(n), W: new Float32Array(n), K: new Uint8Array(n), YC: new Float32Array(n), YS: new Float32Array(n),
    D: new Float32Array(n), TH: new Float32Array(n), PM: new Float32Array(n), SB: new Float32Array(n), UX: new Float32Array(n), UZ: new Float32Array(n), RN: new Float32Array(n), AH: new Float32Array(n).fill(1e9), V0: new Float32Array(n), TLD: new Float32Array(n), OM: new Float32Array(n) };
  idx.forEach((s, i) => {
    const o = s * 8, x = L[o], z = L[o + 2], d = Math.hypot(x - HIT[0], z - HIT[2]);
    O.X[i] = x; O.Y[i] = L[o + 1]; O.Z[i] = z; O.H[i] = L[o + 3]; O.W[i] = L[o + 4]; O.K[i] = L[o + 5]; O.YC[i] = Math.cos(L[o + 6]); O.YS[i] = Math.sin(L[o + 6]); O.RN[i] = L[o + 7];
    O.D[i] = d; O.UX[i] = (x - HIT[0]) / d; O.UZ[i] = (z - HIT[2]) / d; O.TH[i] = Math.atan2(z - HIT[2], x - HIT[0]);
    O.PM[i] = d < RFL ? (PI / 2 - .12 + .3 * (L[o + 7] - .5)) * (1 - .35 * E.ss(RFL * .75, RFL, d)) : (PI / 2) * .85 * Math.pow(1 - E.ss(RFL, RBD, d), .6);
    O.SB[i] = .4 * (1 - E.ss(RFL, RBD, d));
    if (d < RTH) {   // thrown: launch speed, flight time, a tumble that lands it lying down
      const v0 = 210 * Math.pow(170 / d, 1.25) * (.8 + .4 * L[o + 7]), vy = v0 * (.32 + .2 * L[o + 4]), tl = 2 * vy / 9.81;
      const k = Math.max(1, Math.round(v0 / 22 * tl / PI)), ph = PI / 2 + k * PI + (L[o + 7] - .5) * .5;
      O.V0[i] = v0; O.TLD[i] = tl; O.OM[i] = ph / tl;
    }
  });
  let nNear = 0; while (nNear < n && O.D[nNear] < RTH) nNear++;
  const T_ = []; let i = nNear;
  while (i < n) {
    const k0 = keys[idx[i]]; let j = i, sx = 0, sy = 0, sz = 0, hm = 0;
    while (j < n && keys[idx[j]] === k0) { sx += O.X[j]; sy += O.Y[j]; sz += O.Z[j]; if (O.H[j] > hm) hm = O.H[j]; j++; }
    const m = j - i; sx /= m; sy /= m; sz /= m; let rr = 0; for (let q = i; q < j; q++) rr = Math.max(rr, Math.hypot(O.X[q] - sx, O.Y[q] - sy, O.Z[q] - sz));
    T_.push(i, j, sx, sy + hm * .5, sz, rr + hm + 6);
    i = j;
  }
  O.nNear = nNear; O.TL = new Float64Array(T_); O.nt = T_.length / 6; O.TV = new Float32Array(O.nt);
  return O;
})();
lapW('forest ' + FOR.n + ' trees (' + FOR.nNear + ' near), ' + FOR.nt + ' tiles');
/* the shock's arrival (sim s) at distance d, from the FX module */
function setShock(arrive) { for (let i = 0; i < FOR.n; i++) FOR.AH[i] = arrive(FOR.D[i]); }
const FBUDGET = 75000;
const treeN = hpx => { if (hpx < 6) return .06 * hpx * hpx; const q = hpx - 6, n = 2.16 + 1.5 * q + .01 * q * q; return n < NTP ? n : NTP; };
/* per-tree pose scratch: base, bent axes (scaled), unbent axes (for the stump), local sun / strike directions */
const TP = new Float64Array(32);
/* the tree's base and bend at a (TP[9..16], TP[23] = phi) */
function treeBase(i, a) {
  const F_ = FOR, ux = F_.UX[i], uz = F_.UZ[i], d = F_.D[i];
  let bx = F_.X[i], by = F_.Y[i], bz = F_.Z[i], phi = 0, piv = -1, strip = 0;
  const tau = a - F_.AH[i];
  if (tau > 0) {
    if (d < RTH) {
      const tl = F_.TLD[i], t = tau < tl ? tau : tl, v0 = F_.V0[i], vy = tl * 4.905;
      const L_ = v0 * t / (1 + t * .35) + (tau > tl ? 14 * (1 - Math.exp(-(tau - tl) * 2)) : 0);
      bx += ux * L_; bz += uz * L_;
      const yg = gPc(d + L_, F_.TH[i]);
      by = tau < tl ? Math.max(yg, by + vy * t - 4.905 * t * t) : yg;
      phi = F_.OM[i] * t; strip = .75;
    } else if (d < RFL) {
      phi = F_.PM[i] * (1 - Math.exp(-tau * 7)); piv = .08 + .06 * F_.RN[i]; strip = .6 * Math.min(1, tau * 3);
    } else {
      const pm = F_.PM[i], pe = pm * .3, t = tau - .14;
      phi = t < 0 ? pm * tau / .14 : pe + (pm - pe) * Math.exp(-t * 1.1) * Math.cos(t * 2.6);
      strip = F_.SB[i] * Math.min(1, tau * 3);
    }
  }
  TP[9] = bx; TP[10] = by; TP[11] = bz; TP[12] = F_.W[i] * F_.H[i]; TP[13] = F_.H[i]; TP[14] = piv; TP[15] = strip; TP[16] = tau; TP[23] = phi;
  return TP;
}
/* its axes: the yaw's unit axes bent about A = (uz, 0, -ux) by phi (Rodrigues; A x v = (ux vy, -ux vx - uz vz, uz vy)),
   and the sun and the strike in its own frame */
function treeAxes(i) {
  const F_ = FOR, yc = F_.YC[i], ys = F_.YS[i], ux = F_.UX[i], uz = F_.UZ[i], phi = TP[23];
  const c = Math.cos(phi), s = Math.sin(phi), k1 = 1 - c;
  let ad = uz * yc + ux * ys;                                        // X axis (yc, 0, -ys)
  TP[0] = yc * c + uz * ad * k1; TP[1] = (-ux * yc + uz * ys) * s; TP[2] = -ys * c - ux * ad * k1;
  TP[3] = ux * s; TP[4] = c; TP[5] = uz * s;                         // Y axis (0, 1, 0)
  ad = uz * ys - ux * yc;                                            // Z axis (ys, 0, yc)
  TP[6] = ys * c + uz * ad * k1; TP[7] = (-ux * ys - uz * yc) * s; TP[8] = yc * c - ux * ad * k1;
  for (let q = 0; q < 3; q++) { TP[17 + q] = TP[q * 3] * SUN[0] + TP[q * 3 + 1] * SUN[1] + TP[q * 3 + 2] * SUN[2]; TP[20 + q] = -(TP[q * 3] * ux + TP[q * 3 + 2] * uz) * .97 + TP[q * 3 + 1] * .24; }
}
const HF = new Float32Array(4096); { const r = rng(4343); for (let i = 0; i < 4096; i++) HF[i] = r(); }
/* draw one tree (index i) with n dots (fractional: the last fades), its pose in TP */
let FD_ = null, FU_ = null;
function drawTree(i, n, a, T, vis, HZ, scanC) {
  const P = TP, F_ = FOR, e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, D = FD_, U32 = FU_;
  const ax0 = P[0], ax1 = P[1], ax2 = P[2], ay0 = P[3], ay1 = P[4], ay2 = P[5], az0 = P[6], az1 = P[7], az2 = P[8];
  const bx = P[9], by = P[10], bz = P[11], w = P[12], h = P[13], piv = P[14], strip = P[15], tau = P[16];
  const sl0 = P[17], sl1 = P[18], sl2 = P[19], hl0 = P[20], hl1 = P[21], hl2 = P[22];
  const yc = F_.YC[i], ys = F_.YS[i], ux = F_.UX[i], uz = F_.UZ[i], d = F_.D[i], rn = F_.RN[i];
  const base = (.6 + .25 * rn) * vis, tb = F_.K[i] * NTP * TPS;
  // light from the strike: the flash (scorching the side facing it), the shock front passing (a scan-like wave), embers
  const fl = a > 0 ? Math.exp(-a * 1.5) / (1 + (d / 700) * (d / 700)) * 1.6 : 0;
  const scan = tau > 0 && tau < .45 ? 1 - tau / .45 : 0;
  const char = a > 0 ? (1 - E.ss(250, 1350, d)) * E.ss(0, 2.5, a) * .55 : 0;
  const burn = tau > 0 && d < 700 && a < 70 ? (1 - d / 700) * (1 - E.ss(30, 70, a)) : 0, frm = Math.floor(T * 14);
  const keepN = strip > 0 ? n * (1 - strip) : n, nI = Math.ceil(n);
  for (let j = 0; j < nI; j++) {
    const q = tb + j * TPS, lx = TPL[q], ly = TPL[q + 1], lz = TPL[q + 2];
    let x, y, z, al = j < n - 1 ? 1 : n - j;
    if (ly < piv) { x = bx + (lx * yc + lz * ys) * w; y = by + ly * h; z = bz + (-lx * ys + lz * yc) * w; }
    else {
      x = bx + ax0 * lx * w + ay0 * ly * h + az0 * lz * w; y = by + ax1 * lx * w + ay1 * ly * h + az1 * lz * w; z = bz + ax2 * lx * w + ay2 * ly * h + az2 * lz * w;
      if (j >= keepN) {   // stripped: leaves and twigs blown out, falling, fading
        const hj = HF[(i * 7 + j) & 4095], L_ = (40 + 110 * hj) * (1 - Math.exp(-tau * .8)) * (d < RFL ? 1.4 : .7);
        x += ux * L_ + (HF[(j * 3 + i) & 4095] - .5) * L_ * .5; z += uz * L_ + (HF[(j * 5 + i * 3) & 4095] - .5) * L_ * .5; y += 9 * tau * hj - 1.2 * tau * tau;
        al *= Math.exp(-tau * .55); if (al < .03) continue;
      }
    }
    const dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < near) continue;
    const iz = F / zc, sx = cx + (dx * r[0] + dy * r[1] + dz * r[2]) * iz; if (sx < 0 || sx >= BW) continue;
    const sy = cy - (dx * u[0] + dy * u[1] + dz * u[2]) * iz; if (sy < 0 || sy >= BH) continue;
    const nx = TPL[q + 3], ny = TPL[q + 4], nz = TPL[q + 5], ao = TPL[q + 6];
    const lam = nx * sl0 + ny * sl1 + nz * sl2;
    let b = (.16 + .66 * (lam > 0 ? lam : 0) + .18 * ao) * base * (1 - char), cr = WH[0], cg = WH[1], cb = WH[2];
    if (fl > .03) { const lh = nx * hl0 + ny * hl1 + nz * hl2; if (lh > 0) { const k = Math.min(1, fl * lh); if (b < k) b = k; cr += (FIRE_[0] - cr) * k; cg += (FIRE_[1] - cg) * k; cb += (FIRE_[2] - cb) * k; if (k > .6) { const k2 = (k - .6) * 2.5; cr += (HOT[0] - cr) * k2; cg += (HOT[1] - cg) * k2; cb += (HOT[2] - cb) * k2; } } }
    if (scan > 0) { const k = scan * scan; if (b < .95 * k) b = .95 * k; cr += (scanC[0] - cr) * k; cg += (scanC[1] - cg) * k; cb += (scanC[2] - cb) * k; }
    if (burn > 0 && HF[(j * 13 + i) & 4095] < .14) { const k = burn * (.45 + .55 * HF[(j * 7 + frm * 31 + i) & 4095]); if (b < k) b = k; cr = FIRE_[0]; cg = FIRE_[1] * (.8 + .2 * k); cb = FIRE_[2] * .8; }
    const hq = zc * HZ; b *= al / (1 + hq * hq);
    if (b < .02) continue; if (b > 1) b = 1;
    const p = (sy | 0) * BW + (sx | 0), G_ = cg * b;
    if (D[(p << 2) + 1] < G_) U32[p] = 0xff000000 | ((cb * b) << 16) | (G_ << 8) | (cr * b);
  }
}
/* a far tree: one dot at its crown (moved and bent as the full model would be), tinted like it */
const FC_ = new Float64Array(16);
function farTree(i, a, vis, HZ, scanC) {
  const F_ = FOR, Q = FC_;
  const tau = a - F_.AH[i], d = F_.D[i];
  let x, y, z, strip = 0;
  if (tau > 0) { treeBase(i, a); const h = TP[13] * .62, phi = TP[23], sp = Math.sin(phi); x = TP[9] + F_.UX[i] * sp * h; y = TP[10] + Math.cos(phi) * h; z = TP[11] + F_.UZ[i] * sp * h; strip = TP[15]; }
  else { x = F_.X[i]; y = F_.Y[i] + F_.H[i] * .62; z = F_.Z[i]; }
  const dx = x - Q[0], dy = y - Q[1], dz = z - Q[2], zc = dx * Q[3] + dy * Q[4] + dz * Q[5]; if (zc < Q[14]) return;
  const iz = Q[12] / zc, sx = Q[13] + (dx * Q[6] + dy * Q[7] + dz * Q[8]) * iz; if (sx < 0 || sx >= BW) return;
  const sy = Q[15] - (dx * Q[9] + dy * Q[10] + dz * Q[11]) * iz; if (sy < 0 || sy >= BH) return;
  let b = (.34 + .3 * F_.RN[i]) * vis * (strip > .5 ? .7 : 1), cr = WH[0], cg = WH[1], cb = WH[2];
  if (a > 0) {
    b *= 1 - (1 - E.ss(250, 1350, d)) * E.ss(0, 2.5, a) * .55;
    const fl = Math.exp(-a * 1.5) / (1 + (d / 700) * (d / 700)) * 1.1;
    if (fl > .03) { const k = fl > 1 ? 1 : fl; if (b < k) b = k; cr += (FIRE_[0] - cr) * k; cg += (FIRE_[1] - cg) * k; cb += (FIRE_[2] - cb) * k; }
    if (tau > 0 && tau < .45) { const k = (1 - tau / .45) * (1 - tau / .45); if (b < .95 * k) b = .95 * k; cr += (scanC[0] - cr) * k; cg += (scanC[1] - cg) * k; cb += (scanC[2] - cb) * k; }
  }
  const hq = zc * HZ; b /= 1 + hq * hq; if (b < .02) return; if (b > 1) b = 1;
  const p = (sy | 0) * BW + (sx | 0), G_ = cg * b, pk = 0xff000000 | ((cb * b) << 16) | (G_ << 8) | (cr * b);
  if (FD_[(p << 2) + 1] < G_) FU_[p] = pk;
  // a tree laid flat: two more dots down its trunk, so the blown-down forest reads as streaks away from the strike
  if (tau > 0 && TP[23] > .6) {
    const h = TP[13], phi = TP[23], sp = Math.sin(phi), cp = Math.cos(phi);
    for (let k = 1; k <= 2; k++) {
      const f_ = k === 1 ? .32 : .02, x2 = TP[9] + F_.UX[i] * sp * h * f_ - Q[0], y2 = TP[10] + cp * h * f_ + .5 - Q[1], z2 = TP[11] + F_.UZ[i] * sp * h * f_ - Q[2];
      const z_ = x2 * Q[3] + y2 * Q[4] + z2 * Q[5]; if (z_ < Q[14]) continue;
      const i2 = Q[12] / z_, sx2 = Q[13] + (x2 * Q[6] + y2 * Q[7] + z2 * Q[8]) * i2, sy2 = Q[15] - (x2 * Q[9] + y2 * Q[10] + z2 * Q[11]) * i2;
      if (sx2 < 0 || sx2 >= BW || sy2 < 0 || sy2 >= BH) continue;
      const p2 = (sy2 | 0) * BW + (sx2 | 0); if (FD_[(p2 << 2) + 1] < G_) FU_[p2] = pk;
    }
  }
}
let FCNT = 0;
function oneTree(i, a, T, vis, HZ, scanC, kB) {
  const F_ = FOR, e = C.eye, f = C.f, h = F_.H[i];
  // the size on screen from where it stands (the thrown ones from where they are)
  let mx = F_.X[i], my = F_.Y[i] + h * .5, mz = F_.Z[i];
  const moving = F_.D[i] < RTH && a > F_.AH[i];
  if (moving) { treeBase(i, a); mx = TP[9]; my = TP[10]; mz = TP[11]; }
  const zc = (mx - e[0]) * f[0] + (my - e[1]) * f[1] + (mz - e[2]) * f[2];
  if (zc < -h && !moving) return;
  const n = treeN(h * C.fl / Math.max(1, zc)) * kB;
  if (n < 2.5) { if (n < 1 && HF[(i * 7) & 4095] > n) return; farTree(i, a, vis, HZ, scanC); FCNT++; return; }
  if (!moving) treeBase(i, a);
  const hh = TP[13], cx_ = TP[9] + TP[3] * hh * .5, cy_ = TP[10] + TP[4] * hh * .5, cz_ = TP[11] + TP[5] * hh * .5;
  const tau = TP[16];
  if (!K.wIn(F_.X[i], F_.Y[i] + hh * .5, F_.Z[i], hh * 1.1 + (TP[15] > 0 ? 160 * Math.min(1, tau) : 0) + (moving ? Math.hypot(TP[9] - F_.X[i], TP[11] - F_.Z[i]) : 0))) return;
  treeAxes(i);
  const nn = Math.min(NTP, n);
  drawTree(i, nn, a, T, vis, HZ, scanC); FCNT += nn;
}
function drawForest(a, T, vis) {
  if (vis < .01) return 0;
  const alt = Math.hypot(C.eye[0], C.eye[1] + RE, C.eye[2]) - RE; if (alt > 30000) return 0;
  FD_ = K.pb.d; FU_ = u32();
  const F_ = FOR, TL = F_.TL, TV = F_.TV, F = C.fl, HZ = hazeK(), e = C.eye, f = C.f;
  { const Q = FC_; Q[0] = e[0]; Q[1] = e[1]; Q[2] = e[2]; Q[3] = f[0]; Q[4] = f[1]; Q[5] = f[2]; Q[6] = C.r[0]; Q[7] = C.r[1]; Q[8] = C.r[2]; Q[9] = C.u[0]; Q[10] = C.u[1]; Q[11] = C.u[2]; Q[12] = C.fl; Q[13] = C.cx + C.shake[0]; Q[14] = C.near; Q[15] = C.cy + C.shake[1]; }
  const scanC = SH.col || HOT;
  // pass 1: the visible tiles and the dots they want (the near trees counted one by one)
  let want = 0;
  for (let t = 0; t < F_.nt; t++) {
    const q = t * 6;
    if (!K.wIn(TL[q + 2], TL[q + 3], TL[q + 4], TL[q + 5])) { TV[t] = 0; continue; }
    const zt = Math.max(1, K.WZ[0] - TL[q + 5] * .5); if (zt * HZ > 4) { TV[t] = 0; continue; }
    TV[t] = zt; want += (TL[q + 1] - TL[q]) * treeN(19 * F / Math.max(1, K.WZ[0]));
  }
  for (let i = 0; i < F_.nNear; i++) { const dx = F_.X[i] - e[0], dy = F_.Y[i] - e[1], dz = F_.Z[i] - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc > 1) want += treeN(F_.H[i] * F / zc); }
  const kB = want > FBUDGET ? FBUDGET / want : 1;
  FCNT = 0;
  for (let i = 0; i < F_.nNear; i++) oneTree(i, a, T, vis, HZ, scanC, kB);
  for (let t = 0; t < F_.nt; t++) {
    if (!TV[t]) continue;
    const q = t * 6, hp = 19 * F / TV[t], keep = hp < 10 ? Math.max(.22, Math.pow(hp / 10, 1.5)) : 1;
    for (let i = TL[q]; i < TL[q + 1]; i++) { if (keep < 1 && HF[(i * 13) & 4095] > keep) continue; oneTree(i, a, T, vis, HZ, scanC, kB); }
  }
  return FCNT;
}

return { RE, CE, coastZ, coastBig, ground, roadD, HIT, makePatch, drawPatch, makeSea, drawSea, drawGlobe, drawLimb, STARS, CLOUD, GLB, PO, PR, PM, PI_, PG_, SO, SR, SM, SN, SH, LG, drop, SPAN, drawSite, VEHS, drawVehicles, GC,
  gP, gPc, CRA, craterDy, craterSl, craterG, RAY, RAYN, FOR, setShock, drawForest, G2, SUN, hazeK };
};
