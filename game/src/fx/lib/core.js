/* FX core: colours, seeded tables, easing, noise, the per-frame view (LOD by projected size) and the draw
   context every effect receives. Every particle is an analytic function of its age plus a seeded index: no
   Math.random, no per-particle state. World metres, X east, Y up, Z north. Colours 0..255, alpha 0..1. */

export const WH = [238, 238, 228], LIME = [198, 244, 50], CORAL = [255, 106, 61];
export const GREY = [212, 216, 206], HOT = [255, 253, 242], SMOKE = [200, 201, 196];
export const TAU = Math.PI * 2, G = 9.81, G2 = 4.905, DEG = Math.PI / 180;

export const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const mix = (a, b, t) => a + (b - a) * t;
export const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/* integer hash -> [0, 1) */
export function hsh(a, b) {
  let h = Math.imul((a | 0) ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85EBCA77);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
  return ((h >>> 0) + .5) / 4294967296;
}
/* seeded stream (mulberry32), for tables built once at spawn */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* gaussian offsets, tabled so hot loops index instead of calling log / cos */
export const GN = 8192, GM = GN - 1;
export const GT = new Float32Array(GN);
{ const r = rng(7331); for (let i = 0; i < GN; i += 2) { let u = r(); if (u < 1e-7) u = 1e-7; const v = r(), m = Math.sqrt(-2 * Math.log(u)); GT[i] = m * Math.cos(TAU * v); GT[i + 1] = m * Math.sin(TAU * v); } }
/* per-dot brightness jitter .6 .. 1.4 (golden-ratio sequence, tabled) */
export const GW = new Float32Array(GN);
for (let i = 0; i < GN; i++) GW[i] = .6 + .8 * ((i * .618034) % 1);
/* unit ball (x, y, z, radius) and unit sphere shell directions */
export const NB = 2048;
export const BALL = new Float32Array(NB * 4);
{ const r = rng(4401); for (let i = 0; i < NB; i++) { const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), q = Math.cbrt(r()); BALL[i * 4] = s * Math.cos(th) * q; BALL[i * 4 + 1] = u * q; BALL[i * 4 + 2] = s * Math.sin(th) * q; BALL[i * 4 + 3] = q; } }

/* decorrelated unit-disc offsets (a puff or a halo drawn as a cluster of dots in the camera plane) */
export const DISK = new Float32Array(512);
{ const r = rng(515); for (let i = 0; i < 256; i++) { const a = r() * TAU, q = Math.sqrt(r()); DISK[i * 2] = Math.cos(a) * q; DISK[i * 2 + 1] = Math.sin(a) * q; } }

/* smooth value noise, 3D (own permutation table, independent of the kit) */
const PERM = new Uint8Array(512);
{ const r = rng(90210), p = []; for (let i = 0; i < 256; i++) p.push(i); for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; }
const hv = (x, y, z) => PERM[PERM[PERM[x & 255] + (y & 255)] + (z & 255)] / 255;
export function noise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const a = hv(xi, yi, zi), b = hv(xi + 1, yi, zi), c = hv(xi, yi + 1, zi), d = hv(xi + 1, yi + 1, zi);
  const e = hv(xi, yi, zi + 1), f = hv(xi + 1, yi, zi + 1), g = hv(xi, yi + 1, zi + 1), h = hv(xi + 1, yi + 1, zi + 1);
  const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (h - g) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return (y1 + (y2 - y1) * w) * 2 - 1;
}

/* two unit vectors perpendicular to a unit axis (a, b) */
export function perp(ax, ay, az, out) {
  let ux, uy, uz;
  if (Math.abs(ay) < .9) { ux = az; uy = 0; uz = -ax; } else { ux = 0; uy = -az; uz = ay; }
  const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
  out[0] = ux; out[1] = uy; out[2] = uz;
  out[3] = ay * uz - az * uy; out[4] = az * ux - ax * uz; out[5] = ax * uy - ay * ux;
  return out;
}
/* unit direction from heading (0 = north, +Z) and pitch (+ up) */
export function dirOf(hdg, pitch, out) {
  const c = Math.cos(pitch || 0);
  out = out || [0, 0, 0];
  out[0] = Math.sin(hdg || 0) * c; out[1] = Math.sin(pitch || 0); out[2] = Math.cos(hdg || 0) * c;
  return out;
}
export function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

/* drag body (linear drag kd, gravity): position offset after age a from velocity v: v * (1 - e^-kd a) / kd */
export const dragH = (kd, a) => kd > 1e-6 ? (1 - Math.exp(-kd * a)) / kd : a;

/* ---------- the view: camera basis and pixels per metre for LOD ---------- */
/* cam: { eye, f, r?, u?, fl (px at 1080p), tanX?, tanY?, near? } */
export class View {
  constructor() { this.eye = [0, 0, 0]; this.f = [0, 0, 1]; this.r = [1, 0, 0]; this.u = [0, 1, 0]; this.fl = 1000; this.tx = 1.1; this.ty = .62; this.near = .3; }
  set(cam) {
    const e = cam.eye, f = cam.f;
    this.eye[0] = e[0]; this.eye[1] = e[1]; this.eye[2] = e[2];
    this.f[0] = f[0]; this.f[1] = f[1]; this.f[2] = f[2];
    if (cam.r && cam.u) { this.r[0] = cam.r[0]; this.r[1] = cam.r[1]; this.r[2] = cam.r[2]; this.u[0] = cam.u[0]; this.u[1] = cam.u[1]; this.u[2] = cam.u[2]; }
    else {
      // M3 convention (left-handed X east, Y up, Z north): r = up x f, u = f x r
      let rx = f[2], ry = 0, rz = -f[0]; const l = Math.hypot(rx, rz) || 1; rx /= l; rz /= l;
      this.r[0] = rx; this.r[1] = ry; this.r[2] = rz;
      this.u[0] = f[1] * rz - f[2] * ry; this.u[1] = f[2] * rx - f[0] * rz; this.u[2] = f[0] * ry - f[1] * rx;
    }
    this.fl = cam.fl || 1000;
    this.ty = cam.tanY || 540 / this.fl;
    this.tx = cam.tanX || this.ty * 16 / 9;
    this.near = cam.near || .3;
    this.cx = 1 / Math.sqrt(1 + this.tx * this.tx); this.cy = 1 / Math.sqrt(1 + this.ty * this.ty);
    this.h = Math.max(1, e[1]);
    return this;
  }
  depth(x, y, z) { const e = this.eye, f = this.f; return (x - e[0]) * f[0] + (y - e[1]) * f[1] + (z - e[2]) * f[2]; }
  dist(x, y, z) { const e = this.eye; return Math.hypot(x - e[0], y - e[1], z - e[2]); }
  /* pixels (1080p) per metre at a point; 0 behind the lens */
  pxm(x, y, z) { const d = this.depth(x, y, z); return d > this.near ? this.fl / d : 0; }
  /* is a sphere in the view frustum (generous; lets the renderer clip the rest) */
  vis(x, y, z, rad) {
    const e = this.eye, dx = x - e[0], dy = y - e[1], dz = z - e[2], f = this.f, r = this.r, u = this.u;
    const zc = dx * f[0] + dy * f[1] + dz * f[2];
    if (zc < -rad) return false;
    const xc = dx * r[0] + dy * r[1] + dz * r[2], yc = dx * u[0] + dy * u[1] + dz * u[2];
    const m = rad * 1.05;
    if ((xc - this.tx * zc) * this.cx > m || (-xc - this.tx * zc) * this.cx > m) return false;
    if ((yc - this.ty * zc) * this.cy > m || (-yc - this.ty * zc) * this.cy > m) return false;
    return true;
  }
}

/* ---------- a finite ballistic body (casings, caps, clods) tabled once at spawn ----------
   quadratic drag k (1/m), gravity, stops on the ground function; at(t) -> [x, y, z] */
export function ballistic(p0, v0, k, ground, dur, dt) {
  dt = dt || 1 / 60; const N = Math.max(2, Math.round(dur / dt));
  const P = new Float32Array((N + 1) * 3);
  let x = p0[0], y = p0[1], z = p0[2], vx = v0[0], vy = v0[1], vz = v0[2], landed = -1, gy = 0;
  for (let i = 0; i <= N; i++) {
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    if (landed >= 0) continue;
    const vl = Math.hypot(vx, vy, vz);
    vx -= k * vl * vx * dt; vy -= (G + k * vl * vy) * dt; vz -= k * vl * vz * dt;
    x += vx * dt; y += vy * dt; z += vz * dt;
    const g = ground ? ground(x, z) : 0;
    if (y < g) { y = g; gy = g; landed = i + 1; }
  }
  const T = landed < 0 ? 1e9 : landed * dt;
  return {
    P, N, dt, landed: T, gy, wet: landed >= 0 && gy <= .05,
    at(t, o) { const f0 = clamp(t / dt, 0, N - 1e-6), i = Math.floor(f0), f = f0 - i, j = i * 3; o[0] = P[j] + (P[j + 3] - P[j]) * f; o[1] = P[j + 1] + (P[j + 4] - P[j + 1]) * f; o[2] = P[j + 2] + (P[j + 5] - P[j + 2]) * f; return o; },
  };
}

/* height gained after t by a body under linear drag k (1/s) with gravity inside the drag (it falls at most at G / k):
   spray and water columns that hang and come down slowly */
export const yDrag = (vy, k, t) => k > 1e-6 ? ((vy + G / k) * (1 - Math.exp(-k * t)) - G * t) / k : vy * t - G2 * t * t;
/* when that body (from y0, vertical velocity vy) is back down to yG: bisection past its top */
export function dropTime(y0, vy, k, yG, tMax) {
  if (y0 + yDrag(vy, k, tMax) > yG) return tMax;
  let lo = k > 1e-6 ? Math.max(0, Math.log(1 + k * Math.max(0, vy) / G) / k) : Math.max(0, vy / G), hi = tMax;
  if (y0 + yDrag(vy, k, lo) <= yG) lo = 0;
  for (let it = 0; it < 30; it++) { const md = (lo + hi) / 2; if (y0 + yDrag(vy, k, md) > yG) lo = md; else hi = md; }
  return lo;
}
/* time a body under linear drag kd and gravity takes to fall from y0 (vertical velocity vy) to yG: bisection */
export function landTime(y0, vy, kd, yG, tMax) {
  const yAt = a => y0 + vy * dragH(kd, a) - G2 * a * a;
  if (yAt(tMax) > yG) return tMax;
  let lo = 0, hi = tMax;
  for (let it = 0; it < 32; it++) { const md = (lo + hi) / 2; if (yAt(md) > yG) lo = md; else hi = md; }
  return lo;
}

/* ---------- small shared draw helpers (all through C, the frame context) ---------- */
/* a cluster of dots in a gaussian ball of radius rad (m) round (x, y, z): the films' smoke puff.
   n dots, base index g0 into the gaussian table, colour, alpha, dot size (px). Dots under yMin are dropped. */
export function puff(C, x, y, z, rad, n, g0, r, g, b, al, size, yMin) {
  const dot = C.dot;
  for (let m = 0; m < n; m++) {
    const k = (g0 + m * 1733) & GM, oy = GT[(k + 1) & GM] * .8 * rad;
    if (y + oy < yMin) continue;
    const w = al * (.6 + .8 * ((k * .618034) % 1));
    dot(x + GT[k] * rad, y + oy, z + GT[(k + 2) & GM] * rad, size, r, g, b, w > 1 ? 1 : w);
  }
}
/* light scattered round a flash, as the films draw it: a disc of additive dots in the camera plane, thinning
   toward its edge ((1 - d)^2), radius Rpx (px at 1080p), n dots of size px */
export function dotHalo(C, x, y, z, Rpx, n, r, g, b, a, size) {
  const V = C.V, zc = V.depth(x, y, z); if (zc < V.near || a < .004) return;
  const Rm = Rpx * zc / V.fl, R = V.r, U = V.u, glow = C.glow;
  n = Math.max(8, Math.round(n * C.q)); size = size || 3;
  for (let k = 0; k < n; k++) {
    const m = ((k * 97) & 255) * 2, s = .15 + .85 * ((k * .7548777) % 1), ox = DISK[m] * s, oy = DISK[m + 1] * s, d = Math.sqrt(ox * ox + oy * oy), w = (1 - d) * (1 - d);
    glow(x + (R[0] * ox + U[0] * oy) * Rm, y + (R[1] * ox + U[1] * oy) * Rm, z + (R[2] * ox + U[2] * oy) * Rm, size, r, g, b, a * w);
  }
}
/* the flash's streak across the lens: a thin line of additive dots along the camera's right vector */
export function streak(C, x, y, z, Wpx, r, g, b, a) {
  const V = C.V, zc = V.depth(x, y, z); if (zc < V.near || a < .01) return;
  const m = zc / V.fl, R = V.r, U = V.u, n = Math.round(Math.min(900, Wpx / 1.5));
  for (let k = -n; k <= n; k++) {
    const u = k / n, w = 1 - Math.abs(u), al = .9 * a * w * w * w, px = u * Wpx * m;
    C.glow(x + R[0] * px, y + R[1] * px, z + R[2] * px, 1, r, g, b, al);
    if (w > .5) { C.glow(x + R[0] * px + U[0] * m, y + R[1] * px + U[1] * m, z + R[2] * px + U[2] * m, 1, r, g, b, al * .4); C.glow(x + R[0] * px - U[0] * m, y + R[1] * px - U[1] * m, z + R[2] * px - U[2] * m, 1, r, g, b, al * .4); }
  }
}
/* how many dots a puff of radius rad (m) needs at pxm px/m: the films' rule, capped */
export const puffN = (rad, pxm, cap, q) => { const rp = rad * pxm; return Math.max(1, Math.round(Math.min(cap, 2 + rp * rp * .03) * q)); };
/* 2 px dots only where the lens is close enough that they do not merge */
export const dsz = (pxm, k) => pxm * (k || 1) > 3.2 ? 2 : 1;
