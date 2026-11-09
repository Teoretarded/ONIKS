/* INTERCEPT (window.IACT): the act of the Duel where the destroyer's railgun shoots the orbital railgun ship down.
   An insert in the pattern of the scan film's INS modules ({ at, len, build(ctx), cam(u, ctx), draw(u, ctx),
   readout(u, ctx), tags(u, ctx), chapters, cues }) plus the hooks the host honours (baseT, baseVis, probe), and the
   sea beats before it as overlays the host calls on its base timeline (seaCam, seaDraw, seaTags, seaReadout,
   seaChapters, frame). Splice: base time TF + IACT.at (the round held at the muzzle, x0.004).

   What happens (sim time tau: s since the round left the muzzle; the film shows the rate on screen):
     sea      the target, the orbital railgun ship (pc_orbital_railgun's platform, dormant, its stabiliser rings at
              2 rpm), 380 km up on a circular orbit (7.68 km/s) whose ground track passes near the ship heading 110;
              the SPY-1 faces hold its track, the director's EO/IR ball turns onto it and locks (its TV view inset:
              the platform itself at 0.5 deg), the mount's X-band radar searches and locks; the predicted intercept
              point (PIP: bearing 290, elevation 70, 380 km up) is marked and the mount lays on it (the lead is 40+
              deg: the target comes up from the west while the round flies to where it will be); the rails charge.
     shot     (the host's own) through the bore, the muzzle bloom, the sabot petals.
     climb    the round (2 m long rod, ~19 kg, 7.8 km/s at the muzzle) along a straight line at 70 deg (drag ~
              K rho v^2, gravity along the line): a plasma sheath and bow shock (white-hot at the nose, orange in the
              wake), shock rings down the cone, a hot column behind it; it leaves the sensible air at ~80 km at 6.9
              km/s, the sheath and the column fading out above 60-110 km; x1 through the air.
     coast    x8 through the dark up to 380 km, the Earth's limb below; the platform a point growing ahead.
     strike   closing at ~10 km/s (x0.05): a blinding flash on the hull's starboard ventral slope; the rod tears a
              shallow gash in, runs ~140 m through the decks and bursts out of the deck on the port side; the same
              model broken (intercept_dmg.js: the holes cut out of its hull, torn plates peeled back with jagged
              edges, bent frames, exposed decks and cabling, hundreds of fragments on straight lines, spinning, their
              edges cooling over seconds, vapour puffs); a large plate flies out to stabiliser ring A and breaks one
              of its chords; the ring wobbles. Held long, x1 (no drag in space: nothing slows).
   Frames: the host's ship frame (S) and the orbital world (O: the platform's film's world, the Earth's centre at
   (0, -RE, 0)) differ by a translation SHIP_O (the ship 25 km off its coast). The act draws the orbital layer with
   ORK (window.IORB) and composites it over the host's raster (max), the host's scene weighted by baseVis.
   Exports IACT.damage (intercept_dmg.js's state) for the acts after this one. Render is a pure function of u.

   Splicing into pc_duel_film.js (the scan film's pattern; intercept_sea.js is a worked copy, its edits marked INTERCEPT):
     load   after the duel's own scripts: ../pc_orbital_railgun/pc_orbital_railgun_{kit,lat,platform,world,fx}.js,
            proto/intercept_scn.js (before the film), proto/intercept_orbit.js, proto/intercept_dmg.js, proto/intercept_act.js
     aim    AZ = ISCN.AZ, EL = ISCN.EL, V0 = ISCN.V0; the director and the radar on ISCN.tgtAE / ISCN.tgtW (stateAt's eoY,
            eoP, fcY; sensorFX's and radarTilesFX's S_HIT -> ISCN.tgtW); call IACT.frame(TR, T, u, CTX) before stateAt
     insert INS gets { at: TF + IACT.at, mod: IACT } (and no RGX burst insert); CTX needs MZ0, DIR0, MW, P_, simAt, simRate,
            camAt, T_ACT_B (= TF + IACT.at), T_DLK, T_RLK, T_LAY, T_EL1, T_RAIL, T_REL, TF, SEGS/filmOfBase (the sea
            overlays' film-time mapping), Ws, st, octx, K; build with IACT.build(CTX) after the film's CTX exists
     hooks  in render: T = mod.baseT ? mod.baseT(u) : held; skip the base scene when mod.baseVis(u) is ~0 (the act
            composites it with that weight); drawProbe only while mod.probe(u); the sea beats call seaCam / seaDraw /
            seaTags / seaReadout with the base time (or keep the duel's own lens there). */
(function () {
'use strict';
const { V, R, X, E, rng } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const ROLL = (+STAGE.Q.get('iroll') || 0) * DEG;
const S = window.ISCN, IO = window.IORB, OK = IO.K, OP = IO.P, OW = IO.W, OFX = IO.FX, OL = IO.L;
const RE = IO.RE, CE = IO.CE, GM = 3.986004e14;
const LIME = [198, 244, 50], HOT = [248, 255, 232], WH = [238, 238, 228], CORAL = [255, 106, 61], FIRE = [255, 190, 130], EMB = [255, 120, 60], VIO = [214, 200, 255];
const ss = E.ss, kk = (t, a, b) => E.inOut(E.sat((t - a) / (b - a)));
const win = (t, a, b, r) => ss(a, a + r, t) * (1 - ss(b - r, b, t));
let ctx = null, K = null;

/* ---------------- the frames ---------------- */
const OFF = 25000, SHIP_O = [0, -OFF * OFF / (2 * RE), -OFF];
const toO = (p, o) => { o = o || [0, 0, 0]; o[0] = p[0] + SHIP_O[0]; o[1] = p[1] + SHIP_O[1]; o[2] = p[2] + SHIP_O[2]; return o; };
const toS = (p, o) => { o = o || [0, 0, 0]; o[0] = p[0] - SHIP_O[0]; o[1] = p[1] - SHIP_O[1]; o[2] = p[2] - SHIP_O[2]; return o; };
const altO = p => Math.hypot(p[0] - CE[0], p[1] - CE[1], p[2] - CE[2]) - RE;

/* ---------------- the geometry (set in build) ---------------- */
const G = {};
const FL_DT = .002;
let FS = null, FV = null, FN = 0;                                    // the flight: s, v every FL_DT of sim time
function flight() {
  const M = G.MZ_O, D = G.D, n0 = Math.ceil(90 / FL_DT);
  FS = new Float64Array(n0); FV = new Float64Array(n0);
  let s = 0, v = S.V0, i = 0;
  const up = [0, 0, 0];
  for (; i < n0; i++) {
    FS[i] = s; FV[i] = v;
    const px = M[0] + D[0] * s, py = M[1] + D[1] * s, pz = M[2] + D[2] * s, r = Math.hypot(px - CE[0], py - CE[1], pz - CE[2]), h = r - RE;
    if (h >= S.ALT) break;
    up[0] = (px - CE[0]) / r; up[1] = (py - CE[1]) / r; up[2] = (pz - CE[2]) / r;
    const g = GM / (r * r), a = -g * (D[0] * up[0] + D[1] * up[1] + D[2] * up[2]) - S.K_DRAG * Math.exp(-Math.max(0, h) / 8500) * v * v;
    s += (v + .5 * a * FL_DT) * FL_DT; v += a * FL_DT;
  }
  // (the last step lands on 380 km: interpolate the hit)
  const h0 = altO(V.mad(M, D, FS[i - 1])), h1 = altO(V.mad(M, D, FS[i])), f = (S.ALT - h0) / (h1 - h0);
  G.TOF = (i - 1 + f) * FL_DT; G.S_HIT = FS[i - 1] + (FS[i] - FS[i - 1]) * f; G.V_HIT = FV[i - 1] + (FV[i] - FV[i - 1]) * f;
  FN = i;
}
const sOfTau = tau => { if (tau <= 0) return S.V0 * tau; const x = tau / FL_DT, k = Math.min(FN - 1, Math.floor(x)); return FS[k] + (FS[k + 1] - FS[k]) * (x - k); };
const vOfTau = tau => { if (tau <= 0) return S.V0; const x = Math.min(tau / FL_DT, FN), k = Math.min(FN - 1, Math.floor(x)); return FV[k] + (FV[k + 1] - FV[k]) * (x - k); };
const tauOfS = s => { if (s <= 0) return s / S.V0; let lo = 0, hi = FN; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (FS[m] < s) lo = m; else hi = m; } return (lo + (s - FS[lo]) / Math.max(1e-9, FS[hi] - FS[lo])) * FL_DT; };
/* the round (O frame) at tau; S frame */
const rodO = (tau, o) => { const s = Math.min(sOfTau(tau), G.S_HIT + 2000); o = o || [0, 0, 0]; for (let k = 0; k < 3; k++) o[k] = G.MZ_O[k] + G.D[k] * s; return o; };
const rodS = (tau, o) => toS(rodO(tau, o), o);
/* the target's orbit: through the PIP at tau = TOF, heading HEADING there; t = tau - TOF */
function orbitPos(t, o) { const w = G.OM * t, c = Math.cos(w), sn = Math.sin(w); o = o || [0, 0, 0]; for (let k = 0; k < 3; k++) o[k] = CE[k] + G.RT * (G.PH[k] * c + G.HH[k] * sn); return o; }
function orbitVel(t, o) { const w = G.OM * t, c = Math.cos(w), sn = Math.sin(w); o = o || [0, 0, 0]; for (let k = 0; k < 3; k++) o[k] = G.VT * (-G.PH[k] * sn + G.HH[k] * c); return o; }
/* the platform: its attitude RP fixed (inertial, over the minute that matters), its hull point H_P on the orbit */
const WT = { R: new Float64Array(9), T: [0, 0, 0] }, TMP = [0, 0, 0];
function platXf(t) {
  orbitPos(t, TMP);
  const M = G.RP, h = G.H_P;
  WT.T[0] = TMP[0] - (M[0] * h[0] + M[1] * h[1] + M[2] * h[2]);
  WT.T[1] = TMP[1] - (M[3] * h[0] + M[4] * h[1] + M[5] * h[2]);
  WT.T[2] = TMP[2] - (M[6] * h[0] + M[7] * h[1] + M[8] * h[2]);
  for (let i = 0; i < 9; i++) WT.R[i] = M[i];
  return WT;
}
const pl2O = (Wt, p, o) => { const M = Wt.R, t = Wt.T; o = o || [0, 0, 0]; o[0] = M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + t[0]; o[1] = M[3] * p[0] + M[4] * p[1] + M[5] * p[2] + t[1]; o[2] = M[6] * p[0] + M[7] * p[1] + M[8] * p[2] + t[2]; return o; };
const pl2Od = (Wt, d, o) => { const M = Wt.R; o = o || [0, 0, 0]; o[0] = M[0] * d[0] + M[1] * d[1] + M[2] * d[2]; o[1] = M[3] * d[0] + M[4] * d[1] + M[5] * d[2]; o[2] = M[6] * d[0] + M[7] * d[1] + M[8] * d[2]; return o; };

/* the hull's section (platform frame: the frustum's cross-section at the prow, scaled by kz(z) about the bore axis) */
const SEC = [[27, 27], [42, 6], [38, 4], [38, -4], [42, -6], [30, -27], [-30, -27], [-42, -6], [-38, -4], [-38, 4], [-42, 6], [-27, 27]];
function inHull(p) {
  if (p[2] > OP.Z_PROW || p[2] < OP.Z_STERN) return false;
  const k = OP.kz(p[2]), x = p[0] / k, y = p[1] / k;
  let c = false;
  for (let i = 0, j = SEC.length - 1; i < SEC.length; j = i++) { const a = SEC[i], b = SEC[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
  return c;
}

function buildGeometry() {
  G.MZ_O = toO(ctx.MZ0); G.D = ctx.DIR0.slice();
  flight();
  G.PIP = V.mad(G.MZ_O, G.D, G.S_HIT);
  G.RT = V.dist(G.PIP, CE); G.PH = V.norm(V.sub(G.PIP, CE));
  const Z = [0, 0, 1], Xa = [1, 0, 0];
  const north = V.norm(V.sub(Z, V.mul(G.PH, V.dot(Z, G.PH)))), east0 = V.sub(Xa, V.mul(G.PH, V.dot(Xa, G.PH))), east = V.norm(V.sub(east0, V.mul(north, V.dot(east0, north))));
  G.HH = V.norm(V.add(V.mul(north, Math.cos(S.HEADING)), V.mul(east, Math.sin(S.HEADING))));
  G.OM = Math.sqrt(GM / (G.RT * G.RT * G.RT)); G.VT = G.OM * G.RT;
  // the closing velocity at the hit, and the platform's attitude: turned so the closing velocity runs along the
  // furrow's line (IDMG.path: the round meets the starboard shoulder from ahead at 2.5 deg and skims aft along it):
  // platform DP -> world vr; platform +Y (square to DP) -> the world's up (square to vr), rolled by ROLL about it
  const vr = V.sub(V.mul(G.D, G.V_HIT), V.mul(G.HH, G.VT));
  G.VREL = V.len(vr);
  const vrn = V.mul(vr, 1 / G.VREL), PT = IDMG.path(OP); G.PT = PT;
  const DPp = PT.DP, upP = V.norm(V.sub([0, 1, 0], V.mul(DPp, DPp[1]))), Bp = [DPp, upP, V.cross(DPp, upP)];
  let upW = V.norm(V.sub(G.PH, V.mul(vrn, V.dot(G.PH, vrn))));
  { const sd = V.cross(vrn, upW); upW = V.norm(V.add(V.mul(upW, Math.cos(ROLL)), V.mul(sd, Math.sin(ROLL)))); }
  const Bw = [vrn, upW, V.cross(vrn, upW)];
  const M = new Float64Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += Bw[k][i] * Bp[k][j]; M[i * 3 + j] = s; }
  G.RP = M;
  G.DP = DPp; G.H_P = PT.H.slice(); G.PATH_L = PT.L; G.X_P = V.mad(PT.H, DPp, PT.L);
  G.NIN = PT.N.slice(); G.NOUT = PT.N.slice();
  G.KE = .5 * S.MASS * G.VREL * G.VREL;
  // the camera's side for the climb (horizontal, square to the line, on the side away from the ship's bow)
  // (duel: the side the host's lens works the gun from: its aft side, so the hand-over at the muzzle stays on it)
  G.SIDE = V.norm(V.cross(G.D, [0, 1, 0])); if (V.dot(G.SIDE, [0, 0, 1]) > 0) G.SIDE = V.mul(G.SIDE, -1);
  G.UPC = V.norm(V.cross(G.SIDE, G.D)); if (G.UPC[1] < 0) G.UPC = V.mul(G.UPC, -1);
  [G.PU, G.PW] = GEO.perp(G.D);
}

/* ---------------- the clock ---------------- */
/* u: s into the insert. Until UA the host's own shot clock runs (x0.004 at the muzzle, up to x1 at UA); then this
   act's: x1 through the air, x8 through the coast (its length solved so the hit lands on the keyed moment), down to
   x1 and x0.05 for the last 1.5 km, the hit, then up through x0.25 to x1 for the long hold after it */
const AT = 3.2, UA = 2.4, V1 = 10.6;
/* the platform's state is the orbital film's at TST: on its station after the move (engines out), the rings still at
   2 rpm (the closing act takes it on from there) */
const TST = 43.0;
let MWP = null, VH = 0, D8 = 0, TAU_UA = 0, LEN = 70;
/* (after the hit: x0.05 for 3 s (the flash, the cloud bursting out), up to x0.2 by +5 and held to +12 (the pieces
   on their straight lines, the plate reaching ring A), up to x1 by +15 and x1 to the end) */
const segs = d8 => { const a = V1, b = a + 1.6, c = b + d8, d = c + 1.8, e = d + 1.1, h = e + 2.8; return { h, k: [{ t: 0, rate: 1 }, { t: a, rate: 1 }, { t: b, rate: 8 }, { t: c, rate: 8 }, { t: d, rate: 1 }, { t: e, rate: .05 }, { t: h - .9, rate: .05 }, { t: h - .1, rate: .01 }, { t: h + 3.4, rate: .01 }, { t: h + 5, rate: .1 }, { t: h + 9, rate: .1 }, { t: h + 11, rate: .25 }, { t: h + 15, rate: .25 }, { t: h + 18, rate: 1 }, { t: h + 40, rate: 1 }] }; };
function buildClock() {
  TAU_UA = ctx.simAt(ctx.T_ACT_B + UA);
  const want = G.TOF - TAU_UA;
  let lo = 0, hi = 30;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2, sg = segs(m), w = FILM.warp(sg.k); if (w(sg.h) < want) lo = m; else hi = m; }
  D8 = (lo + hi) / 2; const sg = segs(D8); MWP = FILM.warp(sg.k); VH = sg.h;
  G.U_HIT = UA + VH; LEN = UA + VH + 36;
}
const tauOf = u => u <= UA ? ctx.simAt(ctx.T_ACT_B + u) : TAU_UA + MWP(u - UA);
const rateOf = u => u <= UA ? ctx.simRate(ctx.T_ACT_B + u) : MWP.rate(u - UA);
/* the sea's clock: sim s since the round left the muzzle, at a film time of the base stretches */
function seaClock(TR, Tb) {
  const tW = ctx.filmOfBase(ctx.TF - 1.4);
  return TR < tW ? TR - tW + ctx.simAt(ctx.TF - 1.4) : ctx.simAt(Tb);
}

/* ---------------- the target from the ship ---------------- */
const TG_O = [0, 0, 0], TG_S = [0, 0, 0];
function setTarget(tau) {
  orbitPos(tau - G.TOF, TG_O); toS(TG_O, TG_S);
  S.tgtW[0] = TG_S[0]; S.tgtW[1] = TG_S[1]; S.tgtW[2] = TG_S[2];
  // as seen from the mount (bearing as a train angle, elevation); the ship's small motions left out
  const m = ctx.MW, dx = TG_S[0] - m[0], dy = TG_S[1] - m[1], dz = TG_S[2] - m[2];
  S.tgtAE[0] = Math.atan2(dx, dz); S.tgtAE[1] = Math.atan2(dy, Math.hypot(dx, dz));
}
const brg = a => String(Math.round((((a / DEG) % 360) + 360) % 360)).padStart(3, '0');

/* ---------------- build ---------------- */
let DMG = null;
const SUN_P = V.norm((STAGE.Q.get('isun') || '.55,.62,.56').split(',').map(Number));
function build(c) {
  ctx = c; K = c.K;
  buildGeometry(); buildClock();
  IACT.len = LEN;
  // the sun: from the platform's starboard bow, high (on the furrow's shoulder and down the fan), given in its frame
  { const q = SUN_P, l = V.norm(pl2Od({ R: G.RP }, q)); IO.L_SUN[0] = l[0]; IO.L_SUN[1] = l[1]; IO.L_SUN[2] = l[2]; }
  if (window.IDMG) DMG = IDMG.build({ P: OP, L: OL, K: OK, path: G.PT, VREL: G.VREL, KE: G.KE, L_SUN: IO.L_SUN, psi0: ringPsi(G.TOF), OMEGA: IO.OMEGA_R });
  IACT.damage = DMG;
  // the sound hooks (named: the soundtrack is built offline from the render's markers)
  const NAMED = n => { const f = () => {}; Object.defineProperty(f, 'name', { value: n }); return f; };
  const uOfTau = tau => { let lo = 0, hi = LEN; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (tauOf(m) < tau) lo = m; else hi = m; } return (lo + hi) / 2; };
  const uOfAlt = h => { let lo = 0, hi = G.U_HIT; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (altO(rodO(tauOf(m), PO)) < h) lo = m; else hi = m; } return (lo + hi) / 2; };
  IACT.cues = [['sonic_boom', UA], ['sheath_fade', uOfAlt(60000)], ['exit_atmosphere', UA + V1], ['hit_orbital', G.U_HIT]].concat(DMG ? [
    ['furrow_end', uOfTau(G.TOF + DMG.TX)], ['fragments', uOfTau(G.TOF + DMG.TX + .01)], ['energy_release', uOfTau(G.TOF + DMG.bursts[0].t)],
    ...DMG.bursts.map((b, k) => ['burst_' + k + '_' + b.kind + '_' + Math.round(b.E) + 'GJ', uOfTau(G.TOF + b.t)]),
    ['ring_crack', uOfTau(G.TOF + DMG.ring.tC)], ['hull_break', uOfTau(G.TOF + DMG.brk.tB)]] : []).map(([n, u]) => [u, NAMED(n)]);
  IACT.uOfTau = uOfTau;
  if (DMG) { G.U_TX = uOfTau(G.TOF + DMG.TX); G.U_B0 = uOfTau(G.TOF + DMG.bursts[0].t); G.U_W0 = uOfTau(G.TOF + DMG.ring.tC - .1); G.U_TB = uOfTau(G.TOF + DMG.brk.tB); }
  IACT.geom = G;
  (window.IACT_LOG = window.IACT_LOG || []).push(`[intercept] TOF ${G.TOF.toFixed(2)} s, PIP ${(S.ALT / 1000).toFixed(0)} km at ${(G.S_HIT / 1000).toFixed(1)} km slant, v at hit ${(G.V_HIT / 1000).toFixed(2)} km/s, closing ${(G.VREL / 1000).toFixed(2)} km/s, path in hull ${G.PATH_L.toFixed(0)} m, x8 hold ${D8.toFixed(2)} s, len ${LEN.toFixed(1)} s`);
}

/* ---------------- cameras ---------------- */
const shotS = (eye, target, fov) => ({ eye, target, fov: fov * DEG });
const lerp3 = (a, b, w) => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
/* blend two shots by look direction (yaw/pitch about the eye) and log distance, so a far and a near look do not swing */
const slerpD = (a, b, w) => { const c = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), th = Math.acos(c); if (th < 1e-4) return V.norm(V.lerp(a, b, w)); if (th > Math.PI - 1e-3) return V.norm(V.lerp(a, b, w)); const s = Math.sin(th), ka = Math.sin((1 - w) * th) / s, kb = Math.sin(w * th) / s; return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]; };   // (the look turned at an even rate)
function blendShot(a, b, w) {
  if (w <= 0) return a; if (w >= 1) return b;
  const eye = lerp3(a.eye, b.eye, w);
  const da = V.sub(a.target, a.eye), db = V.sub(b.target, b.eye), la = V.len(da), lb = V.len(db);
  const d = slerpD(V.mul(da, 1 / la), V.mul(db, 1 / lb), w), L = Math.exp(Math.log(la) + (Math.log(lb) - Math.log(la)) * w);
  return { eye, target: V.mad(eye, d, L), fov: a.fov + (b.fov - a.fov) * w, roll: (a.roll || 0) + ((b.roll || 0) - (a.roll || 0)) * w };
}
/* keys [{t, eye, target, fov (deg)}] -> f(t): eased from key to key (each move starts and ends at rest; a repeated key
   is a hold), the look blended by direction and log distance */
function keyPath(keys) {
  return t => {
    if (t <= keys[0].t) return shotS(keys[0].eye, keys[0].target, keys[0].fov);
    let i = 0; while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
    const a = keys[i], b = keys[i + 1], w = E.inOut(E.sat((t - a.t) / (b.t - a.t)));
    return blendShot(shotS(a.eye, a.target, a.fov), shotS(b.eye, b.target, b.fov), w);
  };
}
/* the climb rig (ship frame): beside and ahead of the round, looking back down along the sheath and the column */
/* (an ease with a capped speed: accelerates over the first 30 %, cruises, settles over the last 30 %; its peak rate
   is 1.43x the mean, so a turn of A deg over T s never runs faster than 1.43 A / T deg/s) */
const trap = (x, a) => { x = E.sat(x); a = a || .3; const v = 1 / (1 - a); if (x < a) return v * x * x / (2 * a); if (x > 1 - a) return 1 - v * (1 - x) * (1 - x) / (2 * a); return v * (x - a / 2); };
function camClimb(tau) {
  // (the rig opens from close on the sheath to wide on the column as the air thins: eye and look blended evenly in g,
  // so the lens turns at a steady rate)
  const p = rodS(tau), g = ss(22000, 88000, p[1]);
  const at = (a, b, c, back, fov) => { const eye = [0, 0, 0]; for (let k = 0; k < 3; k++) eye[k] = p[k] + G.D[k] * a + G.SIDE[k] * b + G.UPC[k] * c; return { eye, target: V.mad(p, G.D, -back), fov: fov * DEG }; };
  return blendShot(at(1.0, 6.2, 1.1, 1.1, 40), at(61, 96.2, 21.1, 201.1, 52), g);
}
/* out of the air: the lens comes round (57 deg) to look across the round at the limb (the same side the climb rig
   works from), the round in the frame's lower half, riding along with it */
function camExit(tau) {
  const p = rodS(tau), up = V.norm(V.sub(toO(p), CE));
  const hz = V.norm(V.sub(V.mul(G.SIDE, -1), V.mul(up, -V.dot(G.SIDE, up))));
  const h = altO(toO(p)), dip = Math.acos(RE / (RE + h));
  const look = V.norm(V.add(V.mul(hz, Math.cos(dip * .8)), V.mul(up, -Math.sin(dip * .8))));
  const eye = V.add(V.mad(p, look, -260), V.mul(up, 40));
  return { eye, target: V.mad(eye, look, 5000), fov: 50 * DEG };
}
/* the coast: 120 m behind the round on the line of sight to the target (on a collision course that line holds still),
   a long lens (11 deg): the round a glint just off centre, the platform growing from a point at the centre */
const PC_ = [0, 0, -300];
function camChase(tau) {
  const p = rodS(tau), q = toS(pl2O(platXf(tau - G.TOF), PC_)), d = V.norm(V.sub(q, p));
  const sd = V.norm(V.cross(d, G.UPC)), up = V.cross(sd, d);
  const eye = V.add(V.mad(p, d, -120), V.add(V.mul(sd, 6), V.mul(up, -4)));
  return { eye, target: q, fov: 11 * DEG };
}
/* the hit and after: lenses riding with the platform, keyed in its own frame by dh (film s since the hit), each with
   the share of the platform's tilt the lens rolls with (the platform hangs nose-down 29 deg to the horizon):
     A  the starboard bow quarter, ~680 m off the furrow: the round streaks away along the shoulder, the furrow
        tearing open behind it, the flash and its streak; a slow drift aft
     B  pulled back and round toward the beam (1.1 km): the comet of debris downstream, the bursts along the hull and
        round ring A
     C  the beam, 1.1 km: the hull letting go, the aft section swinging into the V; held
     D  down under the starboard side, looking up at the broken ship and its debris; drifting aft
   each move eased (trap), none turning faster than ~15 deg/s */
const shotP = (eP, gP, fov, tau) => { const Wt = platXf(tau - G.TOF); return { eye: toS(pl2O(Wt, eP)), target: toS(pl2O(Wt, gP)), fov: fov * DEG }; };
/* the roll that turns the screen's up toward the platform's up (k of the way; the world's up at 0) */
function rollFor(sh, tau, k) {
  if (!k) return 0;
  const up = pl2Od(platXf(tau - G.TOF), [0, 1, 0]), f = V.norm(V.sub(sh.target, sh.eye)), r = V.norm(V.cross([0, 1, 0], f)), u = V.cross(f, r);
  return k * Math.atan2(-V.dot(up, r), V.dot(up, u));
}
let PK = null;
function postKeys() {
  if (PK) return PK;
  const K_ = (e, g, fov, k) => ({ e, g, fov, k });
  PK = [
    [-6, K_([520, 300, 120], [60, 30, -300], 40, .8)],
    [0, K_([520, 300, 120], [60, 30, -300], 40, .8)],
    [4.2, K_([575, 330, 40], [62, 30, -330], 40, .8)],
    [10, K_([1000, 370, -130], [62, 22, -400], 42, .8)],
    [13.5, K_([1130, 160, -320], [40, 4, -335], 42, .8)],
    [21, K_([1010, 110, -350], [40, 0, -335], 42, .8)],
    [29, K_([760, -760, -560], [30, -24, -330], 44, .6)],
    [36.5, K_([640, -840, -700], [26, -30, -340], 44, .6)],
    [80, K_([640, -840, -700], [26, -30, -340], 44, .6)],
  ];
  G.POST = PK;
  return PK;
}
function camPost(dh, tau) {
  const K_ = postKeys();
  let i = 0; while (i < K_.length - 2 && K_[i + 1][0] <= dh) i++;
  const a = K_[i][1], b = K_[i + 1][1], w = trap((dh - K_[i][0]) / (K_[i + 1][0] - K_[i][0]));
  const sa = shotP(a.e, a.g, a.fov, tau); sa.roll = rollFor(sa, tau, a.k); if (w <= 0) return sa;
  const sb = shotP(b.e, b.g, b.fov, tau); sb.roll = rollFor(sb, tau, b.k);
  return blendShot(sa, sb, w);
}
/* an entry-relative world-axes shot into the ship frame at sim time tau */
function platShotS(sh, tau) {
  const Wt = platXf(tau - G.TOF), Hw = pl2O(Wt, G.H_P);
  return { eye: toS(V.add(Hw, sh.eye)), target: toS(V.add(Hw, sh.target)), fov: sh.fov };
}
const DCAM = (() => { const q = STAGE.Q.get('dcam'); return q ? q.split(',').map(Number) : null; })();
const PCAM = (() => { const q = STAGE.Q.get('pcam'); return q ? q.split(',').map(Number) : null; })();      // (?pcam=ex,ey,ez,tx,ty,tz,fov: platform frame)
function cam(u, c) {
  if (DCAM && tauOf(u) - G.TOF > -1) { const F = G.HH, Uw = G.PH, Sw = V.norm(V.cross(G.HH, G.PH)), d = DCAM, off = (f, u_, s) => [F[0] * f + Uw[0] * u_ + Sw[0] * s, F[1] * f + Uw[1] * u_ + Sw[1] * s, F[2] * f + Uw[2] * u_ + Sw[2] * s];
    return platShotS({ eye: off(d[0], d[1], d[2]), target: off(d[3], d[4], d[5]), fov: (d[6] || 40) * DEG }, tauOf(u)); }
  const tau = tauOf(u), dh = u - G.U_HIT;
  { const pc = window.IPCAM || PCAM; if (pc && dh > -3) { const sh = shotP(pc.slice(0, 3), pc.slice(3, 6), pc[6] || 40, tau); sh.roll = rollFor(sh, tau, pc[7] || 0); return sh; } }
  if (dh >= 0) return camPost(dh, tau);
  let sh;
  if (u < 2.4) {
    // the host's lens at the muzzle, carried along with the round once it moves (latched), handing over to the rig
    const u0 = .45, h0 = c.camAt ? c.camAt(u > u0 ? c.T_ACT_B + u0 : c.Tb) : camClimb(tau), h = { eye: h0.eye.slice(), target: h0.target.slice(), fov: h0.fov };
    if (u > u0) { const d = V.sub(rodS(tau), rodS(tauOf(u0))); h.eye = V.add(h.eye, d); h.target = V.add(h.target, d); }
    sh = blendShot(h, camClimb(tau), kk(u, u0, 2.4));                       // (duel: eased over the whole ramp to x1)
  } else if (u < 12) sh = camClimb(tau);
  // (the turns between the rigs: climb -> exit 57 deg over 5 s, exit -> the coast's line of sight ~95 deg over 7 s,
  // the line of sight -> the hit's lens ~56 deg over 3.5 s; each at a capped rate, none past ~20 deg/s)
  if (u > 7) sh = u < 12 ? blendShot(sh, camExit(tau), trap((u - 7) / 5)) : camExit(tau);
  if (u > 12.3) sh = u < 19.3 ? blendShot(sh, camChase(tau), trap((u - 12.3) / 7)) : camChase(tau);
  const uP = G.U_HIT - 5;
  if (u > uP) sh = blendShot(sh, camPost(dh, tau), trap((u - uP) / (G.U_HIT - uP)));
  return sh;
}

/* ---------------- drawing: the orbital layer ---------------- */
const RNDP = (() => {                                                // the round: a 2 m closed shell (cone + body), points
  const A = [], r0 = .028;
  for (let i = 0; i <= 60; i++) { const z = -1 + 2 * i / 60, r = z > .55 ? r0 * (1 - (z - .55) / .45) : r0; for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; A.push(Math.cos(a) * r, Math.sin(a) * r, z); } }
  return new Float32Array(A);
})();
function drawRound(p, tau, heat) {
  const d = G.D, U = G.PU, Wd = G.PW, C = OK.C, e = C.eye, r0 = .028;
  const ppm = C.fl / Math.max(.3, Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]));
  if (ppm < 4) return;
  const nz = Math.max(16, Math.min(520, Math.round(2 * ppm / 1.3))), na = Math.max(6, Math.min(48, Math.round(TAU * r0 * ppm / 1.3)));
  const vx = e[0] - p[0], vy = e[1] - p[1], vz = e[2] - p[2], vl = Math.hypot(vx, vy, vz);
  for (let i = 0; i <= nz; i++) {
    const z = -1 + 2 * i / nz, r = z > .55 ? r0 * (1 - (z - .55) / .45) : r0, hn = ss(.2, 1, z);
    const col = heat > .2 && hn > .5 ? HOT : WH;
    for (let k = 0; k < na; k++) {
      const a = (k + (i & 1) * .5) / na * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const nx = U[0] * ca + Wd[0] * sa, ny = U[1] * ca + Wd[1] * sa, nzz = U[2] * ca + Wd[2] * sa, fac = (nx * vx + ny * vy + nzz * vz) / vl;
      if (fac < -.1) continue;
      OK.dotW(p[0] + nx * r + d[0] * z, p[1] + ny * r + d[1] * z, p[2] + nzz * r + d[2] * z, 1, col, (.35 + .55 * Math.max(0, fac)) * (1 + 1.2 * heat * hn));
    }
  }
}
/* the column for ORFX.trail: the line from the muzzle (O frame), its length at u, its age along it */
let UNOW = 0;
const FTR = { MZ: null, DIR: null, U: null, W: null, L0: 0, sOf: u => Math.max(0, Math.min(sOfTau(tauOf(u)), G.S_HIT)), altAt: s => altO(V.mad(G.MZ_O, G.D, s)), ageAt: (s, u) => Math.max(0, tauOf(u) - tauOfS(s)) * 1.6 };
const PO = [0, 0, 0], PS = [0, 0, 0];
/* ---------------- the climb's own effects, at the round's scale (5.6 cm x 2 m) ----------------
   sheath(p, tau, h, T, v): the shock layer and plasma round the rod in the air (h: 0..1 the air's share): a
   violet-white stagnation glow at the nose, the luminous layer hugging the body (white, then orange aft), the bow
   shock folding back into a narrow cone at the Mach angle (asin 1/M ~ 2.7 deg at Mach 22), rings of light running
   down that cone, and the incandescent wake (ablation products glowing orange, hundreds of metres) behind it.
   trail(u, vis): the column the rod leaves: a hot orange core for its first ~0.3 s, then a thin grey smoke line
   widening slowly with age, only in the air (none above ~70 km), a faint lime track (own round) above it. */
const SH_N = 5200, SHR = (() => { const r = rng(5501), A = new Float32Array(SH_N * 4); for (let i = 0; i < SH_N; i++) { A[i * 4] = r(); A[i * 4 + 1] = r() * TAU; A[i * 4 + 2] = r(); A[i * 4 + 3] = r(); } return A; })();
const hz = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
const machOf = (v, h) => v / Math.sqrt(1.4 * 287.05 * Math.max(216.65, 288.15 - .0065 * Math.min(11000, Math.max(0, h))));
function sheath(p, tau, h, T, v) {
  if (h < .004) return;
  const D = G.D, U = G.PU, Wd = G.PW, C = OK.C, e = C.eye;
  const dist = Math.max(.5, Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2])), ppm = C.fl / dist;
  const nx = p[0] + D[0], ny = p[1] + D[1], nz = p[2] + D[2];                  // (the nose: the rod's centre is p)
  const M = machOf(v, altO(p)), mu = Math.asin(1 / Math.max(1.5, M)), tc = Math.tan(mu);
  const fr = Math.floor(T * 60);
  // far: a hot point with its halo so the climb always reads
  if (ppm < 6) {
    const k = 1 - ppm / 6;
    OK.glowW(nx, ny, nz, Math.round(10 + 34 * h), VIO, (.35 + .4 * h) * k);
    OK.glowW(nx, ny, nz, Math.round(30 + 90 * h), FIRE, (.12 + .2 * h) * k);
  }
  // the stagnation glow and the layer down the body
  OK.glowW(nx, ny, nz, Math.min(70, 5 + .16 * ppm), VIO, .45 * h);
  OK.glowW(nx, ny, nz, Math.min(30, 2 + .06 * ppm), HOT, .8 * h);
  const Lb = 2.0, rl = .03 + .11 * h;
  for (let k = 0; k < 5; k++) { const x = .25 + k * .45; OK.glowW(nx - D[0] * x, ny - D[1] * x, nz - D[2] * x, Math.min(46, 2 + .07 * ppm), k < 2 ? VIO : FIRE, .22 * h); }
  const nL = Math.min(9000, Math.max(160, Math.round(Lb * rl * ppm * ppm * 1.6)));
  for (let i = 0; i < nL; i++) {
    const o = i * 4; let uu = SHR[o] + T * 2.4 * (.6 + .8 * SHR[o + 3]); uu -= Math.floor(uu);
    const x = uu * (Lb + 3), r0 = (x < .15 ? Math.sqrt(x / .15) : 1) * (rl + x * tc * .5) * (.6 + .5 * SHR[o + 2]);
    const th = SHR[o + 1] + uu * 3, cs = Math.cos(th) * r0, sn = Math.sin(th) * r0;
    OK.dotW(nx - D[0] * x + U[0] * cs + Wd[0] * sn, ny - D[1] * x + U[1] * cs + Wd[1] * sn, nz - D[2] * x + U[2] * cs + Wd[2] * sn, 1, x < .7 ? VIO : x < 1.9 ? HOT : FIRE, Math.min(1, h * (1.3 - .5 * uu) * (.55 + .45 * hz(i, fr))));
  }
  // the bow shock: a blunt cap over the nose folding into the Mach cone; faint, shimmering
  const Lc = 18 + 50 * h, nS = Math.min(7000, Math.max(300, Math.round(Lc * Lc * tc * ppm * ppm * .08 + 300)));
  for (let i = 0; i < nS; i++) {
    const o = ((i * 7) % SH_N) * 4, q = SHR[o + 2], x = -.06 + Lc * q * q, rr = x < .5 ? .08 + .5 * Math.sqrt(Math.max(0, x + .06)) * .4 : .36 + (x - .5) * tc;
    const th = SHR[o + 1] + T * .7, cs = Math.cos(th) * rr, sn = Math.sin(th) * rr;
    OK.dotW(nx - D[0] * x + U[0] * cs + Wd[0] * sn, ny - D[1] * x + U[1] * cs + Wd[1] * sn, nz - D[2] * x + U[2] * cs + Wd[2] * sn, 1, x < 1.5 ? VIO : WH, h * .75 * (1 - q) * (.4 + .6 * hz(i + 3, fr)));
  }
  // rings of light down the cone (born at the shoulder, opening with it)
  const RDT = .045, NRG = 10, life = RDT * NRG, k0 = Math.floor(T / RDT);
  const vd = Math.abs(((p[0] - e[0]) * D[0] + (p[1] - e[1]) * D[1] + (p[2] - e[2]) * D[2]) / dist), side = 1 - ss(.7, .95, vd);
  for (let j = 0; j < NRG && side > .02; j++) {
    const kq = k0 - j, ta = T - kq * RDT, uq = ta / life; if (uq < 0 || uq > 1) continue;
    const x = .5 + Lc * .7 * Math.pow(uq, 1.2), rr = .36 + (x - .5) * tc, n = Math.min(500, Math.max(20, Math.round(TAU * rr * ppm / 1.4)));
    OK.ringW([nx - D[0] * x, ny - D[1] * x, nz - D[2] * x], U, Wd, rr, n, 1, uq < .3 ? HOT : WH, side * h * .42 * Math.pow(1 - uq, 1.5) * Math.min(1, uq * 8), kq * .9);
  }
  // the wake: ablation products glowing, a long narrow column of embers behind the base, flickering
  const Lw = (120 + 900 * h), nW = Math.min(9000, Math.max(400, Math.round(Lw * ppm * 1.6)));
  OK.lineW(nx - D[0] * (Lb + .2), ny - D[1] * (Lb + .2), nz - D[2] * (Lb + .2), nx - D[0] * Lw * .45, ny - D[1] * Lw * .45, nz - D[2] * Lw * .45, 2, 1, FIRE, .55 * h, FIRE, .06 * h, 0);
  for (let i = 0; i < nW; i++) {
    const o = ((i * 13 + 5) % SH_N) * 4; let uu = SHR[o] + T * 1.3 * (.7 + .6 * SHR[o + 3]); uu -= Math.floor(uu);
    const x = Lb + Lw * Math.pow(uu, 1.6), rr = (.05 + .012 * Math.sqrt(x) * (1 + 2 * h)) * (.2 + .9 * SHR[o + 2]);
    const th = SHR[o + 1] + uu * 5, cs = Math.cos(th) * rr, sn = Math.sin(th) * rr;
    OK.dotW(nx - D[0] * x + U[0] * cs + Wd[0] * sn, ny - D[1] * x + U[1] * cs + Wd[1] * sn, nz - D[2] * x + U[2] * cs + Wd[2] * sn, 1, uu < .06 ? HOT : uu < .35 ? FIRE : EMB, Math.min(1, 1.3 * h * Math.pow(1 - uu, 1.1) * (.5 + .5 * hz(i + 11, fr))));
  }
}
function trail(u, vis) {
  const tau = tauOf(u), sNow = Math.min(sOfTau(tau), G.S_HIT), C = OK.C, e = C.eye, fl = C.fl, M = G.MZ_O, D = G.D, U = G.PU, Wd = G.PW;
  if (sNow <= 2 || vis < .01) return;
  let s = sNow - 2.2, n = 0;
  const TP = [0, 0, 0];
  while (s > 0 && n < 60000) {
    const px = M[0] + D[0] * s, py = M[1] + D[1] * s, pz = M[2] + D[2] * s, d = Math.max(1, Math.hypot(px - e[0], py - e[1], pz - e[2]));
    const st = Math.max(.08, d * 1.1 / fl); s -= st; n++;
    TP[0] = px; TP[1] = py; TP[2] = pz;
    const h = altO(TP), air = ss(72000, 25000, h); if (air < .003) continue;
    const age = tau - tauOfS(s), hot = Math.exp(-age / .25);
    const rad = (.15 + 1.6 * Math.sqrt(age) * (.3 + .7 * air)) * (1 + .3 * Math.sin(s / 41 + 1.2));
    const reps = Math.max(1, Math.min(10, Math.round(rad * 2 * fl / d * .5)));
    const wx = 2.2 * Math.sin(h / 3100) * age * air, wz = 2.2 * Math.cos(h / 4700) * age * air;
    for (let k = 0; k < reps; k++) {
      const q = hz(Math.floor(s * 7) + k * 31, 3.3), th = hz(Math.floor(s * 7) + k * 17, 7.1) * TAU, rr = rad * Math.sqrt(q);
      const cs = Math.cos(th) * rr, sn = Math.sin(th) * rr;
      const a = vis * air * (hot > .05 ? .9 * hot + .1 : .16 + .14 * Math.exp(-age / 30)) * (.6 + .4 * hz(k, Math.floor(s)));
      OK.dotW(px + U[0] * cs + Wd[0] * sn + wx, py + U[1] * cs + Wd[1] * sn, pz + U[2] * cs + Wd[2] * sn + wz, 1, hot > .5 ? HOT : hot > .08 ? FIRE : hot > .01 ? EMB : WH, a);
    }
  }
  let lo = 0, hi = sNow; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (altO(V.mad(M, D, m)) < 72000) lo = m; else hi = m; }
  if (sNow > lo + 40) OK.lineW(M[0] + D[0] * lo, M[1] + D[1] * lo, M[2] + D[2] * lo, M[0] + D[0] * (sNow - 30), M[1] + D[1] * (sNow - 30), M[2] + D[2] * (sNow - 30), 3, 1, LIME, .35 * vis, null, 0, 0);
}
/* the composite: the host's raster (its scene weighted by bv toward the backdrop) under the orbital layer (max) */
function composite(bv) {
  const d = K.pb.d, o = OK.pb.d, bg = K.pb.bg, n = d.length;
  if (bv >= .999) { for (let i = 0; i < n; i += 4) { if (o[i] > d[i]) d[i] = o[i]; if (o[i + 1] > d[i + 1]) d[i + 1] = o[i + 1]; if (o[i + 2] > d[i + 2]) d[i + 2] = o[i + 2]; } return; }
  for (let i = 0; i < n; i += 4) for (let c = 0; c < 3; c++) { const b = bg[i + c], v = b + (d[i + c] - b) * bv, w = o[i + c]; d[i + c] = w > v ? w : v; }
}
const OCAM = { eye: [0, 0, 0], target: [0, 0, 0], fov: 1 };
const shotO = sh => { toO(sh.eye, OCAM.eye); toO(sh.target, OCAM.target); OCAM.fov = sh.fov; OCAM.roll = sh.roll || 0; return OCAM; };
/* the host's scene weight (the sea, the ship) and the orbital world's (the globe, the limb) through the climb */
const baseVisU = u => { const tau = tauOf(u), h = rodS(tau)[1]; return 1 - ss(9000, 20000, h); };
function draw(u, c) {
  UNOW = u;
  const tau = tauOf(u), tH = tau - G.TOF, rate = rateOf(u);
  const shot = cam(u, c), bv = c.baseVis;
  rodO(tau, PO);
  const hRod = altO(PO);
  const heat = Math.pow(ss(95000, 20000, hRod), .8) * (tH < 0 ? 1 : 0);
  const plt = tH > -60 ? platXf(tH) : null;
  const Wt = plt ? X.make(Array.from(plt.R), plt.T.slice()) : null;
  const OR = { cam: shotO(shot), shake: c.K.C.shake, Tst: TST, Wt, psi: ringPsi(tau), world: 1 - bv * .999, stars: 1 - bv, site: true, far: 450000,
    hull: DMG && tH > 0 ? DMG.hullClip(tH) : null, ring: DMG && tH > 0 ? PP => DMG.ringEdit(PP, tH) : null,
    pre: DMG && tH > 0 ? (() => DMG.portals(Wt, tH)) : null, ringFX: false,
    tilt: DMG && tH > 0 ? DMG.tilt(tH) : [0, 0], gimbal: DMG && tH > 0 ? DMG.gimbal(tH) : [1, 0],
    fx: PP => {
      // the column and the sheath (until the hit), the round
      trail(u, tH < 0 ? 1 : 1 - ss(0, 30, tH));
      if (Wt) { const dP = V.dist(OK.C.eye, Wt.T); if (dP > 40000) { const k = ss(40000, 60000, dP); OK.glowW(Wt.T[0], Wt.T[1], Wt.T[2], 10, WH, .55 * k); OK.dotW(Wt.T[0], Wt.T[1], Wt.T[2], 2, [255, 255, 250], k); } }
      if (tH < 0 && heat < .05) {
        // in vacuum: the rod catches the sun (a glint) and its motion in the frame shows as a short lime streak
        OK.glowW(PO[0], PO[1], PO[2], 7, HOT, .7); OK.dotW(PO[0], PO[1], PO[2], 2, HOT, 1);
        const vr = Math.min(400, G.VREL * rate / 60 * 8), vd = V.sub(V.mul(G.D, vOfTau(tau)), orbitVel(tH)), vn = V.norm(vd);
        OK.lineW(PO[0], PO[1], PO[2], PO[0] - vn[0] * vr, PO[1] - vn[1] * vr, PO[2] - vn[2] * vr, 2, 1, LIME, .6, null, 0, 0);
      }
      if (tH < 0) { if (u > .2) sheath(PO, tau, heat * ss(.2, .6, u), u, vOfTau(tau)); drawRound(PO, tau, heat); }
      if (DMG && PP) DMG.draw(PP, Wt, tH, rate, OR.cam);
    } };
  IO.render(u, OR);
  composite(bv);
  if (DMG && tH > -.002) {
    // the flashes: the contact (fading over ~1 s on the screen), the head's glare while it cuts, the round's last burst
    const dh = u - G.U_HIT, dX = G.U_TX - G.U_HIT;
    const I = (dh >= 0 ? 1.3 * Math.exp(-dh / .34) : 0) + (tH > 0 && tH < DMG.TX ? .3 : 0) + (dh >= dX ? 1.1 * Math.exp(-(dh - dX) / .42) : 0);
    DMG.lensFX(K, I);
  }
}
const ringPsi = tau => IO.OMEGA_R * (tau + 40);

/* ---------------- readout, tags ---------------- */
const km = (m, d) => (m / 1000).toFixed(d === undefined ? 1 : d);
const rho = h => 1.225 * Math.exp(-Math.max(0, h) / 8500);
const fmtN = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
function readout(u, c) {
  const tau = tauOf(u), tH = tau - G.TOF, rate = rateOf(u);
  rodO(tau, PO); const h = altO(PO), v = vOfTau(tau);
  let l1, l2;
  if (tH < 0) {
    const dist = Math.max(0, G.S_HIT - sOfTau(tau));
    if (h < 90000) { l1 = `Round · alt <b>${km(h)} km</b> · <b>${km(v, 2)} km/s</b>`; l2 = h < 60000 ? `Air <b>${rho(h) < .01 ? rho(h).toExponential(1) : rho(h).toFixed(3)} kg/m³</b> · plasma sheath` : 'Leaving the air · sheath <b>fading</b>'; }
    else { l1 = `Round · alt <b>${km(h, 0)} km</b> · <b>${km(v, 2)} km/s</b>`; l2 = `Intercept in <b>${km(dist, dist < 10000 ? 2 : 0)} km</b> · closing <b>${km(G.VREL, 1)} km/s</b>`; }
  } else { const d = DMG ? DMG.info(tH) : { l1: '', l2: '' }; l1 = d.l1; l2 = d.l2; }
  return { l1, l2, rate, clock: tau };
}
const TAGS = {};
const tg = k => TAGS[k] || (TAGS[k] = K.mkTag());
function tagAtS(key, id, lab, val, cls, p, a, dx, dy) {
  if (a < .01 || !K.pj(p[0], p[1], p[2])) return;
  const x = K.PJ[0], y = K.PJ[1], s = K.S, col = cls.indexOf('coral') >= 0 ? '#FF6A3D' : '#C6F432';
  K.leader(x, y, x + (dx || 46) * s, y + (dy || -46) * s, col, .8 * a);
  K.setTag(tg(key), id, lab, val, cls, x + ((dx || 46) + 4) * s, y + ((dy || -46) - 14) * s, a, [x, y]);
}
function boxAt(p, r, col, a) {
  if (a < .01 || !K.pj(p[0], p[1], p[2])) return null;
  const s = K.S, x = K.PJ[0], y = K.PJ[1], rr = Math.max(r * K.C.fl / K.PJ[2], 9 * s);
  K.bracket([x - rr, y - rr, x + rr, y + rr], col, a, 7, 1.3);
  return [x, y, rr];
}
function tags(u, c) {
  const tau = tauOf(u), tH = tau - G.TOF;
  rodS(tau, PS);
  if (tH < -.5) {
    const a = 1 - ss(-1.6, -.6, tH);
    if (u > 1.5) tagAtS('rod', 'RND', 'Long rod · 2.0 m · 19 kg', `${km(vOfTau(tau), 2)} km/s`, 'lime sm', PS, a * ss(1.5, 2.2, u) * (1 - win(u, UA + V1 - 1.6, UA + V1 + 1.6, .5) * .0));
    // the target, ahead: a coral box sized to the platform (690 m across its rings)
    const plt = platXf(tH); toS(plt.T, TMP);
    const b = boxAt(TMP, 520, '#FF6A3D', ss(UA + V1, UA + V1 + 1.2, u) * a);
    if (b) K.setTag(tg('tgt'), 'TRK 01', 'Orbital railgun · 1.7 km', `${km(Math.max(0, G.S_HIT - sOfTau(tau)) , 0)} km`, 'coral sm', b[0] + b[2] + 8 * K.S, b[1] - b[2], ss(UA + V1, UA + V1 + 1.2, u) * a, [b[0], b[1]]);
  }
  if (DMG && tH > 0) {
    const aOf = k => k === 'dfur' ? win(u, G.U_HIT + .5, G.U_HIT + 5.6, .4) : k === 'dbus' ? win(u, G.U_B0 + .3, G.U_W0 - .2, .4) : k === 'dring' ? win(u, G.U_W0 + .3, G.U_TB + 2.6, .4) : k === 'dbrk' ? win(u, G.U_TB + 1.2, LEN - .8, .5) : 0;
    DMG.tags(tH, (p, key, id, lab, val, cls, a, dx, dy) => { if (a < .01) return; const Wt = platXf(tH); toS(pl2O(Wt, p), PS); tagAtS(key, id, lab, val, cls, PS, a, dx, dy); }, aOf);
  }
}

/* ---------------- the sea beats (on the host's base timeline) ---------------- */
const SPY_C = () => HD.destroyer.A.spy, SPY_N = () => HD.destroyer.A.spyN;
const Q1 = [0, 0, 0], Q2 = [0, 0, 0];
const INSET = { cv: null, g: null, img: null };
function frame(TR, Tb, u, c) {
  const tau = u >= 0 ? tauOf(u) : seaClock(TR, Tb);
  setTarget(tau);
}
/* the sea lens (ship frame), by film time; from the charge on the host's own lens (the breech, the bore, the exit) */
let SEA_P = null;
function seaCam(TR, Tb, c) {
  if (Tb >= c.T_RAIL + 2.9) return null;
  if (!SEA_P) {
    const D_H = [c.P_.EO_P[0], c.P_.EO_P[1] + c.P_.EO_H + c.P_.M0[1], c.P_.EO_P[2] + c.P_.M0[2]];
    const R_H = [c.P_.FC_P[0], c.P_.FC_P[1] + c.P_.FC_H + c.P_.M0[1], c.P_.FC_P[2] + c.P_.M0[2]];
    const t1 = c.SEGS[1][2], t2 = c.SEGS[2][2];
    // (keys [t, eye, target, fov]; the target at ~ bearing 300, 20-28 deg up through these beats)
    // (the target's line of sight through these beats: bearing ~290, 21-24 deg up; over the shoulder of each sensor)
    const tdir = V.norm([-.871, .375, .317]), rt = V.norm(V.cross(tdir, [0, 1, 0]));
    const ots = (H_, back, right, up, fov) => ({ eye: V.add(V.mad(V.mad(H_, tdir, -back), rt, right), [0, up, 0]), target: V.mad(H_, tdir, 26), fov });
    SEA_P = keyPath([
      { t: 0, eye: [172, 9, 26], target: [-120, 46, 66], fov: 50 },
      { t: 4.2, eye: [140, 11, 52], target: [-150, 106, 84], fov: 52 },
      Object.assign({ t: 6.6 }, ots(D_H, 3.0, -.9, .55, 40)),
      Object.assign({ t: 11.2 }, ots(D_H, 2.7, -1.0, .45, 38)),
      Object.assign({ t: 13.6 }, ots(R_H, 3.2, .9, .5, 42)),
      Object.assign({ t: 17.2 }, ots(R_H, 3.0, 1.1, .45, 40)),
      { t: t1 + .4, eye: [26, 9.5, 72], target: [-2, 14, 49], fov: 46 },
      { t: t1 + 6.5, eye: [21, 7.5, 67], target: [-5, 23, 47], fov: 50 },
      { t: t2 - .2, eye: [17, 6.8, 63], target: [-7, 33, 46], fov: 56 },
      { t: t2 + 2.9, eye: [16.5, 6.8, 62.5], target: [-7, 34, 46], fov: 56 },
    ]);
  }
  return SEA_P(TR);
}
const LOCK_R = (T, t0) => { const a = T - t0; return a > 0 && a < 1.2 ? 1 - a / 1.2 : 0; };
function seaDraw(TR, Tb, c) {
  const tau = seaClock(TR, Tb), T = Tb;
  // the target: a bright point (the sunlit platform, about magnitude -2), its predicted track, the PIP
  const tp = S.tgtW;
  K.glowW(tp[0], tp[1], tp[2], 22, WH, .55); K.glowW(tp[0], tp[1], tp[2], 7, HOT, .9);
  if (K.pj(tp[0], tp[1], tp[2])) K.dot(K.PJ[0], K.PJ[1], 2, 255, 255, 250, 1);
  const pip = toS(G.PIP), pa = ss(c.T_LAY - 1, c.T_LAY + .5, T) || (TR > c.SEGS[1][2] ? 1 : 0);
  // the track ahead: dots along the orbit from now to the PIP
  const trkA = ss(2, 3.5, TR);
  if (trkA > .01) for (let k = 1; k <= 90; k++) {
    const t = (tau - G.TOF) + k / 90 * (G.TOF - tau + 4); orbitPos(t, Q1); toS(Q1, Q1);
    K.dotW(Q1[0], Q1[1], Q1[2], 1, CORAL, trkA * .55 * (k % 3 === 0 ? 1 : .45));
  }
  if (pa > .01 && K.pj(pip[0], pip[1], pip[2])) {
    const x = K.PJ[0], y = K.PJ[1], s = K.S;
    K.octx.strokeStyle = '#C6F432'; K.octx.globalAlpha = .85 * pa; K.octx.lineWidth = 1.4 * s;
    K.octx.beginPath(); K.octx.arc(x, y, 13 * s, 0, TAU); K.octx.stroke();
    K.octx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { K.octx.moveTo(x + dx * 17 * s, y + dy * 17 * s); K.octx.lineTo(x + dx * 25 * s, y + dy * 25 * s); } K.octx.stroke();
    K.octx.globalAlpha = 1;
  }
  // the SPY-1 faces that see the target: their tiles lit, a fan of beams up to it
  const sa = ss(.6, 2.0, TR) * (1 - ss(c.SEGS[2][2] + 6, c.SEGS[2][2] + 8, TR) * .6);
  if (sa > .01) {
    const Ws = c.Ws, cs = SPY_C(), ns = SPY_N();
    for (let f = 0; f < cs.length; f++) {
      const C0 = X.ap(Ws, cs[f]), N0 = X.dir(Ws, ns[f]), dl = V.norm(V.sub(tp, C0)), fa = V.dot(N0, dl); if (fa < .05) continue;
      const U = V.norm(V.cross(N0, [0, 1, 0])), Wf = V.cross(U, N0), fr = Math.floor(TR * 20);
      for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) {
        if (i * i + j * j > 28) continue;
        const h = K.hh(i * 13 + j * 7 + f * 31, fr), on = h > .55 ? 1 : .35;
        const px = C0[0] + U[0] * i * .3 + Wf[0] * j * .3 + N0[0] * .05, py = C0[1] + U[1] * i * .3 + Wf[1] * j * .3 + N0[1] * .05, pz = C0[2] + U[2] * i * .3 + Wf[2] * j * .3 + N0[2] * .05;
        K.dotW(px, py, pz, 1, on > .5 ? LIME : WH, sa * fa * .8 * on);
      }
      for (let k = 0; k < 3; k++) { const ph = ((TR * .7 + k / 3) % 1); const d0 = 4 + 600 * ph * ph; for (let q = 0; q < 3; q++) Q1[q] = C0[q] + dl[q] * d0; K.ringW(Q1, U, Wf, .6 + d0 * .045, 64, 1, LIME, sa * fa * .5 * (1 - ph), TR + k); }
      K.lineW(C0[0], C0[1], C0[2], C0[0] + dl[0] * 4000, C0[1] + dl[1] * 4000, C0[2] + dl[2] * 4000, 3, 1, LIME, .22 * sa * fa);
    }
  }
  // the director's TV view (inset): the platform itself, rendered by the orbital layer at 0.5 deg
  drawInset(TR, Tb, c, tau);
}
function drawInset(TR, Tb, c, tau) {
  const T = Tb, a = ss(c.T_DLK - 2.4, c.T_DLK - 1.8, T) * (1 - (TR > c.SEGS[1][2] ? ss(c.SEGS[1][2] + 2.5, c.SEGS[1][2] + 3.4, TR) : 0));
  if (a < .01) return;
  const s = K.S, w = Math.round(470 * s), h = Math.round(264 * s), x0 = K.BW - w - Math.round(70 * s), y0 = Math.round(150 * s);
  const acq = ss(c.T_DLK - 1.8, c.T_DLK - .2, T), fov = (5.2 - 4.95 * acq) * DEG;
  // the lens on the line of sight, 40 km short of the platform (its pose is only built within 60 km); the field
  // of view scaled so the platform is as big as it is from the ship
  const plt = platXf(tau - G.TOF); const Wt = X.make(Array.from(plt.R), plt.T.slice());
  const mO = toO(V.add(c.MW, [0, 1.2, 0])), dl = V.norm(V.sub(plt.T, mO)), R0 = V.dist(plt.T, mO), dd = 40000;
  const jit = (1 - acq) * .9 * DEG;
  const look = V.norm(V.add(dl, [jit * Math.sin(T * .9), jit * .6 * Math.cos(T * .7), 0]));
  const eye = V.mad(plt.T, look, -dd), fovN = 2 * Math.atan(Math.tan(fov / 2) * R0 / dd);
  IO.render(TR, { cam: { eye, target: plt.T, fov: fovN }, Tst: TST, Wt, psi: ringPsi(tau), world: 0, stars: .9, site: false, ringFX: true });
  if (!INSET.cv) { INSET.cv = document.createElement('canvas'); INSET.cv.width = OK.BW; INSET.cv.height = OK.BH; INSET.g = INSET.cv.getContext('2d'); }
  INSET.g.putImageData(OK.pb.img, 0, 0);
  const o = c.octx, sw = OK.BW * .5, sh = sw * h / w, sx = OK.BW / 2 - sw / 2, sy = OK.BH / 2 - sh / 2;
  o.save(); o.globalAlpha = a;
  o.fillStyle = 'rgba(11,12,10,.92)'; o.fillRect(x0 - 6 * s, y0 - 22 * s, w + 12 * s, h + 46 * s);
  o.drawImage(INSET.cv, sx, sy, sw, sh, x0, y0, w, h);
  o.strokeStyle = 'rgba(198,244,50,.75)'; o.lineWidth = s; o.strokeRect(x0, y0, w, h);
  const cx = x0 + w / 2, cy = y0 + h / 2, L = 26 * s;
  o.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { o.moveTo(cx + dx * 8 * s, cy + dy * 8 * s); o.lineTo(cx + dx * (8 * s + L), cy + dy * (8 * s + L)); } o.stroke();
  // the track box round the platform: its rings' span on the inset
  const lk = ss(c.T_DLK - .25, c.T_DLK, T), span = 2 * 345 / R0, bs = Math.max(14 * s, .5 * span / fov * w * 1.08) * (1 + .3 * (1 - lk));
  o.strokeStyle = lk > .5 ? '#FF6A3D' : 'rgba(255,255,255,.7)'; o.lineWidth = (lk > .5 ? 2 : 1) * s;
  for (const [sx_, sy_] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { o.beginPath(); o.moveTo(cx + sx_ * bs, cy + sy_ * (bs - 10 * s)); o.lineTo(cx + sx_ * bs, cy + sy_ * bs); o.lineTo(cx + sx_ * (bs - 10 * s), cy + sy_ * bs); o.stroke(); }
  o.font = `500 ${11 * s}px "Geist Mono", ui-monospace, monospace`; o.fillStyle = 'rgba(198,244,50,.95)'; o.textBaseline = 'alphabetic';
  o.fillText(`EO/IR · TV · ${(fov / DEG).toFixed(1)}°`, x0, y0 - 8 * s);
  o.fillStyle = lk > .5 ? 'rgba(255,106,61,.95)' : 'rgba(255,255,255,.8)';
  o.fillText(lk > .5 ? `TRACK · ${km(R0, 0)} KM · ${brg(S.tgtAE[0])}° · EL ${(S.tgtAE[1] / DEG).toFixed(1)}°` : 'ACQUIRING', x0, y0 + h + 16 * s);
  o.restore();
}
function seaTags(TR, Tb, c) {
  const T = Tb, tp = S.tgtW, s = K.S;
  const det = ss(1.6, 2.4, TR);
  if (det > .01 && K.pj(tp[0], tp[1], tp[2])) {
    const x = K.PJ[0], y = K.PJ[1], r = 12 * s, lk = Math.max(LOCK_R(T, c.T_DLK), LOCK_R(T, c.T_RLK));
    K.bracket([x - r, y - r, x + r, y + r], '#FF6A3D', det, 6, 1.4);
    if (lk > 0) { K.octx.strokeStyle = '#FF6A3D'; K.octx.globalAlpha = lk; K.octx.lineWidth = 1.5 * s; K.octx.beginPath(); K.octx.arc(x, y, r + 50 * s * lk, 0, TAU); K.octx.stroke(); K.octx.globalAlpha = 1; }
    const rng_ = V.dist(tp, c.MW);
    K.setTag(tg('strk'), 'TRK 01', 'Orbital railgun · alt 380 km', `${km(rng_, 0)} km`, 'coral sm', x + r + 8 * s, y - r - 6 * s, det, [x, y]);
  }
  const pip = toS(G.PIP), pa = TR > c.SEGS[1][2] - .5 ? ss(c.SEGS[1][2] - .5, c.SEGS[1][2] + .6, TR) : 0;
  if (pa > .01 && K.pj(pip[0], pip[1], pip[2])) K.setTag(tg('pip'), 'PIP', 'Intercept point · 380 km', `T+${G.TOF.toFixed(1)} s`, 'lime sm', K.PJ[0] + 30 * s, K.PJ[1] - 12 * s, pa, [K.PJ[0], K.PJ[1]]);
}
function seaReadout(TR, Tb, c) {
  const T = Tb, tau = seaClock(TR, Tb), rng_ = V.dist(S.tgtW, c.MW), st = c.st;
  let l1, l2;
  if (T < c.T_DLK - 1.8) { l1 = `SPY-1 · <b>track 01</b> · alt <b>380 km</b>`; l2 = `Range <b>${km(rng_, 0)} km</b> · bearing <b>${brg(S.tgtAE[0])}°</b> · elev <b>${(S.tgtAE[1] / DEG).toFixed(1)}°</b>`; }
  else if (T < c.T_LAY - .6) { l1 = T < c.T_DLK ? 'Director · <b>acquiring</b>' : T < c.T_RLK - 2.6 ? 'Director <b>locked</b> · EO/IR' : T < c.T_RLK ? 'Fire-control radar · <b>search</b>' : 'Target <b>locked</b> · radar <b>track</b>'; l2 = `Range <b>${km(rng_, 0)} km</b> · <b>7.68 km/s</b> · elev <b>${(S.tgtAE[1] / DEG).toFixed(1)}°</b>`; }
  else if (T < c.T_RAIL) { l1 = T > c.T_EL1 ? 'Mount <b>laid</b> · on the intercept point' : 'Mount · <b>laying</b> on the intercept point'; l2 = `Train <b>${brg(c.AZ)}°</b> · elev <b>${Math.round(st.el / DEG)}°</b> · lead <b>${leadDeg().toFixed(1)}°</b>`; }
  else if (T < c.T_REL) { l1 = 'Rails · <b>charging</b>'; l2 = `Intercept <b>380 km</b> up · time of flight <b>${G.TOF.toFixed(1)} s</b>`; }
  else if (T < c.TF) { l1 = 'Round · <b>in the bore</b>'; l2 = `Muzzle <b>${km(S.V0, 1)} km/s</b> · 2.0 m rod · 19 kg`; }
  else { l1 = `Round · <b>out of the muzzle</b>`; l2 = `<b>${km(S.V0, 2)} km/s</b> · sabot <b>off</b>`; }
  return { l1, l2, rate: T > c.TF - 1.6 ? c.simRate(T) : 1, clock: tau };
}
const leadDeg = () => { const a = V.norm(V.sub(S.tgtW, ctx.MW)), b = V.norm(V.sub(toS(G.PIP), ctx.MW)); return Math.acos(E.clamp(V.dot(a, b), -1, 1)) / DEG; };
function seaChapters(c) { return [{ t: 0, title: 'Track' }, { t: 5.5, title: 'Director' }, { t: 13, title: 'Radar' }, { t: c.SEGS[1][2], title: 'Lay' }, { t: c.SEGS[2][2], title: 'Charge' }, { t: c.filmOfBase(c.T_REL - .3), title: 'Fire' }]; }

window.IACT = {
  at: AT, len: LEN, probe: u => u < .55,
  build, frame, cam, draw, readout, tags,
  baseT: u => ctx.T_ACT_B + Math.min(u, UA + .2),
  baseVis: u => baseVisU(u),
  seaCam, seaDraw, seaTags, seaReadout, seaChapters,
  get chapters() { return [{ t: 0, title: 'Climb' }, { t: UA + V1 - 1.2, title: 'Exit' }, { t: UA + V1 + 1.6, title: 'Coast' }, { t: G.U_HIT - .3, title: 'Strike' }, { t: G.U_HIT + 4.2, title: 'Debris' },
    { t: DMG ? IACT.uOfTau(G.TOF + DMG.bursts[0].t) - .3 : G.U_HIT + 8, title: 'Release' }, { t: DMG ? IACT.uOfTau(G.TOF + DMG.brk.tB) - .2 : G.U_HIT + 12, title: 'Break' }]; },
  cues: [],
  STARS: OW.STARS,
  begin() { OK.beginTags(); }, end() { OK.endTags(); },
  tauOf, rateOf, platXf, toO, toS, G,
  /* the camera log's subjects (ship frame) */
  poi(u) {
    const tau = tauOf(u), tH = tau - G.TOF, out = [];
    if (tH < 0) out.push({ name: 'round', p: rodS(tau, [0, 0, 0]), r: 1 });
    const Wt = platXf(tH); out.push({ name: 'orbital ship', p: toS(Wt.T), r: 850 });
    if (DMG && tH > .1) {
      const c = [0, 0, 0]; let n = 0;
      for (let i = 0; i < DMG.frags.length; i++) { const f = DMG.fragPose(i, tH); if (!f) continue; c[0] += f.T[0]; c[1] += f.T[1]; c[2] += f.T[2]; n++; }
      if (n) out.push({ name: 'fragments', p: toS(pl2O(platXf(tH), [c[0] / n, c[1] / n, c[2] / n])), r: 60 });
    }
    return out;
  },
  poiSea() { return [{ name: 'orbital ship', p: S.tgtW.slice(), r: 850 }]; },
};
})();
