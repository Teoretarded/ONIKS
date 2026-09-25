/* The LIGHTNING SCAN (p1_strike, pa_picture, pc_anatomy): the game's signature verb.
   'scan' start: a lime charge gathers at the scan point, an uplink arcs from the scanner, and in the last moment
   a branching leader steps down from high above with a pour of dots running down the channel. Meanwhile the
   models of what is likely inside are warmed (cutaways, tendril graphs) so the hit never stalls.
   'scan' hit: the return stroke (a white-lime core with a lime breath, flickering twice), the frame lifts, a
   strong light shows the ground round the strike, sparks jump. Then CHAIN LIGHTNING: the bolt forks to every hull
   inside the ring, each fork racing low over the sea / ground and climbing onto its hull, striking it with its own
   return stroke, flash and sparks; when the last fork lands the whole scan area is lit lime for a frame (brighter
   the more hulls it caught), and a lime sphere front sweeps out through the radius.
   Each struck hull (for ~4 s, in the normal world view): lime tendrils race over its points from where the fork
   hit (p1's branching reveal), it flares, the X-ray flickers on (the shell thins; VLS canisters, rounds in their
   containers show), film-style lime part boxes that fit the parts pop one after another with their placards
   decoding out of glyph noise (02 MK 45 MOD 4 · 5-INCH/62), a white box round the whole hull, the track tag
   decoding from ? 0.31 to DDG · ARLEIGH BURKE 0.97, then it settles into the plain coral track tag.
   A hull too small to read its parts on screen (< ~140 px) keeps its tag and bracket, and gets the scan inset (inset.js).
   An enemy scan on the player's units is the same in coral-white: forks to each unit, a warning.
   Also: the scan targeting reticle while the orders system aims a scan (X). */
import { LIME, CORAL, WH, HOT, TAU, sat, clamp, ss, outCubic, outExpo, pad2, rng, tagW } from './core.js';
import { Bolt } from './bolt.js';
import { Fork, reachOf } from './chain.js';
import { sampleOf, revealFrom } from './samples.js';
import { decode, flicker, seedOf } from './decode.js';
import { TRACK, SHORT } from '../../game/labels.js';

const TF = 2.3;                              // s for the front to reach the edge of the radius
const PAL_OWN = { core: HOT, glow: LIME, spark: [230, 255, 170], light: [225, 255, 170], lift: [226, 250, 200] };
const PAL_EN = { core: [255, 244, 236], glow: CORAL, spark: [255, 200, 170], light: [255, 214, 190], lift: [255, 224, 212] };
const ID_END = 4.4;                          // s after its fork lands a hull's payoff is over
const BIG = 140;                             // px: a hull this long on screen gets its part boxes in the world (else the inset)
const MAX_FORKS = 12;

export function createScan(S, AN, inset) {
  const { game } = S, sim = game.sim, R = game.R;
  const scans = [];
  const owns = new Set();                    // unit ids whose tag the scan owns right now
  const revCache = new Map();                // model key -> the tendril reveal from its strike point
  let nScan = 0;
  const q = [0, 0, 0], P3 = [0, 0, 0], E3 = [0, 0, 0];

  const frontR = (sc, a) => sc.r * (1 - Math.pow(1 - clamp(a / TF, 0, 1), 2));

  function start(e) {
    const own = e.side === game.side;
    if (!own && !nearOwn(e.pos, Math.max(e.r * 2.5, 15000))) return null;
    const rate = game.paused ? 1 : Math.max(1, game.timeRate);
    const sc = {
      own, side: e.side, by: e.by, from: e.from ? e.from.slice() : null, pos: e.pos.slice(), r: e.r || 4000,
      E0: S.clock, Eexp: S.clock + Math.max(.18, (e.delay || 1.6) / rate), Ehit: null, hits: [], idents: [], warned: [],
      n: own ? ++nScan : 0, seed: (Math.floor(e.t * 20) * 131 + (e.by || 0) * 7) | 0, done: false, tAll: .3, areaI: 0, warm: null,
    };
    sc.pos[1] = Math.max(0, R.terrain.heightAt(sc.pos[0], sc.pos[2]));
    sc.bolt = new Bolt({ hit: sc.pos, height: clamp(sc.r * .55, 1400, 2600), seed: sc.seed });
    sc.lead = Math.min(.34, (sc.Eexp - sc.E0) * .7);
    // warm what the scan may catch while the charge gathers (one model a frame: its tendril graph, its cutaway):
    // the contacts near the strike first, then every kind of hull the other side has (a cache, nothing shown)
    if (own) {
      const keys = new Set(), side = sim.sides[game.side];
      if (side) for (const c of side.contacts.values()) {
        if (c.dom === 'air') continue;
        if (Math.hypot(c.pos[0] - sc.pos[0], c.pos[2] - sc.pos[2]) > sc.r * 1.3) continue;
        const u = sim.units.get(c.unitId); if (u) keys.add(u.def.model);
      }
      for (const u of sim.alive(game.enemy)) if (!u.aboard && u.def.domain !== 'air') keys.add(u.def.model);
      sc.warm = [...keys].filter(k => !revCache.has(k));
    }
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
    const list = [];
    if (sc.own) {
      for (const id of sc.hits) {
        const u = sim.units.get(id); if (!u) continue;
        list.push({ u, d: Math.hypot(u.pos[0] - sc.pos[0], u.pos[2] - sc.pos[2]) });
      }
    } else {
      // the player's own units inside the radius: struck by the coral forks and warned
      for (const u of sim.alive(game.side)) {
        if (u.aboard) continue;
        const d = Math.hypot(u.pos[0] - sc.pos[0], u.pos[2] - sc.pos[2]);
        if (d <= sc.r) list.push({ u, d });
      }
    }
    // the forks land nearest first; a few more hulls fork a little later
    list.sort((a, b) => a.d - b.d);
    let tAll = 0;
    for (let k = 0; k < list.length; k++) {
      const { u, d } = list[k];
      const tF = Math.min(.95, .1 + .42 * d / sc.r + .05 * k);
      if (sc.own) sc.idents.push(identOf(sc, u, d, tF, k));
      else sc.warned.push({ u, tA: tF, fork: null, k });
      tAll = Math.max(tAll, tF);
    }
    sc.tAll = list.length ? tAll + .04 : .3;
    sc.areaI = list.length ? Math.min(1.9, .75 + .22 * list.length) : .4;
    // the inset for the hulls too small to read where the player looks (the most valuable first)
    if (sc.own && inset) {
      const small = sc.idents.filter(it => it.s && it.small).map(it => ({ u: it.u, it, tF: it.tF }));
      small.sort((a, b) => (value(b.u) - value(a.u)) || (a.tF - b.tF));
      if (small.length) inset.schedule(sc, small, sc.Ehit);
    }
  }
  const value = u => u.def.hq ? 3 : u.def.domain === 'sea' ? (u.def.size[0] > 200 ? 2.5 : 2) : u.def.scan ? 1.5 : 1;

  /* ---------- one struck hull ---------- */
  function identOf(sc, u, d, tF, k) {
    const key = u.def.model, s = sampleOf(R, key);
    const c = sim.contact(game.side, u.id), cv = S.contacts.vis.get(u.id);
    const it = {
      u, id: u.id, key, s, tF, k, conf0: clamp(cv ? cv.conf : c ? Math.min(c.conf, .5) : .2, .12, .6), rev: null, parts: [], xray: null, xrayOn: false,
      fork: null, small: true, seed: (sc.seed + u.id * 17) | 0, strike: null, SP: null, px: 0,
    };
    if (s) {
      it.strike = strikeOf(s);
      it.rev = revealOf(s, key);
      it.parts = partsOf(u, s, it.rev);
      // is it big enough on screen now to read its parts in the world?
      const p = game.unitPose(u).pos;
      const zc = S.V.depth(p[0], p[1], p[2]);
      it.px = zc > S.V.near ? s.L * S.V.fl / zc : 0;
      it.small = !(it.px >= BIG && S.V.vis(p[0], p[1], p[2], s.L * .5) && onScreen(p));
      // sparks where its fork lands
      const rr = rng(it.seed + 5), SP = it.SP = new Float32Array(70 * 4), sz = Math.max(4, s.L * .12);
      for (let i = 0; i < 70; i++) { const a = rr() * TAU, uu = rr() * 2 - 1, v = sz * (.4 + rr() * 1.4), h = Math.sqrt(1 - uu * uu); SP[i * 4] = Math.cos(a) * h * v; SP[i * 4 + 1] = Math.abs(uu) * v * .8 + sz * .2; SP[i * 4 + 2] = Math.sin(a) * h * v; SP[i * 4 + 3] = .35 + rr() * .6; }
    }
    return it;
  }
  /* what the X-ray finds inside (anatomy), built the first time it is needed (only hulls big enough to read it) */
  function xrayItems(it) {
    if (it.xray !== null || !AN || !AN.xrayOf) return it.xray || null;
    it.xray = false;
    try {
      const d0 = game.drawn.get(it.u.id), st = d0 && d0.st ? d0.st : it.u.st;
      const items = AN.xrayOf(it.key, st).filter(x => R.models.has(x.model));
      if (items.length) it.xray = items.map(x => ({ x, d: { key: x.model, R: null, T: [0, 0, 0], st: x.st || {}, tint: [LIME[0] / 255, LIME[1] / 255, LIME[2] / 255], tintK: .95, tintFace: .55, alpha: 1, bright: 1.2 } }));
    } catch (err) { it.xray = false; }
    return it.xray || null;
  }
  function onScreen(p) { return R.camera.project(p, q) && q[0] > 0 && q[1] > 0 && q[0] < R.camera.W && q[1] < R.camera.H; }
  /* where a fork strikes a model: the highest point near the middle (the mast, the island, the launcher) */
  function strikeOf(s) {
    if (s.strikePt) return s.strikePt;
    const c = s.center, hx = (s.mx[0] - s.mn[0]) * .35 + .5, hz = (s.mx[2] - s.mn[2]) * .3 + .5;
    let best = null, by = -1e9;
    for (let i = 0; i < s.n; i++) {
      const x = s.rest[i * 3], y = s.rest[i * 3 + 1], z = s.rest[i * 3 + 2];
      if (Math.abs(x - c[0]) > hx || Math.abs(z - c[2]) > hz) continue;
      if (y > by) { by = y; best = [x, y, z]; }
    }
    s.strikePt = best || [c[0], s.mx[1], c[2]];
    return s.strikePt;
  }
  /* the tendril reveal from the strike point: one per model (a Dijkstra over its voxel graph) */
  function revealOf(s, key) {
    let r = revCache.get(key);
    if (!r) { r = revealFrom(s, strikeOf(s), 71 + key.length * 13, .62); revCache.set(key, r); }
    return r;
  }
  /* the parts to box: anatomy placards whose parts the unit model has, then the sim's part labels; never the whole
     hull; in the order the tendrils reach them (p1: a part is boxed once most of its returns are in) */
  function partsOf(u, s, rev) {
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
      fb.push({ pis: [pi], id: '', label: P.label, size: '' });
      used.add(name);
    }
    const ext = p => {
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], ts = [];
      for (const pi of p.pis) {
        const P = s.parts[pi];
        for (let i = P.i0; i < P.i1; i++) { for (let c = 0; c < 3; c++) { const v = s.rest[i * 3 + c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; } if (rev) ts.push(rev.pt[i]); }
      }
      p.ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
      p.mn = new Float32Array(mn); p.mx = new Float32Array(mx);
      p.dyn = p.pis.some(pi => !!s.parts[pi].part.xf);
      ts.sort((a, b) => a - b);
      p.tIn = ts.length ? ts[Math.floor(ts.length * .85)] : .3;
      p.seed = seedOf(p.label);
    };
    ana.forEach(ext); fb.forEach(ext);
    const ok = p => p.ext < s.L * .72 && p.ext > s.L * .02;
    const keepA = ana.filter(ok).sort((a, b) => b.ext - a.ext).slice(0, 6);
    const out = ana.filter(p => keepA.includes(p));
    const rest = fb.filter(ok).sort((a, b) => b.ext - a.ext).slice(0, Math.max(0, 6 - out.length));
    for (const p of rest) { p.id = pad2(++maxId); out.push(p); }
    // pop order: as the tendrils reach them, at least .14 s apart
    out.sort((a, b) => a.tIn - b.tIn);
    out.forEach((p, k) => { p.t0 = Math.max(.42 + p.tIn * .6, .5 + k * .14); });
    // size rank: a hull that is only just big enough on screen shows its four biggest parts
    out.slice().sort((a, b) => b.ext - a.ext).forEach((p, k) => { p.rank = k; });
    return out;
  }

  /* ---------- per frame ---------- */
  function update() {
    owns.clear();
    for (let i = scans.length - 1; i >= 0; i--) {
      const sc = scans[i];
      const age = sc.Ehit === null ? 0 : S.clock - sc.Ehit;
      if (sc.Ehit === null && (S.clock - sc.E0 > 12 || S.clock - sc.Eexp > 3)) { scans.splice(i, 1); continue; }
      // the charge: warm what the scan will catch (tendril graphs, one model a frame; cutaways for the inset)
      if (sc.Ehit === null && sc.warm && sc.warm.length) {
        const key = sc.warm.shift();
        const s = sampleOf(R, key); if (s) revealOf(s, key);
        if (inset) inset.warm(key);
      }
      if (sc.Ehit !== null && age > TF + 1.4 && !sc.frontOff) { sc.frontOff = true; if (sc.own && !S.inspecting && !frontBusy(sc)) R.setScan(0, null); }
      let last = 0;
      for (const it of sc.idents) last = Math.max(last, it.tF);
      if (sc.Ehit !== null && age > Math.max(TF + 1.5, last + ID_END + .3, 6.5)) {
        for (const it of sc.idents) { const d = game.drawn.get(it.id); if (d && it.xrayOn) { d.xray = 0; it.xrayOn = false; } }
        scans.splice(i, 1); continue;
      }
      if (sc.own && sc.Ehit !== null) for (const it of sc.idents) { const a = age - it.tF; if (a > -1.2 && a < ID_END) owns.add(it.id); }
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
      if (tr < .5) S.ring(P[0], P[1], P[2], sc.r * .14 * outCubic(tr / .5), S.dotOpt(pal.core, .9 * (1 - tr / .5), 3, 2, 'over', T, 2));
      // ---- the whole scan area lit for a frame when the last fork lands (brighter the more it caught)
      const ta = tr - sc.tAll;
      if (ta > 0 && ta < .12) {
        const k = ta < .045 ? 1 : 1 - (ta - .045) / .075;
        const ek = sc.own ? 1 : .55;
        R.light([P[0], P[1] + sc.r * .12, P[2]], sc.r * 1.45, pal.glow, sc.areaI * 1.6 * k * ek);
        const d = V.dist(P[0], P[1], P[2]);
        fx.lift(Math.min(.16, (.05 + .025 * sc.areaI) * k * ek * clamp(16000 / d, .4, 1)), pal.glow);
        S.ring(P[0], P[1], P[2], sc.r, S.dotOpt(pal.core, k, 3, 2, 'over', T, 2));
        if (sc.own && !S.inspecting) R.setScan(0, { mode: 'sphere', origin: P, front: sc.r * 1.02, width: sc.r * .08, decay: sc.r * .6, amp: k, rgb: pal.glow, reveal: .6 * k });
      }
      // ---- the front
      const fr = frontR(sc, tr), A = tr < TF ? 1 : 1 - sat((tr - TF) / 1.3);
      if (A > .005) {
        if (sc.own && !S.inspecting && !(ta > 0 && ta < .12)) {
          R.setScan(0, { mode: 'sphere', origin: P, front: fr, width: Math.max(25, sc.r * .035), decay: sc.r * .2, amp: A, rgb: pal.glow, reveal: .22 * A });
        }
        S.ring(P[0], P[1], P[2], fr, S.dotOpt(pal.glow, .9 * A, 3, 2, 'over', T, 2));
        S.ring(P[0], P[1], P[2], fr * .975, S.dotOpt(pal.glow, .3 * A, 5, 1, 'over', T, 2));
        S.ring(P[0], P[1], P[2], sc.r, S.dotOpt(pal.glow, .35 * A, 6, 1, 'over', T, 2));
        if (tr < TF) R.light([P[0], P[1] + 200, P[2]], sc.r * .6, pal.glow, .35 * (1 - tr / TF));
      }
      // ---- the forks and the hulls they strike
      if (sc.own) { for (const it of sc.idents) { fork3d(fx, V, sc, it, tr, pal); identify3d(fx, V, sc, it, tr - it.tF); } }
      else for (const w of sc.warned) { fork3d(fx, V, sc, w, tr, pal); warn3d(fx, V, sc, w, tr - w.tA); }
    }
  }
  /* the fork from the strike point to a hull: leader racing out, its own return stroke when it lands, sparks */
  function fork3d(fx, V, sc, it, tr, pal) {
    const tF = it.tF !== undefined ? it.tF : it.tA;
    if (tr < .02 || tr > tF + .9) return;
    if (it.k !== undefined && it.k >= MAX_FORKS) return;
    const u = it.u;
    if (!hullPoint(it, E3)) return;
    if (!it.fork) {
      const land = u.def.domain === 'land';
      it.fork = new Fork({ from: sc.pos, to: E3, seed: (sc.seed * 7 + u.id * 131) | 0, ground: land ? (x, z) => R.terrain.heightAt(x, z) : null, climb: E3[1] - (land ? Math.max(0, R.terrain.heightAt(E3[0], E3[2])) : 0) });
    }
    // cull the whole fork when neither end is near the view
    const mx = (sc.pos[0] + E3[0]) / 2, mz = (sc.pos[2] + E3[2]) / 2;
    if (!V.vis(mx, E3[1] * .5, mz, it.fork.D * .6 + 50)) return;
    const dur = Math.max(.05, tF - .02), a = tr - .02;
    if (tr < tF) it.fork.draw(fx, V, E3, reachOf(a, dur), .6, pal, true, a);
    else {
      const I = Fork.stroke(tr - tF);
      it.fork.draw(fx, V, E3, 1, I, pal, false, a);
      // sparks jump off the hull where it landed
      const SP = it.SP, sa = tr - tF;
      if (SP && sa < 1) for (let i = 0; i < 70; i++) {
        const o = i * 4, life = SP[o + 3]; if (sa > life) continue;
        const w = 1 - sa / life;
        fx.dotXYZ(E3[0] + SP[o] * sa, E3[1] + SP[o + 1] * sa - 9 * sa * sa, E3[2] + SP[o + 2] * sa, 2, pal.spark[0], pal.spark[1], pal.spark[2], w, 'add');
      }
      if (sa < .25) { R.light([E3[0], E3[1] + 4, E3[2]], Math.max(80, (it.s ? it.s.L : 20) * 2.2), pal.light, 1.5 * I); fx.glow(E3, 16, pal.glow, .5 * I); }
    }
  }
  /* world point where the fork lands on a hull (its strike point, following the hull) */
  function hullPoint(it, out) {
    const u = it.u;
    if (it.s && it.strike) {
      const d = unitXf(u, it), M = d.R, T = d.T, p = it.strike;
      out[0] = M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + T[0]; out[1] = M[3] * p[0] + M[4] * p[1] + M[5] * p[2] + T[1]; out[2] = M[6] * p[0] + M[7] * p[1] + M[8] * p[2] + T[2];
      return true;
    }
    const p = game.unitPose(u).pos;
    out[0] = p[0]; out[1] = p[1] + Math.max(3, u.def.size[2] || 4); out[2] = p[2];
    return true;
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
    if (a < 0 || a > ID_END || !it.s) { if (a > ID_END) xrayOff(it); return; }
    const d = unitXf(u, it), M = d.R, Tt = d.T, s = it.s, rest = s.rest, n = s.n;
    const zc = Math.max(V.near, V.depth(Tt[0], Tt[1], Tt[2])), px = it.px = s.L * V.fl / zc;
    if (!V.vis(Tt[0], Tt[1], Tt[2], s.L)) { xrayOff(it); return; }
    // the hull flares where the fork struck
    if (a < .45) R.light([Tt[0], Tt[1] + s.L * .3, Tt[2]], Math.max(s.L * 2.5, 60), LIME, 1.6 * (1 - a / .45));
    // tendrils racing over its points from the strike, then a lime glow that settles
    if (a < 1.8 && px > 3) {
      const rev = it.rev, stride = Math.max(1, Math.floor(n / clamp(px * 8, 60, n))), big = px > 90;
      for (let i = 0; i < n; i += stride) {
        const lt = rev ? rev.pt[i] : 0; if (a < lt) continue;
        const age = a - lt, k = Math.exp(-age * 7), settle = Math.exp(-Math.max(0, a - .6) * 4);
        const al = Math.max(k, .75 * settle);
        if (al < .02) continue;
        const j = i * 3, x0 = rest[j], y0 = rest[j + 1], z0 = rest[j + 2];
        const x = M[0] * x0 + M[1] * y0 + M[2] * z0 + Tt[0], y = M[3] * x0 + M[4] * y0 + M[5] * z0 + Tt[1], z = M[6] * x0 + M[7] * y0 + M[8] * z0 + Tt[2];
        const w = k;
        fx.dotXYZ(x, y, z, big ? 2 : 1, LIME[0] + (255 - LIME[0]) * w, LIME[1] + (255 - LIME[1]) * w, LIME[2] + (230 - LIME[2]) * w, Math.min(1, al * 1.05), 'over');
      }
    } else if (a < 1.8) { fx.dotXYZ(Tt[0], Tt[1] + 2, Tt[2], 3, LIME[0], LIME[1], LIME[2], 1 - a / 1.8, 'over'); }
    // the X-ray flickers on: the shell thins, what is inside shows (only where it can be read)
    const xk = px > 60 ? flicker(a, .3, 2.7) : 0;
    const dd = game.drawn.get(u.id);
    if (dd && xk > 0 && u.alive) { dd.xray = .85 * xk; it.xrayOn = true; }
    else xrayOff(it);
    const xitems = xk > .02 && dd && dd.R ? xrayItems(it) : null;
    if (xitems) {
      for (const o of xitems) {
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
          const lab = n ? decode(n + ' IDENTIFIED', sat((tr - sc.tAll) / .4), S.clock, sc.n) : 'NO RETURNS';
          TL.add({ x: q[0] + 18, y: q[1] - 44, ax: q[0], ay: q[1], id: 'SCAN ' + pad2(sc.n), label: tr < sc.tAll ? 'CHAIN · ' + n : lab, value: tr < TF ? 'SWEEP' : '', kind: n ? 'lime' : 'ghost', a, size: 10.5, pri: 5 });
        }
        for (const it of sc.idents) identify2d(ov, ctx, TL, sc, it, tr - it.tF);
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
  const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  const CP = new Float32Array(16), W3 = [0, 0, 0], BX = [0, 0, 0, 0];
  /* a model-space box (mn, mx, grown by g about its centre) through the instance, drawn as the films' dotted box;
     -> the index of its top-most corner (its coordinates in CP), or -1 */
  function box3(ctx, M, Tt, mn, mx, g, pad, col, a) {
    const cam = R.camera;
    const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, cz = (mn[2] + mx[2]) / 2;
    const hx = (mx[0] - mn[0]) / 2 * g + pad, hy = (mx[1] - mn[1]) / 2 * g + pad, hz = (mx[2] - mn[2]) / 2 * g + pad;
    let top = -1, ty = 1e9;
    for (let ci = 0; ci < 8; ci++) {
      const x = cx + (ci & 1 ? hx : -hx), y = cy + (ci & 2 ? hy : -hy), z = cz + (ci & 4 ? hz : -hz);
      W3[0] = M[0] * x + M[1] * y + M[2] * z + Tt[0]; W3[1] = M[3] * x + M[4] * y + M[5] * z + Tt[1]; W3[2] = M[6] * x + M[7] * y + M[8] * z + Tt[2];
      if (!cam.project(W3, q)) return -1;
      CP[ci * 2] = q[0]; CP[ci * 2 + 1] = q[1];
      if (q[1] < ty) { ty = q[1]; top = ci; }
    }
    ctx.globalAlpha = a * .85; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([2, 2.5]);
    ctx.beginPath();
    for (let e = 0; e < 24; e += 2) { const i0 = EDGES[e], i1 = EDGES[e + 1]; ctx.moveTo(CP[i0 * 2], CP[i0 * 2 + 1]); ctx.lineTo(CP[i1 * 2], CP[i1 * 2 + 1]); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = col; ctx.globalAlpha = a;
    for (let ci = 0; ci < 8; ci++) ctx.fillRect(Math.round(CP[ci * 2]) - 1, Math.round(CP[ci * 2 + 1]) - 1, 2, 2);
    ctx.globalAlpha = 1;
    return top;
  }
  /* the model-space box of a part group at the unit's state (parts that move follow part.xf(st)) */
  function partBox(it, p, st) {
    if (!p.dyn) return true;
    const s = it.s, mn = p.mn, mx = p.mx;
    mn[0] = mn[1] = mn[2] = 1e9; mx[0] = mx[1] = mx[2] = -1e9;
    let any = false;
    for (const pi of p.pis) {
      const P = s.parts[pi];
      if (P.part.show) { let sh = true; try { sh = P.part.show(st); } catch (e) { /* */ } if (!sh) continue; }
      let X = null; try { X = P.part.xf ? P.part.xf(st) : null; } catch (e) { X = null; }
      const step = Math.max(1, Math.floor((P.i1 - P.i0) / 60));
      for (let i = P.i0; i < P.i1; i += step) {
        let x = s.loc[i * 3], y = s.loc[i * 3 + 1], z = s.loc[i * 3 + 2];
        if (X) { const R0 = X.R, T0 = X.T, x1 = R0[0] * x + R0[1] * y + R0[2] * z + T0[0], y1 = R0[3] * x + R0[4] * y + R0[5] * z + T0[1], z1 = R0[6] * x + R0[7] * y + R0[8] * z + T0[2]; x = x1; y = y1; z = z1; }
        if (x < mn[0]) mn[0] = x; if (y < mn[1]) mn[1] = y; if (z < mn[2]) mn[2] = z;
        if (x > mx[0]) mx[0] = x; if (y > mx[1]) mx[1] = y; if (z > mx[2]) mx[2] = z;
        any = true;
      }
    }
    return any;
  }
  function identify2d(ov, ctx, TL, sc, it, a) {
    const u = it.u, cam = R.camera;
    if (a < -.02 || a > ID_END || !it.s) return;
    const d = unitXf(u, it), M = d.R, Tt = d.T, s = it.s;
    const pp = game.unitPose(u).pos;
    if (!cam.project(pp, q)) return;
    const qx = q[0], qy = q[1], zc = q[2], mpp = zc / cam.fl, px = s.L / mpp;
    const out = 1 - sat((a - (ID_END - .6)) / .6);
    const inInset = inset && inset.showing === u.id;
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
    const big = px >= BIG;
    // part boxes: 3D, fitting the parts, popping in the order the tendrils reach them, grown in from 1.35x; their
    // placards in a column beside the hull (pa_picture / pc_anatomy), rows in the order of the parts on screen
    if (big) {
      const st = d.st || u.st || {};
      const nMax = px >= 170 ? 9 : 4;
      const hb = R.screenBox(d.key ? d : { key: u.def.model, R: M, T: Tt, st: u.st });
      ROWS.length = 0;
      for (let i = 0; i < it.parts.length; i++) {
        const p = it.parts[i], ak = a - p.t0;
        if (ak < 0 || p.rank >= nMax) continue;
        const al = sat(ak / .22) * (1 - sat((a - (ID_END - 1.1 + i * .05)) / .45));
        if (al <= .01) continue;
        if (!partBox(it, p, st)) continue;
        const g = 1 + .35 * (1 - outExpo(sat(ak / .45)));
        const top = box3(ctx, M, Tt, p.mn, p.mx, g, s.L * .004, '#C6F432', al);
        if (top < 0) continue;
        let r = ROWP[ROWS.length]; if (!r) r = ROWP[ROWS.length] = {};
        r.p = p; r.ak = ak; r.al = al; r.tx = CP[top * 2]; r.ty = CP[top * 2 + 1];
        // the anchor: the box's corner on the column's side
        let bx = -1e9, by = 0; for (let ci = 0; ci < 8; ci++) if (CP[ci * 2] > bx || (CP[ci * 2] === bx && CP[ci * 2 + 1] < by)) { bx = CP[ci * 2]; by = CP[ci * 2 + 1]; }
        r.rx = bx; r.ry = by;
        let lx = 1e9, ly = 0; for (let ci = 0; ci < 8; ci++) if (CP[ci * 2] < lx || (CP[ci * 2] === lx && CP[ci * 2 + 1] < ly)) { lx = CP[ci * 2]; ly = CP[ci * 2 + 1]; }
        r.lx = lx; r.ly = ly;
        ROWS.push(r);
      }
      if (hb && ROWS.length) {
        const fs = 9.5, rh = 22, n = ROWS.length;
        // right of the hull unless that runs off screen or into a panel / the inset
        const colW = 250, right = hb[2] + 22 + colW < cam.W - 12 && !blocked(hb[2] + 22, hb[1], colW, n * rh);
        // rows in the order of their anchors down the screen (leaders cross least)
        for (const r of ROWS) r.ty = right ? r.ry : r.ly;
        ROWS.sort(byTy);
        const cx = right ? hb[2] + 22 : hb[0] - 22;
        let y0 = (hb[1] + hb[3]) / 2 - n * rh / 2;
        y0 = Math.max(12, Math.min(cam.H - 12 - n * rh, y0));
        for (let k = 0; k < n; k++) {
          const r = ROWS[k], p = r.p;
          const text = decode(p.label.toUpperCase(), sat((r.ak - .05) / .5), S.clock, p.seed), val = r.ak > .5 ? p.size : '';
          const w = tagW(p.id, text, val, fs);
          TL.add({ x: right ? cx : cx - w, y: y0 + k * rh, ax: right ? r.rx : r.lx, ay: right ? r.ry : r.ly, id: p.id, label: text, value: val, kind: 'lime', a: r.al, size: fs, pri: 3, leadCol: '#C6F432', far: true });
        }
      }
      // its placards keep off the hull
      if (S.keepOut && hb) S.keepOut.push([hb[0] - 4, hb[1] - 4, hb[2] + 4, hb[3] + 4]);
      // the whole hull: a white box while it is identified (p1's object box)
      const wa = sat((a - .25) / .3) * (1 - sat((a - 2.2) / .5));
      if (wa > .01) box3(ctx, M, Tt, s.mn, s.mx, 1 + .25 * (1 - outExpo(sat((a - .25) / .5))), s.L * .012, '#FFFFFF', .7 * wa);
    }
    // the track bracket: lime while it decodes, coral once it is a track
    const ba = sat((a - .15) / .25) * out;
    if (ba > .01) {
      const bb = R.screenBox(d.key ? d : { key: u.def.model, R: M, T: Tt, st: u.st });
      const col = a < 1.5 ? '#C6F432' : '#FF6A3D';
      if (bb && px > 14) {
        const hw = Math.max(9, (bb[2] - bb[0]) / 2), hh = Math.max(7, (bb[3] - bb[1]) / 2), cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
        BX[0] = cx - hw; BX[1] = cy - hh; BX[2] = cx + hw; BX[3] = cy + hh;
        ov.bracket(BX, col, ba * (big && a < 2.4 ? .5 : 1), 5, 12);
      } else if (!inInset) {
        BX[0] = qx - 9; BX[1] = qy - 9; BX[2] = qx + 9; BX[3] = qy + 9;
        ov.bracket(BX, col, ba, 2, 5);
      }
    }
    // the track tag, where the contacts system keeps it afterwards: ? 0.31 -> DDG · ARLEIGH BURKE 0.97
    const ta = sat((a - .05) / .2);
    if (ta > .01) {
      const c = sim.contact(game.side, u.id), id = c ? c.track : 'TRK ' + pad2(u.id);
      const e = R.models.has(u.def.model) ? R.models.get(u.def.model) : null;
      const rpx = e ? e.radius / mpp : 0;
      const ax = qx + Math.max(4, rpx * .75), ay = qy - Math.max(4, rpx * .45);
      const lab = TRACK[u.type] || u.def.name, k1 = sat((a - .35) / .85);
      const text = k1 <= 0 ? '?' : decode(lab, k1, S.clock, it.seed & 1023);
      const conf = it.conf0 + (.97 - it.conf0) * outCubic(sat((a - .3) / 1.2));
      const kind = a < 1.35 ? 'white' : a < 1.9 && Math.sin((a - 1.35) * 26) > -.3 ? 'lime' : 'coral';
      TL.add({ x: ax + 14, y: ay - 26, ax, ay, id, label: text, value: conf.toFixed(2), kind, a: ta, size: 10.5, pri: 8, valCol: kind === 'white' ? 'rgba(255,255,255,.72)' : undefined });
    }
  }
  const ROWS = [], ROWP = [];
  const byTy = (a, b) => a.ty - b.ty;
  /* would a column there sit on a HUD panel or the inset? */
  function blocked(x, y, w, h) {
    const hr = game.hudRects, ir = inset && inset.rect;
    if (hr) for (const r of hr) if (x < r[2] && r[0] < x + w && y < r[3] && r[1] < y + h) return true;
    return !!(ir && x < ir[2] && ir[0] < x + w && y < ir[3] && ir[1] < y + h);
  }
  function xf(M, T, p, o) {
    o[0] = M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + T[0]; o[1] = M[3] * p[0] + M[4] * p[1] + M[5] * p[2] + T[1]; o[2] = M[6] * p[0] + M[7] * p[1] + M[8] * p[2] + T[2];
    return o;
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
    /* the tendril graph of a model, ahead of any scan (idle time) */
    prewarm(key) { const s = sampleOf(R, key); if (s) revealOf(s, key); },
    onEvent(e) {
      if (e.type !== 'scan') return;
      if (e.phase === 'start') start(e);
      else if (e.phase === 'hit') hit(e);
    },
    clearFronts() { R.setScan(0, null); R.setScan(1, null); },
  };
}
