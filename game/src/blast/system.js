/* Blast: ship hits simulated on the graphics card with the bench's structural model (game/concepts/blast), render side.

   A hit on a ship (sim 'hit', through game/scars.js, which keeps the mark's bookkeeping, the fire and the hooks) or a
   cook-off ('cookoff': the module's contents, data/modules.js) becomes a structural patch (spec.js: the plating round the
   hit aligned to the model surface there, the decks and a bulkhead inside at the ship's deck heights and frame spacing,
   plating from the hull class, the charge's TNT equivalent and fuze) solved in a worker on its own WebGL2 context
   (client.js, worker.js, runner.js, gpu.js: every hit in flight shares one set of passes). The worker never runs past
   the time the game shows (physical seconds since the hit), so the plate dents, tears and petals in step with the
   fireball: slowly in slow motion, as fast as the budget allows at x1 (an outside hit ~0.3-0.6 s, one inside ~1-2 s,
   behind the fireball). It streams snapshots while the patch is watched.

   Drawn: the model's own dots in the patch follow the solver's skin plates (engine/models.js blastAt: an atlas texture
   of local displacement + flags; torn cells ride their corners as petals, gone with a corner that flew, torn edges hot
   then charred; the pocket behind a hole cleared and its splats pushed back into a plug); the inner structure near a
   hole (decks, the bulkhead, the frames' webs) as dots here, charred, lit by the fire inside. Final states persist for
   the match (in the model frame: they ride a broken ship's pieces with game/structure). Fires re-seat on the torn rim
   and the deck inside; the torn skin area below the waterline and the torn frames feed game/structure (flooding and
   girder); the headless sim stays authoritative.

   Falls back to scars.js's analytic marks where the worker cannot be had (no OffscreenCanvas WebGL2 / float targets),
   for gun rounds (penetration, not blast), torpedoes (under the keel) and land units.

   createBlast(game) -> system 'blast' (priority 12.5: before scars' events). game.blast = { accepts, hit, cook, drop,
   dropUnit, of(id), list, stats, mode, cfg }. Console: ONIKS.game.blast. */
import { createClient } from './client.js';
import { hitSpec, cookSpec, hullOf } from './spec.js';
import { tntOf, S_GRID } from './phys.js';
import { CASING } from './shell/model.js';
import { attitudeM } from '../game/debris/math.js';

const AW = 2048, AH = 2048;             // the skin atlas (RGBA16F texels: local displacement, flags + soot)
const MAXU = 6;                          // patches drawn per unit (engine/models.js BTMAX)
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
function hsh(i, s) { let h = Math.imul((i | 0) ^ Math.imul(s | 0, 0x9E3779B1), 0x85EBCA77); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

export async function createBlast(game) {
  const sim = game.sim, R = game.R, ML = R.models, gl = ML.gl;
  const stats = { patches: 0, running: 0, uploads: 0, upMs: 0, drawMs: 0, dots: 0, msgs: 0, fails: 0, updMs: 0, budget: 0 };
  const patches = new Map();            // id -> B
  const byUnit = new Map();             // unit id -> [B]
  let nextId = 1, client = null, mode = 'boot', err = null;
  const pending = [];                    // specs before the client is up
  const upQ = [];                        // atlas uploads to do in the frame
  // solver: 'shell' (the audited bench, e00312c: shell FE at 0.25 m on WebGPU in the worker; the default where the
  // browser has WebGPU: an outside hit settles in ~1-2.5 s of play, an inside one in ~3-5 s at a 6 ms slice a frame) or
  // 'lattice' (the bench at 1596bde: without WebGPU, and the main-thread fallback). ?blast=shell / ?blast=lattice, or
  // ONIKS.game.blast.cfg.solver
  const DEFAULT_SOLVER = typeof navigator !== 'undefined' && navigator.gpu ? 'shell' : 'lattice';
  const q0 = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('blast') : null;
  const cfg = { watchDist: 4000, upTexels: 6000, maxDots: 7000, on: q0 !== 'off', gpuMs: 3, gpuMsSlow: 5, gpuMsShell: 6, gpuMsShellSlow: 8, shellS: .25,
    solver: q0 === 'shell' || q0 === 'lattice' ? q0 : DEFAULT_SOLVER };

  /* ------------------------------------------------------------ the atlas */
  let tex = null;
  if (gl.getExtension('EXT_color_buffer_float') || true) {
    tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, AW, AH);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    ML.blastTex = tex;
  }
  // shelves: rows of the atlas, each a height, filled left to right; a rect given back is reused by a plate it fits
  const shelves = [], freed = [];
  function allocRect(w, h) {
    let bi = -1;
    for (let i = 0; i < freed.length; i++) { const f = freed[i]; if (f.w >= w && f.h >= h && (bi < 0 || f.w * f.h < freed[bi].w * freed[bi].h)) bi = i; }
    if (bi >= 0) { const f = freed.splice(bi, 1)[0]; return { x: f.x, y: f.y, w: f.w, h: f.h }; }
    for (const s of shelves) if (s.h >= h && s.h < h * 1.6 && s.x + w <= AW) { const r = { x: s.x, y: s.y, w, h }; s.x += w + 1; s.n++; return r; }
    const y = shelves.length ? shelves[shelves.length - 1].y + shelves[shelves.length - 1].h + 1 : 0;
    if (y + h > AH || w > AW) return null;
    const s = { y, h, x: w + 1, n: 1 }; shelves.push(s);
    return { x: 0, y, w, h };
  }
  function freeRect(r) { if (r && r.aw) freed.push({ x: r.x, y: r.y, w: r.aw, h: r.ah }); }
  const zero = new Float32Array(AW * 8 * 4);

  /* ------------------------------------------------------------ the client */
  createClient().then(c => {
    client = c; mode = c.mode; err = c.err;
    if (!c.mode) { console.warn('blast: no GPU solver (' + c.err + '): the analytic marks stand'); for (const B of pending) fail(B, 'no solver'); pending.length = 0; return; }
    console.log('ONIKS: blast solver on (' + c.mode + (c.err ? '; ' + c.err : '') + ')');
    c.on(onMsg);
    for (const B of pending) c.submit(B.id, B.spec);
    pending.length = 0;
  }).catch(e => { mode = null; err = String(e); console.warn('blast: client', e); });

  /* ------------------------------------------------------------ hits */
  /* can this hit be solved? (a ship afloat, a blast charge: not gun rounds, not under the keel) */
  function accepts(u, fz, e) {
    if (!cfg.on || mode === null || !tex) return false;
    if (!u || u.def.domain !== 'sea' || u.aboard || (u.def.sub && (u.depth || 0) > (u.def.draught || 5))) return false;
    if (fz === 'gun' || (e && e.under)) return false;
    return !!hullOf(u);
  }
  /* o (model frame, from scars.js): { a, n, din, zone, tmm, fz, standoff, kind, whKg, deckY, halfB, S } -> patch or null */
  function hit(u, o) {
    const H = hullOf(u); if (!H) return null;
    const W = tntOf(o.kind, o.whKg);
    if (!(W > .02)) return null;
    const spec = hitSpec({ u, H, a: o.a, n: o.n, din: o.din, zone: o.zone, tmm: o.tmm, fz: o.fz, standoff: o.standoff, W: o.fz === 'frag' ? W * .8 : W, deckY: o.deckY, halfB: o.halfB });
    if (!spec) return null;
    if (o.band > 0) spec.band = o.band;
    const cs = CASING[o.kind] || [W * .8, .02];
    Object.assign(spec.charge, { fill: W, Mc: cs[0], mf: cs[1] });
    return start(u, spec, o.S, { kind: o.kind, W, fz: o.fz });
  }
  /* a cook-off: the module's contents ({ he, prop, det, fuel, vapour }) -> patch or null */
  function cook(u, mod, o) {
    const c = mod && mod.contents; if (!c) return null;
    const H = hullOf(u); if (!H) return null;
    const det = c.det !== undefined ? c.det : 0;
    const W = (c.he || 0) * det, Wgas = (c.prop || 0) * .25 + (c.he || 0) * (1 - det) * .25;
    const spec = cookSpec({ u, H, mod, W, Wgas, vapour: c.vapour || 0, deckY: o.deckY, halfB: o.halfB, a: o.a, n: o.n });
    if (!spec) return null;
    Object.assign(spec.charge, { fill: W, Mc: 0, mf: .03 });
    return start(u, spec, o.S, { kind: 'cookoff:' + mod.id, W, Wgas, vapour: c.vapour || 0 });
  }
  function start(u, spec, S, meta) {
    const id = nextId++;
    spec.watch = true;
    spec.solver = client && client.mode === 'main' ? 'lattice' : cfg.solver;
    spec.gridS = spec.solver === 'shell' ? (spec.shellS = cfg.shellS) : S_GRID;
    const B = { id, uid: u.id, S, spec, meta, t0: sim.t, state: 'wait', rects: [], inner: null, nIn: 0, tShow: 0, tSolve: 0, tearT: -1, final: null, res: null,
      depth: spec.depth || 4, heat: 0, lastT: -1, lastW: null, seed: (u.id * 131 + id * 7) % 997, info: null, ej: false };
    patches.set(id, B);
    let L = byUnit.get(u.id); if (!L) byUnit.set(u.id, L = []);
    L.push(B);
    if (L.length > 12) drop(L[0].id);
    if (S) S.blast = B;
    if (client && client.mode) client.submit(id, spec); else if (mode === 'boot') pending.push(B); else { fail(B, 'no solver'); return null; }
    stats.patches++;
    return B;
  }
  function fail(B, why) {
    B.state = 'fail'; B.err = why; stats.fails++;
    if (B.S && B.S.blast === B) { B.S.blast = null; if (game.scars && game.scars.rebuild) game.scars.rebuild(B.uid, B.S); }
    console.warn('blast: patch ' + B.id + ' failed (' + why + '): the analytic mark stands');
    packUnit(B.uid);
  }
  function drop(id) {
    const B = patches.get(id); if (!B) return;
    patches.delete(id);
    for (let i = upQ.length - 1; i >= 0; i--) if (B.rects.includes(upQ[i].r)) upQ.splice(i, 1);
    for (const r of B.rects) freeRect(r);
    if (client && client.mode && B.state !== 'done') client.drop(id);
    const L = byUnit.get(B.uid); if (L) { const i = L.indexOf(B); if (i >= 0) L.splice(i, 1); if (!L.length) byUnit.delete(B.uid); }
    if (B.S && B.S.blast === B) B.S.blast = null;
    packUnit(B.uid);
  }
  function dropUnit(uid) { const L = byUnit.get(uid); if (L) for (const B of [...L]) drop(B.id); }

  /* ------------------------------------------------------------ messages */
  function onMsg(m) {
    stats.msgs++;
    const B = patches.get(m.id);
    if (m.type === 'dead') { mode = null; for (const b of patches.values()) if (b.state !== 'done') fail(b, 'worker died'); return; }
    if (!B) return;
    if (m.type === 'built') { B.info = m.info; if (B.state === 'wait') B.state = 'run'; return; }
    if (m.type === 'fail' || m.type === 'error') { fail(B, m.err || 'solver'); return; }
    if (m.type !== 'state') return;
    // the skins: into the atlas (in the frame, update())
    for (const k of m.skins) {
      let r = B.rects.find(x => x.p === k.p);
      if (!r) {
        const q = allocRect(k.nu + 1, k.nv + 1);
        if (!q) { fail(B, 'atlas full'); return; }
        r = { p: k.p, ax: k.ax, val: k.val, u0: k.u0, v0: k.v0, nu: k.nu, nv: k.nv, x: q.x, y: q.y, aw: q.w, ah: q.h, ready: false };
        B.rects.push(r);
        upQ.push({ r, clear: true });
      }
      // in row strips (a frame uploads a few thousand texels at most: no hitch when a big plate arrives)
      const rows = Math.max(1, Math.floor(cfg.upTexels / Math.max(1, k.w)));
      for (let j = 0; j < k.h; j += rows) {
        const h = Math.min(rows, k.h - j);
        upQ.push({ r, k: { i0: k.i0, j0: k.j0 + j, w: k.w, h, data: k.data.subarray(4 * j * k.w, 4 * (j + h) * k.w) } });
      }
    }
    if (m.inner) { B.inner = m.inner; B.nIn = m.nIn; }
    B.tSolve = m.t; B.torn = m.tornSkin; B.below = m.tornBelow; B.setMax = m.setMax; B.byPlate = m.byPlate; B.runMs = m.runMs; B.wallMs = m.wallMs; B.steps = m.steps;
    if (m.tornSkin > 0 && B.tearT < 0) B.tearT = sim.t;
    if (m.final) { B.state = 'done'; B.final = m; B.res = m.results; B.doneT = sim.t; settle(B); }
    else if (m.tornSkin > .05 && !B.ej) ejecta(B, m);
  }

  /* the result: the scar's bookkeeping, fires on the torn rim and inside, the girder and flooding */
  function settle(B) {
    const u = sim.units.get(B.uid), S = B.S, res = B.res;
    if (!u) return;
    if (!B.ej && B.torn > .05) ejecta(B, B.final);
    if (S) {
      const A = B.torn || 0;
      S.bA = A; S.bSet = B.setMax;
      if (A > .02) { S.kind = A > 8 ? 'rupture' : 'hole'; S.r = Math.max(.2, Math.sqrt(A / Math.PI)); if (res && res.hole) { S.hx = res.hole.c[0]; S.hy = res.hole.c[1]; S.hz = res.hole.c[2]; } }
      else { S.kind = 'dent'; S.r = Math.max(.3, (B.setMax || 0) * 8); }
      // the fire's seats: on the torn rim (its upper part for a side) and on the deck inside
      if (res && res.hole && res.rim && res.rim.length) {
        const F = B.spec.frame, deck = B.spec.kind === 'deck', rim = res.rim, seats = [], c = res.hole.c;
        const X = F.X, n = rim.length / 4, nR = 4;
        for (let k = 0; k < nR; k++) {
          const a0 = deck ? -Math.PI + (k + .5) / nR * 2 * Math.PI : -.35 + (k + .5) / nR * (Math.PI + .7);
          let bi = -1, bd = 1e9;
          for (let i = 0; i < n; i++) {
            const dx = rim[i * 4] - c[0], dy = rim[i * 4 + 1] - c[1], dz = rim[i * 4 + 2] - c[2];
            const lx = dx * X[0] + dy * X[1] + dz * X[2], ly = deck ? dx * F.Y[0] + dy * F.Y[1] + dz * F.Y[2] : dy;
            if (!deck && ly < -.2) continue;
            let da = Math.abs(Math.atan2(ly, lx) - a0); if (da > Math.PI) da = 2 * Math.PI - da;
            if (da < bd) { bd = da; bi = i; }
          }
          if (bi >= 0) seats.push(rim[bi * 4], rim[bi * 4 + 1], rim[bi * 4 + 2], Math.max(.3, S.r * .3), X[0], 0, X[2]);
        }
        if (res.hole.floor) { const f = res.hole.floor; seats.push(f[0], f[1], f[2], Math.max(.4, S.r * .35), X[0], 0, X[2]); if (S.r > 1.2) seats.push(f[0] + X[0] * S.r * .4, f[1], f[2] + X[2] * S.r * .4, Math.max(.4, S.r * .3), X[0], 0, X[2]); }
        if (seats.length) {
          S.seats = Float32Array.from(seats);
          if (S.fire) S.fire.seat(seats.length / 7);
          else if (game.scars && game.scars.startFire) game.scars.startFire(u, S);
        }
      }
    }
    // the girder and the flooding (game/structure): the torn skin (its share under the water), the frames torn, the work
    if (game.structure && game.structure.refine && S) {
      try { game.structure.refine(B.uid, S.t0h || S.t0, { x: S.x, y: S.y, z: S.z, A: B.torn || 0, below: B.below || 0, frames: res ? res.framesTorn : 0, work: res ? res.work : 0, inner: (B.byPlate || []).slice(1).reduce((a, b) => a + b, 0), W: B.meta.W || 0 }); }
      catch (e) { console.error('blast: structure', e); }
    }
  }
  /* the dots that left the hole (scars.js's ejecta, from the torn area) */
  function ejecta(B, m) {
    B.ej = true;
    const u = sim.units.get(B.uid); if (!u || !game.scars || !game.scars.ejectaAt || !B.S) return;
    const A = m.tornSkin || 0, r = Math.sqrt(A / Math.PI);
    try { game.scars.ejectaAt(u, B.S, r); } catch (e) { console.error('blast: ejecta', e); }
  }

  /* ------------------------------------------------------------ per unit: the uniform pack engine/models.js reads */
  function packUnit(uid) {
    const rec = game.scars && game.scars.of(uid);
    const L = (byUnit.get(uid) || []).filter(B => B.state !== 'fail' && B.rects.some(r => r.ready));
    if (!rec) return;
    if (!L.length) { rec.blast = null; return; }
    const P = rec.blast || (rec.blast = { n: 0, F: new Float32Array(MAXU * 16), P: new Float32Array(MAXU * 8), Q: new Float32Array(MAXU * 8), list: [] });
    // the most recent MAXU (older marks keep their scars bookkeeping; a match rarely has more on one hull)
    const use = L.slice(-MAXU);
    P.n = use.length; P.list = use;
    P.P.fill(-1); P.Q.fill(0);
    use.forEach((B, i) => {
      const F = B.spec.frame, o = i * 16;
      P.F[o] = F.O[0]; P.F[o + 1] = F.O[1]; P.F[o + 2] = F.O[2]; P.F[o + 3] = B.depth;
      P.F[o + 4] = F.X[0]; P.F[o + 5] = F.X[1]; P.F[o + 6] = F.X[2]; P.F[o + 7] = 0;
      P.F[o + 8] = F.Y[0]; P.F[o + 9] = F.Y[1]; P.F[o + 10] = F.Y[2]; P.F[o + 11] = B.spec.gridS || S_GRID;
      P.F[o + 12] = F.Z[0]; P.F[o + 13] = F.Z[1]; P.F[o + 14] = F.Z[2]; P.F[o + 15] = Math.max(Math.min(1.6, Math.max(.8, .6 + .08 * (B.spec.Rp || 5))), Math.min(3.5, (B.spec.band || 0) + .35));
      let k = 0;
      for (const r of B.rects) {
        if (!r.ready || k > 1) continue;
        const q = (i * 2 + k) * 4;
        P.P[q] = r.ax; P.P[q + 1] = r.val; P.P[q + 2] = r.u0; P.P[q + 3] = r.v0;
        P.Q[q] = r.nu; P.Q[q + 1] = r.nv; P.Q[q + 2] = r.x; P.Q[q + 3] = r.y;
        k++;
      }
    });
  }
  function heatOf(B, t) { if (B.tearT < 0) return B.state === 'done' ? 0 : 0; const a = t - B.tearT; return a < 0 ? 0 : .04 + .96 * Math.exp(-a / 9); }

  /* ------------------------------------------------------------ per frame */
  const TG = {};
  const gone = new Set();                // units the sim removed whose hull game/structure still draws
  let lastSent = 0;
  function update() {
    const t0 = performance.now();
    // the solver's share of this frame's GPU time: what the game's own frame leaves of ~13.5 ms (game.quality.gpuMs, the
    // perf guard's measure, which counts the solver too: its last share is taken back out), within 1.5 .. gpuMs (more
    // in slow motion, when the plate is watched tearing)
    if (client && client.mode && stats.running) {
      const q = game.quality, mx = game.timeRate < .9 || game.paused ? cfg.gpuMsSlow : cfg.gpuMs;
      const other = q && q.gpuMs > 0 ? Math.max(0, q.gpuMs - stats.budget * .8) : 8;
      stats.budget = Math.max(1.5, Math.min(mx, 13.5 - other));
      // (the shell solver's hits take more steps: its share while one is solving, within the same headroom)
      const mxS = game.timeRate < .9 || game.paused ? cfg.gpuMsShellSlow : cfg.gpuMsShell;
      stats.budgetShell = stats.shellRunning ? Math.max(1.5, Math.min(mxS, 13.5 - other)) : 0;
      client.tick(stats.budget, stats.budgetShell || stats.budget);
    }
    // uploads (in the frame: the renderer's GL state stays as it expects)
    if (upQ.length) {
      const tu = performance.now();
      gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, tex);
      const touched = new Set();
      let tex2 = 0;
      while (upQ.length && tex2 < cfg.upTexels * 1.5) {
        const q = upQ.shift(), r = q.r;
        if (q.clear) { for (let y = 0; y <= r.nv; y += 8) { const h = Math.min(8, r.nv + 1 - y); gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x, r.y + y, r.nu + 1, h, gl.RGBA, gl.FLOAT, zero, 0); } tex2 += (r.nu + 1) * (r.nv + 1) * .25; continue; }
        const k = q.k;
        gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x + k.i0, r.y + k.j0, k.w, k.h, gl.RGBA, gl.FLOAT, k.data);
        tex2 += k.w * k.h;
        // (shown once its last strip of this snapshot is in: never half a plate)
        if (!upQ.some(o => o.r === r)) r.ready = true;
        for (const B of patches.values()) if (B.rects.includes(r)) touched.add(B.uid);
        stats.uploads++;
      }
      gl.activeTexture(gl.TEXTURE0);
      for (const uid of touched) packUnit(uid);
      stats.upMs = performance.now() - tu;
    }
    // what the game shows now: each running patch's physical time since the hit, and whether it is watched
    let any = false, run = 0, runS = 0;
    const eye = R.camera.eye;
    for (const [uid, L] of byUnit) {
      const u = sim.units.get(uid);
      const rec = game.scars && game.scars.of(uid);
      if (rec && rec.blast) {
        // heat of each patch's torn edges
        for (let i = 0; i < rec.blast.n; i++) rec.blast.F[i * 16 + 7] = heatOf(rec.blast.list[i], game.t);
      } else if (rec && L.some(B => B.rects.some(r => r.ready))) packUnit(uid);
      for (const B of L) {
        if (B.state !== 'run' && B.state !== 'wait') continue;
        run++; if (B.spec.solver === 'shell') runS++;
        const tp = Math.max(0, game.t - B.t0);
        let watch = false;
        if (u && game.drawn && game.drawn.has(uid)) {
          const p = game.unitPose(u), F = B.spec.frame;
          watch = Math.hypot(p.pos[0] + F.O[0] - eye[0], p.pos[1] + F.O[1] - eye[1], p.pos[2] + F.O[2] - eye[2]) < cfg.watchDist;
        }
        if (Math.abs(tp - (B.tShow || 0)) > 1e-4 || watch !== B.watch) { TG[B.id] = [tp, watch]; B.tShow = tp; B.watch = watch; any = true; }
      }
    }
    stats.running = run; stats.shellRunning = runS;
    for (const uid of gone) if (!(game.structure && game.structure.draws && game.structure.draws(uid))) { gone.delete(uid); dropUnit(uid); }
    if (any && client && client.mode) { client.targets(TG); for (const k in TG) delete TG[k]; lastSent = game.realT; }
    stats.updMs = performance.now() - t0;
  }

  /* the inner structure near a hole (decks, the bulkhead, the frames' webs), charred, the fire inside lighting it */
  function drawInner(frame) {
    const sink = frame.sink;
    if (!sink || !sink.cam || R.pcOff || R.style === 'orbital') return 0;
    const cam = sink.cam, eye = cam.eye, f = cam.f, fl = cam.fl || 1300, tr = frame.realT || game.realT || 0;
    let drawn = 0;
    const M = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    // (a share of cfg.maxDots a frame for each patch drawn: several holes on screen thin out together)
    let nShow = 0; for (const L of byUnit.values()) for (const B of L) if (B.nIn) nShow++;
    const capEach = cfg.maxDots / Math.max(1, nShow);
    for (const [uid, L] of byUnit) {
      const u = sim.units.get(uid), hull = game.structure && game.structure.draws && game.structure.draws(uid);
      if (!hull && (!u || !game.drawn.has(uid))) continue;
      const rec = game.scars && game.scars.of(uid);
      if (rec && rec.vis === false) continue;
      const sea = !u || u.def.domain === 'sea';
      for (const B of L) {
        if (!B.inner || !B.nIn) continue;
        const Fr = B.spec.frame;
        // the piece of a broken hull the patch is on (game/structure), else the unit's drawn pose
        const pz = hull && game.structure.poseAt ? game.structure.poseAt(uid, Fr.O[2]) : null;
        let p0;
        if (pz) { for (let i = 0; i < 9; i++) M[i] = pz.R[i]; p0 = pz.T; }
        else if (u) { const pose = game.unitPose(u); attitudeM(pose.hdg, pose.pitch || 0, pose.roll || 0, M); p0 = pose.pos; }
        else continue;
        const cx = p0[0] + M[0] * Fr.O[0] + M[1] * Fr.O[1] + M[2] * Fr.O[2], cy = p0[1] + M[3] * Fr.O[0] + M[4] * Fr.O[1] + M[5] * Fr.O[2], cz = p0[2] + M[6] * Fr.O[0] + M[7] * Fr.O[1] + M[8] * Fr.O[2];
        const zc = (cx - eye[0]) * f[0] + (cy - eye[1]) * f[1] + (cz - eye[2]) * f[2];
        if (zc < -12) continue;
        const pxm = fl / Math.max(1, zc);
        if (pxm * 6 < 2.5) continue;
        // seen from the hole's own side only
        const Z = Fr.Z, nwx = M[0] * Z[0] + M[1] * Z[1] + M[2] * Z[2], nwy = M[3] * Z[0] + M[4] * Z[1] + M[5] * Z[2], nwz = M[6] * Z[0] + M[7] * Z[1] + M[8] * Z[2];
        if ((eye[0] - cx) * nwx + (eye[1] - cy) * nwy + (eye[2] - cz) * nwz < -2) continue;
        const px = (B.spec.gridS || S_GRID) * 1.4 * pxm, stride = Math.max(px >= 1.6 ? 1 : Math.min(40, Math.ceil((1.6 / px) ** 2)), Math.ceil(B.nIn / capEach));
        const size = px > 9 ? 3 : px > 4 ? 2 : 1;
        const fk = B.S && B.S.fire ? B.S.fire.k : 0, heat = heatOf(B, game.t), I = B.inner;
        for (let i = 0; i < B.nIn; i += stride) {
          const o = i * 6, x = I[o], y = I[o + 1], z = I[o + 2], b = I[o + 3], e = I[o + 4], lz = I[o + 5];
          const wx = p0[0] + M[0] * x + M[1] * y + M[2] * z, wy = p0[1] + M[3] * x + M[4] * y + M[5] * z, wz = p0[2] + M[6] * x + M[7] * y + M[8] * z;
          if (wy < .05 && sea) continue;                                    // flooded: under the sea
          const hs = hsh(i, B.seed);
          const torn = (e & 1) !== 0, fr = (e & 2) !== 0;
          // charred steel: dark, the torn edges and frames catching more light; the fire's glow deep inside, flickering
          let c = (.1 + .12 * b) * (fr ? 1.25 : 1) * (.8 + .4 * hs);
          const gw = sat(.3 + .25 * Math.min(4, -lz) / 4);
          const fl2 = .72 + .28 * Math.sin(tr * (5.3 + 3 * hs) + i * .7);
          const g = Math.max(fk * (.08 + .7 * gw * gw) * fl2, torn ? heat * .8 : 0);
          const rr = 255 * Math.min(1, c * .95 + .62 * g), gg = 255 * Math.min(1, c * .9 + .36 * g), bb = 255 * Math.min(1, c * .84 + .12 * g);
          sink.dot(wx, wy, wz, size, rr, gg, bb, 1);
          drawn++;
        }
      }
    }
    return drawn;
  }

  const sys = {
    name: 'blast', priority: 12.5, stats, patches, byUnit, cfg,
    get mode() { return mode; }, get err() { return err; }, get client() { return client; },
    accepts, hit, cook, drop, dropUnit,
    of(id) { return patches.get(id) || null; },
    list(uid) { return byUnit.get(uid) || []; },
    /* the last patch of a unit (the impact tester's readout) */
    last(uid) { const L = byUnit.get(uid); return L && L.length ? L[L.length - 1] : null; },
    async solverStats() { return client && client.stats ? client.stats() : null; },
    init() { game.blast = sys; },
    onEvent(e) {
      // (a hull still drawn by game/structure, sinking in pieces, keeps its patches until it is gone)
      if (e.type === 'removed') { if (game.structure && game.structure.draws && game.structure.draws(e.unit)) gone.add(e.unit); else dropUnit(e.unit); }
    },
    update,
    draw3d(frame) {
      const t0 = performance.now();
      stats.dots = byUnit.size ? drawInner(frame) : 0;
      stats.drawMs = performance.now() - t0;
    },
    dispose() {
      for (const id of [...patches.keys()]) drop(id);
      if (client && client.w) client.w.terminate();
      if (tex) { gl.deleteTexture(tex); if (ML.blastTex === tex) ML.blastTex = null; }
      if (game.blast === sys) game.blast = null;
    },
  };
  return sys;
}
