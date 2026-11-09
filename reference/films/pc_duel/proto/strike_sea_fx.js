/* STRIKE · the sea half's effects (window.STRIKE_SEA_FX(ctx) -> { lights, seaFx, edgeHeat, chunkLook, draw, flashA,
   tags, cloudY, cloudV }): the rod in the air (the orbital film's rod body, its plasma sheath and bow shock, the
   column it leaves, the altitude ladder), the flash, the hull's secondary flashes, the bloom, fire and smoke, the
   debris and its splashes, the plume and ring waves at the entry, the water flooding the halves, the rod in the
   sea (its cavity of steam, the ablation), the cavity's collapse and pinch-off, the bubble cloud, the aftermath.
   (round 1: the passage through the decks: plate flashes, fragment clouds, plasma, ejecta, the decks inside seen
   through the cutaway; the fire in the hull and the magazine chain: blast cores, jets out of the torn vents, rolling
   fireballs; the mount thrown (drawn here from the act-1 clouds); the spray dome, the column and the base surge; the
   rod's last flash; the water's light below; the halves going under; tags white/lime/coral by side)
   Spectacle only: light, motion, flashes, smoke, water. Every effect a pure function of (v, tau) with seeded hashes. */
window.STRIKE_SEA_FX = function (ctx) {
'use strict';
const { K, C, V, R, X, E, rng, noise, ss, sm, HIT, DIR, SPATH, W_ENTRY, ROD_L, ROD_R, DMAX, TW, TAU_K, S_SHIP } = ctx;
const { dotC, dotW, light, FIRE, EMB, HOT, WH, LIME, CORAL } = ctx;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const BW = K.BW, BH = K.BH, SPX = K.S;
const SMK = [128, 128, 124], DUST = [210, 212, 206], STEAM = [226, 232, 236], FOAM = [236, 240, 238];
const D = (window.STRIKE_ORBIT && STRIKE_ORBIT.D) || STAGE.dbg(), P = D.P;   // (the orbital film's: a host page sets its own STAGE.dbg later)
const CC = [0, 0, 0];
const mixc = (a, b, t, o) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };
/* sin / cos tables, hashes (as the orbital fx) */
const SNT = new Float32Array(4096); for (let i = 0; i < 4096; i++) SNT[i] = Math.sin(i / 4096 * TAU);
const fs = a => SNT[((a * 651.8986469 + 1003520) | 0) & 4095], fc = a => SNT[((a * 651.8986469 + 1003520 + 1024) | 0) & 4095];
/* (round 1: 2^17 entries: the big samplings (the cavity's wall, the plasma) no longer repeat every 3000 points) */
const NHH = 1 << 17, HH1 = new Float32Array(NHH), HH2 = new Float32Array(NHH); { const r = rng(4747); for (let i = 0; i < NHH; i++) { HH1[i] = r(); HH2[i] = r(); } }
const hz1 = i => HH1[(i >>> 0) & (NHH - 1)], hz2 = i => HH2[(i >>> 0) & (NHH - 1)];
const hh = K.hh;
let ex = 0, ey = 0, ez = 0, f0 = 0, f1 = 0, f2 = 0, r0 = 0, r1 = 0, r2 = 0, u0 = 0, u1 = 0, u2 = 0, FL = 1;
function cam() { ctx.cam(); const e = C.eye, f = C.f, r = C.r, u = C.u; ex = e[0]; ey = e[1]; ez = e[2]; f0 = f[0]; f1 = f[1]; f2 = f[2]; r0 = r[0]; r1 = r[1]; r2 = r[2]; u0 = u[0]; u1 = u[1]; u2 = u[2]; FL = C.fl; }

/* ================= the rod in the air ================= */
const NFL = 6000, FLW = (() => { const r = rng(919), A = new Float32Array(NFL * 5); for (let i = 0; i < NFL; i++) { A[i * 5] = r() * TAU; A[i * 5 + 1] = r(); A[i * 5 + 2] = .65 + .7 * r(); A[i * 5 + 3] = r(); A[i * 5 + 4] = r(); } return A; })();
const NBS = 4200, BSH = (() => { const r = rng(929), A = new Float32Array(NBS * 3); for (let i = 0; i < NBS; i++) { A[i * 3] = Math.sqrt(r()); A[i * 3 + 1] = r() * TAU; A[i * 3 + 2] = r(); } return A; })();
function ringB(cx_, cy_, cz_, U, Wd, rr, n, col, a, ph, jit, gap) {
  if (a < .015) return;
  for (let k = 0; k < n; k++) {
    const t = ph + k / n * TAU, g = .5 + .5 * fs(t * 3 + ph * 1.7) * fc(t * 5 - ph); if (g < gap) continue;
    const q = rr * (1 + jit * (hz1(k * 13 + (ph * 100 | 0)) - .5)), cs = fc(t) * q, sn = fs(t) * q;
    dotW(cx_ + U[0] * cs + Wd[0] * sn, cy_ + U[1] * cs + Wd[1] * sn, cz_ + U[2] * cs + Wd[2] * sn, 1, col, a * (.55 + .45 * g));
  }
}
/* the sheath (the orbital fx's, on our altitude): nose n, heading D, perpendiculars U Wd; T the flicker clock */
function sheath(nx, ny, nz, D_, U, Wd, alt, T) {
  const dist = Math.max(1, Math.hypot(nx - ex, ny - ey, nz - ez)), ppm = FL / dist;
  const heat = Math.pow(ss(125000, 45000, alt), 1.25), h = Math.max(.02, heat), lo = ss(32000, 6000, alt);
  if (ppm < 2 * SPX) { const k = 1 - ppm / (2 * SPX); K.glowW(nx, ny, nz, Math.round(18 + 50 * h + 40 * lo), HOT, (.35 + .4 * h) * k); K.glowW(nx, ny, nz, Math.round(60 + 140 * h), FIRE, (.12 + .18 * h + .2 * lo) * k); dotW(nx, ny, nz, 2, HOT, 1); }
  const vd = Math.abs((nx - ex) * D_[0] + (ny - ey) * D_[1] + (nz - ez) * D_[2]) / dist, side = 1 - ss(.62, .9, vd);
  const Rn = 1 + 2.2 * h + 1.6 * lo, Rs = Rn * 2.2, so = .3 * Rn, Lb = Rs * Rs / (2 * Rn) - so, Lc = Rs * (16 + 18 * lo), tc = .085 + .035 * (1 - h), Lw = 140 + 420 * h + 520 * lo;
  const fr = Math.floor(T * 30);
  K.glowW(nx, ny, nz, Math.min(140, 5 + Rn * 1.8 * ppm / SPX), HOT, .3 * h + .25 * lo);
  for (let k = 1; k <= 5; k++) { const x = Lw * .035 * k * k; K.glowW(nx - D_[0] * x, ny - D_[1] * x, nz - D_[2] * x, Math.min(110, 3 + (Rs * (1 + .25 * k)) * ppm * 1.2 / SPX), k < 3 ? FIRE : EMB, (.16 + .12 * lo) * h * (1 - k / 6)); }
  {
    const n = Math.min(NBS, Math.max(220, Math.round((Rs * Rs + Lc * Rs * .3) * ppm * ppm * 1.6)));
    const x1 = (Rs * 1.3) * (Rs * 1.3) / (2 * Rn) - so;
    for (let i = 0; i < n; i++) {
      const o = i * 3, uq = BSH[o], th = BSH[o + 1] + T * .9;
      let rr, xb;
      if (uq < .55) { rr = uq / .55 * Rs * 1.3; xb = rr * rr / (2 * Rn) - so; }
      else { const vv = (uq - .55) / .45; xb = x1 + (Lc - x1) * vv * vv; rr = Rs * 1.3 + (xb - x1) * tc; }
      const cs = fc(th) * rr, sn = fs(th) * rr, fk = hz1(i * 7 + fr * 13), al = h * (uq < .55 ? 1.15 - .5 * uq / .55 : .75 * (1 - (uq - .55) / .45) * side);
      dotW(nx - D_[0] * xb + U[0] * cs + Wd[0] * sn, ny - D_[1] * xb + U[1] * cs + Wd[1] * sn, nz - D_[2] * xb + U[2] * cs + Wd[2] * sn, 1, uq < .3 ? HOT : WH, al * (.45 + .55 * fk));
    }
  }
  {
    const n1 = Math.min(NFL >> 1, Math.max(240, Math.round(Rs * Rs * ppm * ppm * 7))), n2 = Math.min(NFL >> 1, Math.max(300, Math.round(Lw * Rs * ppm * ppm * .25)));
    const Ls = Lb * 3.2 + so;
    for (let i = 0; i < n1; i++) {
      const o = i * 5, a0 = FLW[o], sp = FLW[o + 2], rq = FLW[o + 3];
      let uu = FLW[o + 1] + T * 3.1 * sp; uu -= Math.floor(uu);
      const xb = Ls * uu * uu - so;
      const shl = xb < Lb ? Math.sqrt(Math.max(0, 2 * Rn * (xb + so))) : Rs * (1 + .5 * (xb - Lb) / Ls);
      const th = a0 + 2.4 * uu + .5 * fs(T * 5.3 + a0 * 3 + uu * 9);
      const rr = shl * (.5 + .45 * rq) * (1 + .12 * fs(T * 11.7 + i * .37 + uu * 20));
      const cs = fc(th) * rr, sn = fs(th) * rr;
      const fk = .55 + .45 * hz2(i + fr * 31), al = h * (1.2 - .6 * uu) * fk;
      dotW(nx - D_[0] * xb + U[0] * cs + Wd[0] * sn, ny - D_[1] * xb + U[1] * cs + Wd[1] * sn, nz - D_[2] * xb + U[2] * cs + Wd[2] * sn, uu < .25 && ppm > 3 ? 2 : 1, uu < .3 ? HOT : uu < .7 ? FIRE : EMB, al);
    }
    for (let i = 0; i < n2; i++) {
      const o = (i + (NFL >> 1)) * 5, a0 = FLW[o], sp = FLW[o + 2], rq = FLW[o + 3];
      let uu = FLW[o + 1] + T * 1.2 * sp; uu -= Math.floor(uu);
      const xb = Ls * .6 + Lw * Math.pow(uu, 1.35);
      const shl = Rs * (.8 + 1.1 * xb / Lw);
      const th = a0 + 1.7 * uu + .45 * fs(T * 4.3 + a0 * 3 + uu * 11);
      const rr = shl * (.15 + .85 * rq * rq) * (1 + .3 * fs(T * 7.7 + i * .37 + uu * 20));
      const cs = fc(th) * rr, sn = fs(th) * rr;
      const fk = .5 + .5 * hz2(i + fr * 31), al = (h + .3 * lo) * Math.pow(1 - uu, 1.1) * fk * (1.15 - .5 * rq);
      dotW(nx - D_[0] * xb + U[0] * cs + Wd[0] * sn, ny - D_[1] * xb + U[1] * cs + Wd[1] * sn, nz - D_[2] * xb + U[2] * cs + Wd[2] * sn, 1, uu < .12 ? HOT : uu < .4 ? FIRE : uu < .7 ? EMB : WH, uu > .7 ? al * .5 : al);
    }
  }
  if (side > .02) {
    const x1 = (Rs * 1.3) * (Rs * 1.3) / (2 * Rn) - so, RDT = .055, NRG = 12, life = RDT * NRG, k0 = Math.floor(T / RDT);
    for (let j = 0; j < NRG; j++) {
      const kq = k0 - j, tq = T - kq * RDT, uq = tq / life; if (uq > 1 || uq < 0) continue;
      const xr = Lb + (Lc - Lb) * Math.pow(uq, 1.15), rr = (xr < x1 ? Math.sqrt(Math.max(0, 2 * Rn * (xr + so))) : Rs * 1.3 + (xr - x1) * tc) * 1.02;
      const al = side * h * Math.pow(1 - uq, 1.2) * Math.min(1, uq * 8) * (kq % 3 === 0 ? 1.15 : .7);
      const n = Math.min(900, Math.max(24, Math.round(TAU * rr * ppm / 1.2)));
      ringB(nx - D_[0] * xr, ny - D_[1] * xr, nz - D_[2] * xr, U, Wd, rr, n, uq < .25 ? HOT : WH, al, kq * .9, .06 + .06 * uq, .2 + .25 * uq);
    }
  }
}
/* the altitude ladder (the orbital fx's): a gauge 7 m beside the rod, a tick every 5 km (marks every 10 km with their
   height), 4 m apart along the rod per 5 km, scrolling past its nose; the mark it is passing lime. Below 5 km: a tick
   every 500 m (the scale x10, marks every km) */
const GLY = { '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111', 'K': '101101110101101', 'M': '101111111101101', '.': '000000000000010', ' ': '000000000000000' };
function ladder(px, py, pz, D_, alt, vis) {
  if (vis < .02) return;
  // a side and an up across the rod as the lens sees it
  let sx = r0 - D_[0] * (r0 * D_[0] + r1 * D_[1] + r2 * D_[2]), sy = r1 - D_[1] * (r0 * D_[0] + r1 * D_[1] + r2 * D_[2]), sz = r2 - D_[2] * (r0 * D_[0] + r1 * D_[1] + r2 * D_[2]);
  const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
  const Sd = [sx, sy, sz];
  // (round 1: the gauge's zero at the nose, so the tick at the current altitude sits level with it and 0 KM is
  // always below it; the 5 km and the 500 m scales crossfade over ~2.5 km of fall, ~0.5 s)
  const ox0 = px - Sd[0] * 7, oy0 = py - Sd[1] * 7, oz0 = pz - Sd[2] * 7;
  for (let k = -80; k <= 110; k++) { const x = k * .3; dotW(ox0 + D_[0] * x, oy0 + D_[1] * x, oz0 + D_[2] * x, 1, WH, vis * .22 * (1 - Math.abs(k) / 95)); }
  const wf = ss(7600, 5000, alt);
  if (wf < .98) ladderScale(ox0, oy0, oz0, D_, Sd, alt, vis * (1 - wf), false);
  if (wf > .02) ladderScale(ox0, oy0, oz0, D_, Sd, alt, vis * wf, true);
}
function ladderScale(ox0, oy0, oz0, D_, Sd, alt, vis, fine) {
  const step = fine ? 500 : 5000, LK = 8 / (fine ? 1000 : 10000), maj = fine ? 1000 : 10000;
  const h0 = Math.max(0, Math.ceil((alt - 24 / LK) / step) * step);
  for (let h = h0; h <= alt + 18 / LK && h >= 0; h += step) {
    const x = (alt - h) * LK, fade = 1 - ss(12, 22, Math.abs(x)), major = h % maj === 0, cur = Math.abs(x) < .9;
    const a = vis * fade * (major ? 1 : .6), col = cur ? LIME : WH;
    if (a < .02) continue;
    const bx = ox0 + D_[0] * x, by = oy0 + D_[1] * x, bz = oz0 + D_[2] * x, Lt = major ? 3.2 : 1.6;
    for (let k = 0; k < (major ? 40 : 20); k++) { const q = -k * .08; dotW(bx + Sd[0] * q, by + Sd[1] * q, bz + Sd[2] * q, 1, col, a); }
    if (!major) continue;
    const txt = (fine ? String(h / 1000) : String(Math.round(h / 1000))) + ' KM', cw = .2;
    const oxl = bx - Sd[0] * Lt + u0 * .9, oyl = by - Sd[1] * Lt + u1 * .9, ozl = bz - Sd[2] * Lt + u2 * .9;
    for (let c = 0; c < txt.length; c++) {
      const g = GLY[txt[c]]; if (!g) continue;
      for (let j = 0; j < 15; j++) { if (g[j] !== '1') continue; const gx = (c * 4 + j % 3) * cw, gy = (2 - ((j / 3) | 0)) * cw;
        for (let s2 = 0; s2 < 4; s2++) { const jx = gx + (s2 & 1) * cw * .5, jy = gy + (s2 >> 1) * cw * .5; dotW(oxl + r0 * jx + u0 * jy, oyl + r1 * jx + u1 * jy, ozl + r2 * jx + u2 * jy, 1, col, a * .95); } }
    }
  }
}
/* the column the rod leaves: plasma white-hot at the rod, cooling to fire, embers, then smoke lit by the moon; it
   widens with its age (sim s) and drifts; drawn as rings of dots along the path, as many as its width on screen asks */
const MOONL = V.norm([-.35, .55, -.75]);
/* (round 1: below 30 km the trail narrows to a few metres at the nose, widening slowly; above, the orbital film's) */
const colR = (age, alt) => Math.min(220, 2.5 + 26 * Math.sqrt(age)) * (.3 + .7 * ss(108000, 26000, alt)) * (1 - .74 * ss(30000, 9000, alt));
function column(tau, vis) {
  const sN = -ctx.noseS(tau);                                      // path distance of the nose above HIT (>0 in the air)
  const sTop = 46000, U = ctx.U2(), Wd = ctx.W2();
  const sU = V.dot(U, MOONL), sW = V.dot(Wd, MOONL);
  const s0 = Math.max(sN, -999);
  // the age at path s: the time since the nose passed (sim s)
  const BUD = 60000 * SPX * SPX * (K.HQ ? 1.6 : 1);
  let used = 0;
  for (let c0 = Math.max(0, s0); c0 < sTop && used < BUD; ) {
    // chunk length grows with the distance from the lens (fine near, coarse far)
    const mx = HIT[0] - DIR[0] * c0, my = HIT[1] - DIR[1] * c0, mz = HIT[2] - DIR[2] * c0, dist = Math.max(20, Math.hypot(mx - ex, my - ey, mz - ez));
    const L = Math.min(2000, Math.max(4, dist * .06)), c1 = Math.min(sTop, c0 + L), sm_ = (c0 + c1) / 2;
    const alt = HIT[1] + sm_ / SPATH, air = ss(112000, 36000, alt);
    const age = Math.max(0, tau - TAU_AT(sm_));
    const rc = colR(age, alt);
    const cx = HIT[0] - DIR[0] * sm_, cy = HIT[1] - DIR[1] * sm_, cz = HIT[2] - DIR[2] * sm_;
    if (K.wIn(cx, cy, cz, L / 2 + rc * 1.5 + 10)) {
      const zm = Math.max(1, K.WZ[0]), wpx = 2 * rc * FL / zm, ds = Math.max(.05, 1.6 * zm / FL);
      const nAlong = Math.min(4000, Math.ceil(L / ds)), reps = Math.max(1, Math.min(26, Math.round(wpx * .16)));
      for (let i = 0; i < nAlong; i++) {
        const id = Math.floor(c0 / ds) + i, s = (id + hz1(id)) * ds; if (s > c1 || s < sN) continue;
        const ag = Math.max(0, tau - TAU_AT(s)), al = HIT[1] + s / SPATH, ai = ss(112000, 36000, al);
        const hot = Math.exp(-ag / (.9 + .7 * hz2(id)));
        const r_ = colR(ag, al) * (1 + .15 * fs(s / 173 + 1.3) + .1 * fs(s / 71 + 4.1) + .07 * fs(s / 29.3 + 2.2)) * Math.max(.15, ai);
        const wa = Math.min(ag, 40) * ai, wx = 3.5 * fs(al / 6500 + 1.2) * wa, wz = 3.5 * fc(al / 9000 + .4) * wa, wy = 1.1 * wa;
        const px = HIT[0] - DIR[0] * s + wx, py = HIT[1] - DIR[1] * s + wy, pz = HIT[2] - DIR[2] * s + wz;
        const dens = vis * (.3 + .5 * Math.exp(-ag / 40)) * (.5 + .5 * ai);
        if (hot > .5) dotW(px, py, pz, 1, HOT, dens * .7 * hot);
        for (let k = 0; k < reps; k++) {
          const hk = hz2(id * 41 + k), hq = hz1(id * 41 + k * 7), th = hk * TAU, q = 1 - .72 * hq * hq;
          const cs = fc(th), sn = fs(th), rr = q * r_;
          const x = px + (U[0] * cs + Wd[0] * sn) * rr, y = py + (U[1] * cs + Wd[1] * sn) * rr, z = pz + (U[2] * cs + Wd[2] * sn) * rr;
          const lw = cs * sU + sn * sW, lit = .18 + .5 * (lw > 0 ? lw : 0) * (.55 + .45 * q);
          const b = dens * (.6 + .4 * q);
          if (hot > .42) dotW(x, y, z, 1, hot > .7 ? HOT : FIRE, b * (.75 + .35 * hot));
          else if (hot > .06) { mixc(EMB, DUST, 1 - (hot - .06) / .36, CC); dotW(x, y, z, 1, CC, b * (.6 + .4 * lit)); }
          else { const l = Math.min(1, lit); dotC(x, y, z, 1, SMK[0] + (DUST[0] - SMK[0]) * l, SMK[1] + (DUST[1] - SMK[1]) * l, SMK[2] + (DUST[2] - SMK[2]) * l, b * .8); }
          used++;
        }
      }
    }
    c0 = c1;
  }
}
/* the sim time the nose passed path distance s above HIT (tabulated) */
const TAT_N = 4600, TAT = new Float64Array(TAT_N + 1);
{ let lo = -40, hi = 0; for (let i = 0; i <= TAT_N; i++) { const s = i * 10; let a = -40, b = 0; for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (-ctx.noseS(m) > s) a = m; else b = m; } TAT[i] = (a + b) / 2; } }
function TAU_AT(s) { const x = Math.max(0, Math.min(TAT_N, s / 10)), k = Math.min(TAT_N - 1, Math.floor(x)); return TAT[k] + (TAT[k + 1] - TAT[k]) * (x - k); }

/* the rod: the orbital film's rod body (a solid tungsten rod, its nose cone), glowing with its heating; in the sea it
   wears away from the nose (clipped), its end a molten white cap */
const RODB = P.rods[0];
function drawRod(tau, heat) {
  const L = ctx.rodLen(tau); if (L <= .02) return;
  const n = ctx.ptS(ctx.noseS(tau)), cen = V.sub(n, V.mul(DIR, L - 9));
  const Tw = X.make(R.look(DIR, [0, 1, 0]), cen);
  const o = { a: 1.5, fx: () => 10 + Math.min(2, heat * 2) };
  if (L < ROD_L - .01) o.clipM = [0, 0, 1, -9 + L];
  ORL.draw(RODB, Tw, o);
}

/* ================= the strike ================= */
const DA = HD.destroyer.A, hD = DA.deckY;
const WIND = [1.4, 0, -2.4];                                         // the breeze (m/s): smoke leans aft and to starboard
const G = 9.81;
const M0 = new Float64Array(9), T0 = new Float64Array(3), M1 = new Float64Array(9), T1 = new Float64Array(3);
const HM = [M0, M1], HT = [T0, T1];
let HTAU = -1;
function poses(tau) { if (tau === HTAU) return; HTAU = tau; ctx.halfPose(0, tau, M0, T0); ctx.halfPose(1, tau, M1, T1); }
/* a half-local point -> world (o) */
function hw(g, p, o) { const M = HM[g], T = HT[g]; o[0] = M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + T[0]; o[1] = M[3] * p[0] + M[4] * p[1] + M[5] * p[2] + T[1]; o[2] = M[6] * p[0] + M[7] * p[1] + M[8] * p[2] + T[2]; return o; }
const HM2 = new Float64Array(9), HT2 = new Float64Array(3);
function hwAt(g, tau, p, o) { const M = HM2, T = HT2; ctx.halfPose(g, tau, M, T); o[0] = M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + T[0]; o[1] = M[3] * p[0] + M[4] * p[1] + M[5] * p[2] + T[1]; o[2] = M[6] * p[0] + M[7] * p[1] + M[8] * p[2] + T[2]; return o; }
const hdir = (g, d, o) => { const M = HM[g]; o[0] = M[0] * d[0] + M[1] * d[1] + M[2] * d[2]; o[1] = M[3] * d[0] + M[4] * d[1] + M[5] * d[2]; o[2] = M[6] * d[0] + M[7] * d[1] + M[8] * d[2]; return o; };
const Q = [0, 0, 0], Q2 = [0, 0, 0], Q3 = [0, 0, 0];
/* the hull's half-width at (z, y) from the coarse samples (1 m bins) */
const HWZ = 160, HWY = 40, HWT = new Float32Array(HWZ * HWY);
{ for (let g = 0; g < 3; g++) { const Pp = ctx.SHIP[g][3].P; for (let i = 0; i < Pp.length; i += 10) { const z = Pp[i + 2], y = Pp[i + 1]; if (y > 7.5) continue; const zi = Math.round(z + 80), yi = Math.round(y + 8); if (zi < 0 || zi >= HWZ || yi < 0 || yi >= HWY) continue; const k = zi * HWY + yi; HWT[k] = Math.max(HWT[k], Math.abs(Pp[i])); } } }
const hullW = (z, y) => { const zi = Math.max(0, Math.min(HWZ - 1, Math.round(z + 80))), yi = Math.max(0, Math.min(HWY - 1, Math.round(y + 8))); let w = HWT[zi * HWY + yi]; if (!w) { for (let k = 1; k < 4 && !w; k++) w = Math.max(HWT[Math.min(HWZ - 1, zi + k) * HWY + yi], HWT[Math.max(0, zi - k) * HWY + yi]); } return w || 0; };
/* the break faces (half-local): mean z of each */
const ZF = [ctx.zPath(0) + ctx.R_FACE, ctx.zPath(0) - ctx.R_FACE];

/* ---- the flash: the deck struck at 4.85 km/s: white for a few frames at x1/2000, then orange ---- */
const flashA = tau => tau < 0 ? 0 : .5 * Math.exp(-tau / .0003) + .04 * Math.exp(-tau / .004);
const SF = [];

/* ---- the bloom: a fireball swelling over the hit, lifting into a rolling column of black smoke ---- */
const NBL = 26000, BL = (() => { const r = rng(7171), A = new Float32Array(NBL * 6); for (let i = 0; i < NBL; i++) { const u = r() * 2 - 1, th = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 6] = Math.cos(th) * h; A[i * 6 + 1] = Math.abs(u) * (r() < .8 ? 1 : -.4); A[i * 6 + 2] = Math.sin(th) * h; A[i * 6 + 3] = Math.cbrt(r()); A[i * 6 + 4] = r(); A[i * 6 + 5] = r(); } return A; })();
const bloomR = tau => tau <= 0 ? 0 : 44 * Math.pow(1 - Math.exp(-tau / .045), .55) + 3.2 * Math.pow(Math.max(0, tau), .8);
const bloomC = (tau, o) => { const rise = 26 * (1 - Math.exp(-tau / 3)) + 3.8 * tau; o[0] = HIT[0] + WIND[0] * tau * .8; o[1] = HIT[1] + 5 + rise; o[2] = HIT[2] + WIND[2] * tau * .8; return o; };
function drawBloom(tau) {
  tau -= .0015;                                                       // (the fireball over the hole, venting up after the passage)
  if (tau <= 0) return;
  const R_ = bloomR(tau); bloomC(tau, Q);
  const d = Math.max(10, Math.hypot(Q[0] - ex, Q[1] - ey, Q[2] - ez)), ppm = FL / d;
  const n = Math.min(NBL, Math.max(1500, Math.round(R_ * R_ * ppm * ppm * 1.2)));
  const T = tau * .7;
  for (let i = 0; i < n; i++) {
    const o = i * 6, q = BL[o + 3], hs = BL[o + 4], hs2 = BL[o + 5];
    // the cloud's turbulence: each puff wanders; the cloud flattens into a cap over time (toroidal roll)
    const flat = 1 - .35 * ss(1, 12, tau), roll = ss(2, 14, tau);
    const tx = .18 * fs(T * 1.3 + hs * 40) + .12 * fs(T * 2.7 + hs2 * 30), ty = .18 * fc(T * 1.1 + hs2 * 40), tz = .18 * fc(T * 1.7 + hs * 30);
    let dx = BL[o] + tx, dy = BL[o + 1] * flat + ty, dz = BL[o + 2] + tz;
    const rr = R_ * q * (1 + .25 * roll * (1 - q));
    const x = Q[0] + dx * rr, y = Q[1] + dy * rr - roll * 18 * (1 - q) * (BL[o + 1] < 0 ? 1 : .2), z = Q[2] + dz * rr;
    // its heat: white-hot in the first instants, the core hot longest, cooling to fire, embers, then smoke
    const heat = Math.exp(-tau / (.12 + .5 * (1 - q) + .3 * hs)) ;
    const fl = .7 + .3 * fs(T * 9 + i * .37);
    if (heat > .55) dotW(x, y, z, ppm > 14 && hs < .3 ? 2 : 1, HOT, (.6 + .4 * heat) * fl);
    else if (heat > .2) dotW(x, y, z, 1, heat > .38 ? FIRE : EMB, (.45 + .5 * heat) * fl);
    else {
      // smoke: dark, lit orange from below by the fires near the base, the moon on its top
      const low = 1 - ss(0, 60, y - 6), lit = .5 + .5 * Math.max(0, BL[o + 1] * .6 + BL[o] * .35 - BL[o + 2] * .5);
      const b = (.26 + .2 * lit) * (1 - .5 * ss(30, 160, tau)) * (.7 + .3 * hs2);
      mixc(SMK, EMB, low * .5 * (1 - ss(10, 60, tau)) + heat * 1.5, CC); dotW(x, y, z, 1, CC, b);
    }
  }
  // the core's glow
  if (tau < 3) K.glowW(Q[0], Q[1] - R_ * .2, Q[2], Math.min(260, 10 + R_ * 1.6 * ppm / SPX), tau < .05 ? HOT : FIRE, .6 * Math.exp(-tau / .5) * Math.min(1, tau / .004));
}

/* ---- the debris: chunks of the midships (strike_sea.js draws their points), their smoke trails and splashes ---- */
const CH = ctx.CHUNKS;
function drawDebrisTrails(tau) {
  for (const c of CH) {
    if (tau < c.t0 || tau > c.ts) continue;
    const age = tau - c.t0, hot = c.hot * Math.exp(-age / 1.6), sp = Math.hypot(c.v[0], c.v[1], c.v[2]) * Math.exp(-c.k * age);
    if (sp < 8 && hot < .05) continue;
    const n = Math.min(40, 6 + Math.round(c.n / 30));
    for (let k = 1; k <= n; k++) {
      const ta = tau - k * Math.min(.06, age / n * 1.5); if (ta < c.t0) break;
      ctx.chunkPos(c, ta, Q);
      const u = k / n, j1 = (hz1(c.id * 97 + k) - .5) * (1 + 3 * u), j2 = (hz2(c.id * 97 + k) - .5) * (1 + 3 * u);
      const x = Q[0] + j1 + WIND[0] * (tau - ta), y = Q[1] + j2 * .6 + 2 * (tau - ta), z = Q[2] + j2 + WIND[2] * (tau - ta);
      if (hot > .2 && u < .4) dotW(x, y, z, 1, hot > .6 ? HOT : FIRE, hot * (1 - u * 2));
      else dotC(x, y, z, 1, SMK[0] + 40, SMK[1] + 40, SMK[2] + 40, .35 * (1 - u) * Math.min(1, sp / 30 + .3));
    }
  }
}
/* a splash: a crown, a jet and spray falling back, a ring on the sea; size from the chunk */
function splash(x, z, a, size, seed) {
  if (a < 0 || a > 6) return;
  const H = 4 + size * 10, Rr = 1 + size * 3, n = Math.round(80 + size * 260);
  for (let i = 0; i < n; i++) {
    const th = hz1(seed * 131 + i) * TAU, cone = hz2(seed * 131 + i), up = (.4 + .6 * (1 - cone)) * Math.sqrt(2 * G * H) * (.6 + .4 * hz1(seed + i * 7)), out = (1 + 5 * cone) * (.5 + size);
    const y = up * a - .5 * G * a * a; if (y < 0) continue;
    const rr = Rr * .5 + out * a;
    dotW(x + Math.cos(th) * rr, y, z + Math.sin(th) * rr, 1, FOAM, .55 * (1 - a / 6));
  }
  // the ring on the sea
  const rr = Rr + 3.5 * a, nr = Math.round(40 + rr * 6);
  for (let i = 0; i < nr; i++) { const th = i / nr * TAU; dotW(x + Math.cos(th) * rr, ctx.seaY(x, z, 2000, 50) + .1, z + Math.sin(th) * rr, 1, FOAM, .45 * Math.exp(-a / 2)); }
}
function drawSplashes(tau) {
  for (const c of CH) {
    const a = tau - c.ts; if (a < 0 || a > 6) continue;
    ctx.chunkPos(c, c.ts, Q); splash(Q[0], Q[2], a, Math.min(2.2, .3 + c.n / 120), c.id);
  }
}

/* ---- sparks and shrapnel: thousands of white-hot fragments flung from the hit, arcing and cooling ---- */
const NSP = 5000, SPK = (() => { const r = rng(8181), A = new Float32Array(NSP * 6); for (let i = 0; i < NSP; i++) { const u = .1 + .9 * r(), th = r() * TAU, h = Math.sqrt(1 - u * u), sp = 60 + 520 * Math.pow(r(), 2); A[i * 6] = Math.cos(th) * h * sp; A[i * 6 + 1] = u * sp; A[i * 6 + 2] = Math.sin(th) * h * sp; A[i * 6 + 3] = .4 + 2.6 * r(); A[i * 6 + 4] = r() * .003; A[i * 6 + 5] = r(); } return A; })();
function drawSparks(tau) {
  if (tau <= 0 || tau > 30) return;
  for (let i = 0; i < NSP; i++) {
    const o = i * 6, t = tau - SPK[o + 4]; if (t <= 0) continue;
    const k = SPK[o + 3], e = (1 - Math.exp(-k * t)) / k, y = HIT[1] + 3 + (SPK[o + 1] + G / k) * e - G * t / k; if (y < 0) continue;
    const x = HIT[0] + SPK[o] * e, z = HIT[2] + SPK[o + 2] * e, heat = Math.exp(-t / (.4 + 1.2 * SPK[o + 5]));
    if (heat < .03) continue;
    // a short streak along the motion
    const vx = SPK[o] * Math.exp(-k * t), vy = (SPK[o + 1] + G / k) * Math.exp(-k * t) - G / k, vz = SPK[o + 2] * Math.exp(-k * t), dt = Math.min(.004, .0015 + t * .01);
    for (let s = 0; s < 3; s++) dotW(x - vx * dt * s, y - vy * dt * s, z - vz * dt * s, 1, heat > .5 ? HOT : FIRE, heat * (1 - s * .3));
  }
}

/* ---- the plume at the entry: the sea thrown up through the wreck: a jet of water and steam, a crown, falling back ---- */
const NPJ = 9000, PJ_ = (() => { const r = rng(9393), A = new Float32Array(NPJ * 6); for (let i = 0; i < NPJ; i++) { const crown = i % 3 === 0, th = r() * TAU, cone = crown ? (.5 + .35 * r()) : Math.pow(r(), 2) * .25, sp = crown ? 25 + 70 * r() : 40 + 220 * Math.pow(r(), 1.5); A[i * 6] = Math.cos(th) * Math.sin(cone) * sp; A[i * 6 + 1] = Math.cos(cone) * sp; A[i * 6 + 2] = Math.sin(th) * Math.sin(cone) * sp; A[i * 6 + 3] = crown ? 6 + 10 * r() : 4 * r(); A[i * 6 + 4] = th; A[i * 6 + 5] = r(); } return A; })();
function drawPlume(tau) {
  const t0 = TAU_K + .001; if (tau < t0) return;
  const tt = tau - t0;
  for (let i = 0; i < NPJ; i++) {
    const o = i * 6, k = .55 + .9 * PJ_[o + 5], t = tt - .02 * PJ_[o + 5]; if (t <= 0) continue;
    const e = (1 - Math.exp(-k * t)) / k, y = (PJ_[o + 1] + G / k) * e - G * t / k; if (y < -.5) continue;
    const r0_ = PJ_[o + 3], th = PJ_[o + 4];
    const x = W_ENTRY[0] + Math.cos(th) * r0_ + PJ_[o] * e + WIND[0] * t * .5, z = W_ENTRY[2] + Math.sin(th) * r0_ + PJ_[o + 2] * e + WIND[2] * t * .5;
    const fade = 1 - ss(4, 14, t), steam = PJ_[o + 5] > .7;
    // steam lingers as a cloud (rising, spreading), water falls back as rain
    if (steam) { const sx = x + (hz1(i) - .5) * t * 3, sz = z + (hz2(i) - .5) * t * 3; dotW(sx, Math.max(0, y) + t * .8, sz, 1, STEAM, .32 * (1 - ss(6, 30, t))); }
    else dotW(x, y, z, 1, FOAM, .55 * fade * (.6 + .4 * fc(i)));
  }
}

/* ---- fire and smoke: emitters on the halves (the break faces, the decks where the flashes went), on the sea (fuel
   burning), and the cook-off; flames lick up, black smoke rolls up and leans downwind ---- */
const EM = [];
{
  const r = rng(5353);
  for (const g of [0, 1]) {
    const sg = g === 0 ? 1 : -1;
    for (let i = 0; i < 7; i++) { const y = 1 + r() * 6, w = hullW(ZF[g], y) * .8; EM.push({ g, p: [(r() * 2 - 1) * w, y, ZF[g] + sg * (.5 + r() * 2.5)], t: ctx.T_BRK + .1 + r() * .4, s: 1 + r(), H: 12 + 14 * r(), R: 3.5 + 3 * r(), smoke: 1 }); }
  }
  for (const g of [0, 1]) { const sg = g === 0 ? 1 : -1; for (let i = 0; i < 4; i++) { const z = ZF[g] + sg * (12 + 20 * r()); EM.push({ g, p: [(r() - .5) * 6, hD(z) + .3 + (r() < .5 ? 3 * r() : 0), z], t: .02 + .03 * r(), s: 1 + .8 * r(), H: 10 + 10 * r(), R: 3 + 3 * r(), smoke: 1.2 }); } }
  // fires left burning in the vents the chain blew open (bow piece), and over the hole
  for (const vt of ctx.VENTS) if (vt.up) EM.push({ g: 0, p: vt.p.slice(), t: vt.t0 + .25 + .3 * r(), s: (.8 + .5 * r()) * ctx.BLASTS[vt.b].s, H: vt.up ? 14 + 12 * r() : 6 + 6 * r(), R: vt.up ? 3 + 2 * r() : 1.6 + r(), smoke: vt.up ? 1.3 : .8 });
  // the fuel on the sea, spreading from the break
  for (let i = 0; i < 15; i++) { const a = r() * TAU, d = 6 + 70 * Math.pow(r(), .8); EM.push({ g: -1, p: [W_ENTRY[0] + Math.cos(a) * d * .8, .2, W_ENTRY[2] + Math.sin(a) * d * 1.3], t: 1.2 + 10 * r(), s: .7 + .9 * r(), H: 4 + 7 * r(), R: 7 + 15 * r(), smoke: .9, sea: true, ph: r() * 9 }); }
}
const T_COOK = ctx.T_COOK_, COOK = { g: 0, p: (() => { const c = DA.vls(4); return [c[0], c[1] + 1, c[2]]; })() };
EM.push({ g: 0, p: COOK.p.slice(), t: T_COOK, s: 2.2, H: 22, R: 4, smoke: 1.4 });
const NFP = 2600, FP = (() => { const r = rng(1212), A = new Float32Array(NFP * 4); for (let i = 0; i < NFP; i++) { A[i * 4] = r(); A[i * 4 + 1] = Math.sqrt(r()); A[i * 4 + 2] = r() * TAU; A[i * 4 + 3] = r(); } return A; })();
const NSM = 7000, SMP = (() => { const r = rng(1313), A = new Float32Array(NSM * 4); for (let i = 0; i < NSM; i++) { A[i * 4] = r(); A[i * 4 + 1] = Math.sqrt(r()); A[i * 4 + 2] = r() * TAU; A[i * 4 + 3] = r(); } return A; })();
function emPos(e, tau, o) {
  if (e.g < 0) { o[0] = e.p[0] + WIND[0] * .08 * tau; o[1] = ctx.seaY(e.p[0], e.p[2], 2000 + tau, tau) + .2; o[2] = e.p[2] + WIND[2] * .08 * tau; return o; }
  return hwAt(e.g, tau, e.p, o);
}
/* how strong an emitter burns at tau (0 before; a flare-up; settling; the sea fires spread then thin) */
function emS(e, tau) {
  const a = tau - e.t; if (a < 0) return 0;
  let s = e.s * Math.min(1, a / .3) * (1 + 1.5 * Math.exp(-a / 1.5));
  if (e.sea) s *= ss(0, 4, a) * (1 - .35 * ss(90, 500, a));
  if (e.g >= 0) { emPos(e, tau, Q3); s *= ss(-1.2, .4, Q3[1]); }            // a fire on a half goes out under the sea
  return s;
}
const SEM = EM.filter(e => e.sea);
const NHS = 24, HSS = new Float64Array(NHS), HSP = new Float64Array(NHS * 3);
function drawFires(tau) {
  const T = tau;
  for (let ei = 0; ei < EM.length; ei++) {
    const e = EM[ei], st = emS(e, tau); if (st <= 0) continue;
    emPos(e, tau, Q);
    const d = Math.max(5, Math.hypot(Q[0] - ex, Q[1] - ey, Q[2] - ez)), ppm = FL / d;
    if (!K.wIn(Q[0], Q[1] + e.H, Q[2], e.H * 2 + e.R * 3)) { /* the smoke may still show */ }
    else {
      // flames
      // (as many flame dots as the fire's size on screen asks: dense licking sheets, not a scatter)
      const n = Math.min(NFP, Math.round(Math.max((80 + 700 * st) * Math.min(1.6, .45 + ppm * .06 / SPX), e.R * e.H * st * ppm * ppm / SPX / SPX * .6)));
      K.glowW(Q[0], Q[1] + e.H * .3, Q[2], Math.min(420, e.R * 2.4 * ppm / SPX), FIRE, Math.min(.4, .22 * st));
      const Lf = .9;
      for (let i = 0; i < n; i++) {
        const o = i * 4, ph = FP[o], life = Lf * (.6 + .8 * FP[o + 3]);
        const a = ((T * (e.sea ? 1 : 1) + ph * life + ei * .37) % life + life) % life, u = a / life;
        // (licking tongues: each dot rises in one of a few narrow tongues spread over the fire's area)
        const nt = e.sea ? 6 + Math.round(e.R * .8) : 3 + Math.round(e.R), tg = i % nt, tr = e.R * Math.sqrt(hz1(ei * 131 + tg)), ta = hz2(ei * 131 + tg) * TAU;
        const rr = (.35 + .25 * e.R / nt) * FP[o + 1] * (1 - .7 * u) * 2.2, th = FP[o + 2];
        const tcx = Math.cos(ta) * tr, tcz = Math.sin(ta) * tr;
        const lick = e.H * st * (.3 + .7 * FP[o + 3]) * Math.pow(u, .85);
        const tw = .9 * fs(T * 5 + i * .7 + ei) * u * (1 + e.R * .2);
        const x = Q[0] + tcx + Math.cos(th) * rr + tw + WIND[0] * .15 * a * 4, y = Q[1] + lick * (.7 + .6 * hz1(ei * 77 + tg)), z = Q[2] + tcz + Math.sin(th) * rr + .7 * fc(T * 4.3 + i) * u + WIND[2] * .15 * a * 4;
        const fl = .65 + .35 * fs(T * 17 + i * 1.3);
        dotW(x, y, z, u < .3 && st > .5 ? 2 : 1, u < .22 ? HOT : u < .6 ? FIRE : EMB, (1 - u * .8) * fl * Math.min(1, .5 + st * .5));
      }
    }
    // smoke: born over the flames at its emitter's position then, rising and leaning downwind, widening
    const ns = Math.round(NSM * Math.min(1, (e.sea ? .17 : e.s > .9 ? .2 : .08) * e.smoke * Math.min(1.4, st + .3)));
    const Ls = 70;
    for (let k = 0; k < NHS; k++) { const ak = Ls * (k / (NHS - 1)) ** 2; HSS[k] = emS(e, tau - ak); if (HSS[k] > 0) { emPos(e, tau - ak, Q2); HSP[k * 3] = Q2[0]; HSP[k * 3 + 1] = Q2[1]; HSP[k * 3 + 2] = Q2[2]; } }
    for (let i = 0; i < ns; i++) {
      const o = i * 4, a0_ = ((T / Ls + SMP[o] + ei * .137) % 1 + 1) % 1, a = Ls * a0_ * a0_; if (a > tau - e.t) continue;
      const kf = a0_ * (NHS - 1), k0 = Math.min(NHS - 2, kf | 0), w = kf - k0;
      const s0 = HSS[k0] * (1 - w) + HSS[k0 + 1] * w; if (s0 <= 0 || HSS[k0] <= 0 || HSS[k0 + 1] <= 0) continue;
      Q2[0] = HSP[k0 * 3] * (1 - w) + HSP[k0 * 3 + 3] * w; Q2[1] = HSP[k0 * 3 + 1] * (1 - w) + HSP[k0 * 3 + 4] * w; Q2[2] = HSP[k0 * 3 + 2] * (1 - w) + HSP[k0 * 3 + 5] * w;
      const rise = 6 * a / (1 + a * .045) * (.7 + .3 * e.smoke) + e.H * .6, spread = e.R * .6 + 1.4 * Math.pow(a, .9) * (.5 + .5 * SMP[o + 3]);
      const th = SMP[o + 2], q = SMP[o + 1];
      const x = Q2[0] + WIND[0] * a + Math.cos(th) * spread * q + 2 * fs(a * .3 + i), y = Q2[1] + rise + spread * .4 * fs(th * 3 + a * .2) * q, z = Q2[2] + WIND[2] * a + Math.sin(th) * spread * q;
      const low = Math.exp(-a / 2.5);
      mixc(SMK, EMB, low * .7, CC);
      dotW(x, y, z, 1, CC, (.34 + .26 * low) * (1 - ss(35, Ls, a)) * Math.min(1, s0 + .3) * (.6 + .4 * SMP[o + 3]));
    }
  }
}
/* the cook-off: a magazine cell going up in the bow section, a fireball, fragments, a flash */
function drawCook(tau) {
  const a = tau - T_COOK; if (a < 0 || a > 25) return;
  hwAt(0, tau, COOK.p, Q);
  const R_ = 20 * Math.pow(1 - Math.exp(-a / .25), .6) + 2 * a, n = 4000;
  for (let i = 0; i < n; i++) {
    const o = (i % NBL) * 6, q = BL[o + 3], heat = Math.exp(-a / (.5 + .8 * (1 - q)));
    const x = Q[0] + BL[o] * R_ * q, y = Q[1] + 4 * a + Math.abs(BL[o + 1]) * R_ * q * 1.2, z = Q[2] + BL[o + 2] * R_ * q;
    if (heat > .5) dotW(x, y, z, 1, HOT, .8);
    else if (heat > .15) dotW(x, y, z, 1, heat > .3 ? FIRE : EMB, .7);
    else dotW(x, y + a * 2, z, 1, SMK, .3 * (1 - a / 25));
  }
  for (let i = 0; i < 900; i++) {
    const o = i * 6, t = a, k = 1.2, e = (1 - Math.exp(-k * t)) / k, vs = .35;
    const y = Q[1] + (SPK[o + 1] * vs + G / k) * e - G * t / k; if (y < 0) continue;
    const ht = Math.exp(-t / 1.5);
    dotW(Q[0] + SPK[o] * vs * e, y, Q[2] + SPK[o + 2] * vs * e, 1, ht > .4 ? HOT : FIRE, .8 * ht + .1);
  }
  if (a < 2) K.glowW(Q[0], Q[1] + 6, Q[2], 160, FIRE, .9 * Math.exp(-a / .6));
}

/* ---- the break faces: what the cut shows (decks, bulkheads, frames, machinery, torn and bent), glowing at first; the
   sea pouring into the open sections ---- */
const FD_ = [[], []];
{
  const r = rng(3434);
  for (const g of [0, 1]) {
    const sg = g === 0 ? 1 : -1, zf = ZF[g], A_ = FD_[g];
    const push = (x, y, z, k) => A_.push(x, y, z, k);
    // decks across the section (2nd, 3rd, the inner bottom), their torn edges jagged and bent down at the cut
    for (const yd of [-4.4, -1.2, 2.2, 4.6]) {
      for (let dz = 0; dz < 9; dz += 1.6) for (let x = -12; x <= 12; x += .09) {
        const w = hullW(zf + sg * dz, yd); if (Math.abs(x) > w - .1) continue;
        const jag = 1.3 * Math.abs(noise(x * .5 + g * 7, yd)) + .5 * Math.abs(Math.sin(x * 3.1 + yd));
        if (dz === 0) push(x, yd - .9 * Math.max(0, 1 - jag), zf + sg * jag * .6, 1);
        else if (r() < .35) push(x, yd, zf + sg * (dz + jag * .5), 2);
      }
    }
    // a bulkhead stub, frames, pipes, cable runs: torn ends sticking out into the gap
    for (let i = 0; i < 90; i++) {
      const y = -5 + r() * 11, w = hullW(zf, y), x = (r() * 2 - 1) * (w - .3), L = .5 + 2.6 * r(), dx = (r() - .5) * .8, dy = (r() - .7) * .8;
      for (let s = 0; s <= L; s += .05) push(x + dx * s, y + dy * s, zf - sg * s * .9, s > L - .2 ? 1 : 3);
    }
    // machinery in the section: gas-turbine casings and reduction gear (stern half: the engine rooms lie amidships)
    const nm = g === 1 ? 3 : 1;
    for (let m = 0; m < nm; m++) {
      const cx = (m - (nm - 1) / 2) * 5.2, cy = -2.6, rr = 1.6;
      for (let s = 0; s < 7; s += .3) for (let k = 0; k < 40; k++) { const th = k / 40 * TAU; if (r() < .5) push(cx + Math.cos(th) * rr * (1 - .1 * s / 7), cy + Math.sin(th) * rr, zf - sg * (s + .3), s < .4 ? 1 : 3); }
    }
  }
}
const FDB = FD_.map(a => new Float32Array(a));
function drawFaces(tau) {
  if (tau <= 0) return;
  const heat = Math.exp(-tau / 2.5), ember = .25 + .15 * fs(tau * 3);
  for (const g of [0, 1]) {
    const A_ = FDB[g], n = A_.length / 4;
    for (let i = 0; i < n; i++) {
      const j = i * 4; hw(g, [A_[j], A_[j + 1], A_[j + 2]], Q);
      const k = A_[j + 3];
      let b = k === 1 ? .75 : k === 3 ? .55 : .35, col = WH;
      if (k === 1 && heat > .05) { col = heat > .5 ? HOT : FIRE; b = .6 + .4 * heat; } else if (k === 1 && tau > 2) { col = EMB; b = ember; }
      if (Q[1] < 0) b *= ctx.isUnder() ? .8 : Math.exp(Q[1] / 2.5);
      dotW(Q[0], Q[1], Q[2], 1, col, b);
    }
  }
}
/* the sea pouring in: where the waterline crosses a face, sheets of water spilling in and falling to the flooding
   level inside; foam boiling at the face's foot */
function drawInflow(tau) {
  if (tau < .3) return;
  for (const g of [0, 1]) {
    const sg = g === 0 ? 1 : -1, zf = ZF[g];
    // the face's local y where the world y is 0 (by bisection up the face's centreline)
    let lo = -6, hi = 8; hw(g, [0, lo, zf], Q); if (Q[1] > 0) continue; hw(g, [0, hi, zf], Q); const top = Q[1];
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; hw(g, [0, m, zf], Q); if (Q[1] < 0) lo = m; else hi = m; }
    const yw = (lo + hi) / 2, w = hullW(zf, yw) * .95, inD = hdir(g, [0, 0, sg], Q3);
    const flood = top < 0 ? 0 : 1;
    const n = 5200;
    for (let i = 0; i < n; i++) {
      const life = 1.4 + .8 * hz1(i), a = ((tau + hz2(i) * life) % life), x = (hz1(i * 3 + 1) * 2 - 1) * w;
      hw(g, [x, yw + .2, zf + sg * .3], Q);
      const vin = 3 + 4 * hz2(i * 5);
      const px = Q[0] + inD[0] * vin * a + (hz1(i * 7) - .5) * .6, py = Q[1] + inD[1] * vin * a - .5 * G * a * a + .4 * hz1(i * 11), pz = Q[2] + inD[2] * vin * a;
      if (py < Q[1] - 5.5) continue;
      dotW(px, py, pz, 1, FOAM, (.75 * flood + .35) * (1 - .7 * a / life) * (.7 + .3 * fs(tau * 13 + i)));
    }
    // foam and spray churning at the face's foot on the outside
    for (let i = 0; i < 900; i++) { const x = (hz1(i * 13) * 2 - 1) * (w + 3), d = hz2(i * 13) * 6; hw(g, [x, yw, zf - sg * d], Q); dotW(Q[0], ctx.seaY(Q[0], Q[2], 2000 + tau, tau) + .15 + .5 * hz1(i + Math.floor(tau * 8)), Q[2], 1, FOAM, .5 * (1 - d / 6)); }
  }
}

/* ---- the debris field: wreckage afloat (panels, rafts, fenders, cabling, insulation), scattered round the wreck
   where the lighter pieces came down, drifting, riding the swell; a few still burning ---- */
const NFLT = 420, FLT = [];
{
  const r = rng(6767);
  for (let i = 0; i < NFLT; i++) {
    const c = CH[(r() * CH.length) | 0];
    let x, z, t;
    if (c && c.ts < 60 && r() < .6) { ctx.chunkPos(c, c.ts, Q); x = Q[0] + (r() - .5) * 14; z = Q[2] + (r() - .5) * 14; t = c.ts + .5; }
    else { const a = r() * TAU, d = 12 + 110 * Math.pow(r(), 1.4); x = W_ENTRY[0] + Math.cos(a) * d; z = W_ENTRY[2] + Math.sin(a) * d * 1.3; t = 2 + 18 * r(); }
    FLT.push({ x, z, t, w: .4 + 2.8 * Math.pow(r(), 2), h: .3 + 1.2 * r(), yaw: r() * TAU, k: (r() * 4) | 0, burn: r() < .06, ph: r() * TAU });
  }
}
function drawFloat(tau, T) {
  for (let i = 0; i < NFLT; i++) {
    const f = FLT[i]; if (tau < f.t) continue;
    const a = tau - f.t, x0 = f.x + WIND[0] * .12 * a, z0 = f.z + WIND[2] * .12 * a;
    if (!K.wIn(x0, 0, z0, 4)) continue;
    const y0 = ctx.seaY(x0, z0, T, tau) + .05, cy = Math.cos(f.yaw + a * .02), sy = Math.sin(f.yaw + a * .02);
    const tl = .15 * Math.sin(T * .9 + f.ph), d = Math.hypot(x0 - ex, y0 - ey, z0 - ez), step = Math.max(.08, d / FL * 1.6);
    const b = .45 * ss(0, 2, a);
    // its outline (a panel, a raft, a spar, a tangle), sampled at the screen's spacing
    const L = f.k === 2 ? f.w * 2 : f.w, H = f.k === 2 ? .15 : f.h;
    const n = Math.max(4, Math.min(80, Math.round((L + H) * 2 / step)));
    for (let k = 0; k < n; k++) {
      const u = k / n * 4, sd = u | 0, fr = u - sd, cu = [[-1, -1], [1, -1], [1, 1], [-1, 1]], A_ = cu[sd], B_ = cu[(sd + 1) % 4];
      const lx = (A_[0] + (B_[0] - A_[0]) * fr) * L * .5, lz = (A_[1] + (B_[1] - A_[1]) * fr) * H * .5;
      dotW(x0 + cy * lx - sy * lz, y0 + tl * lx * .3, z0 + sy * lx + cy * lz, 1, WH, b);
    }
    if (f.burn && a < 80) for (let k = 0; k < 30; k++) { const ag = ((T * 1.4 + hz1(i * 31 + k)) % 1); dotW(x0 + (hz2(i + k) - .5) * L, y0 + ag * 2.5, z0 + (hz1(i * 7 + k) - .5) * H, 1, ag < .3 ? HOT : FIRE, (1 - ag) * .8); }
  }
}


/* ================= the passage: the rod cutting down through the ship (x1/2000) ================= */
const Y_KEEL = ctx.Y_KEEL, U_ = ctx.U2(), W_ = ctx.W2();
/* the plates it cuts: the main deck, the 2nd and 3rd decks, the inner bottom, the keel (path distance, when) */
const PNAME = ['Main deck', '2nd deck', '3rd deck', 'Inner bottom', 'Keel'];
const PLATES = [HIT[1], 2.2, -1.2, -4.4, Y_KEEL].map((y, i) => { const s_ = (y - HIT[1]) / DIR[1]; return { i, y, s: s_, t: s_ / 4850, p: ctx.ptS(s_) }; });
const holeG = tau => tau <= 0 ? 0 : Math.pow(E.sat(tau / .005), .6);
const pDist = (p) => Math.max(1, Math.hypot(p[0] - ex, p[1] - ey, p[2] - ez));
/* the ejecta: incandescent steel thrown back up the path and out over the deck (a cone round the reversed path),
   0.3-3.6 km/s, drag-slowed droplets cooling white -> orange -> red in a fraction of a second */
const NEJ = 11000, EJ = (() => {
  const r = rng(3131), A = new Float32Array(NEJ * 8);
  for (let i = 0; i < NEJ; i++) {
    const th = .2 + 1.15 * Math.pow(r(), .7), az = r() * TAU, c = Math.cos(th), sn = Math.sin(th), ca = Math.cos(az), sa = Math.sin(az);
    let dx = -DIR[0] * c + (U_[0] * ca + W_[0] * sa) * sn, dy = -DIR[1] * c + (U_[1] * ca + W_[1] * sa) * sn, dz = -DIR[2] * c + (U_[2] * ca + W_[2] * sa) * sn;
    if (dy < .06) dy = .06 + (.06 - dy) * .5;
    const l = Math.hypot(dx, dy, dz), sp = 300 + 3300 * Math.pow(r(), 2.2);
    A[i * 8] = dx / l * sp; A[i * 8 + 1] = dy / l * sp; A[i * 8 + 2] = dz / l * sp; A[i * 8 + 3] = 25 + 110 * r(); A[i * 8 + 4] = .00004 + .0005 * Math.pow(r(), 1.5); A[i * 8 + 5] = .12 + .7 * r(); A[i * 8 + 6] = r();
  }
  return A;
})();
function drawEjecta(tau) {
  if (tau <= 0 || tau > 3) return;
  for (let i = 0; i < NEJ; i++) {
    const o = i * 8, t = tau - EJ[o + 4]; if (t <= 0) continue;
    const u = t / EJ[o + 5]; if (u > 1.4) continue;
    const k = EJ[o + 3], e = (1 - Math.exp(-k * t)) / k, vx = EJ[o], vy = EJ[o + 1], vz = EJ[o + 2], vl = Math.hypot(vx, vy, vz);
    const x = HIT[0] + vx * e, y = HIT[1] + vy * e - 4.9 * t * t, z = HIT[2] + vz * e;
    const sl = Math.min(3, vl * Math.exp(-k * t) * .0008) / vl;
    const col = u < .2 ? HOT : u < .55 ? FIRE : EMB, a = (u < 1 ? 1 - .6 * u : 1 - u * .6 - (u - 1) * 1.5) * (.6 + .4 * EJ[o + 6]);
    for (let q = 0; q < 6; q++) { const w = sl * q / 6; dotW(x - vx * w, y - vy * w, z - vz * w, 1, col, Math.min(1, a * 1.15) * (1 - q * .13)); }
  }
}
/* behind each plate it cuts, a cloud of its fragments: a cap running on down the path and a shell spreading out
   (the debris cloud behind a perforated plate) */
const NSPL = 3200, SPL = (() => {
  const r = rng(3232), A = new Float32Array(5 * NSPL * 6);
  for (let p_ = 0; p_ < 5; p_++) for (let i = 0; i < NSPL; i++) {
    const th = .95 * Math.pow(r(), .8), az = r() * TAU, c = Math.cos(th), sn = Math.sin(th), ca = Math.cos(az), sa = Math.sin(az), sp = (900 + 2600 * r()) * (1 - .45 * th / .95), o = (p_ * NSPL + i) * 6;
    A[o] = (DIR[0] * c + (U_[0] * ca + W_[0] * sa) * sn) * sp; A[o + 1] = (DIR[1] * c + (U_[1] * ca + W_[1] * sa) * sn) * sp; A[o + 2] = (DIR[2] * c + (U_[2] * ca + W_[2] * sa) * sn) * sp;
    A[o + 3] = 30 + 120 * r(); A[o + 4] = .1 + .5 * r(); A[o + 5] = r();
  }
  return A;
})();
function drawSpall(tau) {
  for (const pl of PLATES) {
    const t0 = tau - pl.t; if (t0 <= 0 || t0 > 1) continue;
    for (let i = 0; i < NSPL; i++) {
      const o = (pl.i * NSPL + i) * 6, u = t0 / SPL[o + 4]; if (u > 1.3) continue;
      const k = SPL[o + 3], e = (1 - Math.exp(-k * t0)) / k, x = pl.p[0] + SPL[o] * e, y = pl.p[1] + SPL[o + 1] * e, z = pl.p[2] + SPL[o + 2] * e;
      if (y < Y_KEEL - .8) continue;
      dotW(x, y, z, 1, u < .3 ? HOT : u < .65 ? FIRE : EMB, Math.min(1, (u < 1 ? 1.2 - .5 * u : 1.7 - u) * (.6 + .4 * SPL[o + 5])));
    }
  }
}
/* each plate's flash as it is cut, and the hole's rim in it glowing (a ring round the path, opening with the hole) */
function drawPierce(tau) {
  const sn = ctx.noseS(tau), hg = holeG(tau);
  for (const pl of PLATES) {
    const a = tau - pl.t; if (a < 0 || a > .08) continue;
    const d = pDist(pl.p);
    if (a < .003) { K.glowW(pl.p[0], pl.p[1], pl.p[2], Math.min(260, 8 * FL / d / SPX), HOT, .95 * Math.exp(-a / .0003)); K.glowW(pl.p[0], pl.p[1], pl.p[2], Math.min(360, 16 * FL / d / SPX), FIRE, .5 * Math.exp(-a / .0008)); }
    const R_ = Math.max(.2, ctx.holeR(pl.y) * hg * E.sat((sn - pl.s) / 2.5)), xp = ctx.xPath(pl.y), zp = ctx.zPath(pl.y);
    const n = Math.min(900, Math.round(TAU * R_ * FL / d / SPX / 1.2) + 24), h = Math.exp(-a / .02);
    for (let k = 0; k < n; k++) { const th = k / n * TAU + hz1(k) * .05, rr = R_ * (1 + .12 * (hz2(k * 3 + pl.i) - .5)); dotW(xp + Math.cos(th) * rr, pl.y + (hz1(k * 7) - .5) * .25, zp + Math.sin(th) * rr, 1, h > .6 ? HOT : h > .25 ? FIRE : EMB, .35 + .6 * h); }
  }
}
/* the decks inside (seen through the cutaway): plates and two bulkheads round the path, cut by the hole as it opens */
const IDK = (() => {
  const A = [], r = rng(3535), sp = .24;
  for (const y of [2.2, -1.2, -4.4]) { const zp = ctx.zPath(y); for (let z = zp - 16; z <= zp + 16; z += sp) { const w = ctx.hullHW(z, y) - .15; for (let x = -w; x <= w; x += sp) A.push(x + (r() - .5) * .08, y, z + (r() - .5) * .08, 0); } }
  for (const zb of [ctx.zPath(0) - 10, ctx.zPath(0) + 10]) for (let y = Y_KEEL + .3; y < hD(zb) - .2; y += sp) { const w = ctx.hullHW(zb, y) - .15; for (let x = -w; x <= w; x += sp) A.push(x, y, zb, 1); }
  return new Float32Array(A);
})();
function drawDecks(tau, cutA) {
  if (cutA < .02) return;
  const sn = ctx.noseS(tau), hg = holeG(tau), pl = Math.exp(-Math.max(0, tau) / .012) * (tau > 0 ? 1 : 0);
  for (let i = 0; i < IDK.length; i += 4) {
    const x = IDK[i], y = IDK[i + 1], z = IDK[i + 2];
    const xp = ctx.xPath(y), zp = ctx.zPath(y), d = Math.hypot(x - xp, z - zp), sy = (y - HIT[1]) / DIR[1];
    let b = (IDK[i + 3] ? .34 : .5) * cutA, col = WH;
    if (hg > 0) { const R_ = ctx.holeR(y) * hg * E.sat((sn - sy) / 2.5); if (d < R_) continue; if (d < R_ + 1.2 && R_ > .1) { const h = (1 - (d - R_) / 1.2) * Math.min(1, .3 + Math.exp(-tau / .05)); b = Math.max(b, .7 * h); col = h > .6 ? HOT : FIRE; } }
    if (pl > .02) { const w = pl * 40 / (40 + d * d); if (w > .02) { b += w; if (col === WH) col = FIRE; } }
    dotW(x, y, z, 1, col, b);
  }
}
/* the plasma the rod leaves in the hull: a white-hot column round its path, swelling to ~4.5 m, cooling into the
   fireball that fills the hull (and runs forward to the magazine) */
function drawPlasma(tau) {
  if (tau <= 0 || tau > .15) return;
  const sn = Math.min(ctx.noseS(tau), ctx.S_SHIP + 1.5);
  const d = pDist(ctx.ptS(sn * .5)), n = Math.min(30000, Math.max(6000, Math.round(sn * 6 * FL * FL / d / d / SPX / SPX * 14)));
  for (let i = 0; i < n; i++) {
    const s_ = hz1(i * 3 + 1) * sn, age = tau - s_ / 4850; if (age < 0) continue;
    const I = Math.exp(-age / .014); if (I < .03) continue;
    const R_ = .25 + 5 * (1 - Math.exp(-age / .0018)), q = Math.sqrt(hz2(i * 3 + 2)), th = hz1(i * 7 + 5) * TAU + age * 300;
    ctx.ptS(s_, Q); const cs = Math.cos(th) * R_ * q, sn2 = Math.sin(th) * R_ * q;
    dotW(Q[0] + U_[0] * cs + W_[0] * sn2, Q[1] + U_[1] * cs + W_[1] * sn2, Q[2] + U_[2] * cs + W_[2] * sn2, 1, q < .6 && I > .4 ? HOT : I > .2 ? FIRE : EMB, Math.min(1, I * (1.5 - .6 * q)));
  }
}
/* the fire the rod leaves in the hull: from its path it fills the compartments, running forward along the keel to
   the magazine (3 km/s, ahead of nothing but the chain) and aft (1.4 km/s), white at its front, cooling behind it */
const NHF = 26000, HF = (() => { const r = rng(3838), A = new Float32Array(NHF * 4); for (let i = 0; i < NHF; i++) { A[i * 4] = r(); A[i * 4 + 1] = r() * 2 - 1; A[i * 4 + 2] = Math.pow(r(), .8); A[i * 4 + 3] = r(); } return A; })();
const HF_Z0 = ctx.zPath(0), HF_VF = 3000, HF_VA = 1400, HF_ZF = 58, HF_ZA = -26;
function hullFireFront(tau) { return [Math.min(HF_ZF, HF_Z0 + HF_VF * tau), Math.max(HF_ZA, HF_Z0 - HF_VA * tau)]; }
function drawHullFire(tau) {
  if (tau <= 0 || tau > 1.2) return;
  const fr = hullFireFront(tau), T = tau * 40;
  for (let i = 0; i < NHF; i++) {
    const o = i * 4, fw = HF[o + 3] < .72, u = fw ? HF[o + 3] / .72 : (HF[o + 3] - .72) / .28;
    const z = fw ? HF_Z0 + (fr[0] - HF_Z0) * Math.pow(u, .75) : HF_Z0 + (fr[1] - HF_Z0) * Math.pow(u, .75);
    const age = tau - Math.abs(z - HF_Z0) / (fw ? HF_VF : HF_VA); if (age < 0) continue;
    const heat = Math.exp(-age / (.03 + .05 * HF[o + 2])) * (1 - .6 * ss(.15, 1.2, tau)); if (heat < .04) continue;
    const top = hD(z) - .6, yb = Y_KEEL + .5, y = fw && HF[o + 2] < .55 ? yb + (top - yb) * HF[o + 2] * .55 : yb + (top - yb) * HF[o + 2];
    const w = ctx.hullHW(z, y) * .9, x = HF[o + 1] * w + .4 * fs(T + i * .7), yy = Math.max(Y_KEEL + .4, y + .4 * fc(T * 1.3 + i));
    const front = Math.exp(-age / .004);
    dotW(x, yy, z, 1, front > .4 || heat > .75 ? HOT : heat > .3 ? FIRE : EMB, Math.min(1, .3 + .8 * heat + .4 * front));
  }
}
/* fire venting back up out of the entry hole: a jet up the reversed path and up, slowing, cooling to smoke */
const NJT = 6000, JT = (() => {
  const r = rng(3636), A = new Float32Array(NJT * 8), ax = V.norm(V.add(V.mul(DIR, -.5), [0, .7, 0])), pa = V.norm(V.cross(ax, [1, 0, 0])), pb = V.cross(ax, pa);
  for (let i = 0; i < NJT; i++) {
    const th = .5 * Math.pow(r(), .8), az = r() * TAU, c = Math.cos(th), sn = Math.sin(th), sp = 180 + 1300 * Math.pow(r(), 1.5);
    for (let k = 0; k < 3; k++) A[i * 8 + k] = (ax[k] * c + (pa[k] * Math.cos(az) + pb[k] * Math.sin(az)) * sn) * sp;
    A[i * 8 + 3] = 5 + 20 * r(); A[i * 8 + 4] = .0005 + .007 * Math.pow(r(), 1.3); A[i * 8 + 5] = .1 + .6 * r(); A[i * 8 + 6] = r(); A[i * 8 + 7] = r();
  }
  return A;
})();
function drawJet(px, py, pz, A, N, tau, t0, sc, life) {
  // a jet of fire from (px py pz): each particle drag-slowed (linear), cooling HOT -> FIRE -> EMB, then a smoke puff
  // rising and spreading on the breeze; life: how long the smoke lasts (s)
  for (let i = 0; i < N; i++) {
    const o = i * 8, t = tau - t0 - A[o + 4]; if (t <= 0) continue;
    const L = A[o + 5], u = t / L; if (t > L + life) continue;
    const k = A[o + 3], e = (1 - Math.exp(-k * t)) / k;
    let x = px + A[o] * sc * e, y = py + A[o + 1] * sc * e, z = pz + A[o + 2] * sc * e;
    if (u < 1) { const h = 1 - u; dotW(x, y, z, 1, h > .75 ? HOT : h > .35 ? FIRE : EMB, (.45 + .55 * h) * (.6 + .4 * A[o + 6])); }
    else {
      const a = t - L, sp = 1 + 1.6 * Math.pow(a, .8);
      x += WIND[0] * a + (A[o + 6] - .5) * sp; y += 5 * a / (1 + .06 * a) + (A[o + 7] - .5) * sp * .6; z += WIND[2] * a + (A[o + 7] - .5) * sp;
      const lo = Math.exp(-a / 2);
      mixc(SMK, EMB, lo * .6, CC); dotW(x, y, z, 1, CC, (.3 + .2 * lo) * (1 - a / life) * (.6 + .4 * A[o + 6]));
    }
  }
}
/* ================= the magazine chain ================= */
const BLS = ctx.BLASTS, VTS = ctx.VENTS;
const NVJ = 1600, VJ = (() => { const r = rng(3737), A = new Float32Array(NVJ * 8 * 2);
  // two shapes: a deck vent's jet (up, a little out) and a side vent's (out of the hull side, rising)
  for (let s_ = 0; s_ < 2; s_++) for (let i = 0; i < NVJ; i++) {
    const th = (s_ ? .6 : .48) * Math.pow(r(), .8), az = r() * TAU, c = Math.cos(th), sn = Math.sin(th), sp = 500 + 2600 * Math.pow(r(), 1.4), o = (s_ * NVJ + i) * 8;
    // (axis +Y for a deck vent, +X for a side vent: oriented at draw)
    A[o] = sn * Math.cos(az) * sp; A[o + 1] = c * sp; A[o + 2] = sn * Math.sin(az) * sp;
    A[o + 3] = 30 + 70 * r(); A[o + 4] = .008 * Math.pow(r(), 1.2); A[o + 5] = .15 + .9 * r(); A[o + 6] = r(); A[o + 7] = r();
  }
  return A;
})();
const VJW = new Float32Array(NVJ * 8);
function drawChain(tau) {
  // the core of each blast: a flash inside the hull and a ball of fire filling the compartments round it
  for (const B of BLS) {
    const a = tau - B.t; if (a < 0) continue;
    const d = pDist(B.c), s_ = B.s;
    if (a < .006) K.glowW(B.c[0], B.c[1] + 2, B.c[2], Math.min(260, 9 * s_ * FL / d / SPX), HOT, .95 * Math.exp(-a / .0008));
    if (a < .4) {
      const Ri = 7.5 * s_ * Math.pow(1 - Math.exp(-a / .002), .5), I = Math.exp(-a / .06), n = Math.min(4000, Math.max(500, Math.round(Ri * Ri * FL * FL / d / d / SPX / SPX * 2)));
      const hw0 = ctx.hullHW(B.c[2], 0) - .2, top = hD(B.c[2]);
      for (let i = 0; i < n; i++) { const o = (i * 7 + B.k * 991) % NBL * 6, q = BL[o + 3], x = B.c[0] + BL[o] * Ri * q, y = B.c[1] + BL[o + 1] * Ri * q * .7, z = B.c[2] + BL[o + 2] * Ri * q; if (y < Y_KEEL + .3 || y > top + .5 || Math.abs(x) > hw0) continue; dotW(x, y, z, 1, q < .6 && I > .5 ? HOT : I > .2 ? FIRE : EMB, Math.min(1, I * (1.3 - .4 * q))); }
    }
    // later: the fireball it vents through the deck, buoyant, rolling up into black smoke
    if (a > .004) {
      const vt = VTS[B.k * 2] && VTS[B.k * 2].b === B.k ? VTS[B.k * 2] : null;
      const vp = vt ? vt.p : B.c;
      ball(vp[0] + WIND[0] * a * .6, vp[1] + 2 + 20 * (1 - Math.exp(-a / .7)) + 7 * a / (1 + .05 * a), vp[2] + WIND[2] * a * .6, 15 * s_ * Math.pow(1 - Math.exp(-a / .16), .6) + 2.4 * Math.pow(a, .85), a, 2.0 + 1.3 * s_, B.k * 1777, 6000);
    }
  }
  // the jets of fire out of the vents the chain blows open
  for (const vt of VTS) {
    const a = tau - vt.t0; if (a <= 0 || a > 40) continue;
    const s_ = BLS[vt.b].s, side = vt.up ? 0 : 1, sx = Math.sign(vt.p[0]) || 1, n = Math.round(NVJ * Math.min(1, .55 + .35 * s_));
    // orient the jet's samples (axis +Y, or +X tilted up for a side vent)
    const o0 = side * NVJ * 8;
    for (let i = 0; i < n; i++) {
      const o = o0 + i * 8, w = i * 8, ax = VJ[o], ay = VJ[o + 1], az = VJ[o + 2];
      if (side) { VJW[w] = ay * sx * .95; VJW[w + 1] = ax * .5 + ay * .3; VJW[w + 2] = az; } else { VJW[w] = ax + vt.p[0] * .02 * ay; VJW[w + 1] = ay; VJW[w + 2] = az; }
      for (let k = 3; k < 8; k++) VJW[w + k] = VJ[o + k];
    }
    drawJet(vt.p[0], vt.p[1], vt.p[2], VJW, n, tau, vt.t0, .55 + .45 * s_, 14);
  }
}
/* a fireball (the bloom's look) at c, radius R, age a (s); hk: how long it stays hot; seed; at most nmax points */
function ball(cx_, cy_, cz_, R_, a, hk, seed, nmax) {
  if (R_ < .2) return;
  const d = Math.max(5, Math.hypot(cx_ - ex, cy_ - ey, cz_ - ez)), ppm = FL / d;
  const n = Math.min(nmax, Math.max(600, Math.round(R_ * R_ * ppm * ppm * 1.1)));
  const roll = ss(.8, 8, a), T = a * .8;
  // (its luminous body: a soft glow while it burns)
  { const hc = Math.exp(-a / (hk * .9)); if (hc > .03) K.glowW(cx_, cy_, cz_, Math.min(520, R_ * 1.5 * ppm / SPX), hc > .5 ? HOT : FIRE, .42 * hc); }
  for (let i = 0; i < n; i++) {
    const o = ((i * 13 + seed) % NBL) * 6, q = BL[o + 3], hs = BL[o + 4], hs2 = BL[o + 5];
    const tx = .18 * fs(T * 1.3 + hs * 40) + .12 * fs(T * 2.7 + hs2 * 30), ty = .18 * fc(T * 1.1 + hs2 * 40), tz = .18 * fc(T * 1.7 + hs * 30);
    const rr = R_ * q * (1 + .25 * roll * (1 - q));
    const x = cx_ + (BL[o] + tx) * rr, y = cy_ + (BL[o + 1] * (1 - .3 * roll) + ty) * rr - roll * R_ * .35 * (1 - q) * (BL[o + 1] < 0 ? 1 : .2), z = cz_ + (BL[o + 2] + tz) * rr;
    const heat = Math.exp(-a / (hk * (.25 + .75 * (1 - q)) + .2 * hs));
    const fl = .72 + .28 * fs(T * 9 + i * .37);
    if (heat > .55) dotW(x, y, z, 1, HOT, (.55 + .45 * heat) * fl);
    else if (heat > .18) dotW(x, y, z, 1, heat > .36 ? FIRE : EMB, (.42 + .5 * heat) * fl);
    else { const lit = .5 + .5 * Math.max(0, BL[o + 1] * .6 + BL[o] * .3); mixc(SMK, EMB, heat * 2.2, CC); dotW(x, y, z, 1, CC, (.24 + .18 * lit) * (1 - .6 * ss(20, 90, a)) * (.7 + .3 * hs2)); }
  }
}
/* ================= the railgun mount, thrown by the blast under it ================= */
/* (the host's mount is hidden from MOUNT_T: drawn here, the act-1 model, on a ballistic arc, tumbling, burning) */
const MV = [ctx.CSIDE * 5, 38, 7], MW = [.55, .2, .9];               // launch (m/s), tumble (rad/s about x, y, z)
const MOP = { a: 1.3, fade: 260, lime: 0, md: 0, size: .8, keep: 1, px: 6.4, edge: .74, bk: .12, amb: .06, sea: { under: false, own: true }, lt: null, nl: 0 };
let MPOS = null;
function mountAt(tau, o) {                                           // the mount's lift (world offset) at tau; -> o, its height
  const a = Math.max(0, tau - ctx.MOUNT_T), dy = MV[1] * a - 4.9 * a * a;
  o[0] = MV[0] * a; o[1] = dy; o[2] = MV[2] * a; return o;
}
const MO3 = [0, 0, 0];
/* the mount's frames at the launch (the host's mount frames this frame, taken back into the ship's frame through the
   bow piece's pose now, then out through its pose at the launch: the same whatever frame asks; cached) */
let MLAUNCH = null;
const MH = new Float64Array(9), MT_ = new Float64Array(3);
function mountLaunch(tau) {
  if (MLAUNCH) return MLAUNCH;
  const dbg = STAGE.dbg && STAGE.dbg(), XF = dbg && dbg.XF; if (!XF || !XF.T || !XF.B || tau < 0) return null;
  ctx.halfPose(0, tau, MH, MT_);
  const Rt = [MH[0], MH[3], MH[6], MH[1], MH[4], MH[7], MH[2], MH[5], MH[8]], Wi = X.make(Rt, R.ap(Rt, [-MT_[0], -MT_[1], -MT_[2]]));
  ctx.halfPose(0, ctx.MOUNT_T, MH, MT_);
  const W0 = X.make(Array.from(MH), Array.from(MT_)), L = f => X.mul(W0, X.mul(Wi, f));
  const T_ = L(XF.T), C_ = L(XF.C), B_ = L(XF.B), Pm = X.ap(T_, [0, 1.5, 0]);
  // where it goes in (its arc stepped once)
  let t = 0; for (; t < 20; t += .005) { mountAt(ctx.MOUNT_T + t, Q); if (Pm[1] + Q[1] < 0) break; }
  MLAUNCH = { T: T_, C: C_, B: B_, Pm, spl: [Pm[0] + Q[0], Pm[2] + Q[2], ctx.MOUNT_T + t] };
  return MLAUNCH;
}
function mountThrown(tau) {
  const RG = window.RGP, SKK = window.SK;
  if (!RG || !RG.CL || !SKK || !SKK.pb) return;
  const a = tau - ctx.MOUNT_T; if (a < 0) { MPOS = null; return; }
  const ML = mountLaunch(tau); if (!ML) return;
  mountAt(tau, MO3);
  const Pm = ML.Pm;                                                  // (the gunhouse's middle: the tumble's centre)
  if (Pm[1] + MO3[1] < -14) { MPOS = null; return; }                // (gone under)
  MPOS = [Pm[0] + MO3[0], Pm[1] + MO3[1], Pm[2] + MO3[2]];
  const Rr = R.mul(R.mul(R.x(MW[0] * a), R.y(MW[1] * a)), R.z(MW[2] * a));
  const Rp = R.ap(Rr, Pm), G_ = X.make(Rr, [MPOS[0] - Rp[0], MPOS[1] - Rp[1], MPOS[2] - Rp[2]]);
  const CL = RG.CL, dq = SKK.DQ || 1;
  MOP.px = 6.4 * 1.4 / dq; MOP.sea.under = ctx.isUnder();
  SKK.pb.clear(); if (RG.occReset) RG.occReset();
  const DX = RG.drawX, T_ = X.mul(G_, ML.T), C_ = X.mul(G_, ML.C), B_ = X.mul(G_, ML.B);
  MOP.lime = 0; DX(CL.cheekS, T_, MOP); DX(CL.cheekP, T_, MOP); DX(CL.gbody, T_, MOP); DX(CL.cradle, C_, MOP); DX(CL.barrel, B_, MOP);
  MOP.lime = .5 * Math.exp(-a / .8); MOP.a = 1.35;
  for (let k = 0; k < RG.NST; k++) DX(CL.coil, X.mul(B_, X.make(R.I(), [0, 0, RG.STN[k]])), MOP);
  MOP.a = 1.3; MOP.lime = 0;
  const sa = SKK.pb.d, sb = K.pb.d, N = Math.min(sa.length, sb.length);
  for (let q = 0; q < N; q += 4) { if (sa[q] > sb[q]) sb[q] = sa[q]; if (sa[q + 1] > sb[q + 1]) sb[q + 1] = sa[q + 1]; if (sa[q + 2] > sb[q + 2]) sb[q + 2] = sa[q + 2]; }
}
/* its trail: fire and smoke streaming from it while it flies; its splash */
function drawMountFx(tau) {
  const a = tau - ctx.MOUNT_T; if (a < 0) return;
  const ML = mountLaunch(tau); if (!ML) return;
  if (tau > ML.spl[2]) splash(ML.spl[0], ML.spl[1], tau - ML.spl[2], 2.6, 4242);
  const Pm = ML.Pm;
  for (let i = 0; i < 2400; i++) {
    const ta = a - hz1(i) * Math.min(a, 2.5); mountAt(ctx.MOUNT_T + ta, Q);
    const age = a - ta, sp = .5 + 2.5 * age;
    const x = Pm[0] + Q[0] + (hz2(i) - .5) * sp + WIND[0] * age, y = Pm[1] + Q[1] + (hz1(i * 3) - .5) * sp + 2 * age, z = Pm[2] + Q[2] + (hz2(i * 5) - .5) * sp + WIND[2] * age;
    if (y < 0 || ta > ML.spl[2] - ctx.MOUNT_T) continue;
    if (age < .35) dotW(x, y, z, 1, age < .12 ? HOT : FIRE, .8 * (1 - age / .35) + .2); else dotC(x, y, z, 1, SMK[0] + 20, SMK[1] + 16, SMK[2] + 12, .3 * (1 - age / 2.5));
  }
}
/* ================= the water: spray dome, column, base surge (at the rod's exit, x1) ================= */
const NCD = 18000, NCP = 52000, NCS = 18000;
const COL = (() => {
  const r = rng(4141), N = NCD + NCP, A = new Float32Array(N * 8);
  for (let i = 0; i < N; i++) {
    const dome = i < NCD, r0 = dome ? 4 + 70 * Math.sqrt(r()) : 20 * Math.pow(r(), .75), az = r() * TAU;
    const v0 = dome ? (60 * Math.exp(-r0 / 24) + 7) * (.75 + .5 * r()) : (42 + 58 * (1 - r0 / 20) * Math.pow(r(), .35)) * (.85 + .3 * r());
    const vr = dome ? (4 + .3 * r0) * (.6 + .8 * r()) : (2 + 16 * Math.pow(r0 / 20, 1.5)) * (.4 + 1.2 * r());
    const k = dome ? .7 + .8 * r() : .26 + .1 * r();
    const t0 = dome ? r0 / 1500 + .02 * r() : .12 + 1.1 * Math.pow(r(), 1.6);
    A[i * 8] = r0; A[i * 8 + 1] = az; A[i * 8 + 2] = v0; A[i * 8 + 3] = vr; A[i * 8 + 4] = k; A[i * 8 + 5] = t0; A[i * 8 + 6] = r(); A[i * 8 + 7] = r();
  }
  return A;
})();
const SRG = (() => { const r = rng(4242), A = new Float32Array(NCS * 6); for (let i = 0; i < NCS; i++) { A[i * 6] = r() * TAU; A[i * 6 + 1] = .55 + .6 * r(); A[i * 6 + 2] = Math.pow(r(), 2); A[i * 6 + 3] = 3.6 + 3 * r(); A[i * 6 + 4] = r(); A[i * 6 + 5] = r(); } return A; })();
const CX0 = W_ENTRY[0], CZ0 = W_ENTRY[2];
/* the column's top (the fastest water: 100 m/s, linear drag 0.26/s) and its rate */
const colTop = t => { if (t <= 0) return 0; const k = .26, v0 = 100 * 1.15, e = (1 - Math.exp(-k * t)) / k; return Math.max(0, (v0 + G / k) * e - G * t / k); };
const columnH = tau => { let m = 0; for (let k = 0; k < 6; k++) m = Math.max(m, colTop(tau - TAU_K - .12 - k * .2)); return m; };
const columnV = tau => columnH(tau + .05) - columnH(tau - .05);
function drawColumnW(tau) {
  const t = tau - TAU_K; if (t <= 0 || t > 90) return;
  const lt = Math.min(1, .3 + .9 * Math.exp(-tau / 3));             // (lit warm from below by the fires)
  const N = NCD + NCP;
  for (let i = 0; i < N; i++) {
    const o = i * 8, ta = t - COL[o + 5]; if (ta <= 0) continue;
    const k = COL[o + 4], e = (1 - Math.exp(-k * ta)) / k, v0 = COL[o + 2];
    const y = (v0 + G / k) * e - G * ta / k; if (y < -.2) continue;
    const vy = (v0 + G / k) * Math.exp(-k * ta) - G / k;
    const R_ = COL[o] + COL[o + 3] * e + (vy < 0 ? .25 * (-vy) * .3 * ta : 0), az = COL[o + 1] + .15 * fs(ta * .7 + i);
    const x = CX0 + Math.cos(az) * R_ + WIND[0] * ta * .4, z = CZ0 + Math.sin(az) * R_ + WIND[2] * ta * .4;
    const dome = i < NCD, fall = vy < 0 ? E.sat(-vy / 25) : 0;
    let a = (dome ? .8 : .95) * (1 - .45 * fall) * (1 - ss(10, 22, ta)) * (.65 + .35 * COL[o + 6]) * (1 - .35 * ss(60, 200, y));
    if (a < .02) continue;
    const warm = lt * Math.exp(-y / 45) * .5;
    mixc(FOAM, FIRE, warm, CC); dotW(x, y, z, 1, CC, Math.min(1, a * (1.15 - .4 * E.sat(R_ / 60))));
  }
  // the base surge: a ring of mist rolling out over the sea as the column falls back
  for (let i = 0; i < NCS; i++) {
    const o = i * 6, ta = t - SRG[o + 3]; if (ta <= 0) continue;
    const Rb = (40 + 190 * (1 - Math.exp(-ta / 7))) * SRG[o + 1], h = (6 + 42 * SRG[o + 2]) * (1 - Math.exp(-ta / 2)), az = SRG[o] + .02 * ta;
    const x = CX0 + Math.cos(az) * Rb + WIND[0] * ta, y = h * (.3 + .7 * SRG[o + 4]), z = CZ0 + Math.sin(az) * Rb + WIND[2] * ta;
    const a = .42 * Math.min(1, ta / 1.5) * Math.exp(-ta / 34) * (.5 + .5 * SRG[o + 5]);
    if (a > .02) dotW(x, y, z, 1, STEAM, a);
  }
}

/* ================= under the sea ================= */
/* the cavity: a column of steam behind the rod, its wall at R(d, tau) (d the depth along the path below the keel);
   opening as the rod passes, widest near the top; collapsing from tau ~0.06, pinching off first at DP (tau 0.25),
   the top sealing at 0.33, the lower part breaking up into the bubble cloud by 0.43 */
const SK_ = S_SHIP, DP = .41 * DMAX, TPIN = .25;
const tPass = d => TAU_K + TW * (1 - Math.sqrt(Math.max(0, 1 - d / DMAX)));
const tClose = d => TPIN + .45 * Math.pow((d - DP) / DMAX, 2) * (d < DP ? .9 : 1.5);
function cavR(d, tau) {
  const a = tau - tPass(d); if (a <= 0) return 0;
  const Rm = 1.1 + 6.4 * Math.pow(1 - d / DMAX, .8);
  let R_ = Rm * Math.pow(1 - Math.exp(-a / .0016), .5) * (1 + .12 * (1 - Math.exp(-a / .05)));
  const tc = tClose(d); if (tau > .06) { const u = (tau - .06) / (tc - .06); R_ *= u >= 1 ? 0 : Math.sqrt(1 - u * u); }
  return R_;
}
function axisAt(d, o) { return ctx.ptS(SK_ + d, o); }
/* the rod's end: the last of it flashing to vapour (tau TEND), a white-hot burst lighting the cavity's walls */
const TEND = TAU_K + TW;
const flashV = tau => tau < TEND - .0004 ? 0 : E.sat((tau - TEND + .0004) / .0004) * Math.exp(-Math.max(0, tau - TEND) / .0008);
const END_P = ctx.ptS(SK_ + DMAX);
/* the light coming down from the surface (the burning wreck, the fireballs over it) */
const surfL = tau => tau <= 0 ? 0 : Math.min(1, tau / .004) * (.45 + .55 * Math.exp(-tau / 1.2));
function drawCavity(tau, T) {
  if (tau < TAU_K) return;
  const tw = tau - TAU_K, dn = Math.min(DMAX, tw >= TW ? DMAX : DMAX * (1 - Math.pow(1 - tw / TW, 2)));
  const glow = tw < TW ? 1 : Math.exp(-(tw - TW) / .03), fv = flashV(tau), sl = surfL(tau);
  const U = ctx.U2(), Wd = ctx.W2(), under = ctx.isUnder();
  axisAt(dn * .5, Q2);
  const dc = Math.max(5, Math.hypot(Q2[0] - ex, Q2[1] - ey, Q2[2] - ez)), ppm = FL / dc;
  // as many wall samples as its area on screen asks: a dense, smooth skin of steam
  const N = Math.min(50000, Math.max(9000, Math.round(dn * 22 * ppm * ppm)));
  for (let i = 0; i < N; i++) {
    const d = hz1(i * 3 + 1) * dn, R0 = cavR(d, tau); if (R0 < .04) continue;
    const th = hz2(i * 3 + 2) * TAU + (hz1(i * 5 + 9) - .5) * .002;
    const wr = 1 + .025 * fs(th * 5 + d * .37 + tau * 60) + .015 * fs(th * 11 - d * .9 + tau * 90);
    const R_ = R0 * wr;
    axisAt(d + (hz2(i * 7 + 3) - .5) * dn / N * 40, Q);
    const cs = Math.cos(th), sn = Math.sin(th), nx = U[0] * cs + Wd[0] * sn, ny = U[1] * cs + Wd[1] * sn, nz = U[2] * cs + Wd[2] * sn;
    const x = Q[0] + nx * R_, y = Q[1] + ny * R_, z = Q[2] + nz * R_;
    const vx = x - ex, vy = y - ey, vz = z - ez, vl = Math.hypot(vx, vy, vz) || 1;
    // a bubble's look: bright at its rim (grazing), faint face on; the upper faces lit from above
    const rim = 1 - Math.abs((nx * vx + ny * vy + nz * vz) / vl), rk = rim * rim * rim;
    const att = under ? .25 + .75 * Math.exp(-vl / 110) : Math.exp(y / 10) * .9;
    const behind = dn - d, tip = Math.exp(-behind / 7) * glow, warm = Math.exp(-behind / 26) * glow;
    let lf = 0; if (fv > .01) { const ddx = x - END_P[0], ddy = y - END_P[1], ddz = z - END_P[2]; lf = fv * 2200 / (2200 + ddx * ddx + ddy * ddy + ddz * ddz); }
    const top = sl * Math.exp(y / 30) * (.35 + .65 * Math.max(0, ny));
    const b = att * (.36 + 1.3 * rk + .7 * warm + 1.8 * lf + .6 * top) * (.85 + .15 * hz1(i + 77));
    if (tip > .35) dotW(x, y, z, 1, tip > .75 ? HOT : FIRE, Math.min(1, b + .3 * tip));
    else if (lf > .08) { mixc(FIRE, HOT, Math.min(1, lf * 2), CC); dotW(x, y, z, 1, CC, Math.min(1, b)); }
    else { mixc(STEAM, FIRE, Math.min(1, warm * 1.1 + .3 * top), CC); dotW(x, y, z, 1, CC, b); }
  }
  // boiling: small bubbles shed off the wall while it is hot
  const nb = Math.round(Math.min(14000, N * .2) * (1 - ss(.12, .4, tau)));
  for (let i = 0; i < nb; i++) {
    const d = hz2(i * 5 + 3) * dn, R_ = cavR(d, tau); if (R_ < .1) continue;
    const a = ((tau * 6 + hz1(i * 5 + 4)) % 1), th = hz1(i * 5 + 6) * TAU, rw = R_ + .15 + 1.6 * a * hz2(i);
    axisAt(d, Q);
    const cs = Math.cos(th), sn = Math.sin(th);
    const x = Q[0] + (U[0] * cs + Wd[0] * sn) * rw, y = Q[1] + (U[1] * cs + Wd[1] * sn) * rw + a * .8, z = Q[2] + (U[2] * cs + Wd[2] * sn) * rw;
    const att = under ? Math.exp(-Math.hypot(x - ex, y - ey, z - ez) / 70) : Math.exp(y / 10) * .9;
    const warm = Math.exp(-(dn - d) / 26) * glow;
    dotW(x, y, z, 1, warm > .4 ? FIRE : STEAM, .45 * (1 - a) * att);
  }
  // the rod's light in the water, its molten spray streaming back; then its last flash
  if (glow > .02 && tw < TW + .1) {
    axisAt(dn, Q);
    const dd = Math.max(3, Math.hypot(Q[0] - ex, Q[1] - ey, Q[2] - ez));
    K.glowW(Q[0], Q[1], Q[2], Math.min(140, 2.2 * FL / dd / SPX), HOT, .7 * glow); K.glowW(Q[0], Q[1], Q[2], Math.min(320, 7 * FL / dd / SPX), FIRE, .3 * glow);
    for (let i = 0; i < 2400; i++) {
      const a = ((tau * 40 + hz1(i)) % 1), back = a * 16, rr = .25 + a * 2.6 * hz2(i), th = hz2(i * 3) * TAU;
      const x = Q[0] - DIR[0] * back + (U[0] * Math.cos(th) + Wd[0] * Math.sin(th)) * rr, y = Q[1] - DIR[1] * back + (U[1] * Math.cos(th) + Wd[1] * Math.sin(th)) * rr, z = Q[2] - DIR[2] * back + (U[2] * Math.cos(th) + Wd[2] * Math.sin(th)) * rr;
      dotW(x, y, z, 1, a < .3 ? HOT : FIRE, glow * (1 - a));
    }
  }
  if (fv > .01) {
    const dd = Math.max(3, Math.hypot(END_P[0] - ex, END_P[1] - ey, END_P[2] - ez)), a = Math.max(0, tau - TEND + .0004);
    K.glowW(END_P[0], END_P[1], END_P[2], Math.min(220, 4 * FL / dd / SPX), HOT, .95 * fv); K.glowW(END_P[0], END_P[1], END_P[2], Math.min(420, 14 * FL / dd / SPX), FIRE, .45 * fv);
    // the burst: vapour and molten droplets flung out in a sphere, cooling
    const Rb = 7 * (1 - Math.exp(-a / .0007));
    for (let i = 0; i < 3500; i++) {
      const o = (i * 11) % NBL * 6, q = Math.pow(BL[o + 3], .5), dy = BL[o + 1] * (BL[o + 1] < 0 ? -2.5 : 1);
      dotW(END_P[0] + BL[o] * Rb * q, END_P[1] + dy * Rb * q, END_P[2] + BL[o + 2] * Rb * q, 1, q < .6 ? HOT : FIRE, fv * (1.1 - .5 * q));
    }
  }
}
/* the bubble cloud: born where the cavity closes (its lower part, and the top's remnants), millimetres to 2 m
   across, rising by size (big caps ~2 m/s, the fine ones slowly), spreading, wobbling; the big ones surface as mounds
   of white water and bursts of spray */
const NBB = 22000, BB = [];
{
  const r = rng(4545), U = ctx.U2(), Wd = ctx.W2();
  for (let i = 0; i < NBB; i++) {
    const lower = r() < .8, d = lower ? DP + (DMAX - DP) * Math.pow(r(), .8) : DP * r();
    const Rm = 1.1 + 6.4 * Math.pow(1 - d / DMAX, .8), th = r() * TAU, rr = Rm * .9 * Math.sqrt(r());
    const o = axisAt(d, [0, 0, 0]);
    const p = [o[0] + (U[0] * Math.cos(th) + Wd[0] * Math.sin(th)) * rr, o[1] + (U[1] * Math.cos(th) + Wd[1] * Math.sin(th)) * rr, o[2] + (U[2] * Math.cos(th) + Wd[2] * Math.sin(th)) * rr];
    const rb = .003 + 1.7 * Math.pow(r(), 4);
    const so = (lower ? 7 + 16 * Math.pow(r(), .7) : 3 + 8 * r()) * (.6 + .8 * d / DMAX), ta = r() * TAU;
    BB.push({ p, tb: tClose(d) + .01 * r(), rb, vr: (.18 + 1.25 * Math.sqrt(rb)) * (.8 + .4 * r()), out: [Math.cos(ta) * so, Math.sin(ta) * so], df: .6 + 1.4 * r(), dfa: r() * TAU, ph: r() * TAU, h: r() });
  }
  for (const b of BB) { b.ts = b.tb + (-b.p[1]) / b.vr; }
}
const bubPos = (b, tau, o) => { const a = tau - b.tb, sp = 1 - Math.exp(-a / 1.4), df = b.df * Math.sqrt(Math.max(0, a)); o[0] = b.p[0] + b.out[0] * sp + df * Math.cos(b.dfa + a * .2) + .3 * Math.sin(a * 3 + b.ph); o[1] = b.p[1] + b.vr * a * (1 - .3 * Math.exp(-a / 2)); o[2] = b.p[2] + b.out[1] * sp + df * Math.sin(b.dfa + a * .2) + .3 * Math.cos(a * 2.6 + b.ph); return o; };
/* the cloud's centre (the mean depth of all its bubbles, the surfaced ones counted at the surface) and its rate */
const cloudAt = tau => { let s_ = 0; for (let i = 0; i < NBB; i += 7) { const b = BB[i]; const y = tau < b.tb ? b.p[1] : Math.min(0, b.p[1] + b.vr * (tau - b.tb) * (1 - .3 * Math.exp(-(tau - b.tb) / 2))); s_ += y; } return s_ / Math.ceil(NBB / 7); };
const cloudY = tau => cloudAt(tau);
const cloudV = tau => (cloudAt(tau + .5) - cloudAt(tau - .5));
function drawBubbles(tau, T) {
  const under = ctx.isUnder(), sl = surfL(tau);
  for (let i = 0; i < NBB; i++) {
    const b = BB[i]; if (tau < b.tb) continue;
    if (tau < b.ts) {
      if (!under) continue;
      bubPos(b, tau, Q);
      const d = Math.max(.5, Math.hypot(Q[0] - ex, Q[1] - ey, Q[2] - ez)); if (d > 130) continue;
      const ppm = FL / d, att = Math.exp(-d / 70);
      // larger bubbles grow as they rise (the pressure falls) and flatten into caps
      const rb = b.rb * Math.pow((1 + Math.max(0, -Q[1]) / 10) > 0 ? (1 + (-b.p[1]) / 10) / (1 + Math.max(0, -Q[1]) / 10) : 1, 1 / 3), pr = rb * ppm;
      const lit = (.5 + .5 * sl * ss(-45, 0, Q[1])) * (.65 + .35 * b.h), warm = .5 * sl * ss(-25, 0, Q[1]);
      if (pr < 1.3) { mixc(WH, FIRE, warm * .6, CC); dotW(Q[0], Q[1], Q[2], 1, CC, att * lit * .9); continue; }
      // a specular highlight up toward the light, and a rim (a cap's flat bottom faint)
      const n = Math.min(170, Math.round(pr * 4.5)), sq = 1 - .45 * ss(.25, 1.2, rb);
      mixc(WH, FIRE, warm * .5, CC);
      dotW(Q[0] - r0 * rb * .35 + u0 * rb * .45 * sq, Q[1] - r1 * rb * .35 + u1 * rb * .45 * sq, Q[2] - r2 * rb * .35 + u2 * rb * .45 * sq, pr > 8 ? 2 : 1, CC, att * lit);
      for (let k = 0; k < n; k++) {
        const th = k / n * TAU + b.ph, c = Math.cos(th), sn = Math.sin(th), top = sn > 0 ? 1 : .35;
        const yy = sn > 0 ? sn * sq : sn * sq * (rb > .5 ? .25 : 1);
        dotW(Q[0] + r0 * c * rb + u0 * yy * rb, Q[1] + r1 * c * rb + u1 * yy * rb, Q[2] + r2 * c * rb + u2 * yy * rb, 1, CC, att * lit * .75 * top);
      }
    } else {
      // surfaced: a mound of white water and a burst of spray where it broke
      const a = tau - b.ts; if (a > 4 || b.rb < .2 || under) continue;
      bubPos(b, b.ts, Q);
      const y0 = ctx.seaY(Q[0], Q[2], T, tau) + .05, Rm = .6 + b.rb * 3.2;
      const hm = Rm * .55 * Math.sin(Math.min(1, a / 1.1) * PI) * (a < 1.1 ? 1 : 0), rr = Rm * (1 + 2.2 * a);
      const n = Math.round(14 + rr * 10);
      for (let k = 0; k < n; k++) { const th = k / n * TAU + b.ph, q = hz1(i * 13 + k); const rk = rr * Math.sqrt(q) * (a < 1.1 ? .8 : 1); dotW(Q[0] + Math.cos(th) * rk, y0 + hm * (1 - q) , Q[2] + Math.sin(th) * rk, 1, FOAM, .6 * (1 - a / 4)); }
      if (a > .7 && a < 1.8) for (let k = 0; k < 18; k++) { const th = hz1(i * 7 + k) * TAU, sp = 1 + 4 * hz2(i * 7 + k), t = a - .7; const y = y0 + hm + sp * 2 * t - 4.9 * t * t; if (y < y0) continue; dotW(Q[0] + Math.cos(th) * sp * t * .7, y, Q[2] + Math.sin(th) * sp * t * .7, 1, FOAM, .6); }
    }
  }
}
/* the water's faint light seen from below: brighter toward the surface, Snell's window lit warm by the fires */
function wash(v, tau) {
  cam();
  const d = K.pb.d, cxp = C.cx, cyp = C.cy, iF = 1 / FL, deep = Math.exp(Math.min(0, ey) / 120);
  const fire = surfL(tau) * (tau > 0 ? 1 : 0), b0 = 14 + 7 * deep, bu = 22 * deep, bs = 70 * deep * (.35 + .65 * fire);
  for (let y = 0; y < BH; y += 2) {
    const vy = (cyp - y - .5) * iF;
    for (let x = 0; x < BW; x += 2) {
      const vx = (x + .5 - cxp) * iF, dx = f0 + r0 * vx + u0 * vy, dy = f1 + r1 * vx + u1 * vy, dz = f2 + r2 * vx + u2 * vy;
      const up = dy / Math.sqrt(dx * dx + dy * dy + dz * dz);
      let R_ = b0 * .82, G_ = b0, B_ = b0 * 1.06;
      { const t = (up + .45) / 1.45, w = t * t * (3 - 2 * t) * t; R_ += bu * w * .78; G_ += bu * w; B_ += bu * w * 1.04; if (up > .6) { const k = ss(.6, .8, up); R_ += bs * k; G_ += bs * k * .74; B_ += bs * k * .52; } }
      const q = (y * BW + x) << 2;
      for (let dy2 = 0; dy2 < 2; dy2++) for (let dx2 = 0; dx2 < 2; dx2++) { const qq = q + ((dy2 * BW + dx2) << 2); if (d[qq] < R_) d[qq] = R_; if (d[qq + 1] < G_) d[qq + 1] = G_; if (d[qq + 2] < B_) d[qq + 2] = B_; }
    }
  }
}
/* motes in the water (parallax under the sea), lit by the rod's glow and the fires above */
const CMID = ctx.ptS(S_SHIP + DMAX * .5);
const NMO = 30000, MOT = (() => { const r = rng(2323), A = new Float32Array(NMO * 4); for (let i = 0; i < NMO; i++) { A[i * 4] = CMID[0] + (r() - .5) * 220; A[i * 4 + 1] = -r() * 110; A[i * 4 + 2] = CMID[2] + (r() - .5) * 220; A[i * 4 + 3] = r(); } return A; })();
function drawMotes(tau, glowP, glowI) {
  for (let i = 0; i < NMO; i++) {
    const o = i * 4, x = MOT[o] + .2 * Math.sin(tau * .3 + i), y = MOT[o + 1], z = MOT[o + 2];
    const d = Math.hypot(x - ex, y - ey, z - ez); if (d > 85) continue;
    let b = .07 + .12 * MOT[o + 3], col = DEEP;
    { const fv = flashV(tau); if (fv > .01) { const g = fv * 2500 / (2500 + (x - END_P[0]) ** 2 + (y - END_P[1]) ** 2 + (z - END_P[2]) ** 2); if (g > .02) { b += g; col = HOT; } } }
    if (glowI > .01) { const g = glowI * 900 / (900 + (x - glowP[0]) ** 2 + (y - glowP[1]) ** 2 + (z - glowP[2]) ** 2); if (g > .02) { b += g; col = FIRE; } }
    b += .2 * ss(-30, 0, y) * surfL(tau);
    dotW(x, y, z, 1, col, b * Math.exp(-d / 30));
  }
}
const DEEP = ctx.DEEP;

/* ================= the frame ================= */
function lights(v, tau) {
  cam(); poses(tau);
  if (tau < 0) {
    const n = ctx.ptS(ctx.noseS(tau)), alt = n[1], heat = Math.pow(ss(125000, 45000, alt), 1.25) * (1 + ss(30000, 2000, alt));
    light(n[0], n[1], n[2], .22 * Math.min(1.6, heat), 220 + alt * .02, [255, 226, 196]);
    return;
  }
  const fl = flashA(tau);
  if (fl > .01) light(HIT[0], HIT[1] + 3, HIT[2], 5 * fl, 40, [255, 250, 240]);
  // the plasma in the hull, then the blasts of the chain (the latest few)
  if (tau < .06) { const p = ctx.ptS(Math.min(ctx.noseS(tau), ctx.S_SHIP) * .5); light(p[0], p[1], p[2], 2.2 * Math.exp(-tau / .015), 26, [255, 236, 210]); }
  if (tau < .5) { const fr = hullFireFront(tau), I = Math.exp(-tau / .12); light(0, 0, fr[0] - 4, 2.2 * I, 22, FIRE); light(0, 0, fr[1] + 3, 1.2 * I, 18, FIRE); }
  let nb = 0;
  for (let i = BLS.length - 1; i >= 0 && nb < 3; i--) { const B = BLS[i], a = tau - B.t; if (a < 0 || a > 2.5) continue; light(B.c[0], B.c[1] + 6, B.c[2], (2.6 * Math.exp(-a / .02) + .9 * Math.exp(-a / .9)) * B.s, 34 * B.s, a < .01 ? [255, 240, 220] : FIRE); nb++; }
  // the bloom while it burns
  { const b = Math.exp(-tau / 2) * Math.min(1, tau / .006); if (b > .02) { bloomC(Math.max(0, tau - .0015), Q); light(Q[0], Q[1], Q[2], 1.4 * b, 40 + bloomR(tau - .0015), FIRE); } }
  // the rod in the water, its last flash
  if (tau > TAU_K && tau < TAU_K + TW + .05) { const tw = tau - TAU_K, g = tw < TW ? 1 : Math.exp(-(tw - TW) / .03); axisAt(Math.min(DMAX, ctx.noseS(tau) - SK_), Q); light(Q[0], Q[1], Q[2], 1.2 * g, 30, [255, 200, 150]); }
  { const fv = flashV(tau); if (fv > .01) light(END_P[0], END_P[1], END_P[2], 5 * fv, 45, [255, 244, 228]); }
  // the fires: the biggest few
  let nf = 0;
  for (const e of EM) { if (nf >= 5) break; const s_ = emS(e, tau); if (s_ < .6) continue; emPos(e, tau, Q); light(Q[0], Q[1] + e.H * .4, Q[2], .35 * s_ * (.85 + .15 * fs(tau * 11 + nf)), 18 + e.R * 3, FIRE); nf++; }
  if (tau > T_COOK && tau < T_COOK + 4) { hwAt(0, tau, COOK.p, Q); light(Q[0], Q[1] + 8, Q[2], 3 * Math.exp(-(tau - T_COOK) / .7), 80, FIRE); }
}
/* the sea's surface effects at (x, z): [extra brightness, warm tint] */
const SFR = [0, 0];
let SFT = 0, SFB = [], SFHAS = false, SFRMAX = 1e9;
function seaFx(v, tau) {
  if (tau <= 0) return null;
  SFT = tau; poses(tau);
  // the halves' footprints on the sea (segments between their ends), for the foam round them
  SFRMAX = 140 + (tau < 60 ? (9 + 2.2 * Math.sqrt(tau)) * tau + 60 : 0); for (const e of SEM) SFRMAX = Math.max(SFRMAX, Math.hypot(e.p[0] - W_ENTRY[0], e.p[2] - W_ENTRY[2]) + e.R * 1.5 + 10);
  if (tau > 18 && tau < 200) SFRMAX = Math.max(SFRMAX, (30 + .4 * tau) * 1.3 + 5);
  SFB = [0, 1].map(g => { const a = hw(g, [0, 0, ZF[g]], [0, 0, 0]), b = hw(g, [0, 0, g === 0 ? 77 : -77], [0, 0, 0]); return [a[0], a[2], b[0], b[2]]; });
  return seaAt;
}
function seaAt(x, z, y) {
  const tau = SFT; let add = 0, warm = 0;
  const dx = x - W_ENTRY[0], dz = z - W_ENTRY[2], r = Math.sqrt(dx * dx + dz * dz);
  if (r > SFRMAX) return null;                                      // (nothing out there: the sea's own dots)
  // white water over the entry and the wreck, patchy, spreading, thinning
  const Rf = 18 + 12 * Math.sqrt(tau);
  if (r < Rf * 1.6) {
    const n = noise(x * .09 + tau * .05, z * .09, 3.1) * .5 + .5;
    add += (.75 * Math.exp(-tau / 6) + .3 * Math.exp(-tau / 80)) * ss(Rf * 1.6, Rf * .5, r) * (.35 + .65 * n);
  }
  // the ring wave's crest
  if (tau > .3 && tau < 60) { const c = 9 + 2.2 * Math.sqrt(tau), w = r - c * tau; if (Math.abs(w) < 40) add += .2 * Math.exp(-w * w / 220) * Math.exp(-tau / 25) * (.5 + .5 * noise(x * .05, z * .05, 1.7)); }
  // foam round the halves (the sea working round them, air boiling out)
  for (let g = 0; g < 2; g++) {
    const s = SFB[g], ax = s[2] - s[0], az = s[3] - s[1], L2 = ax * ax + az * az, u = Math.max(0, Math.min(1, ((x - s[0]) * ax + (z - s[1]) * az) / L2)), px = s[0] + ax * u - x, pz = s[1] + az * u - z, dd = Math.sqrt(px * px + pz * pz);
    if (dd < 22) add += .45 * ss(22, 8, dd) * (.4 + .6 * (noise(x * .2, z * .2, tau * .7) * .5 + .5)) * (u < .15 ? 1.4 : 1);
  }
  // the bubble cloud boiling up
  if (tau > 18) { const rb = 30 + .4 * tau; if (r < rb * 1.3) add += .4 * ss(rb * 1.3, rb * .4, r) * Math.max(0, noise(x * .15 + tau * .4, z * .15)) * (1 - ss(120, 200, tau)); }
  // the burning fuel
  for (let i = 0; i < SEM.length; i++) { const e = SEM[i]; if (tau < e.t) continue; const ddx = x - e.p[0] - WIND[0] * .08 * tau, ddz = z - e.p[2] - WIND[2] * .08 * tau, R_ = e.R * ss(0, 6, tau - e.t) * 1.4, d2 = ddx * ddx + ddz * ddz; if (d2 < R_ * R_) { const k = 1 - Math.sqrt(d2) / R_; warm = Math.max(warm, .7 * k); add += .25 * k * (.6 + .4 * fs(tau * 9 + x * .3 + z * .2)); } }
  if (!add && !warm) return null;
  SFR[0] = add; SFR[1] = warm; return SFR;
}
const edgeHeat = tau => tau <= 0 ? 0 : Math.min(1, tau / .003) * (.35 + .65 * Math.exp(-tau / 3));
function chunkLook(tau) {}
const PRF = {}; let PT0 = 0;
const tk = k => { if (!window.SSP) return; const t = performance.now(); PRF[k] = (PRF[k] || 0) + t - PT0; PT0 = t; };
function draw(v, tau, T) {
  PT0 = performance.now();
  cam(); poses(tau);
  const under = ctx.isUnder(), cutA = ctx.tabCut ? ctx.tabCut() : 0;
  if (tau < 0) {
    const n = ctx.ptS(ctx.noseS(tau)), alt = n[1], heat = Math.pow(ss(125000, 45000, alt), 1.25);
    column(tau, 1);
    const dc = Math.hypot(n[0] - ex, n[1] - ey, n[2] - ez);
    if (dc < 4000) drawRod(tau, heat);
    // (the orbital film's sheath sits 5.9 m back from the nose: matched across the hand-over, then eased onto the nose)
    const sb = 5.9 * (1 - sm((v - .7) / 2.6));
    sheath(n[0] - DIR[0] * sb, n[1] - DIR[1] * sb, n[2] - DIR[2] * sb, DIR, ctx.U2(), ctx.W2(), alt, T);
    const lv = (1 - ss(90, 400, dc)) * (1 - ss(.55, .8, Math.abs(f0 * DIR[0] + f1 * DIR[1] + f2 * DIR[2]))) * (1 - ss(ctx.V_I - 3.2, ctx.V_I - 2.2, v));
    ladder(n[0], n[1], n[2], DIR, alt, lv);
    drawDecks(tau, cutA);
    return;
  }
  // the column above, fading as it disperses (sim seconds)
  if (!under) column(tau, 1 - ss(10, 45, tau));
  // the rod (through the ship, into the sea)
  if (tau < TAU_K + TW) drawRod(tau, 1);
  // the hit: the flash where it meets the deck, white then orange
  if (tau < .03) { const d = pDist(HIT); K.glowW(HIT[0], HIT[1], HIT[2], Math.min(260, 6 * FL / d / SPX), HOT, .95 * Math.exp(-tau / .0003)); K.glowW(HIT[0], HIT[1] + 1, HIT[2], Math.min(300, 11 * FL / d / SPX), FIRE, .5 * Math.exp(-tau / .004) * Math.min(1, tau / .0002)); }
  // the passage: the plates cut, their fragments, the plasma, the decks inside (the cutaway), the ejecta, the jet
  tk('pre'); if (tau < 1.2) { drawPierce(tau); drawSpall(tau); drawPlasma(tau); } tk('pass');
  if (!under || tau > 2) drawHullFire(tau);
  drawDecks(tau, cutA);
  if (!under || tau > 2) { drawEjecta(tau); drawJet(HIT[0], HIT[1] + .3, HIT[2], JT, NJT, tau, 0, 1, 18); }
  // the magazine chain, the mount's flight
  tk('hull'); if (!under || tau > 2) { drawChain(tau); drawMountFx(tau); } tk('chain');
  if (ctx.brkG(tau) > .02) { drawFaces(tau); drawInflow(tau); }
  if (!under || tau > 3) drawBloom(tau);
  drawSparks(tau);
  if (!under) { drawPlume(tau); drawColumnW(tau); } tk('column');
  drawDebrisTrails(tau);
  drawSplashes(tau);
  tk('misc'); drawFires(tau); tk('fires');
  drawCook(tau);
  if (!under) { drawFloat(tau, T); drawSinkFx(tau, T); }
  // under the sea
  if (under || ey < 8) {
    drawCavity(tau, T);
    let gi = 0;
    if (tau > TAU_K && tau < TAU_K + TW + .05) { const tw = tau - TAU_K; gi = tw < TW ? 1 : Math.exp(-(tw - TW) / .03); axisAt(Math.min(DMAX, ctx.noseS(tau) - SK_), Q3); }
    if (under) drawMotes(tau, Q3, gi);
  }
  tk('end'); drawBubbles(tau, T); tk('bub');
}
/* each half going under: the air in it bursting out (a geyser of spray), a ring of foam running out, the sea
   boiling over the spot */
function drawSinkFx(tau, T) {
  for (let g = 0; g < 2; g++) {
    const tu = ctx.T_UNDER[g], a = tau - (tu - 6); if (a < 0 || a > 140) continue;
    if (!SINKP[g]) { const M = new Float64Array(9), T_ = new Float64Array(3); ctx.halfPose(g, tu, M, T_); const f = g ? [0, 2, -60] : [0, 2, 60]; SINKP[g] = [M[0] * f[0] + M[1] * f[1] + M[2] * f[2] + T_[0], 0, M[6] * f[0] + M[7] * f[1] + M[8] * f[2] + T_[2]]; }
    const P_ = SINKP[g], s_ = g ? .8 : 1;
    // the geyser (from 3 s before the end goes under to 4 s after)
    if (a < 14) for (let i = 0; i < 2600; i++) {
      const t0 = 6 * hz1(i * 3 + g), t = a - t0; if (t < 0 || t > 6) continue;
      const th = hz2(i * 5 + g) * TAU, up = (14 + 22 * hz1(i * 7 + g)) * s_, out = 2 + 8 * hz2(i * 11);
      const y = up * t - 4.9 * t * t; if (y < 0) continue;
      dotW(P_[0] + Math.cos(th) * (3 + out * t), y, P_[2] + Math.sin(th) * (3 + out * t), 1, FOAM, .55 * (1 - t / 6));
    }
    // the ring of foam and the boil
    const rr = 4 + 3.2 * a / (1 + a / 60), nr = Math.round(60 + rr * 9), y0 = .12;
    for (let i = 0; i < nr; i++) { const th = i / nr * TAU + .1 * fs(i * .7 + a), w = (hz1(i + g * 999) - .5) * 2.5; dotW(P_[0] + Math.cos(th) * (rr + w), ctx.seaY(P_[0], P_[2], T, tau) + y0, P_[2] + Math.sin(th) * (rr + w), 1, FOAM, .55 * Math.exp(-a / 70)); }
    for (let i = 0; i < 1600; i++) { const q = Math.sqrt(hz1(i * 3 + 5)), th = hz2(i * 7 + g) * TAU, rk = rr * .9 * q, fl = .5 + .5 * fs(T * 3 + i * .37); dotW(P_[0] + Math.cos(th) * rk, ctx.seaY(P_[0], P_[2], T, tau) + .2 + .6 * fl * (1 - q), P_[2] + Math.sin(th) * rk, 1, FOAM, .5 * fl * Math.exp(-a / 50)); }
  }
}
const SINKP = [null, null];
/* ================= tags ================= */
const TG = { rod: K.mkTag(), ship: K.mkTag(), bow: K.mkTag(), stern: K.mkTag(), mag: K.mkTag(), cav: K.mkTag(), col: K.mkTag(), mount: K.mkTag() };
/* (cls: 'coral' the hostile rod; 'lime' our ship; '' white: things neither ours nor theirs) */
function tagAt(tg, id, lab, val, p, a, cls) {
  if (a < .01 || !K.pj(p[0], p[1], p[2]) || !K.onS(-40 * SPX)) return;
  const x = K.PJ[0], y = K.PJ[1], dx = x > 1100 * SPX ? 54 * SPX : -54 * SPX, lx = x + dx;
  const coral = cls && cls.indexOf('coral') >= 0, lime = cls && cls.indexOf('lime') >= 0;
  const col = coral ? '#FF6A3D' : lime ? '#C6F432' : '#F2F2EE', cc = coral ? CORAL : lime ? LIME : WH;
  K.leader(x, y, lx, y - 50 * SPX, col, .9 * a); K.dot(x, y, Math.round(3 * SPX), cc[0], cc[1], cc[2], a);
  const w = K.tagW(tg);
  K.setTag(tg, id, lab, val, (cls || '') + ' sm', dx > 0 ? lx + 4 * SPX : lx - 4 * SPX - w * SPX, y - 62 * SPX, a);
}
/* a group's screen box from its coarse points under (M, T) */
function boxPts(g, M, T, pad) {
  const Pp = ctx.SHIP[g][3].P; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  for (let i = 0; i < Pp.length; i += 30) { const px = Pp[i], py = Pp[i + 1], pz = Pp[i + 2]; const x = M[0] * px + M[1] * py + M[2] * pz + T[0], y = M[3] * px + M[4] * py + M[5] * pz + T[1], z = M[6] * px + M[7] * py + M[8] * pz + T[2]; if (y < -.5) continue; if (!K.pj(x, y, z)) continue; n++; const X_ = K.PJ[0], Y_ = K.PJ[1]; if (X_ < x0) x0 = X_; if (X_ > x1) x1 = X_; if (Y_ < y0) y0 = Y_; if (Y_ > y1) y1 = Y_; }
  if (n < 10) return null; pad = (pad || 6) * SPX; return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}
const MS = new Float64Array(9), TS_ = new Float64Array(3);
function tags(v, tau) {
  const VI = ctx.V_I;
  // the rod falling: hostile (coral), held from 1.6 s to 2.6 s before the impact
  if (tau < 0) {
    const n = ctx.ptS(ctx.noseS(tau)), alt = n[1];
    const a = ss(.8, 1.4, v) * (1 - ss(VI - 3.2, VI - 2.6, v));
    tagAt(TG.rod, 'ROD', 'Tungsten · 18 m', `${alt > 995 ? (alt / 1000).toFixed(1) + ' km' : Math.round(alt) + ' m'} · ${(ctx.rodSpeed(tau) / 1000).toFixed(2)} km/s`, n, a, 'coral');
  }
  // our ship as the rod comes in, and through the hit: a white box that fits her, her class (lime: ours)
  {
    const a = ss(VI - 4.2, VI - 3.7, v) * (1 - ss(VI - 1.0, VI - .6, v));
    if (a > .01) { ctx.shipPose(2000 + tau, MS, TS_); const b = boxPts(0, MS, TS_, 8), b2 = boxPts(1, MS, TS_, 8), b3 = boxPts(2, MS, TS_, 8); if (b && b2) { const bb = [Math.min(b[0], b2[0], b3 ? b3[0] : 1e9), Math.min(b[1], b2[1], b3 ? b3[1] : 1e9), Math.max(b[2], b2[2], b3 ? b3[2] : -1e9), Math.max(b[3], b2[3], b3 ? b3[3] : -1e9)]; K.bracket(bb, '#F2F2EE', a, 16, 1.5); tagAt(TG.ship, 'DDG', 'Arleigh Burke · Flight IIA', '155 m', [0, 30, 20], a, 'lime'); } }
  }
  // the passage: the rod's nose, the plate it is cutting
  {
    const a = ss(VI - 1.0, VI - .5, v) * (1 - ss(ctx.V_PASS - .2, ctx.V_PASS + .3, v));
    if (a > .01) {
      const sn = ctx.noseS(tau), n = ctx.ptS(Math.min(sn, ctx.S_SHIP + 4)); let k = -1; for (const pl of PLATES) if (sn >= pl.s) k = pl.i;
      const lab = k < 0 ? 'Tungsten · 4.87 km/s' : k < 4 ? `Through the ${PNAME[k].toLowerCase()}` : 'Out through the keel';
      tagAt(TG.rod, 'ROD', lab, `${Math.max(0, ctx.HIT[1] - n[1]).toFixed(1)} m in · ${(ctx.rodSpeed(tau) / 1000).toFixed(2)} km/s`, n, a, 'coral');
    }
  }
  // the magazine chain: where it has got to
  {
    const a = ss(ctx.V_PASS + .2, ctx.V_PASS + .7, v) * (1 - ss(ctx.V_DIVE - .3, ctx.V_DIVE + .3, v));
    if (a > .01) { let k = 0; for (const B of BLS) if (tau >= B.t) k = B.k + 1; const B = BLS[Math.max(0, k - 1)]; tagAt(TG.mag, 'MAG', 'Railgun magazine · going up', `${k} of ${BLS.length} · ${Math.max(0, B.c[2] - ctx.MAG_Z0 + 3).toFixed(0)} m`, [B.c[0], hD(B.c[2]) + 3, B.c[2]], a, ''); }
  }
  // the rod under the sea, its end
  if (tau > TAU_K && tau < TEND + .004) {
    const a = ss(ctx.V_DEEP - 2.4, ctx.V_DEEP - 1.6, v) * (1 - ss(TEND + .0025, TEND + .004, tau));
    const p = ctx.ptS(Math.min(ctx.noseS(tau), SK_ + DMAX));
    tagAt(TG.rod, 'ROD', tau < TEND ? 'Ablating' : 'Vaporised', tau < TEND ? `${ctx.rodLen(tau).toFixed(1)} m · ${(ctx.rodSpeed(tau) / 1000).toFixed(2)} km/s` : `${(-END_P[1]).toFixed(0)} m down`, p, a, 'coral');
  }
  // the cavity collapsing
  {
    const a = ss(ctx.V_END + .6, ctx.V_END + 1.2, v) * (1 - ss(ctx.V_CAV - .6, ctx.V_CAV, v));
    if (a > .01) { let w = 0; for (let d = 2; d < DMAX; d += 4) w = Math.max(w, cavR(d, tau)); const p = axisAt(DP * .6, [0, 0, 0]); tagAt(TG.cav, 'CAVITY', w > .2 ? 'Steam · collapsing' : 'Pinched off', `${(2 * w).toFixed(1)} m wide`, [p[0] + 6, p[1], p[2]], a, ''); }
  }
  // the column; the thrown mount
  {
    const a = ss(ctx.V_UP + 1.6, ctx.V_UP + 2.2, v) * (1 - ss(ctx.V_BOIL - .4, ctx.V_BOIL + .2, v)), h = columnH(tau);
    if (a > .01 && h > 20) tagAt(TG.col, 'COLUMN', 'Spray and steam', `${h.toFixed(0)} m`, [CX0, h * .92, CZ0], a, '');
    if (MPOS && MPOS[1] > 4) { const a2 = ss(ctx.V_UP + 2.2, ctx.V_UP + 2.8, v) * (1 - ss(ctx.V_WIDE + 1, ctx.V_WIDE + 1.6, v)); tagAt(TG.mount, 'MOUNT', 'Railgun · thrown', `${MPOS[1].toFixed(0)} m up`, MPOS, a2, 'lime'); }
  }
  // the two pieces through the sinking, each until it goes under (lime: ours)
  if (v > ctx.V_BOIL + .6) {
    for (const g of [0, 1]) {
      const vu = ctx.vOfTau(ctx.T_UNDER[g]), a = ss(ctx.V_BOIL + .6, ctx.V_BOIL + 1.2, v) * (1 - ss(vu - .5, vu, v)); if (a < .01) continue;
      const b = boxPts(g, HM[g], HT[g], 6); if (!b) continue;
      K.bracket(b, '#F2F2EE', a * .9, 12, 1.2);
      const p = hw(g, [0, 10, g === 0 ? 40 : -40], [0, 0, 0]), pitch = Math.abs(Math.asin(HM[g][7]) / DEG);
      tagAt(g === 0 ? TG.bow : TG.stern, g === 0 ? 'FWD' : 'AFT', g === 0 ? 'Bow section · flooding' : 'Stern section · flooding', `${pitch.toFixed(0)}°`, p, a, 'lime');
    }
  }
}
const pinchD = () => -axisAt(DP, [0, 0, 0])[1];
return { lights, seaFx, edgeHeat, chunkLook, draw, flashA, tags, cloudY, cloudV, wash, mountThrown, pinchD, columnH, columnV, dbg: { cavR, tPass, tClose, BB, EM, SF, PRF } };
};
