/* OD "Salvo": one take, ~150 s, loops. Four 3M55 low over the sea; the camera runs ahead to the destroyer
   they are coming for; her defence; the one that gets through, in slow motion; the burning ship left behind
   as the camera pulls back and up and drops in alongside the next salvo of four (= frame 0).
   Stage A skeleton: timeline, camera, sea, ships, rounds. Effects go in the hooks marked HOOK below.
   render(T) is a pure function of film time T (sim time s = OD.SIM(T)). */
(() => {
  'use strict';
  const { V, R, X, E, Cam } = M3;
  const { D, DS, SIM, D2R, PI, TAU, VR, SID, S_HIT, T_HIT, STOP } = OD;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp;
  const sm = t => { t = sat(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  const hash = OD.hash;
  const DEF = OD.DEF;                       // chapter 3 (the defence): tables + drawing in od_salvo_world.js
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  const cam = new Cam(1920, 1080), W = new Wire(cam, { fog: [1e8, 2e8], color: '#F6F5F2' });
  cam.near = .2;
  const HI = '#F4D23C', WH = '#F6F5F2';
  STAGE.SFX.kind = 'orb';

  /* ---------------- menu ---------------- */
  const menuEl = document.getElementById('menu');
  menuEl.innerHTML = STAGE.ITEMS.map((it, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><span class="lab">${ORB.swipe('od' + i)}<span class="tx">${it}</span></span><span class="go">→</span><div class="bar"></div></div>`).join('');
  STAGE.menu({ el: menuEl, blurb: document.getElementById('blurb') });

  /* ---------------- models (compiled once for the fast hairline path) ---------------- */
  const sub = (m, keep) => Object.assign({}, m, { parts: m.parts.filter(p => keep(p.name)) });
  const M = { ddg: OD.MOD.ddg(), on: OD.MOD.oniks(), cv: OD.MOD.cv(), cg: OD.cruiser() };
  const ONST = { wing: 1, fin: 1, booster: false, cover: false };
  // destroyer parts that move during the defence: drawn from ddgDyn's state-quantised cache instead of being
  // compiled once at rest
  const DDG_DYN = ['vlsF', 'ciwsF'];
  const C = {
    ddg: FAST.compile(M.ddg, { fine: true, dyn: DDG_DYN }), ddgF: FAST.compile(M.ddg, { fine: false, dyn: DDG_DYN }),
    ddgFar: FAST.compile(sub(M.ddg, n => ['hull', 'super', 'mast', 'spy', 'stacks', 'sps', 'gun', 'hangar', 'deck'].includes(n)), { fine: false }),
    cg: FAST.compile(M.cg, { fine: true }), cgF: FAST.compile(M.cg, { fine: false }),
    cvF: FAST.compile(sub(M.cv, n => n !== 'air' && n !== 'elevators'), { fine: false }),
    cv: FAST.compile(sub(M.cv, n => n !== 'air'), { fine: false }),
    on: FAST.compile(M.on, { fine: true, st: ONST }), onF: FAST.compile(M.on, { fine: false, st: ONST }),
  };
  const DYNC = new Map();
  const SPIN_Q = 12;                        // barrel positions per 60 deg of gatling spin
  const ddgDyn = fine => (name, st) => {
    // quantised state key per moving part; the cached geometry is built from the quantised state itself, so a
    // frame never depends on which state first filled a bucket
    let key = null, canon = null;
    if (name === 'vlsF' || name === 'vlsA') {
      const q = (st.vlsOpen || []).map(e => Array.isArray(e) ? [e[0], Math.round(e[1] * 12)] : [e, 12]).filter(e => e[1] > 0);
      key = q.map(e => e[0] + ':' + e[1]).join(',');
      canon = { vlsOpen: q.map(e => [e[0], e[1] / 12]) };
    } else if (name === 'ciwsF' || name === 'ciwsA') {
      const i = name === 'ciwsF' ? 0 : 1, pv = (st.ciwsPitch || [])[i], pq = Math.round((pv === undefined ? .35 : pv) / D2R * 2);
      const sq = Math.round(OD.modp(st.ciwsSpin || 0, TAU / 6) / (TAU / 6) * SPIN_Q) % SPIN_Q;
      key = pq + '|' + sq;
      const pitch = pq / 2 * D2R;
      canon = { ciwsPitch: i ? [.35, pitch] : [pitch, .35], ciwsSpin: sq / SPIN_Q * TAU / 6 };
    } else return null;
    key = name + '|' + key + (fine ? 'f' : 'c');
    let c = DYNC.get(key);
    if (!c) { const part = M.ddg.parts.find(p => p.name === name); c = FAST.compilePrims(part.dyn(canon), fine); DYNC.set(key, c); }
    return c;
  };
  const DDG_CACHE = ddgDyn(true), DDG_CACHE_C = ddgDyn(false);

  /* ---------------- frames ---------------- */
  const A = SID.A, CG = SID.CG, CV = SID.CV;
  const fA = s => OD.shipFrame(A, s);
  const salvoF = sl => X.make(R.I(), OD.salvoC(sl));
  const H0 = X.ap(OD.shipXf(A, S_HIT), OD.HIT_L);                // the point of impact, world, at the hit
  const hitNow = s => X.ap(OD.shipXf(A, s), OD.HIT_L);
  // round 4's final run: +Z along its flight, origin at the point of impact
  const H4 = (() => { const r = OD.round(3, S_HIT - .3), f = V.norm([r.f[0], 0, r.f[2]]); return X.make(R.look(f, [0, 1, 0]), H0); })();

  /* ---------------- camera ----------------
     Shots are functions of film time T -> {eye, target, fov (rad), roll}. Key paths are time-parameterised
     Hermite (tangents from the neighbours, or explicit per key); the long transits between the salvo and the
     ship are quintic moves between the neighbouring shots' own states (position, velocity, acceleration), so
     the take stays continuous. The last shot is the first one again on the next salvo: the seam is exact. */
  function kpath(keys) {
    const n = keys.length;
    // the look is interpolated as a direction plus a log-distance, so a target that jumps from kilometres out
    // to metres away never swings the lens through itself
    for (const k of keys) { const d = V.sub(k.target, k.eye), l = V.len(d); k.dir = V.mul(d, 1 / l); k.ld = Math.log(l); }
    const val = (k, f) => f === 'fov' ? (k.fov === undefined ? 40 : k.fov) : f === 'roll' ? (k.roll || 0) : k[f];
    // monotone tangents (Fritsch-Butland, per component): a hold next to a fast move never overshoots
    const mono = (d0, d1, h0, h1) => d0 * d1 <= 0 ? 0 : 3 * (h0 + h1) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
    const tan = (i, f) => {
      const k = keys[i];
      if (f === 'eye' && k.ve) return k.ve;
      const one = (a, b) => { const va = val(a, f), vb = val(b, f), dt = b.t - a.t || 1; return Array.isArray(va) ? [0, 1, 2].map(c => (vb[c] - va[c]) / dt) : (vb - va) / dt; };
      if (i === 0) return one(keys[0], keys[1]);
      if (i === n - 1) return one(keys[n - 2], keys[n - 1]);
      const s0 = one(keys[i - 1], k), s1 = one(k, keys[i + 1]), h0 = k.t - keys[i - 1].t, h1 = keys[i + 1].t - k.t;
      return Array.isArray(s0) ? [0, 1, 2].map(c => mono(s0[c], s1[c], h0, h1)) : mono(s0, s1, h0, h1);
    };
    const hm = (p0, p1, m0, m1, u, dt) => { const u2 = u * u, u3 = u2 * u; return p0 * (2 * u3 - 3 * u2 + 1) + m0 * dt * (u3 - 2 * u2 + u) + p1 * (-2 * u3 + 3 * u2) + m1 * dt * (u3 - u2); };
    return t => {
      let i = 0; while (i < n - 2 && keys[i + 1].t <= t) i++;
      const a = keys[i], b = keys[i + 1], dt = b.t - a.t, out = {};
      if (t <= keys[0].t || t >= keys[n - 1].t) {
        // outside the keys: carry on at the end key's velocity
        const k = t <= keys[0].t ? 0 : n - 1, K0 = keys[k], d = t - K0.t, v = tan(k, 'eye');
        out.eye = [0, 1, 2].map(c => K0.eye[c] + v[c] * d);
        out.target = V.mad(out.eye, K0.dir, Math.exp(K0.ld));
        out.fov = val(K0, 'fov') * D2R; out.roll = val(K0, 'roll') * D2R;
        return out;
      }
      const u = (t - a.t) / dt;
      for (const f of ['eye', 'dir', 'ld', 'fov', 'roll']) {
        const va = val(a, f), vb = val(b, f), ma = tan(i, f), mb = tan(i + 1, f);
        out[f] = Array.isArray(va) ? [0, 1, 2].map(c => hm(va[c], vb[c], ma[c], mb[c], u, dt)) : hm(va, vb, ma, mb, u, dt);
      }
      out.target = V.mad(out.eye, V.norm(out.dir), Math.exp(out.ld));
      out.fov *= D2R; out.roll *= D2R;
      return out;
    };
  }
  const K = (t, eye, target, fov, o) => Object.assign({ t, eye, target, fov: fov || 40 }, o || {});
  const inF = (F, s) => ({ eye: X.ap(F, s.eye), target: X.ap(F, s.target), fov: s.fov, roll: s.roll || 0 });
  const dirOf = s => V.norm(V.sub(s.target, s.eye));
  const nlerp = (a, b, w) => V.norm(V.lerp(a, b, w));

  /* 1 + 7  alongside the salvo (formation frame; tl = local film time, sl = local sim time).
     tl < 0 is the end of the loop: the lens hangs low over the sea far out, a long lens on the burning ship's smoke
     on the horizon; the next four come in under it and race away toward that smoke; the lens widens, drops in
     behind them, closes on round 4's right and draws past it, turning with it, into frame 0.
     Round offsets in the frame: 1 (-14, 13.6, 7), 2 (-42, 12.3, -12), 3 (13, 12.1, -6), 4 (38, 13.2, 10).
     Ahead of the line on its east side looking back (the line recedes to the right, clear of the menu); round 4
     goes by; up and over the four; down on the west end looking along the line; in beside round 2, which draws
     past the lens (the look turns with it) and leaves it behind the four, looking ahead over them. */
  const OFF = OD.FO.map(F => [F.x, F.y, F.z]);
  const FORM = kpath([
    K(-9, [20, 380, 0], [150, -600, 67400], 5, { ve: [0, -45, -600] }),
    K(-6, [45, 220, -1500], [150, -3800, 65400], 14),
    K(-3.5, [112, 44, -380], [60, 8, 400], 30),
    K(-1.5, [104, 27, -45], [36, 12, 12], 36),
    K(0, [78, 24, 58], [-12, 8, -40], 38),
    K(3.8, [64, 16, 32], [30, 11, -14], 38),
    K(6.8, [50, 30, 2], [24, 10, -14], 42),
    K(9.8, [18, 80, -40], [-8, 8, -5], 48),
    K(12.8, [-40, 76, -40], [-10, 8, 2], 48),
    K(15.8, [-74, 16, -44], [-24, 12, 30], 40),
    K(18.4, [-53, 12.6, -21], [-42, 12.3, -12], 40),
    K(20.8, [-52.5, 13, -7], [-42, 12.2, -10], 44),
    K(23.3, [-51, 13.8, 4], [-42, 12, -13], 44),
    K(25.3, [-62, 15, -12], [-42, 12.3, -8], 46),
    K(27.2, [-46, 30, -64], [-12, 6, 60], 46),
    K(28.8, [-24, 72, -150], [-4, 4, 80], 46),
  ]);
  // follow a round's own weave: [round, weight(tl), eye too?]
  const TRACKS = [
    [3, tl => ss(2.4, 4, tl) * (1 - ss(6.6, 8.6, tl)), false],
    [1, tl => ss(16.8, 18.6, tl) * (1 - ss(25.8, 27.6, tl)), true],
  ];
  function formShot(tl, sl) {
    const s = FORM(tl), F = salvoF(sl);
    const o = { eye: X.ap(F, s.eye), target: X.ap(F, s.target), fov: s.fov, roll: s.roll };
    for (const [i, wf, eyeToo] of TRACKS) {
      const w = wf(tl); if (w <= 0) continue;
      const r = OD.round(i, sl).p, dv = V.sub(r, X.ap(F, OFF[i]));
      if (eyeToo) o.eye = V.mad(o.eye, dv, w);
      o.target = V.mad(o.target, dv, w);
    }
    return o;
  }
  const form0 = T => formShot(T, SIM(T));
  const form1 = T => formShot(T - D, SIM(T) - DS);

  /* 3  the destroyer's heading frame (x: starboard = south, z: bow = east): arrival off the starboard
     quarter, up over the bridge, the forward cells below, the launches, the look-out for the flashes far
     out, down beside the forward Phalanx for round 3, out over the side for round 4 */
  const SHIP = kpath([
    K(47, [520, 90, -560], [0, 14, -20], 34),
    K(50, [300, 42, -300], [0, 14, 0], 36),
    K(53, [165, 30, -120], [0, 16, 20], 38),
    K(55.5, [80, 30, -8], [0, 17, 30], 40),
    K(57.6, [16, 27, 18], [-4, 10, 42], 44),
    K(59.6, [-2, 24, 25.5], [-4, 6, 40], 48),
    K(61.2, [-2, 24, 26], [-5, 30, 44], 50),
    K(63.2, [-2.5, 24.5, 26], [30, 70, 52], 50),
    K(65.6, [-3, 27, 25], [600, 330, 60], 46),
    K(67.6, [-3.5, 33, 23.5], [4000, 420, 180], 34),
    K(69.8, [-4, 42, 21.5], [12200, 150, 300], 15),
    K(71.6, [-4, 44, 21], [12400, 110, 300], 13),
    K(75, [-4, 44, 21], [10800, 80, 250], 14),
    K(78.6, [-10, 14.4, 36.5], [700, 14, 48], 42),
    K(83, [-10.3, 14.6, 37], [640, 9, 28], 42),
    K(86.5, [-10.5, 14.6, 37.3], [560, 8, 27], 42),
    K(89.8, [-10, 14.9, 37.6], [480, 6, 31], 42),
    K(92.4, [112, 17, 190], [900, 4, 480], 40),
    K(94, [146, 16, 240], [1760, 8, 930], 38),
    K(95.5, [153, 15, 250], [1780, 8, 950], 36),
  ]);
  // the lens follows the SM-6 off the deck: its look leans toward the climbing missile (and, later, toward the
  // pair as they arc away), so the rise and the pitch-over stay in frame
  const SMT = [
    [T => .82 * ss(57.42, 57.9, T) * (1 - ss(58.75, 59.55, T)), [0]],
    [T => .84 * ss(60.12, 60.55, T) * (1 - ss(63.4, 65.4, T)), [1]],
    [T => .45 * ss(63.4, 65.4, T) * (1 - ss(67.2, 69.2, T)), [0, 1]],
  ];
  function shipShot(T) {
    const s = inF(fA(SIM(T)), SHIP(T)), sim = SIM(T);
    for (const [wf, ids] of SMT) {
      const w = wf(T); if (w <= 0) continue;
      let c = [0, 0, 0], n = 0;
      for (const i of ids) { const M = DEF.SM6[i], t = sim - M.tL; if (t < 0 || t > M.Tf) continue; c = V.add(c, V.mad(DEF.smAt(M, t), DEF.smFw(M, t), -4)); n++; }
      if (!n) continue;
      c = V.mul(c, 1 / n);
      const L = V.dist(s.target, s.eye), d = nlerp(dirOf(s), V.norm(V.sub(c, s.eye)), w);
      s.target = V.mad(s.eye, d, L);
    }
    return s;
  }

  /* 4  round 4's final run and the hit, in its approach frame (origin: the point of impact, +Z its flight;
     the hull runs from the bow, near and right, to the stern, far and left) */
  // side-on, 140 m to the right of the round's line (off the destroyer's starboard bow): it comes out of the
  // distance, crosses the lens in slow motion and the pan follows it into the hull (peak ~70 deg/s as it goes by)
  const HITK = kpath([
    K(93, [140, 12, -235], [0, 6, -2000], 36),
    K(96, [138, 10, -232], [0, 6, -600], 36),
    K(98.5, [136, 9.5, -228], [0, 6, -150], 38),
    K(99.6, [132, 9, -222], [-10, 6, -6], 40),
    K(100.4, [128, 9, -216], [-26, 7, -16], 40),
    K(103, [120, 12, -206], [-30, 9, -18], 40),
    K(106, [112, 22, -205], [-32, 12, -20], 40),
  ]);
  const R4_TRACK = T => ss(93, 94.2, T) * (1 - ss(99.1, 99.9, T));
  function hitShot(T) {
    const s = inF(H4, HITK(T)), w = R4_TRACK(T);
    if (w > 0) { const r = OD.round(3, SIM(T)); s.target = V.lerp(s.target, r.p, w); }
    return s;
  }

  /* 5  the first moments after the hit, held on the burning ship (keys about the point of impact) */
  const AFTK = kpath([
    K(104, [201, 14, -127], [-18, 10, -30], 40),
    K(108, [208, 30, -150], [-15, 16, -25], 40),
  ]);
  const aftShot = T => { const s = AFTK(T); return { eye: V.add(H0, s.eye), target: V.add(hitNow(SIM(T)), s.target), fov: s.fov, roll: 0 }; };

  /* transits: quintic moves between two shots' states, a climb bump on top, and a steered look */
  function stateOf(f, t) {
    const h = 1 / 60, a = f(t - h).eye, b = f(t).eye, c = f(t + h).eye;
    return { p: b, v: V.mul(V.sub(c, a), 1 / (2 * h)), a: V.mul(V.add(V.sub(c, V.mul(b, 2)), a), 1 / (h * h)) };
  }
  function quintic(s0, s1, t0, t1) {
    const Tn = t1 - t0;
    return T => {
      const u = clamp((T - t0) / Tn, 0, 1), u2 = u * u, u3 = u2 * u, u4 = u3 * u, u5 = u4 * u;
      const h0 = 1 - 10 * u3 + 15 * u4 - 6 * u5, h1 = u - 6 * u3 + 8 * u4 - 3 * u5, h2 = .5 * (u2 - 3 * u3 + 3 * u4 - u5);
      const h3 = .5 * (u3 - 2 * u4 + u5), h4 = -4 * u3 + 7 * u4 - 3 * u5, h5 = 10 * u3 - 15 * u4 + 6 * u5;
      return [0, 1, 2].map(c => s0.p[c] * h0 + s0.v[c] * Tn * h1 + s0.a[c] * Tn * Tn * h2 + s1.a[c] * Tn * Tn * h3 + s1.v[c] * Tn * h4 + s1.p[c] * h5);
    };
  }
  const bump = u => { u = sat(u); const q = u * (1 - u); return 64 * q * q * q; };
  function transit(fa, fb, t0, t1, o) {
    const s0 = stateOf(fa, t0), s1 = stateOf(fb, t1), Q = quintic(s0, s1, t0, t1);
    const d0 = dirOf(fa(t0)), d1 = dirOf(fb(t1)), fov0 = fa(t0).fov, fov1 = fb(t1).fov;
    return T => {
      if (T <= t0) return fa(T);
      if (T >= t1) return fb(T);
      const u = (T - t0) / (t1 - t0), eye = Q(T);
      eye[1] += (o.climb || 0) * bump(u);
      const d = o.look(T, eye, d0, d1, u);
      // a longer lens through the fast middle of the move: the far subject grows, the sea streams less
      let fov = mix(fov0, fov1, sm(u)) - (o.tele || 0) * D2R * Math.sqrt(bump(u));
      if (o.fov) fov = o.fov(T, eye, fov, u);
      return { eye, target: V.mad(eye, d, 100), fov, roll: 0 };
    };
  }
  const shipAim = s => V.add(OD.shipPos(A, s), [0, 14, 0]);
  const lerpLog = (a, b, u) => Math.exp(mix(Math.log(a), Math.log(b), u));
  // 2  run ahead of the salvo to the destroyer: from behind the four, climb and accelerate over them (they slide
  // under the lens), then on toward the task group, which rises out of the horizon in a long lens; descend onto
  // her quarter. The lens looks ahead the whole way.
  const T_RUN = 28.8;
  const RUN = transit(form0, shipShot, T_RUN, 47, {
    climb: 1700, tele: 12,
    look(T, eye, d0, d1, u) {
      const s = SIM(T), toShip = V.norm(V.sub(shipAim(s), eye));
      const d = nlerp(d0, toShip, sm((T - T_RUN - .6) / 4.4));
      return nlerp(d, d1, sm((T - 43.5) / 3.5));
    },
    fov(T, eye, f, u) {
      // the task group ahead: the destroyer, the cruiser and the carrier all in a long lens
      const fT = clamp(2 * Math.atan(1200 / 2 / V.dist(eye, shipAim(SIM(T)))), 5.5 * D2R, 46 * D2R);
      if (T < 42.5) return lerpLog(46 * D2R, fT, sm((T - 30.4) / 4));
      return lerpLog(fT, f, sm((T - 42.5) / 4.5));
    },
  });
  // 6  pull back from the burning ship: slowly at first (the fires and the smoke close by), then fast and high,
  // flying backwards out over the sea while a long lens keeps the ship and her smoke column large as they recede;
  // braking and sinking far out, where the next salvo passes under the lens (form1 takes over at T_DROP).
  // Two quintics joined at T_MID (matched position, velocity, acceleration), so the move is C2.
  const T_BACK = 108, T_MID = 127, T_DROP = D - 9;
  const MID = { p: V.add(H0, [250, 1600, -36500]), v: [-12, -20, -3300], a: [0, 0, 0] };
  const Q1 = quintic(stateOf(aftShot, T_BACK), MID, T_BACK, T_MID), Q2 = quintic(MID, stateOf(form1, T_DROP), T_MID, T_DROP);
  const colAim = s => V.lerp(V.add(hitNow(s), [0, 14, 0]), OD.HIT.colPoint(s, .5), .6 * ss(S_HIT + 3, S_HIT + 16, s));
  const B0 = aftShot(T_BACK), BD0 = dirOf(B0), F1 = form1(T_DROP), BD1 = dirOf(F1);
  // the long lens: the column's frame height grows as it does; clamped to the aftermath's own 40 deg close in
  const fovCol = (T, eye, s) => clamp(2 * Math.atan(mix(700, 1300, sat((T - 112) / 15)) / 2 / V.dist(eye, colAim(s))), 2.6 * D2R, 40 * D2R);
  function BACK(T) {
    if (T <= T_BACK) return aftShot(T);
    if (T >= T_DROP) return form1(T);
    const s = SIM(T), eye = T < T_MID ? Q1(T) : Q2(T), k = sm((T - (T_DROP - 3)) / 3);
    const d = nlerp(nlerp(BD0, V.norm(V.sub(colAim(s), eye)), sm((T - T_BACK) / 2.5)), BD1, k);
    return { eye, target: V.mad(eye, d, 100), fov: lerpLog(fovCol(T, eye, s), F1.fov, k), roll: 0 };
  }

  const SEQ = [
    { f: form0, end: T_RUN, bl: 0 },
    { f: RUN, end: 47, bl: 0 },
    { f: shipShot, end: 94, bl: 2 },
    { f: hitShot, end: 105.5, bl: 3 },
    { f: aftShot, end: T_BACK, bl: 0 },
    { f: BACK, end: T_DROP, bl: 0 },
    { f: form1, end: 1e9, bl: 0 },
  ];
  function mixShot(a, b, w) {
    if (w <= 0) return a; if (w >= 1) return b;
    const da = V.sub(a.target, a.eye), db = V.sub(b.target, b.eye), la = V.len(da), lb = V.len(db);
    const dir = V.norm(V.lerp(V.mul(da, 1 / la), V.mul(db, 1 / lb), w)), eye = V.lerp(a.eye, b.eye, w);
    return { eye, target: V.mad(eye, dir, mix(la, lb, w)), fov: mix(a.fov, b.fov, w), roll: mix(a.roll || 0, b.roll || 0, w) };
  }
  // composition: while the lens follows a far subject (the ship ahead, the burning ship, the next salvo), aim a
  // few degrees left of it so it sits right of centre, clear of the menu column
  // (a share of the lens's own width, so a long lens keeps its subject in frame)
  const BIAS = T => (7 * ss(29, 33, T) * (1 - ss(54, 57.5, T)) + 6 * ss(107, 111, T) * (1 - ss(141, 146.5, T))) * D2R;
  function shotRaw(T) {
    for (let i = 0; i < SEQ.length; i++) {
      const s = SEQ[i], w0 = s.end - s.bl / 2, w1 = s.end + s.bl / 2;
      if (T < w0 || i === SEQ.length - 1) return s.f(T);
      if (T < w1) return mixShot(s.f(T), SEQ[i + 1].f(T), sm((T - w0) / s.bl));
    }
    return SEQ[SEQ.length - 1].f(T);
  }
  function shotAt(T) {
    T = ((T % D) + D) % D;
    const s = shotRaw(T), b = BIAS(T) * Math.min(1, s.fov / (36 * D2R));
    if (b <= 0) return s;
    const d = V.sub(s.target, s.eye), c = Math.cos(b), sn = Math.sin(b);
    // rotate the look about the vertical, to the left (left of d = [-dz, 0, dx])
    s.target = V.add(s.eye, [d[0] * c - d[2] * sn, d[1], d[2] * c + d[0] * sn]);
    return s;
  }

  /* sea row phases: the lens's travel along / across its view, integrated once (the rows then stream past
     exactly as the lens moves over the water); the residual mod 1024 m is spread over the loop */
  const PH_N = D * 60, PHF = new Float64Array(PH_N + 1), PHR = new Float64Array(PH_N + 1), PSP = new Float32Array(PH_N + 1);
  const VEL = new Float32Array((PH_N + 1) * 3);
  {
    let prev = null;
    const EYE = [];
    for (let i = 0; i <= PH_N; i++) EYE.push(shotAt(i === PH_N ? D - 1e-6 : i / 60).eye);
    for (let i = 0; i <= PH_N; i++) {
      const s = shotAt(i === PH_N ? D - 1e-6 : i / 60), f = V.norm(V.sub(s.target, s.eye));
      const r = V.norm(V.cross([0, 1, 0], f)), u = V.cross(f, r);
      let fx = f[0] + u[0] * .8, fz = f[2] + u[2] * .8; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      if (prev) { const dx = s.eye[0] - prev[0], dz = s.eye[2] - prev[2]; PHF[i] = PHF[i - 1] + dx * fx + dz * fz; PHR[i] = PHR[i - 1] + dx * fz - dz * fx; PSP[i] = Math.hypot(dx, dz) * 60; }
      prev = s.eye;
      const a = EYE[(i + PH_N - 1) % PH_N], b = EYE[(i + 1) % PH_N];
      for (let c = 0; c < 3; c++) VEL[3 * i + c] = (b[c] - a[c]) * 30;
    }
    const res = v => OD.modp(v + 512, 1024) - 512;
    const rF = res(PHF[PH_N]), rR = res(PHR[PH_N]);
    for (let i = 0; i <= PH_N; i++) { PHF[i] -= rF * i / PH_N; PHR[i] -= rR * i / PH_N; }
    PSP[0] = PSP[PH_N];
  }
  const phaseAt = T => { const x = clamp(T * 60, 0, PH_N - .001), i = Math.floor(x), f = x - i; return [PHF[i] + (PHF[i + 1] - PHF[i]) * f, PHR[i] + (PHR[i + 1] - PHR[i]) * f, PSP[i]]; };
  const lensVel = T => { const x = clamp(T * 60, 0, PH_N - .001), i = Math.floor(x), f = x - i, o = []; for (let c = 0; c < 3; c++) o.push(VEL[3 * i + c] + (VEL[3 * i + 3 + c] - VEL[3 * i + c]) * f); return o; };

  /* ---------------- HOOKS for the later stages ----------------
     All are pure functions of film time T and sim time s; wire goes into W (white hairlines, W.style for
     pure white), glows are returned for the additive canvas pass as {p, a, m (radius m), px (min px), max}. */
  // destroyer state during the defence: VLS hatches, forward Phalanx yaw / pitch / spin
  function ddgFx(T, s, st) {
    if (s < 55 || s > 140) return;
    st.vlsOpen = DEF.vlsOpen(s);
    const c = DEF.ciwsAt(s);
    st.ciwsYaw = [c.yaw, PI]; st.ciwsPitch = [c.pitch, .35]; st.ciwsSpin = c.spin;
  }
  // chapter 3: SM-6 launches, plumes, laid smoke, the flashes far out, tracer, round 3's burst + debris
  // (far effects sit lower with the Earth's curve, like the ships: the lens is lifted by the drop at the ship instead)
  function curved(p, fn) {
    const dx = p[0] - cam.eye[0], dz = p[2] - cam.eye[2], drop = (dx * dx + dz * dz) / R2E;
    if (drop < .05) return fn();
    cam.eye[1] += drop; cam.target[1] += drop; cam.update();
    fn();
    cam.eye[1] -= drop; cam.target[1] -= drop; cam.update();
  }
  function defenceFx(T, s) { curved(OD.shipPos(A, s), () => DEF.draw(W, cam, T, s)); }
  // chapters 4 + 5 (od_salvo_hit.js): round 4's hit (flash, fireball rings, blast front, debris arcs, the breach),
  // then the burning ship (fires on deck, the smoke column leaning downwind)
  const HIT = OD.HIT;
  function hitFx(T, s) { curved(hitNow(s), () => HIT.draw(W, cam, T, s)); }
  // additive glows (launch flashes, intercepts, the burst, the hit)
  function fxGlows(T, s) { const g = DEF.glows(s); for (const q of HIT.glows(T, s)) g.push(q); HIT.fireGlows(s, cam.eye, g); return g; }
  // lens shake (px): the Phalanx firing a few metres away, round 3's blast wave arriving, round 4's hit
  function shakeAt(T, s) {
    let a = 0;
    if (DEF.firing(s)) a += 1.6 * (.6 + .4 * Math.abs(M3.noise(s * 9, 3.3))) * clamp(1.4 - V.dist(cam.eye, OD.shipPos(A, s)) / 120, 0, 1);
    const aw = s - (DEF.B3.t + V.dist(DEF.B3.p, OD.shipPos(A, s)) / 340);
    if (aw > 0 && aw < 1.2) a += 7 * Math.exp(-aw / .25);
    return a + HIT.shake(s, cam.eye);
  }
  // stage B / C: extra tracked labels [{id, sub, at, a, dx, dy, y}] and one-shot sound cues are added below

  /* ---------------- drawing ---------------- */
  function objFog(dist) { W.fog = [Math.max(30, dist * .55), dist * 2.4 + 700]; }
  const noFog = () => { W.fog = [1e8, 2e8]; };
  function ddgState(T, s) {
    const st = { sps: s * (PI / 2) + 1.1, hangar: 0 };
    ddgFx(T, s, st);
    return st;
  }
  /* the Earth's curve: far things sit lower by d^2 / 2R, and past the lens's horizon the sea hides their
     lower (d - dh)^2 / 2R. farK -> [drop (m), visible fraction of an object `top` metres tall] */
  const R2E = 2 * OD.RE;
  function farK(p, top) {
    const e = cam.eye, dx = p[0] - e[0], dz = p[2] - e[2], d = Math.hypot(dx, dz), dh = Math.sqrt(R2E * Math.max(.5, e[1]));
    const H = d > dh ? (d - dh) * (d - dh) / R2E : 0;
    return [d * d / R2E, 1 - sat(H / top)];
  }
  const lowered = (Xs, dy) => dy ? X.make(Xs.R, [Xs.T[0], Xs.T[1] - dy, Xs.T[2]]) : Xs;
  const TOPS = { ddg: 46, cg: 46, cvn: 62 };
  function drawShipModel(S, T, s, dist, drop, vis) {
    const Xs = lowered(OD.shipXf(S, s), drop), far = dist > 1500, veryFar = dist > 4200;
    const a = clamp(1.25 - dist / 12000, .3, 1) * vis;
    objFog(dist);
    if (S.kind === 'ddg') {
      const st = ddgState(T, s);
      FAST.draw(W, veryFar ? C.ddgFar : far ? C.ddgF : C.ddg, Xs, st, { fine: !far, a, dynCache: far ? DDG_CACHE_C : DDG_CACHE });
    } else if (S.kind === 'cg') FAST.draw(W, far ? C.cgF : C.cg, Xs, {}, { fine: !far, a });
    else FAST.draw(W, dist < 2500 ? C.cv : C.cvF, Xs, {}, { fine: false, a });
    return Xs;
  }
  function facesW(S, Xs) {
    if (S.kind === 'ddg') return OD.DA.spy.map((c, i) => ({ c: X.ap(Xs, c), n: X.dir(Xs, OD.DA.spyN[i]) }));
    if (S.kind === 'cg') return M.cg.FACES.map(f => ({ c: X.ap(Xs, f.c), n: X.dir(Xs, f.n) }));
    return [];
  }
  function drawFaceFlash(Fw, k) {
    const n = Fw.n, h = V.norm(V.cross([0, 1, 0], n)), u = V.cross(n, h), p = [];
    for (let i = 0; i <= 8; i++) { const a = (i + .5) / 8 * TAU; p.push(V.add(V.mad(Fw.c, n, .12), V.add(V.mul(h, Math.cos(a) * 2.05), V.mul(u, Math.sin(a) * 2.05)))); }
    for (let i = 0; i < 8; i++) W.seg(p[i], p[i + 1], .75 * k);
  }

  /* the rounds: the HD model, the ramjet plume with its shock diamonds, the Mach cone and its V on the water */
  const NZ = HD.oniks.NOZZLE, TIP = HD.oniks.TIP;
  function plume(r, sl, A) {
    const ax = r.f, [U, Vv] = GEO.perp(ax), fk = Math.floor(sl * 60);
    const nz = X.ap(r.X, NZ), rr = .27, L = 6.5 + 1.4 * hash(fk, 5), cell = .95, nC = 6;
    W.style('#FFFFFF', 1);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, d = V.add(V.mul(U, Math.cos(a)), V.mul(Vv, Math.sin(a))); W.seg(V.mad(nz, d, rr * .9), V.mad(V.mad(nz, ax, -L), d, .04), .26 * A); }
    W.seg(nz, V.mad(nz, ax, -L * 1.4), .45 * A);
    for (let k = 0; k < nC; k++) {
      const s0 = k * cell + .15, smd = s0 + cell * .5, s1 = s0 + cell, rk = rr * (1 - k / (nC + 1.5)), fa = (1 - k / (nC + .5)) * A;
      const cm = V.mad(nz, ax, -smd);
      W.ring(cm, U, Vv, rk * .32, 12, .75 * fa);
      for (let i = 0; i < 6; i++) { const th = i / 6 * TAU + k * .5, d = V.add(V.mul(U, Math.cos(th)), V.mul(Vv, Math.sin(th))); W.seg(V.mad(V.mad(nz, ax, -s0), d, rk), V.mad(cm, d, rk * .32), .38 * fa); W.seg(V.mad(cm, d, rk * .32), V.mad(V.mad(nz, ax, -s1), d, rk * .78), .26 * fa); }
    }
    W.style(WH, 1);
  }
  function drawMach(r, sl, al) {
    const MU = Math.asin(340 / Math.max(360, r.spd)), TMU = Math.tan(MU), apex = X.ap(r.X, TIP), hm = apex[1];
    if (hm > 60 || hm < 1) return;
    const hf = V.norm([r.f[0], 0, r.f[2]]), hr = [hf[2], 0, -hf[0]];
    const back = V.mul(r.f, -1), [U, Vv] = GEO.perp(r.f), cmu = Math.cos(MU), smu = Math.sin(MU);
    const rel = V.sub(cam.eye, apex), sc = -V.dot(rel, r.f), rad = V.len(V.sub(rel, V.mul(r.f, -sc)));
    const e = cam.eye, dR = V.len(rel);
    // the cone itself is nearly invisible: a faint hint, only close to the lens
    const ca = al * (sc <= 0 ? 1 : ss(1.05, 1.5, rad / (sc * TMU))) * ss(110, 45, dR) * .6;
    if (ca > .01) for (let g = 0; g < 14; g++) {
      const th = (g + .5) / 14 * TAU, gd = V.add(V.mul(back, cmu), V.mul(V.add(V.mul(U, Math.cos(th)), V.mul(Vv, Math.sin(th))), smu));
      let sEnd = 20; if (gd[1] < 0) sEnd = Math.min(sEnd, (hm - .3) / -gd[1]);
      for (const [s0, s1, a] of [[0, 8, .12], [8, 20, .05]]) { if (s0 >= sEnd) break; W.seg(V.mad(apex, gd, s0), V.mad(apex, gd, Math.min(s1, sEnd)), a * ca); }
    }
    // the cone's footprint: a short V of disturbed water trailing the round, and spray where it first touches;
    // faded where it passes close under the lens (there it is a blur, not a line)
    const s0 = hm / TMU, fk = Math.floor(sl * 30), ac = V.dot(apex, hr), aa = V.dot(apex, hf);
    const gp = (c, a) => [hr[0] * c + hf[0] * a, 0, hr[2] * c + hf[2] * a];
    const nearK = q => ss(25, 95, Math.hypot(q[0] - e[0], q[1] - e[1], q[2] - e[2]));
    for (const side of [-1, 1]) {
      let prev = null, pa = 0;
      for (let s = s0; s < s0 + 150;) {
        const rr = s * TMU, w = Math.sqrt(Math.max(0, rr * rr - hm * hm)), q = gp(ac + side * w, aa - s);
        q[1] = OD.swell(q[0], q[2], SIM_NOW) + .6;
        const a = .28 * Math.exp(-(s - s0) / 70) * al * nearK(q);
        if (prev) W.seg(prev, q, (a + pa) * .5);
        prev = q; pa = a;
        s += Math.min(10, 1.2 + (s - s0) * .05);
      }
      let n = 0;
      for (let s = s0 + .5; s < s0 + 160; s += 2.2, n++) {
        const h1 = hash(fk * 131 + n, side + 5); if (h1 > .16 + .44 * Math.exp(-(s - s0) / 45)) continue;
        const rr = s * TMU, w = Math.sqrt(Math.max(0, rr * rr - hm * hm)), kf = Math.exp(-(s - s0) / 60);
        const b = gp(ac + side * (w + hash(fk, n) * 1.5), aa - s - hash(n, fk) * 2);
        b[1] = OD.swell(b[0], b[2], SIM_NOW) + .5;
        const hg = (.3 + hash(n + 3, fk) * .9) * (.5 + kf * 1.4), out = side * (.1 + hash(fk + 9, n) * .4), bk = .6 + hash(n, fk + 2) * 2.2;
        const tip = V.add(b, V.add(V.mul(hr, out), V.add([0, hg, 0], V.mul(hf, -bk))));
        W.seg(b, tip, (.12 + .26 * kf) * (.4 + .6 * hash(fk + 1, n)) * al * nearK(b));
      }
    }
  }
  // the far field of the V: disturbed water along the ground track, fading over ~7 s behind the round
  function farWake(i, sl, al) {
    if (al < .01) return;
    const e = cam.eye;
    let pv = null, pa = 0;
    for (let k = 0; k <= 14; k++) {
      const ag = k * .5, q = OD.round(i, sl - ag).p, dx = q[0] - e[0], dz = q[2] - e[2];
      const p = [q[0], .4 - (dx * dx + dz * dz) / R2E, q[2]], a = .3 * al * Math.pow(1 - k / 15, 1.4) * ss(0, .6, ag + .2);
      if (pv) W.seg(pv, p, (a + pa) * .5);
      pv = p; pa = a;
    }
  }
  let SIM_NOW = 0;
  const MARKS = [];                         // far rounds: hairline crosses drawn on the canvas
  function drawRound(i, sl, key) {
    const r = OD.round(i, sl);
    if (!r.live && r.a <= .01) return null;
    if (sl > r.end + (i === 3 ? .004 : .05)) return null;
    const e = cam.eye, d = V.dist(r.p, e), px = 8.9 * cam.fl / d;
    const [drop, vis] = farK(r.p, r.p[1] + 1);
    if (vis <= .02) return r;
    if (drop > .05) { r.p = [r.p[0], r.p[1] - drop, r.p[2]]; r.X = lowered(r.X, drop); }
    if (px < 6) { const p = cam.project(r.p); if (p) MARKS.push({ p, a: r.a * vis * ss(0, 3, 6 - px), y: key, i }); }
    if (px > 1.2) {
      objFog(d);
      FAST.draw(W, px > 160 ? C.on : C.onF, r.X, ONST, { fine: px > 160, a: r.a * ss(1.2, 10, px) });
      noFog();
      if (d < 2600) plume(r, sl, r.a * ss(2600, 900, d));
      if (d < 1600) drawMach(r, sl, r.a * ss(1600, 500, d));
    }
    if (d > 900) farWake(i, sl, r.a * vis * ss(900, 2200, d));
    return r;
  }

  /* ---------------- labels ---------------- */
  const callsEl = document.getElementById('calls'), POOL = [];
  for (let i = 0; i < 6; i++) { const d = document.createElement('div'); d.className = 'call'; callsEl.appendChild(d); POOL.push({ el: d, html: '', on: false }); }
  // label widths measured before the web font arrived would misplace the leaders: measure again once it has
  document.fonts && document.fonts.ready.then(() => POOL.forEach(P => { P.html = ''; }));
  let LEAD = [];
  function setLabels(list) {
    LEAD = [];
    const placed = [];
    for (let i = 0; i < POOL.length; i++) {
      const L = list[i], P = POOL[i];
      if (!L || L.a <= .01) { if (P.on) { P.el.style.opacity = 0; P.on = false; } continue; }
      const p = cam.project(L.at);
      if (!p || p[0] < 700 || p[0] > 1880 || p[1] < 40 || p[1] > 1060) { if (P.on) { P.el.style.opacity = 0; P.on = false; } continue; }
      const dx = L.dx === undefined ? 70 : L.dx, dy = L.dy === undefined ? -64 : L.dy;
      const html = ORB.cat(L.id, { sq: L.y ? 'y' : '', code: L.code || L.id }) + (L.sub ? `<span class="s2">${L.sub}</span>` : '');
      if (html !== P.html) { P.el.innerHTML = html; P.html = html; P.w = P.el.offsetWidth; }
      const left = dx < 0, wv = P.w || 200;
      let lx = p[0] + dx, ly = clamp(p[1] + dy, 262, 870);
      let x0 = left ? lx - wv - 6 : lx + 6;
      x0 = clamp(x0, 720, 1810 - wv);
      lx = left ? x0 + wv + 6 : x0 - 6;
      for (let k = 0; k < 6; k++) {
        const hit = placed.find(b => x0 < b[2] + 12 && x0 + wv > b[0] - 12 && ly - 10 < b[3] && ly + 34 > b[1]);
        if (!hit) break;
        ly = clamp(hit[1] - 48, 262, 870) === ly ? ly + 48 : hit[1] - 48;
      }
      placed.push([x0, ly - 10, x0 + wv, ly + 34]);
      P.el.style.transform = `translate(${x0.toFixed(1)}px, ${(ly - 7).toFixed(1)}px)`;
      P.el.style.opacity = L.a.toFixed(3); P.on = true;
      LEAD.push({ p, q: [lx, ly], a: L.a, y: L.y });
    }
  }
  function drawLeaders() {
    ctx.lineWidth = 1;
    for (const l of LEAD) {
      ctx.strokeStyle = WH; ctx.globalAlpha = .55 * l.a;
      ctx.beginPath(); ctx.moveTo(l.p[0], l.p[1]); ctx.lineTo(l.q[0], l.q[1]); ctx.stroke();
      ctx.globalAlpha = .9 * l.a; ctx.strokeStyle = l.y ? HI : WH;
      ctx.beginPath(); ctx.arc(l.p[0], l.p[1], 2.6, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const win = (T, a, b, f) => ss(a, a + (f || .8), T) * (1 - ss(b - (f || .8), b, T));

  /* ---------------- log, readout, captions ---------------- */
  // [sim s, code, text]: the engagement clock is sim time (it slows with the film in the slow motion)
  const LOG = [
    [.5, 'SALVO', '4 × 3M55 · line abreast'], [5, 'SALVO', 'M 2.0 · 14 m · 000'], [18, 'SALVO', '48 km to the target'],
    [30, 'R4', 'Breaks east'], [36, 'DDG', 'SPY-1D · volume search'], [46.5, 'SALVO', 'Split · four lines'],
    [52, 'DDG', 'Raid · 4 · bearing 180'], [55.6, 'DDG', 'VLS · 2 cells open'], [57.3, 'SM-6', 'Away · 1'], [60, 'SM-6', 'Away · 2'],
    [STOP[0], 'R1', 'Stopped · 13 km'], [STOP[1], 'R2', 'Stopped · 11 km'], [79.4, 'CIWS', 'Slewing · stbd bow'], [86, 'CIWS', 'Engaging'],
    [STOP[2], 'R3', 'Stopped · 500 m'], [DEF.CW.R4.burst[0], 'CIWS', 'Engaging · R4'], [S_HIT, 'R4', 'Hit · starboard amidships'],
    [S_HIT + 3, 'DDG', 'Fire · amidships'], [S_HIT + 12, 'DDG', 'Losing way'],
    [S_HIT + 22, 'CVN', 'Turning · 040'], [S_HIT + 30, 'DDG', 'List 3° stbd'], [S_HIT + 36, 'SALVO', 'Next four · inbound'],
  ];
  const logRows = document.getElementById('logRows');
  const clk = s => { s = Math.max(0, s); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
  let logKey = '';
  // the newest line arrives in the accent and settles to white after a few seconds
  function updateLog(s) {
    const all = LOG.map(([t, c, x]) => [t <= s ? t : t - DS, c, x, t]).sort((a, b) => a[0] - b[0]).slice(-6);
    const fresh = s - all[all.length - 1][0] < 4.5;
    const key = all.map(r => r[2] + r[0].toFixed(1)).join('|') + fresh;
    if (key === logKey) return; logKey = key;
    logRows.innerHTML = all.map(([t, c, x, t0], i) => `<div class="r${i === all.length - 1 ? ' new' + (fresh ? ' hot' : '') : ''}"><span class="c">${clk(t0)}</span><span class="t">${c}</span><span>${x}</span></div>`).join('');
  }
  const roEl = document.getElementById('ro'); let roKey = '';
  const km = m => (m / 1000).toFixed(1);
  function readout(T, s) {
    let k = '', v = '';
    const aPos = OD.shipPos(A, s), dA = p => Math.hypot(p[0] - aPos[0], p[2] - aPos[2]);
    if (T < 28 || T >= D - 9) {
      // the next salvo is measured to its own target (the ship of the next loop), so the seam reads the same
      const sl = T < 28 ? s : s - DS, c = OD.salvoC(sl), a0 = OD.shipPos(A, sl);
      k = 'Salvo'; v = `${km(Math.hypot(c[0] - a0[0], c[2] - a0[2]))} km · M 2.0 · ${Math.round(OD.round(0, sl).p[1])} m`;
    } else if (T < 55) { k = 'Salvo'; v = `${km(dA(OD.round(2, s).p))} km · DDG 17.5 kn`; }
    else if (T < 95) {
      let best = null; for (let i = 0; i < 4; i++) { const r = OD.round(i, s); if (!r.live) continue; const d = dA(r.p); if (!best || d < best.d) best = { i, d }; }
      k = best ? `Round ${best.i + 1}` : 'Salvo'; v = best ? `${best.d > 2000 ? km(best.d) + ' km' : Math.round(best.d) + ' m'} · M 2.0` : '';
    } else if (s < S_HIT) { k = 'Round 4'; v = `${Math.round(V.dist(OD.round(3, s).p, H0))} m · M 2.0 · 5 m`; }
    else if (T < 112) { k = 'DDG'; v = 'Hit · starboard amidships'; }
    else { k = 'Alt'; v = `${Math.round(cam.eye[1]).toLocaleString('en').replace(/,/g, ' ')} m`; }
    const rate = SIM.rate(T), rs = Math.abs(rate - 1) > .01 ? `<span class="rate">×${rate < .995 ? rate.toFixed(2) : rate.toFixed(1)}</span>` : '';
    const key = k + v + rs; if (key === roKey) return; roKey = key;
    roEl.innerHTML = `<span class="k">${k}</span>${v}${rs}`;
  }
  const CH = [
    { t: 0, title: 'Inbound', sub: 'Four 3M55 · sea-skim at Mach 2' },
    { t: 28, title: 'The ship', sub: 'DDG Flight IIA · the task group beyond' },
    { t: 55, title: 'Defence', sub: 'SM-6 off the deck · Phalanx' },
    { t: 95, title: 'The hit', sub: 'Round 4 · slow motion' },
    { t: 112, title: 'Aftermath', sub: 'The next four already inbound' },
  ];
  const figT = document.getElementById('figT'), figS = document.getElementById('figS');

  /* ---------------- sound ---------------- */
  const SND = { on: false };
  function sndInit() {
    const S = STAGE.SFX; if (!S.ac || SND.on) return !!SND.on;
    const ac = S.ac, out = S.master;
    const noiseBuf = sec => { const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = l * .97 + w * .03; d[i] = w * .5 + l * 3; } return b; };
    const nb = noiseBuf(4);
    const src = () => { const s = ac.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
    const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
    const filt = (type, f, q) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || .7; return b; };
    const bed = gain(0); src().connect(filt('lowpass', 380)).connect(bed).connect(out);
    const wind = gain(0), wf = filt('bandpass', 700, .6); src().connect(wf).connect(wind).connect(out);
    const roar = gain(0), rf = filt('bandpass', 260, .9); src().connect(rf).connect(roar).connect(out);
    const hum = gain(0), ho = ac.createOscillator(); ho.type = 'triangle'; ho.frequency.value = 61; ho.connect(filt('lowpass', 200)).connect(hum).connect(out); ho.start();
    const fire = gain(0); src().connect(filt('bandpass', 900, .5)).connect(fire).connect(out);
    Object.assign(SND, { on: true, bed, wind, wf, roar, rf, hum, fire });
    return true;
  }
  function sndUpdate(T, s, playing) {
    if (!sndInit()) return;
    const ac = STAGE.SFX.ac, t = ac.currentTime, set = (p, v) => p.setTargetAtTime(STAGE.SFX.on && playing ? v : 0, t, .12);
    const e = cam.eye, lv = V.len(lensVel(T)), rate = SIM.rate(T);
    set(SND.bed.gain, .05 + .05 * (1 - sat(e[1] / 400)));
    set(SND.wind.gain, .05 * sat(lv / 1500));
    SND.wf.frequency.setTargetAtTime(500 + Math.min(1800, lv * .6), t, .3);
    let r = 0;
    for (const [i, sl] of [[0, s], [1, s], [2, s], [3, s], [0, s - DS], [1, s - DS], [2, s - DS], [3, s - DS]]) { const q = OD.round(i, sl); if (!q.live) continue; r += 1 / (1 + V.dist(q.p, e) / 45); }
    set(SND.roar.gain, .12 * Math.min(1.5, r));
    SND.rf.frequency.setTargetAtTime(160 + 240 * rate, t, .2);
    set(SND.hum.gain, .05 / (1 + V.dist(OD.shipPos(A, s), e) / 150));
    set(SND.fire.gain, .07 * ss(S_HIT + .2, S_HIT + 2, s) / (1 + V.dist(hitNow(s), e) / 180) * (.75 + .25 * M3.noise(s * 7, 1.9)));
  }
  const S = STAGE.SFX, CUES = [];
  // the rounds going by the lens as it slips through the line; the run ahead; the drop-in
  CUES.push([7.2, () => { S.noise(1.6, 900, .7, .07, .25); S.tone(420, 180, 1.2, 'sawtooth', .012); }]);
  CUES.push([26, () => S.noise(3.5, 1400, .5, .05, .8)]);
  CUES.push([D - 5, () => S.noise(4, 700, .6, .06, 1.6)]);
  // the defence: hatches, two launches, far flashes, the Phalanx slewing, spinning up and firing, round 3's burst
  for (const M of DEF.SM6) {
    CUES.push([M.tOpen, () => { S.tone(150, 95, .18, 'square', .025); S.noise(.35, 600, .8, .03, .01); }]);
    CUES.push([M.tL, () => { S.crack(); S.noise(4.5, 320, .8, .28, .02); S.noise(2.5, 2400, .5, .07, .01); S.tone(90, 40, 3, 'sawtooth', .03); }]);
    CUES.push([M.tI, () => S.noise(2.2, 110, 1, .09, .08)]);
  }
  CUES.push([DEF.CW.slew[0], () => { S.tone(260, 520, 1.8, 'sawtooth', .012); S.tone(390, 780, 1.8, 'triangle', .01); }]);
  CUES.push([DEF.CW.spin[0], () => S.tone(120, 1200, 1.7, 'sawtooth', .016)]);
  for (const [a, b] of DEF.CW.bursts) CUES.push([a, () => { S.noise(b - a + .15, 1800, .9, .22, .005); S.tone(75, 75, b - a, 'sawtooth', .06); S.noise(b - a + .5, 180, 1, .12, .01); }]);
  // round 4: the mount spinning up again, its burst stretched by the slow motion, the impact, the blast front at the lens
  { const C4 = DEF.CW.R4, t0 = OD.Tof(C4.spin[0]), b0 = OD.Tof(C4.burst[0]), b1 = OD.Tof(C4.burst[1]);
    CUES.push([t0, () => S.tone(80, 420, OD.Tof(C4.spin[1]) - t0, 'sawtooth', .012)]);
    CUES.push([b0, () => { S.noise(b1 - b0 + .3, 520, .9, .16, .02); S.tone(24, 22, b1 - b0, 'sawtooth', .05); }]); }
  CUES.push([T_HIT, () => { S.tone(64, 24, 4.5, 'sine', .13); S.noise(5, 85, .9, .3, .004); S.noise(1.2, 2600, .5, .05, .002); }]);
  { let tb = 105; for (let i = 0; i < 6; i++) tb = OD.Tof(HIT.blastAt(shotAt(tb).eye)); CUES.push([tb, () => { S.crack(); S.rumble(5.5, .34); }]); }
  // the blast reaches the ship ~1.5 s after the flash
  CUES.push([DEF.B3.t + V.dist(DEF.B3.p, OD.shipPos(A, DEF.B3.t)) / 340, () => { S.crack(); S.rumble(2.8, .26); }]);

  /* ---------------- render ---------------- */
  const shipsForSea = [];
  function render(T, info) {
    const s = SIM(T); SIM_NOW = s;
    const shot = shotAt(T);
    const dv = V.norm(V.sub(shot.target, shot.eye));
    cam.up = Math.abs(dv[1]) > .985 ? [0, 0, 1] : [0, 1, 0];
    FILM.apply(cam, shot);
    const sk = shakeAt(T, s);
    cam.shake = sk > .01 ? FILM.shake(s, sk, 23) : [0, 0];
    const lv = lensVel(T);
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080);
    W.reset(); W.style(WH, 1); noFog();
    const e = cam.eye;
    MARKS.length = 0;
    // sea, caps
    shipsForSea.length = 0;
    for (const Sx of OD.SHIPS) { const p = OD.shipPos(Sx, s), ps = OD.shipPsi(Sx, s); shipsForSea.push({ S: Sx, x: p[0], z: p[2], L: Sx.L, r2: Math.pow(Sx.L / 2 + 25, 2), sn: Math.sin(ps), cs: Math.cos(ps) }); }
    const ph = phaseAt(T);
    OD.drawSea(W, cam, s, ph, { ships: shipsForSea, speed: ph[2] });
    OD.drawCaps(W, cam, s, { ships: shipsForSea, smear: V.mul(lv, -.5 / 60) });
    // wakes, ships, pulses, shimmer
    const labels = [];
    for (const Sx of OD.SHIPS) {
      const p = OD.shipPos(Sx, s), dist = V.dist([p[0], 10, p[2]], e);
      const [drop, vis] = farK(p, TOPS[Sx.kind]);
      if (dist > 90000 || vis <= .02) continue;
      noFog(); OD.drawWake(W, Sx, s, { alpha: clamp(1.4 - dist / 9000, .35, 1) * vis, dy: -drop });
      const Xs = drawShipModel(Sx, T, s, dist, drop, vis);
      noFog();
      const Fw = facesW(Sx, Xs);
      if (Fw.length) {
        const fired = OD.drawPulses(W, Sx, s, Fw, { alpha: clamp(1.3 - dist / 9000, .4, 1) * (Sx === A ? 1 - ss(S_HIT + .05, S_HIT + 1.2, s) : 1) });
        for (const f of fired) drawFaceFlash(Fw[f.f], f.k * clamp(1 - dist / 2500, 0, 1));
      } else if (Sx.kind === 'cvn') OD.drawSweep(W, X.ap(Xs, [31.6, 55.5, -28.5]), s, t => t * 1.26, { alpha: clamp(1.3 - dist / 9000, .4, 1) });
      if (dist < 2500 && Sx.kind === 'ddg') {
        const up = X.dir(Xs, [0, 1, 0]), aft = X.dir(Xs, [0, 0, -1]), side = X.dir(Xs, [1, 0, 0]);
        for (const m of OD.DA.stacks) OD.drawShimmer(W, X.ap(Xs, m), up, aft, side, s, { alpha: clamp(1.2 - dist / 1800, 0, 1) * ss(S_HIT + 30, S_HIT, s), w: 3.4 });
      }
    }
    // the salvo (and, late in the loop, the next one)
    noFog();
    const salvoKey = T > 28 && T < 60 || T > 118;
    const R0 = [];
    if (T < 112) for (let i = 0; i < 4; i++) R0.push(drawRound(i, s, salvoKey));
    const R1 = [];
    if (T > 96) for (let i = 0; i < 4; i++) R1.push(drawRound(i, s - DS, salvoKey));
    // HOOKS: effects of the later stages
    noFog(); defenceFx(T, s);
    noFog(); hitFx(T, s);
    W.flush(ctx);

    // additive glows (restrained)
    const GL = fxGlows(T, s);
    if (GL.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const gl of GL) {
        const p = cam.project(gl.p); if (!p || gl.a <= .004) continue;
        const r = Math.min(gl.max || 90, (gl.px || 4) + gl.m * cam.fl / p[2]);
        const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
        g.addColorStop(0, `rgba(255,255,255,${Math.min(1, gl.a).toFixed(3)})`); g.addColorStop(.22, `rgba(255,250,235,${(gl.a * .3).toFixed(3)})`); g.addColorStop(1, 'rgba(255,250,235,0)');
        ctx.fillStyle = g; ctx.fillRect(p[0] - r, p[1] - r, 2 * r, 2 * r);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // menu-side calm (off with the UI: H gives the clean film)
    if (!FILM.uiHidden) {
      const lg = ctx.createLinearGradient(0, 0, 760, 0);
      lg.addColorStop(0, 'rgba(0,0,0,.9)'); lg.addColorStop(.62, 'rgba(0,0,0,.55)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, 760, 1080);
      // and a faint calm under the log and the caption, for when the wire runs behind them
      for (const [x, y, r] of [[1665, 150, 380], [1705, 975, 320]]) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(0,0,0,.72)'); g.addColorStop(.55, 'rgba(0,0,0,.48)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
    }
    // far rounds: hairline crosses (yellow while the salvo is the key object)
    ctx.lineWidth = 1.2;
    for (const m of MARKS) {
      if (m.a <= .01) continue;
      const k = 3.5, [x, y] = m.p;
      ctx.globalAlpha = .9 * m.a; ctx.strokeStyle = m.y ? HI : WH;
      ctx.beginPath(); ctx.moveTo(x - k, y); ctx.lineTo(x + k, y); ctx.moveTo(x, y - k); ctx.lineTo(x, y + k); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // labels (true designations)
    if (!FILM.uiHidden) {
      const c0 = OD.salvoC(s);
      labels.push({ id: 'Salvo · 4 × 3M55', code: '3M55', sub: 'P-800 Oniks · Mach 2 · 14 m', y: true, at: R0[2] ? X.ap(R0[2].X, [0, .4, 0]) : c0, a: win(T, 1.2, 6.2) * (R0[2] ? 1 : 0), dx: 80, dy: -96 });
      if (R0[3]) labels.push({ id: 'Round 4', code: 'R4', sub: 'Breaks east · wide of the line', y: true, at: R0[3].p, a: win(T, 28.4, 30.9, .5), dx: 90, dy: 80 });
      if (R0[1]) labels.push({ id: '3M55 Oniks', sub: '8.9 m · ramjet · wings out', at: X.ap(R0[1].X, [0, .4, 1.2]), a: win(T, 18.8, 23.6), dx: 90, dy: -90 });
      const Xa = OD.shipXf(A, s);
      labels.push({ id: 'DDG · Arleigh Burke IIA', code: 'DDG51', sub: '155 m · 17.5 kn · AN/SPY-1D', at: X.ap(Xa, [0, 22, 14]), a: win(T, 48.5, 54.5), dx: 70, dy: -90 });
      labels.push({ id: 'CG · Ticonderoga', code: 'CG47', sub: '173 m · the screen', at: X.ap(OD.shipXf(CG, s), [0, 20, 10]), a: win(T, 50.5, 55.5), dx: 60, dy: -70 });
      labels.push({ id: 'CVN · Nimitz class', code: 'CVN68', sub: '333 m · 8 km off', at: X.ap(OD.shipXf(CV, s), [30, 40, -28]), a: win(T, 51.5, 56.5), dx: 60, dy: -70 });
      if (R0[2]) labels.push({ id: 'Salvo · 4 inbound', code: 'RAID', sub: `${km(V.dist(R0[2].p, OD.shipPos(A, s)))} km · 180°`, y: true, at: R0[2].p, a: win(T, 66.5, 70.4) * (MARKS.length ? 1 : 0), dx: 70, dy: -70 });
      const Xd = OD.shipXf(A, s);
      labels.push({ id: 'Mk 41 VLS', code: 'MK41', sub: 'Forward · 32 cells · 2 open', at: X.ap(Xd, [0, OD.DA.vls(13)[1], OD.DA.vls(13)[2]]), a: win(T, 55.9, 58.4, .5), dx: 90, dy: -110 });
      { const M2 = DEF.SM6[1], t2 = s - M2.tL; if (t2 > 0 && t2 < 6) labels.push({ id: 'RIM-174 SM-6', code: 'SM6', sub: 'Standard Missile 6 · 2 away', at: DEF.smAt(M2, t2), a: win(T, 60.9, 63.8, .5), dx: 80, dy: 70 }); }
      DEF.INT.forEach((I, k) => labels.push({ id: `Round ${k + 1}`, code: `R${k + 1}`, sub: `Stopped · ${km(V.dist(I.p, OD.shipPos(A, I.t)))} km`, y: true, at: I.p, a: win(T, I.t + .15, I.t + 3.2, .4), dx: 70, dy: -80 }));
      labels.push({ id: 'Phalanx 1B', code: 'CIWS', sub: 'Mk 15 · 20 mm · 4 500 rds/min', at: X.ap(Xd, V.add(OD.DA.ciws(DEF.ciwsSt(s), 0), [0, 1.6, -2.4])), a: win(T, 80.4, 85.2, .6), dx: -70, dy: -120 });
      if (R0[2] && s < STOP[2]) labels.push({ id: 'Round 3', code: 'R3', sub: `${Math.round(V.dist(R0[2].p, OD.shipPos(A, s)))} m · M 2.0`, y: true, at: R0[2].p, a: win(T, 85.6, STOP[2] - .05, .4), dx: 80, dy: -90 });
      if (R0[3]) labels.push({ id: 'Round 4', code: 'R4', sub: 'M 2.0 · 5 m · from the SSE', y: true, at: R0[3].p, a: win(T, 95.6, 98.2, .5), dx: 80, dy: -84 });
      const low = p => { const dx = p[0] - e[0], dz = p[2] - e[2]; return [p[0], p[1] - (dx * dx + dz * dz) / R2E, p[2]]; };
      labels.push({ id: 'Hit · DDG', code: 'HIT', sub: 'Starboard · amidships', y: true, at: HIT.breach(s), a: win(T, 101.4, 106.8, .6), dx: 120, dy: 120 });
      labels.push({ id: 'DDG · on fire', code: 'DDG51', sub: 'Fire amidships · starboard side', at: low(X.ap(OD.shipXf(A, s), [0, 12, -8])), a: win(T, 110.6, 116.4), dx: 90, dy: 100 });
      { const t0 = HIT.top(s), tp = low(t0); labels.push({ id: 'Smoke column', code: 'SMOKE', sub: `${Math.round(t0[1] / 10) * 10} m · leaning WSW`, at: tp, a: win(T, 116.8, 122.6), dx: 80, dy: -60 }); }
      if (R1[1]) labels.push({ id: 'Next salvo · 4 × 3M55', code: '3M55', sub: `${km(V.dist(OD.salvoC(s - DS), hitNow(s)))} km out`, y: true, at: V.add(OD.salvoC(s - DS), [0, 12, 0]), a: win(T, 142.6, 147.2), dx: 70, dy: -80 });
    }
    setLabels(FILM.uiHidden ? [] : labels.filter(l => l.a > .01).sort((a, b) => b.a - a.a).slice(0, 6));
    drawLeaders();

    updateLog(s); readout(T, s);
    if (info && (info.playing || info.seeking === false)) sndUpdate(T, s, !!info.playing);
    STAGE.dbg = { T: +T.toFixed(2), s: +s.toFixed(2), eye: e.map(v => Math.round(v)), v: Math.round(V.len(lv)) };
  }

  FILM.run({
    duration: D,
    chapters: CH,
    cues: CUES,
    onChapter(c) { const i = CH.indexOf(c); figT.innerHTML = `<b>Fig. ${i + 1}</b>${c.title}`; figS.textContent = c.sub; },
    render,
  });
  // probe: screen positions of the main objects at film time T (tuning aid)
  function proj(T) {
    const c = new Cam(1920, 1080), sh = shotAt(T), s = SIM(T); FILM.apply(c, sh);
    const P = p => { const q = c.project(p); return q ? [Math.round(q[0]), Math.round(q[1]), Math.round(q[2])] : null; };
    const o = { eye: sh.eye.map(Math.round), fov: +(sh.fov / D2R).toFixed(1), v: Math.round(V.len(lensVel(T))) };
    o.A = P(X.ap(OD.shipXf(A, s), [0, 10, 0])); o.CG = P(OD.shipPos(CG, s)); o.CV = P(OD.shipPos(CV, s));
    o.r = [0, 1, 2, 3].map(i => P(OD.round(i, s).p)); o.n = [0, 1, 2, 3].map(i => P(OD.round(i, s - DS).p));
    return o;
  }
  window.ODX = { shotAt, cam, phaseAt, lensVel, SEQ, proj, H0, H4 };
})();
