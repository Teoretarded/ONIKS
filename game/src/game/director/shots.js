/* The cinematic's shots (game/director.js picks them; director/rig.js glides between them).

   A shot is an anchor (the subject's interpolated position, or a fixed point) and a goal eye and look point as offsets
   from it. The offsets ride critically damped springs (real time), the anchor carries the camera exactly: the subject
   holds its place in the frame however fast it flies. step(sh, dt) -> false when the subject is gone (the director then
   moves on to what that means: the break-up, the hit, the place). Framings, at true scale:
     chase        behind, beside and above a round, 35-60 m (its length x5), the lens a little ahead along its line of
                  sight to its target
     launch       low beside the launcher (70-330 m, its size), fixed; the lens rises with the round
     intercept    an interceptor or a gun burst on its way, from ~50-100 m. Variants (the director rotates them):
                    threat       riding with the incoming round, out to its side, the lens ahead where the interceptor
                                 comes from, turning to the pair as they close
                    interceptor  riding with the interceptor, the lens along its line of sight to the round
                    witness      still, beside the predicted meet point, downstream: the round comes at the lens, the
                                 interceptor goes out to it, the burst in the frame
     gun          the defending mount's view (Phalanx / 30 mm): low behind and beside the mount, a longer lens up the
                  line of fire to the round
     impact       across the target, low, before the round arrives (the round comes in through the open side)
     break        the round came apart: a slow orbit of the pieces 45-95 m off (their centre from the debris bodies); or,
                  seen from a mount or across a target, held where the eye was, the lens on the pieces
     after        the hit: held across the target, slowly up and off its quarter
     site, death  a place: a slow low orbit; a dying unit at a low angle
     idle         slow low orbits of the most important own unit, then of the enemy group */
import { DEG, clamp, ss, wrapPi, fitDist, hullCorners, acrossView, blockedBy, spring } from './rig.js';
import { predict, newPrediction } from './predict.js';

const UP = [0, 1, 0];
const V3 = () => [0, 0, 0];
const W = { tripod: 4.5, flyby: 5, chase: 2.2, launch: 2.0, intercept: 2.4, gun: 2.8, impact: 1.8, break: 2.0, after: 1.4, site: 1.3, death: 1.2, idle: 1.0 };
const DDG_MOUNT = [[0, 13.6, 33.3], [0, 16.4, -47.9]];     // Phalanx fwd / aft (sim/weapons.js MOUNT)

export function createShots(game) {
  const { sim } = game, cam = game.R.camera;
  const HC = Array.from({ length: 9 }, () => [0, 0, 0]);
  const t3 = V3(), t4 = V3(), t5 = V3(), t6 = V3(), KP = Array.from({ length: 24 }, () => V3());
  const rate = () => game.paused ? 0 : game.timeRate;

  /* ---------- the subjects ---------- */
  const PROJ = game.PROJ || {};
  const lenOf = p => { const P = p.P || PROJ[p.kind] || {}; return P.body ? P.body[0] : 5; };
  const projAt = id => { const p = sim.projectiles.get(id); return p && p.alive ? p : null; };
  function unitAt(id) { const u = sim.units.get(id); return u && u.alive && !u.aboard ? u : null; }
  function centreOf(u, out) {
    const p = game.unitPose(u).pos, H = u.def.size[2];
    out[0] = p[0]; out[1] = p[1] + Math.min(H * .28, 12); out[2] = p[2];
    return out;
  }
  function unitVel(u, out) {
    const r = rate();
    const s = (u.speed || 0) * r, h = u.hdg || 0;
    if (u.def.domain === 'air' && u.vel) { out[0] = u.vel[0] * r; out[1] = u.vel[1] * r; out[2] = u.vel[2] * r; return out; }
    out[0] = Math.sin(h) * s; out[1] = 0; out[2] = Math.cos(h) * s;
    return out;
  }
  /* anchor readers for the rig's glide (the old camera carries on with its subject while it lasts) */
  const projAnchor = id => (out, vel) => {
    const p = projAt(id); if (!p) return false;
    const P = game.projPose(p).pos, v = p.vel, r = rate();
    out[0] = P[0]; out[1] = P[1]; out[2] = P[2];
    if (v) { vel[0] = v[0] * r; vel[1] = v[1] * r; vel[2] = v[2] * r; } else vel[0] = vel[1] = vel[2] = 0;
    return true;
  };
  const unitAnchor = (id, off) => (out, vel) => {
    const u = unitAt(id); if (!u) return false;
    if (off) mountAt(u, off, out); else centreOf(u, out);
    unitVel(u, vel);
    return true;
  };
  const fixedAnchor = sh => (out, vel) => { out[0] = sh.A[0]; out[1] = sh.A[1]; out[2] = sh.A[2]; vel[0] = vel[1] = vel[2] = 0; return true; };
  function mountAt(u, off, out) {
    const pose = game.unitPose(u), P = pose.pos, c = Math.cos(pose.hdg), s = Math.sin(pose.hdg);
    out[0] = P[0] + off[0] * c + off[2] * s; out[1] = P[1] + off[1]; out[2] = P[2] - off[0] * s + off[2] * c;
    return out;
  }

  /* ---------- a shot ---------- */
  function make(kind, o) {
    const sh = Object.assign({
      kind, key: kind, t0: game.realT, age: 0, lock: 0, until: game.realT + 1e9, w: W[kind] || 1.6,
      A: V3(), gE: V3(), gL: V3(), sE: V3(), vE: V3(), sL: V3(), vL: V3(), pE: V3(), pL: V3(), fE: V3(), fL: V3(), init: false,
      En: V3(), Ln: V3(), subj: null, S: V3(), aOut: 16 * DEG, fov: 1, near: 0, side: 1, raise: 0, chk: 0,
      F: [0, 0, 1], FH: [0, 0, 1], R: [1, 0, 0], ev: 1e9, hot: true, done: false,
    }, o);
    if (kind === 'intercept' || kind === 'gun') { sh.M = V3(); sh.wF = V3(); sh.wR = V3(); sh.pr = newPrediction(); }
    sh.anchor = sh.anchorFn || fixedAnchor(sh);
    return sh;
  }
  /* one frame of a shot: false when its subject is gone */
  function step(sh, dt) {
    sh.age = game.realT - sh.t0;
    sh.subj = null; sh.near = 0;
    if (!GOAL[sh.kind](sh, dt)) return false;
    // a framing with no moment of its own (a tripod, a two-shot) is told when its subject's moment comes
    if (sh.evFn) sh.ev = sh.evFn();
    // the offsets' springs (the goal's own speed fed forward, smoothed: a reframing eases, a moving target is not lagged)
    if (sh.raw) {
      // a framing that eases itself (the wide): its goal as it is
      for (let k = 0; k < 3; k++) { sh.sE[k] = sh.gE[k]; sh.sL[k] = sh.gL[k]; }
      sh.init = true;
    } else if (!sh.init || dt <= 0) {
      for (let k = 0; k < 3; k++) { sh.sE[k] = sh.pE[k] = sh.gE[k]; sh.sL[k] = sh.pL[k] = sh.gL[k]; sh.vE[k] = sh.vL[k] = sh.fE[k] = sh.fL[k] = 0; }
      sh.init = true;
    } else {
      const kf = 1 - Math.exp(-dt * 8), w = sh.w;
      // a goal that jumps (a framing's weight switching, a subject reappearing) is not a speed to follow: the spring
      // alone eases it
      const jE = Math.hypot(sh.gE[0] - sh.pE[0], sh.gE[1] - sh.pE[1], sh.gE[2] - sh.pE[2]) > 6 + .05 * Math.hypot(sh.gE[0], sh.gE[1], sh.gE[2]);
      const jL = Math.hypot(sh.gL[0] - sh.pL[0], sh.gL[1] - sh.pL[1], sh.gL[2] - sh.pL[2]) > 12 + .08 * Math.hypot(sh.gL[0], sh.gL[1], sh.gL[2]);
      for (let k = 0; k < 3; k++) {
        if (!jE) sh.fE[k] += ((sh.gE[k] - sh.pE[k]) / dt - sh.fE[k]) * kf; else sh.fE[k] *= .5;
        if (!jL) sh.fL[k] += ((sh.gL[k] - sh.pL[k]) / dt - sh.fL[k]) * kf; else sh.fL[k] *= .5;
        sh.pE[k] = sh.gE[k]; sh.pL[k] = sh.gL[k];
        spring(sh.sE, sh.vE, sh.gE, sh.fE, w, dt, k);
        spring(sh.sL, sh.vL, sh.gL, sh.fL, w * 1.3, dt, k);
      }
    }
    // the output, and its speed (a blend that loses this shot coasts on from it at that speed)
    if (!sh.vEn) { sh.vEn = V3(); sh.vLn = V3(); sh.hasOut = false; }
    for (let k = 0; k < 3; k++) {
      const e = sh.A[k] + sh.sE[k], l = sh.A[k] + sh.sL[k];
      if (sh.hasOut && dt > 0) { sh.vEn[k] = (e - sh.En[k]) / dt; sh.vLn[k] = (l - sh.Ln[k]) / dt; }
      sh.En[k] = e; sh.Ln[k] = l;
    }
    sh.hasOut = true;
    keepSubject(sh, dt);
    return true;
  }
  /* the subject stays in the frame: past aOut off the lens the look turns toward it, softly (a spring of its own, from
     rest; per shot, so a blend between two shots blends their corrected views and nothing jumps when one starts) */
  function keepSubject(sh, dt) {
    const subj = sh.subj, E = sh.En, L = sh.Ln, aOut = (sh.aOut || .3) * Math.min(1, (sh.fov || 1) * 1.1);
    let want = 0, a = 0;
    set(t3, L[0] - E[0], L[1] - E[1], L[2] - E[2]);
    const ld = norm(t3);
    if (subj) {
      set(t4, subj[0] - E[0], subj[1] - E[1], subj[2] - E[2]);
      if (norm(t4) > 1) {
        a = Math.acos(clamp(t3[0] * t4[0] + t3[1] * t4[1] + t3[2] * t4[2], -1, 1));
        const a0 = aOut * .6, span = aOut - a0;
        if (a > a0) want = (a - a0) - span * Math.tanh((a - a0) / span);
      }
    }
    if (sh.cA === undefined || dt <= 0) { sh.cA = want; sh.cV = 0; }
    else {
      const e0 = sh.cA - want, ex = Math.exp(-3 * dt), k0 = sh.cV + 3 * e0;
      sh.cA = want + (e0 + k0 * dt) * ex; sh.cV = (sh.cV - 3 * k0 * dt) * ex;
      if (sh.cA < 0) { sh.cA = 0; if (sh.cV < 0) sh.cV = 0; }
    }
    if (sh.cA > 1e-4 && a > 1e-4) {
      slerpU(t3, t4, Math.min(1, sh.cA / a));
      for (let k = 0; k < 3; k++) L[k] = E[k] + t3[k] * ld;
    }
  }

  /* the round's direction, smoothed (the sim's velocity steps at 20 Hz) */
  function heading(sh, p, dt, snap) {
    const v = p.vel, pp = game.projPose(p);
    let fx, fy, fz;
    const sp = v ? Math.hypot(v[0], v[1], v[2]) : 0;
    if (sp > 1) { fx = v[0] / sp; fy = v[1] / sp; fz = v[2] / sp; }
    else { fx = Math.sin(pp.hdg) * Math.cos(pp.pitch); fy = Math.sin(pp.pitch); fz = Math.cos(pp.hdg) * Math.cos(pp.pitch); }
    const F = sh.F;
    if (snap || !sh.fInit) { F[0] = fx; F[1] = fy; F[2] = fz; sh.fInit = true; }
    else { const k = 1 - Math.exp(-dt * 4); F[0] += (fx - F[0]) * k; F[1] += (fy - F[1]) * k; F[2] += (fz - F[2]) * k; norm(F); }
    const FH = sh.FH; FH[0] = F[0]; FH[1] = 0; FH[2] = F[2];
    if (Math.hypot(FH[0], FH[2]) < 1e-3) { FH[0] = Math.sin(cam.yaw); FH[2] = Math.cos(cam.yaw); }
    norm(FH);
    sh.R[0] = FH[2] * sh.side; sh.R[1] = 0; sh.R[2] = -FH[0] * sh.side;
    return pp.pos;
  }
  /* a round's target point (a unit's centre, or another round) */
  function tgtPoint(p, out) {
    if (p.tk === 'unit') { const u = unitAt(p.target); return u ? centreOf(u, out) : null; }
    const q = projAt(p.target); if (!q) return null;
    const P = game.projPose(q).pos; out[0] = P[0]; out[1] = P[1]; out[2] = P[2];
    return out;
  }
  /* time (game s) to the closest approach of rounds a and b from their positions and velocities, and the meet point on
     a's path (the standard estimate) */
  function closing(a, b, meet) {
    const dx = b.pos[0] - a.pos[0], dy = b.pos[1] - a.pos[1], dz = b.pos[2] - a.pos[2];
    const va = a.vel || UP0, vb = b.vel || UP0;
    const wx = vb[0] - va[0], wy = vb[1] - va[1], wz = vb[2] - va[2];
    const R = Math.hypot(dx, dy, dz) || 1, close = -(dx * wx + dy * wy + dz * wz) / R;
    const t = close > 5 ? R / close : 1e9;
    if (meet && t < 1e8) { meet[0] = a.pos[0] + va[0] * t; meet[1] = a.pos[1] + va[1] * t; meet[2] = a.pos[2] + va[2] * t; }
    return t;
  }
  const UP0 = [0, 0, 0];

  /* ---------- the framings ---------- */
  const GOAL = {
    /* behind, beside, above; the lens ahead along the line of sight */
    chase(sh, dt) {
      const p = projAt(sh.id); if (!p) return false;
      const P = heading(sh, p, dt), F = sh.F, R = sh.R, Lb = lenOf(p);
      copy(sh.A, P);
      const back = clamp(Lb * 5 + 10, 35, 60) * (1 + .06 * Math.sin(sh.age * .19));
      const sw = .42 + .05 * Math.sin(sh.age * .13 + 1), lift = .2 + .03 * Math.sin(sh.age * .17 + 2);
      for (let k = 0; k < 3; k++) sh.gE[k] = -F[k] * back + R[k] * back * sw + UP[k] * back * lift;
      // the lens ahead, part way to the round's line of sight to its target
      const T = tgtPoint(p, t3);
      if (T) { set(t4, T[0] - P[0], T[1] - P[1], T[2] - P[2]); norm(t4); } else copy(t4, F);
      for (let k = 0; k < 3; k++) t5[k] = F[k] * .7 + t4[k] * .3;
      norm(t5);
      for (let k = 0; k < 3; k++) sh.gL[k] = t5[k] * back * 1.5;
      sh.subj = copy(sh.S, P); sh.aOut = 15 * DEG;
      sh.near = clamp(back * .15, .3, 8);
      return true;
    },
    /* low beside the launcher, still; the lens rises with the round */
    launch(sh, dt) {
      const p = projAt(sh.id); if (!p) return false;
      const P = game.projPose(p).pos;
      if (!sh.placed) {
        sh.placed = true;
        const f0 = p.fromPos || P, lu = sim.units.get(p.from);
        sh.Lu = lu ? lu.def.size[0] : 12;
        sh.top = lu ? lu.def.size[2] * .5 : 3;
        sh.sea = game.ground(f0[0], f0[2]) < .5;
        copy(sh.A, f0);
        const aim = p.aim ? Math.atan2(p.aim[0] - f0[0], p.aim[2] - f0[2]) : Math.atan2(p.vel[0], p.vel[2]);
        const dS = clamp(sh.Lu * 1.5 + 110, 120, 360), sa = Math.sin(aim), ca = Math.cos(aim), s = sh.side;
        // beside the launcher, a little behind it
        sh.eyeX = ca * s * dS - sa * dS * .3; sh.eyeZ = -sa * s * dS - ca * dS * .3;
      }
      const f0 = sh.A, up = Math.max(0, P[1] - f0[1]), uf = dist(P, f0);
      const gx = f0[0] + sh.eyeX, gz = f0[2] + sh.eyeZ, g = Math.max(0, game.ground(gx, gz));
      sh.gE[0] = sh.eyeX; sh.gE[2] = sh.eyeZ;
      sh.gE[1] = g + (sh.sea ? 6 : 3) + Math.min(400, .3 * up) - f0[1];
      // the launcher low in the frame, the round rising out of it
      const w = .25 + .35 * ss(15, 600, uf);
      set(t3, 0, sh.top, 0);
      for (let k = 0; k < 3; k++) sh.gL[k] = t3[k] + (P[k] - f0[k] - t3[k]) * w;
      sh.subj = copy(sh.S, P); sh.aOut = 20 * DEG;
      sh.near = 1;
      const P2 = p.P || PROJ[p.kind] || {}, la = clamp((P2.sepAt || P2.boost || 4) + 2, 4, 10);
      const de = Math.hypot(P[0] - f0[0] - sh.gE[0], P[1] - f0[1] - sh.gE[1], P[2] - f0[2] - sh.gE[2]);
      sh.done = uf > 2500 || de > 1400 || (p.age || 0) > la + 3;     // gone small: over to the chase
      return true;
    },
    intercept(sh, dt) {
      const p = projAt(sh.id); if (!p) return false;
      const q = sh.q ? projAt(sh.q) : null;
      const P = heading(sh, p, dt), F = sh.F, R = sh.R, Lb = lenOf(p);
      // the moment: the interceptor's closest approach; or the gun's burst (predict.js)
      if (q) { sh.ev = closing(p, q, t6); if (sh.ev < 1e8) { moveTo(sh.M, t6, sh.Minit ? 1 - Math.exp(-dt * 2) : 1, sh.Minit ? 400 * dt : 1e9); sh.Minit = true; } }
      else {
        sh.gunEv = true;
        const r = predict(game, p, sh.pr);
        sh.ev = Math.min(r.kind === 'gun' ? r.tEv : r.gunSoon, r.tImpact);
        sh.hot = r.kind === 'gun' || r.tImpact < 4;         // a burst in the air, or the hit: a moment (not just in reach)
        if (sh.ev < 1e8) {
          const tt = sh.ev, v = p.vel;
          if (r.kind === 'gun' && r.tEv === tt) copy(t6, r.meet); else set(t6, p.pos[0] + v[0] * tt, p.pos[1] + v[1] * tt, p.pos[2] + v[2] * tt);
          moveTo(sh.M, t6, sh.Minit ? 1 - Math.exp(-dt * 2) : 1, sh.Minit ? 400 * dt : 1e9); sh.Minit = true;
        }
      }
      let v = sh.var;
      if (sh.hadQ === undefined) sh.hadQ = !!q;
      // the interceptor is gone (it missed, or burst): riding with it or waiting where it would meet the round is over;
      // the director stays with the round (a glide, not a jump)
      if ((v === 'interceptor' || v === 'witness') && sh.hadQ && !q) return false;
      if (v === 'interceptor' && !q) return false;
      if (v === 'witness' && !sh.Minit) v = sh.var = 'threat';
      if (v === 'threat') {
        // riding with the round, out to its side, just above its height, the lens ahead down its path; as the
        // interceptor comes in, round to the far side of the round from it: it comes at the lens past the round
        copy(sh.A, P);
        const D = clamp(Lb * 8.5, 60, 95);
        for (let k = 0; k < 3; k++) { sh.gE[k] = -F[k] * D * .45 + R[k] * D * .85 + UP[k] * D * .07; sh.gL[k] = F[k] * D * .35 + UP[k] * D * .02; }
        const Q = q ? game.projPose(q).pos : null, dq = Q ? dist(P, Q) : 1e9;
        const wt = Q ? ss(6000, 1800, dq) : 0;
        sh.wq = sh.wq === undefined ? wt : sh.wq + (wt - sh.wq) * (1 - Math.exp(-dt * (wt > sh.wq ? 3 : 1.2)));
        if (Q || (sh.uInit && sh.wq > .001)) {
          if (Q && (dq > D * 3 || !sh.uInit)) {
            set(t3, P[0] - Q[0], (P[1] - Q[1]) * .3, P[2] - Q[2]); norm(t3);     // mostly level: the eye stays above the sea
            if (!sh.uQ) sh.uQ = [0, 0, 0];
            mixTo(sh.uQ, t3, sh.uInit ? 1 - Math.exp(-dt * 3) : 1); norm(sh.uQ); sh.uInit = true;
          }
          const u = sh.uQ, w = sh.wq;
          // the side: across the interceptor's line, on the side the camera already is
          set(t4, u[2], 0, -u[0]); norm(t4);
          if (!sh.uSide) sh.uSide = t4[0] * R[0] + t4[2] * R[2] < 0 ? -1 : 1;     // chosen once: no flip-flop
          t4[0] *= sh.uSide; t4[2] *= sh.uSide;
          for (let k = 0; k < 3; k++) {
            const e2 = u[k] * D * .8 + t4[k] * D * .55 + UP[k] * D * .12, l2 = -u[k] * D * .6;
            sh.gE[k] += (e2 - sh.gE[k]) * w; sh.gL[k] += (l2 - sh.gL[k]) * w;
          }
        }
        sh.subj = copy(sh.S, P); sh.aOut = 18 * DEG;
        sh.near = 1.5;
      } else if (v === 'interceptor') {
        const Q = heading2(sh, q, dt), Lq = lenOf(q), Rq = sh.Rq;
        copy(sh.A, Q);
        const D = clamp(Lq * 9, 50, 80);
        // behind the interceptor on its line of sight to the round, a little aside: the interceptor in the foreground,
        // the round ahead in the frame, growing
        set(t3, P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]);
        const dq = norm(t3);
        if (dq > D * 3 || !sh.losInit) { if (!sh.los) sh.los = [0, 0, 1]; mixTo(sh.los, t3, sh.losInit ? 1 - Math.exp(-dt * 3) : 1); norm(sh.los); sh.losInit = true; }
        const S3 = sh.los;
        for (let k = 0; k < 3; k++) { sh.gE[k] = -S3[k] * D * .8 + Rq[k] * D * .45 + UP[k] * D * .12; sh.gL[k] = S3[k] * D * .6; }
        sh.subj = copy(sh.S, Q); sh.aOut = 18 * DEG;
        sh.near = 1.5;
      } else {
        // witness: still, beside the meet point and downstream of it; the round comes at the lens
        if (!sh.wPlaced || (sh.ev > 1.2 && sh.age < 1.2)) {
          sh.wPlaced = true;
          copy(sh.wF, sh.FH); copy(sh.wR, sh.R);
        }
        if (sh.ev > .6) copy(sh.A, sh.M);
        const D = clamp(Lb * 7, 55, 80);
        for (let k = 0; k < 3; k++) sh.gE[k] = sh.wF[k] * D * 1.3 + sh.wR[k] * D + UP[k] * D * .16;
        // the lens on the round while it is far (a long lens), then between the meet point and the round as it comes in
        set(t3, P[0] - sh.A[0], P[1] - sh.A[1], P[2] - sh.A[2]);
        const l = norm(t3), m = Math.min(l, 420) * .45;
        const e = t4; for (let k = 0; k < 3; k++) e[k] = sh.A[k] + sh.gE[k];
        const de = dist(e, P), wf = ss(1500, 450, de);
        for (let k = 0; k < 3; k++) sh.gL[k] = (P[k] - sh.A[k]) + (t3[k] * m - (P[k] - sh.A[k])) * wf;
        if (de < 900) sh.subj = copy(sh.S, P);
        // a long lens on the round while it is far, opening as it arrives
        sh.fov = clamp(.35 + 60 / Math.max(1, de), .35, .85);
        sh.aOut = 17 * DEG;
        sh.near = 2;
      }
      return true;
    },
    /* the mount's view: low behind and beside it, a longer lens up the line of fire */
    gun(sh, dt) {
      const p = projAt(sh.id); if (!p) return false;
      const u = unitAt(sh.unit); if (!u) return false;
      const P = game.projPose(p).pos;
      if (!sh.off) {
        const w = sh.weap || {};
        if (w.mounts) {
          const pose = game.unitPose(u), b = Math.atan2(P[0] - pose.pos[0], P[2] - pose.pos[2]);
          let m = Math.abs(wrapPi(b - pose.hdg)) < Math.PI / 2 ? 0 : 1;
          if (u.off && u.off[w.mounts[m]]) m ^= 1;
          sh.off = (w.mountAt || DDG_MOUNT)[m];
        } else sh.off = w.muzzle || [0, Math.min(12, u.def.size[2] * .8), 0];
      }
      mountAt(u, sh.off, sh.A);
      const A = sh.A, Lu = u.def.size[0];
      set(t3, P[0] - A[0], 0, P[2] - A[2]); norm(t3);
      // over the mount's shoulder: behind it along the line of fire, a little to the side the round comes from and
      // above it; the mount big in a lower corner, the round up the line of fire
      const gb = clamp(Lu * .02 + 6, 7, 10), sd = clamp(u.def.size[1] * .2 + 1, 3, 6);
      const hd = game.unitPose(u).hdg, rx = Math.cos(hd), rz = -Math.sin(hd);
      if (!sh.oside) sh.oside = (P[0] - A[0]) * rx + (P[2] - A[2]) * rz >= 0 ? 1 : -1;     // out over the side the round comes from
      sh.gE[0] = -t3[0] * gb + rx * sh.oside * sd; sh.gE[2] = -t3[2] * gb + rz * sh.oside * sd; sh.gE[1] = 3;
      for (let k = 0; k < 3; k++) t5[k] = A[k] + sh.gE[k];               // the eye
      set(t4, P[0] - t5[0], P[1] - t5[1], P[2] - t5[2]);
      const l = norm(t4), m = Math.min(l, 2500);
      set(t6, A[0] - t5[0], A[1] + 1 - t5[1], A[2] - t5[2]); norm(t6);
      for (let k = 0; k < 3; k++) t4[k] = t4[k] * .74 + t6[k] * .26;
      norm(t4);
      for (let k = 0; k < 3; k++) sh.gL[k] = sh.gE[k] + t4[k] * m;
      const r = predict(game, p, sh.pr);
      sh.ev = Math.min(r.kind === 'gun' ? r.tEv : r.gunSoon, r.tImpact);     // the burst, or the hit if it gets through
      sh.hot = r.kind === 'gun' || r.tImpact < 4;
      if (l < 5000) sh.subj = copy(sh.S, P);
      sh.aOut = 12 * DEG; sh.fov = .65; sh.near = .4;
      return true;
    },
    /* across the target before the round arrives */
    impact(sh, dt) {
      const u = unitAt(sh.tgt); if (!u) return false;
      const p = projAt(sh.id);
      if (!p) return false;                                  // the round hit, or was stopped: the director goes on to that
      const T = centreOf(u, sh.A);
      if (p) {
        const P = game.projPose(p).pos;
        if (sh.appr === undefined) sh.appr = Math.atan2(T[0] - P[0], T[2] - P[2]);
        const d = dist(P, T);
        sh.ev = d / Math.max(80, Math.hypot(p.vel[0], p.vel[1], p.vel[2]));
        copy(sh.S, P); sh.subjOk = d < 1.2 * Math.hypot(sh.gE[0], sh.gE[1], sh.gE[2]);
      } else sh.subjOk = false;
      if (sh.appr === undefined) sh.appr = cam.yaw;
      const sea = u.def.domain === 'sea';
      const n = hullCorners(game.unitPose(u), u.def, HC, 0);
      acrossView(cam, T, HC, n, sh.appr, sh.side, ((sea ? (sh.hi ? 11 : 5.5) : (sh.hi ? 16 : 10)) + sh.raise) * DEG, { min: sea ? 150 : Math.max(30, u.def.size[0] * 2.2) }, t4, t5);
      for (let k = 0; k < 3; k++) { sh.gE[k] = t4[k] - T[k]; sh.gL[k] = t5[k] - T[k]; }
      if (!sea) clearance(sh, t4, T);
      sh.aOut = 19 * DEG;     // no subject limit: the round comes in through the open side of the frame
      return true;
    },
    /* the pieces: a slow orbit round them, or held where the eye was with the lens on them */
    break(sh, dt) {
      const Wd = game.debris && game.debris.world, s = sh;
      let n = 0, ext = 0;
      if (Wd) {
        BW.s = s; BW.n = 0; BW.x = BW.y = BW.z = 0;
        Wd.each(bSum);
        n = BW.n;
        if (n) { BW.x /= n; BW.y /= n; BW.z /= n; BW.ext = 0; Wd.each(bExt); ext = BW.ext; }
      }
      // the anchor: a critically damped spring (real time) from the round's place and speed toward the pieces' own
      // centre (or, before there are pieces, where they would be: the round's line, slowing and falling). It starts
      // with the round's speed, so a camera that rode the round rides on with its pieces with no step, and slows as
      // they do, smoothly.
      const tg = Math.max(0, game.t - s.t0s), kd = .8, dr = Math.exp(-tg * kd), r = rate();
      if (!s.sp) { s.sp = s.pos.slice(); s.sv = [s.vel[0] * r, s.vel[1] * r, s.vel[2] * r]; }
      if (n) { t5[0] = BW.x; t5[1] = BW.y; t5[2] = BW.z; }
      else { for (let i = 0; i < 3; i++) t5[i] = s.pos[i] + s.vel[i] * (1 - dr) / kd; t5[1] -= 2.9 * tg * tg; }
      if (!n) ext = s.L;
      if (dt > 0) {
        // the goal's own speed fed forward (the pieces' line, slowing and falling): no lag behind them
        t6[0] = s.vel[0] * dr * r; t6[1] = (s.vel[1] * dr - 5.8 * tg) * r; t6[2] = s.vel[2] * dr * r;
        for (let i = 0; i < 3; i++) spring(s.sp, s.sv, t5, t6, 2.4, dt, i);
      }
      for (let i = 0; i < 3; i++) { s.c[i] = s.sp[i]; s.cv[i] = s.sv[i]; }
      const g = Math.max(0, game.ground(s.c[0], s.c[2]));
      if (s.c[1] < g + 2) { s.c[1] = s.sp[1] = g + 2; s.cv[1] = s.sv[1] = Math.max(0, s.sv[1]); }
      copy(sh.A, s.c);
      if (s.hold) {
        // held where the eye was (a mount, across a target): the lens on the pieces
        // (the anchor is the eye itself: still; the look rides its spring after the pieces)
        copy(sh.A, s.eyeW);
        sh.gE[0] = sh.gE[1] = sh.gE[2] = 0;
        for (let k = 0; k < 3; k++) sh.gL[k] = s.c[k] - s.eyeW[k];
        sh.fov = s.fovK || 1;
        sh.subj = copy(sh.S, s.c); sh.aOut = 16 * DEG;
        return true;
        sh.near = .5;
      } else {
        const d = clamp(Math.max(s.L * 6, ext * 1.8), 45, 95) * (1 + .15 * ss(2, 7, sh.age));
        s.d0 = s.d0 === undefined ? d : s.d0 + (d - s.d0) * (1 - Math.exp(-dt * 1.2));
        const yaw = s.yaw0 + s.spin * sh.age * .12, pitch = clamp(s.pitch0, 5 * DEG, 18 * DEG);
        orbitOff(sh, yaw, pitch, s.d0);
        sh.near = clamp(s.d0 * .12, .3, 8);
      }
      sh.subj = copy(sh.S, sh.A); sh.aOut = 16 * DEG;
      return true;
    },
    /* held across the target after the hit, slowly up and off its quarter */
    after(sh, dt) {
      const u = sim.units.get(sh.tgt);
      if (!u || u.aboard) return false;
      const T = centreOf(u, sh.A), sea = u.def.domain === 'sea';
      const n = hullCorners(game.unitPose(u), u.def, HC, 0);
      const pull = ss(1.5, 11, sh.age);
      const pitch = ((sea ? 5.5 : 10) + sh.raise + 7 * pull) * DEG, appr = sh.appr + sh.side * .04 * sh.age;
      acrossView(cam, T, HC, n, appr, sh.side, pitch, { min: sea ? 150 : Math.max(30, u.def.size[0] * 2.2), k: 1 + 1.1 * pull, shift: sh.shift || 0 }, t4, t5);
      for (let k = 0; k < 3; k++) { sh.gE[k] = t4[k] - T[k]; sh.gL[k] = t5[k] - T[k]; }
      if (!sea) clearance(sh, t4, T);
      return true;
    },
    site(sh, dt) { return place(sh, dt, false); },
    death(sh, dt) { return place(sh, dt, true); },
    idle(sh, dt) {
      const u = sim.units.get(sh.unit);
      if (!u || !u.alive) return false;
      let n = 0; t3[0] = t3[1] = t3[2] = 0;
      for (const id of sh.group) {
        const g = sim.units.get(id); if (!g || !g.alive || n >= KP.length) continue;
        const p = centreOf(g, KP[n++]); t3[0] += p[0]; t3[1] += p[1]; t3[2] += p[2];
      }
      if (!n) return false;
      sh.A[0] = t3[0] / n; sh.A[1] = t3[1] / n; sh.A[2] = t3[2] / n;
      const pitch = ((sh.sea ? 6 : 12) + sh.raise) * DEG, yaw = sh.yaw0 + sh.age * .03 * sh.side;
      let d = Math.max(sh.sea ? 380 : 120, sh.L * (sh.sea ? 3 : 6));
      if (n > 1) d = Math.max(d, fitDist(cam, sh.A, KP, n, yaw, pitch, .7, .6));
      sh.dI = sh.dI === undefined ? d : sh.dI + (d - sh.dI) * (1 - Math.exp(-dt * .5));
      orbitOff(sh, yaw, pitch, sh.dI);
      if (!sh.sea) clearance(sh, t4, sh.A);
      return true;
    },

    /* a tripod: the eye fixed at sh.P (on a deck, a hill, the sea), the lens panning after the subject as an operator
       would, zooming to hold it at about sh.frac of the frame's height (a long lens on a far round, like range
       footage). sh.subjFn(out) -> the subject's point (false: gone); sh.size its size (m). False once it has been
       gone for a moment (the lens rests on where it was). */
    tripod(sh, dt) {
      copy(sh.A, sh.P);
      if (sh.ride) { const u = sim.units.get(sh.ride); if (u && u.alive) { mountAt(u, sh.rideOff, sh.A); copy(sh.P, sh.A); } }
      const ok = sh.subjFn(t3);
      if (ok) { copy(sh.last || (sh.last = V3()), t3); sh.lost = 0; }
      else { if (!sh.last) return false; if (!sh.lost) sh.lost = game.realT; if (game.realT - sh.lost > (sh.linger || 2.5)) return false; copy(t3, sh.last); }
      sh.gE[0] = sh.gE[1] = sh.gE[2] = 0;
      // the lens leads a moving subject a little (room ahead of it in the frame, as an operator frames a pass)
      const lp = sh.subjId ? projAt(sh.subjId) : null, r = rate();
      const d = Math.max(1, Math.hypot(t3[0] - sh.A[0], t3[1] - sh.A[1], t3[2] - sh.A[2]));
      // (at most a quarter of the half frame: on a long lens the room ahead is a few metres)
      let lx = 0, ly = 0, lz = 0;
      if (lp && lp.vel) {
        lx = lp.vel[0] * r * .22; ly = lp.vel[1] * r * .22; lz = lp.vel[2] * r * .22;
        const ll = Math.hypot(lx, ly, lz), cap = .25 * d * Math.tan((cam.fov0 !== undefined ? cam.fov0 : cam.fov) * (sh.fov || 1) / 2);
        if (ll > cap) { const f = cap / ll; lx *= f; ly *= f; lz *= f; }
      }
      sh.gL[0] = t3[0] - sh.A[0] + lx; sh.gL[1] = t3[1] - sh.A[1] + ly; sh.gL[2] = t3[2] - sh.A[2] + lz;
      // the zoom: the subject's angular size over the share of the frame it should fill (log-smoothed, slower in than out)
      const f0 = cam.fov0 !== undefined ? cam.fov0 : cam.fov;
      // (gone: the lens opens on the place, the burst and its pieces)
      const sz = sh.lost ? Math.max(sh.size || 8, 70) : Math.max(sh.size || 8, 1);
      const want = clamp(sz / d / (sh.frac || .12) / f0, sh.kMin || .05, sh.kMax || 1);
      const lw = Math.log(want);
      sh.lk = sh.lk === undefined ? lw : sh.lk + (lw - sh.lk) * (1 - Math.exp(-dt * (lw > sh.lk ? 1.6 : .8)));
      sh.fov = Math.exp(sh.lk);
      sh.subj = copy(sh.S, t3); sh.aOut = 14 * DEG;
      sh.near = clamp(d * .01, .3, 20);
      return true;
    },
    /* a flyby: the eye still beside the subject's path ahead of it; it comes at the lens and goes past (a whip pan).
       done once it is well past. */
    flyby(sh, dt) {
      const p = sh.id ? projAt(sh.id) : null, u = !p && sh.unit ? unitAt(sh.unit) : null;
      if (!p && !u) return false;
      const P = p ? game.projPose(p).pos : centreOf(u, t3), v = p ? p.vel : unitVel(u, t5);
      if (!sh.placed) {
        sh.placed = true;
        const r = rate() || 1, sp = Math.hypot(v[0], v[1], v[2]), vr = p ? r : 1;     // unitVel is per real s already
        const ahead = sh.ahead || 2.4, L0 = p ? lenOf(p) : u.def.size[0];
        // where it will be `ahead` real seconds from now, then out to the side and a little up
        const hx = sp > 1 ? v[0] / sp : Math.sin(cam.yaw), hz = sp > 1 ? v[2] / sp : Math.cos(cam.yaw), hh = Math.hypot(hx, hz) || 1;
        // out far enough that the pass reads (its peak turn about 1.4 rad/s at the slow rate the pass is seen at)
        const vs = sp * (p ? Math.min(r, .3) : 1);
        const off = clamp(Math.max(sh.off || L0 * 3 + 8, vs / 1.4), 10, 420), s = sh.side || 1;
        sh.A[0] = P[0] + v[0] * vr * ahead + hz / hh * off * s; sh.A[1] = P[1] + v[1] * vr * ahead + off * .18; sh.A[2] = P[2] + v[2] * vr * ahead - hx / hh * off * s;
        const g = Math.max(0, game.ground(sh.A[0], sh.A[2]));
        if (sh.A[1] < g + 3) sh.A[1] = g + 3;
        sh.off0 = off; sh.L0 = L0;
      }
      sh.gE[0] = sh.gE[1] = sh.gE[2] = 0;
      for (let k = 0; k < 3; k++) sh.gL[k] = P[k] - sh.A[k];
      const d = Math.hypot(sh.gL[0], sh.gL[1], sh.gL[2]);
      // past it: the subject going away from the lens
      const away = v[0] * sh.gL[0] + v[1] * sh.gL[1] + v[2] * sh.gL[2] > 0;
      if (away && d > sh.off0 * 6) sh.done = true;
      // the moment: its closest pass (game s)
      const vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
      sh.ev = !away && vv > 1 && p ? (v[0] * sh.gL[0] + v[1] * sh.gL[1] + v[2] * sh.gL[2]) / -vv : 1e9;
      sh.evKind = 'flyby';
      if (sh.age > (sh.ahead || 2.4) * 3 + 4) sh.done = true;
      sh.subj = copy(sh.S, P); sh.aOut = 22 * DEG; sh.fov = sh.k || clamp(sh.off0 / 260, .45, .85);
      sh.near = clamp(Math.min(d, sh.off0) * .05, .3, 4);
      return true;
    },
    /* a dolly along a unit: the eye travels beside her from ahead of the bow to past the stern (or back), low, the lens
       on her as she goes by. done at the end of the travel. */
    dolly(sh, dt) {
      const u = unitAt(sh.unit); if (!u) return false;
      const pose = game.unitPose(u), L0 = u.def.size[0], H = u.def.size[2], sea = u.def.domain === 'sea';
      centreOf(u, sh.A);
      const fx = Math.sin(pose.hdg), fz = Math.cos(pose.hdg), s = sh.side || 1;
      // the travel: a steady speed, eased in and out over its first and last 15 % (a trapezoid of speed)
      const T = sh.dur || 12, k = clamp(sh.age / T, 0, 1), a = .15, vm = 1 / (1 - a);
      const e = k < a ? vm * k * k / (2 * a) : k > 1 - a ? 1 - vm * (1 - k) * (1 - k) / (2 * a) : vm * (k - a / 2);
      const along = L0 * (.85 - 1.7 * e) * (sh.dir || 1);
      const D = sh.D || (sea ? clamp(L0 * .55, 30, 160) : clamp(L0 * 1.4, 10, 40)), h = sh.h || (sea ? clamp(H * .35, 5, 18) : clamp(H * .5, 1.6, 6));
      sh.gE[0] = fx * along + fz * D * s; sh.gE[2] = fz * along - fx * D * s; sh.gE[1] = h - Math.min(H * .28, 12);
      const look = along * .3;
      sh.gL[0] = fx * look; sh.gL[2] = fz * look; sh.gL[1] = 0;
      if (sh.age > T) sh.done = true;
      sh.aOut = 26 * DEG; sh.near = .5;
      if (!sea) clearance(sh, t4, sh.A);
      sh.gE[1] += sh.raise * D * .02;
      return true;
    },
    /* a crane: from low by the unit up and back over her, turning a little (a reveal) */
    crane(sh, dt) {
      const u = unitAt(sh.unit); if (!u) return false;
      centreOf(u, sh.A);
      const L0 = Math.max(u.def.size[0], 8), sea = u.def.domain === 'sea', T = sh.dur || 11, k = smootherK(clamp(sh.age / T, 0, 1));
      const yaw = sh.yaw0 + (sh.side || 1) * .45 * k, pitch = (3 + 30 * k) * DEG, d = L0 * (sea ? .75 + 1.1 * k : 1.6 + 2 * k);
      orbitOff(sh, yaw, pitch, Math.max(d, sea ? 60 : 18));
      if (sh.age > T) sh.done = true;
      sh.aOut = 22 * DEG; sh.near = .5;
      if (!sea) clearance(sh, t4, sh.A);
      return true;
    },
    /* the whole engagement in one frame: high and wide over the points sh.ptsFn(KP) -> n (rounds, their targets, the
       defence); the centre and the distance ease (an anchor that never jumps), the heading drifts */
    wide(sh, dt) {
      const n = sh.ptsFn(KP);
      if (!n) { if (!sh.hasC) return false; }
      else {
        let x = 0, y = 0, z = 0;
        for (let i = 0; i < n; i++) { x += KP[i][0]; y += KP[i][1]; z += KP[i][2]; }
        x /= n; y /= n; z /= n;
        if (!sh.hasC) { sh.C = [x, y, z]; sh.hasC = true; }
        const kk = 1 - Math.exp(-dt * .45);
        sh.C[0] += (x - sh.C[0]) * kk; sh.C[1] += (y - sh.C[1]) * kk; sh.C[2] += (z - sh.C[2]) * kk;
      }
      copy(sh.A, sh.C);
      const yaw = sh.yaw0 + sh.age * .012 * (sh.side || 1), pitch = (sh.pitch || 30) * DEG;
      let d = sh.dMin || 900;
      if (n) d = Math.max(d, fitDist(cam, sh.A, KP, n, yaw, pitch, .72, .62));
      d = Math.min(d, sh.dMax || 60000);
      const ld = Math.log(d);
      sh.ld = sh.ld === undefined ? ld : sh.ld + (ld - sh.ld) * (1 - Math.exp(-dt * (ld > sh.ld ? .7 : .35)));
      orbitOff(sh, yaw, pitch, Math.exp(sh.ld));
      sh.raw = true; sh.aOut = 40 * DEG; sh.near = clamp(Math.exp(sh.ld) * .01, 1, 60);
      return true;
    },
    /* two subjects in one frame from the side of the line between them: a round and the gun or launcher firing at it,
       a round and its interceptor. sh.aFn / sh.bFn (out) -> false when gone; the frame closes in as they close. */
    twoshot(sh, dt) {
      if (!sh.aFn(t3)) return false;
      if (!sh.bFn(t4)) return false;
      for (let k = 0; k < 3; k++) sh.A[k] = (t3[k] + t4[k]) / 2;
      set(t5, t4[0] - t3[0], 0, t4[2] - t3[2]);
      const sep = Math.hypot(t4[0] - t3[0], t4[1] - t3[1], t4[2] - t3[2]);
      if (Math.hypot(t5[0], t5[2]) > 1) { norm(t5); if (!sh.ax) sh.ax = t5.slice(); else { const kk = 1 - Math.exp(-dt * 1.5); mixTo(sh.ax, t5, kk); norm(sh.ax); } }
      const ax = sh.ax || [1, 0, 0], s = sh.side || 1;
      const nx = ax[2] * s, nz = -ax[0] * s;
      // out to the side, a little behind the round (sh.back: toward a), above them
      const yaw = Math.atan2(-nx, -nz) + (sh.skew || .35) * s, pitch = (sh.pitch || 9) * DEG;
      KP[0][0] = t3[0]; KP[0][1] = t3[1]; KP[0][2] = t3[2]; KP[1][0] = t4[0]; KP[1][1] = t4[1]; KP[1][2] = t4[2];
      let d = Math.max(sh.dMin || 60, fitDist(cam, sh.A, KP, 2, yaw, pitch, .62, .5));
      d = Math.min(d, 9000);
      const ld = Math.log(d);
      sh.ld = sh.ld === undefined ? ld : sh.ld + (ld - sh.ld) * (1 - Math.exp(-dt * 1.4));
      orbitOff(sh, yaw, pitch, Math.exp(sh.ld));
      const g = Math.max(0, game.ground(t4[0] = sh.A[0] + sh.gE[0], t4[2] = sh.A[2] + sh.gE[2]));
      if (sh.A[1] + sh.gE[1] < g + 4) sh.gE[1] = g + 4 - sh.A[1];
      sh.sep = sep;
      sh.aOut = 24 * DEG; sh.near = clamp(Math.exp(sh.ld) * .02, .5, 20);
      return true;
    },
  };
  const smootherK = u => { u = clamp(u, 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };
  /* the debris bodies born with a break-up (its window of birth times, within 700 m): their centre, their spread */
  const BW = { s: null, n: 0, x: 0, y: 0, z: 0, ext: 0 };
  function bSum(b) {
    const s = BW.s;
    if (b.t0 < s.t0s - .3 || b.t0 > s.t0s + 2.2) return;
    const dx = b.p[0] - s.c[0], dy = b.p[1] - s.c[1], dz = b.p[2] - s.c[2];
    if (dx * dx + dy * dy + dz * dz > 700 * 700) return;
    BW.x += b.p[0]; BW.y += b.p[1]; BW.z += b.p[2]; BW.n++;
  }
  function bExt(b) {
    const s = BW.s;
    if (b.t0 < s.t0s - .3 || b.t0 > s.t0s + 2.2) return;
    const d = Math.hypot(b.p[0] - BW.x, b.p[1] - BW.y, b.p[2] - BW.z);
    if (d < 700 && d > BW.ext) BW.ext = d;
  }
  /* a slow low orbit of a place (a hit, an intercept seen after the fact, a loss) */
  function place(sh, dt, death) {
    const u = sh.unit ? sim.units.get(sh.unit) : null;
    if (u && !u.aboard) centreOf(u, sh.pos);
    copy(sh.A, sh.pos);
    const sea = sh.sea, pull = ss(2, death ? 20 : 12, sh.age);
    const pitch = ((sea ? (death ? 4.5 : 7) : 13) + sh.raise + 4 * pull) * DEG;
    const base = death ? (sea ? Math.max(210, sh.L * 2.4) : Math.max(80, sh.L * 6)) : Math.max(sea ? 200 : 120, sh.L * 3.2);
    orbitOff(sh, sh.yaw0 + sh.age * (death ? .035 : .05) * sh.side, pitch, base * (1 + .6 * pull));
    if (sh.shift) shiftLook(sh, sh.shift, base);
    if (!sea) clearance(sh, t4, sh.A);
    return true;
  }
  /* eye on an orbit (yaw, pitch, d) round the anchor, the lens on it */
  function orbitOff(sh, yaw, pitch, d) {
    const cp = Math.cos(pitch);
    sh.gE[0] = -Math.sin(yaw) * cp * d; sh.gE[1] = Math.sin(pitch) * d; sh.gE[2] = -Math.cos(yaw) * cp * d;
    sh.gL[0] = sh.gL[1] = sh.gL[2] = 0;
    for (let k = 0; k < 3; k++) t4[k] = sh.A[k] + sh.gE[k];
  }
  /* the end screen covers the left: the subject right of centre */
  function shiftLook(sh, k, d) {
    const yaw = Math.atan2(-sh.gE[0], -sh.gE[2]), tx = Math.tan(cam.fov / 2) * cam.W / Math.max(1, cam.H);
    const dx = -Math.cos(yaw) * k * d * tx, dz = Math.sin(yaw) * k * d * tx;
    sh.gL[0] += dx; sh.gL[2] += dz; sh.gE[0] += dx; sh.gE[2] += dz;
  }
  /* land shots rise until the line of sight clears the ground (checked twice a second; the springs ease the rise) */
  function clearance(sh, eye, target) {
    if (game.realT < sh.chk) return;
    sh.chk = game.realT + .5;
    const b = blockedBy(game.ground, eye, target);
    if (b > -3) sh.raise = Math.min(30, sh.raise + 4);
    else if (b < -40 && sh.raise > 0) sh.raise = Math.max(0, sh.raise - 1);
  }
  /* the interceptor's own smoothed direction */
  function heading2(sh, q, dt) {
    const v = q.vel, pp = game.projPose(q);
    const sp = v ? Math.hypot(v[0], v[1], v[2]) : 0;
    const Fq = sh.Fq || (sh.Fq = [0, 0, 1]), Rq = sh.Rq || (sh.Rq = [1, 0, 0]);
    if (sp > 1) {
      if (!sh.fqInit) { Fq[0] = v[0] / sp; Fq[1] = v[1] / sp; Fq[2] = v[2] / sp; sh.fqInit = true; }
      else { const k = 1 - Math.exp(-dt * 4); Fq[0] += (v[0] / sp - Fq[0]) * k; Fq[1] += (v[1] / sp - Fq[1]) * k; Fq[2] += (v[2] / sp - Fq[2]) * k; norm(Fq); }
    }
    const h = Math.hypot(Fq[0], Fq[2]) || 1;
    Rq[0] = Fq[2] / h * sh.side; Rq[1] = 0; Rq[2] = -Fq[0] / h * sh.side;
    return pp.pos;
  }

  return { make, step, projAnchor, unitAnchor, fixedAnchor, centreOf, lenOf, tgtPoint, closing, mountAt };
}

function set(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; }
function copy(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; }
function norm(o) { const l = Math.hypot(o[0], o[1], o[2]) || 1; o[0] /= l; o[1] /= l; o[2] /= l; return l; }
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
/* unit a toward unit b by u, along the great circle (into a) */
function slerpU(a, b, u) {
  const c = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
  if (c > .9995) { for (let k = 0; k < 3; k++) a[k] += (b[k] - a[k]) * u; norm(a); return a; }
  const th = Math.acos(c), s = Math.sin(th), wa = Math.sin((1 - u) * th) / s, wb = Math.sin(u * th) / s;
  for (let k = 0; k < 3; k++) a[k] = a[k] * wa + b[k] * wb;
  norm(a); return a;
}
function mixTo(o, a, k) { o[0] += (a[0] - o[0]) * k; o[1] += (a[1] - o[1]) * k; o[2] += (a[2] - o[2]) * k; }
/* mixTo, the step no longer than max (m) */
function moveTo(o, a, k, max) {
  let x = (a[0] - o[0]) * k, y = (a[1] - o[1]) * k, z = (a[2] - o[2]) * k;
  const l = Math.hypot(x, y, z);
  if (l > max) { const f = max / l; x *= f; y *= f; z *= f; }
  o[0] += x; o[1] += y; o[2] += z;
}
