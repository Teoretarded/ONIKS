/* The rigid-body world of the debris: a pool of bodies (hard cap), each integrated on its own fixed step from its own
   birth time (semi-implicit Euler), so a piece's flight depends only on how it was thrown, never on the frame rate or
   the time rate; drawn by interpolating its last two steps.

   A body: a box of half extents h (the module's bounds, model axes), mass m, inertia from the box, centre of mass c
   (model space). State: p (world, the centre of mass), v, q (model -> world), w (world angular velocity).
   Modes:
     AIR    flying: gravity; quadratic drag per face (each face resists motion along its normal, a flat plate turned
            to the air stops fast, edge-on it slices on), skin friction, the face's pressure centre ahead of its middle
            (a plate pitches up: it flutters and tumbles), aerodynamic damping of the spin
     HINGE  toppling about a foot on a moving base (a mast going over the side), released past an angle
     SEA    in the water: floating (bobbing, lying flat, drifting) or sinking out of sight
     REST   settled on the ground: stays as a wreck piece
     FOLLOW kinematic: its place comes from outside (a round still flying in the sim), its own spin integrated
   Contacts: the ground (box corners against the drawn ground's plane: restitution falling with speed, Coulomb friction,
   then sleep), the sea (a splash; fast shallow entries skip off the water). Events come back through hooks
   (onWater, onGround, onSkip) so the effects are laid where and when the physics had them happen. */
import { qTurn, qMat, sat, clamp } from './math.js';

export const AIR = 1, HINGE = 2, SEA = 3, REST = 4, FOLLOW = 5, GONE = 0;
const G = 9.81;
const CD = 1.1, CF = .035;                      // face drag, skin friction
const CAP_DEFAULT = 400;

function newBody(i) {
  return {
    i, on: false, mode: GONE, kind: 0, seed: 0, gen: 0,
    t0: 0, tl: 0, pt: 0, h: 1 / 60,
    p: [0, 0, 0], v: [0, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0],
    pp: [0, 0, 0], pq: [1, 0, 0, 0],
    m: 1, I: [1, 1, 1], ext: [1, 1, 1], A: [1, 1, 1], c: [0, 0, 0], r: 1, plate: false, aero: true,
    M: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    rest: 0, restT: -1, wetT: -1, skips: 0, floatT: 0, sinkV: 2, draft: 0, bounces: 0,
    hinge: null, follow: null, dead: -1, life: 240,
    // owner data (drawing, smoke, the break-up it belongs to)
    o: null,
  };
}

export class World {
  constructor(o) {
    o = o || {};
    this.cap = o.cap || CAP_DEFAULT;
    this.B = [];
    this.free = [];
    this.n = 0;
    this.gen = 0;
    this.ground = o.ground || (() => 0);           // drawn ground height (0 over water)
    this.wet = o.wet || (() => true);               // is (x, z) water
    this.normal = o.normal || null;                 // ground normal at (x, z) -> [nx, ny, nz]
    this.wind = [0, 0];
    this.hooks = { onWater: null, onGround: null, onSkip: null, onRest: null, onFree: null, evict: null };
    this.collide = null;                            // (b, h) -> true when it handled a contact this step (ship hulls)
    this.soft = 0;                                  // the live cap under the hard one (0: the hard cap)
    this.next = 0;
    this.stats = { bodies: 0, steps: 0, ms: 0 };
    this._M = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
  /* a body from the pool (the oldest settled piece, else the farthest from the eye, gives way when it is full) */
  /* soft: the live cap (the auto-quality guard lowers it); noEvict: take a free body or none (shards never push a
     module out) */
  alloc(eye, noEvict) {
    let b;
    const full = this.n >= Math.min(this.cap, this.soft || this.cap);
    if (full) { if (noEvict) return null; b = this.evictOne(eye); }
    else if (this.free.length) b = this.B[this.free.pop()];
    else if (this.B.length < this.cap) { b = newBody(this.B.length); this.B.push(b); }
    else { if (noEvict) return null; b = this.evictOne(eye); }
    if (!b) return null;
    b.on = true; b.gen = ++this.gen; b.hinge = null; b.follow = null; b.o = null; b.dead = -1;
    b.rest = 0; b.restT = -1; b.wetT = -1; b.skips = 0; b.bounces = 0; b.floatT = 0;
    b.w[0] = b.w[1] = b.w[2] = 0; b.v[0] = b.v[1] = b.v[2] = 0;
    this.n++;
    return b;
  }
  evictOne(eye) {
    // settled or sunk first (oldest), then the farthest flying piece (shards before modules)
    let best = null, bs = -1e18;
    for (const b of this.B) {
      if (!b.on || b.mode === FOLLOW) continue;
      const d = eye ? Math.hypot(b.p[0] - eye[0], b.p[1] - eye[1], b.p[2] - eye[2]) : 0;
      const s = (b.mode === REST || b.mode === SEA ? 1e9 : 0) + (b.kind === 1 ? 1e6 : 0) + d - b.t0 * 10;
      if (s > bs) { bs = s; best = b; }
    }
    if (!best) return null;
    this.release(best);
    this.free.pop();          // release() put it on the free list: take it straight back
    return best;
  }
  release(b) {
    if (!b.on) return;
    if (this.hooks.onFree) this.hooks.onFree(b);
    b.on = false; b.mode = GONE; b.o = null; b.follow = null; b.hinge = null;
    this.n--;
    this.free.push(b.i);
  }
  /* shape and mass: half extents (model axes), mass; plate: a thin piece (flutters) */
  shape(b, hx, hy, hz, m, plate) {
    const e = b.ext;
    e[0] = Math.max(.01, hx); e[1] = Math.max(.01, hy); e[2] = Math.max(.01, hz);
    b.m = Math.max(.01, m);
    b.A[0] = 4 * e[1] * e[2]; b.A[1] = 4 * e[0] * e[2]; b.A[2] = 4 * e[0] * e[1];
    const k = b.m / 3;
    b.I[0] = k * (e[1] * e[1] + e[2] * e[2]); b.I[1] = k * (e[0] * e[0] + e[2] * e[2]); b.I[2] = k * (e[0] * e[0] + e[1] * e[1]);
    b.r = Math.hypot(e[0], e[1], e[2]);
    b.plate = !!plate;
    // the spin's aerodynamic damping, per unit air density (quadratic in the spin) and per unit rho x speed, over I
    const A = b.A, I = b.I, D = b.Dk || (b.Dk = [0, 0, 0, 0, 0, 0]);
    D[0] = .5 * CD * e[0] * (e[1] ** 4 + e[2] ** 4) / I[0]; D[1] = .5 * CD * e[1] * (e[0] ** 4 + e[2] ** 4) / I[1]; D[2] = .5 * CD * e[2] * (e[0] ** 4 + e[1] ** 4) / I[2];
    D[3] = .1 * (A[1] * e[2] * e[2] + A[2] * e[1] * e[1]) / I[0]; D[4] = .1 * (A[0] * e[2] * e[2] + A[2] * e[0] * e[0]) / I[1]; D[5] = .1 * (A[0] * e[1] * e[1] + A[1] * e[0] * e[0]) / I[2];
    return b;
  }
  /* put a body in flight at time t0 with its state (copied) */
  launch(b, t0, h, p, v, q, w) {
    b.t0 = b.tl = b.pt = t0; b.h = h;
    for (let k = 0; k < 3; k++) { b.p[k] = b.pp[k] = p[k]; b.v[k] = v[k]; b.w[k] = w ? w[k] : 0; }
    for (let k = 0; k < 4; k++) b.q[k] = b.pq[k] = q[k];
    b.mode = AIR;
    return b;
  }

  /* ---------------- stepping ---------------- */
  /* bring every body to time t (steps of its own h; the state just past t is kept with the one before it) */
  advance(t, budgetMs) {
    const t0 = performance.now();
    let steps = 0, nb = 0;
    const B = this.B, N = B.length;
    // a budget cut leaves the rest for next frame: start where the last one stopped, so none of them starves
    const i0 = this.next < N ? this.next : 0;
    this.next = 0;
    for (let j = 0; j < N; j++) {
      const i = (i0 + j) % N, b = B[i];
      if (!b.on) continue;
      nb++;
      if (b.mode === REST || b.mode === FOLLOW) { if (b.mode === REST && b.restT >= 0 && t - b.restT > b.life) this.release(b); continue; }
      if (b.dead >= 0 && t >= b.dead) { this.release(b); continue; }
      // a piece far behind (a long pause of the page): skip ahead rather than grind
      if (t - b.tl > 30) { const n = Math.floor((t - b.tl) / b.h) - 2; b.tl += n * b.h; b.pt = b.tl - b.h; }
      let guard = 0;
      while (b.tl < t && guard++ < 4000) {
        b.pp[0] = b.p[0]; b.pp[1] = b.p[1]; b.pp[2] = b.p[2];
        b.pq[0] = b.q[0]; b.pq[1] = b.q[1]; b.pq[2] = b.q[2]; b.pq[3] = b.q[3];
        b.pt = b.tl;
        this.step(b, b.h);
        b.tl += b.h;
        steps++;
        if (!b.on || b.mode === REST || b.mode === FOLLOW) break;
      }
      // over the frame's budget (a huge burst at x32): the rest catch up next frame, drawn where they are meanwhile
      if (budgetMs && (nb & 3) === 0 && performance.now() - t0 > budgetMs) { this.next = (i + 1) % N; break; }
    }
    this.stats.bodies = nb; this.stats.steps = steps; this.stats.ms = performance.now() - t0;
  }

  step(b, h) {
    if (b.mode === AIR) { if (b.kind === 1) this.stepChip(b, h); else this.stepAir(b, h); }
    else if (b.mode === HINGE) this.stepHinge(b, h);
    else if (b.mode === SEA) this.stepSea(b, h);
  }

  stepAir(b, h) {
    const p = b.p, v = b.v, w = b.w, M = qMat(b.q, b.M), e = b.ext, A = b.A, m = b.m;
    const y = p[1];
    const rho = 1.225 * Math.exp(-Math.max(0, y) / 8500);
    // the air moves with the wind (stronger with height)
    const wk = 1 + Math.max(0, y) / 300, wx = this.wind[0] * wk, wz = this.wind[1] * wk;
    const rx = v[0] - wx, ry = v[1], rz = v[2] - wz;
    const sp = Math.hypot(rx, ry, rz);
    // body-axis velocity
    let b0 = M[0] * rx + M[3] * ry + M[6] * rz, b1 = M[1] * rx + M[4] * ry + M[7] * rz, b2 = M[2] * rx + M[5] * ry + M[8] * rz;
    const kq = .5 * rho * CD / m;
    const k0 = kq * A[0], k1 = kq * A[1], k2 = kq * A[2];
    // the faces' normal forces (for the torque, from the velocity before the step)
    const f0 = -m * k0 * Math.abs(b0) * b0, f1 = -m * k1 * Math.abs(b1) * b1, f2 = -m * k2 * Math.abs(b2) * b2;
    // implicit per face (a light chip stops, never flips back), then skin friction along the whole velocity
    const n0 = b0 / (1 + k0 * Math.abs(b0) * h), n1 = b1 / (1 + k1 * Math.abs(b1) * h), n2 = b2 / (1 + k2 * Math.abs(b2) * h);
    const kf = .5 * rho * CF * (A[0] + A[1] + A[2]) / m, ff = 1 / (1 + kf * sp * h);
    v[0] = (M[0] * n0 + M[1] * n1 + M[2] * n2) * ff + wx;
    v[1] = (M[3] * n0 + M[4] * n1 + M[5] * n2) * ff - G * h;
    v[2] = (M[6] * n0 + M[7] * n1 + M[8] * n2) * ff + wz;
    p[0] += v[0] * h; p[1] += v[1] * h; p[2] += v[2] * h;
    // spin: body frame
    let o0 = M[0] * w[0] + M[3] * w[1] + M[6] * w[2], o1 = M[1] * w[0] + M[4] * w[1] + M[7] * w[2], o2 = M[2] * w[0] + M[5] * w[1] + M[8] * w[2];
    const I = b.I;
    if (b.aero && sp > .5) {
      // pressure centres ahead of each face's middle (toward the leading edge): the classic pitch-up of a plate
      const kcp = b.plate ? .5 : .3, is = 1 / sp;
      const a0 = kcp * e[0] * b0 * is, a1 = kcp * e[1] * b1 * is, a2 = kcp * e[2] * b2 * is;
      let t0 = a1 * f2 - a2 * f1, t1 = a2 * f0 - a0 * f2, t2 = a0 * f1 - a1 * f0;
      // a torque that would turn it more than ~0.6 rad/s in one step is the stiff limit of a light plate: capped
      const cap = .6 / h;
      t0 = clamp(t0 / I[0], -cap, cap); t1 = clamp(t1 / I[1], -cap, cap); t2 = clamp(t2 / I[2], -cap, cap);
      o0 += t0 * h; o1 += t1 * h; o2 += t2 * h;
    }
    // gyroscopic: w' = I^-1 (-w x I w), the energy kept (explicit Euler would pump it)
    const L0 = I[0] * o0, L1 = I[1] * o1, L2 = I[2] * o2;
    const E0 = o0 * L0 + o1 * L1 + o2 * L2;
    o0 -= (o1 * L2 - o2 * L1) / I[0] * h; o1 -= (o2 * L0 - o0 * L2) / I[1] * h; o2 -= (o0 * L1 - o1 * L0) / I[2] * h;
    const E1 = I[0] * o0 * o0 + I[1] * o1 * o1 + I[2] * o2 * o2;
    if (E1 > E0 && E1 > 1e-12) { const s = Math.sqrt(E0 / E1); o0 *= s; o1 *= s; o2 *= s; }
    // aerodynamic damping of the spin (rotating plates push air), implicit
    const Dk = b.Dk, rs = rho * sp;
    o0 /= 1 + (Dk[0] * rho * Math.abs(o0) + Dk[3] * rs) * h;
    o1 /= 1 + (Dk[1] * rho * Math.abs(o1) + Dk[4] * rs) * h;
    o2 /= 1 + (Dk[2] * rho * Math.abs(o2) + Dk[5] * rs) * h;
    // back to world
    w[0] = M[0] * o0 + M[1] * o1 + M[2] * o2; w[1] = M[3] * o0 + M[4] * o1 + M[5] * o2; w[2] = M[6] * o0 + M[7] * o1 + M[8] * o2;
    const wl = Math.hypot(w[0], w[1], w[2]), wmax = b.kind === 1 ? 70 : 30;
    if (wl > wmax) { const s = wmax / wl; w[0] *= s; w[1] *= s; w[2] *= s; }
    qTurn(b.q, w[0], w[1], w[2], h);
    this.contacts(b, h);
  }

  /* a shard: the same flight, cheaper (drag from its mean area, its spin kept, lightly damped) */
  stepChip(b, h) {
    const p = b.p, v = b.v, w = b.w;
    const rho = 1.225 * Math.exp(-Math.max(0, p[1]) / 8500);
    const wk = 1 + Math.max(0, p[1]) / 300, wx = this.wind[0] * wk, wz = this.wind[1] * wk;
    const rx = v[0] - wx, ry = v[1], rz = v[2] - wz, sp = Math.hypot(rx, ry, rz);
    // a tumbling plate shows about half its face to the air on average
    const k = .5 * rho * CD * (b.A[2] * .55 + b.A[0] * .05) / b.m, f = 1 / (1 + k * sp * h);
    v[0] = rx * f + wx; v[1] = ry * f - G * h; v[2] = rz * f + wz;
    p[0] += v[0] * h; p[1] += v[1] * h; p[2] += v[2] * h;
    const wl = Math.hypot(w[0], w[1], w[2]), dmp = Math.min(1 / (1 + .6 * h), 70 / Math.max(70, wl));
    w[0] *= dmp; w[1] *= dmp; w[2] *= dmp;
    qTurn(b.q, w[0], w[1], w[2], h);
    if (p[1] < 160) { qMat(b.q, b.M); this.contacts(b, h); }
  }

  /* the ground and the sea under the piece */
  contacts(b, h) {
    const p = b.p, x = p[0], z = p[2];
    if (p[1] > 400 + b.r) return;
    // the hulls of ships (the owner's test: a piece striking a side, landing on a deck)
    if (this.collide && p[1] < 90 + b.r && this.collide(b, h)) return;
    const wet = this.wet(x, z);
    if (wet) {
      // the lowest point of the box reaches the sea (the physics' sea is level; the swell is drawn on top)
      const low = p[1] - this.reach(b, 0, 1, 0);
      if (low <= 0) this.water(b, h);
      return;
    }
    const g = this.ground(x, z);
    if (p[1] - b.r > g + .01) return;
    let nx = 0, ny = 1, nz = 0;
    if (this.normal) { const n = this.normal(x, z); if (n) { nx = n[0]; ny = n[1]; nz = n[2]; } }
    this.ground1(b, h, g, nx, ny, nz);
  }
  /* support of the box along a world direction (its extent that way from the centre) */
  reach(b, dx, dy, dz) {
    const M = b.M, e = b.ext;
    return Math.abs(M[0] * dx + M[3] * dy + M[6] * dz) * e[0] + Math.abs(M[1] * dx + M[4] * dy + M[7] * dz) * e[1] + Math.abs(M[2] * dx + M[5] * dy + M[8] * dz) * e[2];
  }

  /* the corners that went into the ground: impulses at each (restitution falls with speed, Coulomb friction), the
     box pushed out, then asleep once it is still */
  ground1(b, h, g, nx, ny, nz) {
    const M = b.M, e = b.ext, p = b.p, v = b.v, w = b.w, m = b.m, I = b.I;
    let deepest = 0, hit = false, impact = 0;
    for (let it = 0; it < 2; it++) {
      for (let c = 0; c < 8; c++) {
        const sx = c & 1 ? e[0] : -e[0], sy = c & 2 ? e[1] : -e[1], sz = c & 4 ? e[2] : -e[2];
        const rx = M[0] * sx + M[1] * sy + M[2] * sz, ry = M[3] * sx + M[4] * sy + M[5] * sz, rz = M[6] * sx + M[7] * sy + M[8] * sz;
        // depth of the corner under the ground's plane through (p.x, g, p.z)
        const pen = ny * (g - p[1] - ry) - nx * rx - nz * rz;
        if (pen <= 0) continue;
        if (pen > deepest) deepest = pen;
        // velocity of the corner
        const cvx = v[0] + w[1] * rz - w[2] * ry, cvy = v[1] + w[2] * rx - w[0] * rz, cvz = v[2] + w[0] * ry - w[1] * rx;
        const vn = cvx * nx + cvy * ny + cvz * nz;
        if (vn >= 0) continue;
        hit = true; if (-vn > impact) impact = -vn;
        const e0 = .38 * Math.exp(-(-vn) / 25) * (b.bounces > 3 ? .3 : 1);
        // effective mass along n: 1/m + n . ((I^-1 (r x n)) x r), with I^-1 in world from the body diagonal
        const kn = 1 / m + this.angK(b, rx, ry, rz, nx, ny, nz);
        const jn = -(1 + e0) * vn / kn;
        // friction
        let tx = cvx - vn * nx, ty = cvy - vn * ny, tz = cvz - vn * nz;
        const vt = Math.hypot(tx, ty, tz);
        let jt = 0;
        if (vt > 1e-4) {
          tx /= vt; ty /= vt; tz /= vt;
          const kt = 1 / m + this.angK(b, rx, ry, rz, tx, ty, tz);
          jt = Math.min(vt / kt, .6 * jn);
        }
        const Jx = jn * nx - jt * tx, Jy = jn * ny - jt * ty, Jz = jn * nz - jt * tz;
        v[0] += Jx / m; v[1] += Jy / m; v[2] += Jz / m;
        this.angImp(b, rx, ry, rz, Jx, Jy, Jz);
      }
    }
    if (deepest > 0) { p[0] += nx * deepest; p[1] += ny * deepest; p[2] += nz * deepest; }
    if (hit) {
      if (impact > 2) { b.bounces++; if (this.hooks.onGround) this.hooks.onGround(b, impact); }
      // rolling resistance: a piece on the ground loses its spin
      const k = Math.exp(-2.5 * h); w[0] *= k; w[1] *= k; w[2] *= k;
    }
    const still = Math.hypot(v[0], v[1], v[2]) < .45 && Math.hypot(w[0], w[1], w[2]) < .7;
    if (deepest > 0 || hit) b.rest = still ? b.rest + h : 0;
    if (b.rest > .35) {
      b.mode = REST; b.restT = b.tl; v[0] = v[1] = v[2] = 0; w[0] = w[1] = w[2] = 0;
      b.pp[0] = p[0]; b.pp[1] = p[1]; b.pp[2] = p[2];
      if (this.hooks.onRest) this.hooks.onRest(b);
    }
  }
  /* n . ((I^-1 (r x n)) x r) with I in world: I_w^-1 = M diag(1/I) M^T */
  angK(b, rx, ry, rz, nx, ny, nz) {
    const M = b.M, I = b.I;
    const cx = ry * nz - rz * ny, cy = rz * nx - rx * nz, cz = rx * ny - ry * nx;
    // to body, divide, back
    const u0 = (M[0] * cx + M[3] * cy + M[6] * cz) / I[0], u1 = (M[1] * cx + M[4] * cy + M[7] * cz) / I[1], u2 = (M[2] * cx + M[5] * cy + M[8] * cz) / I[2];
    const ax = M[0] * u0 + M[1] * u1 + M[2] * u2, ay = M[3] * u0 + M[4] * u1 + M[5] * u2, az = M[6] * u0 + M[7] * u1 + M[8] * u2;
    const dx = ay * rz - az * ry, dy = az * rx - ax * rz, dz = ax * ry - ay * rx;
    return nx * dx + ny * dy + nz * dz;
  }
  angImp(b, rx, ry, rz, Jx, Jy, Jz) {
    const M = b.M, I = b.I, w = b.w;
    const cx = ry * Jz - rz * Jy, cy = rz * Jx - rx * Jz, cz = rx * Jy - ry * Jx;
    const u0 = (M[0] * cx + M[3] * cy + M[6] * cz) / I[0], u1 = (M[1] * cx + M[4] * cy + M[7] * cz) / I[1], u2 = (M[2] * cx + M[5] * cy + M[8] * cz) / I[2];
    w[0] += M[0] * u0 + M[1] * u1 + M[2] * u2; w[1] += M[3] * u0 + M[4] * u1 + M[5] * u2; w[2] += M[6] * u0 + M[7] * u1 + M[8] * u2;
  }

  /* the piece meets the sea: a fast shallow entry skips off it (a flat stone), else it goes in (splash) */
  water(b, h) {
    const v = b.v, sp = Math.hypot(v[0], v[1], v[2]), hz = Math.hypot(v[0], v[2]);
    const ang = Math.atan2(-v[1], hz);
    if (v[1] < 0 && sp > 70 && ang < .16 && b.skips < 3 && b.kind !== 2) {
      b.skips++;
      v[1] = -v[1] * .32; v[0] *= .62; v[2] *= .62;
      b.p[1] = Math.max(b.p[1], this.reach(b, 0, 1, 0) + .05);
      const w = b.w, k = 1 + .6 * b.skips; w[0] = w[0] * .6 + (v[2] / Math.max(1, b.r) * .04) * k; w[2] = w[2] * .6 - (v[0] / Math.max(1, b.r) * .04) * k;
      if (this.hooks.onSkip) this.hooks.onSkip(b, sp);
      return;
    }
    b.mode = SEA; b.wetT = b.tl;
    if (this.hooks.onWater) this.hooks.onWater(b, sp);
    // the water takes almost all of it at once
    const k = .1 + .05 * Math.min(1, 30 / Math.max(1, sp));
    v[0] *= k; v[2] *= k; v[1] = Math.max(-8, Math.min(v[1] * k, -1));
    b.w[0] *= .35; b.w[1] *= .35; b.w[2] *= .35;
  }
  /* in the sea: floaters bob and lie flat, then fill and go; the rest sink out of sight */
  stepSea(b, h) {
    const p = b.p, v = b.v, w = b.w, age = b.tl - b.wetT;
    const floating = b.floatT > 0 && age < b.floatT;
    const kd = Math.exp(-(floating ? 1.6 : 2.2) * h);
    v[0] *= kd; v[2] *= kd;
    // drift with the wind (a floating plate) or settle
    if (floating) {
      v[0] += (this.wind[0] * .025 - v[0]) * .5 * h; v[2] += (this.wind[1] * .025 - v[2]) * .5 * h;
      const yT = -b.draft;
      v[1] += ((yT - p[1]) * 4 - v[1] * 2.5) * h;
      // lie flat: turn the thin axis up
      this.flatten(b, h, 1.2);
    } else {
      v[1] += (-b.sinkV - v[1]) * 2 * h;
      const k = Math.exp(-.8 * h); w[0] *= k; w[1] *= k; w[2] *= k;
    }
    if (floating) { const k = Math.exp(-2 * h); w[0] *= k; w[1] *= k; w[2] *= k; }
    p[0] += v[0] * h; p[1] += v[1] * h; p[2] += v[2] * h;
    qTurn(b.q, w[0], w[1], w[2], h);
    qMat(b.q, b.M);
    if (p[1] < -b.r - 18 || age > 90) this.release(b);
  }
  /* a gentle turn that brings the body's thinnest axis to the vertical (a plate lying on the water) */
  flatten(b, h, rate) {
    const M = qMat(b.q, b.M), e = b.ext;
    const ax = e[0] <= e[1] && e[0] <= e[2] ? 0 : e[1] <= e[2] ? 1 : 2;
    let ux = M[ax], uy = M[3 + ax], uz = M[6 + ax];
    if (uy < 0) { ux = -ux; uy = -uy; uz = -uz; }
    // the turn that takes u to +Y: axis u x Y = (-uz, 0, ux)
    const sx = -uz, sz = ux, s = Math.hypot(sx, sz);
    if (s < 1e-4) return;
    const ang = Math.atan2(s, uy), k = Math.min(1, rate * h) * ang / s / h;
    b.w[0] += (sx * k - b.w[0]) * Math.min(1, 3 * h);
    b.w[2] += (sz * k - b.w[2]) * Math.min(1, 3 * h);
  }

  /* toppling about a foot on a moving base: I th'' = torque of gravity about the hinge; released past thRel */
  stepHinge(b, h) {
    const H = b.hinge;
    H.t += h;
    // the foot moves with the ship / the vehicle
    const px = H.piv[0] + H.vel[0] * H.t, py = H.piv[1] + H.vel[1] * H.t, pz = H.piv[2] + H.vel[2] * H.t;
    // COM relative to the foot, now
    const ax = H.ax;
    const th = H.th, c = Math.cos(th), s = Math.sin(th), C = 1 - c;
    const x = ax[0], y = ax[1], z = ax[2];
    const R0 = c + x * x * C, R1 = x * y * C - z * s, R2 = x * z * C + y * s;
    const R3 = y * x * C + z * s, R4 = c + y * y * C, R5 = y * z * C - x * s;
    const R6 = z * x * C - y * s, R7 = z * y * C + x * s, R8 = c + z * z * C;
    const r0 = H.r0;
    const rx = R0 * r0[0] + R1 * r0[1] + R2 * r0[2], ry = R3 * r0[0] + R4 * r0[1] + R5 * r0[2], rz = R6 * r0[0] + R7 * r0[1] + R8 * r0[2];
    // gravity's torque about the axis: (r x (0, -mg, 0)) . ax = -mg (r x Y) . ax = -mg (-rz ax.x + rx ax.z)
    const tq = -b.m * G * (-rz * x + rx * z);
    H.om += tq / H.Ip * h;
    H.om *= Math.exp(-.15 * h);
    H.th += H.om * h;
    b.p[0] = px + rx; b.p[1] = py + ry; b.p[2] = pz + rz;
    // orientation: the turn about the axis on the start orientation
    const q0 = H.q0, hs = Math.sin(H.th / 2), hc = Math.cos(H.th / 2);
    const dw = hc, dx = x * hs, dy = y * hs, dz = z * hs;
    b.q[0] = dw * q0[0] - dx * q0[1] - dy * q0[2] - dz * q0[3];
    b.q[1] = dw * q0[1] + dx * q0[0] + dy * q0[3] - dz * q0[2];
    b.q[2] = dw * q0[2] - dx * q0[3] + dy * q0[0] + dz * q0[1];
    b.q[3] = dw * q0[3] + dx * q0[2] - dy * q0[1] + dz * q0[0];
    qMat(b.q, b.M);
    if (Math.abs(H.th) >= H.thRel) {
      // free: the velocity of its centre on the arc, the spin of the arc
      const om = H.om;
      b.v[0] = H.vel[0] + om * (y * rz - z * ry); b.v[1] = H.vel[1] + om * (z * rx - x * rz); b.v[2] = H.vel[2] + om * (x * ry - y * rx);
      b.w[0] = om * x + (H.kick ? H.kick[0] : 0); b.w[1] = om * y + (H.kick ? H.kick[1] : 0); b.w[2] = om * z + (H.kick ? H.kick[2] : 0);
      b.mode = AIR; b.hinge = null;
    }
  }

  /* ---------------- reading ---------------- */
  /* the drawn state at time t: position (centre of mass) and orientation, between the last two steps */
  pose(b, t, P, Q) {
    if (b.mode === REST || b.mode === FOLLOW || b.tl <= b.pt) { P[0] = b.p[0]; P[1] = b.p[1]; P[2] = b.p[2]; Q[0] = b.q[0]; Q[1] = b.q[1]; Q[2] = b.q[2]; Q[3] = b.q[3]; return; }
    const a = sat((t - b.pt) / (b.tl - b.pt));
    P[0] = b.pp[0] + (b.p[0] - b.pp[0]) * a; P[1] = b.pp[1] + (b.p[1] - b.pp[1]) * a; P[2] = b.pp[2] + (b.p[2] - b.pp[2]) * a;
    const d = b.pq[0] * b.q[0] + b.pq[1] * b.q[1] + b.pq[2] * b.q[2] + b.pq[3] * b.q[3] < 0 ? -1 : 1;
    Q[0] = b.pq[0] + (d * b.q[0] - b.pq[0]) * a; Q[1] = b.pq[1] + (d * b.q[1] - b.pq[1]) * a;
    Q[2] = b.pq[2] + (d * b.q[2] - b.pq[2]) * a; Q[3] = b.pq[3] + (d * b.q[3] - b.pq[3]) * a;
    const l = Math.hypot(Q[0], Q[1], Q[2], Q[3]) || 1; Q[0] /= l; Q[1] /= l; Q[2] /= l; Q[3] /= l;
  }
  each(fn) { for (const b of this.B) if (b.on) fn(b); }
  clear() { for (const b of this.B) if (b.on) this.release(b); }
}
