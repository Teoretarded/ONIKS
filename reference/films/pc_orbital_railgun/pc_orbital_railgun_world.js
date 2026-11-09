/* ORBITAL RAILGUN world (window.ORW(K) -> the world): the Earth seen from orbit (a dot globe, land brighter, the
   coast brightest, the limb's air glow, a thin cloud deck), the stars, and the coast the rod hits: a headland with
   a coastal battery, drawn as heightfield patches on regular lattices (dense round the strike and round the ground
   camera, coarse out to 15 km) and a moving sea, all with per-dot power-of-two LOD (no popping); the crater the
   strike digs (the land lattice deformed into a bowl with a rim and ejecta rays, CRA.a set by the FX module); a
   forest round the site (dot-model trees, scorched, lit by the passing shock, stripped, thrown and laid flat by it).
   The ground camera's patch sits round G2, where the FX module films the strike from the forest (OPT.gcam is kept
   for the film but no longer places a patch); round it the exact ground, a hero stand of full trees, a dense forest
   floor (with the flash's trunk shadows) and, for the slow-motion beat (BEAT), the front's wall of dust. GOPT is set
   by the FX module each frame (load sharing, the haze of dust round the ground camera, the land lattice thinned
   under the dense floor).
   World frame: metres, the site's plateau at the origin, +Y up, +Z inland (north), the sea to the south; the Earth's
   centre at (0, -RE, 0); far points drop under the curve. Everything is a pure function of the times passed in. */
window.ORW = function (K, OPT) {
OPT = OPT || {};
'use strict';
const { V, R, X, E, rng, noise, fbm } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const BW = K.BW, BH = K.BH;                       // (the raster: STAGE.RES)
const C = K.C;
const LIME = K.LIME, HOT = K.HOT, WH = K.WH, FIRE_ = [255, 196, 138];
/* the strike's front is never lime (lime is for own forces and scans): a lime ring colour from the film turns warm white */
const FRONT = [255, 236, 204];
const shc = () => { const c = SH.col; return !c ? HOT : c[1] > c[0] + 20 ? FRONT : c; };
let SHC = HOT;
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
const CRA = { a: -1, R: 200, D: 52, H: 18, x: 0, z: 0 };
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
/* the mushroom's shadow on the land (set by the FX module each frame): the cap's disc at (x, z) radius r, the stem's
   strip from (sx, sz) to the disc, half width sw, strength k */
const CSH = { k: 0, x: 0, z: 0, r: 0, sx: 0, sz: 0, sw: 0 };
/* load sharing set by the FX module while the strike fills the frame: a coarser ground, a smaller forest budget */
const GOPT = { pxm: 1, fbud: 1, hz: 1, hk: 0 };     // hz: the air's haze x (dust round the ground camera); hk: the land lattice
                                                   // thinned under the dense forest floor in the beat's view (GH: x, z, r)
const CR_OUT = CRA.R * 8;
/* radial tables (0.5 m steps): the height offset, the slope, 1 / sqrt(1 + slope^2), the slope light's weight, and
   exp(-(u-1)/2.4); per angle: the ray strength and exp(-(u-1)/L) is taken from the ray length table at run time */
const CRN = Math.ceil(CR_OUT * 2) + 2, CR_DY = new Float32Array(CRN), CR_SL = new Float32Array(CRN), CR_W = new Float32Array(CRN), CR_EB = new Float32Array(CRN);
for (let i = 0; i < CRN; i++) { const d = i / 2, u = d / CRA.R; CR_DY[i] = craterDy(d); CR_SL[i] = craterSl(d); CR_W[i] = 1 - E.ss(CRA.R * 1.4, CRA.R * 2.6, d); CR_EB[i] = u > 1 ? Math.exp(-(u - 1) / 2.4) : 1; }
const CR_LAM0 = 1 / (.08 + .92 * SUN[1]);
function craterAt(qx, qz, d, g, a) {
  const R_ = CRA.R, u = d / R_, ri = (d * 2) | 0;
  CRO[0] = CR_DY[ri] * g;
  // light from the bowl's own slope (relative to flat ground), weighted in near the rim
  let f = 1;
  const w = CR_W[ri];
  if (w > 0) { const sl = CR_SL[ri] * g, id = d > .01 ? 1 / d : 0, nl = 1 / Math.sqrt(1 + sl * sl), lam = (-sl * id * (qx * SUN[0] + qz * SUN[2]) + SUN[1]) * nl; f = 1 + ((.08 + .92 * (lam > 0 ? lam : 0)) * CR_LAM0 - 1) * w; }
  // the rim crest catches the light; the ejecta blanket: scorched, with bright rays
  if (u > .9) {
    // a fast atan2 (to ~0.005 rad), in 0..TAU
    const ax = qx < 0 ? -qx : qx, az = qz < 0 ? -qz : qz, mn = ax < az ? ax : az, mx = ax < az ? az : ax, q_ = mn / (mx + 1e-9), q2 = q_ * q_;
    let ti = ((-.0464964749 * q2 + .15931422) * q2 - .327622764) * q2 * q_ + q_;
    if (az > ax) ti = 1.5707963 - ti; if (qx < 0) ti = 3.1415927 - ti; if (qz < 0) ti = TAU - ti;
    const k = ((ti * (RAYN / TAU)) | 0) & (RAYN - 1), ry = RAY[k], ex = u > 1 ? u - 1 : 0, xi = (ex / CRA.RL[k] * 64) | 0, ray = ry * (xi < 1024 ? EXN[xi] : 0);
    f *= (1 - .62 * g * CR_EB[ri] * (1 - ray)) * (1 + 1.5 * g * ray);
    if (u < 1.12) f *= 1 + .5 * g * (1 - Math.abs(u - 1.03) / .09);
  }
  CRO[1] = f;
  CRO[2] = u < .92 ? Math.min(1, CR_HOT * (1 - u * u / .85)) * g : 0;
  return CRO;
}
let CR_HOT = 0;
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
  CR_HOT = crOn ? 1.25 * Math.exp(-crA / 70) : 0;
  const hk = GOPT.hk, csk = CSH.k, csx = CSH.x, csz = CSH.z, csr = CSH.r, csr2 = (csr * 1.3) * (csr * 1.3), cssx = CSH.sx, cssz = CSH.sz, csdx = CSH.x - CSH.sx, csdz = CSH.z - CSH.sz, csl2 = csdx * csdx + csdz * csdz + 1e-6, csw = CSH.sw;
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
            if (kl > .02) { const fl = kl * .9 * a * cmp * gg * hv * Math.min(1, bb / 255 * 2.4); if (b < fl) b = fl; const kk = kl > 1 ? 1 : kl; cr += (SHC[0] - cr) * kk; cg += (SHC[1] - cg) * kk; cb += (SHC[2] - cb) * kk; }
            if (!crOn && d < Q.dr) b *= 1 - Q.dark * (1 - d / Q.dr);
          }
        }
        if (csk > 0) {
          const qx = x - csx, qz = z - csz, d2 = qx * qx + qz * qz; let s_ = 0;
          if (d2 < csr2) { const d = Math.sqrt(d2); s_ = d < csr * .85 ? 1 : 1 - (d - csr * .85) / (csr * .45); }
          const px = x - cssx, pz = z - cssz, t = (px * csdx + pz * csdz) / csl2;
          if (t > 0 && t < 1) { const ox = px - csdx * t, oz = pz - csdz * t, dd = Math.sqrt(ox * ox + oz * oz); if (dd < csw * 1.4) { const s2 = dd < csw ? .8 : .8 * (1 - (dd - csw) / (csw * .4)); if (s2 > s_) s_ = s2; } }
          if (s_ > 0) b *= 1 - csk * s_;
        }
        if (hk > 0) { const qx = x - GH[0], qz = z - GH[1], q2 = qx * qx + qz * qz; if (q2 < GH[3]) { const q = Math.sqrt(q2), k = hk * (q < GH[2] ? 1 : 1 - (q - GH[2]) / (GH[4] - GH[2])); b *= 1 - k; } }
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
function hazeK() { const e = C.eye, alt = Math.max(0, Math.hypot(e[0], e[1] + RE, e[2]) - RE); return GOPT.hz / (3800 + 3200 * E.ss(0, 1500, alt) + alt * 5.5); }

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
          if (d2 < rA2) { const d = Math.sqrt(d2); let kl = 0; if (d < Q.r0 && d > Q.rIn) kl = Q.k * EXN[((Q.r0 - d) * Q.wdi) | 0]; if (d < Q.gR) { const gl = Q.g * EXN[(d * Q.gri) | 0]; if (gl > kl) kl = gl; } if (kl > .02) { const fl = kl * .8 * a * cmp * gg * hv * Math.min(1, bb / 255 * 2.4); if (b < fl) b = fl; const kk = kl > 1 ? 1 : kl; cr += (SHC[0] - cr) * kk; cg += (SHC[1] - cg) * kk; cb += (SHC[2] - cb) * kk; } }
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
          const ok = K.occK(sx, sy, zq); if (!ok) continue;
          const bb = as * (.55 + .9 * h3) * ok; if (bb < .02) continue;
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
      const ok = K.occK(sx, sy, zc); if (!ok) continue;
      let bb = P[j + 3] * vis * a * ok;
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
          if (K.pj(LP[0], LP[1], LP[2])) { const ok = K.occK(K.PJ[0], K.PJ[1], K.PJ[2]); if (ok) K.dot(K.PJ[0], K.PJ[1], 1, col[0], col[1], col[2], al * ok); }
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
const G2 = (() => { const d = V.norm([-.55, 0, .83]), x = HIT[0] + d[0] * 1500, z = HIT[2] + d[2] * 1500; return [x, ground(x, z) - drop(x, z), z]; })();
const HERO_R = 62;                                    // the hero stand round the ground camera (full tree models)
/* the slow-motion beat's camera (the FX module): 26 m nearer the strike than G2 and 5 m up, looking 34 deg off the
   strike on the side away from the sun (the stand lit from behind the lens, the fireball at the frame's edge); the
   front crosses its stand in the middle of the beat. Azimuths in the x-z plane (atan2(z, x)) */
const BEAT = (() => {
  const hx = HIT[0] - G2[0], hz = HIT[2] - G2[2], l = Math.hypot(hx, hz), h = [hx / l, hz / l];
  let p = [-h[1], h[0]]; if (p[0] * SUN[0] + p[1] * SUN[2] > 0) p = [h[1], -h[0]];
  // (34 deg off the strike: the fireball and the rising cloud in the frame's side, the stand backlit against them)
  const k = 34 * DEG, L = [Math.cos(k) * h[0] + Math.sin(k) * p[0], Math.cos(k) * h[1] + Math.sin(k) * p[1]];
  const cx = G2[0] + h[0] * 26, cz = G2[2] + h[1] * 26;
  return { toHit: Math.atan2(h[1], h[0]), az: Math.atan2(L[1], L[0]), side: Math.atan2(p[1], p[0]), cam: [cx, ground(cx, cz) - drop(cx, cz) + 5, cz] };
})();
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
/* round the ground camera the exact ground (the stand, the floor and the lens stand on it), blended into the coarse one */
const IPM = interpH(PM);
const PG_ = makePatch(R_G[0], R_G[1], R_G[2], R_G[3], R_G[3], null, (x, z, cz) => { const q = Math.hypot(x - G2[0], z - G2[2]); if (q > 420) return IPM(x, z, cz); const g = ground(x, z); return q < 300 ? g : E.mix(g, IPM(x, z, cz), E.ss(300, 420, q)); }, (x, z) => wIn_(x, z, R_G));
lapW('camera patch');
const SO = makeSea(-OUTER, -OUTER, 40, Math.round(2 * OUTER / 40), Math.round(2 * OUTER / 40), (x, z) => deep(x, z, R_R), (x, z) => outerFade(x, z) * under(x, z, [R_R]));
const SR = makeSea(R_R[0], R_R[1], R_R[2], R_R[3], R_R[3], (x, z) => deep(x, z, R_M), (x, z) => wIn_(x, z, R_R) * under(x, z, [R_M]));
const SM = makeSea(R_M[0], R_M[1], R_M[2], R_M[3], R_M[3], (x, z) => deep(x, z, R_SN), (x, z) => wIn_(x, z, R_M) * under(x, z, [R_SN]));
const SN = makeSea(R_SN[0], R_SN[1], R_SN[2], R_SN[3], R_SN[3], null, (x, z) => wIn_(x, z, R_SN));
lapW('sea');
function drawSite(vis, seaT, pxf) {
  let n = 0; SHC = shc();
  { const h = C.eye[1] - HIT[1], dh = Math.hypot(C.eye[0] - HIT[0], C.eye[2] - HIT[2]); pxf *= (1 + .28 * E.ss(900, 2600, h) * (1 - E.ss(6000, 12000, dh))) * GOPT.pxm; }
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
/* the coastal battery is retired (the strike now hits the facility, pc_orbital_railgun_target.js): ?battery brings it back */
const VEHS = (STAGE.Q && STAGE.Q.has('battery') ? VEH : []).map(([key, kind, x, z, yaw, chip]) => { const gy = ground(x, z) - drop(x, z); const Wv = X.make(R.y(yaw), [x, gy, z]); const parts = vehModel(kind); return { key, kind, x, z, chip, W: Wv, parts, d: Math.hypot(x - HIT[0], z - HIT[2]), c: [x, gy + 2, z] }; });
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
/* the facility's ground (pc_orbital_railgun_target.js: ORTGT.sites() footprints, ORTGT.clear(x, z) for its roads,
   aprons and runway) is kept clear of trees */
const TGF = (() => { const T_ = window.ORTGT, S = T_ && typeof T_.sites === 'function' ? T_.sites() || [] : []; return { S, clear: T_ && typeof T_.clear === 'function' ? T_.clear : null }; })();
const onFacility = (x, z) => {
  if (TGF.clear && TGF.clear(x, z)) return true;
  for (const s of TGF.S) { const dx = x - s.x, dz = z - s.z, c = Math.cos(s.yaw || 0), sn = Math.sin(s.yaw || 0), lx = dx * c + dz * sn, lz = -dx * sn + dz * c; if (Math.abs(lx) < s.w / 2 + 14 && Math.abs(lz) < s.d / 2 + 14) return true; }
  return false;
};
const FOR = (() => {
  const r = rng(6161), SP = 11, R1 = 3000, L = [];
  for (let gz = -R1; gz <= R1; gz += SP) for (let gx = -R1; gx <= R1; gx += SP) {
    const jx = r(), jz = r(), rr = r(), r2 = r(), r3 = r(), r4 = r(), r5 = r();
    const x = HIT[0] + gx + (jx - .5) * SP * .95, z = HIT[2] + gz + (jz - .5) * SP * .95;
    const d = Math.hypot(x - HIT[0], z - HIT[2]); if (d < 150 || d > R1) continue;
    const cz = coastZ(x); if (z - cz < 60) continue;
    if (roadD(x, z) < 7 || Math.hypot(x - SITE_C[0], z - SITE_C[1]) < 175 || Math.hypot(x - G2[0], z - G2[2]) < HERO_R) continue;
    if (onFacility(x, z)) continue;
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
let ARR_ = d => 1e9;
function setShock(arrive, shockR) {
  ARR_ = arrive; if (shockR) SHR = shockR;
  for (let i = 0; i < FOR.n; i++) FOR.AH[i] = arrive(FOR.D[i]);
  for (const h of HERO) { h.AH = arrive(h.d); h.vf = 8 / Math.max(1e-4, arrive(h.d + 4) - arrive(h.d - 4)); }
  for (let i = 0; i < NFLR; i++) FLR_AH[i] = arrive(FLR[i * FS + 3]);
}
const FBUDGET = 75000 * K.S * K.S * (K.HQ ? 2 : 1);           // (x S^2 at a higher res, x 2 in HQ)
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
  const scan = tau > 0 && tau < .1 ? 1 - tau / .1 : 0;
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
    if (tau > 0 && tau < .1) { const k = (1 - tau / .1) * (1 - tau / .1); if (b < .95 * k) b = .95 * k; cr += (scanC[0] - cr) * k; cg += (scanC[1] - cg) * k; cb += (scanC[2] - cb) * k; }
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
  const scanC = shc();
  // pass 1: the visible tiles and the dots they want (the near trees counted one by one)
  let want = 0;
  for (let t = 0; t < F_.nt; t++) {
    const q = t * 6;
    if (!K.wIn(TL[q + 2], TL[q + 3], TL[q + 4], TL[q + 5])) { TV[t] = 0; continue; }
    const zt = Math.max(1, K.WZ[0] - TL[q + 5] * .5); if (zt * HZ > 4) { TV[t] = 0; continue; }
    TV[t] = zt; want += (TL[q + 1] - TL[q]) * treeN(19 * F / Math.max(1, K.WZ[0]));
  }
  for (let i = 0; i < F_.nNear; i++) { const dx = F_.X[i] - e[0], dy = F_.Y[i] - e[1], dz = F_.Z[i] - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc > 1) want += treeN(F_.H[i] * F / zc); }
  const fb = FBUDGET * GOPT.fbud, kB = want > fb ? fb / want : 1;
  FCNT = 0;
  for (let i = 0; i < F_.nNear; i++) oneTree(i, a, T, vis, HZ, scanC, kB);
  for (let t = 0; t < F_.nt; t++) {
    if (!TV[t]) continue;
    const q = t * 6, hp = 19 * F / TV[t], keep = hp < 10 ? Math.max(.22, Math.pow(hp / 10, 1.5)) : 1;
    for (let i = TL[q]; i < TL[q + 1]; i++) { if (keep < 1 && HF[(i * 13) & 4095] > keep) continue; oneTree(i, a, T, vis, HZ, scanC, kB); }
  }
  return FCNT;
}

/* ---------------- the hero stand: full tree models round the ground camera ----------------
   56 trees within HERO_R of G2 (where the FX module films the strike from the forest floor): 34 framed for the
   slow-motion beat's camera (BEAT: 12 placed by hand, near ones left and right, a middle ground, a back row), 10 on the
   strike's side (a lane left open toward it), the rest round the ring; the far forest starts at HERO_R. Each a dense dot
   model from one of four templates (two conifers: bark on a tapered trunk with a root flare, whorls of drooping limbs
   carrying needle clumps; two broadleaves: a trunk forking into limbs and sub-limbs with leaf clumps), 6-11k points,
   shuffled within each kind so any prefix is an even subset (the count follows the size on screen). The strike tears
   them apart as pure functions of the sim time a: the flash scorches the side facing it and sets the crowns smoking;
   the shock front sweeps through each tree point by point (a lime layer); the leaves strip and stream out in the
   wind; limbs break off and tumble away; the trunk bends, then snaps (the top slammed down flat away from the strike,
   its butt dragged downwind, a splintered stump left) or the root plate tears out and the whole tree goes over;
   litter and dust lift off the forest floor behind the front. A frame draws at most HBUDGET points of the stand (the
   trees big on screen keep their share, the small ones thin first, their dots brighter to make up); the near trees
   take a warm rim light from the fireball on the strike's side. */
const HS = 8;      // template point stride: x y z (unit height), nx ny nz, group (-1 trunk), hash / along
function heroTpl(kind, seed) {
  const r = rng(seed), TRK = [], WOOD = [], LEAF = [], G = [];   // G: per group [attach y, length]
  const con = kind < 2;
  const r0 = con ? .014 + .003 * kind : (kind === 2 ? .021 : .012);
  const yF = con ? 1 : (kind === 2 ? .4 : .5);         // the fork (broadleaves)
  const rad = y => r0 * Math.pow(Math.max(0, 1 - y / (con ? 1.02 : yF * 1.9)), .85) + .0015 + r0 * 1.1 * Math.exp(-y / .025);
  // the trunk: bark on the tapered cylinder, ridged
  const nT = con ? 2600 : 2200, yTop = con ? .99 : yF + .04;
  for (let i = 0; i < nT; i++) {
    const y = yTop * Math.pow(r(), 1.15), th = r() * TAU, rr = rad(y) * (1 + .1 * Math.sin(th * 11 + y * 40) * r());
    const ridge = .5 + .5 * Math.abs(Math.sin(th * 7 + 3 * noise(y * 30, th, 1.3)));
    TRK.push(Math.cos(th) * rr, y, Math.sin(th) * rr, Math.cos(th), 0, Math.sin(th), -1, ridge);
  }
  // a limb: wood points along a drooping segment, foliage round its outer part (or a clump at its end)
  const limb = (g, ax, ay, az, dx, dy, dz, L, droop, nW, nL, clump) => {
    for (let k = 0; k < nW; k++) { const s = Math.pow(r(), .8), rr = (1 - s) * r0 * .35 + .0008, th = r() * TAU; WOOD.push(ax + dx * L * s + Math.cos(th) * rr, ay + dy * L * s - droop * L * s * s + Math.sin(th) * rr, az + dz * L * s + Math.sin(th) * rr * .5, Math.cos(th), Math.sin(th) * .5, Math.sin(th), g, s); }
    for (let k = 0; k < nL; k++) {
      const s = clump ? .7 + .3 * r() : .25 + .75 * Math.sqrt(r());
      const cx = ax + dx * L * s, cy = ay + dy * L * s - droop * L * s * s, cz = az + dz * L * s;
      const u = r() * 2 - 1, th = r() * TAU, h = Math.sqrt(1 - u * u), q = Math.cbrt(r()) * (clump || (con ? .016 + .018 * s : .03));
      let nx = Math.cos(th) * h, ny = u * .8 + .25, nz = Math.sin(th) * h; const nl = 1 / Math.hypot(nx, ny, nz); nx *= nl; ny *= nl; nz *= nl;
      LEAF.push(cx + nx * q, cy + ny * q * (con ? .5 : .8), cz + nz * q, nx, ny, nz, g, r());
    }
  };
  if (con) {
    const y0 = kind === 0 ? .42 : .14, step = kind === 0 ? .034 : .03;
    for (let y = y0; y < .96; y += step * (.8 + .4 * r())) {
      const nb = 4 + Math.floor(r() * 3), a0 = r() * TAU, f = (y - y0) / (1 - y0);
      for (let b = 0; b < nb; b++) {
        const az = a0 + b / nb * TAU + (r() - .5) * .5, el = (kind === 0 ? -.1 : -.3) + .55 * f + (r() - .5) * .2;
        const L = (kind === 0 ? .2 : .24) * Math.pow(1 - f, .85) * (.7 + .5 * r()) + .02;
        const dx = Math.cos(az) * Math.cos(el), dy = Math.sin(el), dz = Math.sin(az) * Math.cos(el), g = G.length / 2;
        G.push(y, L);
        limb(g, dx * rad(y), y, dz * rad(y), dx, dy, dz, L, kind === 0 ? .25 : .4, Math.round(6 + 70 * L), Math.round(10 + 300 * L), 0);
      }
    }
    if (kind === 0) for (let y = .1; y < y0; y += .03) { const az = r() * TAU, L = .02 + .03 * r(), g = G.length / 2; G.push(y, L); limb(g, Math.cos(az) * rad(y), y, Math.sin(az) * rad(y), Math.cos(az), -.1, Math.sin(az), L, 0, 5, 0, 0); }
    { const g = G.length / 2; G.push(.96, .05); limb(g, 0, .955, 0, 0, 1, 0, .05, 0, 4, 70, 0); }
  } else {
    const nL0 = kind === 2 ? 5 : 4, Lm = kind === 2 ? .42 : .38;
    for (let b = 0; b < nL0; b++) {
      const az = b / nL0 * TAU + (r() - .5) * .8, el = (kind === 2 ? .55 : .95) + (r() - .5) * .3, g = G.length / 2;
      const dx = Math.cos(az) * Math.cos(el), dy = Math.sin(el), dz = Math.sin(az) * Math.cos(el), L = Lm * (.8 + .35 * r()), ay = yF + (r() - .3) * .04;
      G.push(ay, L);
      limb(g, 0, ay, 0, dx, dy, dz, L, .05, Math.round(240 * L), 0, 0);
      const ns = 3 + Math.floor(r() * 2);
      for (let k = 0; k < ns; k++) {
        const s = .45 + .4 * r(), bx = dx * L * s, by = ay + dy * L * s, bz = dz * L * s;
        const a2 = az + (r() - .5) * 1.6, e2 = el + (r() - .5) * .9 - .1, L2 = L * (.4 + .3 * r());
        limb(g, bx, by, bz, Math.cos(a2) * Math.cos(e2), Math.sin(e2), Math.sin(a2) * Math.cos(e2), L2, .06, Math.round(130 * L2), Math.round(1700 * L2), .07 + .05 * r());
      }
      limb(g, 0, ay, 0, dx, dy, dz, L, .05, 0, Math.round(1100 * L), .08);
    }
  }
  const shuf = A => { const n = A.length / HS, O = new Float32Array(A.length), idx = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)), t = idx[i]; idx[i] = idx[j]; idx[j] = t; } for (let i = 0; i < n; i++) for (let q = 0; q < HS; q++) O[i * HS + q] = A[idx[i] * HS + q]; return O; };
  return { kind, con, r0, TRK: shuf(TRK), WOOD: shuf(WOOD), LEAF: shuf(LEAF), G: new Float32Array(G), nG: G.length / 2, birch: kind === 3 };
}
const HTPL = [heroTpl(0, 901), heroTpl(1, 902), heroTpl(2, 903), heroTpl(3, 904)];
for (const t of HTPL) t.np = (t.TRK.length + t.WOOD.length + t.LEAF.length) / HS;
const HBUDGET = 100000 * K.S * K.S * (K.HQ ? 5 : 1);       // (live: 100k, the budget thins the small trees first; HQ renders 500k)       // the stand's points a frame
const HERO = (() => {
  const r = rng(9090), L = [], toHit = BEAT.toHit, adiff = (a, b) => Math.abs(((a - b + 3 * PI) % TAU) - PI);
  // the beat's frame first (key trees by hand: near ones left and right, a middle ground, a back row), then the
  // strike's side (a lane open toward it), then the rest of the ring
  const KEY = [[-24, 14], [19, 17], [-6, 22], [36, 24], [-38, 27], [7, 31], [-19, 36], [26, 39], [-33, 45], [44, 47], [-4, 49], [15, 56]];
  const place = (ang, d, near, o) => {
    o = o || G2; const x = o[0] + Math.cos(ang) * d, z = o[2] + Math.sin(ang) * d; if (Math.hypot(x - G2[0], z - G2[2]) > HERO_R + 4) return false;
    if (Math.hypot(x - BEAT.cam[0], z - BEAT.cam[2]) < 7) return false;
    for (const q of L) if (Math.hypot(q.x - x, q.z - z) < (near ? 4.5 : 5.5) + .05 * d) return false;
    const con = noise(x / 120, z / 120, 8.1) + .25 > 0, kind = con ? (r() < .5 ? 0 : 1) : (r() < .6 ? 2 : 3);
    const H = (con ? 19 + 8 * r() : 15 + 7 * r()) * (d < 12 ? .92 : 1), dh = Math.hypot(x - HIT[0], z - HIT[2]);
    L.push({ x, z, y: ground(x, z) - drop(x, z), kind, H, sw: H * (.9 + .25 * r()), yaw: r() * TAU, d: dh, ux: (x - HIT[0]) / dh, uz: (z - HIT[2]) / dh,
      up: r() < .3, hb: H * (.05 + .22 * r()), ts: .022 + .03 * r(), tf: .05 + .035 * r(), Lm: 2 + 9 * r(), th0: .18 + .14 * r(), rr: 1.2 + .9 * r(), seed: (r() * 1e6) | 0, AH: 1e9, vf: 400 });
    return true;
  };
  for (const [da, d] of KEY) place(BEAT.az + da * DEG + (r() - .5) * .05, d * (.95 + .1 * r()), true, BEAT.cam);
  for (let t = 0; L.length < 34 && t < 4000; t++) place(BEAT.az + (r() - .5) * 110 * DEG, 10 + Math.pow(r(), .8) * 52, true, BEAT.cam);
  for (let t = 0; L.length < 44 && t < 4000; t++) { const ang = toHit + (r() - .5) * 1.6, d = 10 + r() * (HERO_R - 12); if (d < 50 && adiff(ang, toHit) < .12 + 2 / d) continue; place(ang, d, false); }
  for (let t = 0; L.length < 56 && t < 4000; t++) place(r() * TAU, 8 + Math.sqrt(r()) * (HERO_R - 10), false);
  // per group: does it break, when, how fast it is thrown, its tumble
  for (const h of L) {
    const T_ = HTPL[h.kind], n = T_.nG, rg = rng(h.seed);
    h.yc = Math.cos(h.yaw); h.ys = Math.sin(h.yaw);
    h.GB = new Float32Array(n); h.GV = new Float32Array(n * 3); h.GA = new Float32Array(n * 4);
    for (let g = 0; g < n; g++) {
      const br = rg() < (T_.con ? .78 : .62);
      h.GB[g] = br ? .008 + .1 * Math.pow(rg(), 1.5) : 1e9;
      h.GV[g * 3] = 40 + 120 * rg(); h.GV[g * 3 + 1] = 3 + 16 * rg(); h.GV[g * 3 + 2] = (rg() - .5) * 40;
      const ax = V.norm([rg() - .5, rg() - .5, rg() - .5]); h.GA[g * 4] = ax[0]; h.GA[g * 4 + 1] = ax[1]; h.GA[g * 4 + 2] = ax[2]; h.GA[g * 4 + 3] = 5 + 14 * rg();
    }
    h.XG = new Float64Array(n * 15); h.GF = new Uint8Array(n);
  }
  return L;
})();
lapW('hero stand ' + HERO.length + ' trees, ' + HTPL.map(t => (t.TRK.length + t.WOOD.length + t.LEAF.length) / HS).join(' / ') + ' points');
/* the forest floor round the camera: needles, litter and moss, grass and fern tufts, twigs; dense close to the lens (a
   1/q^2 spread keeps the dots about even on screen from eye height), in dappled sun; in the flash lit low from the
   strike with each trunk's long shadow thrown across it (precomputed: the stand stands still until the front); behind
   the front the light litter lifts and streams downwind. FS floats a point: x y z, d (from the strike), h1 h2, tuft
   height, flash shadow 0..1 */
const NFLR = 104000, FS = 8, FLR = (() => {
  const r = rng(9191), A = new Float32Array(NFLR * FS), q0 = 3, q1 = HERO_R + 16;
  const hs = (i, j, k) => { const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
  for (let i = 0; i < NFLR; i++) {
    // half in the ground camera's view toward the strike (+-70 deg, 3..78 m), half in the beat camera's (+-54 deg, 8.5..95 m)
    const bt = i & 1, O = bt ? BEAT.cam : G2, qa = bt ? 8.5 : q0, qb = bt ? 95 : q1, t = bt ? BEAT.az + (r() - .5) * 108 * DEG : BEAT.toHit + (r() - .5) * 140 * DEG;
    const q = 1 / (1 / qa - r() * (1 / qa - 1 / qb)), k = r(), h1 = r(), h2 = r();
    let x = O[0] + Math.cos(t) * q, z = O[2] + Math.sin(t) * q, lift = r() * .04;
    if (k > .8) {         // a grass or fern tuft: blades round a centre on a jittered 0.9 m grid, tips spreading
      const ci = Math.round(x / .9), cj = Math.round(z / .9), up = Math.pow(h2, .8), a_ = h1 * TAU;
      lift = up * (.18 + .42 * hs(ci, cj, 1));
      x = (ci + (hs(ci, cj, 2) - .5) * .6) * .9 + Math.cos(a_) * (.03 + .16 * up); z = (cj + (hs(ci, cj, 3) - .5) * .6) * .9 + Math.sin(a_) * (.03 + .16 * up);
    } else if (k > .72) { // a twig lying on the litter
      const ci = Math.round(x / 2.6), cj = Math.round(z / 2.6), a_ = hs(ci, cj, 4) * PI, L_ = 1 + 2.4 * hs(ci, cj, 5), s_ = (h1 - .5) * L_;
      x = (ci + (hs(ci, cj, 6) - .5) * .8) * 2.6 + Math.cos(a_) * s_; z = (cj + (hs(ci, cj, 7) - .5) * .8) * 2.6 + Math.sin(a_) * s_; lift = .04 + .05 * hs(ci, cj, 8);
    }
    const g = ground(x, z) - drop(x, z), d = Math.hypot(x - HIT[0], z - HIT[2]);
    let sh = 0;
    for (const h of HERO) {
      const px = x - h.x, pz = z - h.z, al = px * h.ux + pz * h.uz; if (al <= 0 || al > 170) continue;
      const lat = Math.abs(px * h.uz - pz * h.ux), hw = h.sw * HTPL[h.kind].r0 * 1.7 + .1, s_ = 1 - E.ss(hw * .6, hw + .008 * al + .08, lat);
      if (s_ > sh) sh = s_;
    }
    const o = i * FS; A[o] = x; A[o + 1] = g + lift; A[o + 2] = z; A[o + 3] = d; A[o + 4] = h1; A[o + 5] = h2; A[o + 6] = k > .8 ? lift : k > .72 ? -1 : 0; A[o + 7] = sh;
  }
  return A;
})();
const FLR_AH = new Float32Array(NFLR).fill(1e9);
/* the two halves' bounding spheres (for a frustum test a frame) */
const FLA = [G2[0] + 40 * Math.cos(BEAT.toHit), G2[1], G2[2] + 40 * Math.sin(BEAT.toHit), 82], FLBc = [BEAT.cam[0] + 52 * Math.cos(BEAT.az), BEAT.cam[1], BEAT.cam[2] + 52 * Math.sin(BEAT.az), 74];
/* each floor dot's brightness in the sun: the kind (tufts catch the light at their tips, twigs pale), dappled light */
const FLB = (() => { const B = new Float32Array(NFLR); for (let i = 0; i < NFLR; i++) { const o = i * FS, x = FLR[o], z = FLR[o + 2], tf = FLR[o + 6], h1 = FLR[o + 4];
  const dap = .5 + .75 * E.ss(.02, .32, noise(x / 5.5, z / 5.5, 3.3) + .3 * noise(x / 1.7, z / 1.7, 8.8));
  B[i] = (tf > 0 ? .55 + .5 * Math.min(1, tf / .5) : tf < 0 ? .75 : .4 + .4 * h1) * dap; } return B; })();
lapW('forest floor ' + NFLR);
let SHR = a => 0;
/* rotation about the horizontal axis (uz, 0, -ux) by phi (a tree's top goes out along +u) into a transform's M */
function rotU(ux, uz, phi, X_) { const c = Math.cos(phi), s = Math.sin(phi), k = 1 - c, ax = uz, az = -ux; X_[0] = c + k * ax * ax; X_[1] = -s * az; X_[2] = k * ax * az; X_[3] = s * az; X_[4] = c; X_[5] = -s * ax; X_[6] = k * az * ax; X_[7] = s * ax; X_[8] = c + k * az * az; }
const crit = (t, tf) => 1 - (1 + t / tf) * Math.exp(-t / tf);
/* a tree's pose at tau (sim s since the front reached it): XS the stump's, XU the upper part's (p' = M (p - P) + Q) */
function heroPose(h, tau, XS, XU) {
  const ux = h.ux, uz = h.uz, bx = h.x, by = h.y, bz = h.z;
  if (tau <= 0) { for (const X_ of [XS, XU]) { X_[0] = X_[4] = X_[8] = 1; X_[1] = X_[2] = X_[3] = X_[5] = X_[6] = X_[7] = 0; X_[9] = X_[12] = bx; X_[10] = X_[13] = by; X_[11] = X_[14] = bz; } return; }
  const ts = h.ts, th0 = h.th0, tb = tau < ts ? th0 * Math.pow(tau / ts, .7) : th0;
  if (h.up) {
    // the root plate tears out: the whole tree goes over about the plate's downwind edge
    const ph = tau < ts ? tb : th0 + (PI / 2 - .14 - th0) * crit(tau - ts, h.tf * 1.5);
    rotU(ux, uz, ph, XS); XS[9] = XS[12] = bx + ux * h.rr; XS[10] = XS[13] = by; XS[11] = XS[14] = bz + uz * h.rr;
    const sl = tau > ts ? 1.5 * (1 - Math.exp(-(tau - ts) / .2)) : 0; XS[12] += ux * sl; XS[14] += uz * sl;
    XU.set(XS); return;
  }
  if (tau < ts) { rotU(ux, uz, tb, XS); XS[9] = XS[12] = bx; XS[10] = XS[13] = by; XS[11] = XS[14] = bz; XU.set(XS); return; }
  const t = tau - ts;
  rotU(ux, uz, th0 * Math.exp(-t / .02) * Math.cos(t * 60), XS); XS[9] = XS[12] = bx; XS[10] = XS[13] = by; XS[11] = XS[14] = bz;
  // the top: thrown down about the break, its butt dragged downwind and dropped to the ground
  const hb = h.hb, ph = th0 + (PI / 2 + .03 - th0) * crit(t, h.tf), Lt = h.Lm * (1 - Math.exp(-t / .12)), dr = (hb * Math.cos(th0) - .4) * E.ss(0, h.tf * 3.4, t);
  rotU(ux, uz, ph, XU); XU[9] = bx; XU[10] = by + hb; XU[11] = bz;
  XU[12] = bx + ux * (hb * Math.sin(th0) + Lt); XU[13] = by + hb * Math.cos(th0) - dr; XU[14] = bz + uz * (hb * Math.sin(th0) + Lt);
}
const HXS = new Float64Array(15), HXU = new Float64Array(15), HXT = new Float64Array(15), HXT2 = new Float64Array(15), HXG = new Float64Array(15);
/* a broken limb's flight: its pose when it broke, thrown downwind, rising and falling, tumbling about its own axis */
function groupPose(h, g, tau, ga, out) {
  const tb = h.GB[g], t = tau - tb;
  heroPose(h, tb, HXT, HXT2);
  const X_ = h.up || ga >= h.hb ? HXT2 : HXT;
  const V0 = h.GV[g * 3], vy = h.GV[g * 3 + 1], vs = h.GV[g * 3 + 2], k = 2.6, Lf = V0 * (t - (1 - Math.exp(-k * t)) / k);
  const ax = h.GA[g * 4], ay = h.GA[g * 4 + 1], az = h.GA[g * 4 + 2], an = h.GA[g * 4 + 3] * (1 - Math.exp(-t * 2.2)) / 2.2;
  const c = Math.cos(an), s = Math.sin(an), q = 1 - c, R0 = [c + ax * ax * q, ax * ay * q - az * s, ax * az * q + ay * s, ay * ax * q + az * s, c + ay * ay * q, ay * az * q - ax * s, az * ax * q - ay * s, az * ay * q + ax * s, c + az * az * q];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out[i * 3 + j] = R0[i * 3] * X_[j] + R0[i * 3 + 1] * X_[3 + j] + R0[i * 3 + 2] * X_[6 + j];
  // the attach point (rest) mapped by the pose at the break, then flown
  const px = h.x, py = h.y + ga, pz = h.z, dx = px - X_[9], dy = py - X_[10], dz = pz - X_[11];
  const qx = X_[0] * dx + X_[1] * dy + X_[2] * dz + X_[12], qy = X_[3] * dx + X_[4] * dy + X_[5] * dz + X_[13], qz = X_[6] * dx + X_[7] * dy + X_[8] * dz + X_[14];
  out[9] = px; out[10] = py; out[11] = pz;
  out[12] = qx + h.ux * Lf - h.uz * vs * t / (1 + t); out[13] = Math.max(h.y + .3, qy + vy * t - 4.905 * t * t); out[14] = qz + h.uz * Lf + h.ux * vs * t / (1 + t);
}
let HCNT = 0;
/* draw the stand (a: sim s since the strike, T film time for the flicker) */
function drawHero(a, T, vis) {
  if (vis < .01) return 0;
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, D = K.pb.d, U32 = u32();
  const ex = e[0], ey = e[1], ez = e[2], f0 = f[0], f1 = f[1], f2 = f[2], r0 = r[0], r1 = r[1], r2 = r[2], u0 = u[0], u1 = u[1], u2 = u[2];
  if (Math.hypot(ex - G2[0], ez - G2[2]) > 12000) return 0;
  const HZ = hazeK(), Rf = a > 0 ? SHR(a) : -1, frm = Math.floor(T * 14) & 1023, S0 = SUN[0], S1 = SUN[1], S2 = SUN[2];
  HCNT = 0;
  // one dot: world point, colour, brightness (max blend on green)
  const put = (x, y, z, cr, cg, cb, b) => {
    const dx = x - ex, dy = y - ey, dz = z - ez, zc = dx * f0 + dy * f1 + dz * f2; if (zc < near) return;
    const iz = F / zc, sx = cx + (dx * r0 + dy * r1 + dz * r2) * iz; if (sx < 0 || sx >= BW) return;
    const sy = cy - (dx * u0 + dy * u1 + dz * u2) * iz; if (sy < 0 || sy >= BH) return;
    const hq = zc * HZ; b /= 1 + hq * hq; if (b < .02) return; if (b > 1) b = 1;
    const p = (sy | 0) * BW + (sx | 0), G_ = cg * b; if (D[(p << 2) + 1] < G_) { U32[p] = 0xff000000 | ((cb * b) << 16) | (G_ << 8) | (cr * b); HCNT++; }
  };
  // pass 1: the trees in view and the share of each one's points its size on screen asks for, within a budget
  // (the big ones on screen keep their share; the budget thins the small ones first)
  let wantB = 0, wantS = 0;
  for (let ti = 0; ti < HERO.length; ti++) {
    const h = HERO[ti], tau = a - h.AH; h.fr_ = 0;
    if (!K.wIn(h.x, h.y + h.H * .5, h.z, h.H * .8 + (tau > 0 ? 30 + 160 * Math.min(1, tau * 3) : 0))) continue;
    const hpx = h.H * F / Math.max(1, K.WZ[0]); h.fr_ = Math.min(1, Math.max(.012, hpx * hpx / 330000)); h.big_ = hpx > 520;
    if (h.big_) wantB += h.fr_ * HTPL[h.kind].np; else wantS += h.fr_ * HTPL[h.kind].np;
  }
  const kS = wantB + wantS > HBUDGET ? Math.max(.25, (HBUDGET - wantB) / Math.max(1, wantS)) : 1, kB = wantB + wantS * kS > HBUDGET ? HBUDGET / (wantB + wantS * kS) : 1;
  const EX = k => k >= 16 ? 0 : EXN[(k * 64) | 0];
  for (let ti = 0; ti < HERO.length; ti++) {
    const h = HERO[ti], T_ = HTPL[h.kind], H = h.H, sw = h.sw, yc = h.yc, ys = h.ys, bx = h.x, by = h.y, bz = h.z, ux = h.ux, uz = h.uz;
    if (!h.fr_) continue;
    const kk_ = h.big_ ? kB : kS * kB, tau = a - h.AH, moving = tau > 0, fr = h.fr_ * kk_, bc = Math.min(1.5, 1 / Math.sqrt(kk_));   // bc: brighter dots where the budget thins them
    heroPose(h, tau, HXS, HXU);
    // the front's lime layer only where it can touch this tree (its distance from the strike, to first order)
    const band = Rf > 0 && Math.abs(h.d - Rf) < (moving ? 220 : H + 6), dR = h.d - Rf;
    const vf = h.vf;
    const fl = a > 0 ? 1.35 * Math.exp(-a * 2.4) : 0, smo = a > .05 ? E.ss(.05, .6, a) : 0, rim = a > 0 ? .9 * E.ss(.3, 1.4, a) * Math.exp(-a / 16) : 0;
    const bark = (T_.birch ? 1 : .8) * vis * bc, wood = .8 * vis * bc, leaf = (T_.con ? .92 : 1) * vis * bc;
    if (moving) h.GF.fill(0);
    // the trunk (stump below the break, the top above it; the whole tree when it is uprooted)
    const TR = T_.TRK, nT = Math.ceil(TR.length / HS * fr);
    for (let j = 0; j < nT; j++) {
      const o = j * HS, lx = TR[o], ly = TR[o + 1] * H, lz = TR[o + 2];
      let x = bx + (lx * yc + lz * ys) * sw, y = by + ly, z = bz + (-lx * ys + lz * yc) * sw;
      let b = bark * TR[o + 7], cr = 236, cg = 232, cb = 220;
      const nx = TR[o + 3] * yc + TR[o + 5] * ys, nz = -TR[o + 3] * ys + TR[o + 5] * yc, face = -(nx * ux + nz * uz);
      if (moving) {
        const X_ = h.up || ly >= h.hb ? HXU : HXS, dx = x - X_[9], dy = y - X_[10], dz = z - X_[11];
        x = X_[0] * dx + X_[1] * dy + X_[2] * dz + X_[12]; y = X_[3] * dx + X_[4] * dy + X_[5] * dz + X_[13]; z = X_[6] * dx + X_[7] * dy + X_[8] * dz + X_[14];
        // the splintered break: pale wood, ragged
        if (!h.up && tau > h.ts && Math.abs(ly - h.hb) < .7) { b = .75 * vis; y += (TR[o + 7] - .5) * .6 * (ly < h.hb ? 1 : -1); }
      }
      { const l = nx * S0 + nz * S2 + .25; b *= .3 + .95 * (l > 0 ? l : 0); }
      if (fl > .03 && face > 0) { const k = Math.min(1, fl * face); if (b < k) b = k; cr = 255; cg = 196 + 50 * k; cb = 138 + 90 * k; }
      else if (rim > .03 && face > .1) { const k = Math.min(1, rim * face * (.6 + .4 * TR[o + 7])); if (b < k) b = k; cr += (255 - cr) * k; cg += (176 - cg) * k; cb += (112 - cb) * k; }
      if (band) { const q = dR + (x - bx) * ux + (z - bz) * uz; if (q > -3 && q < 1.5) { const k = q < 0 ? 1 + q / 3 : 1 - q / 1.5; if (b < .95 * k) b = .95 * k; cr = 255; cg = 236 + (cg - 236) * (1 - k); cb = 204 + (cb - 204) * (1 - k); } }
      { const dx = x - ex, dy = y - ey, dz = z - ez, zc = dx * f0 + dy * f1 + dz * f2; if (zc < near) continue;
        const iz = F / zc, sx = cx + (dx * r0 + dy * r1 + dz * r2) * iz; if (sx < 0 || sx >= BW) continue;
        const sy = cy - (dx * u0 + dy * u1 + dz * u2) * iz; if (sy < 0 || sy >= BH) continue;
        const hz_ = zc * HZ; b /= 1 + hz_ * hz_; if (b < .02) continue; if (b > 1) b = 1;
        const p_ = (sy | 0) * BW + (sx | 0), G_ = cg * b; if (D[(p_ << 2) + 1] < G_) { U32[p_] = 0xff000000 | ((cb * b) << 16) | (G_ << 8) | (cr * b); HCNT++; } }
    }
    // limbs (moving with the trunk, or thrown on their own once they break)
    const WD = T_.WOOD, nW = Math.ceil(WD.length / HS * fr), GA_ = T_.G;
    for (let j = 0; j < nW; j++) {
      const o = j * HS, g = WD[o + 6], ga = GA_[g * 2] * H;
      let x = bx + (WD[o] * yc + WD[o + 2] * ys) * sw, y = by + WD[o + 1] * H, z = bz + (-WD[o] * ys + WD[o + 2] * yc) * sw;
      let b = wood * (.6 + .4 * WD[o + 7]), cr = 236, cg = 232, cb = 220;
      if (moving) {
        let X_;
        if (tau > h.GB[g]) { if (!h.GF[g]) { groupPose(h, g, tau, ga, HXG); h.XG.set(HXG, g * 15); h.GF[g] = 1; } const q = g * 15, XG = h.XG, dx = x - XG[q + 9], dy = y - XG[q + 10], dz = z - XG[q + 11]; x = XG[q] * dx + XG[q + 1] * dy + XG[q + 2] * dz + XG[q + 12]; y = XG[q + 3] * dx + XG[q + 4] * dy + XG[q + 5] * dz + XG[q + 13]; z = XG[q + 6] * dx + XG[q + 7] * dy + XG[q + 8] * dz + XG[q + 14]; b = .62 * vis; }
        else { X_ = h.up || ga >= h.hb ? HXU : HXS; const dx = x - X_[9], dy = y - X_[10], dz = z - X_[11]; x = X_[0] * dx + X_[1] * dy + X_[2] * dz + X_[12]; y = X_[3] * dx + X_[4] * dy + X_[5] * dz + X_[13]; z = X_[6] * dx + X_[7] * dy + X_[8] * dz + X_[14]; }
      }
      if (fl > .03) { const k = Math.min(1, fl * .7); if (b < k) b = k; cr = 255; cg = 196; cb = 138; }
      if (band) { const q = dR + (x - bx) * ux + (z - bz) * uz; if (q > -3 && q < 1.5) { const k = q < 0 ? 1 + q / 3 : 1 - q / 1.5; if (b < .95 * k) b = .95 * k; cr = 255; cg = 236; cb = 204; } }
      put(x, y, z, cr, cg, cb, b);
    }
    // foliage: scorched and smoking on the strike's side; stripped as the front passes, streaming out in the wind
    const LF = T_.LEAF, nL = Math.ceil(LF.length / HS * fr);
    for (let j = 0; j < nL; j++) {
      const o = j * HS, g = LF[o + 6], ga = GA_[g * 2] * H, hq = LF[o + 7];
      let x = bx + (LF[o] * yc + LF[o + 2] * ys) * sw, y = by + LF[o + 1] * H, z = bz + (-LF[o] * ys + LF[o + 2] * yc) * sw;
      const nx = LF[o + 3] * yc + LF[o + 5] * ys, ny = LF[o + 4], nz = -LF[o + 3] * ys + LF[o + 5] * yc, face = -(nx * ux + nz * uz);
      const lam = nx * S0 + ny * S1 + nz * S2;
      let b = leaf * (.16 + 1.05 * (lam > 0 ? lam * (2 - lam) : 0)) * (.7 + .3 * hq), cr = 236, cg = 236, cb = 226;
      const burn = a > .08 && face > .15 && hq < .3;
      if (a > .25 && face > 0) b *= 1 - .5 * face;      // charred
      if (fl > .03 && face > 0) { const k = Math.min(1, fl * face * 1.2); if (b < k) b = k; cr = 255; cg = 196 + 55 * k; cb = 138 + 100 * k; }
      else if (rim > .03 && face > .1) { const k = Math.min(1, rim * face * (.6 + .4 * hq)); if (b < k) b = k; cr += (255 - cr) * k; cg += (180 + 30 * hq - cg) * k; cb += (116 - cb) * k; }
      if (burn && fl < .5) { const fk = HF[(j * 7 + frm * 31 + ti * 5) & 4095], k = (.3 + .5 * fk) * Math.min(1, a * 3); if (b < k) b = k; cr = 255; cg = 142 + 54 * fk; cb = 84 + 50 * fk; }
      if (moving) {
        const tp = a - (h.AH + ((x - bx) * ux + (z - bz) * uz) / vf) - .003 - .03 * hq * hq;
        if (hq < .86 && tp > 0) {
          // stripped: streaming downwind, rising, spreading, fading
          const k = 6 + 10 * hq, s = (150 + 80 * HF[(j * 3 + ti) & 4095]) * (tp - (1 - EX(k * tp)) / k), sp = .3 + 9 * tp;
          const h2 = HF[(j * 5 + ti * 7) & 4095] - .5, h3 = HF[(j * 11 + ti * 3) & 4095] - .5;
          x += ux * s - uz * h2 * sp; z += uz * s + ux * h2 * sp; y += (2 + 9 * hq) * tp + h3 * sp * .7;
          b *= EX(tp / .9) * 1.15; if (b < .02) continue;
          if (!burn) { cr = 224; cg = 226; cb = 214; }
        } else if (tau > h.GB[g]) {
          if (!h.GF[g]) { groupPose(h, g, tau, ga, HXG); h.XG.set(HXG, g * 15); h.GF[g] = 1; }
          const q = g * 15, XG = h.XG, dx = x - XG[q + 9], dy = y - XG[q + 10], dz = z - XG[q + 11]; x = XG[q] * dx + XG[q + 1] * dy + XG[q + 2] * dz + XG[q + 12]; y = XG[q + 3] * dx + XG[q + 4] * dy + XG[q + 5] * dz + XG[q + 13]; z = XG[q + 6] * dx + XG[q + 7] * dy + XG[q + 8] * dz + XG[q + 14];
        } else { const X_ = h.up || ga >= h.hb ? HXU : HXS, dx = x - X_[9], dy = y - X_[10], dz = z - X_[11]; x = X_[0] * dx + X_[1] * dy + X_[2] * dz + X_[12]; y = X_[3] * dx + X_[4] * dy + X_[5] * dz + X_[13]; z = X_[6] * dx + X_[7] * dy + X_[8] * dz + X_[14]; }
        if (band) { const q = dR + (x - bx) * ux + (z - bz) * uz; if (q > -3 && q < 1.5) { const k = q < 0 ? 1 + q / 3 : 1 - q / 1.5; if (b < .95 * k) b = .95 * k; cr = 255; cg = 236; cb = 204; } }
      } else if (band) { const q = dR + (x - bx) * ux + (z - bz) * uz; if (q > -3 && q < 1.5) { const k = q < 0 ? 1 + q / 3 : 1 - q / 1.5; if (b < .95 * k) b = .95 * k; cr = 255; cg = 236; cb = 204; } }
      { const dx = x - ex, dy = y - ey, dz = z - ez, zc = dx * f0 + dy * f1 + dz * f2; if (zc < near) continue;
        const iz = F / zc, sx = cx + (dx * r0 + dy * r1 + dz * r2) * iz; if (sx < 0 || sx >= BW) continue;
        const sy = cy - (dx * u0 + dy * u1 + dz * u2) * iz; if (sy < 0 || sy >= BH) continue;
        const hz_ = zc * HZ; b /= 1 + hz_ * hz_; if (b < .02) continue; if (b > 1) b = 1;
        const p_ = (sy | 0) * BW + (sx | 0), G_ = cg * b; if (D[(p_ << 2) + 1] < G_) { U32[p_] = 0xff000000 | ((cb * b) << 16) | (G_ << 8) | (cr * b); HCNT++; } }
    }
    // the root plate of an uprooted tree: earth and roots standing up
    if (h.up && tau > 0) {
      const n = Math.ceil(700 * Math.min(1, fr * 3)), R_ = h.rr, X_ = HXS;
      for (let j = 0; j < n; j++) {
        const t1 = HF[(j * 3 + ti) & 4095] * TAU, q = Math.sqrt(HF[(j * 7 + 1 + ti) & 4095]) * R_, dep = -HF[(j * 13 + 2 + ti) & 4095] * (.9 + .5 * (1 - q / R_));
        const px = bx + Math.cos(t1) * q, py = by + dep, pz = bz + Math.sin(t1) * q, dx = px - X_[9], dy = py - X_[10], dz = pz - X_[11];
        const x = X_[0] * dx + X_[1] * dy + X_[2] * dz + X_[12], y = X_[3] * dx + X_[4] * dy + X_[5] * dz + X_[13], z = X_[6] * dx + X_[7] * dy + X_[8] * dz + X_[14];
        put(x, y, z, 200, 196, 180, (.3 + .3 * HF[(j * 5 + ti) & 4095]) * vis * Math.min(1, tau * 20));
      }
    }
    // smoke off the scorched crown, rising, then blown away by the front
    if (smo > 0 && fr > .05) {
      const n = Math.ceil(240 * Math.min(1, fr * 2)), crx = bx - ux * H * .12, crz = bz - uz * H * .12;
      for (let j = 0; j < n; j++) {
        const h1 = HF[(j * 3 + ti * 11) & 4095], h2 = HF[(j * 7 + ti * 13 + 5) & 4095], h3 = HF[(j * 17 + ti) & 4095], t0 = .05 + h3 * .3; if (a < t0) continue;
        const t = a - t0, sp = .4 + 1.6 * t;
        let x = crx + (h1 - .5) * H * .35 + (h2 - .5) * sp, y = by + H * (.45 + .45 * h2) + (1 + 2.5 * h1) * t + .5 * t * t, z = crz + (h2 - .5) * H * .35 + (h1 - .5) * sp;
        let al = smo * .34 * (.5 + .5 * h3);
        if (moving) { const tp = tau; if (tp > 0) { const s = 170 * (tp - (1 - Math.exp(-5 * tp)) / 5); x += ux * s; z += uz * s; y += 4 * tp; al *= Math.exp(-tp / .5); } }
        const lit = .45 + .55 * h1;
        put(x, y, z, 130 + 90 * lit, 132 + 90 * lit, 126 + 88 * lit, al);
      }
    }
  }
  // the forest floor (only while the lens is near it: its dots crowd round the camera's spot): dappled sun; the flash
  // with the trunks' shadows; the lime layer of the front; then the light litter lifted and streamed downwind
  const dG = Math.hypot(ex - G2[0], ey - G2[1], ez - G2[2]), fv = vis * (1 - E.ss(16, 110, dG));
  if (fv > .02) {
    const fl = a > 0 ? 1.5 * Math.exp(-a * 2.2) : 0, hot = a > 0 ? Math.exp(-a * 1.5) : 0, sc = shc(), fbl = a > 0 ? .62 * E.ss(.4, 2, a) * Math.exp(-a / 14) : 0;
    const onA = K.wIn(FLA[0], FLA[1], FLA[2], FLA[3]), onB = K.wIn(FLBc[0], FLBc[1], FLBc[2], FLBc[3]);
    const fst = K.HQ ? 1 : 2;      // (live: every other floor point of each half, the dots a little brighter)
    for (let i = onA ? 0 : 1; i < (onA || onB ? NFLR : 0); i += onA && onB ? 1 : 2) {
      if (fst > 1 && (i & 2)) continue;
      const o = i * FS, h1 = FLR[o + 4], h2 = FLR[o + 5], d = FLR[o + 3];
      let x = FLR[o], y = FLR[o + 1], z = FLR[o + 2], b = FLB[i] * fv * (fst > 1 ? 1.2 : 1), cr = 228, cg = 224, cb = 208;
      const t = a - FLR_AH[i];
      if (t > 0) {
        const ux = (x - HIT[0]) / d, uz = (z - HIT[2]) / d;
        if (h1 < .68) {     // lifted: streaming downwind, rising, spreading, thinning out
          const k = 4 + 9 * h1, s_ = (70 + 160 * h2) * (t - (1 - EX(k * t)) / k), sp = .4 + 6 * t;
          x += ux * s_ - uz * (h1 - .34) * sp; z += uz * s_ + ux * (h1 - .34) * sp; y += (.6 + 14 * h1 * h1) * (1 - EX(t * 6)) + (h2 - .5) * sp * .5 + 1.6 * t;
          b = (.42 + .3 * h2) * fv * (1 - EX(t * 40)) * EX(t / 1.6); cr = 206 + 40 * hot; cg = 204 + 20 * hot; cb = 190;
        } else { const s_ = (FLR[o + 6] > 0 ? 1.2 : .25) * (1 - EX(t * 18)); x += ux * s_; z += uz * s_; }
      }
      // the flash outshines the sun: the floor goes dark but where the strike lights it, the trunks' shadows across it
      if (fl > .03) { const e = fl > 1 ? 1 : fl, k = (.2 + 1.1 * fl) * (1 - .95 * FLR[o + 7]) * (.6 + .4 * h2); b *= 1 - .85 * e; if (b < k) { b = k > 1 ? 1 : k; const w = k > 1 ? 1 : k; cr = 255; cg = 210 + 40 * w; cb = 150 + 90 * w; } }
      if (fbl > .03 && fl < .3) { const k = fbl * (1 - .9 * FLR[o + 7]) * (.55 + .45 * h2); if (b < k) { b = k; cr = 255; cg = 178 + 30 * h2; cb = 112 + 30 * h2; } }
      if (Rf > 0) { const q = d - Rf; if (q > -3 && q < 1.5) { const k = q < 0 ? 1 + q / 3 : 1 - q / 1.5; if (b < .9 * k) b = .9 * k; cr = sc[0]; cg = sc[1]; cb = sc[2]; } }
      put(x, y, z, cr, cg, cb, b);
    }
  }
  // the front's wall in the beat's view: dust and torn needles in a band just behind the front, its leading face lime
  if (Rf > BW_R - 170 && Rf < BW_R + 70 && dG < 400 && K.wIn(HIT[0] + Math.cos(BW_TH) * Rf, BEAT.cam[1], HIT[2] + Math.sin(BW_TH) * Rf, 160)) {
    const sc = shc(), fa = vis * E.ss(BW_R - 170, BW_R - 120, Rf) * (1 - E.ss(BW_R + 30, BW_R + 70, Rf));
    for (let k = 0; k < 65; k++) FWG[k] = gP(Rf - 8, BW_TH + (k / 64 - .5) * .21);
    for (let i = 0; i < NFW; i++) {
      const o = i * 4, h3 = FWP[o + 3], u = FWP[o + 1], v = FWP[o + 2], q = FWP[o] + .004 * fsin(h3 * 40 + Rf * .05 + 1e4) / .2, th = BW_TH + q * .2;
      const rr = Rf - u * 26 - 1.5 * h3, ct = Math.cos(th), st = Math.sin(th);
      const y = FWG[Math.max(0, Math.min(64, ((q + .5) * 64 + .5) | 0))] + v * (6 + 26 * (1 - .6 * u)) * (.7 + .6 * h3) + 1.5 * u * u;
      if (u < .06) { const k = 1 - u / .06; put(HIT[0] + ct * rr, y, HIT[2] + st * rr, sc[0], sc[1], sc[2], fa * (.55 + .4 * k) * (.6 + .4 * h3)); }
      else { const lit = .45 + .55 * h3; put(HIT[0] + ct * rr, y, HIT[2] + st * rr, 214 * lit + 30, 210 * lit + 26, 196 * lit + 20, fa * (.62 - .45 * u) * (1 - .5 * v)); }
    }
  }
  return HCNT;
}
/* the stand against the flash: the near trunks and limbs (standing: before the front reaches the stand) written over
   the glow behind them, dark, with a hot rim on the side facing the strike, so the trees stand in silhouette against
   the flash and the plasma dome (called by the FX module after the strike is drawn; k 0..1) */
function blPx(D, q, m, k, cr, cg, cb) { q <<= 2; D[q] = D[q] * m + cr * k; D[q + 1] = D[q + 1] * m + cg * k; D[q + 2] = D[q + 2] * m + cb * k; }
function heroSil(a, k) {
  if (k < .02) return 0;
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, D = K.pb.d;
  if (Math.hypot(e[0] - G2[0], e[1] - G2[1], e[2] - G2[2]) > 160) return 0;
  const ex = e[0], ey = e[1], ez = e[2]; let n = 0;
  for (const h of HERO) {
    if (a > h.AH) continue;
    if (!K.wIn(h.x, h.y + h.H * .5, h.z, h.H * .8)) continue;
    const T_ = HTPL[h.kind], H = h.H, sw = h.sw, yc = h.yc, ys = h.ys, bx = h.x, by = h.y, bz = h.z, ux = h.ux, uz = h.uz;
    // the trunks only (the limbs are lost in the glow), thinned with distance (2x2 dots up close)
    const zt = K.WZ[0], st = zt > 45 ? 3 : zt > 22 ? 2 : 1;
    for (let pass = 0; pass < 1; pass++) {
      const A = T_.TRK, nA = A.length / HS;
      for (let j = 0; j < nA; j += st) {
        const o = j * HS, lx = A[o], ly = A[o + 1], lz = A[o + 2];
        const x = bx + (lx * yc + lz * ys) * sw, y = by + ly * H, z = bz + (-lx * ys + lz * yc) * sw;
        const dx = x - ex, dy = y - ey, dz = z - ez, zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < near) continue;
        const iz = F / zc, sx = cx + (dx * r[0] + dy * r[1] + dz * r[2]) * iz; if (sx < 0 || sx >= BW - 1) continue;
        const sy = cy - (dx * u[0] + dy * u[1] + dz * u[2]) * iz; if (sy < 0 || sy >= BH - 1) continue;
        const nx = A[o + 3] * yc + A[o + 5] * ys, nz = -A[o + 3] * ys + A[o + 5] * yc, face = -(nx * ux + nz * uz);
        let cr = 13, cg = 13, cb = 12;
        if (face > .3) { const q = k * (face - .3) / .7; cr = 13 + 242 * q; cg = 13 + 196 * q; cb = 12 + 126 * q; }
        const p = (sy | 0) * BW + (sx | 0), m = 1 - k;
        blPx(D, p, m, k, cr, cg, cb); if (zc < 30 || st > 1) { blPx(D, p + 1, m, k, cr, cg, cb); blPx(D, p + BW, m, k, cr, cg, cb); blPx(D, p + BW + 1, m, k, cr, cg, cb); }
        n++;
      }
    }
  }
  return n;
}
const GH = (() => { const x = BEAT.cam[0] + 50 * Math.cos(BEAT.az), z = BEAT.cam[2] + 50 * Math.sin(BEAT.az); return [x, z, 58, 78 * 78, 78]; })();
const FWG = new Float32Array(65), NFW = 20000, FWP = (() => { const r = rng(9292), A = new Float32Array(NFW * 4); for (let i = 0; i < NFW; i++) { A[i * 4] = r() - .5; A[i * 4 + 1] = Math.pow(r(), 1.7); A[i * 4 + 2] = Math.pow(r(), 1.9); A[i * 4 + 3] = r(); } return A; })();
const BW_R = Math.hypot(BEAT.cam[0] - HIT[0], BEAT.cam[2] - HIT[2]), BW_TH = Math.atan2(BEAT.cam[2] + 30 * Math.sin(BEAT.az) - HIT[2], BEAT.cam[0] + 30 * Math.cos(BEAT.az) - HIT[0]);

return { RE, CE, coastZ, coastBig, ground, roadD, HIT, makePatch, drawPatch, makeSea, drawSea, drawGlobe, drawLimb, STARS, CLOUD, GLB, PO, PR, PM, PI_, PG_, SO, SR, SM, SN, SH, LG, drop, SPAN, drawSite, VEHS, drawVehicles, GC,
  gP, gPc, CRA, CSH, GOPT, craterDy, craterSl, craterG, RAY, RAYN, FOR, setShock, drawForest, G2, SUN, hazeK, HERO, HTPL, drawHero, heroSil, HERO_R, BEAT };
};
