/* The effects in the Orbital films' language (oa_strike, oe_ring, od_salvo, ob_long_exposure): when the render style
   is Orbital (R.style === 'orbital') the FX system draws every effect through these instead of its dots:
     smoke     billows: camera-facing scalloped outlines (lobes bulging out, cusps between, a fold or two inside),
               turning slowly as they age; a trail is the laid smoke's two wispy edges with billows riding along it
               (a billow kept only while its spacing is a fair share of its size: a trail, never a stack of rings)
     flashes   restrained bloom (one soft additive disc, R.fx.glow), a glint of short radial lines, the dynamic light
     fire      fireballs as great circles opening fast and thinning; flame tongues as flickering strokes leaning downwind
     motors    a bright flickering stroke from the nozzle; close up a spindle of flickering meridians
     debris    fragments and sparks as short streaks along their flight, splashes where they come down
     water     splashes as jets of spray thrown up and falling back with a ring running out on the water; wakes as
               the Kelvin arms, feathered crests, the churned band's edges and foam streaks (oc_underway drawWake)
   All white (#F6F5F2) through R.wire (MAX blend, flushed by the orbital system), the same analytic functions of age
   and seeded indices as the dots (the effects' own tables: nothing new is kept). Coral and lime are never used.
   The drawers read the effects' fields (t0, p, seed, their tables); the system's draw3d calls orbDraw(e, age) etc.
   between orbBegin(W, C) and orbEnd(). A hard cap on segments per frame (CAP) keeps a spike frame cheap. */
import { TAU, GT, GM, sat, ss, clamp, hsh, noise, perp, dragH, yDrag, G2 } from './core.js';
import { STAGE } from './smoke.js';
import { Trail } from './smoke.js';
import { ColdLaunch, VlsLaunch, HotLaunch, GunBlast, BalLaunch, SubLaunch, TorpLaunch } from './launch.js';
import { Burst, BoosterSep } from './burst.js';
import { Splash, Dirt, Blast, Fire, Sinking, TorpedoHit } from './impact.js';
import { TracerStream, Muzzle } from './guns.js';
import { SubWater } from './water.js';
import { Lightning, flashLead, flashLevel } from './weather.js';

const WC = [246 / 255, 245 / 255, 242 / 255];
const BL = [255, 250, 236];                   // the bloom's warm white
const CAP = 70000;
const BY_ID = Object.values(STAGE).sort((a, b) => a.id - b.id);
const fr = x => x - Math.floor(x);

let W = null, V = null, C = null, NS = 0, FADE = 1;
export const orbStats = { segs: 0 };
/* fade: the hairlines give way as the strategic layer comes up (the orbital system fades the wire models the same way) */
export function orbBegin(wire, ctx, fade) { W = wire; C = ctx; V = ctx.V; NS = 0; FADE = fade === undefined ? 1 : fade; }
export function orbEnd() { orbStats.segs = NS; }

/* ---------------- primitives ---------------- */
function seg(ax, ay, az, bx, by, bz, a) {
  a *= FADE;
  if (a <= .004 || NS >= CAP) return;
  NS++;
  W.seg(ax, ay, az, bx, by, bz, WC[0], WC[1], WC[2], a > 1 ? 1 : a);
}
/* restrained bloom: one soft additive disc (px at 1080p), warm white */
function bloom(x, y, z, rpx, a) { if (a > .004) C.halo(x, y, z, rpx, BL[0], BL[1], BL[2], a > 1 ? 1 : a); }
/* a camera-facing scalloped billow of radius r (m) */
function billow(x, y, z, r, al, seed, age, folds) {
  if (al <= .004 || r <= 0) return;
  const zc = V.depth(x, y, z); if (zc < V.near) return;
  const near = ss(r * .8, r * 2.6, zc); if (near <= 0) return;
  const Rp = r * V.fl / zc; if (Rp < .8) return;
  al *= near * (1 - ss(700, 1600, Rp));
  if (al <= .004 || !V.vis(x, y, z, r)) return;
  const R = V.r, U = V.u;
  const nl = 5 + Math.floor(fr(seed * 7.31) * 4), per = Rp < 6 ? 1 : clamp(Math.round(Rp / (nl * 2.4)), 2, 7), n = Math.max(Rp < 6 ? 7 : 12, nl * per);
  const dep = .2 * ss(5, 16, Rp), f0 = 1 - dep;
  const sg = fr(seed * 3.7) < .5 ? 1 : -1, ph = seed * TAU + sg * age * .09, hs = (seed * 131.7) | 0;
  let px = 0, py = 0, pz = 0;
  for (let i = 0; i <= n; i++) {
    const th = ph + i / n * TAU, li = i / n * nl, j = Math.floor(li) % nl;
    const f = (f0 + dep * Math.abs(Math.sin(Math.PI * li)) * (.65 + .7 * hsh(j, hs))) * r, c = Math.cos(th) * f, s = Math.sin(th) * f;
    const qx = x + R[0] * c + U[0] * s, qy = y + R[1] * c + U[1] * s, qz = z + R[2] * c + U[2] * s;
    if (i) seg(px, py, pz, qx, qy, qz, al);
    px = qx; py = qy; pz = qz;
  }
  if (!folds || Rp < 6) return;
  const fa = al * .55, m = clamp(Math.round(Rp / 9), 3, 9);
  for (let k = 0; k < folds; k++) {
    const a0 = ph * 1.3 + k * 2.55 + seed * 4.1, ox = Math.cos(a0) * r * .4, oy = Math.sin(a0) * r * .4, rr = r * (.34 + .08 * hsh(k, hs + 3));
    const cx = x + R[0] * ox + U[0] * oy, cy = y + R[1] * ox + U[1] * oy, cz = z + R[2] * ox + U[2] * oy;
    for (let i = 0; i <= m; i++) {
      const th = a0 - 1.15 + 2.3 * i / m, c = Math.cos(th) * rr, s = Math.sin(th) * rr;
      const qx = cx + R[0] * c + U[0] * s, qy = cy + R[1] * c + U[1] * s, qz = cz + R[2] * c + U[2] * s;
      if (i) seg(px, py, pz, qx, qy, qz, fa);
      px = qx; py = qy; pz = qz;
    }
  }
}
/* a camera-facing circle */
function disc(x, y, z, r, al, nMax) {
  if (al <= .004 || r <= 0) return;
  const zc = V.depth(x, y, z); if (zc < r * 1.1 || zc < V.near) return;
  const Rp = r * V.fl / zc; if (Rp < .7 || !V.vis(x, y, z, r)) return;
  const n = clamp(Math.round(Rp / 3.5), 10, Math.max(10, nMax || 40)), R = V.r, U = V.u;
  let px = x + R[0] * r, py = y + R[1] * r, pz = z + R[2] * r;
  for (let i = 1; i <= n; i++) {
    const th = i / n * TAU, c = Math.cos(th) * r, s = Math.sin(th) * r;
    const qx = x + R[0] * c + U[0] * s, qy = y + R[1] * c + U[1] * s, qz = z + R[2] * c + U[2] * s;
    seg(px, py, pz, qx, qy, qz, al); px = qx; py = qy; pz = qz;
  }
}
/* a ring in the plane of unit axes (ux, uy, uz), (vx, vy, vz): the half facing the lens at aF, the far half at aB;
   wob bends it into an irregular loop */
function ring(cx, cy, cz, ux, uy, uz, vx, vy, vz, r, aF, aB, nMax, wob, wph) {
  if (aF <= .004 || r <= 0) return;
  const zc = V.depth(cx, cy, cz); if (zc < V.near - r) return;
  if (!V.vis(cx, cy, cz, r)) return;
  const Rp = r * V.fl / Math.max(zc, V.near + r * .5); if (Rp < .6) return;
  const n = clamp(Math.round(Rp / 3), 8, nMax || 36), e = V.eye, ex = e[0] - cx, ey = e[1] - cy, ez = e[2] - cz;
  const du = ux * ex + uy * ey + uz * ez, dv = vx * ex + vy * ey + vz * ez;
  wob = wob || 0; wph = wph || 0;
  let w = 1 + wob * Math.sin(wph), px = cx + ux * r * w, py = cy + uy * r * w, pz = cz + uz * r * w;
  for (let i = 1; i <= n; i++) {
    const th = i / n * TAU, cs = Math.cos(th), sn = Math.sin(th);
    w = (1 + wob * Math.sin(3 * th + wph)) * r;
    const qx = cx + (ux * cs + vx * sn) * w, qy = cy + (uy * cs + vy * sn) * w, qz = cz + (uz * cs + vz * sn) * w;
    const tm = (i - .5) / n * TAU;
    seg(px, py, pz, qx, qy, qz, du * Math.cos(tm) + dv * Math.sin(tm) > 0 ? aF : aB);
    px = qx; py = qy; pz = qz;
  }
}
/* a horizontal ring (on the water, the ground) */
const ringH = (x, y, z, r, a, n, wob, wph) => ring(x, y, z, 1, 0, 0, 0, 0, 1, r, a, a * .7, n || 40, wob, wph);
/* a horizontal ellipse: Ra along the unit direction (ux, uz), Rc across it */
function ringE(cx, cy, cz, ux, uz, Ra, Rc, al, n, wob, wph) {
  if (al <= .004) return;
  const r = Math.max(Ra, Rc);
  if (!V.vis(cx, cy, cz, r)) return;
  const zc = Math.max(V.near + r * .3, V.depth(cx, cy, cz)), Rp = r * V.fl / zc; if (Rp < .8) return;
  n = clamp(Math.round(Rp / 3), 10, n || 48); wob = wob || 0; wph = wph || 0;
  let px = 0, pz = 0;
  for (let i = 0; i <= n; i++) {
    const th = i / n * TAU, w = 1 + wob * Math.sin(3 * th + wph), a = Math.cos(th) * Ra * w, b = Math.sin(th) * Rc * w;
    const qx = cx + ux * a + uz * b, qz = cz + uz * a - ux * b;
    if (i) seg(px, cy, pz, qx, cy, qz, al);
    px = qx; pz = qz;
  }
}
/* a glint: short radial camera-facing lines, at least minPx long */
function star(x, y, z, L, minPx, al, seed, n) {
  if (al <= .004) return;
  const zc = V.depth(x, y, z); if (zc < V.near) return;
  const m = zc / V.fl, Lm = Math.max(minPx * m, L), R = V.r, U = V.u;
  for (let k = 0; k < n; k++) {
    const th = (k + .5 * hsh(k, seed)) / n * TAU + seed, long = (k & 1) === 0, l = Lm * (long ? .7 + .3 * hsh(k + 5, seed) : .25 + .2 * hsh(k + 5, seed)), l0 = l * .1;
    const c = Math.cos(th), s = Math.sin(th);
    seg(x + (R[0] * c + U[0] * s) * l0, y + (R[1] * c + U[1] * s) * l0, z + (R[2] * c + U[2] * s) * l0, x + (R[0] * c + U[0] * s) * l, y + (R[1] * c + U[1] * s) * l, z + (R[2] * c + U[2] * s) * l, al * (long ? 1 : .6));
  }
}
/* the jets of a splash: k lines thrown up round (x, z) from y0, falling back (the films' splash()); sz: height (m) */
function jets(x, y0, z, a, dur, sz, al, seed, n) {
  if (a < 0 || al <= .004) return;
  for (let k = 0; k < n; k++) {
    const d = dur * (.75 + .45 * hsh(k, seed + 1)), u = a / d; if (u >= 1) continue;
    const hk = sz * (.55 + .7 * hsh(k, seed)) * Math.sin(Math.PI * u), lean = (hsh(k, seed + 2) - .5) * .6 * sz, ang = hsh(k, seed + 3) * TAU;
    seg(x + Math.cos(ang) * lean * .2, y0, z + Math.sin(ang) * lean * .2, x + Math.cos(ang) * lean, y0 + hk, z + Math.sin(ang) * lean, al * (1 - u * .6));
  }
}
const P6 = new Float64Array(6);

/* ---------------- smoke trails (smoke.js Trail: the same records and the same puff centres) ---------------- */
const TS = 12;
function trail(T, k) {
  const t = C.t, R = T.R, n = T.n, cap = T.cap;
  if (!n || t - T.last > T.maxLife) return;
  if (T.k - T.bk >= 16 || T.rad === 0) { T.bounds(); T.bk = T.k; }
  if (!V.vis(T.cx, T.cy, T.cz, T.rad)) return;
  k = k === undefined ? 1 : k;
  const wx = C.wind[0], wz = C.wind[2], e = V.eye, f = V.f, fl = V.fl, near = V.near;
  // the edges and the core line join the kept centres (newest first)
  let has = false, pSt = -1, px = 0, py = 0, pz = 0, pa = 0, pLx = 0, pLy = 0, pLz = 0, pRx = 0, pRy = 0, pRz = 0, qx0 = 0, qy0 = 0, qz0 = 0;
  for (let c = 0; c < n; c++) {
    const i = (T.head - 1 - c + cap) % cap, o = i * TS, age = t - R[o];
    if (age < 0) continue;
    const st = BY_ID[R[o + 7]];
    if (age > st.life) { has = false; continue; }
    const kk = R[o + 8] | 0;
    if (st.col !== 1) {
      // the ramjet's air / a turbojet's shimmer: a faint thread through the air it flew through
      const x = R[o + 1], y = R[o + 2], z = R[o + 3];
      const al = k * st.B * Math.exp(-age / st.tau) * (1 - age / st.life) * (st.col === 2 ? .55 : .7);
      if (has && pSt === st.id && al > .01) seg(px, py, pz, x, y, z, (al + pa) * .5);
      has = true; pSt = st.id; px = x; py = y; pz = z; pa = al;
      continue;
    }
    const x0 = R[o + 1], y0 = R[o + 2], z0 = R[o + 3];
    const zc0 = (x0 - e[0]) * f[0] + (y0 - e[1]) * f[1] + (z0 - e[2]) * f[2];
    const pl = R[o + 11], blast = st.id === 0 && pl < 50 ? 3.2 * (1 - pl / 50) : st.id === 8 && pl < 30 ? 1.8 * (1 - pl / 30) : 0;
    const spr = st.spr + blast, sa = Math.sqrt(age), rad = spr * (.25 + 1.1 * sa + .16 * age);
    // the edges' vertices: every puff while they are ~6 px apart, else one in 2^m
    const pm0 = zc0 > near ? fl / zc0 : fl / near, sp = R[o + 10] * pm0;
    const thin = sp > 6 ? 0 : sp * 2 > 6 ? 1 : sp * 4 > 6 ? 3 : sp * 8 > 6 ? 7 : sp * 16 > 6 ? 15 : sp * 32 > 6 ? 31 : 63;
    // billows: while a puff's stride (its largest power-of-two factor) is a fair share of its size, and a few px
    const low = kk ? (kk & -kk) : 4096, bk = ss(.5, 1, low * R[o + 10] / (1.3 * rad)) * ss(2, 5, low * sp);
    if ((kk & thin) && bk <= .01) continue;
    const env = k * st.B * Math.exp(-age / st.tau) * (age > st.life * .6 ? 1 - ss(st.life * .6, st.life, age) : 1);
    if (env < .01) { has = false; continue; }
    const m1 = dragH(st.kd, age), wsh = 1 + Math.max(0, y0) / 300, cA = 2 * sa * (st.spr > .5 ? 1 : .3);
    const ph = kk * .61803 + T.seed * .001, ta = age * .21, g0y = R[o + 9];
    const bx = x0 + R[o + 4] * m1 + wx * wsh * age + cA * Math.sin(ta + ph * 6.1);
    const by = Math.max(g0y + .4, y0 + R[o + 5] * m1 + st.rise * age + cA * .5 * Math.sin(ta * 1.3 + ph * 4.7));
    const bz = z0 + R[o + 6] * m1 + wz * wsh * age + cA * Math.cos(ta * .9 + ph * 5.3);
    const zc = (bx - e[0]) * f[0] + (by - e[1]) * f[1] + (bz - e[2]) * f[2];
    const nf = zc > near ? ss(rad * .5, rad * 2.2, zc) : 0;
    if (bk > .01 && nf > 0) billow(bx, by, bz, rad * 1.15, env * .38 * bk, kk * .618 + (T.seed & 1023) * .013, age, st.id === 0 && (kk & 7) === 0 ? 1 : 0);
    if (kk & thin) continue;
    // the side of the column on screen: across the trail and the line of sight
    let Lx = 0, Ly = 0, Lz = 0, ok = false;
    if (has && pSt === st.id) {
      const dx = bx - px, dy = by - py, dz = bz - pz, vx = bx - e[0], vy = by - e[1], vz = bz - e[2];
      Lx = dy * vz - dz * vy; Ly = dz * vx - dx * vz; Lz = dx * vy - dy * vx;
      const l = Math.hypot(Lx, Ly, Lz);
      if (l > 1e-6) { Lx /= l; Ly /= l; Lz /= l; ok = true; }
      // keep the same side as the last vertex (the centres wander: a flip would cross the edges over)
      if (ok && Lx * qx0 + Ly * qy0 + Lz * qz0 < 0) { Lx = -Lx; Ly = -Ly; Lz = -Lz; }
    }
    const aE = env * .34 * nf, u = kk * .09 + (T.seed & 255), v = age * .22;
    const wl = rad * (1 + .32 * noise(u, v, 2.1)), wr = rad * (1 + .32 * noise(u, v, 6.7));
    const qLx = bx + Lx * wl, qLy = by + Ly * wl, qLz = bz + Lz * wl, qRx = bx - Lx * wr, qRy = by - Ly * wr, qRz = bz - Lz * wr;
    if (ok) {
      const al = (aE + pa) * .5;
      if (rad * V.fl / Math.max(zc, near) < 1.2) seg(px, py, pz, bx, by, bz, al * 1.4);
      else {
        const bL = sat(.55 + 1.3 * noise(u * .8, v, 9.2)), bR = sat(.55 + 1.3 * noise(u * .8, v, 13.4));
        seg(pLx, pLy, pLz, qLx, qLy, qLz, al * bL); seg(pRx, pRy, pRz, qRx, qRy, qRz, al * bR);
      }
      // the hot core, bright near the motor
      if (age < st.hot) seg(px, py, pz, bx, by, bz, k * .6 * (1 - age / st.hot));
    }
    // (the first vertex: the edges start from the centre, so the column tapers to the motor)
    if (ok) { qx0 = Lx; qy0 = Ly; qz0 = Lz; }
    has = true; pSt = st.id; px = bx; py = by; pz = bz; pa = aE;
    pLx = ok ? qLx : bx; pLy = ok ? qLy : by; pLz = ok ? qLz : bz; pRx = ok ? qRx : bx; pRy = ok ? qRy : by; pRz = ok ? qRz : bz;
  }
}

/* ---------------- motors (plume.js PLUME specs) ---------------- */
export function orbPlume(x, y, z, ax, ay, az, P, ign, seed, fr60) {
  if (ign <= .01) return;
  const off = P.off, nx = x - ax * off, ny = y - ay * off, nz = z - az * off;
  const zc = V.depth(nx, ny, nz); if (zc < V.near) return;
  const pxm = V.fl / zc, L = P.L;
  if (!V.vis(nx, ny, nz, L + 4)) return;
  if (P.cold) { if (pxm * L > 6) seg(nx, ny, nz, nx - ax * L * 1.6, Math.max(0, ny - ay * L * 1.6), nz - az * L * 1.6, .16 * ign); return; }
  const burn = P.burn * ign, fk = .5 + .5 * noise(C.tr * 34 + seed * .37, 1.7, 0);
  const Lf = L * (.72 + .28 * fk);
  if (L * pxm < 2.5) {
    // far: a white point in a small bloom, the stroke a few px long
    const l = Math.max(Lf, 4 / pxm);
    seg(nx, ny, nz, nx - ax * l, Math.max(0, ny - ay * l), nz - az * l, .95);
    bloom(nx, ny, nz, 5, .22 * (.4 + burn));
    if (P.li && pxm > .05) C.light(nx, ny, nz, 240, 245, 230, P.li * ign * .5, P.lr);
    return;
  }
  const tipY = ny - ay * Lf * .8;
  seg(nx, ny, nz, nx - ax * Lf * .8, Math.max(0, tipY), nz - az * Lf * .8, .95 * ign);
  if (L * pxm > 12) {
    // the spindle: flickering meridians out of the nozzle
    const B = perp(ax, ay, az, P6), M = 7, R0 = P.r0 * 1.6;
    for (let k = 0; k < M; k++) {
      const ph = k / M * TAU + C.tr * 11 + seed, c = Math.cos(ph), s = Math.sin(ph);
      let px = nx, py = ny, pz = nz;
      for (let q = 1; q <= 5; q++) {
        const t = q / 5, rr = R0 * (1 + 2.8 * t) * Math.pow(1 - t, .7) * (1 + .3 * noise(C.tr * 40 + k * 3, q * 1.3, seed)), Lq = Lf * t * (1 + .15 * noise(C.tr * 29 + k, 2.2, seed));
        const qx = nx - ax * Lq + (B[0] * c + B[3] * s) * rr, qy = ny - ay * Lq + (B[1] * c + B[4] * s) * rr, qz = nz - az * Lq + (B[2] * c + B[5] * s) * rr;
        if (qy < 0) break;
        seg(px, py, pz, qx, qy, qz, ign * .5 * (1 - .55 * t));
        px = qx; py = qy; pz = qz;
      }
    }
    // shock diamonds: small rings across the jet at the knots
    if (P.dia && L * pxm > 40) for (let k = 0; k < P.cells; k++) {
      const s = (k + .5) / P.cells * Lf * .7;
      ring(nx - ax * s, ny - ay * s, nz - az * s, B[0], B[1], B[2], B[3], B[4], B[5], P.r0 * .8, ign * .5 * (1 - k / P.cells), ign * .3, 12);
    }
  }
  bloom(nx, ny, nz, Math.max(5, Math.min(60, pxm * 1.4)), (.18 + .22 * fk) * burn);
  if (P.li) C.light(nx, ny, nz, 240, 245, 230, P.li * ign, P.lr);
}
/* a small fast round far off: a white point in a small bloom */
export function orbHead(x, y, z, burn, k) {
  const zc = V.depth(x, y, z); if (zc < V.near || !V.vis(x, y, z, 4)) return;
  const m = 2.2 * zc / V.fl, R = V.r, U = V.u;
  seg(x - R[0] * m, y - R[1] * m, z - R[2] * m, x + R[0] * m, y + R[1] * m, z + R[2] * m, k);
  seg(x - U[0] * m, y - U[1] * m, z - U[2] * m, x + U[0] * m, y + U[1] * m, z + U[2] * m, k);
  bloom(x, y, z, Math.min(18, 3 + 2400 * (.35 + burn) / zc), .3 * k * (.45 + burn));
}

/* ---------------- puff tables (launch.js drawPuffs: the same positions; billows, at most ~34 a table) ---------------- */
const PS = 13;
function puffs(T, n, ox, oy, oz, age, k, o) {
  const wx = C.wind[0], wz = C.wind[2], rise = o.rise || 0, ground = o.gy === undefined ? -1e9 : o.gy;
  const stride = Math.max(1, Math.round(n / (o.max || 34))), grow = 1 + .3 * Math.log2(stride);
  for (let i = (o.off || 0) % stride; i < n; i += stride) {
    const j = i * PS, b = age - T[j]; if (b < 0) continue;
    const life = T[j + 8]; if (b > life) continue;
    const kd = T[j + 7], h = dragH(kd, b), heat = T[j + 11] * Math.exp(-b / 1.2);
    const x = ox + T[j + 1] + T[j + 4] * h + wx * (b - h * .6), z = oz + T[j + 3] + T[j + 6] * h + wz * (b - h * .6);
    let y = oy + T[j + 2] + T[j + 5] * h + rise * b + 1.8 * heat * (1 - Math.exp(-b / 1.2));
    const rad = (T[j + 9] + T[j + 10] * Math.sqrt(b)) * grow;
    if (y < ground + rad * .5) y = ground + rad * .5;
    const al = k * T[j + 12] * Math.min(1, b * 6) * Math.pow(1 - b / life, .9) * (.55 + .45 * Math.min(1, heat * 2));
    billow(x, y, z, rad, al * (o.a || .36), i * .618 + (o.seed || 0) * .01, b, i % 3 === 0 ? 1 : 0);
  }
}
/* a flash: bloom, a glint, the light */
function flash(x, y, z, w, rpx, glint, seed) {
  bloom(x, y, z, rpx, .5 * w);
  if (glint > 0) star(x, y, z, 0, glint, Math.min(1, w * 1.2), seed, 10);
}

/* ---------------- launches ---------------- */
function coldLaunch(e, age) {
  if (age < 0 || age > e.dur) return;
  const P = e.p;
  if (!V.vis(P[0], P[1] + 20, P[2], 260)) return;
  puffs(e.TG, e.nG, P[0], P[1], P[2], age, 1, { rise: .35, max: 14, seed: 1 });
  puffs(e.TC, e.nC, P[0], P[1], P[2], age, 1, { rise: .8, gy: e.gy, max: 12, seed: 2 });
  puffs(e.TI, e.nI, P[0], P[1], P[2], age, 1, { rise: .25, gy: e.gy, max: 30, seed: 3 });
  if (age < .25) bloom(P[0], P[1], P[2], 20, .15 * (1 - age / .25));
  const ai = age - e.ign;
  if (ai > -.02 && ai < 1.4) {
    const w = ai < .04 ? sat((ai + .02) / .06) : Math.exp(-(ai - .04) * 3.2), I = e.pI, zc = Math.max(1, V.depth(I[0], I[1], I[2]));
    flash(I[0], I[1], I[2], w, Math.min(260, 30 + 5200 / zc), ai < .2 ? 24 : 0, e.seed & 1023);
    C.light(I[0], (I[1] + e.gy) / 2, I[2], 245, 245, 235, .55 * w, 90);
    if (ai > 0 && ai < .9) ringH(P[0], e.gy + .3, P[2], 3 + ai * 26, .6 * (1 - ai / .9), 40, .08, e.seed);
  }
  // the cap: a small ring tumbling away
  if (age < 14) {
    const p = e.cap.at(age, e.Q), sp = Math.min(age, e.cap.landed) * e.capSpin, A = e.capAx;
    const c = Math.cos(sp), s = Math.sin(sp), c2 = Math.cos(sp * .6), s2 = Math.sin(sp * .6);
    ring(p[0], p[1], p[2], c2, 0, -s2, s2 * s, c, c2 * s, .47, .8 * (1 - ss(10, 14, age)), .5, 14);
  }
}
function vlsLaunch(e, age) {
  if (age < 0 || age > e.dur) return;
  const P = e.p;
  if (!V.vis(P[0], P[1] + 20, P[2], 220)) return;
  if (age < 1.3) {
    const w = 1 - age / 1.3, zc = Math.max(1, V.depth(P[0], P[1], P[2]));
    flash(P[0], P[1] + 1.5, P[2], w * w, Math.min(220, 20 + 30000 / zc), age < .15 ? 18 : 0, e.seed & 1023);
    // flame out of the cell: short flickering strokes
    for (let q = 0; q < 6; q++) {
      const h = (4 + 8 * hsh(q, e.seed)) * (.6 + .4 * noise(C.tr * 22 + q, e.seed & 255, 0)) * w, lx = (hsh(q, e.seed + 5) - .5) * 1.4, lz = (hsh(q, e.seed + 6) - .5) * 1.4;
      seg(P[0] + lx * .3, P[1], P[2] + lz * .3, P[0] + lx + C.wind[0] * .08 * h, P[1] + h, P[2] + lz, .8 * w);
    }
    C.light(P[0], P[1] + 4, P[2], 255, 245, 235, .6 * w * w, 70);
    if (age < .12) C.lift(.03 * (1 - age / .12) * Math.min(1, 300 / V.dist(P[0], P[1], P[2])), 240, 240, 236);
  }
  puffs(e.T, e.n, P[0], P[1], P[2], age, 1, { rise: 1.4, max: 22, seed: 4 });
}
function hotLaunch(e, age) {
  if (age < 0 || age > e.dur) return;
  const P = e.p;
  if (!V.vis(P[0], P[1], P[2], 80)) return;
  if (age < .5 && !e.steam) {
    const w = 1 - age / .5, zc = Math.max(1, V.depth(P[0], P[1], P[2]));
    flash(P[0], P[1], P[2], w * w, Math.min(120, 10 + 4000 * e.s / zc), age < .12 ? 12 : 0, e.t0 * 7 | 0);
    C.light(P[0], P[1], P[2], 250, 245, 235, .4 * w * w * e.s, 40 * e.s);
  }
  puffs(e.T, e.n, P[0], P[1], P[2], age, e.steam ? .8 : 1, { rise: e.steam ? .8 : .6, gy: e.gy, max: 16, seed: 5 });
}
function gunBlast(e, age) {
  if (age < 0 || age > e.dur) return;
  const P = e.p, a = e.a, B = e.B;
  if (!V.vis(P[0], P[1], P[2], 120)) return;
  const zc = Math.max(1, V.depth(P[0], P[1], P[2]));
  if (age < 1.3) {
    bloom(P[0] + a[0] * 3, P[1] + a[1] * 3, P[2] + a[2] * 3, Math.min(150, 14 + 9000 / zc), 1.05 * Math.exp(-age / .05) + .25 * Math.exp(-age / .25));
    if (age < .3) C.light(P[0] + a[0] * 5, P[1] + a[1] * 5 + 2, P[2] + a[2] * 5, 255, 248, 235, 1.4 * (1 - age / .3) * (1 - age / .3), 80);
    if (age < .04) C.lift(.04 * (1 - age / .04) * Math.min(1, 400 / V.dist(P[0], P[1], P[2])), 245, 245, 240);
  }
  // the flash ball blown out along the bore, and its spikes
  if (age < .4) { const s = 3 + 9 * age; billow(P[0] + a[0] * s, P[1] + a[1] * s, P[2] + a[2] * s, 1.4 + 3.6 * (1 - Math.exp(-age / .06)), .95 * Math.exp(-age / .1), e.seed * .23, age * 4, 1); }
  if (age < .13) {
    const k = 1 - age / .13;
    for (let q = 0; q < 12; q++) {
      const ph = q / 12 * TAU + e.seed, sp = .1 + .3 * hsh(q, e.seed), L = (5 + 9 * hsh(q + 3, e.seed)) * (.5 + .5 * k), c = Math.cos(ph) * sp * L, s = Math.sin(ph) * sp * L;
      seg(P[0], P[1], P[2], P[0] + a[0] * L + B[0] * c + B[3] * s, P[1] + a[1] * L + B[1] * c + B[4] * s, P[2] + a[2] * L + B[2] * c + B[5] * s, .8 * k);
    }
  }
  // the blast ring round the bore, the pressure ring on the water
  if (age < .7) { const R = 1.5 + 18 * Math.sqrt(age / .7); ring(P[0] + a[0] * 3, P[1] + a[1] * 3, P[2] + a[2] * 3, B[0], B[1], B[2], B[3], B[4], B[5], R, .6 * (1 - age / .7), .35 * (1 - age / .7), 36); }
  if (e.sea && age < .6) ringH(P[0] + a[0] * 8, .35, P[2] + a[2] * 8, 4 + 60 * Math.sqrt(age / .6), .45 * (1 - age / .6), 48);
  puffs(e.T, e.n, P[0], P[1], P[2], age, 1, { rise: .5, max: 16, seed: 6 });
}
function balLaunch(e, age) {
  if (age < 0 || age > e.dur) return;
  const P = e.p;
  if (!V.vis(P[0], P[1] + 10, P[2], 220)) return;
  if (age < 1.2) {
    const w = age < .03 ? age / .03 : Math.exp(-(age - .03) * 3.4), zc = Math.max(1, V.depth(P[0], P[1], P[2]));
    flash(P[0], P[1], P[2], w, Math.min(200, 20 + 4000 / zc), age < .15 ? 16 : 0, e.seed & 1023);
    C.light(P[0], P[1] - 1, P[2], 245, 245, 235, .55 * w, 60);
    if (age < .08) C.lift(.02 * (1 - age / .08) * Math.min(1, 250 / V.dist(P[0], P[1], P[2])), 245, 245, 240);
    if (age < .8) { const G = e.gp; ringH(G[0], G[1] + .3, G[2], 2 + age * 16, .55 * (1 - age / .8), 36, .08, e.seed); }
  }
  puffs(e.T[0], e.N[0], P[0], P[1], P[2], age, 1, { rise: .5, gy: e.gy, max: 12, seed: 7 });
  puffs(e.T[1], e.N[1], P[0], P[1], P[2], age, 1, { rise: .6, gy: e.gy, max: 12, seed: 8 });
  puffs(e.T[2], e.N[2], P[0], P[1], P[2], age, .85, { rise: .3, gy: e.gy, max: 16, seed: 9 });
}
/* water flown from a table (the dome or the column of a breach): streaks along their flight */
const WS = 7;
function waterT(P, T, n, age, al0, maxN) {
  const stp = Math.max(1, Math.round(n / maxN));
  for (let i = 0; i < n; i += stp) {
    const o = i * WS, t = age - T[o + 5]; if (t <= .02) continue;
    const tl = T[o + 6]; if (t >= tl) continue;
    const hl = Math.hypot(T[o], T[o + 2]) || 1, c = T[o] / hl, d = T[o + 2] / hl, k = T[o + 3], t0 = Math.max(0, t - .12);
    const h1 = dragH(k, t), h0 = dragH(k, t0), y1 = Math.max(.2, yDrag(T[o + 1], k, t)), y0 = Math.max(.2, yDrag(T[o + 1], k, t0));
    seg(P[0] + c * T[o + 4] + T[o] * h0, y0, P[2] + d * T[o + 4] + T[o + 2] * h0, P[0] + c * T[o + 4] + T[o] * h1, y1, P[2] + d * T[o + 4] + T[o + 2] * h1, al0 * (.55 + .45 * hsh(i, 7)) * (1 - .5 * t / tl));
  }
}
function subLaunch(e, age) {
  if (age < 0 || age > e.dur) return;
  const P = e.p, s = e.s;
  if (!V.vis(P[0], 20, P[2], 260)) return;
  if (age < 4) waterT(P, e.D, e.nD, age, .7, 70);
  if (age < 7) waterT(P, e.W, e.nC, age, .75, 90);
  const ai = age - e.ign;
  if (ai > -.02 && ai < 1.4) {
    const w = ai < .04 ? sat((ai + .02) / .06) : Math.exp(-(ai - .04) * 3.2), y = e.hI, zc = Math.max(1, V.depth(P[0], y, P[2]));
    flash(P[0], y, P[2], w, Math.min(260, 30 + 5200 / zc), ai < .2 ? 22 : 0, e.seed & 1023);
    C.light(P[0], y * .5 + 1, P[2], 245, 245, 235, .6 * w, 110);
    if (ai > 0 && ai < .1) C.lift(.03 * (1 - ai / .1) * Math.min(1, 300 / V.dist(P[0], y, P[2])), 245, 245, 240);
    if (ai > 0 && ai < 1) ringH(P[0], .3, P[2], 3 + ai * 30 * s, .6 * (1 - ai), 48, .06, e.seed);
  }
  for (let k = 0; k < 3; k++) {
    const R0 = e.rings[k], a = age - R0[0]; if (a < 0 || a > 4.5) continue;
    ringH(P[0], .3, P[2], R0[1] + a * R0[2], .5 * (1 - a / 4.5) * Math.min(1, a * 4), 48, .05, k + e.seed);
  }
  if (age > .2) ringH(P[0] + C.wind[0] * age * .2, .25, P[2] + C.wind[2] * age * .2, 3 + 5 * s * sat(age / 3), .35 * (1 - age / e.dur), 32, .12, e.seed + 3);
  puffs(e.TC, e.nT, P[0], 0, P[2], age, 1, { rise: .8, gy: 0, max: 12, seed: 10 });
  puffs(e.TI, e.nI, P[0], 0, P[2], age, .85, { rise: .45, gy: 0, max: 30, seed: 11 });
}
function torpLaunch(e, age) {
  if (age < 0 || age > e.dur) return;
  const P = e.p;
  if (!V.vis(P[0], P[1] * .5, P[2], P[1] + 60)) return;
  const body = (x, y, z, ax, ay, az, al) => { const L = e.len / 2; seg(x - ax * L, y - ay * L, z - az * L, x + ax * L, y + ay * L, z + az * L, al); };
  if (e.mode === 'ship') {
    puffs(e.TA, e.nA, P[0], P[1], P[2], age, .8, { rise: .3, max: 8, seed: 12 });
    if (age < e.tL) {
      const v = e.v, t = age, vy = v[1] - 9.81 * t, l = Math.hypot(v[0], vy, v[2]);
      body(P[0] + v[0] * t, P[1] + v[1] * t - G2 * t * t, P[2] + v[2] * t, v[0] / l, vy / l, v[2] / l, .8);
    } else splash(e.sp, age - e.tL);
  } else if (e.mode === 'air') {
    if (age < e.tL) {
      const y = P[1] - e.fall * age, pt = -1.05 + .12 * Math.sin(C.tr * 2.1 + e.seed), h = e.hdg;
      const ax = Math.sin(h) * Math.cos(pt), ay = Math.sin(pt), az = Math.cos(h) * Math.cos(pt);
      body(P[0], y, P[2], ax, ay, az, .85);
      const tx = P[0] - ax * e.len / 2, ty = y - ay * e.len / 2, tz = P[2] - az * e.len / 2, cy = ty + 3.2;
      ringH(tx, cy, tz, .75 * (1 + .06 * Math.sin(C.tr * 9 + e.seed)), .75, 14);
      for (let k = 0; k < 4; k++) { const th = k / 4 * TAU; seg(tx, ty, tz, tx + Math.cos(th) * .75, cy, tz + Math.sin(th) * .75, .4); }
    } else { splash(e.sp, age - e.tL); const a = age - e.tL; if (a < 5) ringH(P[0] + 2, .22, P[2], .8, .5 * (1 - a / 5), 12); }
  } else {
    const a = age - e.tB; if (a < 0 || a > 7 || e.kB < .05) return;
    ringH(P[0], .25, P[2], 1.5 + 4.5 * sat(a / 2.5), .45 * e.kB * (1 - a / 7), 24, .15, e.seed);
  }
}

/* ---------------- bursts in the air ---------------- */
function burst(e, a) {
  if (a < 0 || a > e.dur) return;
  const p = e.p, sc = e.sc, sq = Math.sqrt(sc);
  if (!V.vis(p[0], p[1], p[2], 400 * sq + 60)) return;
  const zc0 = Math.max(V.near, V.depth(p[0], p[1], p[2]));
  // the flash: bloom, glint, light, a lift
  if (a < 3) bloom(p[0], p[1], p[2], clamp(200 * sc * V.fl / zc0, 12, 170), (1 * Math.exp(-a / .12) + .25 * Math.exp(-a / .9)) * (e.kind === 'destruct' ? .6 : 1));
  if (a < 3) bloom(p[0], p[1], p[2], clamp(1400 * sc * V.fl / zc0, 50, 280), .08 * Math.exp(-a / .5));
  if (a < .2) star(p[0], p[1], p[2], 30 * sq, 30, .9 * (1 - a / .2), e.seed & 1023, 12);
  if (a < 1.2) C.light(p[0], p[1], p[2], 245, 245, 235, (e.kind === 'destruct' ? .4 : .8) * Math.exp(-a * 5) * sq, 260 * sq);
  if (a < .1) C.lift(.04 * (1 - a / .1) * Math.min(1, 1500 * sc / zc0), 240, 240, 236);
  // the fireball: expanding discs and great circles, thinning as it cools
  const c = e.centre(C, a), R0 = e.fire * 13;
  if (a < 1.4) {
    const r = R0 * (1 - Math.exp(-a / .15)) + 2, al = Math.pow(1 - a / 1.4, 1.4);
    for (let k = 0; k < 3; k++) {
      let ux = hsh(k, e.seed) - .5, uy = hsh(k + 1, e.seed) - .2, uz = hsh(k + 2, e.seed) - .5; const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
      const B = perp(ux, uy, uz, P6), ka = Math.exp(-a / .3);
      ring(c[0], c[1], c[2], B[0], B[1], B[2], B[3], B[4], B[5], r * (.8 + .3 * hsh(k + 5, e.seed)), .8 * al * ka, .35 * al * ka, 40);
    }
    disc(c[0], c[1], c[2], r * .55, .9 * al, 40);
    disc(c[0], c[1], c[2], (22 + 230 * (1 - Math.exp(-a / .38))) * sq * .4, .5 * Math.pow(1 - a / 1.4, 1.6), 48);
  }
  if (a < 2.2 && e.kind !== 'destruct') ringH(p[0], p[1], p[2], (30 + 360 * (1 - Math.exp(-a / .5))) * sq * .5, .28 * Math.pow(1 - a / 2.2, 1.5), 56);
  // sparks: short streaks along their flight
  if (a < 1.2) {
    const S = e.SP;
    for (let i = 0; i < e.ns; i += 2) {
      const o = i * 5, life = S[o + 4]; if (a > life) continue;
      const kd = S[o + 3], t0 = Math.max(0, a - .08), h1 = dragH(kd, a), h0 = dragH(kd, t0), y1 = p[1] + S[o + 1] * h1 - G2 * a * a, y0 = p[1] + S[o + 1] * h0 - G2 * t0 * t0;
      if (y1 < e.gy) continue;
      seg(p[0] + S[o] * h0, y0, p[2] + S[o + 2] * h0, p[0] + S[o] * h1, y1, p[2] + S[o + 2] * h1, .85 * Math.pow(1 - a / life, 1.3));
    }
  }
  // fragments: streaks (the brands trailing their smoke), a splash where each meets the sea
  const F = e.F, AW = e.AW, nF = e.n, stp = nF > 90 ? 3 : 2;
  for (let i = 0; i < nF; i += stp) {
    const aw = AW[i], o = i * 6, vx = F[o], vy = F[o + 1], vz = F[o + 2], kd = F[o + 3], brand = F[o + 5];
    if (a < aw) {
      const t0 = Math.max(0, a - (brand ? .12 : .05)), h1 = dragH(kd, a), h0 = dragH(kd, t0);
      seg(p[0] + vx * h0, p[1] + vy * h0 - G2 * t0 * t0, p[2] + vz * h0, p[0] + vx * h1, p[1] + vy * h1 - G2 * a * a, p[2] + vz * h1, (brand ? .9 : .55) * (1 - .4 * a / aw));
      if (brand && a > .15) {
        let px = p[0] + vx * h1, py = p[1] + vy * h1 - G2 * a * a, pz = p[2] + vz * h1;
        for (let j = 1; j <= 6; j++) {
          const tq = Math.max(0, a - j * .18), hq = dragH(kd, tq), ag = a - tq;
          const qx = p[0] + vx * hq + C.wind[0] * ag, qy = p[1] + vy * hq - G2 * tq * tq + .8 * ag, qz = p[2] + vz * hq + C.wind[2] * ag;
          seg(px, py, pz, qx, qy, qz, .25 * (1 - j / 7));
          px = qx; py = qy; pz = qz;
        }
      }
    } else if (e.wet && a - aw < 1.5 && (i % (stp * 2)) === 0) {
      const h = dragH(kd, aw), x = p[0] + vx * h, z = p[2] + vz * h, heavy = kd < .9 ? 2 : 1;
      jets(x, e.gy, z, a - aw, 1.2, 3 * heavy * (e.big ? 1.5 : 1), .7, i + e.seed, 3);
      if (a - aw < .9) ringH(x, e.gy + .1, z, (1 + 7 * (a - aw)) * heavy, .35 * (1 - (a - aw) / .9), 16);
    }
  }
  // the sea heaves up under a low burst
  if (e.heave && e.wet && a < 3) jets(p[0], e.gy, p[2], a, 2.6, (e.big ? 20 : 26) * sc, .6, e.seed, 9);
  // the smoke: a dense core that swells, then hangs and drifts; billows round it
  if (a > .15) {
    const g = e.smoke * (.3 + .7 * (1 - Math.exp(-a * .9))) + 1.5 * a, fa = sat((a - .15) / .8) * (1 - ss(e.dur * .45, e.dur, a));
    for (let k = 0; k < 7; k++) {
      const ak = a - .05 * k, h1 = hsh(k, e.seed + 40), h2 = hsh(k, e.seed + 41), h3 = hsh(k, e.seed + 42);
      billow(c[0] + (h1 - .5) * g * 1.2, c[1] + (h2 - .5) * g * .6 + .3 * ak, c[2] + (h3 - .5) * g * 1.2, g * (.4 + .25 * hsh(k, e.seed + 43)), .32 * fa, e.seed * .01 + k * 1.618, ak, k & 1 ? 1 : 2);
    }
  }
}
function boosterSep(e, age) {
  if (age < 0 || age > e.dur) return;
  const F = e.fly;
  if (age < .5) {
    const p = e.p0, w = 1 - age / .5;
    bloom(p[0], p[1], p[2], 18, .35 * w * w);
    billow(p[0] - e.a[0] * age * 20, p[1] - e.a[1] * age * 20, p[2] - e.a[2] * age * 20, 1.5 + 5 * age, .35 * w, e.seed * .1, age, 1);
  }
  if (F.wet && age > F.landed + .1) return;
  const p = F.at(age, e.Q), pxm = V.pxm(p[0], p[1], p[2]);
  if (pxm <= 0 || !V.vis(p[0], p[1], p[2], 3)) return;
  const fade = F.wet ? 1 : 1 - ss(e.dur - 6, e.dur, age);
  const sp = Math.min(age, F.landed) * e.spin, ca = Math.cos(sp), sa = Math.sin(sp), a = e.a, X = e.X, Y = e.Y;
  const Yx = Y[0] * ca + a[0] * sa, Yy = Y[1] * ca + a[1] * sa, Yz = Y[2] * ca + a[2] * sa;
  const Ax = a[0] * ca - Y[0] * sa, Ay = a[1] * ca - Y[1] * sa, Az = a[2] * ca - Y[2] * sa;
  const key = e.kind === 'oniks' ? 'oniksBooster' : e.kind === 'mk72' ? 'mk72' : null;
  if (key && pxm * e.shape.L > 2.5 && C.model && C.model(key, p, [X[0], Yx, Ax, X[1], Yy, Ay, X[2], Yz, Az], fade)) return;
  const L = Math.max(e.shape.L / 2, 1.5 / pxm);
  seg(p[0] - Ax * L, p[1] - Ay * L, p[2] - Az * L, p[0] + Ax * L, p[1] + Ay * L, p[2] + Az * L, .8 * fade);
}

/* ---------------- impacts ---------------- */
function splash(e, age) {
  if (age < 0 || age > e.dur) return;
  const p = e.p, H = e.H, y0 = p[1];
  if (!V.vis(p[0], y0 + H / 2, p[2], H * 1.5 + 20)) return;
  const nJ = clamp(Math.round(4 + H / 5), 4, 12);
  jets(p[0], y0, p[2], age, e.T * 1.05, H, .75, e.seed, nJ);
  // the crown: a ring of spray thrown out, low
  if (age < e.T * .8) { const r = H * .25 + age * H * .3; ringH(p[0], y0 + Math.max(.3, H * .18 * Math.sin(Math.PI * age / (e.T * .8))), p[2], r, .4 * (1 - age / (e.T * .8)), 36, .1, e.seed); }
  if (age < 7) ringH(p[0], y0 + .3, p[2], H * .25 + 2 + age * (3 + H * .18), .55 * (1 - age / 7), 48, .04, e.seed + 1);
  // mist hanging where the column stood
  if (age > e.T * .4) {
    const b = age - e.T * .4, w = 1 - b / 7;
    if (w > 0) for (let k = 0; k < 3; k++) billow(p[0] + C.wind[0] * b + (hsh(k, e.seed) - .5) * H * .4, y0 + H * (.25 + .3 * hsh(k, e.seed + 2)), p[2] + C.wind[2] * b + (hsh(k, e.seed + 3) - .5) * H * .4, H * .2 + 1.2 * Math.sqrt(b) + .4 * b, .22 * w * w, e.seed * .01 + k, b, 0);
  }
  if (age > .3) ringH(p[0], y0 + .25, p[2], H * .35 + 3, .25 * (1 - age / e.dur), 28, .15, e.seed + 2);
}
function dirt(e, age) {
  if (age < 0 || age > e.dur) return;
  const p = e.p, H = e.H;
  if (!V.vis(p[0], p[1] + H / 2, p[2], H * 2 + 40)) return;
  // clods and dust: streaks along their flight (a subset)
  const D = e.D, AW = e.AW, stp = Math.max(1, Math.round(e.n / 60));
  for (let i = 0; i < e.n; i += stp) {
    const kd = D[i * 5 + 3], clod = D[i * 5 + 4], aw = AW[i];
    if (age >= aw) continue;
    const t1 = age, t0 = Math.max(0, age - .07), h1 = dragH(kd, t1), h0 = dragH(kd, t0);
    const y1 = D[i * 5 + 1] * h1 - G2 * t1 * t1, y0 = D[i * 5 + 1] * h0 - G2 * t0 * t0;
    seg(p[0] + D[i * 5] * h0, p[1] + Math.max(.1, y0), p[2] + D[i * 5 + 2] * h0, p[0] + D[i * 5] * h1, p[1] + Math.max(.1, y1), p[2] + D[i * 5 + 2] * h1, (clod ? .8 : .45) * (1 - age / aw));
  }
  // the dust cloud: billows rolling out, rising, drifting, thinning
  for (let k = 0; k < 14; k++) {
    const tb = .03 + .35 * hsh(k, e.seed), b = age - tb; if (b < 0) continue;
    const life = 9 + 11 * hsh(k, e.seed + 1); if (b > life) continue;
    const th = hsh(k, e.seed + 2) * TAU, u = hsh(k, e.seed + 3), sp = H * (.15 + .45 * u), hh = dragH(1.2, b);
    const up = H * (1.1 - .9 * u) * (1 - Math.exp(-b * 1.6)) + .5 * b;
    const x = p[0] + Math.cos(th) * sp * hh + C.wind[0] * b * .8, z = p[2] + Math.sin(th) * sp * hh + C.wind[2] * b * .8, y = p[1] + 1 + up;
    billow(x, y, z, H * (.1 + .12 * u) + 1.8 * Math.sqrt(b) + .15 * b, .3 * Math.min(1, b * 5) * Math.pow(1 - b / life, .8), e.seed * .01 + k * 1.618, b, k & 1);
  }
  if (age < 2.5) ringH(p[0], p[1] + .5, p[2], 2 + H * 1.4 * Math.sqrt(age / 2.5), .5 * (1 - age / 2.5), 48, .08, e.seed);
}
function blast(e, sa) {
  if (sa < 0 || sa > e.dur) return;
  const P = e.p, sc = e.sc, s2 = Math.sqrt(sc);
  if (!V.vis(P[0], P[1] + 20 * s2, P[2], 300 * s2)) return;
  const zc = V.depth(P[0], P[1], P[2]); if (zc < V.near) return;
  const I = sa < .05 ? sa / .05 : Math.exp(-(sa - .05) * 1.6);
  C.light(P[0], P[1] + 8 * s2, P[2], 245, 245, 235, 1.1 * I * s2, 420 * s2);
  if (sa < .15) C.lift(.06 * (1 - sa / .15) * Math.min(1, 2500 * s2 / zc), 240, 240, 236);
  // the one big flash, a slower afterglow off the fire
  bloom(P[0], P[1] + 4 * s2, P[2], Math.min(300, 14 + 26000 * s2 / zc) * (1 + 1.6 * Math.exp(-sa / .3)), (.75 * Math.exp(-sa / .3) + .15 * Math.exp(-sa / 1.2)) * ss(-.02, .01, sa));
  if (sa < .2) star(P[0], P[1] + 3 * s2, P[2], 20 * s2, 34, 1 - sa / .2, e.seed & 1023, 14);
  // the fireball shell: great circles opening fast, then thinning as it cools
  const R0 = 30 * s2, SL = 1.6, lift = 4.5 * s2 * sa;
  if (sa < SL) {
    const r = R0 * (1 - Math.exp(-sa / .22)) + 2, rpx = r * V.fl / zc, al = Math.pow(1 - sa / SL, 1.4) * (1 - ss(260, 620, rpx));
    const cy = P[1] + r * .3 + lift, ka = Math.exp(-sa / .5);
    for (let k = 0; k < 5; k++) {
      let ux = hsh(k, e.seed) - .5, uy = hsh(k + 1, e.seed) - .2, uz = hsh(k + 2, e.seed) - .5; const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
      const B = perp(ux, uy, uz, P6);
      ring(P[0], cy, P[2], B[0], B[1], B[2], B[3], B[4], B[5], r * (.8 + .3 * hsh(k + 5, e.seed)), .8 * al * ka, .35 * al * ka, 44);
    }
    disc(P[0], cy, P[2], r * .55, .9 * al, 44);
    disc(P[0], cy, P[2], r * 1.25, .35 * al, 48);
  }
  // the blast wave on the water / the ground: a ring racing out from under it
  const h = Math.max(0, P[1] - e.gy), rr = 340 * sa;
  if (sa < 1.2 && rr > h) ringH(P[0], e.gy + .6, P[2], Math.sqrt(rr * rr - h * h), .45 * (1 - sa / 1.2), 64);
  // the fireball's smoke, rising and drifting, spreading, thinning
  for (let k = 0; k < 8; k++) {
    const ak = sa - .08 - k * .05; if (ak <= 0) continue;
    const rise = 30 * s2 * (1 - Math.exp(-ak / 3)) + 1.5 * ak;
    const x = P[0] + (hsh(k, e.seed + 40) - .5) * R0 * 1.3 + C.wind[0] * ak, y = P[1] + (hsh(k, e.seed + 41) - .5) * R0 * .8 + rise + R0 * .3, z = P[2] + (hsh(k, e.seed + 42) - .5) * R0 * 1.3 + C.wind[2] * ak;
    billow(x, y, z, R0 * (.35 + .25 * hsh(k, e.seed + 43)) + 5 * Math.sqrt(ak) * s2, .34 * Math.pow(1 - ak / e.dur, 1.5) * ss(.05, .5, ak), e.seed * .013 + k * 1.37, ak, k & 1 ? 1 : 2);
  }
  // fragments (hot, trailing) and water off the waterline: streaks
  if (sa < 7) {
    const S = e.S, nS = e.nS;
    for (let j = 0; j < nS; j++) {
      const o = j * 6, life = S[o + 3]; if (sa > life) continue;
      const hot = S[o + 4] > 0;
      if (j % (hot ? 6 : 9)) continue;
      const k = S[o + 5], yb = hot ? P[1] + 3 * s2 : e.gy + 1, a0 = Math.max(0, sa - (hot ? .08 : .1));
      const m1 = (1 - Math.exp(-k * sa)) / k, m0 = (1 - Math.exp(-k * a0)) / k;
      const y1 = yb + (S[o + 1] + 9.81 / k) * m1 - 9.81 * sa / k, y0 = yb + (S[o + 1] + 9.81 / k) * m0 - 9.81 * a0 / k;
      if (y1 < e.gy) continue;
      const fade = Math.pow(1 - sa / life, 1.3);
      seg(P[0] + S[o] * m0, y0, P[2] + S[o + 2] * m0, P[0] + S[o] * m1, y1, P[2] + S[o + 2] * m1, (hot ? .25 + .6 * Math.exp(-sa / .8) : .55) * fade);
    }
  }
}
function fire(e, age) {
  const t = e.t0 + age, sz = e.size, R = e.R;
  const kNow = t < e.end ? e.k * sat(age / .5) : 0;
  const s = Math.sin(e.hdg), c = Math.cos(e.hdg), L = e.loc, P = e.pos;
  const fx = P[0] + s * L[0] + c * L[2], fz = P[2] + c * L[0] - s * L[2], fy = P[1] + L[1];
  if (kNow > .02 && V.vis(fx, fy, fz, 60 * sz + 10)) {
    const tr = C.tr, flick = .75 + .25 * noise(tr * 3.1, e.seed * .1, 0);
    C.light(fx, fy + e.spr[1] * .5, fz, 245, 240, 225, .3 * kNow * flick * Math.sqrt(sz), 26 * Math.sqrt(sz) + 14);
    const zc = V.depth(fx, fy, fz), pxm = zc > V.near ? V.fl / zc : 0;
    bloom(fx, fy + e.spr[1] * .3, fz, Math.max(6, Math.min(120, pxm * e.spr[0] * 1.2)), .14 * kNow * flick);
    if (pxm * e.spr[0] >= 2) {
      // tongues: flickering strokes rising from their seats and leaning downwind (real time: a time-lapse never strobes)
      const S0 = e.spr[0], S1 = e.spr[1], S2 = e.spr[2], sd = e.seed, n = Math.round(clamp(6 + pxm * S0 * .25, 6, 22));
      const wl = Math.hypot(C.wind[0], C.wind[2]) || 1, wx = C.wind[0] / wl, wz = C.wind[2] / wl;
      for (let j = 0; j < n; j++) {
        const lx = (hsh(j, sd + 1) - .5) * 2 * S0 * .9, lz = (hsh(j, sd + 2) - .5) * 2 * S2;
        const h = S1 * (.35 + .8 * (.5 + .5 * noise(tr * 5 + j * 3.1, j, sd))) * (.5 + .5 * kNow);
        const bx = fx + s * lx + c * lz, bz = fz + c * lx - s * lz, lean = h * .35;
        const mx = bx + wx * lean * .55, my = fy + h * .55, mz = bz + wz * lean * .55;
        const sw = .8 * noise(tr * 7, j, sd + 4);
        seg(bx, fy, bz, mx, my, mz, .6 * kNow);
        seg(mx, my, mz, bx + wx * lean + s * sw, fy + h, bz + wz * lean + c * sw, .35 * kNow);
      }
    }
  }
  // the smoke column: one billow per emitted parcel, kept while its spacing up the column is a fair share of its size
  const n = Math.min(e.nE, e.cap), life = e.life, W0 = C.wind[0], W2 = C.wind[2], ceil = e.ceil;
  let pLx = 0, pLy = 0, pLz = 0, pRx = 0, pRy = 0, pRz = 0, pAl = 0, has = false;
  for (let c2 = 0; c2 < n; c2++) {
    const idx = e.nE - 1 - c2, i = idx % e.cap, o = i * 5, a = t - R[o];
    if (a <= 0) continue; if (a > life) break;
    const kk = R[o + 4]; if (kk < .03) { has = false; continue; }
    const hm = ceil * (.45 + .55 * hsh(idx, e.seed)), tr0 = (32 + 34 * hsh(idx, e.seed + 1)) * Math.sqrt(sz + .2), ea = Math.exp(-a / tr0);
    const h = hm * (1 - ea) + 40 * Math.sqrt(sz) * (1 - Math.exp(-a / 2.5));
    const dr = .4 * a + hm / 420 * (a - tr0 * (1 - ea)), tb = 5 * Math.sqrt(a) * Math.sqrt(sz), sd = (idx * 7.3 + e.seed) % 97;
    const bx = R[o + 1] + W0 * dr + tb * noise(sd, a * .02, 1.3), by = R[o + 2] + 3 * sz + h + tb * .4 * noise(sd + 3, a * .03, 8.2), bz = R[o + 3] + W2 * dr + tb * noise(sd + 7, a * .02, 4.1);
    const rad = (4 + 6 * hsh(idx, e.seed + 2)) * sz + 3.5 * Math.sqrt(a) * Math.sqrt(sz) + .1 * h + 110 * sz * (1 - ea) * (1 - ea);
    const zc = V.depth(bx, by, bz); if (zc < V.near + rad * .3) { has = false; continue; }
    const rp = rad * V.fl / zc;
    const al = kk * Math.min(1, a * 1.5) * Math.pow(1 - a / life, .7) * ss(rad * .3, rad * 1.8, zc);
    // a parcel every .35-.5 s; keep one in 2^m so each billow has room of its own (a column, not a stack of rings)
    const step = idx ? (idx & -idx) : 4096, spacing = Math.max(1, e.dtE * (h / Math.max(1, a) + 1.5)) * step;
    const fk = ss(.35, .9, spacing / rad) * ss(2, 6, rp);
    if (fk > .01) billow(bx, by, bz, rad * .9, .34 * al * fk, idx * .618 + e.seed * .01, a, idx & 1 ? 1 : 2);
    // the stem's two edges (every few parcels)
    if ((idx & 3) === 0 && a < life * .6) {
      const vx = bx - V.eye[0], vz = bz - V.eye[2], l = Math.hypot(vx, vz) || 1, sx = -vz / l, sz2 = vx / l, w = rad * .6;
      const qLx = bx + sx * w, qLz = bz + sz2 * w, qRx = bx - sx * w, qRz = bz - sz2 * w, aE = .18 * al;
      if (has) { seg(pLx, pLy, pLz, qLx, by, qLz, (aE + pAl) * .5); seg(pRx, pRy, pRz, qRx, by, qRz, (aE + pAl) * .5); }
      pLx = qLx; pLy = by; pLz = qLz; pRx = qRx; pRy = by; pRz = qRz; pAl = aE; has = true;
    }
  }
}
function sinking(e, age) {
  if (age < 0 || age > e.dur) return;
  const P = e.p, L = e.L, B = e.B, s = Math.sin(e.hdg), c = Math.cos(e.hdg), sd = e.seed, dy = e.dying, gone = 1 - ss(e.dur - 40, e.dur, age);
  if (!V.vis(P[0], 0, P[2], L * 1.5 + 60)) return;
  // bubbles boiling up round the hull: small rings popping
  const nb = Math.round(clamp(8 + L * .12, 8, 36) * (.3 + dy));
  for (let i = 0; i < nb; i++) {
    const per = .8 + 1.2 * hsh(i, sd), ph = age / per + hsh(i, sd + 1), cyc = Math.floor(ph), f = ph - cyc;
    const u = hsh(i * 31 + cyc, sd + 2) - .5, v = hsh(i * 17 + cyc, sd + 3) - .5, al = u * L * 1.05, ac = v * B * 1.4;
    ringH(P[0] + s * al + c * ac, .3, P[2] + c * al - s * ac, .4 + 2.2 * f, .55 * Math.sin(f * Math.PI) * gone, 10);
  }
  // the slick: irregular loops spreading on the water, drifting downwind
  const Rs = L * (.3 + .9 * sat(age / 150)), dx = C.wind[0] * age * .3, dz = C.wind[2] * age * .3;
  for (let k = 0; k < 3; k++) {
    const r = Rs * (.45 + .3 * k), al = .22 * (1 - k * .25) * gone * sat(age / 5);
    ring(P[0] + dx, .2, P[2] + dz, s, 0, c, c, 0, -s, r, al, al * .7, 64, .12 + .05 * k, sd + k * 2.1);
  }
  // steam where the hot hull goes under
  if (e.steam && dy > .1 && dy < .95) {
    const k = Math.sin((dy - .1) / .85 * Math.PI);
    for (let i = 0; i < 8; i++) {
      const per = 3 + 3 * hsh(i, sd + 9), ph = age / per + hsh(i, sd + 10), cyc = Math.floor(ph), f = ph - cyc;
      const al = (hsh(i * 13 + cyc, sd + 11) - .5) * L * .9, ac = (hsh(i * 7 + cyc, sd + 12) > .5 ? 1 : -1) * B * .5;
      billow(P[0] + s * al + c * ac + C.wind[0] * f * per, 1 + 18 * f, P[2] + c * al - s * ac + C.wind[2] * f * per, 1.5 + 6 * f, .3 * k * (1 - f) * Math.min(1, f * 5), i * 1.3 + sd * .01, f * per, 0);
    }
  }
}
const CS = 9;
function torpedoHit(e, age) {
  if (age < 0 || age > e.dur) return;
  const P = e.p, H = e.H, L = e.L, B = e.B, sd = e.seed, s2 = e.s2;
  if (!V.vis(P[0], H * .5, P[2], H + L + 120)) return;
  const s = Math.sin(e.hdg), c = Math.cos(e.hdg), wx = C.wind[0], wz = C.wind[2];
  if (age < 1) { const w = Math.exp(-age * 5), kk = e.sub ? Math.exp(-e.depth / 60) : 1; C.light(P[0], 2, P[2], 235, 245, 235, .45 * w * kk * s2, 100 + H * .8); if (age < .25) bloom(P[0], 1, P[2], 30, .35 * (1 - age / .25) * kk); }
  if (age < .4) ringH(P[0], .3, P[2], 12 + 1000 * age, .45 * (1 - age / .4) * (e.sub ? Math.exp(-e.depth / 80) : 1), 96);
  // the column: curtains of water climbing slowly and coming down (streaks), its heads cauliflowering (billows)
  if (age < 32) {
    const T = e.T, n = e.n, stp = Math.max(1, Math.round(n / 240));
    for (let i = 0; i < n; i += stp) {
      const o9 = i * CS, t = age - T[o9 + 6]; if (t <= .05) continue;
      const tl = T[o9 + 7]; if (t >= tl) continue;
      const k = T[o9 + 5], kind = T[o9 + 8], t0 = Math.max(0, t - .35);
      const h1 = dragH(k, t), h0 = dragH(k, t0), y1 = yDrag(T[o9 + 4], k, t), y0 = yDrag(T[o9 + 4], k, t0), dr = kind === 2 ? t * .9 : t * .2;
      const la1 = T[o9] + T[o9 + 2] * h1, lc1 = T[o9 + 1] + T[o9 + 3] * h1, la0 = T[o9] + T[o9 + 2] * h0, lc0 = T[o9 + 1] + T[o9 + 3] * h0;
      const fall = 1 - .55 * ss(tl * .55, tl, t), al = (kind === 2 ? .3 : .6) * fall * (.6 + .4 * hsh(i, sd));
      const x1 = P[0] + s * la1 + c * lc1 + wx * dr, z1 = P[2] + c * la1 - s * lc1 + wz * dr;
      if (kind === 1 && t < tl * .75) { billow(x1, Math.max(.3, y1), z1, (1.2 + .5 * t) * s2 * (1 + .4 * hsh(i, sd + 1)) * 2.2, .4 * fall, i * .618, t, 0); continue; }
      seg(P[0] + s * la0 + c * lc0 + wx * dr, Math.max(.3, y0), P[2] + c * la0 - s * lc0 + wz * dr, x1, Math.max(.3, y1), z1, al);
    }
  }
  // the base surge rolling out low, the mist left hanging
  if (age > 2) for (let k = 0; k < 12; k++) {
    const tb = 2 + 3 * hsh(k, sd + 3), b = age - tb; if (b < 0) continue;
    const life = 14 + 12 * hsh(k, sd + 4); if (b > life) continue;
    const th = hsh(k, sd + 5) * TAU, ca = Math.cos(th), sa = Math.sin(th), r0a = e.sub ? e.span * .6 : e.span * .8, r0c = e.sub ? e.span * .6 : B * .6, go = (10 + 12 * hsh(k, sd + 6)) * s2 * dragH(.2, b) + 1.2 * b;
    const la = ca * (r0a + go * (e.sub ? 1 : .55)), lc = sa * (r0c + go * (e.sub ? 1 : 1.6));
    billow(P[0] + s * la + c * lc + wx * b * .8, (2 + 12 * hsh(k, sd + 7)) * s2 * (1 - Math.exp(-b / 1.5)) + .35 * b + 3, P[2] + c * la - s * lc + wz * b * .8, (5 + 5 * hsh(k, sd + 8)) * s2 + 2.4 * Math.sqrt(b) + .25 * b, .3 * Math.min(1, b * 2) * Math.pow(1 - b / life, .8), k * 1.618 + sd * .01, b, k & 1);
  }
  if (age > .3) {
    const g = sat(age / 5), w = 1 - ss(e.dur * .5, e.dur, age), Ra = e.sub ? e.span * (.6 + .8 * g) : e.span * (.7 + .6 * g), Rc = e.sub ? Ra : B * (.9 + 1.4 * g);
    ringE(P[0] + wx * age * .15, .25, P[2] + wz * age * .15, s, c, Ra, Rc, .35 * w, 56, .08, sd);
  }
}

/* ---------------- guns ---------------- */
function tracers(e, age) {
  if (age > e.life) return;
  const g = e.g, M = e.mz, D = e.D, B = e.B, TL = e.TL;
  const mid = [M[0] + D[0] * e.R * .5, M[1] + D[1] * e.R * .5, M[2] + D[2] * e.R * .5];
  if (!V.vis(mid[0], mid[1], mid[2], e.R * .7 + 60)) return;
  const rounds = g.rounds;
  for (let i = 0; i < e.n; i++) {
    const gun = i % rounds, j = Math.floor(i / rounds), tk = e.a0 + j / g.rate + gun * .004, a = age - tk;
    if (a < 0) break;
    const walk = .004 * Math.exp(-(tk - e.a0) / .4), wx = .0011 * noise(tk * 1.7, 3.3, e.seed), wy = .0011 * noise(tk * 1.9, 8.1, e.seed);
    const ex = GT[(i * 2 + e.seed) & GM] * g.disp + wx, ey = GT[(i * 2 + 1 + e.seed) & GM] * g.disp + wy - walk;
    const dx = D[0] + B[0] * ex + B[3] * ey, dy = D[1] + B[1] * ex + B[4] * ey, dz = D[2] + B[2] * ex + B[5] * ey;
    const off = rounds > 1 ? (gun ? 1 : -1) * g.sep : 0;
    const mx = M[0] + e.side[0] * off, my = M[1] + e.side[1] * off, mz = M[2] + e.side[2] * off;
    const endHit = e.hit && tk + e.tof <= .05 && hsh(i, 9) < .5 ? e.tof : 99;
    const ex2 = Math.exp(-g.kd * a), h = TL * (1 - ex2), y = my + dy * h - G2 * a * a;
    if (a < endHit && y > e.gy) {
      const al = (.8 + .2 * hsh(i, 5)) * (1 - ss(endHit - .05, endHit, a)) * (1 - ss(g.burn - .8, g.burn, a)) * ss(0, .012, a);
      if (al < .01) continue;
      const tr = i % 3 === 0, a0 = Math.max(0, a - (tr ? .026 : .013)), h0 = TL * (1 - Math.exp(-g.kd * a0));
      seg(mx + dx * h0, my + dy * h0 - G2 * a0 * a0, mz + dz * h0, mx + dx * h, y, mz + dz * h, al * (tr ? 1 : .6));
    } else if (y <= e.gy && endHit > 50 && (i & 3) === 0) {
      const aw = e.landAge(i, a, dy, my), w = a - aw; if (w < 0 || w > .9) continue;
      const hw = TL * (1 - Math.exp(-g.kd * aw));
      jets(mx + dx * hw, e.gy, mz + dz * hw, w, .9, 2.5, .6, i, 2);
    }
  }
}
function muzzle(e, age) {
  if (age < 0 || age > e.dur) return;
  const M = e.mz, D = e.D, g = e.g;
  if (!V.vis(M[0], M[1], M[2], 30)) return;
  const zc = V.depth(M[0], M[1], M[2]); if (zc < V.near) return;
  if (age <= e.fire) {
    const fi = Math.floor(C.tr * 75), f1 = hsh(fi, 3), f2 = hsh(fi + 1, 5), S = e.side, nm = g.rounds;
    for (let gi = 0; gi < nm; gi++) {
      const off = nm > 1 ? (gi ? 1 : -1) * g.sep : 0, mx = M[0] + S[0] * off, my = M[1] + S[1] * off, mz = M[2] + S[2] * off;
      for (let q = 0; q < 5; q++) {
        const ph = q / 5 * TAU + f2 * 3, sp = .12 + .22 * hsh(q, fi % 97), L = (1 + 1.8 * f1 * (.6 + .4 * hsh(q + 2, fi % 89))) * g.mz;
        const c = Math.cos(ph) * sp * L, s = Math.sin(ph) * sp * L;
        seg(mx, my, mz, mx + D[0] * L + S[0] * c + S[3] * s, my + D[1] * L + S[1] * c + S[4] * s, mz + D[2] * L + S[2] * c + S[5] * s, .85);
      }
      bloom(mx + D[0] * .7, my + D[1] * .7, mz + D[2] * .7, Math.min(40, 3 + 3000 / zc), .3 + .25 * f1);
    }
    C.light(M[0] + D[0] * 2, M[1] + D[1] * 2, M[2] + D[2] * 2, 255, 245, 230, .3 * (.6 + .4 * f1), 30);
  }
  // gun smoke: small wisps off the muzzle, left behind
  const n = Math.floor(Math.min(age, e.fire) * 7);
  for (let j = Math.max(0, Math.floor((age - 3.4) * 7)); j <= n; j++) {
    const a = age - j / 7; if (a < 0 || a > 3.4) continue;
    const h = hsh(j, e.seed + 61), kk = (3 + 4 * h) * (1 - Math.exp(-a / .2));
    billow(M[0] + D[0] * kk + C.wind[0] * a, M[1] + D[1] * kk + .6 * a, M[2] + D[2] * kk + C.wind[2] * a, (.3 + 1.1 * Math.sqrt(a)) * (.6 + .8 * h), .1 * Math.exp(-a / 1.8) * ss(0, .06, a), j * 1.37 + e.seed * .01, a, 0);
  }
}

/* ---------------- water ---------------- */
const RS = 7, TANK = Math.tan(19.47 * Math.PI / 180);
export function orbWake(w, a) {
  a = a === undefined ? 1 : a;
  const t = C.t, R = w.R, cap = w.cap, B = w.B, L = w.L, P = w.pos, fe = w.feather;
  if (!V.vis(P[0], 0, P[2], w.len + L)) return;
  const pxS = V.pxm(P[0], 0, P[2]);
  // rows about 6 px apart on screen at the stern
  const sp = w.speed / w.rate * Math.max(pxS, .0001), thin = sp > 6 ? 0 : sp > 3 ? 1 : sp > 1.5 ? 3 : sp > .75 ? 7 : sp > .37 ? 15 : 31;
  let has = false, pLx = 0, pLz = 0, pRx = 0, pRz = 0, pCLx = 0, pCLz = 0, pCRx = 0, pCRz = 0, pA = 0, cnt = 0;
  for (let c = 0; c < w.n; c++) {
    const idx = w.k - 1 - c, i = (w.head - 1 - c + cap * 4) % cap, o = i * RS, age = t - R[o];
    if (age < 0) continue;
    const v = Math.max(.5, R[o + 5]), d = age * v, u = d / w.len;
    if (u >= 1) break;
    if (idx & thin) continue;
    const kr = R[o + 6]; if (kr < .01) { has = false; continue; }
    const x0 = R[o + 1], z0 = R[o + 2], s = R[o + 3], cc = R[o + 4], px = cc, pz = -s;
    const sk = Math.min(1, v / 8), fa = a * kr * Math.pow(1 - u, 1.4) * (.35 + .65 * sk);
    const lat = B * .45 + d * TANK, wid = fe ? B * .3 + d * .015 : B * .42 + d * .028;
    const Lx = x0 + px * lat, Lz = z0 + pz * lat, Rx = x0 - px * lat, Rz = z0 - pz * lat;
    const CLx = x0 + px * wid, CLz = z0 + pz * wid, CRx = x0 - px * wid, CRz = z0 - pz * wid;
    if (has && fa > .01) {
      // the cusp lines (the Kelvin arms) and the churned band's edges
      seg(pLx, .15, pLz, Lx, .15, Lz, (fa + pA) * .5 * (fe ? .25 : .34));
      seg(pRx, .15, pRz, Rx, .15, Rz, (fa + pA) * .5 * (fe ? .25 : .34));
      if (!fe) { const wo = .9 * Math.sin(idx * 1.9); seg(pCLx, .2, pCLz, CLx + px * wo, .2, CLz + pz * wo, (fa + pA) * .5 * .3); seg(pCRx, .2, pCRz, CRx - px * wo, .2, CRz - pz * wo, (fa + pA) * .5 * .3); }
    }
    // feathered crests: short strokes inclined ~35 deg to the track, off the arms
    if (!fe && (cnt & 1) === 0 && fa > .02) {
      const len = 4 + d * .06, bx = -s * Math.cos(.61) * len, bz = -cc * Math.cos(.61) * len, ox = px * Math.sin(.61) * len, oz = pz * Math.sin(.61) * len;
      seg(Lx, .15, Lz, Lx + bx * .6 - ox, .15, Lz + bz * .6 - oz, fa * .2);
      seg(Rx, .15, Rz, Rx + bx * .6 + ox, .15, Rz + bz * .6 + oz, fa * .2);
    }
    // foam streaks in the churned band
    if (!fe && fa > .02) {
      const nS = u < .15 ? 3 : 1;
      for (let m = 0; m < nS; m++) {
        const hh = hsh(idx * 5 + m, w.seed), x = (hh * 2 - 1) * wid * .9, len = 3 + 5 * hsh(idx, m + 11);
        seg(x0 + px * x, .2, z0 + pz * x, x0 + px * x - s * len, .2, z0 + pz * x - cc * len, fa * .3 * (1 - .5 * Math.abs(hh * 2 - 1)));
      }
    }
    has = true; pLx = Lx; pLz = Lz; pRx = Rx; pRz = Rz; pCLx = CLx; pCLz = CLz; pCRx = CRx; pCRz = CRz; pA = fa; cnt++;
  }
  const kE = w.kE * a;
  if (kE < .01 || w.speed < .5) return;
  const s = Math.sin(w.hdg), c = Math.cos(w.hdg), px = c, pz = -s, h = L / 2, spd = Math.min(1, w.speed / 12);
  if (fe) {
    // the periscope's feather: a small bow wave and a plume of spray thrown up and back
    for (const sd of [-1, 1]) seg(P[0], .3, P[2], P[0] - s * 6 + px * sd * (B * .5 + 2.7), .3, P[2] - c * 6 + pz * sd * (B * .5 + 2.7), .5 * kE);
    jets(P[0] - s * 1.5, .3, P[2] - c * 1.5, fr(C.tr * 1.1 + w.seed), 1, 1 + 3 * spd, .5 * kE, w.seed, 4);
    return;
  }
  // the bow wave: the first sheet flares from the stem along the side; spray at the stem
  for (const sd of [-1, 1]) {
    const bx0 = P[0] + s * h * .97, bz0 = P[2] + c * h * .97;
    const b1x = P[0] + s * (h - L * .2) + px * sd * (B * .36 + 1.2 + 1.4 * spd), b1z = P[2] + c * (h - L * .2) + pz * sd * (B * .36 + 1.2 + 1.4 * spd);
    const b2x = P[0] + s * (h - L * .42) + px * sd * (B * .5 + 3.5 * spd), b2z = P[2] + c * (h - L * .42) + pz * sd * (B * .5 + 3.5 * spd);
    seg(bx0, .25, bz0, b1x, .2, b1z, kE * (.3 + .3 * spd)); seg(b1x, .2, b1z, b2x, .12, b2z, kE * (.15 + .2 * spd));
    if (spd > .5) for (let k = 0; k < 5; k++) {
      const f = fr(C.tr * .9 + k * .37), zz = h * .96 - 2 - k * 2.2;
      seg(P[0] + s * zz + px * sd * (.4 + k * .9), .3 + .6 * (1 - f), P[2] + c * zz + pz * sd * (.4 + k * .9), P[0] + s * (zz - 1.6) + px * sd * (1.2 + k * 1.1), .15, P[2] + c * (zz - 1.6) + pz * sd * (1.2 + k * 1.1), kE * .28 * (1 - f));
    }
  }
  // the stern boil
  for (let k = 0; k < 4; k++) {
    const f = fr(C.tr * .7 + k / 4), zz = -h - 1 - f * 10, hw = B * .3 * (1 - f);
    seg(P[0] + s * zz + px * hw, .2, P[2] + c * zz + pz * hw, P[0] + s * zz - px * hw, .2, P[2] + c * zz - pz * hw, kE * .22 * (1 - f));
  }
}
export function orbDownwash(dw, pos, gy, wet, k) {
  const h = pos[1] - gy, D = dw.D, kk = k * sat(1 - (h - D * .25) / (D * 2.2));
  if (kk < .02 || !V.vis(pos[0], gy, pos[2], D * 3)) return;
  const r0 = D * .45, R1 = D * (1.6 + .6 * kk);
  for (let i = 0; i < 3; i++) {
    const f = fr(C.t / 1.3 + i / 3), rr = r0 + (R1 - r0) * Math.sqrt(f);
    ringH(pos[0], gy + .25, pos[2], rr, .45 * kk * Math.sin(f * Math.PI), 36, .06, dw.seed + i);
  }
  ringH(pos[0], gy + .2, pos[2], D * .55, .25 * kk, 28, .04, dw.seed + 5);
}
export function orbBubbles(b, k) {
  const t = C.t, R = b.R, cap = b.cap, life = b.life;
  k = k === undefined ? 1 : k;
  let has = false, px = 0, pz = 0, pa = 0;
  for (let c = 0; c < b.n; c++) {
    const i = (b.head - 1 - c + cap) % cap, o = i * 4, age = t - R[o] - .8;
    if (age < 0) { has = false; continue; }
    if (age > life) break;
    const x = R[o + 1], z = R[o + 2];
    const w = k * .6 * Math.exp(-R[o + 3] / 26) * Math.pow(1 - age / life, 1.3) * sat(age / 1.2);
    if (has && (c & 1)) seg(px, .24, pz, x, .24, z, (w + pa) * .5);
    has = true; px = x; pz = z; pa = w;
  }
}
function subWater(sw) {
  const t = C.t; if (!sw.busy(t)) return;
  const P = sw.pos, L = sw.L, B = sw.B, S = sw.sail, sd = sw.seed, und = sw.under;
  if (!V.vis(P[0], 4, P[2], L * .7 + 20)) return;
  const s = Math.sin(sw.hdg), c = Math.cos(sw.hdg), X = (la, lc) => P[0] + s * la + c * lc, Z = (la, lc) => P[2] + c * la - s * lc;
  const sm = (S[0] + S[1]) / 2, sh = (S[1] - S[0]) / 2;
  // foam round the sail as it comes up / goes under; water sheeting off the casing; vents' spray; the sea closing over
  let a = t - sw.T.sail;
  if (a >= 0 && a < 7) ringE(X(sm, 0), .3, Z(sm, 0), s, c, sh + 1 + a * 1.4, S[2] + 1 + a * 1.4, .45 * (1 - a / 7), 32, .1, sd);
  a = t - sw.T.hull;
  if (a >= 0 && a < 18) {
    const k = (1 - a / 18) * sat(a * 2);
    for (const side of [-1, 1]) {
      let px = X(-L * .42, side * (B * .5 + .3 + a * .2)), pz = Z(-L * .42, side * (B * .5 + .3 + a * .2));
      for (let j = 1; j <= 8; j++) {
        const la = L * (-.42 + .8 * j / 8), lc = side * (B * .5 + .3 + (1.2 + a * .35) * (.5 + .5 * noise(j, a * .5, sd)));
        const qx = X(la, lc), qz = Z(la, lc);
        seg(px, .25, pz, qx, .25, qz, .5 * k); px = qx; pz = qz;
      }
    }
    if (a < 5) for (let h = 0; h < 8; h++) { const side = h & 1 ? 1 : -1, la = L * (-.36 + .7 * ((h >> 1) + .5) / 4); jets(X(la, side * (B * .5 + .2)), .3, Z(la, side * (B * .5 + .2)), fr(a * 1.3 + h * .37), 1, 3, .5 * sat(a * 3) * (1 - a / 5), sd + h, 2); }
  }
  a = t - sw.T.vent;
  if (a >= 0 && a < 8) {
    const env = sat(a * 4) * (1 - ss(2.2, 5, a)), yV = Math.max(.3, sw.deck - und);
    if (env > .01) for (let v = 0; v < 8; v++) { const side = v & 1 ? 1 : -1, la = L * (-.33 + .68 * ((v >> 1) + .5) / 4); jets(X(la, side * B * .26), yV, Z(la, side * B * .26), fr(a / .7 + v * .31) * .7, .7, 5, .6 * env, sd + v, 3); }
    if (a > .4) billow(X(0, 0) + C.wind[0] * (a - .4), yV + 3 + .3 * (a - .4), Z(0, 0) + C.wind[2] * (a - .4), L * .25 + (a - .4), .2 * (1 - (a - .4) / 7.6), sd * .01, a, 1);
  }
  a = t - sw.T.awash;
  if (a >= 0 && a < 12) { const cl = 1 - .85 * sat(a / 2.5); for (const side of [-1, 1]) seg(X(-L * .45, side * B * .5 * cl), .28, Z(-L * .45, side * B * .5 * cl), X(L * .45, side * B * .5 * cl), .28, Z(L * .45, side * B * .5 * cl), .5 * (1 - a / 12)); }
  a = t - sw.T.sailDown;
  if (a >= 0 && a < 9) { const sk = 1 - .6 * sat(a / 3); ringE(X(sm, 0), .3, Z(sm, 0), s, c, (sh + 1.5) * sk, (S[2] + 2) * sk, .45 * (1 - a / 9), 28, .15, sd + a * .5); }
}

/* ---------------- aircraft ---------------- */
const NZF = [[.62, -.12, -9.0], [-.62, -.12, -9.0]];
export function orbJet(pos, hdg, pitch, roll, ab, P_AB, seed) {
  if (ab <= .02 || !V.vis(pos[0], pos[1], pos[2], 30)) return;
  const ch = Math.cos(hdg), sh = Math.sin(hdg), cp = Math.cos(pitch || 0), sp = Math.sin(pitch || 0), cr = Math.cos(roll || 0), sr = Math.sin(roll || 0);
  const f0 = sh * cp, f1 = sp, f2 = ch * cp, r0x = ch, r0z = -sh, u0x = -sh * sp, u0y = cp, u0z = -ch * sp;
  const rx = r0x * cr - u0x * sr, ry = -u0y * sr, rz = r0z * cr - u0z * sr, ux = u0x * cr + r0x * sr, uy = u0y * cr, uz = u0z * cr + r0z * sr;
  const fr60 = Math.floor(C.tr * 60);
  for (let k = 0; k < 2; k++) {
    const n = NZF[k], x = pos[0] + rx * n[0] + ux * n[1] + f0 * n[2], y = pos[1] + ry * n[0] + uy * n[1] + f1 * n[2], z = pos[2] + rz * n[0] + uz * n[1] + f2 * n[2];
    orbPlume(x, y, z, f0, f1, f2, P_AB, ab, seed * 3 + k, fr60);
  }
}
const E2P = [[-3.72, .45, 4.34], [3.72, .45, 4.34]], E2R = 2.055;
export function orbProps(pos, hdg, pitch, roll, power, seed) {
  if (power < .02 || !V.vis(pos[0], pos[1], pos[2], 16)) return;
  const pxm = V.pxm(pos[0], pos[1], pos[2]); if (pxm * E2R < 2) return;
  const ch = Math.cos(hdg), sh = Math.sin(hdg), cp = Math.cos(pitch || 0), sp = Math.sin(pitch || 0), cr = Math.cos(roll || 0), sr = Math.sin(roll || 0);
  const fx = sh * cp, fy = sp, fz = ch * cp, r0x = ch, r0z = -sh, u0x = -sh * sp, u0y = cp, u0z = -ch * sp;
  const rx = r0x * cr - u0x * sr, ry = -u0y * sr, rz = r0z * cr - u0z * sr, ux = u0x * cr + r0x * sr, uy = u0y * cr, uz = u0z * cr + r0z * sr;
  for (let k = 0; k < 2; k++) {
    const n = E2P[k], cx = pos[0] + rx * n[0] + ux * n[1] + fx * n[2], cy = pos[1] + ry * n[0] + uy * n[1] + fy * n[2], cz = pos[2] + rz * n[0] + uz * n[1] + fz * n[2];
    // the tips' path: a faint ring in the disc's plane
    ring(cx, cy, cz, rx, ry, rz, ux, uy, uz, E2R, .28 * power, .18 * power, 32);
  }
}

/* ---------------- lightning (weather.js Lightning: the same channel) ---------------- */
function lightning(e, age) {
  if (age < 0 || age > e.dur) return;
  const G = e.G, T = e.T, cg = e.kind === 'cg', base = e.base;
  const lead = cg ? flashLead(e.seed) : 0, leading = cg && age < lead, I = flashLevel(e.seed, e.kind, age) * e.s;
  const mx = cg ? (G[0] + T[0]) / 2 : T[0], mz = cg ? (G[2] + T[2]) / 2 : T[2], my = cg ? Math.min(base * .7, (G[1] + base) / 2) : T[1];
  if (!leading && I > .01) {
    const d = Math.max(200, V.dist(mx, my, mz));
    if (cg) {
      C.light(mx, my, mz, 232, 236, 245, (e.big ? 1.5 : .8) * I, 7500);
      C.light(G[0], G[1] + 40, G[2], 240, 242, 248, (e.big ? 2 : 1) * I, 1700);
      if (e.big) C.lift(Math.min(.07, .07 * I * clamp(1500 / d, .03, 1)), 232, 236, 245);
    } else C.light(T[0], T[1] - 800, T[2], 232, 236, 245, .55 * I, 6500);
  }
  if (!V.vis(mx, (G[1] + T[1]) / 2, mz, (T[1] - G[1]) * .75 + 4500)) return;
  const lin = leading ? .5 : Math.max(I / e.s, (cg ? .14 : .06) * (1 - ss(.1, .55, age - lead)));
  if (lin < .004) return;
  const reach = leading ? sat(age / lead) : 1;
  for (const l of e.lines) {
    if (leading && l.cloud) continue;
    if (!cg && !l.cloud) continue;
    const wk = l.main ? 1 : l.cloud ? .6 : .8;
    const al = Math.min(1, lin * l.w * wk * e.s * (cg ? 1.1 : .6)) * (l.cloud ? .45 : 1);
    if (al < .004) continue;
    const p = l.p, vis = leading ? (l.main ? reach : sat((reach - l.at) * 5)) : 1;
    const nSeg = Math.max(0, Math.min(p.length - 1, Math.floor((p.length - 1) * vis)));
    for (let i = 0; i < nSeg; i++) { const A = p[i], B = p[i + 1]; seg(A[0], A[1], A[2], B[0], B[1], B[2], (A[1] > base + 80 ? .45 : 1) * al); }
    if (l.main && !leading && nSeg > 2) { const m = p[nSeg >> 1]; bloom(m[0], m[1], m[2], 30, .12 * al); }
  }
  if (!cg || leading) return;
  const tr = age - lead;
  if (tr < .5) bloom(G[0], G[1] + 6, G[2], Math.max(14, 90 * V.pxm(G[0], G[1], G[2])), .4 * I);
  if (tr < .9) {
    const S = e.SP;
    for (let i = 0; i < 56; i += 2) {
      const o = i * 4; if (tr > S[o + 3]) continue;
      const t0 = Math.max(0, tr - .05), y1 = G[1] + S[o + 1] * tr - 11 * tr * tr, y0 = G[1] + S[o + 1] * t0 - 11 * t0 * t0; if (y1 < G[1]) continue;
      seg(G[0] + S[o] * t0, y0, G[2] + S[o + 2] * t0, G[0] + S[o] * tr, y1, G[2] + S[o + 2] * tr, .8 * (1 - tr / S[o + 3]));
    }
  }
}
/* the rain round the lens as hairline streaks (weather.js drawRain: the same lattice of drops) */
const RL = [{ c: 4, z0: .8, z1: 8, k: 10, a: .2, ex: .03 }, { c: 8, z0: 8, z1: 24, k: 14, a: .18, ex: .036 }, { c: 16, z0: 24, z1: 64, k: 16, a: .14, ex: .042 }, { c: 32, z0: 64, z1: 150, k: 18, a: .1, ex: .046 }];
const modp = (v, m) => ((v % m) + m) % m;
export function orbRain(k, flash, base) {
  if (k < .01) return;
  const e = V.eye, cf = V.f, cr = V.r, cu = V.u, t = C.t;
  if (e[1] > (base || 1500)) return;
  const vx = C.wind[0] * .92, vy = -8.6, vz = C.wind[2] * .92, tW = V.tx, tH = V.ty;
  for (const ly of RL) {
    const c = ly.c, K = Math.round(ly.k * k * C.q); if (K < 1) continue;
    const ex = ly.ex + (.006 - ly.ex) * flash, sx = vx * ex * 1.6, sy = vy * ex * 1.6, sz = vz * ex * 1.6;
    let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
    for (let q = 0; q < 8; q++) {
      const zz = q & 1 ? ly.z1 : ly.z0, a = q & 2 ? 1 : -1, b = q & 4 ? 1 : -1;
      const px = e[0] + cf[0] * zz + cr[0] * a * tW * zz + cu[0] * b * tH * zz, py = e[1] + cf[1] * zz + cr[1] * a * tW * zz + cu[1] * b * tH * zz, pz = e[2] + cf[2] * zz + cr[2] * a * tW * zz + cu[2] * b * tH * zz;
      if (px < mnx) mnx = px; if (px > mxx) mxx = px; if (py < mny) mny = py; if (py > mxy) mxy = py; if (pz < mnz) mnz = pz; if (pz > mxz) mxz = pz;
    }
    const i0 = Math.floor(mnx / c), i1 = Math.floor(mxx / c), j0 = Math.floor(Math.max(mny, -2) / c), j1 = Math.floor(mxy / c), k0 = Math.floor(mnz / c), k1 = Math.floor(mxz / c);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1) > 6000) continue;
    const ox = modp(vx * t, c), oy = modp(vy * t, c), oz = modp(vz * t, c), span = ly.z1 - ly.z0;
    for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) for (let ck = k0; ck <= k1; ck++) {
      const hc = (Math.imul(ci, 73856093) ^ Math.imul(cj, 19349663) ^ Math.imul(ck, 83492791)) >>> 0;
      for (let m = 0; m < K; m++) {
        const q = hsh(hc, m), q2 = hsh(hc + 1, m), q3 = hsh(hc + 2, m);
        let px = q * c + ox, py = q2 * c + oy, pz = q3 * c + oz;
        if (px >= c) px -= c; if (py >= c) py -= c; if (pz >= c) pz -= c;
        px += ci * c; py += cj * c; pz += ck * c;
        if (py < C.ground(px, pz)) continue;
        const dx = px - e[0], dy = py - e[1], dz = pz - e[2], zc = dx * cf[0] + dy * cf[1] + dz * cf[2];
        if (zc < ly.z0 || zc > ly.z1) continue;
        const xc = dx * cr[0] + dy * cr[1] + dz * cr[2], yc = dx * cu[0] + dy * cu[1] + dz * cu[2];
        if (xc > zc * tW * 1.08 || -xc > zc * tW * 1.08 || yc > zc * tH * 1.1 || -yc > zc * tH * 1.1) continue;
        const u = (zc - ly.z0) / span;
        seg(px - sx, py - sy, pz - sz, px, py, pz, Math.min(1, 2.2 * ly.a * k * (1 - .45 * u) * ss(ly.z0 * .95, ly.z0 * 1.4 + .6, zc) * (.55 + .45 * q2) * (1 + 2.5 * flash)));
      }
    }
  }
}

/* ---------------- dispatch ---------------- */
const BY = new Map([
  [ColdLaunch, coldLaunch], [VlsLaunch, vlsLaunch], [HotLaunch, hotLaunch], [GunBlast, gunBlast], [BalLaunch, balLaunch],
  [SubLaunch, subLaunch], [TorpLaunch, torpLaunch], [Burst, burst], [BoosterSep, boosterSep], [Splash, splash], [Dirt, dirt],
  [Blast, blast], [Fire, fire], [Sinking, sinking], [TorpedoHit, torpedoHit], [TracerStream, tracers], [Muzzle, muzzle],
  [Lightning, lightning],
]);
/* one effect instance at its age (unknown kinds: nothing, never dots) */
export function orbDraw(e, age) { const f = BY.get(e.constructor); if (f) f(e, age); }
export function orbTrail(T, k) { if (T instanceof Trail) trail(T, k); }
export function orbSubWater(sw) { if (sw instanceof SubWater) subWater(sw); }
