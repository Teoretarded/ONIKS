/* Debris: things that are hit come apart as rigid bodies (the films' intercepts: the round spins out, its modules
   break off and tumble; the Anatomy films' exploded views, made physical).

   What breaks up, and how (the modules are the models' own parts, grouped as debris/plans.js has them):
     a round stopped in the air (sim 'intercept', 'splash' in the air, or 'breakup')
                the airframe snaps in two at the hit (a front and a rear section, cut along the nearest section joint,
                the torn ends glowing for a moment), the fins and wings come off on their own, the part that took the
                hit shatters into shards; everything carries the round's momentum plus a kick away from the hit and a
                spin of its own; the section with the motor burns and trails smoke. The interceptor's own body too.
     a round out of control (p.ctrl === false, sim 'spinout')
                drawn tumbling (its own spin, the plume swinging round with it, the smoke corkscrewing), shedding its
                modules one by one with small pops: fins first, then wings, then the booster or the tail section, until
                it hits the sea or breaks up
     an aircraft shot down: the airframe drawn here, tumbling as it falls (a helicopter spins on its rotor's torque);
                wings, tails, rotor, dome come away one after the other; the fuselage hits the sea (sinks) or the
                ground (bounces, lies there)
     a ship / vehicle / site destroyed: masts go over the side (a hinge at the foot, then free), arrays, gun mounts,
                turrets, cranes and boats are thrown off; the hull sinks and the wreck burns as the render system has it
   Physics (debris/world.js): each module a rigid body (mass and inertia from its box), gravity, drag per face (plates
   flutter), aero damping, the sea (splash, skip, sink or float) and the ground (bounce, friction, rest: wreck pieces
   stay); deterministic from the event (own fixed step from its birth), hard cap 400 bodies (settled / far ones go
   first). Drawn through the engine as the same model with the other parts masked (partAlpha) and a clip plane for
   the sections (the Inspect gate as a pure clip); shards as small plates of dots; smoke through the FX system's
   trails; splashes and dust through the FX effects.

   Hooks: the render system asks game.debris.unit(u, d) / proj(p, d) before it draws (false: drawn here; parts that
   left get partAlpha 0), the FX system asks head(p, t, out) for a tumbling round's axis (plume, trail), the replay
   hides the parts that left (gone(id)). Bus: 'breakup' { t, pos, id, kind, heavy, px, dist, onScreen, w } (the
   director frames it); a spectacular one close to the camera triggers bullet time (debris/slowmo.js).
   Console: ONIKS.game.debris.demo('oniks', { mode: 'breakup' | 'spin', dist, speed, alt, side }), .stats.

   createDebris(game) -> system 'debris' (priority 11: updates before the render and FX systems, draws after them). */
import { World, AIR, HINGE, SEA, REST, FOLLOW } from './debris/world.js';
import { PROJ_PLANS, UNIT_PLANS, HEAVY, NO_BREAK } from './debris/plans.js';
import { TAU, sat, clamp, ss, mix, hsh, rng, qMat, matQ, qNorm, qMul, qAxis, attitudeM } from './debris/math.js';
import { maskOf, liveMask, boxOf, zMid, isPlate, thicken, massOf, shown, hasPart, partNames } from './debris/geom.js';
import { drawShard, TPL_N } from './debris/shards.js';
import { createBulletTime } from './debris/slowmo.js';
import { Splash, Dirt, Blast } from '../fx/lib/impact.js';
import { Burst } from '../fx/lib/burst.js';
import { Trail, STAGE } from '../fx/lib/smoke.js';

const H_MOD = 1 / 60, H_SHARD = 1 / 40;
const GUNS = { ciws: 1, gun30: 1 };
const QUALITY = { low: .35, medium: .65, high: 1 };
const HOT = [255, 236, 206], WARM = [255, 190, 128], GREY = [206, 208, 202];
const BRAND = STAGE.brand || STAGE.damaged;

export async function createDebris(game) {
  const sim = game.sim, R = game.R, cam = R.camera, T = R.terrain, bus = game.bus;
  // the sim's own bodies (sim/bodies.js: the part boxes of every hull) for pieces striking a ship; without them, none
  let BOD = null;
  try { BOD = await import('../sim/bodies.js'); if (!BOD.segUnit || !BOD.pointUnit || !BOD.bodyOf || !BOD.HIT) BOD = null; } catch (e) { BOD = null; }
  const world = new World({
    cap: 400,
    ground: (x, z) => game.ground(x, z),
    wet: (x, z) => game.map.h(x, z) < 0,
    normal: (x, z) => T.normalAt(x, z),
  });
  const bullet = createBulletTime(game);
  const seenP = new Map();      // proj id -> its last state { id, kind, key, side, pos, vel, t, st, lastSeen, from }
  const spins = new Map();      // proj id -> a round out of control (drawn here, tumbling)
  const planes = new Map();     // unit id -> an aircraft coming apart (drawn here)
  const broken = new Map();     // proj id -> sim t it broke up (the render system leaves it to us)
  const hid = new Map();        // unit id -> partAlpha mask of the parts that left (ships, vehicles)
  const taken = new Set();      // unit ids whose airframe is drawn here for good (the fuselage lies where it fell)
  const fxq = [];               // our own small effects: { k: 'puff' | 'drop' | 'ring', t0, p, s, seed, ... }
  const warmed = new Set();
  let serial = 0;
  const P3 = [0, 0, 0], Q4 = [1, 0, 0, 0], M9 = [1, 0, 0, 0, 1, 0, 0, 0, 1], V3 = [0, 0, 0], W3 = [0, 0, 0];
  const stats = { bodies: 0, steps: 0, physMs: 0, drawMs: 0, dots: 0, breakups: 0, spins: 0 };

  /* ---------------------------------------------------------------- helpers */
  const fxSys = () => game.getSystem('fx');
  /* the Effects setting times the auto-quality guard's effects factor (game/perfguard.js game.quality.fx) */
  const quality = () => (QUALITY[(game.settings && game.settings.effects) || 'high'] || 1) * (game.quality && game.quality.fx > 0 ? game.quality.fx : 1);
  /* the high time rates: coarser steps for new pieces, fewer shards, splashes only for the heavy ones */
  const fast = () => game.timeRate >= 8;
  let splashes = 0;             // splashes laid this frame (capped)
  const eye = () => cam.eye;
  const distEye = p => Math.hypot(p[0] - cam.eye[0], p[1] - cam.eye[1], p[2] - cam.eye[2]);
  function addFx(e, layer) { const f = fxSys(); if (f && f.add) f.add(e, layer); }
  function addTrail(tr) {
    const f = fxSys(); if (!f) return false;
    if (f.addTrail) f.addTrail(tr); else if (f.ghost) f.ghost.push(tr); else return false;
    return true;
  }
  /* sample a model's parts ahead of need (coarse now, finer in the frames' budget) */
  function warm(key) {
    if (!key || warmed.has(key) || !R.models.has(key)) return;
    warmed.add(key);
    try {
      const e = R.models.warm(key);
      const Q = R.models.pending;
      if (e && Array.isArray(Q)) for (let l = e.lods.length - 2; l >= 0; l--) for (const P of e.parts) if (!P.dyn && !P.part.inside && !P.clouds[l]) Q.push({ e, P, lod: l });
    } catch (err) { /* the model builds later */ }
  }
  const planOfProj = key => PROJ_PLANS[key] || null;
  function tintOf(side) { return side === game.side ? 'own' : 'hostile'; }
  function newInst(key, st, mask, tint) {
    return { key, T: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], st, partAlpha: mask, tint, tintK: .45, tintFace: tint === 'own' ? .04 : .12, alpha: 1, bright: 1, dissolve: 0, gate: null };
  }
  /* world velocity of a model point r (world offset from the centre of mass) on a body spinning at w */
  const spinVel = (w, rx, ry, rz, o) => { o[0] = w[1] * rz - w[2] * ry; o[1] = w[2] * rx - w[0] * rz; o[2] = w[0] * ry - w[1] * rx; return o; };
  function onScreen(p) {
    const q = cam.project(p);
    if (!q) return false;
    const mx = cam.W * .04, my = cam.H * .04;
    return q[0] > mx && q[0] < cam.W - mx && q[1] > my && q[1] < cam.H - my && q[2] > 0;
  }
  function visProj(c) { return !sim.fog || !c || c.side === game.side || sim.t - (c.lastSeen === undefined ? -1e9 : c.lastSeen) < 2.5; }
  function visUnit(u) { const v = game.vis(u); return !sim.fog || v === 'own' || v === 'track'; }

  /* ---------------------------------------------------------------- the rounds in flight */
  function track() {
    const t = sim.t;
    for (const p of sim.projectiles.values()) {
      if (!p.alive) continue;
      let c = seenP.get(p.id);
      if (!c) {
        const P = p.P || game.PROJ[p.kind] || {};
        c = { id: p.id, kind: p.kind, key: P.model, side: p.side, pos: [0, 0, 0], vel: [0, 0, 0], t: 0, st: {}, lastSeen: -1e9, from: p.from, torp: !!P.torpedo };
        seenP.set(p.id, c);
      }
      c.pos[0] = p.pos[0]; c.pos[1] = p.pos[1]; c.pos[2] = p.pos[2];
      if (p.vel) { c.vel[0] = p.vel[0]; c.vel[1] = p.vel[1]; c.vel[2] = p.vel[2]; }
      c.t = t;
      if (p.st) for (const k in p.st) c.st[k] = p.st[k];
      if (!sim.fog || p.side === game.side || sim.projVisible(game.side, p)) c.lastSeen = t;
      if (p.ctrl === false && !spins.has(p.id) && !broken.has(p.id) && !c.torp) startSpin(p, null);
    }
    if (seenP.size > sim.projectiles.size + 64) for (const [id, c] of seenP) if (t - c.t > 4) seenP.delete(id);
    if (broken.size > 256) for (const [id, bt] of broken) if (t - bt > 30) broken.delete(id);
  }
  /* where a round was at time t (its last state carried on) */
  function projAt(c, t, out) {
    const dt = Math.max(0, t - c.t);
    out[0] = c.pos[0] + c.vel[0] * dt; out[1] = c.pos[1] + c.vel[1] * dt - 4.9 * dt * dt; out[2] = c.pos[2] + c.vel[2] * dt;
    return out;
  }
  function attitudeOfVel(v, out) {
    const h = Math.hypot(v[0], v[2]);
    return attitudeM(h + Math.abs(v[1]) > 1e-6 ? Math.atan2(v[0], v[2]) : 0, Math.atan2(v[1], Math.max(1e-6, h)), 0, out);
  }

  /* ---------------------------------------------------------------- tumbling (a round out of control, an aircraft
     going down): its place from the sim, its turn analytic in time: a tumble about a fixed axis (ramping up, a
     quarter faster for every piece it has lost) and a slow precession of it about the flight path */
  function spinInt(S, t) {
    const a = t - S.t0, Tr = S.Tr;
    if (a <= 0) return 0;
    const u = a / Tr;
    return u < 1 ? Tr * (u * u * u - u * u * u * u / 2) : Tr / 2 + (a - Tr);
  }
  function spinAngle(S, t) {
    let th = S.w0 * spinInt(S, t);
    for (const ts of S.boosts) if (t > ts) th += .28 * S.w0 * (spinInt(S, t) - spinInt(S, ts));
    return th;
  }
  function spinRate(S, t) {
    const a = t - S.t0, u = a / S.Tr, r = u <= 0 ? 0 : u < 1 ? u * u * (3 - 2 * u) : 1;
    let k = 1; for (const ts of S.boosts) if (t > ts) k += .28;
    return S.w0 * r * k;
  }
  /* the tumbling orientation at t (row-major) */
  function spinM(S, t, v, out) {
    const th = spinAngle(S, t), a = S.aW;
    // R(a, th) M0
    const c = Math.cos(th), s = Math.sin(th), C = 1 - c, x = a[0], y = a[1], z = a[2];
    const A = S.tmpA;
    A[0] = c + x * x * C; A[1] = x * y * C - z * s; A[2] = x * z * C + y * s;
    A[3] = y * x * C + z * s; A[4] = c + y * y * C; A[5] = y * z * C - x * s;
    A[6] = z * x * C - y * s; A[7] = z * y * C + x * s; A[8] = c + z * z * C;
    mm3(A, S.M0, out);
    // precession about the flight path
    if (S.psi && v) {
      const l = Math.hypot(v[0], v[1], v[2]);
      if (l > 1) {
        const ps = S.psi * spinInt(S, t), cp = Math.cos(ps), sp = Math.sin(ps), Cp = 1 - cp, px = v[0] / l, py = v[1] / l, pz = v[2] / l;
        A[0] = cp + px * px * Cp; A[1] = px * py * Cp - pz * sp; A[2] = px * pz * Cp + py * sp;
        A[3] = py * px * Cp + pz * sp; A[4] = cp + py * py * Cp; A[5] = py * pz * Cp - px * sp;
        A[6] = pz * px * Cp - py * sp; A[7] = pz * py * Cp + px * sp; A[8] = cp + pz * pz * Cp;
        mm3(A, out, S.tmpB);
        for (let i = 0; i < 9; i++) out[i] = S.tmpB[i];
      }
    }
    return out;
  }
  function mm3(A, B, o) {
    for (let i = 0; i < 3; i++) {
      const a0 = A[i * 3], a1 = A[i * 3 + 1], a2 = A[i * 3 + 2];
      o[i * 3] = a0 * B[0] + a1 * B[3] + a2 * B[6]; o[i * 3 + 1] = a0 * B[1] + a1 * B[4] + a2 * B[7]; o[i * 3 + 2] = a0 * B[2] + a1 * B[5] + a2 * B[8];
    }
    return o;
  }
  /* the tumble's angular velocity (world) at t */
  function spinW(S, t, v, out) {
    const r = spinRate(S, t);
    out[0] = S.aW[0] * r; out[1] = S.aW[1] * r; out[2] = S.aW[2] * r;
    if (S.psi && v) { const l = Math.hypot(v[0], v[1], v[2]); if (l > 1) { const k = S.psi * Math.min(1, (t - S.t0) / S.Tr); out[0] += v[0] / l * k; out[1] += v[1] / l * k; out[2] += v[2] / l * k; } }
    return out;
  }

  /* the sim flies a round out of control itself (sim/weapons.js stepTumble: its frame p.fw / p.up turned by p.w every
     tick): its frame at t, turned back from the last tick by its spin. Else (a stand-in, an older sim) the analytic
     tumble above. -> row-major M (columns: starboard, up, forward) */
  const FW = [0, 0, 1], UP = [0, 1, 0];
  function turnBack(a, w, wl, th, o) {
    const kx = w[0] / wl, ky = w[1] / wl, kz = w[2] / wl, c = Math.cos(th), s = Math.sin(th), d = kx * a[0] + ky * a[1] + kz * a[2];
    o[0] = a[0] * c + (ky * a[2] - kz * a[1]) * s + kx * d * (1 - c);
    o[1] = a[1] * c + (kz * a[0] - kx * a[2]) * s + ky * d * (1 - c);
    o[2] = a[2] * c + (kx * a[1] - ky * a[0]) * s + kz * d * (1 - c);
    return o;
  }
  function frameAt(S, t, vel, out) {
    const p = S.p;
    if (!p || !p.fw || !p.up) return spinM(S, t, vel, out);
    // the frame is the one of its last step (launch time + age; a round gone mid-frame stopped there)
    const tp = p.t0 !== undefined && p.age !== undefined ? p.t0 + p.age : sim.t;
    const w = p.w || [0, 0, 0], wl = Math.hypot(w[0], w[1], w[2]), back = tp - t;
    if (wl > 1e-6 && Math.abs(back) > 1e-5) { turnBack(p.fw, w, wl, -wl * back, FW); turnBack(p.up, w, wl, -wl * back, UP); }
    else { FW[0] = p.fw[0]; FW[1] = p.fw[1]; FW[2] = p.fw[2]; UP[0] = p.up[0]; UP[1] = p.up[1]; UP[2] = p.up[2]; }
    const rx = UP[1] * FW[2] - UP[2] * FW[1], ry = UP[2] * FW[0] - UP[0] * FW[2], rz = UP[0] * FW[1] - UP[1] * FW[0], rl = Math.hypot(rx, ry, rz) || 1;
    out[0] = rx / rl; out[1] = UP[0]; out[2] = FW[0];
    out[3] = ry / rl; out[4] = UP[1]; out[5] = FW[1];
    out[6] = rz / rl; out[7] = UP[2]; out[8] = FW[2];
    return out;
  }
  function omegaAt(S, t, vel, out) {
    const p = S.p;
    if (!p || !p.fw || !p.w) return spinW(S, t, vel, out);
    out[0] = p.w[0]; out[1] = p.w[1]; out[2] = p.w[2];
    return out;
  }

  /* ---------------------------------------------------------------- spawning */
  function common(b, type, o) {
    b.o = Object.assign({ type, inst: null, gz: 0, cz: 0, ring: null, hot: -1, burn: null, splash: 1, t0: b.t0, tint0: .45, fadeT: 1.4, float: false }, o || {});
    return b;
  }
  /* a module (parts of `key`) as a free body from the model's pose (T0 origin, M0 row-major), velocity v, spin w */
  function spawnModule(o) {
    const { ent, key, names, st, T0, M0, v, w, t0, tint, cut } = o;
    const box = cut ? boxOf(ent, names, st, cut.part, cut.z0, cut.z1) : boxOf(ent, names, st);
    if (!box) return null;
    const plate = o.plate !== undefined ? o.plate : isPlate(box.ext);
    const ext = plate ? thicken(box.ext) : [Math.max(.02, box.ext[0]), Math.max(.02, box.ext[1]), Math.max(.02, box.ext[2])];
    const m = o.mass || massOf(ext, plate, o.rho || 900, o.sigma || 30, !!o.cyl);
    const b = world.alloc(cam.eye);
    if (!b) return null;
    world.shape(b, ext[0], ext[1], ext[2], m, plate);
    b.c[0] = box.c[0]; b.c[1] = box.c[1]; b.c[2] = box.c[2];
    b.kind = 0; b.seed = o.seed || 1; b.aero = true; b.life = o.life || 240;
    b.floatT = o.floatT || 0; b.sinkV = o.sinkV || (plate ? 1.2 : 3); b.draft = Math.min(ext[0], ext[1], ext[2]) * .6;
    const c = box.c;
    P3[0] = T0[0] + M0[0] * c[0] + M0[1] * c[1] + M0[2] * c[2];
    P3[1] = T0[1] + M0[3] * c[0] + M0[4] * c[1] + M0[5] * c[2];
    P3[2] = T0[2] + M0[6] * c[0] + M0[7] * c[1] + M0[8] * c[2];
    matQ(M0, Q4);
    world.launch(b, t0, game.timeRate >= 32 ? H_MOD * 3 : game.timeRate >= 16 ? H_MOD * 2 : H_MOD, P3, v, Q4, w);
    const inst = newInst(key, st, o.mask || maskOf(ent, names), tint);
    common(b, 'mod', { inst, tint0: tint ? .45 : 0, names, kindKey: key });
    if (cut && cut.gz) { b.o.gz = cut.gz; b.o.cz = cut.gz < 0 ? cut.z0 : cut.z1; inst.gate = { n: [0, 0, 1], d: 0, w: 1e-3, g: 1e-3, mode: 2 }; }
    return b;
  }
  function comOffset(M0, c, o) { o[0] = M0[0] * c[0] + M0[1] * c[1] + M0[2] * c[2]; o[1] = M0[3] * c[0] + M0[4] * c[1] + M0[5] * c[2]; o[2] = M0[6] * c[0] + M0[7] * c[1] + M0[8] * c[2]; return o; }

  /* a round breaks up. src: { key, kind, side, T0 (model origin), M0, v0, w0, t0, st, hitZ, cause 'gun' | 'missile' |
     'destruct' | 'spin', seed, cutZ (a section already cut off: keep the rest whole), attached (Set) } */
  function breakRound(src) {
    const plan = planOfProj(src.key);
    if (!plan || !R.models.has(plan.draw)) return null;
    const ent = R.models.get(plan.draw), key = plan.draw, st = Object.assign({}, src.st);
    const r = rng(src.seed), q = quality();
    const T0 = src.T0, M0 = src.M0, v0 = src.v0, w0 = src.w0 || [0, 0, 0];
    const gun = src.cause === 'gun', warhead = src.cause === 'missile' || src.cause === 'destruct';
    const bb = boxOf(ent, [plan.body], st);
    if (!bb) return null;
    // at the high time rates far from the lens (sub-pixel pieces nobody follows): the sections alone, or nothing
    const dEye = distEye(src.T0), rate = game.timeRate;
    if (rate >= 16 && dEye > 25000) return null;
    const lean = (rate >= 16 && dEye > 8000) || (rate >= 8 && dEye > 15000);
    const zlo = bb.mn[2], zhi = bb.mx[2], L = zhi - zlo, rad = Math.max(bb.ext[0], bb.ext[1]);
    const on = n => hasPart(ent, n) && shown(ent, n, st) && (!src.attached || src.attached.has(n));
    const tint = tintOf(src.side);
    const out = [];
    const sp0 = Math.hypot(v0[0], v0[1], v0[2]);
    const kick = (warhead ? 30 : 14) * (.7 + .6 * r.r());
    const fwd = [M0[2], M0[5], M0[8]];
    // the blow's direction (the stream's, the burst's): everything gets a share of its push
    const imp = src.imp || [0, 0, 0];
    // the break: at the hit, on the nearest joint within half a metre
    let zc = null;
    if (src.cutZ === undefined || src.cutZ === null) {
      zc = clamp(src.hitZ, zlo + .2 * L, zhi - .2 * L);
      let bj = 1e9; for (const j of plan.joints || []) { const d = Math.abs(j - zc); if (d < .5 && d < bj && j > zlo + .12 * L && j < zhi - .12 * L) { bj = d; zc = j; } }
    }
    const fixed = (plan.fixed || []).filter(on);
    const sections = [];
    if (zc !== null) {
      sections.push({ gz: -1, z0: zc, z1: zhi, names: [plan.body, ...fixed.filter(n => zMid(ent, n, st) > zc)] });
      sections.push({ gz: 1, z0: zlo, z1: zc, names: [plan.body, ...fixed.filter(n => zMid(ent, n, st) <= zc)] });
    } else {
      sections.push({ gz: src.cutZ > zlo ? -1 : 0, z0: Math.max(zlo, src.cutZ), z1: zhi, names: [plan.body, ...fixed.filter(n => zMid(ent, n, st) > src.cutZ)] });
    }
    for (const s of sections) {
      const front = s.gz < 0;
      // the front took the hit (a gun's stream walks onto the nose): it loses more of its way; both keep most of it
      const k = gun ? (front ? .9 + .06 * r.r() : .96 + .03 * r.r()) : .88 + .1 * r.r();
      const box = boxOf(ent, s.names, st, plan.body, s.z0, s.z1);
      if (!box) continue;
      comOffset(M0, box.c, V3);
      spinVel(w0, V3[0], V3[1], V3[2], W3);
      const side = front ? 1 : -1, ang = r.r() * TAU;
      // kicked apart along the axis and a little across it, and up
      const across = [Math.cos(ang), Math.sin(ang), 0], ac = [M0[0] * across[0] + M0[1] * across[1], M0[3] * across[0] + M0[4] * across[1], M0[6] * across[0] + M0[7] * across[1]];
      const v = [0, 0, 0];
      for (let i = 0; i < 3; i++) v[i] = v0[i] * k + W3[i] + fwd[i] * side * kick * (.25 + .3 * r.r()) + ac[i] * kick * (.25 + .45 * r.r()) + imp[i] * kick * (.3 + .4 * r.r());
      v[1] += kick * .2 * r.r();
      // the tumble: end over end about an axis across it, some roll
      const tumble = (gun ? 2.5 : 4) * (.6 + .9 * r.r()) * Math.sqrt(8 / Math.max(2, box.ext[2] * 2)) * r.sign();
      const ta = r.r() * TAU, tx = Math.cos(ta), ty = Math.sin(ta);
      const w = [0, 0, 0];
      for (let i = 0; i < 3; i++) w[i] = w0[i] + (M0[i * 3] * tx + M0[i * 3 + 1] * ty) * tumble + M0[i * 3 + 2] * r.n() * 4;
      const b = spawnModule({ ent, key, names: s.names, st, T0, M0, v, w, t0: src.t0, tint, cut: s.gz ? { part: plan.body, z0: s.z0, z1: s.z1, gz: s.gz } : null, rho: plan.rho, cyl: true, plate: false, seed: src.seed + out.length * 13, sinkV: 4 });
      if (!b) continue;
      if (zc !== null || s.gz) b.o.ring = { z: s.gz < 0 ? s.z0 : s.z1, r: rad * .95 };
      b.o.hot = src.t0 + 1.6;
      // the section with the motor burns
      const motor = plan.motor === (front ? 'front' : 'rear');
      if (motor || (warhead && r.r() < .5)) b.o.burn = { stage: motor ? STAGE.wreck : STAGE.damaged, until: src.t0 + (motor ? 3.5 + 4 * r.r() : 1.5 + 2 * r.r()), tr: null, z: s.gz < 0 ? s.z0 : s.z1, glow: motor ? 1 : .5 };
      out.push(b);
    }
    // the loose groups: fins, wings, a strapped-on booster
    for (const g of lean ? [] : plan.loose || []) {
      const names = g.filter(on);
      if (!names.length) continue;
      const box = boxOf(ent, names, st);
      if (!box) continue;
      comOffset(M0, box.c, V3);
      spinVel(w0, V3[0], V3[1], V3[2], W3);
      // outward from the body's axis
      const ox = box.c[0], oy = box.c[1], ol = Math.hypot(ox, oy) || 1, ow = [(M0[0] * ox + M0[1] * oy) / ol, (M0[3] * ox + M0[4] * oy) / ol, (M0[6] * ox + M0[7] * oy) / ol];
      const plate = isPlate(box.ext), k = plate ? .82 + .14 * r.r() : .9 + .08 * r.r(), kk = kick * (plate ? 1.4 : .8) * (.6 + .8 * r.r());
      const v = [0, 0, 0];
      for (let i = 0; i < 3; i++) v[i] = v0[i] * k + W3[i] + ow[i] * kk + r.n() * kk * .4 + imp[i] * kk * .6;
      v[1] += kk * .2;
      const ws = plate ? 8 + 16 * r.r() : 3 + 5 * r.r();
      const w = [w0[0] + r.n() * ws, w0[1] + r.n() * ws, w0[2] + r.n() * ws];
      const b = spawnModule({ ent, key, names, st, T0, M0, v, w, t0: src.t0, tint, rho: plan.rho, sigma: plan.sigma, cyl: !plate, plate, seed: src.seed + 101 + out.length * 7, sinkV: plate ? 1 : 3 });
      if (b) { b.o.hot = -1; out.push(b); }
    }
    // shards: the part that took the hit, torn up
    // fewer at the high time rates (nobody follows a chip at x32)
    const far = distEye(T0);
    const nS = Math.round((gun ? 26 : warhead ? 40 : 18) * q * clamp(L / 7, .45, 1.2) * (game.timeRate >= 16 ? .3 : game.timeRate >= 8 ? .6 : 1) * (far > 8000 ? .4 : 1));
    if (far < 25000 && nS > 0 && !lean) {
      const zh = zc !== null ? zc : clamp(src.hitZ, zlo, zhi);
      P3[0] = T0[0] + M0[2] * zh; P3[1] = T0[1] + M0[5] * zh; P3[2] = T0[2] + M0[8] * zh;
      spawnShards(P3, v0, rad, nS, src.t0, src.seed + 555, gun ? .75 : .6, warhead ? 1 : .7);
    }
    stats.breakups++;
    return out;
  }
  /* n shards from centre c (radius rad), carrying k of v0, blown out at up to spd x 140 m/s */
  function spawnShards(c, v0, rad, n, t0, seed, k, spd) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const b = world.alloc(cam.eye, true);
      if (!b) return;
      const s = .05 + .38 * Math.pow(r.r(), 2.2);
      world.shape(b, s, s * .8, .008, 9 * (2 * s) * (1.6 * s) + .02, true);
      b.kind = 1; b.seed = seed + i; b.aero = false; b.life = 90; b.floatT = 0; b.sinkV = 1.5; b.c[0] = b.c[1] = b.c[2] = 0;
      const u = r.r() * 2 - 1, a = r.r() * TAU, h = Math.sqrt(1 - u * u), sp = (25 + 140 * Math.pow(r.r(), 1.3)) * spd;
      const kk = k * (.45 + .55 * r.r());
      P3[0] = c[0] + h * Math.cos(a) * rad; P3[1] = c[1] + u * rad; P3[2] = c[2] + h * Math.sin(a) * rad;
      V3[0] = v0[0] * kk + h * Math.cos(a) * sp; V3[1] = v0[1] * kk + u * sp * .8 + 6 * r.r(); V3[2] = v0[2] * kk + h * Math.sin(a) * sp;
      const ws = 14 + 40 * r.r();
      W3[0] = r.n() * ws; W3[1] = r.n() * ws; W3[2] = r.n() * ws;
      Q4[0] = r.n(); Q4[1] = r.n(); Q4[2] = r.n(); Q4[3] = r.n(); qNorm(Q4);
      world.launch(b, t0 + .002 * i, fast() ? H_SHARD * 2 : H_SHARD, P3, V3, Q4, W3);
      common(b, 'shard', { s, k: (seed + i) % TPL_N, hot: t0 + .15 + .7 * r.r(), splash: s > .22 ? 1 : 0 });
      if (r.r() < .16) b.o.burn = { stage: BRAND, until: t0 + 1 + 2.5 * r.r(), tr: null, glow: .3 };
    }
  }

  /* ---------------------------------------------------------------- a round out of control */
  function startSpin(p, e) {
    const c = seenP.get(p.id), P = p.P || game.PROJ[p.kind] || {}, key = P.model;
    const plan = planOfProj(key);
    if (!plan || !R.models.has(plan.draw) || NO_BREAK[p.kind]) return null;
    const ent = R.models.get(plan.draw);
    warm(plan.draw);
    const seed = (e && e.seed) || (p.id * 7919 + 17), r = rng(seed);
    const t0 = e ? e.t : sim.t;
    const M0 = attitudeOfVel(e && e.vel ? e.vel : p.vel, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const st = Object.assign({}, p.st || (c && c.st) || {});
    const bb = boxOf(ent, [plan.body], st), L = bb ? bb.mx[2] - bb.mn[2] : 5;
    // the tumble: end over end (pitch / yaw), a roll with it; the event's own spin if it has one
    let wb = [r.sign() * (3.2 + 4.5 * r.r()) * Math.sqrt(8.9 / Math.max(2, L)), r.n() * 1.6, r.sign() * (2 + 4 * r.r())];
    let w0 = Math.hypot(wb[0], wb[1], wb[2]);
    const aW = [0, 0, 0];
    const ew = e && (e.w || e.angVel || e.omega);
    if (ew && Math.hypot(ew[0], ew[1], ew[2]) > .5) { const l = Math.hypot(ew[0], ew[1], ew[2]); aW[0] = ew[0] / l; aW[1] = ew[1] / l; aW[2] = ew[2] / l; w0 = Math.max(l, w0 * .7); }
    else { const l = w0; aW[0] = (M0[0] * wb[0] + M0[1] * wb[1] + M0[2] * wb[2]) / l; aW[1] = (M0[3] * wb[0] + M0[4] * wb[1] + M0[5] * wb[2]) / l; aW[2] = (M0[6] * wb[0] + M0[7] * wb[1] + M0[8] * wb[2]) / l; }
    const all = partNames(ent).filter(n => shown(ent, n, st));
    const b = world.alloc(cam.eye);
    if (!b) return null;
    world.shape(b, bb ? bb.ext[0] : .3, bb ? bb.ext[1] : .3, bb ? bb.ext[2] : 2, 500, false);
    b.kind = 2; b.mode = FOLLOW; b.t0 = b.tl = b.pt = t0; b.c[0] = b.c[1] = b.c[2] = 0;
    const tint = tintOf(p.side);
    common(b, 'core', { inst: newInst(plan.draw, st, liveMask(ent, all), tint), tint0: .45, fadeT: 2.5, proj: p.id });
    b.o.inst.tintK = .45;
    // what goes, and when: each fin on its own, then the wings, the booster, the tail section
    const sheds = [];
    let tq = .1 + .15 * r.r();
    for (const g of plan.shed || []) {
      if (g === 'tail') { sheds.push({ t: t0 + Math.max(tq + .35, 1.0 + .9 * r.r()), tail: true }); continue; }
      const names = g.filter(n => hasPart(ent, n) && shown(ent, n, st));
      if (!names.length) continue;
      // fins go one or two at a time; some stay on
      const plateGroup = names.length > 1 && names.every(n => /fin|wing/.test(n));
      if (plateGroup) {
        const order = names.slice(), keep = names.length > 2 ? Math.floor(r.r() * 2) : 0;
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r.r() * (i + 1)), x = order[i]; order[i] = order[j]; order[j] = x; }
        for (let i = 0; i < order.length - keep; i++) { sheds.push({ t: t0 + tq, names: [order[i]] }); tq += .06 + .22 * r.r(); }
      } else { sheds.push({ t: t0 + tq, names }); tq += .15 + .3 * r.r(); }
      tq += .12 + .25 * r.r();
    }
    const S = { kind: 'proj', id: p.id, plan, ent, key: plan.draw, st, b, M0, aW, w0, Tr: .45 + .3 * r.r(), psi: 1.2 + 1.4 * r.r(), t0, sheds, boosts: [], tail: null,
      side: p.side, seed, attached: new Set(all), ghost: !!(e && e.ghost), p, tp: undefined, tmpA: new Array(9), tmpB: new Array(9), M: [1, 0, 0, 0, 1, 0, 0, 0, 1], vel: (p.vel || [0, 0, 0]).slice(), heavy: !!HEAVY[p.kind], kind2: p.kind,
      flame: plan.motor === 'rear' };
    S.gen = b.gen;
    spins.set(p.id, S);
    stats.spins++;
    // worth a slow look? (the tumble takes a while: time to see it)
    announce({ t: t0, pos: p.pos.slice(), id: p.id, kind: p.kind, key: plan.draw, L, heavy: S.heavy, spin: true, side: p.side, w: 7 });
    return S;
  }
  /* the core's pose now: T (model origin) and M, at time t from the round's place p */
  function corePose(S, pos, t, vel) {
    frameAt(S, t, vel, S.M);
    const b = S.b;
    b.p[0] = pos[0]; b.p[1] = pos[1]; b.p[2] = pos[2];
    matQ(S.M, b.q);
    b.pp[0] = b.p[0]; b.pp[1] = b.p[1]; b.pp[2] = b.p[2];
    b.pq[0] = b.q[0]; b.pq[1] = b.q[1]; b.pq[2] = b.q[2]; b.pq[3] = b.q[3];
    b.tl = b.pt = t;
  }
  /* a piece comes off the tumbling core */
  function shedFrom(S, names, t, pos, vel, wW, pop) {
    const ent = S.ent, M = S.M, r = rng(S.seed + S.boosts.length * 31 + names.length);
    const present = names.filter(n => S.attached.has(n));
    if (!present.length) return null;
    const box = boxOf(ent, present, S.st);
    if (!box) return null;
    comOffset(M, box.c, V3);
    spinVel(wW, V3[0], V3[1], V3[2], W3);
    const ox = box.c[0], oy = box.c[1], ol = Math.hypot(ox, oy) || 1;
    const ow = [(M[0] * ox + M[1] * oy) / ol, (M[3] * ox + M[4] * oy) / ol, (M[6] * ox + M[7] * oy) / ol];
    const plate = isPlate(box.ext), kk = (plate ? 9 : 5) * (.6 + .8 * r.r());
    const v = [vel[0] + W3[0] + ow[0] * kk, vel[1] + W3[1] + ow[1] * kk, vel[2] + W3[2] + ow[2] * kk];
    const ws = plate ? 10 + 14 * r.r() : 3 + 4 * r.r();
    const w = [wW[0] + r.n() * ws, wW[1] + r.n() * ws, wW[2] + r.n() * ws];
    const b = spawnModule({ ent, key: S.key, names: present, st: S.st, T0: pos, M0: M, v, w, t0: t, tint: tintOf(S.side), rho: S.plan.rho, sigma: S.plan.sigma, cyl: !plate, plate, seed: S.seed + 77 * (S.boosts.length + 1) });
    for (const n of present) { S.attached.delete(n); S.b.o.inst.partAlpha[n] = 0; }
    S.boosts.push(t);
    if (pop) popAt(pos, M, box.c, vel, t, S.seed + S.boosts.length, plate ? .6 : 1);
    return b;
  }
  /* the tail section breaks off the tumbling core at the plan's joint */
  function shedTail(S, t, pos, vel, wW) {
    const plan = S.plan, ent = S.ent, st = S.st, M = S.M, r = rng(S.seed + 999);
    const bb = boxOf(ent, [plan.body], st); if (!bb) return;
    const zt = clamp(plan.tail, bb.mn[2] + .15 * (bb.mx[2] - bb.mn[2]), bb.mx[2] - .3 * (bb.mx[2] - bb.mn[2]));
    const rear = [plan.body];
    for (const n of S.attached) if (n !== plan.body && zMid(ent, n, st) < zt) rear.push(n);
    const box = boxOf(ent, rear, st, plan.body, bb.mn[2], zt); if (!box) return;
    comOffset(M, box.c, V3);
    spinVel(wW, V3[0], V3[1], V3[2], W3);
    const f = [M[2], M[5], M[8]], kk = 6 + 6 * r.r();
    const v = [vel[0] + W3[0] - f[0] * kk, vel[1] + W3[1] - f[1] * kk, vel[2] + W3[2] - f[2] * kk];
    const w = [wW[0] + r.n() * 3, wW[1] + r.n() * 3, wW[2] + r.n() * 3];
    const b = spawnModule({ ent, key: S.key, names: rear, st, T0: pos, M0: M, v, w, t0: t, tint: tintOf(S.side), cut: { part: plan.body, z0: bb.mn[2], z1: zt, gz: 1 }, rho: plan.rho, cyl: true, plate: false, seed: S.seed + 4242 });
    if (b) {
      b.o.ring = { z: zt, r: Math.max(bb.ext[0], bb.ext[1]) * .95 }; b.o.hot = t + 1.4;
      if (plan.motor === 'rear') b.o.burn = { stage: STAGE.wreck, until: t + 2.5 + 3 * r.r(), tr: null, z: zt, glow: 1 };
    }
    // the core keeps what is in front of the joint
    for (const n of rear) if (n !== plan.body) { S.attached.delete(n); S.b.o.inst.partAlpha[n] = 0; }
    S.tail = zt;
    const inst = S.b.o.inst;
    inst.gate = { n: [0, 0, 1], d: 0, w: 1e-3, g: 1e-3, mode: 2 };
    S.b.o.gz = -1; S.b.o.cz = zt; S.b.o.ring = { z: zt, r: Math.max(bb.ext[0], bb.ext[1]) * .95 }; S.b.o.hot = t + 1.4;
    S.flame = false;
    S.boosts.push(t);
    popAt(pos, M, [0, 0, zt], vel, t, S.seed + 7, 1.3);
  }
  /* a small pop where a piece tore off: a flash, a few sparks, a puff */
  function popAt(pos, M, lc, vel, t, seed, k) {
    const p = [pos[0] + M[0] * lc[0] + M[1] * lc[1] + M[2] * lc[2], pos[1] + M[3] * lc[0] + M[4] * lc[1] + M[5] * lc[2], pos[2] + M[6] * lc[0] + M[7] * lc[1] + M[8] * lc[2]];
    if (distEye(p) > (fast() ? 4000 : 30000)) return;
    addFx(new Burst({ t0: t, pos: p, mom: [vel[0] * .8, vel[1] * .8, vel[2] * .8], sc: .05 * k, nF: Math.round(10 * k), ns: Math.round(10 * k), fire: .22 * k, smoke: 3 * k, life: 3, gy: Math.max(0, game.ground(p[0], p[2])), seed, kind: 'destruct' }), 3);
  }
  /* the round is gone from the sim: its core comes free (a crash: into the sea), or breaks up (src) */
  function endSpin(S, how, e) {
    if (!S) return;
    spins.delete(S.id);
    const b = S.b;
    if (!b || !b.on || b.gen !== S.gen) return;
    const t = e ? e.t : sim.t;
    if (how === 'sea' || how === 'ground') {
      // the sim drew the splash / the dirt: the core goes on from there into the water, or lies on the ground
      b.mode = AIR; b.t0 = b.tl = b.pt = t;
      const v = S.vel, w = omegaAt(S, t, v, [0, 0, 0]);
      b.v[0] = v[0]; b.v[1] = v[1]; b.v[2] = v[2]; b.w[0] = w[0]; b.w[1] = w[1]; b.w[2] = w[2];
      b.o.splash = 0; b.h = H_MOD;
      if (e && e.pos) { b.p[0] = e.pos[0]; b.p[1] = Math.max(b.p[1], e.pos[1]); b.p[2] = e.pos[2]; }
      b.pp[0] = b.p[0]; b.pp[1] = b.p[1]; b.pp[2] = b.p[2];
      b.o.burn = null;
      // a round into the ground at speed is spent: nothing of it lies there
      if (how === 'ground') world.release(b);
      return;
    }
    world.release(b);
  }

  /* ---------------------------------------------------------------- events: rounds */
  function srcOfRound(id, e, cause) {
    const c = seenP.get(id), p = sim.projectiles.get(id), S = spins.get(id);
    if (!c && !p && !(e && e.vel)) return null;
    const kind = (e && e.kind && e.proj === id ? e.kind : null) || (c && c.kind) || (p && p.kind);
    const P = game.PROJ[kind] || {};
    const key = (e && (e.key || e.model) && e.proj === id ? e.key || e.model : null) || (c && c.key) || P.model;
    const t0 = e ? e.t : sim.t;
    const own = e && e.proj === id;
    const vel = own && e.vel ? e.vel.slice() : p && p.vel ? p.vel.slice() : c ? c.vel.slice() : [0, 0, 0];
    let T0;
    // the sim's break-up carries the round's own place (at) beside the struck point (pos)
    if (own && e.at) T0 = e.at.slice();
    else if (own && e.pos && (e.vel || e.breakup || GUNS[e.byKind])) T0 = e.pos.slice();
    else if (p) T0 = p.pos.slice();
    else if (c) T0 = projAt(c, t0, [0, 0, 0]);
    else T0 = e.pos.slice();
    const st = Object.assign({}, (c && c.st) || (p && p.st) || {});
    return { id, kind, key, side: c ? c.side : p ? p.side : e.side, T0, v0: vel, t0, st, cause, S, c, hit: own && e.at && e.pos ? e.pos : null, imp: own && e.imp ? e.imp : null };
  }
  function roundBreaks(id, e, cause) {
    if (broken.has(id)) return;
    const src = srcOfRound(id, e, cause);
    if (!src) return;
    broken.set(id, sim.t);
    const S = src.S;
    if (!src.key || NO_BREAK[src.kind] || !planOfProj(src.key) || (!visProj(src.c) && !S)) { if (S) endSpin(S, 'gone'); return; }
    const plan = planOfProj(src.key), ent = R.models.has(plan.draw) ? R.models.get(plan.draw) : null;
    if (!ent) { if (S) endSpin(S, 'gone'); return; }
    const seed = (e && e.seed) || (id * 7919 + Math.floor(src.t0 * 20)), r = rng(seed + 3);
    const bb = boxOf(ent, [plan.body], src.st), zlo = bb ? bb.mn[2] : -2, zhi = bb ? bb.mx[2] : 2, L = zhi - zlo;
    let M0, w0 = e && (e.w || e.angVel || e.omega) && e.proj === id ? (e.w || e.angVel || e.omega).slice() : [0, 0, 0], attached = null, cutZ = null;
    if (S) {
      // a tumbling round: from where and how it turns now
      M0 = frameAt(S, src.t0, src.v0, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      w0 = omegaAt(S, src.t0, src.v0, [0, 0, 0]);
      attached = S.attached; cutZ = S.tail;
      spins.delete(id);
      if (S.b.on && S.b.gen === S.gen) world.release(S.b);
    } else M0 = attitudeOfVel(src.v0, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // where it was struck, along its axis: the struck point, else the part, else a gun's stream walks onto the nose
    let hitZ;
    const hp = e && e.proj === id && (e.part || e.hitPart);
    if (src.hit) hitZ = (src.hit[0] - src.T0[0]) * M0[2] + (src.hit[1] - src.T0[1]) * M0[5] + (src.hit[2] - src.T0[2]) * M0[8];
    else if (hp && hasPart(ent, hp)) hitZ = zMid(ent, hp, src.st);
    else if (hp && R.models.has(src.key) && hasPart(R.models.get(src.key), hp)) hitZ = zMid(R.models.get(src.key), hp, src.st);
    else if (cause === 'gun') hitZ = zhi - L * (.22 + .25 * r.r());
    else hitZ = zlo + L * (.3 + .4 * r.r());
    const out = breakRound({ key: src.key, kind: src.kind, side: src.side, T0: src.T0, M0, v0: src.v0, w0, t0: src.t0, st: src.st, hitZ, cause, seed, cutZ, attached, imp: src.imp });
    if (out && out.length) announce({ t: src.t0, pos: src.T0, id, kind: src.kind, key: plan.draw, L, heavy: !!HEAVY[src.kind], side: src.side, w: 9 });
  }
  /* the bus and bullet time: a break-up that reads on screen */
  function announce(b) {
    const d = distEye(b.pos), px = (b.L || 5) * cam.fl / Math.max(1, d);
    b.dist = d; b.px = px; b.onScreen = onScreen(b.pos);
    bus.emit('breakup', b);
    bullet.want(b);
  }

  /* ---------------------------------------------------------------- aircraft coming apart */
  function planeDown(u, e) {
    const plan = UNIT_PLANS[u.def.model];
    if (!plan || !plan.takeover || !R.models.has(plan.draw) || u.aboard) return;
    if (!visUnit(u)) return;
    const ent = R.models.get(plan.draw);
    warm(plan.draw);
    const seed = u.id * 131 + Math.floor(e.t * 20), r = rng(seed);
    const pose = game.unitPose(u);
    const M0 = attitudeM(pose.hdg, pose.pitch, pose.roll, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const st = Object.assign({}, u.def.modelState ? u.def.modelState(u, game.t) : u.st || {});
    const all = partNames(ent).filter(n => shown(ent, n, st));
    const coreBox = boxOf(ent, plan.core, st) || { ext: [1, 1, 3], c: [0, 0, 0] };
    const b = world.alloc(cam.eye);
    if (!b) return;
    world.shape(b, coreBox.ext[0], coreBox.ext[1], coreBox.ext[2], 5000, false);
    b.kind = 2; b.mode = FOLLOW; b.t0 = b.tl = b.pt = e.t; b.c[0] = b.c[1] = b.c[2] = 0;
    common(b, 'core', { inst: newInst(plan.draw, st, liveMask(ent, all), tintOf(u.side)), tint0: .35, fadeT: 3, unit: u.id });
    const sp = plan.spin, wb = [mix(sp.pitch[0], sp.pitch[1], r.r()), mix(sp.yaw[0], sp.yaw[1], r.r()) * (plan.rotor ? 1 : r.sign()), mix(sp.roll[0], sp.roll[1], r.r()) * r.sign()];
    const w0 = Math.hypot(wb[0], wb[1], wb[2]) || 1;
    const aW = [(M0[0] * wb[0] + M0[1] * wb[1] + M0[2] * wb[2]) / w0, (M0[3] * wb[0] + M0[4] * wb[1] + M0[5] * wb[2]) / w0, (M0[6] * wb[0] + M0[7] * wb[1] + M0[8] * wb[2]) / w0];
    // which pieces go, and when: the first at once (the hit), the rest as it falls
    const groups = [];
    plan.loose.forEach((g, i) => {
      const names = g.filter(n => all.includes(n));
      if (!names.length) return;
      const pr = plan.order ? plan.order[i] : .6;
      if (i === 0 || r.r() < pr) groups.push({ names, w: pr + r.r() * .3 });
    });
    groups.sort((a, b2) => b2.w - a.w);
    // left or right wing first: either
    if (groups.length > 1 && /R$/.test(groups[0].names[0]) && /L$/.test(groups[1].names[0]) && r.r() < .5) { const g = groups[0]; groups[0] = groups[1]; groups[1] = g; }
    const sheds = groups.map((g, i) => ({ t: e.t + (i === 0 ? .02 : .25 + i * (.25 + .55 * r.r())), names: g.names }));
    const S = { kind: 'unit', id: u.id, plan, ent, key: plan.draw, st, b, M0, aW, w0, Tr: .6 + .4 * r.r(), psi: 0, t0: e.t, sheds, boosts: [], tail: null, side: u.side, seed,
      attached: new Set(all), tmpA: new Array(9), tmpB: new Array(9), M: [1, 0, 0, 0, 1, 0, 0, 0, 1], vel: [0, 0, 0], unit: u };
    S.gen = b.gen;
    planes.set(u.id, S);
    taken.add(u.id);
    const L = Math.max(coreBox.ext[0], coreBox.ext[2]) * 2;
    announce({ t: e.t, pos: pose.pos.slice(), id: u.id, kind: u.type, key: plan.draw, L, heavy: false, side: u.side, w: 8, unit: u.id });
  }
  function planeVel(u, out) {
    out[0] = Math.sin(u.hdg) * (u.speed || 0); out[1] = u.vy || 0; out[2] = Math.cos(u.hdg) * (u.speed || 0);
    return out;
  }
  /* the fuselage reaches the sea or the ground (the sim's crash) or the unit is gone */
  function planeEnd(S, e) {
    planes.delete(S.id);
    const b = S.b;
    if (!b || !b.on || b.gen !== S.gen) return;
    const t = e ? e.t : sim.t;
    const w = spinW(S, t, null, [0, 0, 0]);
    b.mode = AIR; b.t0 = b.tl = b.pt = t; b.h = H_MOD;
    b.v[0] = S.vel[0]; b.v[1] = Math.min(S.vel[1], -2); b.v[2] = S.vel[2];
    b.w[0] = w[0] * .5; b.w[1] = w[1] * .5; b.w[2] = w[2] * .5;
    // the core as a body: the centre of its box, not the model origin
    const c = boxOf(S.ent, [...S.attached], S.st);
    if (c) {
      qMat(b.q, M9);
      b.p[0] += M9[0] * c.c[0] + M9[1] * c.c[1] + M9[2] * c.c[2]; b.p[1] += M9[3] * c.c[0] + M9[4] * c.c[1] + M9[5] * c.c[2]; b.p[2] += M9[6] * c.c[0] + M9[7] * c.c[1] + M9[8] * c.c[2];
      b.c[0] = c.c[0]; b.c[1] = c.c[1]; b.c[2] = c.c[2];
      world.shape(b, c.ext[0], c.ext[1], c.ext[2], S.plan.rho * 8 * c.ext[0] * c.ext[1] * c.ext[2] * .5, false);
    }
    if (e && e.pos) b.p[1] = Math.max(b.p[1], e.pos[1] + b.r * .3);
    b.pp[0] = b.p[0]; b.pp[1] = b.p[1]; b.pp[2] = b.p[2];
    b.o.splash = 0;
    b.floatT = S.plan.rho < 100 ? 6 + 10 * hsh(S.id, 3) : 0; b.sinkV = 1.2;
    b.life = 200;
  }

  /* ---------------------------------------------------------------- ships, vehicles, sites */
  function unitMods(u, e) {
    const plan = UNIT_PLANS[u.def.model];
    if (!plan || !plan.mods || !plan.mods.length || !R.models.has(u.def.model) || u.aboard) return;
    if (!visUnit(u)) return;
    if (u.def.sub && (u.depth || 0) > u.def.draught + 2) return;
    const ent = R.models.get(u.def.model), key = u.def.model;
    const seed = u.id * 977 + Math.floor(e.t * 20), r = rng(seed);
    const pose = game.unitPose(u);
    const M0 = attitudeM(pose.hdg, pose.pitch, pose.roll, [0, 0, 0, 0, 0, 0, 0, 0, 0]), T0 = pose.pos.slice();
    const st = Object.assign({}, u.def.modelState ? u.def.modelState(u, game.t) : u.st || {});
    const sea = u.def.domain === 'sea';
    const vb = sea ? [Math.sin(pose.hdg) * (u.speed || 0), 0, Math.cos(pose.hdg) * (u.speed || 0)] : [0, 0, 0];
    const gone = hid.get(u.id) || liveMask(ent, partNames(ent));
    // the blast pushes away from the side it came from
    const by = e.by && sim.units.get(e.by);
    let away = r.r() * TAU;
    if (by) away = Math.atan2(T0[0] - by.pos[0], T0[2] - by.pos[2]);
    const list = (u.roll || 0) >= 0 ? 1 : -1;
    let n = 0;
    for (const md of plan.mods) {
      if (md.p !== undefined && r.r() > md.p) continue;
      const names = md.parts.filter(nm => hasPart(ent, nm) && shown(ent, nm, st) && gone[nm] !== 0);
      if (!names.length) continue;
      const box = boxOf(ent, names, st);
      if (!box) continue;
      const plate = isPlate(box.ext);
      const ext = plate ? thicken(box.ext) : box.ext;
      const m = massOf(ext, false, md.rho || 200, 40, false);
      const tint = tintOf(u.side);
      if (md.how === 'topple') {
        const b = spawnModule({ ent, key, names, st, T0, M0, v: vb, w: [0, 0, 0], t0: e.t + .15 + .5 * r.r(), tint, mass: m, plate, seed: seed + n * 17, floatT: md.rho < 80 ? 20 + 30 * r.r() : 0, sinkV: 1.5, life: 300 });
        if (!b) continue;
        b.o.from = u.id;
        // over the side the hull lists to (a vehicle: any way but toward the blast)
        let fx, fz;
        if (sea) { fx = list; fz = r.n() * .45; }
        else { const a = away + r.n() * .9; const lx = Math.sin(a), lz = Math.cos(a); fx = M0[0] * lx + M0[6] * lz; fz = M0[2] * lx + M0[8] * lz; }
        const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
        const axm = [fz, 0, -fx];
        const ax = [M0[0] * axm[0] + M0[2] * axm[2], M0[3] * axm[0] + M0[5] * axm[2], M0[6] * axm[0] + M0[8] * axm[2]];
        const al = Math.hypot(ax[0], ax[1], ax[2]) || 1; ax[0] /= al; ax[1] /= al; ax[2] /= al;
        const foot = [box.c[0], box.mn[1], box.c[2]];
        const piv = [T0[0] + M0[0] * foot[0] + M0[1] * foot[1] + M0[2] * foot[2], T0[1] + M0[3] * foot[0] + M0[4] * foot[1] + M0[5] * foot[2], T0[2] + M0[6] * foot[0] + M0[7] * foot[1] + M0[8] * foot[2]];
        const r0 = [b.p[0] - piv[0], b.p[1] - piv[1], b.p[2] - piv[2]];
        const Iax = b.I[0] * axm[0] * axm[0] + b.I[2] * axm[2] * axm[2];
        const rp = Math.hypot(r0[0], r0[1], r0[2]) ** 2 - (r0[0] * ax[0] + r0[1] * ax[1] + r0[2] * ax[2]) ** 2;
        b.hinge = { t: 0, piv, vel: vb.slice(), ax, th: 0, om: .2 + .35 * r.r(), thRel: md.rel || 1, r0, q0: b.q.slice(), Ip: Iax + b.m * rp, kick: [r.n() * .3, r.n() * .3, r.n() * .3] };
        b.mode = HINGE;
        n++;
      } else {
        // thrown up and off: outboard over the side for a ship, away from the blast for a vehicle
        let hx, hz;
        if (sea) { const sx = box.c[0] > .5 ? 1 : box.c[0] < -.5 ? -1 : r.sign(); hx = M0[0] * sx + M0[2] * r.n() * .4; hz = M0[6] * sx + M0[8] * r.n() * .4; }
        else { const a = away + r.n() * .8; hx = Math.sin(a); hz = Math.cos(a); }
        const hl = Math.hypot(hx, hz) || 1, up = mix(md.up[0], md.up[1], r.r()), hs = sea ? (6 + 7 * r.r()) * Math.sqrt(8 / Math.max(2, Math.cbrt(m))) : 4 + 4 * r.r();
        const v = [vb[0] + hx / hl * hs, up, vb[2] + hz / hl * hs];
        const ws = mix(md.spin[0], md.spin[1], r.r());
        const w = [r.n() * ws, r.n() * ws * .6, r.n() * ws];
        const b = spawnModule({ ent, key, names, st, T0, M0, v, w, t0: e.t + .02 + .12 * r.r(), tint, mass: m, plate, seed: seed + n * 17, floatT: md.rho < 80 ? 25 + 30 * r.r() : 0, sinkV: 2, life: 300 });
        if (!b) continue;
        b.o.from = u.id;
        if (r.r() < .5) b.o.burn = { stage: STAGE.damaged, until: b.t0 + 3 + 5 * r.r(), tr: null, glow: .6 };
        n++;
      }
      for (const nm of names) gone[nm] = 0;
    }
    if (n) { hid.set(u.id, gone); stats.breakups++; }
  }

  /* ---------------------------------------------------------------- effects the physics causes */
  world.hooks.onWater = (b, sp) => {
    const o = b.o; if (!o) return;
    if (o.burn) o.burn.until = Math.min(o.burn.until, b.tl);
    if (!o.splash || distEye(b.p) > 30000) return;
    const t = b.tl;
    if (b.kind === 1) { if (b.ext[0] > .12) fxq.push({ k: 'drop', t0: t, p: [b.p[0], 0, b.p[2]], s: b.ext[0] * 10, seed: b.seed }); return; }
    const H = clamp(1.1 * Math.cbrt(b.m) * Math.sqrt(sp / 60), 1.2, 34);
    if (splashes >= (fast() ? 3 : 10) || (fast() && b.m < 200)) return;
    splashes++;
    addFx(new Splash({ t0: t, pos: [b.p[0], 0, b.p[2]], size: H, seed: b.seed * 3 + 1, ring: H > 6 ? .35 : .2 }), 2);
  };
  world.hooks.onSkip = (b, sp) => {
    const o = b.o; if (!o || !o.splash || distEye(b.p) > 30000) return;
    if (b.kind === 1) { fxq.push({ k: 'drop', t0: b.tl, p: [b.p[0], 0, b.p[2]], s: b.ext[0] * 6, seed: b.seed + b.skips }); return; }
    const H = clamp(.5 * Math.cbrt(b.m) * Math.sqrt(sp / 60), .8, 14);
    if (splashes >= (fast() ? 3 : 10) || fast()) return;
    splashes++;
    addFx(new Splash({ t0: b.tl, pos: [b.p[0], 0, b.p[2]], size: H, seed: b.seed * 5 + b.skips, ring: .15 }), 2);
  };
  world.hooks.onGround = (b, impact) => {
    const o = b.o; if (!o || distEye(b.p) > 20000) return;
    const g = game.ground(b.p[0], b.p[2]);
    if (b.kind === 1) { if (impact > 8 && b.bounces < 2) fxq.push({ k: 'puff', t0: b.tl, p: [b.p[0], g, b.p[2]], s: .6 + b.ext[0] * 3, seed: b.seed }); return; }
    if (impact > 22 && b.m > 150 && b.bounces < 2) addFx(new Dirt({ t0: b.tl, pos: [b.p[0], g, b.p[2]], size: clamp(Math.cbrt(b.m) * impact / 40, 3, 16), seed: b.seed * 7 + b.bounces }), 2);
    else if (impact > 3 && b.bounces < 5) fxq.push({ k: 'puff', t0: b.tl, p: [b.p[0], g, b.p[2]], s: clamp(b.r * .8 + impact * .05, .8, 9), seed: b.seed + b.bounces * 3 });
  };
  world.hooks.onFree = b => { const o = b.o; if (o && o.burn) o.burn.until = -1; };

  /* ---------------------------------------------------------------- ship hulls: a piece strikes a side (a flash, it
     scrapes off and drops into the sea) or lands on a deck (it stays there, riding the ship down if she sinks). Against
     the sim's own bodies (sim/bodies.js: the part boxes of the hull); a piece thrown off a ship is let through its own
     hull until it is clear of it */
  const ships = [], shipPool = [];
  function refreshShips() {
    ships.length = 0;
    for (const u of sim.units.values()) {
      if (u.def.domain !== 'sea' || u.aboard || (u.def.sub && (u.depth || 0) > u.def.draught + 2)) continue;
      const S = shipPool[ships.length] || (shipPool[ships.length] = { u: null, T: [0, 0, 0], M: [1, 0, 0, 0, 1, 0, 0, 0, 1] });
      const pose = game.unitPose(u);
      S.u = u; S.T[0] = pose.pos[0]; S.T[1] = pose.pos[1]; S.T[2] = pose.pos[2];
      attitudeM(pose.hdg, pose.pitch, pose.roll, S.M);
      ships.push(S);
    }
  }
  /* the true top of a hull (decks, deckhouse roofs, mounts) as a height map in its model frame: the highest return of
     the model's samples (a level of about the cell's spacing) per cell; moving parts by their bounds. The sim's boxes
     are coarse on top (a deckhouse's box spans the lower hangar), so decks come from here. Built once per model, once
     its samples are there */
  const decks = new Map();
  function deckOf(u) {
    const key = u.def.model;
    let D = decks.get(key);
    if (D && (D.done || game.realT - D.tried < 1)) return D.H ? D : null;
    if (!R.models.has(key)) return null;
    const e = R.models.get(key), L = u.def.size[0], B = u.def.size[1], cs = L > 200 ? 2.5 : 1.5;
    const x0 = -B / 2 - 3, z0 = -L / 2 - 3, nx = Math.ceil((B + 6) / cs), nz = Math.ceil((L + 6) / cs), H = new Float32Array(nx * nz).fill(-1e9);
    const put = (x, y, z) => { const ix = Math.floor((x - x0) / cs), iz = Math.floor((z - z0) / cs); if (ix >= 0 && iz >= 0 && ix < nx && iz < nz && y > H[iz * nx + ix]) H[iz * nx + ix] = y; };
    const putX = (X, x, y, z) => { if (X) { const Rm = X.R, Tt = X.T; put(Rm[0] * x + Rm[1] * y + Rm[2] * z + Tt[0], Rm[3] * x + Rm[4] * y + Rm[5] * z + Tt[1], Rm[6] * x + Rm[7] * y + Rm[8] * z + Tt[2]); } else put(x, y, z); };
    let done = true;
    for (const P of e.parts) {
      if (P.part.inside) continue;
      let X = null; try { X = P.part.xf ? P.part.xf({}) : null; } catch (err) { X = null; }
      if (P.dyn) {
        // a mount or a hatch: its box's top
        const b0 = P.bounds; if (!b0 || b0[0][0] > b0[1][0]) continue;
        for (let x = b0[0][0]; x <= b0[1][0] + 1e-6; x += cs * .5) for (let z = b0[0][2]; z <= b0[1][2] + 1e-6; z += cs * .5) putX(X, x, b0[1][1], z);
        continue;
      }
      let cl = null;
      for (let l = 0; l < e.lods.length; l++) if (e.lods[l] >= cs * .5 && P.clouds[l] && P.clouds[l].pts) { cl = P.clouds[l]; break; }
      if (!cl) for (let l = e.lods.length - 1; l >= 0; l--) if (P.clouds[l] && P.clouds[l].pts) { cl = P.clouds[l]; break; }
      if (!cl) { done = false; continue; }
      const f = cl.pts, n = cl.n;
      for (let i = 0; i < n; i++) putX(X, f[i * 4], f[i * 4 + 1], f[i * 4 + 2]);
    }
    D = { x0, z0, cs, nx, nz, H, done, tried: game.realT };
    decks.set(key, D);
    return D;
  }
  /* the deck height at a model-frame point: the highest of its cell and the next ones (the samples are sparse) */
  function deckAt(D, x, z) {
    const ix = Math.floor((x - D.x0) / D.cs), iz = Math.floor((z - D.z0) / D.cs);
    let h = -1e9;
    for (let j = iz - 1; j <= iz + 1; j++) for (let i = ix - 1; i <= ix + 1; i++) if (i >= 0 && j >= 0 && i < D.nx && j < D.nz) { const v = D.H[j * D.nx + i]; if (v > h) h = v; }
    return h;
  }
  const LP = [0, 0, 0];
  const toShip = (S, x, y, z, o) => { const M = S.M, dx = x - S.T[0], dy = y - S.T[1], dz = z - S.T[2]; o[0] = M[0] * dx + M[3] * dy + M[6] * dz; o[1] = M[1] * dx + M[4] * dy + M[7] * dz; o[2] = M[2] * dx + M[5] * dy + M[8] * dz; return o; };
  /* a piece coming down onto a deck (from above it this step) lands there: a knock, it slides, and once still it rides
     the ship */
  function deckLand(b, S) {
    const u = S.u, hb = u.def.size[1] / 2 + .5, hl = u.def.size[0] / 2 + .5;
    toShip(S, b.p[0], b.p[1], b.p[2], LP);
    if (Math.abs(LP[0]) > hb || Math.abs(LP[2]) > hl) return false;
    const D = deckOf(u); if (!D) return false;
    const hd = deckAt(D, LP[0], LP[2]); if (hd < -1e8) return false;
    const M = S.M, ux = M[1], uy = M[4], uz = M[7];
    const sup = b.kind === 1 ? .05 : world.reach(b, ux, uy, uz);
    const low = LP[1] - sup;
    if (low > hd) return false;
    const lyp = toShip(S, b.pp[0], b.pp[1], b.pp[2], LP)[1];
    if (lyp - sup < hd - 1.5) return false;          // it was already below this deck: a side, not a landing
    const k = hd - low + .02;
    b.p[0] += ux * k; b.p[1] += uy * k; b.p[2] += uz * k;
    const sp = u.speed || 0, uvx = Math.sin(u.hdg) * sp, uvz = Math.cos(u.hdg) * sp, v = b.v;
    let rx = v[0] - uvx, ry = v[1], rz = v[2] - uvz;
    const vn = rx * ux + ry * uy + rz * uz;
    if (vn < 0) {
      const e = b.kind === 1 ? .2 : .12;
      rx -= (1 + e) * vn * ux; ry -= (1 + e) * vn * uy; rz -= (1 + e) * vn * uz;
      rx *= .55; rz *= .55;
      v[0] = uvx + rx; v[1] = ry; v[2] = uvz + rz;
      b.w[0] *= .5; b.w[1] *= .5; b.w[2] *= .5;
      if (-vn > 25 && b.o && distEye(b.p) < 20000) {
        if (b.kind === 1) fxq.push({ k: 'spark', t0: b.tl, p: b.p.slice(), s: 1, seed: b.seed, n: [ux, uy, uz] });
        else addFx(new Blast({ t0: b.tl, pos: b.p.slice(), sc: clamp(Math.cbrt(b.m) * -vn / 9000, .02, .12), sea: false, gy: 0, seed: b.seed * 13 + 5 }), 3);
      }
    }
    if (Math.hypot(rx, ry, rz) < 2.5) rideShip(b, u);
    return true;
  }
  world.collide = (b, h) => {
    if (!BOD || !ships.length || b.mode !== AIR) return false;
    const { segUnit, pointUnit, bodyOf } = BOD;
    const p = b.p, q = b.pp, o = b.o;
    for (let i = 0; i < ships.length; i++) {
      const S = ships[i], u = S.u, bd = bodyOf(u.def);
      const dx = p[0] - u.pos[0], dy = p[1] - u.pos[1], dz = p[2] - u.pos[2], reach = bd.R + b.r + Math.hypot(p[0] - q[0], p[2] - q[2]) + 2;
      if (dx * dx + dz * dz > reach * reach || dy > bd.R + b.r) continue;
      if (o && o.from === u.id && !o.clear) { if (pointUnit(u, dx, dy, dz) > b.r * .6 + .4) o.clear = true; else continue; }
      if (deckLand(b, S)) return true;
      const t = segUnit(u, q[0] - u.pos[0], q[1] - u.pos[1], q[2] - u.pos[2], dx, dy, dz, b.kind === 1 ? .05 : Math.min(1.2, b.r * .35), 0);
      if (t < 0) continue;
      if (hullHit(b, u, t)) return true;
    }
    return false;
  };
  /* a side (or an end) of a hull or a deckhouse struck: it knocks off and drops; the tops of the sim's boxes are left to
     the deck map (false) */
  function hullHit(b, u, t) {
    const q = b.pp, p = b.p, v = b.v;
    const ex = q[0] + (p[0] - q[0]) * t, ey = q[1] + (p[1] - q[1]) * t, ez = q[2] + (p[2] - q[2]) * t;
    const c = Math.cos(u.hdg), s = Math.sin(u.hdg), sp = u.speed || 0, uvx = s * sp, uvz = c * sp;
    const rvx = v[0] - uvx, rvy = v[1], rvz = v[2] - uvz;
    // the face it met: a deck from above, a side (beam), else an end
    const hb = u.def.size[1] / 2, lx = BOD.HIT.x, lz = BOD.HIT.z;
    if (rvy < -Math.hypot(rvx, rvz) * .4 && Math.abs(lx) < hb * .92) return false;
    let nx, nz;
    const ny = 0;
    if (Math.abs(lx) > hb * .5) { const sx = lx < 0 ? -1 : 1; nx = c * sx; nz = -s * sx; }
    else { const sz = lz < 0 ? -1 : 1; nx = s * sz; nz = c * sz; }
    const vn = rvx * nx + rvy * ny + rvz * nz;
    if (vn >= 0) return false;
    const e = b.kind === 1 ? .25 : .1, kt = ny > .5 ? .3 : .4;
    const tx = rvx - vn * nx, ty = rvy - vn * ny, tz = rvz - vn * nz;
    v[0] = uvx + tx * kt - vn * e * nx; v[1] = ty * kt - vn * e * ny; v[2] = uvz + tz * kt - vn * e * nz;
    const out = b.r * .25 + .08;
    p[0] = ex + nx * out; p[1] = ey + ny * out; p[2] = ez + nz * out;
    // the blow sets it spinning
    const w = b.w, k = Math.min(6, -vn * .04) / Math.max(.3, b.r);
    w[0] = w[0] * .5 + (ny * tz - nz * ty) * k * .1; w[1] = w[1] * .5 + (nz * tx - nx * tz) * k * .1; w[2] = w[2] * .5 + (nx * ty - ny * tx) * k * .1;
    const imp = -vn, o = b.o;
    if (o && o.burn && ny < .5) o.burn.until = Math.min(o.burn.until, b.tl + .8);
    if (imp > 25 && o && distEye(p) < 20000) {
      if (b.kind === 1) fxq.push({ k: 'spark', t0: b.tl, p: [ex, ey, ez], s: 1, seed: b.seed, n: [nx, ny, nz] });
      else addFx(new Blast({ t0: b.tl, pos: [ex, ey, ez], sc: clamp(Math.cbrt(b.m) * imp / 9000, .02, .16), sea: false, gy: 0, seed: b.seed * 13 + 3 }), 3);
    }
    return true;
  }
  const QS = [1, 0, 0, 0], QC = [1, 0, 0, 0], QA = [1, 0, 0, 0], MS = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function rideShip(b, u) {
    const pose = game.unitPose(u);
    attitudeM(pose.hdg, pose.pitch, pose.roll, MS); matQ(MS, QS);
    // it comes to rest on its broadest face (a section on its side, a fin flat), its foot where it touched
    if (b.kind !== 1) {
      const ux = MS[1], uy = MS[4], uz = MS[7], M = qMat(b.q, b.M), e = b.ext;
      const sup0 = world.reach(b, ux, uy, uz);
      const ax = e[0] <= e[1] && e[0] <= e[2] ? 0 : e[1] <= e[2] ? 1 : 2;
      let ax0 = M[ax], ax1 = M[3 + ax], ax2 = M[6 + ax];
      const d0 = ax0 * ux + ax1 * uy + ax2 * uz;
      if (d0 < 0) { ax0 = -ax0; ax1 = -ax1; ax2 = -ax2; }
      const cx = ax1 * uz - ax2 * uy, cy = ax2 * ux - ax0 * uz, cz = ax0 * uy - ax1 * ux, cl = Math.hypot(cx, cy, cz);
      if (cl > 1e-4) {
        const ang = Math.atan2(cl, Math.abs(d0));
        qMul(qAxis(cx / cl, cy / cl, cz / cl, ang, QA), b.q, b.q); qNorm(b.q); qMat(b.q, b.M);
      }
      const k = e[ax] - sup0;
      b.p[0] += ux * k; b.p[1] += uy * k; b.p[2] += uz * k;
    }
    const dx = b.p[0] - pose.pos[0], dy = b.p[1] - pose.pos[1], dz = b.p[2] - pose.pos[2];
    const lp = [MS[0] * dx + MS[3] * dy + MS[6] * dz, MS[1] * dx + MS[4] * dy + MS[7] * dz, MS[2] * dx + MS[5] * dy + MS[8] * dz];
    QC[0] = QS[0]; QC[1] = -QS[1]; QC[2] = -QS[2]; QC[3] = -QS[3];
    const lq = qMul(QC, b.q, [1, 0, 0, 0]);
    b.mode = FOLLOW; b.v[0] = b.v[1] = b.v[2] = 0; b.w[0] = b.w[1] = b.w[2] = 0;
    if (b.o) { b.o.ship = { id: u.id, lp, lq }; if (b.o.burn) b.o.burn.until = Math.min(b.o.burn.until, b.tl + 4); }
  }
  function updateRiders(t) {
    for (const b of world.B) {
      if (!b.on || b.mode !== FOLLOW || !b.o || !b.o.ship) continue;
      const u = sim.units.get(b.o.ship.id);
      if (!u || (!u.alive && u.dying > .97)) { world.release(b); continue; }
      const pose = game.unitPose(u), L = b.o.ship.lp;
      attitudeM(pose.hdg, pose.pitch, pose.roll, MS); matQ(MS, QS);
      b.p[0] = pose.pos[0] + MS[0] * L[0] + MS[1] * L[1] + MS[2] * L[2];
      b.p[1] = pose.pos[1] + MS[3] * L[0] + MS[4] * L[1] + MS[5] * L[2];
      b.p[2] = pose.pos[2] + MS[6] * L[0] + MS[7] * L[1] + MS[8] * L[2];
      qMul(QS, b.o.ship.lq, b.q);
      b.pp[0] = b.p[0]; b.pp[1] = b.p[1]; b.pp[2] = b.p[2]; b.pq[0] = b.q[0]; b.pq[1] = b.q[1]; b.pq[2] = b.q[2]; b.pq[3] = b.q[3];
      b.tl = b.pt = t;
    }
  }

  /* ---------------------------------------------------------------- smoke fed from the bodies */
  function feed(t) {
    for (const b of world.B) {
      if (!b.on || !b.o || !b.o.burn) continue;
      const B = b.o.burn;
      if (t > B.until || b.mode === SEA || b.mode === REST || t < b.t0) { if (B.tr && t > B.until + 1) B.tr = null; continue; }
      // at the high time rates only the pieces near the lens lay smoke (a trail fed 0.5 s of flight a frame is costly)
      if (fast() && distEye(b.p) > 3000) { B.tr = null; continue; }
      if (!B.tr) {
        if (distEye(b.p) > 40000) continue;
        B.tr = new Trail(b.kind === 1 ? 160 : 900, b.seed * 11 + 5, (x, z) => game.ground(x, z));
        // alive from now (the FX system drops a trail that has laid nothing for its life)
        B.tr.last = t; B.tr.maxLife = B.stage.life;
        if (!addTrail(B.tr)) { b.o.burn = null; continue; }
      }
      world.pose(b, t, P3, Q4);
      qMat(Q4, M9);
      // at the torn end for a section, else the middle
      let x = P3[0], y = P3[1], z = P3[2];
      if (B.z !== undefined) { const dz = B.z - b.c[2]; x += M9[2] * dz; y += M9[5] * dz; z += M9[8] * dz; }
      const v = b.v, l = Math.hypot(v[0], v[1], v[2]) || 1;
      B.tr.feed(t, x, y, z, B.stage, v[0] / l, v[1] / l, v[2] / l);
    }
  }

  /* ---------------------------------------------------------------- per frame */
  function updateSpins(t) {
    for (const S of spins.values()) {
      // its body taken back by the pool (cleared): the round is drawn by the render system again
      if (!S.b.on || S.b.gen !== S.gen) { spins.delete(S.id); continue; }
      if (S.ghost) continue;
      const p = sim.projectiles.get(S.id);
      if (!p || !p.alive) { endSpin(S, 'gone'); continue; }
      const pp = game.projPose(p);
      S.vel[0] = p.vel[0]; S.vel[1] = p.vel[1]; S.vel[2] = p.vel[2];
      corePose(S, pp.pos, t, S.vel);
      // pieces due
      while (S.sheds.length && S.sheds[0].t <= t) {
        const sh = S.sheds.shift(), w = omegaAt(S, t, S.vel, [0, 0, 0]);
        if (sh.tail) shedTail(S, t, pp.pos, S.vel, w);
        else shedFrom(S, sh.names, t, pp.pos, S.vel, w, true);
        frameAt(S, t, S.vel, S.M);
      }
      S.b.o.inst.st = S.st;
    }
    for (const S of planes.values()) {
      if (!S.b.on || S.b.gen !== S.gen) { planes.delete(S.id); continue; }
      const u = sim.units.get(S.id);
      if (!u) { planeEnd(S, null); continue; }
      const pose = game.unitPose(u);
      planeVel(u, S.vel);
      corePose(S, pose.pos, t, null);
      while (S.sheds.length && S.sheds[0].t <= t) {
        const sh = S.sheds.shift(), w = spinW(S, t, null, [0, 0, 0]);
        const b = shedFrom(S, sh.names, t, pose.pos, S.vel, w, true);
        // a rotor flies off spinning as it turned, lifting away
        if (b && S.plan.rotor && sh.names.includes(S.plan.rotor)) {
          const up = [S.M[1], S.M[4], S.M[7]], rw = 27 * (hsh(S.id, 5) < .5 ? 1 : -1);
          b.w[0] = up[0] * rw; b.w[1] = up[1] * rw; b.w[2] = up[2] * rw;
          b.v[0] += up[0] * 9; b.v[1] += up[1] * 9 + 3; b.v[2] += up[2] * 9;
        }
        if (b && S.plan.burn && hsh(S.id, S.sheds.length + 9) < .6) b.o.burn = { stage: STAGE.damaged, until: t + 2 + 5 * hsh(S.id, 11), tr: null, glow: .7 };
        spinM(S, t, null, S.M);
      }
      S.b.o.inst.st = S.st;
    }
  }

  /* ---------------------------------------------------------------- drawing */
  /* a smear of dots behind a fast piece: the distance it covers in one exposure (1/60 s of game time, at least a few
     thousandths of a second: in bullet time the smear shortens with the clock, as the films' streaks do) */
  function streak(fx, P, v, sh, dist, k, r, g, b) {
    const sp = Math.hypot(v[0], v[1], v[2]), L = sp * sh;
    if (L < 1.2) return 0;
    const px = L * (cam.fl || 1000) / Math.max(1, dist), n = Math.min(10, Math.max(2, Math.round(px / 4)));
    if (px < 3) return 0;
    const ux = v[0] / sp, uy = v[1] / sp, uz = v[2] / sp;
    for (let i = 1; i <= n; i++) {
      const f = i / n, s2 = L * f;
      fx.dotXYZ(P[0] - ux * s2, P[1] - uy * s2, P[2] - uz * s2, 1.3, r, g, b, k * (1 - f) * .8, 'max');
    }
    return n;
  }
  function drawBodies(frame) {
    const t = frame.t, fx = R.fx, e = cam.eye, fl = cam.fl || 1000;
    const shutter = clamp(game.timeRate / 60, .004, .05), orb = R.style === 'orbital';
    let dots = 0;
    const lights = [];
    for (const b of world.B) {
      if (!b.on || !b.o) continue;
      const o = b.o;
      world.pose(b, t, P3, Q4);
      qMat(Q4, M9);
      const age = t - o.t0;
      const dx = P3[0] - e[0], dy = P3[1] - e[1], dz = P3[2] - e[2], dist = Math.hypot(dx, dy, dz);
      // a floating piece rides the swell as drawn
      if (b.mode === SEA && b.floatT > 0 && t - b.wetT < b.floatT) P3[1] += T.seaAt(P3[0], P3[2], game.seaT).y * .9;
      if (o.type === 'shard') {
        if (dist > 16000) continue;
        const pxm = fl / Math.max(1, dist) * (1080 / Math.max(1, cam.H));
        const hot = o.hot > t ? Math.exp(-(t - o.t0) / Math.max(.05, o.hot - o.t0)) : 0;
        let a = 1;
        if (b.mode === SEA) a = 1 - sat((t - b.wetT) / 1.2);
        else if (b.mode === REST) a = 1 - sat((t - b.restT - b.life + 10) / 10);
        if (a <= .01) continue;
        const rr = GREY[0] + (HOT[0] - GREY[0]) * hot, gg = GREY[1] + (HOT[1] - GREY[1]) * hot, bb = GREY[2] + (HOT[2] - GREY[2]) * hot;
        dots += drawShard(fx, P3, M9, o.s, o.k, pxm, rr, gg, bb, a * (.75 + .25 * hot));
        // fast: a short smear along its path (one exposure of the films' shutter)
        if (b.mode === AIR && dist < 3000) dots += streak(fx, P3, b.v, shutter, dist, .5 + .5 * hot, rr, gg, bb);
        if (hot > .05) { fx.dotXYZ(P3[0], P3[1], P3[2], 2.2, WARM[0], WARM[1], WARM[2], .7 * hot, 'add'); dots++; }
        if (o.burn && t < o.burn.until && t >= b.t0) { const fk = .35 * (.6 + .4 * Math.sin(frame.realT * 37 + b.seed)); fx.dotXYZ(P3[0], P3[1], P3[2], 2.4, WARM[0], WARM[1] * .9, WARM[2] * .7, fk, 'add'); dots++; }
        continue;
      }
      // a module (or the tumbling core): the model with the other parts masked, clipped at its break; not when it is
      // under a pixel (the renderer would drop it as a speck anyway)
      if (dist > 45000 || b.r * fl / Math.max(1, dist) < .8) continue;
      // a tumbling round only while the player's sensors hold it (its pieces, once it breaks, are debris)
      if (o.proj && b.mode === FOLLOW && !visProj(seenP.get(o.proj))) continue;
      const d = o.inst;
      const c = b.c;
      d.R[0] = M9[0]; d.R[1] = M9[1]; d.R[2] = M9[2]; d.R[3] = M9[3]; d.R[4] = M9[4]; d.R[5] = M9[5]; d.R[6] = M9[6]; d.R[7] = M9[7]; d.R[8] = M9[8];
      d.T[0] = P3[0] - (M9[0] * c[0] + M9[1] * c[1] + M9[2] * c[2]);
      d.T[1] = P3[1] - (M9[3] * c[0] + M9[4] * c[1] + M9[5] * c[2]);
      d.T[2] = P3[2] - (M9[6] * c[0] + M9[7] * c[1] + M9[8] * c[2]);
      d.hdg = d.pitch = d.roll = undefined;
      if (d.gate) {
        // keep the model's side of its break: n (model) = (0, 0, gz); world n, and the plane through the break
        const gz = o.gz, nx = M9[2] * gz, ny = M9[5] * gz, nz = M9[8] * gz;
        d.gate.n[0] = nx; d.gate.n[1] = ny; d.gate.n[2] = nz;
        d.gate.d = nx * d.T[0] + ny * d.T[1] + nz * d.T[2] + gz * o.cz;
      }
      // the track's tint goes as the pieces fly (debris is nobody's track); the flash lights them a moment
      d.tintK = o.tint0 * (1 - ss(.2, o.fadeT, age));
      d.bright = 1 + .9 * Math.exp(-Math.max(0, age) / .12) * (o.type === 'core' ? 0 : 1);
      let a = 1;
      if (b.mode === REST) a = 1 - sat((t - b.restT - b.life + 20) / 20);
      d.dissolve = b.mode === REST ? .15 + .85 * (1 - a) : 0;
      d.alpha = 1;
      if (a <= .01) continue;
      // the Orbital hairlines have no clip plane: the rear section leaves the airframe to the front one
      if (d.gate && o.gz > 0 && o.names) {
        if (!o.maskMain) o.maskMain = d.partAlpha;
        if (orb) { if (!o.maskNoBody) { o.maskNoBody = Object.assign({}, o.maskMain); o.maskNoBody[o.names[0]] = 0; } d.partAlpha = o.maskNoBody; }
        else d.partAlpha = o.maskMain;
      }
      R.draw(d);
      if (b.mode === AIR && dist < 6000) dots += streak(fx, P3, b.v, shutter, dist, .35, 226, 228, 222);
      // the torn end: white-hot a moment, then going out
      if (o.ring && o.hot > t && dist < 6000) dots += drawRing(fx, d, o, t, dist, fl);
      // burning: a flickering glow where it burns, a light on what is near
      if (o.burn && t < o.burn.until && t >= b.t0 && b.mode !== SEA) {
        let x = P3[0], y = P3[1], z = P3[2];
        if (o.burn.z !== undefined) { const dz2 = o.burn.z - c[2]; x += M9[2] * dz2; y += M9[5] * dz2; z += M9[8] * dz2; }
        const fk = o.burn.glow * (.7 + .3 * Math.sin(frame.realT * 23 + b.seed) * Math.sin(frame.realT * 7.1 + b.seed * 2)) * (1 - ss(o.burn.until - 1, o.burn.until, t));
        if (fk > .02) {
          fx.glow([x, y, z], -(.6 + b.r * .22), [255, 200, 140], .2 * fk);
          fx.dotXYZ(x, y, z, 2.6, 255, 226, 180, .8 * fk, 'add');
          dots += 2;
          lights.push({ x, y, z, k: fk, d: dist });
        }
      }
    }
    // a light or two from the nearest fires
    if (lights.length) {
      lights.sort((p, q) => p.d - q.d);
      for (let i = 0; i < Math.min(2, lights.length); i++) { const L = lights[i]; if (L.d < 8000) R.light([L.x, L.y, L.z], 35, [255, 180, 120], .14 * L.k); }
    }
    return dots;
  }
  /* the torn end of a section: a ring of hot dots round its break, cooling */
  function drawRing(fx, d, o, t, dist, fl) {
    const age = t - o.t0, heat = Math.exp(-age / .45) * (1 - ss(o.hot - .5, o.hot, t));
    if (heat < .02) return 0;
    const Rm = d.R, T0 = d.T, z = o.ring.z, r = o.ring.r;
    const px = r * fl / Math.max(1, dist), n = clamp(Math.round(px * 1.6), 6, 28);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + hsh(i, o.cz * 100) * .3, rr = r * (.85 + .2 * hsh(i + 7, o.cz * 50));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr, zz = z + (hsh(i + 3, 11) - .5) * .06;
      fx.dotXYZ(T0[0] + Rm[0] * x + Rm[1] * y + Rm[2] * zz, T0[1] + Rm[3] * x + Rm[4] * y + Rm[5] * zz, T0[2] + Rm[6] * x + Rm[7] * y + Rm[8] * zz,
        px > 40 ? 2 : 1.5, WARM[0], WARM[1] + 40 * heat, WARM[2] + 60 * heat, .85 * heat, 'add');
    }
    return n;
  }
  /* our own small effects: a puff of dust where a piece hits the ground, a few drops where a shard goes in */
  function drawFxq(t) {
    const fx = R.fx;
    let n = 0;
    for (let i = fxq.length - 1; i >= 0; i--) {
      const q = fxq[i], a = t - q.t0;
      if (a > 6) { fxq.splice(i, 1); continue; }
      if (a < 0) continue;
      if (q.k === 'puff') {
        const m = Math.round(clamp(q.s * 5, 5, 24)), grow = q.s * (.4 + 1.3 * Math.sqrt(a)), al = .5 * Math.exp(-a / 1.8) * ss(0, .05, a);
        for (let j = 0; j < m; j++) {
          const h1 = hsh(j, q.seed), h2 = hsh(j + 31, q.seed), h3 = hsh(j + 67, q.seed), an = h1 * TAU, rr = grow * Math.sqrt(h2);
          fx.dotXYZ(q.p[0] + Math.cos(an) * rr, q.p[1] + .2 + grow * .55 * h3 + .35 * a, q.p[2] + Math.sin(an) * rr, 1.6, 196, 194, 184, al * (.5 + .5 * h3), 'max');
        }
        n += m;
      } else if (q.k === 'spark') {
        // a shard striking a hull, gun rounds striking a round: a few white sparks off the metal (carried on with the
        // round's way, short-lived)
        const life = q.life || .5;
        if (a > life) continue;
        const m = q.m || 7, nn = q.n, cv = q.v, kv = cv ? (1 - Math.exp(-a / .08)) * .08 : 0;
        for (let j = 0; j < m; j++) {
          const h1 = hsh(j, q.seed), h2 = hsh(j + 17, q.seed), h3 = hsh(j + 41, q.seed), sp = (14 + 30 * h1) * (q.s || 1);
          const dx = nn[0] * .7 + (h2 - .5), dy = nn[1] * .7 + (h3 - .3), dz = nn[2] * .7 + (hsh(j + 5, q.seed) - .5);
          const ox = cv ? cv[0] * kv * (.5 + .5 * h2) : 0, oy = cv ? cv[1] * kv * (.5 + .5 * h2) : 0, oz = cv ? cv[2] * kv * (.5 + .5 * h2) : 0;
          fx.dotXYZ(q.p[0] + ox + dx * sp * a, q.p[1] + oy + dy * sp * a - 4.9 * a * a, q.p[2] + oz + dz * sp * a, 1.6, 255, 240, 214, .9 * (1 - a / life), 'add');
        }
        if (a < .06) { fx.dotXYZ(q.p[0], q.p[1], q.p[2], 3, 255, 246, 226, .8 * (1 - a / .06), 'add'); n++; }
        n += m;
      } else if (q.k === 'drop') {
        if (a > 1.4) continue;
        const m = Math.round(clamp(q.s * 4, 4, 14)), v0 = 2 + q.s * 1.6;
        for (let j = 0; j < m; j++) {
          const h1 = hsh(j, q.seed), h2 = hsh(j + 13, q.seed), an = h1 * TAU, vr = v0 * (.2 + .5 * h2), vy = v0 * (.6 + .6 * hsh(j + 29, q.seed));
          const y = vy * a - 4.9 * a * a; if (y < 0) continue;
          fx.dotXYZ(q.p[0] + Math.cos(an) * vr * a, y + .1, q.p[2] + Math.sin(an) * vr * a, 1.4, 226, 232, 236, .7 * (1 - a / 1.4), 'max');
        }
        n += m;
      }
    }
    return n;
  }

  /* ---------------------------------------------------------------- the console's demo */
  const ghosts = [];   // stand-in rounds for demo spins: { id, pos, prev, vel, alive, P, kind, st, side }
  function demo(kind, o) {
    o = o || {};
    const P = game.PROJ[kind] || game.PROJ.oniks, key = P.model;
    const tgt = cam.target, yaw = cam.yaw, dist = o.dist || 260, speed = o.speed || P.speed || 600, alt = o.alt === undefined ? 45 : o.alt;
    // across the view, in front of the camera's target
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);
    const c = [tgt[0] + Math.sin(yaw) * (dist - cam.dist) * 0, tgt[1], tgt[2]];
    const pos = [c[0] - fx * speed * .5 * (o.lead === undefined ? .6 : o.lead), Math.max(alt, game.ground(c[0], c[2]) + alt), c[2] - fz * speed * .5 * (o.lead === undefined ? .6 : o.lead)];
    const vel = [fx * speed, o.climb || 0, fz * speed];
    const id = 900000 + (++serial);
    const side = o.side || game.enemy;
    const t = sim.t;
    if (o.mode === 'spin') {
      const g = { id, kind, P, pos: pos.slice(), prev: pos.slice(), vel, alive: true, st: { wing: 1, fin: 1, booster: false }, side, ctrl: false, t0: t, fall: o.fall === undefined ? 1 : o.fall };
      ghosts.push(g);
      seenP.set(id, { id, kind, key, side, pos: pos.slice(), vel: vel.slice(), t, st: g.st, lastSeen: t, from: 0 });
      // a stand-in in the sim's projectile map for the poses (never stepped by the sim: alive false to it)
      startSpin(g, { t, seed: o.seed, ghost: true });
      return id;
    }
    seenP.set(id, { id, kind, key, side, pos: pos.slice(), vel: vel.slice(), t, st: { wing: 1, fin: 1, booster: false }, lastSeen: t, from: 0 });
    roundBreaks(id, { t, pos, vel, proj: id, kind, byKind: o.gun === false ? 'sm6' : 'ciws', breakup: true, seed: o.seed }, o.gun === false ? 'missile' : 'gun');
    return id;
  }
  function stepGhosts(t) {
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      const dt = Math.max(0, t - (g.tl === undefined ? g.t0 : g.tl)); g.tl = t;
      g.prev[0] = g.pos[0]; g.prev[1] = g.pos[1]; g.prev[2] = g.pos[2];
      g.vel[1] -= 9.81 * g.fall * dt; g.vel[0] *= Math.exp(-.15 * dt); g.vel[2] *= Math.exp(-.15 * dt);
      g.pos[0] += g.vel[0] * dt; g.pos[1] += g.vel[1] * dt; g.pos[2] += g.vel[2] * dt;
      const S = spins.get(g.id);
      if (!S || !S.b.on || S.b.gen !== S.gen) { if (S) spins.delete(g.id); ghosts.splice(i, 1); continue; }
      S.vel[0] = g.vel[0]; S.vel[1] = g.vel[1]; S.vel[2] = g.vel[2];
      corePose(S, g.pos, t, S.vel);
      while (S.sheds.length && S.sheds[0].t <= t) {
        const sh = S.sheds.shift(), w = omegaAt(S, t, S.vel, [0, 0, 0]);
        if (sh.tail) shedTail(S, t, g.pos, S.vel, w); else shedFrom(S, sh.names, t, g.pos, S.vel, w, true);
        frameAt(S, t, S.vel, S.M);
      }
      const gy = game.ground(g.pos[0], g.pos[2]);
      if (g.pos[1] <= gy) {
        const wet = game.map.h(g.pos[0], g.pos[2]) < 0;
        if (wet) addFx(new Splash({ t0: t, pos: [g.pos[0], 0, g.pos[2]], size: 30, seed: g.id, ring: .35 }), 2);
        endSpin(S, wet ? 'sea' : 'ground', { t, pos: g.pos.slice() });
        ghosts.splice(i, 1);
      }
    }
  }

  /* ---------------------------------------------------------------- the system */
  const sys = {
    name: 'debris', priority: 11,
    world, stats, spins, planes,
    /* render hooks: false = drawn here */
    unit(u, d) {
      if (taken.has(u.id)) return false;
      const g = hid.get(u.id);
      if (g) d.partAlpha = g;
      return true;
    },
    proj(p) { return !(spins.has(p.id) || broken.has(p.id)); },
    /* a tumbling round for the FX system's plume and trail: its origin and forward axis at time t (null: not ours) */
    head(p, t, out) {
      const S = spins.get(p.id);
      if (!S) return null;
      const a = clamp((t - (sim.t - game.DT)) / game.DT, 0, 1);
      out.x = p.prev[0] + (p.pos[0] - p.prev[0]) * a; out.y = p.prev[1] + (p.pos[1] - p.prev[1]) * a; out.z = p.prev[2] + (p.pos[2] - p.prev[2]) * a;
      frameAt(S, t, S.vel, M9);
      out.ax = M9[2]; out.ay = M9[5]; out.az = M9[8];
      // a ramjet chokes as it tumbles; a rocket burns on until its tail section goes
      const ram = S.kind2 === 'oniks' && S.st.booster === false;
      out.k = !S.flame ? 0 : ram ? 1 - ss(0, .35, t - S.t0) : 1;
      return out;
    },
    /* the parts of a unit that left it (the replay's cutaway leaves them out too): name -> bool */
    gone(id) {
      const g = hid.get(id);
      if (!g) return null;
      return nm => { if (g[nm] === 0) return true; for (const k in g) if (g[k] === 0 && nm.startsWith(k)) return true; return false; };
    },
    demo, bullet,
    init() {
      game.debris = sys;
      bus.on('weather', w => { if (w && w.wind) { world.wind[0] = w.wind[0] || 0; world.wind[1] = w.wind[1] || 0; } });
      const w = (sim.weather && sim.weather.wind) || (game.weather && game.weather.wind);
      if (w) { world.wind[0] = w[0] || 0; world.wind[1] = w.length > 2 ? w[2] : w[1] || 0; }
      // the rounds already in the air, the aircraft in play: their cutaways sampled ahead of need
      for (const u of sim.units.values()) { const pl = UNIT_PLANS[u.def.model]; if (pl && pl.takeover) warm(pl.draw); }
    },
    onEvent(e) {
      switch (e.type) {
        case 'launch': { const P = game.PROJ[e.kind]; const pl = P && planOfProj(P.model); if (pl) warm(pl.draw); return; }
        case 'spinout': { const p = sim.projectiles.get(e.proj); if (p && !spins.has(e.proj) && !broken.has(e.proj)) startSpin(p, e); return; }
        case 'breakup': { if (e.proj) roundBreaks(e.proj, e, GUNS[e.byKind] ? 'gun' : e.cause || 'missile'); return; }
        case 'intercept': {
          if (e.breakup === false) return;
          const gun = !!GUNS[e.byKind];
          roundBreaks(e.proj, e, gun ? 'gun' : 'missile');
          // the interceptor goes with it (its warhead): a lighter break-up
          if (!gun && e.by && seenP.has(e.by) && !broken.has(e.by)) roundBreaks(e.by, { t: e.t, proj: e.by }, 'destruct');
          return;
        }
        case 'splash': {
          if (e.kind === 'crash' && e.unit !== undefined) { const S = planes.get(e.unit); if (S) planeEnd(S, e); return; }
          if (!e.proj) return;
          const S = spins.get(e.proj);
          if (e.air) { roundBreaks(e.proj, e, 'destruct'); return; }
          if (S) { broken.set(e.proj, sim.t); endSpin(S, e.water === false ? 'ground' : 'sea', e); }
          return;
        }
        case 'gunhit': {
          // rounds striking a round: sparks off its skin where the stream walks onto it (only near the lens)
          if (e.tk !== 'proj' || !e.pos || distEye(e.pos) > 6000) return;
          const c = seenP.get(e.target);
          if (c && !visProj(c)) return;
          const v = c ? c.vel : [0, 0, 0], rv = e.vel, l = rv ? Math.hypot(rv[0] - v[0], rv[1] - v[1], rv[2] - v[2]) || 1 : 1;
          const nrm = rv ? [-(rv[0] - v[0]) / l, -(rv[1] - v[1]) / l, -(rv[2] - v[2]) / l] : [0, 1, 0];
          fxq.push({ k: 'spark', t0: e.t, p: e.pos.slice(), n: nrm, v: v.slice(), s: 1.6, m: Math.min(16, 5 + Math.round(3 * (e.n || 1))), life: .35, seed: (e.target * 31 + Math.floor(e.t * 60)) | 0 });
          if (fxq.length > 400) fxq.splice(0, fxq.length - 400);
          return;
        }
        case 'hit': { if (e.proj) { const S = spins.get(e.proj); if (S) { broken.set(e.proj, sim.t); endSpin(S, 'gone', e); } } return; }
        case 'destroyed': {
          const u = sim.units.get(e.unit);
          if (!u) return;
          if (u.def.domain === 'air') planeDown(u, e);
          else unitMods(u, e);
          return;
        }
        case 'removed': { const S = planes.get(e.unit); if (S) planeEnd(S, null); hid.delete(e.unit); taken.delete(e.unit); return; }
        default: return;
      }
    },
    update(dtReal) {
      bullet.update(dtReal);
      splashes = 0;
      // the live cap and the step budget follow the auto-quality guard (and the time rate: a flood of break-ups at x32)
      const fq = game.quality && game.quality.fx > 0 ? game.quality.fx : 1;
      world.soft = Math.round(400 * (.35 + .65 * fq) * (game.timeRate >= 16 ? .6 : 1));
      track();
      const t = game.t;
      updateSpins(t);
      if (ghosts.length) stepGhosts(t);
      refreshShips();
      world.advance(t, Math.max(.4, 1.2 * fq));
      updateRiders(t);
      feed(t);
      const s = world.stats; stats.bodies = s.bodies; stats.steps = s.steps; stats.physMs = s.ms;
    },
    draw3d(frame) {
      const t0 = performance.now();
      if (R.pcOff) return;
      let n = drawBodies(frame);
      if (fxq.length) n += drawFxq(frame.t);
      stats.dots = n; stats.drawMs = performance.now() - t0;
    },
    dispose() { world.clear(); if (game.debris === sys) game.debris = null; },
  };
  return sys;
}
