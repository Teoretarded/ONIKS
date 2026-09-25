/* The LIGHTNING SCAN (p1_strike, pa_picture, pc_anatomy): the signature.
   'scan' start: a lime charge gathers at the scan point, an uplink arcs from the scanner, and in the last moment
   a branching leader steps down from high above with a pour of dots running down the channel.
   'scan' hit: the return stroke (a white-lime core with a lime breath, flickering twice), the whole frame lifts,
   a strong light shows the ground round the strike, sparks jump; then a lime sphere front sweeps out through the
   radius. Every enemy unit it passes lights up in branching tendrils (random-weighted shortest paths over its
   points, p1), flares lime, is X-rayed for a moment (what is inside its containers and hull shows), its parts get
   lime brackets that fit them with their anatomy placards, and its tag counts up to 0.97 before it settles as an
   identified coral track. An enemy scan on the player's units is a coral-white strike with a warning.
   Also: the scan targeting reticle while the orders system aims a scan (X). */
import { LIME, CORAL, WH, HOT, TAU, sat, clamp, ss, hsh, outCubic, pad2 } from './core.js';
import { Bolt } from './bolt.js';
import { sampleOf, revealFrom } from './samples.js';
import { TRACK, SHORT } from '../../game/labels.js';

const TF = 2.3;                              // s for the front to reach the edge of the radius
const PAL_OWN = { core: HOT, glow: LIME, spark: [230, 255, 170], light: [225, 255, 170], lift: [226, 250, 200] };
const PAL_EN = { core: [255, 244, 236], glow: CORAL, spark: [255, 200, 170], light: [255, 214, 190], lift: [255, 224, 212] };
const ID_HOLD = 8.2;                         // s the identification brackets stay up

export function createScan(S, AN) {
  const { game } = S, sim = game.sim, R = game.R;
  const scans = [];
  const owns = new Set();                    // unit ids whose tag the scan owns right now
  let nScan = 0;
  const q = [0, 0, 0], P3 = [0, 0, 0];

  const frontT = f => TF * (1 - Math.sqrt(1 - clamp(f, 0, 1)));      // time for the front to reach fraction f of r
  const frontR = (sc, a) => sc.r * (1 - Math.pow(1 - clamp(a / TF, 0, 1), 2));

  function start(e) {
    const own = e.side === game.side;
    if (!own && !nearOwn(e.pos, Math.max(e.r * 2.5, 15000))) return null;
    const rate = game.paused ? 1 : Math.max(1, game.timeRate);
    const sc = {
      own, side: e.side, by: e.by, from: e.from ? e.from.slice() : null, pos: e.pos.slice(), r: e.r || 4000,
      E0: S.clock, Eexp: S.clock + Math.max(.18, (e.delay || 1.6) / rate), Ehit: null, hits: [], idents: [], warned: [],
      n: own ? ++nScan : 0, seed: (Math.floor(e.t * 20) * 131 + (e.by || 0) * 7) | 0, done: false, slot: own ? 0 : 1,
    };
    sc.pos[1] = Math.max(0, R.terrain.heightAt(sc.pos[0], sc.pos[2]));
    sc.bolt = new Bolt({ hit: sc.pos, height: clamp(sc.r * .55, 1400, 2600), seed: sc.seed });
    sc.lead = Math.min(.34, (sc.Eexp - sc.E0) * .7);
    scans.push(sc);
    return sc;
  }
  /* another own scan still sweeping (the engine front is shared) */
  function frontBusy(me) { for (const s of scans) if (s !== me && s.own && s.Ehit !== null && S.clock - s.Ehit < TF + 1.4) return true; return false; }
  function nearOwn(p, d) {
    for (const u of sim.alive(game.side)) if (Math.hypot(u.pos[0] - p[0], u.pos[2] - p[2]) < d) return true;
    return false;
  }
  function hit(e) {
    let sc = null;
    for (const s of scans) if (!s.Ehit && s.side === e.side && s.by === e.by) { sc = s; break; }
    if (!sc) { sc = start(Object.assign({}, e, { delay: .01 })); if (!sc) return; }
    sc.Ehit = S.clock;
    if (sc.Eexp > sc.Ehit) sc.Eexp = sc.Ehit;
    sc.hits = e.hits || [];
    if (sc.own) {
      for (const id of sc.hits) {
        const u = sim.units.get(id); if (!u) continue;
        const d = Math.hypot(u.pos[0] - sc.pos[0], u.pos[2] - sc.pos[2]);
        sc.idents.push(identOf(sc, u, d));
      }
      sc.idents.sort((a, b) => a.tA - b.tA);
    } else {
      // the player's own units inside the radius: warned as the coral front passes them
      for (const u of sim.alive(game.side)) {
        if (u.aboard) continue;
        const d = Math.hypot(u.pos[0] - sc.pos[0], u.pos[2] - sc.pos[2]);
        if (d <= sc.r) sc.warned.push({ u, tA: frontT(d / sc.r) });
      }
    }
  }

  /* ---------- one identified unit ---------- */
  function identOf(sc, u, d) {
    const key = u.def.model, s = sampleOf(R, key);
    const c = sim.contact(game.side, u.id), cv = S.contacts.vis.get(u.id);
    const it = { u, id: u.id, key, s, tA: frontT(d / sc.r) + .05, conf0: cv ? cv.conf : c ? Math.min(c.conf, .5) : .2, rev: null, parts: [], xray: null, xrayDone: false, boxes: null };
    if (s) {
      // the front arrives from the strike: enter the model on that side, from above
      const dx = sc.pos[0] - u.pos[0], dz = sc.pos[2] - u.pos[2], l = Math.hypot(dx, dz) || 1, h = u.hdg, ch = Math.cos(h), sh = Math.sin(h);
      const mx = (ch * dx - sh * dz) / l, mz = (sh * dx + ch * dz) / l;
      const entry = [s.center[0] + mx * s.L * .5, s.mx[1], s.center[2] + mz * s.L * .5];
      it.rev = revealFrom(s, entry, sc.seed + u.id * 17, .62);
      it.parts = partsOf(u, s);
      it.boxes = it.parts.map(() => [0, 0, 0, 0, false]);
    }
    // what the X-ray finds inside (anatomy), drawn for a moment
    if (AN && AN.xrayOf) {
      try {
        const d0 = game.drawn.get(u.id), st = d0 && d0.st ? d0.st : u.st;
        const items = AN.xrayOf(key, st).filter(x => R.models.has(x.model));
        if (items.length) it.xray = items.map(x => ({ x, d: { key: x.model, R: null, T: [0, 0, 0], st: x.st || {}, tint: [LIME[0] / 255, LIME[1] / 255, LIME[2] / 255], tintK: .95, tintFace: .55, alpha: 1, bright: 1.2 } }));
      } catch (err) { it.xray = null; }
    }
    return it;
  }
  /* the parts to bracket: anatomy placards whose parts the unit model has, then the sim's part labels; the
     biggest few, in placard order */
  function partsOf(u, s) {
    const A = AN && AN.ANATOMY ? AN.ANATOMY[u.def.model] : null, ana = [], fb = [], used = new Set();
    const byName = new Map(); s.parts.forEach((p, i) => { if (p.i1 > p.i0) byName.set(p.name, i); });
    let maxId = 0;
    if (A) for (const en of A.parts) {
      if (!en.id) continue;
      maxId = Math.max(maxId, parseInt(en.id, 10) || 0);
      const pis = en.parts.filter(n => byName.has(n) && !used.has(n)).map(n => byName.get(n));
      if (!pis.length) continue;
      en.parts.forEach(n => used.add(n));
      ana.push({ pis, id: en.id, label: en.label, size: en.size || '' });
    }
    for (const [name, pi] of byName) {
      if (used.has(name)) continue;
      const P = u.def.parts && u.def.parts[name];
      if (!P) continue;
      const whole = name === 'hull' || name === 'chassis' || name === 'fuselage';
      fb.push({ pis: [pi], id: '', label: P.label, size: whole ? (Math.round(u.def.size[0] * 10) / 10) + ' m' : '' });
      used.add(name);
    }
    const ext = p => {
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (const pi of p.pis) { const P = s.parts[pi]; for (let i = P.i0; i < P.i1; i++) for (let c = 0; c < 3; c++) { const v = s.rest[i * 3 + c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; } }
      p.ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
    };
    ana.forEach(ext); fb.forEach(ext);
    // the placards first (the biggest six, in their order), then the largest of the rest
    const keepA = ana.slice().sort((a, b) => b.ext - a.ext).slice(0, 6);
    const out = ana.filter(p => keepA.includes(p));
    const rest = fb.sort((a, b) => b.ext - a.ext).slice(0, Math.max(0, 7 - out.length));
    for (const p of rest) { p.id = pad2(++maxId); out.push(p); }
    return out;
  }

  /* ---------- per frame ---------- */
  function update() {
    owns.clear();
    for (let i = scans.length - 1; i >= 0; i--) {
      const sc = scans[i];
      const age = sc.Ehit === null ? 0 : S.clock - sc.Ehit;
      if (sc.Ehit === null && S.clock - sc.E0 > 12) { scans.splice(i, 1); continue; }
      if (sc.Ehit !== null && age > TF + 1.4 && !sc.frontOff) { sc.frontOff = true; if (sc.own && !S.inspecting && !frontBusy(sc)) R.setScan(0, null); }
      const last = sc.idents.length ? sc.idents[sc.idents.length - 1].tA : 0;
      if (sc.Ehit !== null && age > Math.max(TF + 1.5, last + ID_HOLD + .8, 6.5)) {
        for (const it of sc.idents) { const d = game.drawn.get(it.id); if (d && it.xrayOn) { d.xray = 0; it.xrayOn = false; } }
        scans.splice(i, 1); continue;
      }
      if (sc.own && sc.Ehit !== null) for (const it of sc.idents) { const a = age - it.tA; if (a > -1 && a < ID_HOLD + .6) owns.add(it.id); }
    }
  }

  function draw3d() {
    const fx = R.fx, V = S.V, T = R.terrain;
    for (const sc of scans) {
      const pal = sc.own ? PAL_OWN : PAL_EN, P = sc.pos, B = sc.bolt;
      if (sc.Ehit === null) {
        // ---- the charge: rings drawn in to the point, the uplink from the scanner, then the leader
        const k = sat((S.clock - sc.E0) / Math.max(.05, sc.Eexp - sc.E0));
        for (let j = 0; j < 3; j++) {
          const f = ((k * 1.6 + j / 3) % 1), rr = sc.r * (.55 - .5 * f);
          S.ring(P[0], P[1], P[2], rr, S.dotOpt(pal.glow, .9 * Math.sin(Math.PI * f) * (1 - .25 * j), 3, j ? 1 : 2, 'over', T, 2));
        }
        const zc = Math.max(V.near, V.depth(P[0], P[1], P[2]));
        S.line(P[0], P[1], P[2], B.top[0], B.top[1], B.top[2], S.dotOpt(pal.glow, .3 + .45 * k, 5, 1, 'over'));
        S.ring(P[0], P[1], P[2], sc.r, S.dotOpt(pal.glow, .35 + .3 * k, 5, 1, 'over', T, 2));
        if (sc.own && sc.from) uplink(fx, V, sc, k, pal);
        const l0 = sc.Eexp - sc.lead;
        if (S.clock > l0) {
          const reach = sat((S.clock - l0) / sc.lead);
          B.draw(fx, V, reach, .5, pal, (S.clock - l0) * 1.3, true);
        }
        // a lime ground glow gathering under it
        P3[0] = P[0]; P3[1] = P[1] + 20; P3[2] = P[2];
        fx.glow(P3, Math.max(10, 80 * V.fl / zc * .002 * sc.r / 40), pal.glow, .05 + .12 * k);
        continue;
      }
      const tr = S.clock - sc.Ehit;
      // ---- the return stroke
      const I = Bolt.stroke(tr);
      if (tr < 1.2) {
        const l0 = sc.Eexp - sc.lead;
        B.draw(fx, V, 1, I, pal, tr < .14 ? (S.clock - l0) * 1.3 : 9, false);
        B.sparks(fx, tr, pal);
      }
      if (tr < .7 && I > .01) {
        const d = V.dist(P[0], P[1], P[2]);
        fx.lift(Math.min(.12, .1 * I * clamp(14000 / d, .35, 1)), pal.lift);
        R.light([P[0], P[1] + 60, P[2]], sc.r * .75, pal.light, 2.4 * I);
        const m = B.at(.45, [0, 0, 0]);
        R.light(m, B.H * .9, pal.light, 1.3 * I);
      }
      // the strike point: a flash ring on the ground
      if (tr < .5) S.ring(P[0], P[1], P[2], sc.r * .14 * outCubic(tr / .5), S.dotOpt(pal.core, .9 * (1 - tr / .5), 3, 2, 'over', T, 2));
      // ---- the front
      const fr = frontR(sc, tr), A = tr < TF ? 1 : 1 - sat((tr - TF) / 1.3);
      if (A > .005) {
        // the engine's scan front paints the world lime: only the player's own scans use it
        if (sc.own && !S.inspecting) {
          R.setScan(0, { mode: 'sphere', origin: P, front: fr, width: Math.max(25, sc.r * .035), decay: sc.r * .2, amp: A, rgb: pal.glow, reveal: .22 * A });
        }
        S.ring(P[0], P[1], P[2], fr, S.dotOpt(pal.glow, .9 * A, 3, 2, 'over', T, 2));
        S.ring(P[0], P[1], P[2], fr * .975, S.dotOpt(pal.glow, .3 * A, 5, 1, 'over', T, 2));
        S.ring(P[0], P[1], P[2], sc.r, S.dotOpt(pal.glow, .35 * A, 6, 1, 'over', T, 2));
        if (tr < TF) R.light([P[0], P[1] + 200, P[2]], sc.r * .6, pal.glow, .35 * (1 - tr / TF));
      }
      // ---- the units it passes
      if (sc.own) for (const it of sc.idents) identify3d(fx, V, sc, it, tr - it.tA);
      else for (const w of sc.warned) warn3d(fx, V, sc, w, tr - w.tA);
    }
  }
  /* the dotted uplink from the scanner up and over to the top of the channel */
  function uplink(fx, V, sc, k, pal) {
    const u = sim.units.get(sc.by), a = u && u.alive ? game.unitPose(u).pos : sc.from, b = sc.bolt.top;
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]), apex = Math.max(b[1], a[1]) + L * .12;
    const n = 90, al = .55 * (1 - .4 * k);
    for (let i = 0; i <= n; i++) {
      const t = i / n; if (((t * 40 - k * 6) % 1 + 1) % 1 > .55) continue;
      const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
      const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * apex + t * t * b[1];
      if (V.depth(x, y, z) < V.near) continue;
      fx.dotXYZ(x, y, z, 1, pal.glow[0], pal.glow[1], pal.glow[2], al, 'over');
    }
    // the scanner lights up: it has shown itself
    if (u && u.alive) {
      const zc = Math.max(V.near, V.depth(a[0], a[1], a[2]));
      S.ring(a[0], a[1], a[2], Math.max(u.def.size[0], 18 * zc / V.fl) * (1 + (S.clock * 1.5 % 1)), S.dotOpt(pal.glow, .7 * (1 - (S.clock * 1.5 % 1)), 3, 1, 'over'));
    }
  }

  const M9 = new Float32Array(9);
  function unitXf(u, it) {
    const d = game.drawn.get(u.id);
    if (d && d.R && d.T) return d;
    const p = game.unitPose(u), c = Math.cos(p.hdg), s = Math.sin(p.hdg);
    M9[0] = c; M9[1] = 0; M9[2] = s; M9[3] = 0; M9[4] = 1; M9[5] = 0; M9[6] = -s; M9[7] = 0; M9[8] = c;
    it._fake = it._fake || { R: M9, T: [0, 0, 0], st: {} };
    it._fake.R = M9; it._fake.T[0] = p.pos[0]; it._fake.T[1] = p.pos[1]; it._fake.T[2] = p.pos[2]; it._fake.st = u.st;
    return it._fake;
  }
  function identify3d(fx, V, sc, it, a) {
    const u = it.u;
    if (a < 0 || a > ID_HOLD + 1 || !it.s) return;
    const d = unitXf(u, it), M = d.R, Tt = d.T, s = it.s, rest = s.rest, n = s.n;
    const zc = Math.max(V.near, V.depth(Tt[0], Tt[1], Tt[2])), px = s.L * V.fl / zc;
    if (!V.vis(Tt[0], Tt[1], Tt[2], s.L)) { xrayOff(it); return; }
    // light: the unit flares
    if (a < .45) R.light([Tt[0], Tt[1] + s.L * .3, Tt[2]], Math.max(s.L * 2.5, 60), LIME, 1.6 * (1 - a / .45));
    // tendrils and the lime flare over the unit's points
    if (a < 2.4 && px > 3) {
      const rev = it.rev, stride = Math.max(1, Math.floor(n / clamp(px * 8, 60, n))), big = px > 90;
      for (let i = 0; i < n; i += stride) {
        const lt = rev ? rev.pt[i] : 0; if (a < lt) continue;
        const age = a - lt, k = Math.exp(-age * 7), settle = Math.exp(-Math.max(0, a - .75) * 1.6);
        const al = Math.max(k, .75 * settle);
        if (al < .02) continue;
        const j = i * 3, x0 = rest[j], y0 = rest[j + 1], z0 = rest[j + 2];
        const x = M[0] * x0 + M[1] * y0 + M[2] * z0 + Tt[0], y = M[3] * x0 + M[4] * y0 + M[5] * z0 + Tt[1], z = M[6] * x0 + M[7] * y0 + M[8] * z0 + Tt[2];
        const w = k;
        fx.dotXYZ(x, y, z, big ? 2 : 1, LIME[0] + (255 - LIME[0]) * w, LIME[1] + (255 - LIME[1]) * w, LIME[2] + (230 - LIME[2]) * w, Math.min(1, al * 1.05), 'over');
      }
    } else if (a < 2.4) { fx.dotXYZ(Tt[0], Tt[1] + 2, Tt[2], 3, LIME[0], LIME[1], LIME[2], 1 - a / 2.4, 'over'); }
    // the X-ray: the shell thins, what is inside shows
    const xk = ss(.15, .5, a) * (1 - ss(1.8, 2.6, a));
    const dd = game.drawn.get(u.id);
    if (dd && xk > 0 && u.alive) { dd.xray = .85 * xk; it.xrayOn = true; }
    else xrayOff(it);
    if (it.xray && xk > .02 && dd && dd.R) {
      for (const o of it.xray) {
        const X = o.x.xf, D = o.d, Mx = X.R, Tx = X.T, Md = dd.R;
        const Rr = D.R || (D.R = new Array(9));
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) Rr[r * 3 + c] = Md[r * 3] * Mx[c] + Md[r * 3 + 1] * Mx[3 + c] + Md[r * 3 + 2] * Mx[6 + c];
        D.T[0] = Md[0] * Tx[0] + Md[1] * Tx[1] + Md[2] * Tx[2] + dd.T[0];
        D.T[1] = Md[3] * Tx[0] + Md[4] * Tx[1] + Md[5] * Tx[2] + dd.T[1];
        D.T[2] = Md[6] * Tx[0] + Md[7] * Tx[1] + Md[8] * Tx[2] + dd.T[2];
        D.alpha = xk; D.hdg = undefined; D.pitch = undefined; D.roll = undefined;
        R.draw(D);
      }
    }
  }
  function xrayOff(it) { if (!it.xrayOn) return; const d = game.drawn.get(it.id); if (d) d.xray = 0; it.xrayOn = false; }
  function warn3d(fx, V, sc, w, a) {
    const u = w.u; if (a < 0 || a > 5 || !u.alive) return;
    const p = game.unitPose(u).pos;
    if (a < .4) R.light([p[0], p[1] + 10, p[2]], Math.max(u.def.size[0] * 3, 60), CORAL, 1.2 * (1 - a / .4));
    const zc = Math.max(V.near, V.depth(p[0], p[1], p[2])), r0 = Math.max(u.def.size[0] * .8, 12 * zc / V.fl);
    const k = (a * 1.2) % 1;
    S.ring(p[0], p[1] + 1, p[2], r0 * (1 + k), S.dotOpt(CORAL, .8 * (1 - k) * (1 - sat((a - 4) / 1)), 3, 1, 'over'));
  }

  /* ---------- 2D ---------- */
  function draw2d(ov, TL) {
    const cam = R.camera, ctx = ov.ctx;
    for (const sc of scans) {
      const P = sc.pos;
      if (sc.Ehit === null) {
        if (cam.project(P, q) && sc.own) TL.add({ x: q[0] + 18, y: q[1] - 44, ax: q[0], ay: q[1], id: 'SCAN ' + pad2(sc.n), label: 'STRIKE', value: (sc.r / 1000).toFixed(1) + ' KM', kind: 'lime', size: 10.5, pri: 5 });
        continue;
      }
      const tr = S.clock - sc.Ehit;
      if (sc.own) {
        // summary at the strike point
        if (tr < 6.5 && cam.project(P, q)) {
          const n = sc.hits.length, a = sat(tr / .3) * (1 - sat((tr - 5.5) / 1));
          TL.add({ x: q[0] + 18, y: q[1] - 44, ax: q[0], ay: q[1], id: 'SCAN ' + pad2(sc.n), label: n ? n + ' IDENTIFIED' : 'NO RETURNS', value: tr < TF ? 'SWEEP' : '', kind: n ? 'lime' : 'ghost', a, size: 10.5, pri: 5 });
        }
        for (const it of sc.idents) identify2d(ov, ctx, TL, sc, it, tr - it.tA);
      } else {
        if (tr < 5.5 && cam.project(P, q)) {
          const a = sat(tr / .2) * (1 - sat((tr - 4.5) / 1)) * (Math.sin(tr * 14) > -.2 ? 1 : .55);
          TL.add({ x: q[0] + 18, y: q[1] - 44, ax: q[0], ay: q[1], id: '!', label: 'HOSTILE SCAN', value: (sc.r / 1000).toFixed(1) + ' KM', kind: 'coral', a, size: 10.5, pri: 6 });
        }
        for (const w of sc.warned) {
          const a = tr - w.tA; if (a < 0 || a > 5 || !w.u.alive) continue;
          const p = game.unitPose(w.u).pos; if (!cam.project(p, q)) continue;
          const al = sat(a / .15) * (1 - sat((a - 4) / 1));
          TL.add({ x: q[0] + 16, y: q[1] - 34, ax: q[0], ay: q[1] - 4, id: 'SCANNED', label: SHORT[w.u.type] || w.u.def.name, value: '', kind: 'coral', a: al, size: 10, pri: 4 });
        }
      }
    }
  }
  function identify2d(ov, ctx, TL, sc, it, a) {
    const u = it.u, cam = R.camera;
    if (a < 0 || a > ID_HOLD + .6 || !it.s) return;
    const out = 1 - sat((a - ID_HOLD) / .6);
    const d = unitXf(u, it), M = d.R, Tt = d.T, s = it.s;
    if (!cam.project(Tt, q)) return;
    const zc = q[2], px = s.L * cam.fl / zc;
    // tendril links: parent -> child segments whose child just lit (p1's live branches)
    if (it.rev && a < .9 && px > 25) {
      const g = s.graph, nodes = g.nodes, nt = it.rev.nodeT, par = it.rev.par;
      ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(210,255,120,.85)'; ctx.beginPath();
      const qa = [0, 0, 0], qb = [0, 0, 0], wa = [0, 0, 0];
      for (let i = 0; i < nodes.length; i++) {
        const tn = nt[i]; if (a < tn || a > tn + .16 || par[i] < 0) continue;
        const pa = nodes[i].p, pb = nodes[par[i]].p;
        if (!cam.project(xf(M, Tt, pa, wa), qa)) continue;
        if (!cam.project(xf(M, Tt, pb, wa), qb)) continue;
        ctx.moveTo(qb[0], qb[1]); ctx.lineTo(qa[0], qa[1]);
      }
      ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
    }
    // part brackets, one after another
    const conf = it.conf0 + (.97 - it.conf0) * outCubic((a - .3) / .9);
    const c = sim.contact(game.side, u.id);
    const id = c ? c.track : 'TRK ' + pad2(u.id);
    if (px > 60) {
      boxes(it, d);
      let k = 0;
      for (let i = 0; i < it.parts.length; i++) {
        const p = it.parts[i], b = it.boxes[i];
        const t0 = .55 + k * .22;
        if (!b[4]) continue;
        k++;
        const al = sat((a - t0) / .25) * out;
        if (al <= .01) continue;
        const g = 1 + .35 * (1 - outCubic((a - t0) / .45));
        const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, hw = (b[2] - b[0]) / 2 * g, hh = (b[3] - b[1]) / 2 * g;
        BX[0] = cx - hw; BX[1] = cy - hh; BX[2] = cx + hw; BX[3] = cy + hh;
        ov.bracket(BX, '#C6F432', al, 2, 7);
        TL.add({ x: BX[2] + 12, y: BX[1] - 24, ax: BX[2], ay: BX[1], id: p.id, label: p.label, value: p.size, kind: 'lime', a: al, size: 9.5, pri: 3 });
      }
    }
    // the unit: bracket + its track tag counting up to 0.97
    const al = sat((a - .25) / .3) * out;
    if (al > .01) {
      const bb = R.screenBox(d.key ? d : { key: u.def.model, R: M, T: Tt, st: u.st });
      if (bb && px > 14) {
        ov.bracket(bb, '#FF6A3D', al, 5, 12);
        TL.add({ x: bb[0] - 5, y: bb[1] - 5 - 21, id, label: TRACK[u.type] || u.def.name, value: conf.toFixed(2), kind: a < 1.3 && Math.sin(a * 24) > 0 ? 'lime' : 'coral', a: al, size: 10.5, pri: 8, lead: false });
      } else {
        ov.mark(q[0], q[1], 9, '#C6F432', al);
        TL.add({ x: q[0] + 16, y: q[1] - 30, ax: q[0], ay: q[1], id, label: TRACK[u.type] || u.def.name, value: conf.toFixed(2), kind: a < 1.3 && Math.sin(a * 24) > 0 ? 'lime' : 'coral', a: al, size: 10.5, pri: 8 });
      }
    }
  }
  const BX = [0, 0, 0, 0];
  function xf(M, T, p, o) {
    o[0] = M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + T[0]; o[1] = M[3] * p[0] + M[4] * p[1] + M[5] * p[2] + T[1]; o[2] = M[6] * p[0] + M[7] * p[1] + M[8] * p[2] + T[2];
    return o;
  }
  /* screen boxes of the chosen parts, from their points through part.xf(st) and the instance */
  function boxes(it, d) {
    const s = it.s, cam = R.camera, st = d.st || {}, M = d.R, Tt = d.T, w = [0, 0, 0];
    const X = new Map();
    for (let i = 0; i < it.parts.length; i++) {
      const p = it.parts[i], b = it.boxes[i];
      b[0] = 1e9; b[1] = 1e9; b[2] = -1e9; b[3] = -1e9; b[4] = false;
      for (const pi of p.pis) {
        const P = s.parts[pi];
        if (P.part.show) { let sh = true; try { sh = P.part.show(st); } catch (e) { /* */ } if (!sh) continue; }
        let Xp = X.get(pi);
        if (Xp === undefined) { try { Xp = P.part.xf ? P.part.xf(st) : null; } catch (e) { Xp = null; } X.set(pi, Xp); }
        const step = Math.max(1, Math.floor((P.i1 - P.i0) / 60));
        for (let i = P.i0; i < P.i1; i += step) {
          let x = s.loc[i * 3], y = s.loc[i * 3 + 1], z = s.loc[i * 3 + 2];
          if (Xp) { const R0 = Xp.R, T0 = Xp.T, x1 = R0[0] * x + R0[1] * y + R0[2] * z + T0[0], y1 = R0[3] * x + R0[4] * y + R0[5] * z + T0[1], z1 = R0[6] * x + R0[7] * y + R0[8] * z + T0[2]; x = x1; y = y1; z = z1; }
          w[0] = M[0] * x + M[1] * y + M[2] * z + Tt[0]; w[1] = M[3] * x + M[4] * y + M[5] * z + Tt[1]; w[2] = M[6] * x + M[7] * y + M[8] * z + Tt[2];
          if (!cam.project(w, q)) continue;
          b[4] = true;
          if (q[0] < b[0]) b[0] = q[0]; if (q[1] < b[1]) b[1] = q[1]; if (q[0] > b[2]) b[2] = q[0]; if (q[1] > b[3]) b[3] = q[1];
        }
      }
      if (b[4] && (b[2] - b[0] < 3 && b[3] - b[1] < 3)) b[4] = false;
    }
  }

  /* ---------- the targeting reticle while the orders system aims a scan ---------- */
  function scanner(x, z, list) {
    let best = null, bd = 1e18;
    for (const u of list) {
      if (!u.alive || u.off.scan) continue;
      const d = Math.hypot(u.pos[0] - x, u.pos[2] - z), reach = u.def.scan.reach, cd = u.cooldowns.scan || 0;
      const score = d / reach + cd * .05 + (d > reach && u.def.speed === 0 ? 100 : 0);
      if (score < bd) { bd = score; best = u; }
    }
    return best;
  }
  const aim = { on: false, w: null, u: null, inReach: false, dist: 0, n: 0, ids: [] };
  function reticle3d() {
    const o = game.getSystem('orders'), m = o && o.mode;
    aim.on = !!(m && m.kind === 'scan' && game.mouse.in);
    if (!aim.on) return;
    const cam = R.camera, fx = R.fx, V = S.V, T = R.terrain;
    const w = aim.w = cam.pickGround(game.mouse.x, game.mouse.y);
    if (!w) { aim.on = false; return; }
    const u = aim.u = scanner(w[0], w[2], m.units);
    if (!u) { aim.on = false; return; }
    const sc = u.def.scan, p = game.unitPose(u).pos;
    aim.dist = Math.hypot(p[0] - w[0], p[2] - w[2]); aim.inReach = aim.dist <= sc.reach;
    const col = aim.inReach ? LIME : CORAL;
    // rotating ticks on the radius, the strike axis, the contacts it would catch
    const rot = S.clock * .6;
    for (let k = 0; k < 8; k++) {
      const b = rot + k * TAU / 8, sb = Math.sin(b), cb = Math.cos(b);
      S.line(w[0] + sb * sc.r * .9, 0, w[2] + cb * sc.r * .9, w[0] + sb * sc.r * 1.06, 0, w[2] + cb * sc.r * 1.06, S.dotOpt(col, .85, 3, 2, 'over', T, 3));
    }
    const pulse = (S.clock * .8) % 1;
    S.ring(w[0], w[1], w[2], sc.r * pulse, S.dotOpt(col, .45 * (1 - pulse), 5, 1, 'over', T, 2));
    const H = clamp(sc.r * .55, 1400, 2600);
    S.line(w[0], w[1], w[2], w[0], w[1] + H, w[2], S.dotOpt(col, .5, 5, 1, 'over'));
    P3[0] = w[0]; P3[1] = w[1] + H; P3[2] = w[2];
    fx.glow(P3, 10, col, .5);
    aim.n = 0; aim.ids.length = 0;
    const side = sim.sides[game.side];
    if (side) for (const c of side.contacts.values()) {
      if (c.dom === 'air') continue;
      if (Math.hypot(c.pos[0] - w[0], c.pos[2] - w[2]) <= sc.r) { aim.n++; aim.ids.push(c.unitId); }
    }
  }
  function reticle2d(ov, TL) {
    if (!aim.on || !aim.u) return;
    const cam = R.camera, x = game.mouse.x, y = game.mouse.y, u = aim.u;
    const cd = Math.max(sim.sides[game.side].scanCd || 0, u.cooldowns.scan || 0);
    const col = aim.inReach ? '#C6F432' : '#FF6A3D';
    ov.text(x + 16, y + 62, `${SHORT[u.type] || u.def.name} · ${(aim.dist / 1000).toFixed(1)} / ${(u.def.scan.reach / 1000).toFixed(0)} KM${aim.inReach ? '' : ' · OUT OF REACH'}`, { size: 10, col, a: .95 });
    ov.text(x + 16, y + 76, `R ${(u.def.scan.r / 1000).toFixed(1)} KM · ${aim.n} CONTACT${aim.n === 1 ? '' : 'S'} INSIDE${cd > 0 ? ` · READY IN ${Math.ceil(cd)} S` : ''}`, { size: 10, col: cd > 0 ? '#FF6A3D' : 'rgba(255,255,255,.7)', a: .9 });
    // corner marks on what it would catch
    for (const id of aim.ids) {
      const cv = S.contacts.vis.get(id), un = sim.units.get(id);
      const p = cv && cv.state !== 'track' ? cv.ctr : un ? game.unitPose(un).pos : null;
      if (!p || !cam.project(p, q)) continue;
      const s = 9;
      ov.bracket([q[0] - s, q[1] - s, q[0] + s, q[1] + s], '#C6F432', .9, 2, 5);
    }
  }

  return {
    scans, owns, update, draw3d, draw2d, reticle3d, reticle2d,
    onEvent(e) {
      if (e.type !== 'scan') return;
      if (e.phase === 'start') start(e);
      else if (e.phase === 'hit') hit(e);
    },
    clearFronts() { R.setScan(0, null); R.setScan(1, null); },
  };
}
