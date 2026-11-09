//! The fast damage model's core in Rust (a transcription of ../core.js: same rules, same seeds, same output).
//! Built for WebAssembly (the game, `fast/wasm.js`) and usable natively later (a Rust app links the rlib).
//!
//! Input: plates `P` (PN f64 each: ax, val, u0, u1, v0, v1, h, sy, rho, ef, skin, _) and the charge `C`
//! (cx, cy, cz, W, Wgas, V, seed, S). Output: one f32 block, per plate a header of HDR floats then the arrays
//! D (3n), TA, TR, Q, FL, SO, V, FA, FLn, HX, DN (n each), in the order the plates were given.

pub const PN: usize = 12;
pub const HDR: usize = 16;
const AX: [[usize; 2]; 3] = [[2, 1], [0, 2], [0, 1]];
const P0: f64 = 101325.0;

pub struct K { pub kd: f64, pub lc: f64, pub gkd: f64, pub lt: f64, pub vcrit: f64, pub gone: f64, pub gas_reach: f64,
  pub shield: f64, pub hole: f64, pub petal: f64, pub noise: f64, pub blur: usize, pub nfrag: f64, pub pen0: f64, pub pen_l: f64, pub vis: f64, pub fold: f64, pub foldl: f64, pub kb: f64, pub buckl: f64, pub bucke: f64, pub pk: f64 }
pub const KDEF: K = K { kd: 0.8, lc: 2.4, gkd: 0.5, lt: 3.0, vcrit: 150.0, gone: 2.2, gas_reach: 2.0, shield: 0.03, hole: 0.5,
  petal: 0.22, noise: 0.16, blur: 2, nfrag: 160.0, pen0: 22.0, pen_l: 30.0, vis: 4.5, fold: 0.35, foldl: 1.3, kb: 3.0, buckl: 1.6, bucke: 4.0, pk: 2.0 };

fn sat(x: f64) -> f64 { if x < 0.0 { 0.0 } else if x > 1.0 { 1.0 } else { x } }
fn ease(x: f64) -> f64 { let x = sat(x); x * x * (3.0 - 2.0 * x) }
fn kinney_ps(z: f64) -> f64 { let a = z / 4.5; let b = z / 0.048; let c = z / 0.32; let d = z / 1.35;
  P0 * 808.0 * (1.0 + a * a) / ((1.0 + b * b) * (1.0 + c * c) * (1.0 + d * d)).sqrt() }
fn kinney_is(z: f64, w: f64) -> f64 { 0.067 * (1.0 + (z / 0.23).powi(4)).sqrt() / (z * z * (1.0 + (z / 1.55).powi(3)).cbrt()) * 100.0 * w.cbrt() }
fn reflect(ps: f64) -> f64 { 2.0 * ps * (7.0 * P0 + 4.0 * ps) / (7.0 * P0 + ps) }
fn qsp(w: f64, v: f64) -> f64 { 2.25e6 * (w / v).powf(0.72) }
fn fire_r(w: f64) -> f64 { 0.5 * 3.86 * w.max(0.01).powf(0.32) }

struct Arrival { t: Vec<f32> }
impl Arrival {
  fn new() -> Self { let mut t = vec![0f32; 2001]; let mut acc = 0.0f64;
    for k in 1..=2000 { let z = k as f64 * 0.02; let u = 340.0 * (1.0 + 6.0 * kinney_ps(z.max(0.053)) / (7.0 * P0)).sqrt(); acc += 0.02 / u; t[k] = acc as f32; }
    Arrival { t } }
  fn at(&self, r: f64, w: f64) -> f64 { let w13 = w.cbrt(); let z = r / w13; let k = (z / 0.02).min(1999.0); let i = k.floor() as usize;
    w13 * (self.t[i] as f64 + (self.t[i + 1] as f64 - self.t[i] as f64) * (k - i as f64)) }
}

fn hash(a: i32, b: i32, s: i32) -> f64 {
  let mut h = (a as u32).wrapping_mul(0x27d4eb2d) ^ (b as u32).wrapping_mul(0x165667b1) ^ (s as u32).wrapping_mul(0x9E3779B1);
  h ^= h >> 15; h = h.wrapping_mul(0x85EBCA77); h ^= h >> 13; h = h.wrapping_mul(0xC2B2AE35); h ^= h >> 16;
  h as f64 / 4294967296.0
}
fn vnoise(x: f64, y: f64, s: i32) -> f64 {
  let xi = x.floor(); let yi = y.floor(); let fx = x - xi; let fy = y - yi; let ux = fx * fx * (3.0 - 2.0 * fx); let uy = fy * fy * (3.0 - 2.0 * fy);
  let (xi, yi) = (xi as i32, yi as i32);
  let a = hash(xi, yi, s); let b = hash(xi + 1, yi, s); let c = hash(xi, yi + 1, s); let d = hash(xi + 1, yi + 1, s);
  (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy
}
struct Rng(u32);
impl Rng { fn next(&mut self) -> f64 { let mut s = self.0; s ^= s << 13; s ^= s >> 17; s ^= s << 5; self.0 = s; s as f64 / 4294967296.0 } }

pub struct Plate { pub p: usize, pub ax: usize, pub val: f64, pub ua: usize, pub va: usize, pub u0: f64, pub v0: f64, pub nu: usize, pub nv: usize,
  pub h: f64, pub s: f64, pub skin: bool, pub sgn: f64, pub cu: f64, pub cv: f64,
  pub d: Vec<f32>, pub ta: Vec<f32>, pub tr: Vec<f32>, pub q: Vec<f32>, pub fl: Vec<u8>, pub so: Vec<f32>, pub v: Vec<f32>,
  pub fa: Vec<f32>, pub fln: Vec<f32>, pub hx: Vec<f32>, pub dn: Vec<f32> }

impl Plate {
  fn torn_at(&self, q: &[f64; 3]) -> i32 {
    let i = js_round((q[self.ua] - self.u0) / self.s); let j = js_round((q[self.va] - self.v0) / self.s);
    if i < 0.0 || j < 0.0 || i > self.nu as f64 || j > self.nv as f64 { return -1; }
    if self.fl[j as usize * (self.nu + 1) + i as usize] & 3 != 0 { 1 } else { 0 }
  }
}
/// JavaScript's Math.round (halves up)
fn js_round(x: f64) -> f64 { (x + 0.5).floor() }

fn blur(a: &mut [f32], w: usize, h: usize, r: usize) {
  let mut t = vec![0f32; a.len()]; let r = r as i64; let (wi, hi) = (w as i64, h as i64);
  for j in 0..hi { let o = j * wi; let mut s = 0f64; let mut c = 0f64;
    for i in -r..wi + r { if i + r < wi { s += a[(o + i + r) as usize] as f64; c += 1.0; } if i - r - 1 >= 0 { s -= a[(o + i - r - 1) as usize] as f64; c -= 1.0; } if i >= 0 && i < wi { t[(o + i) as usize] = (s / c) as f32; } } }
  for i in 0..wi { let mut s = 0f64; let mut c = 0f64;
    for j in -r..hi + r { if j + r < hi { s += t[((j + r) * wi + i) as usize] as f64; c += 1.0; } if j - r - 1 >= 0 { s -= t[((j - r - 1) * wi + i) as usize] as f64; c -= 1.0; } if j >= 0 && j < hi { a[(j * wi + i) as usize] = (s / c) as f32; } } }
}

pub fn solve(pp: &[f64], c: &[f64], k: &K) -> Vec<Plate> {
  let n_p = pp.len() / PN; let s = c[7]; let w = c[3].max(0.01); let w13 = w.cbrt(); let seed = c[6] as i64 as i32;
  let cv3 = [c[0], c[1], c[2]];
  let wg = w + c[4]; let vol = if c[5] > 0.0 { c[5] } else { 200.0 };
  let pq = if c[4] > 0.0 || c[2] < 0.0 { qsp(wg, vol.max(20.0)) } else { 0.0 };
  let fr = fire_r(wg); let rc = (3.0 * w / (4.0 * std::f64::consts::PI * 1600.0)).cbrt();
  let arr = Arrival::new();
  let mut order: Vec<(f64, usize)> = (0..n_p).map(|p| { let o = p * PN; let ax = pp[o] as usize; let [ua, va] = AX[ax];
    let du = 0f64.max(pp[o + 2] - cv3[ua]).max(cv3[ua] - pp[o + 3]); let dv = 0f64.max(pp[o + 4] - cv3[va]).max(cv3[va] - pp[o + 5]); let dn = pp[o + 1] - cv3[ax];
    ((du * du + dv * dv + dn * dn).sqrt(), p) }).collect();
  order.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
  let mut plates: Vec<Option<Plate>> = (0..n_p).map(|_| None).collect();
  for &(_, p) in &order {
    let o = p * PN; let ax = pp[o] as usize; let val = pp[o + 1]; let [ua, va] = AX[ax]; let h = pp[o + 6].max(0.002);
    let sy = pp[o + 7]; let rho = pp[o + 8]; let ef = pp[o + 9];
    let u0 = js_round(pp[o + 2] / s) * s; let v0 = js_round(pp[o + 4] / s) * s;
    let nu = js_round((pp[o + 3] - u0) / s).max(1.0) as usize; let nv = js_round((pp[o + 5] - v0) / s).max(1.0) as usize; let w1 = nu + 1; let n = w1 * (nv + 1);
    let sgn = if val >= cv3[ax] { 1.0 } else { -1.0 }; let imp = (rho * sy).sqrt(); let d_tear = k.lt * (3.0 * ef / 8.0).sqrt();
    let v_tear = k.vcrit * (ef / 0.2); let gas_r = k.gas_reach * wg.cbrt();
    let (cu, cv) = (cv3[ua], cv3[va]); let npet = 4.0 + ((seed as u32 >> 3) % 3) as f64; let ph = hash(p as i32, 7, seed) * 6.283;
    let mut l = Plate { p, ax, val, ua, va, u0, v0, nu, nv, h, s, skin: pp[o + 10] > 0.5, sgn, cu, cv,
      d: vec![0.0; 3 * n], ta: vec![0.0; n], tr: vec![0.0; n], q: vec![0.0; n], fl: vec![0; n], so: vec![0.0; n], v: vec![0.0; n],
      fa: vec![0.0; n], fln: vec![0.0; n], hx: vec![0.0; n], dn: vec![0.0; n] };
    let mut d_i = vec![0f32; n]; let mut v_i = vec![0f32; n];
    let mut p3 = [0f64; 3]; let mut q3 = [0f64; 3];
    for j in 0..=nv { for i in 0..=nu {
      let m = j * w1 + i;
      p3[ax] = val; p3[ua] = u0 + i as f64 * s; p3[va] = v0 + j as f64 * s;
      let (dx, dy, dz) = (p3[0] - c[0], p3[1] - c[1], p3[2] - c[2]);
      let r = (rc + 0.05).max((dx * dx + dy * dy + dz * dz).sqrt()); let cth = (p3[ax] - cv3[ax]).abs() / r;
      let mut f = 1.0f64;
      for b in plates.iter().flatten() {
        let a = b.ax; let den = p3[a] - cv3[a]; if den.abs() < 1e-6 { continue; }
        let t = (b.val - cv3[a]) / den; if t <= 0.02 || t >= 0.98 { continue; }
        q3[0] = c[0] + dx * t; q3[1] = c[1] + dy * t; q3[2] = c[2] + dz * t;
        let tr = b.torn_at(&q3); if tr < 0 { continue; }
        f *= if tr == 1 { k.hole } else { k.shield };
      }
      let z = (r / w13).max(0.06); let ps = kinney_ps(z); let rr = if ps > 1.0 { reflect(ps) / ps } else { 2.0 };
      let ir = kinney_is(z, w) * (1.0 + (rr.powf(0.7) - 1.0) * cth * cth) * f;
      let ig = if pq > 0.0 && f > 0.2 { pq * sat(1.3 - r / gas_r) } else { 0.0 };
      d_i[m] = (k.kd * ir * k.lc / (h * imp) + k.gkd * ig * k.lc * k.lc / (8.0 * sy * h)) as f32;
      v_i[m] = (ir / (rho * h)) as f32;
      l.ta[m] = arr.at(r, w) as f32;
      l.tr[m] = (0.004 + 0.012 * 3f64.min(d_i[m] as f64 / d_tear) + if ig > 0.0 { 0.015 } else { 0.0 }) as f32;
      l.so[m] = if f > 0.2 { (0.95 * sat(1.0 - r / fr).powf(0.7)) as f32 } else { 0.0 };
    } }
    blur(&mut d_i, w1, nv + 1, k.blur); blur(&mut d_i, w1, nv + 1, k.blur);
    for j in 0..=nv { for i in 0..=nu {
      let m = j * w1 + i; let u = u0 + i as f64 * s - cu; let v = v0 + j as f64 * s - cv; let th = v.atan2(u);
      let md = 1.0 + k.petal * (npet * th + ph).cos() * sat((u * u + v * v).sqrt() / 1.5) + k.noise * (vnoise(u * 1.1 + 31.0 * p as f64, v * 1.1, seed) * 2.0 - 1.0);
      let qm = d_i[m] as f64 / d_tear; let qv = v_i[m] as f64 / v_tear; let q = qm.max(qv) / md;
      l.q[m] = q as f32;
      if q >= 1.0 { l.fl[m] = if qv / md >= k.gone { 3 } else { 1 }; }
    } }
    const NB: usize = 64; let mut re = [0f32; NB];
    let bin = |u: f64, v: f64| -> usize { (((v.atan2(u) / 6.2832 + 1.0) * NB as f64) as i64 as usize) % NB };
    for m in 0..n { if l.fl[m] & 1 != 0 { let i = m % w1; let j = m / w1; let u = u0 + i as f64 * s - cu; let v = v0 + j as f64 * s - cv; let b = bin(u, v); let r = (u * u + v * v).sqrt() as f32; if r > re[b] { re[b] = r; } } }
    let mut lmax = 1e-3f64; for b in 0..NB { lmax = lmax.max(re[b] as f64); }
    let e = 1.5;
    let mut d_max = 1e-6f64; for m in 0..n { if d_i[m] as f64 > d_max { d_max = d_i[m] as f64; } }
    for j in 0..=nv { for i in 0..=nu {
      let m = j * w1 + i; let u = u0 + i as f64 * s - cu; let v = v0 + j as f64 * s - cv; let r = (u * u + v * v).sqrt();
      let ux = if r > 1e-4 { u / r } else { 0.0 }; let vx = if r > 1e-4 { v / r } else { 0.0 };
      let eb = ease(i as f64 * s / e) * ease((nu - i) as f64 * s / e) * ease(j as f64 * s / e) * ease((nv - j) as f64 * s / e);
      let d0 = 2.5f64.min(k.vis * d_max * (d_i[m] as f64 / d_max).powf(k.pk)) * eb;
      let fo = 1.0 + k.fold * sat(d0 / 0.15) * (6.2832 * (u + 0.35 * v) / k.foldl + 3.0 * vnoise(u * 0.4, v * 0.4, seed.wrapping_add(11))).sin();
      let dn = 2.5f64.min(d0 * fo);
      let o3 = 3 * m;
      l.dn[m] = dn as f32;
      l.d[o3 + ax] = (sgn * dn) as f32; l.d[o3 + ua] = (-ux * dn * 0.12) as f32; l.d[o3 + va] = (-vx * dn * 0.12) as f32;
      if l.fl[m] & 3 == 1 {
        let b = bin(u, v); let lf = 0f64.max(re[b] as f64 - r);
        let a = 2.4f64.min((0.35 + 0.55 * (l.q[m] as f64).max(1.0).ln()) * (1.0 + 0.7 * lf / lmax));
        l.fa[m] = a as f32; l.fln[m] = lf as f32; l.hx[m] = re[b];
        l.d[o3 + ax] = (sgn * (lf * a.sin() + dn * 0.3)) as f32;
        l.d[o3 + ua] = (ux * lf * (1.0 - a.cos())) as f32; l.d[o3 + va] = (vx * lf * (1.0 - a.cos())) as f32;
      }
      if l.fl[m] & 2 != 0 { l.v[m] = 150f64.min(20.0 + 0.5 * v_i[m] as f64) as f32; }
    } }
    plates[p] = Some(l);
  }
  let mut out: Vec<Plate> = plates.into_iter().map(|x| x.unwrap()).collect();
  buckle(&mut out, k, seed);
  frags(&mut out, &cv3, w, seed, s, k);
  out
}

fn buckle(plates: &mut [Plate], k: &K, seed: i32) {
  if plates.is_empty() { return; }
  let (head, rest) = plates.split_at_mut(1); let a = &head[0];
  let wa = a.nu + 1; let mut q = [0f64; 3];
  for b in rest.iter_mut() {
    if b.ax == a.ax { continue; }
    if !(a.ax == b.ua || a.ax == b.va) { continue; }
    let along = if b.ua == a.ax { b.va } else { b.ua }; let w1 = b.nu + 1; let ph = hash(b.p as i32, 13, seed) * 6.283;
    for j in 0..=b.nv { for i in 0..=b.nu {
      let m = j * w1 + i;
      if b.fl[m] & 1 != 0 { continue; }
      q[b.ax] = b.val; q[b.ua] = b.u0 + i as f64 * b.s; q[b.va] = b.v0 + j as f64 * b.s;
      let e = (q[a.ax] - a.val).abs(); if e > 3.0 * k.bucke { continue; }
      let ia = js_round((q[a.ua] - a.u0) / a.s); let ja = js_round((q[a.va] - a.v0) / a.s);
      if ia < -2.0 || ja < -2.0 || ia > a.nu as f64 + 2.0 || ja > a.nv as f64 + 2.0 { continue; }
      let eg = js_round(1.5 / a.s); let ia = eg.max((a.nu as f64 - eg).min(ia)); let ja = eg.max((a.nv as f64 - eg).min(ja));
      let ma = ja as usize * wa + ia as usize; let da = a.dn[ma] as f64; if !(da > 0.02) { continue; }
      let w = (-e / k.bucke).exp();
      let bb = k.kb * da * w * (6.2832 * q[along] / k.buckl + ph + 2.0 * vnoise(q[along] * 0.3, e * 0.3, seed.wrapping_add(29))).sin();
      let o3 = 3 * m;
      b.d[o3 + b.ax] = (b.d[o3 + b.ax] as f64 + bb) as f32; b.d[o3 + a.ax] = (b.d[o3 + a.ax] as f64 + a.sgn * da * (-e / 1.2).exp()) as f32;
      b.dn[m] = 2.5f64.min(b.dn[m] as f64 + bb.abs()) as f32;
      if a.ta[ma] < b.ta[m] { b.ta[m] = a.ta[ma]; b.tr[m] = b.tr[m].max(a.tr[ma]); }
    } }
  }
}

fn frags(plates: &mut [Plate], c: &[f64; 3], w: f64, seed: i32, s: f64, k: &K) {
  let mut r = Rng({ let x = (seed ^ 0x5bd1e995u32 as i32) as u32; if x == 0 { 1 } else { x } });
  let n = js_round(k.nfrag * 2f64.min(0.4f64.max((w / 50.0).cbrt()))) as usize;
  for _ in 0..n {
    let z = r.next() * 2.0 - 1.0; let a = r.next() * 6.2832; let sn = (1.0 - z * z).sqrt(); let d = [sn * a.cos(), sn * a.sin(), z];
    let mut pen = k.pen0 * (0.6 + 0.8 * r.next()); let mut x = *c; let mut travelled = 0.0;
    for _hop in 0..5 {
      if pen <= 0.0 { break; }
      let mut best: Option<(usize, usize, usize)> = None; let mut bt = 1e9;
      for (li, l) in plates.iter().enumerate() {
        let den = d[l.ax]; if den.abs() < 1e-6 { continue; } let t = (l.val - x[l.ax]) / den; if t <= 0.01 || t >= bt { continue; }
        let qu = x[l.ua] + d[l.ua] * t; let qv = x[l.va] + d[l.va] * t; let i = js_round((qu - l.u0) / s); let j = js_round((qv - l.v0) / s);
        if i < 1.0 || j < 1.0 || i >= l.nu as f64 || j >= l.nv as f64 { continue; }
        bt = t; best = Some((li, i as usize, j as usize));
      }
      let Some((li, i, j)) = best else { break };
      let l = &mut plates[li]; let m = j * (l.nu + 1) + i;
      travelled += bt; for q in 0..3 { x[q] += d[q] * bt; }
      if l.fl[m] & 3 != 0 { continue; }
      let left = pen * (-travelled / k.pen_l).exp(); let hm = l.h * 1000.0;
      l.fl[m] |= 16; l.so[m] = l.so[m].max(0.6);
      if left > hm { l.fl[m] |= 1; l.q[m] = l.q[m].max(1.0); l.ta[m] = l.ta[m].min((travelled / 1500.0) as f32); pen -= hm * 1.5; }
      else { let o3 = 3 * m; l.d[o3 + l.ax] += if l.val >= c[l.ax] { 0.03 } else { -0.03 }; break; }
    }
  }
}

/* ---------------------------------------------------------------- the WebAssembly interface */
static mut OUT: Vec<f32> = Vec::new();

#[no_mangle] pub extern "C" fn alloc_f64(n: usize) -> *mut f64 { let mut v = vec![0f64; n]; let p = v.as_mut_ptr(); std::mem::forget(v); p }
#[no_mangle] pub unsafe extern "C" fn free_f64(p: *mut f64, n: usize) { drop(Vec::from_raw_parts(p, n, n)); }
/// solves; returns the output block's length (floats); its address from `out_ptr`
#[no_mangle] pub unsafe extern "C" fn solve_wasm(pp: *const f64, n_p: usize, cc: *const f64) -> usize {
  let pv = std::slice::from_raw_parts(pp, n_p * PN); let cv = std::slice::from_raw_parts(cc, 8);
  let plates = solve(pv, cv, &KDEF);
  let mut o: Vec<f32> = Vec::new();
  for l in &plates {
    let n = l.ta.len();
    o.extend_from_slice(&[l.p as f32, l.ax as f32, l.val as f32, l.ua as f32, l.va as f32, l.u0 as f32, l.v0 as f32, l.nu as f32, l.nv as f32,
      l.h as f32, l.s as f32, if l.skin { 1.0 } else { 0.0 }, l.sgn as f32, l.cu as f32, l.cv as f32, n as f32]);
    o.extend_from_slice(&l.d); o.extend_from_slice(&l.ta); o.extend_from_slice(&l.tr); o.extend_from_slice(&l.q);
    o.extend(l.fl.iter().map(|&x| x as f32)); o.extend_from_slice(&l.so); o.extend_from_slice(&l.v);
    o.extend_from_slice(&l.fa); o.extend_from_slice(&l.fln); o.extend_from_slice(&l.hx); o.extend_from_slice(&l.dn);
  }
  let len = o.len();
  let out = &mut *std::ptr::addr_of_mut!(OUT);
  *out = o;
  len
}
#[no_mangle] pub unsafe extern "C" fn out_ptr() -> *const f32 { (*std::ptr::addr_of!(OUT)).as_ptr() }
