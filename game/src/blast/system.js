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
import { interiorZones } from '../data/models_interior.js';
import { modelDots, topAt, eachInColumns, classify, connectivity, K as CK, createBodies } from './support.js';

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
  const cfg = { watchDist: 4000, upTexels: 6000, maxDots: 5000, on: q0 !== 'off', gpuMs: 3, gpuMsSlow: 5, gpuMsShell: 8, gpuMsShellSlow: 10, detachMs: 1.5, shellS: .25, scatter: .05, latMs: 5, fastEnd: true, petals: true,
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
    const spec = hitSpec({ u, H, a: o.a, n: o.n, din: o.din, zone: o.zone, tmm: o.tmm, fz: o.fz, standoff: o.standoff, W: o.fz === 'frag' ? W * .8 : W, deckY: o.deckY, halfB: o.halfB, big: bigPatch() });
    if (!spec) return null;
    if (o.band > 0) spec.band = o.band;
    // (the sim's hole for this hit (sim/ship.js, what floods her) centred elsewhere on the plating: the charge moves half
    // way toward it along the plate, so the solved tear and the sim's hole are one)
    const Hs = u.ship && u.ship.holes;
    if (Hs && Hs.length && o.fz === 'in') {
      let best = null; for (const h of Hs) if (Math.hypot(h.x - o.a[0], h.y - o.a[1], h.z - o.a[2]) < 8 && (!best || h.A > best.A)) best = h;
      if (best) { const F = spec.frame, d = [best.x - F.O[0], best.y - F.O[1], best.z - F.O[2]], lx = d[0] * F.X[0] + d[1] * F.X[1] + d[2] * F.X[2], ly = d[0] * F.Y[0] + d[1] * F.Y[1] + d[2] * F.Y[2], C = spec.charge.C, b = spec.box;
        if (Math.hypot(lx, ly) > 1) { C[0] = Math.max(b[0] + .5, Math.min(b[3] - .5, C[0] + .5 * lx)); C[1] = Math.max(b[1] + .3, Math.min(b[4] - .3, C[1] + .5 * ly)); spec.simSeed = [lx, ly]; } }
    }
    const cs = CASING[o.kind] || [W * .8, .02];
    Object.assign(spec.charge, { fill: W, Mc: cs[0], mf: cs[1] });
    return start(u, spec, o.S, { kind: o.kind, W, fz: o.fz, deckY: o.deckY, halfB: o.halfB });
  }
  /* a cook-off: the module's contents ({ he, prop, det, fuel, vapour }) -> patch or null */
  function cook(u, mod, o) {
    const c = mod && mod.contents; if (!c) return null;
    const H = hullOf(u); if (!H) return null;
    const det = c.det !== undefined ? c.det : 0;
    const W = (c.he || 0) * det, Wgas = (c.prop || 0) * .25 + (c.he || 0) * (1 - det) * .25;
    const spec = cookSpec({ u, H, mod, W, Wgas, vapour: c.vapour || 0, deckY: o.deckY, halfB: o.halfB, a: o.a, n: o.n, big: bigPatch() });
    if (!spec) return null;
    Object.assign(spec.charge, { fill: W, Mc: 0, mf: .03 });
    return start(u, spec, o.S, { kind: 'cookoff:' + mod.id, W, Wgas, vapour: c.vapour || 0, deckY: o.deckY, halfB: o.halfB });
  }
  // the shell solver's patch: sized as the bench's (the compartment round the charge, a graded grid)
  const bigPatch = () => cfg.solver === 'shell' && !(client && client.mode === 'main');
  function start(u, spec, S, meta) {
    const id = nextId++;
    spec.watch = true;
    spec.solver = client && client.mode === 'main' ? 'lattice' : cfg.solver;
    spec.gridS = spec.solver === 'shell' ? (spec.shellS = cfg.shellS) : S_GRID;
    // (the steel's scatter seeded by the impact's geometry: the same hit on the same class tears the same way)
    // (a ship with an interior (data/models_interior.js) shows it through the hole: no dark far wall in the pocket)
    spec.farWall = !Object.keys(interiorZones(u.def.model, [0, 0, 0], 1e4)).length;
    if (spec.solver === 'shell') { spec.petals = !!cfg.petals; spec.fastEnd = cfg.fastEnd; spec.latMs = cfg.latMs; spec.scatter = cfg.scatter; let h = 2166136261; for (const v of [...String(u.type)].map(c => c.charCodeAt(0)).concat(spec.frame.O.map(x => Math.round(x * 4)), spec.charge.C.map(x => Math.round(x * 4)))) h = Math.imul(h ^ (v & 0xffff), 16777619); spec.seed = h | 0; }
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
  function dropUnit(uid) { const L = byUnit.get(uid); if (L) for (const B of [...L]) drop(B.id); bodies.dropUnit(uid); taken.delete(uid); }

  /* ------------------------------------------------------------ messages */
  function onMsg(m) {
    stats.msgs++;
    const B = patches.get(m.id);
    if (m.type === 'dead') { mode = null; for (const b of patches.values()) if (b.state !== 'done') fail(b, 'worker died'); return; }
    if (!B) return;
    B.silent = 0;
    if (m.type === 'built') { B.info = m.info; if (B.state === 'wait') B.state = 'run'; return; }
    if (m.type === 'fail' || m.type === 'error') { fail(B, m.err || 'solver'); return; }
    if (m.type !== 'state') return;
    // the skins: into the atlas (in the frame, update())
    for (const k of m.skins) {
      let r = B.rects.find(x => x.p === k.p);
      if (!r) {
        const q = allocRect(k.nu + 1, k.nv + 1);
        if (!q) { fail(B, 'atlas full'); return; }
        r = { p: k.p, ax: k.ax, val: k.val, u0: k.u0, v0: k.v0, nu: k.nu, nv: k.nv, x: q.x, y: q.y, aw: q.w, ah: q.h, ready: false,
          cpu: new Float32Array((k.nu + 1) * (k.nv + 1) * 4), dead: new Uint8Array((k.nu + 1) * (k.nv + 1)) };
        B.rects.push(r);
        upQ.push({ r, clear: true });
      }
      // (a CPU copy: what stands on the plating is judged from it, support.js)
      if (r.cut) for (let j = 0; j < k.h; j++) for (let i = 0; i < k.w; i++) if (r.cut[(k.j0 + j) * (k.nu + 1) + k.i0 + i]) { const o = 4 * (j * k.w + i) + 3; if (!((k.data[o] | 0) & 8)) k.data[o] += 8; }
      for (let j = 0; j < k.h; j++) r.cpu.set(k.data.subarray(4 * j * k.w, 4 * (j + 1) * k.w), 4 * ((k.j0 + j) * (k.nu + 1) + k.i0));
      // in row strips (a frame uploads a few thousand texels at most: no hitch when a big plate arrives)
      const rows = Math.max(1, Math.floor(cfg.upTexels / Math.max(1, k.w)));
      for (let j = 0; j < k.h; j += rows) {
        const h = Math.min(rows, k.h - j);
        upQ.push({ r, k: { i0: k.i0, j0: k.j0 + j, w: k.w, h, data: k.data.subarray(4 * j * k.w, 4 * (j + h) * k.w) } });
      }
    }
    if (m.inner) { B.inner = m.inner; B.nIn = m.nIn; }
    B.tSolve = m.t; B.torn = m.tornSkin; B.openM2 = m.openM2 || 0; B.below = m.tornBelow; B.setMax = m.setMax; B.byPlate = m.byPlate; B.runMs = m.runMs; B.wallMs = m.wallMs; B.steps = m.steps;
    if (m.tornSkin > 0 && B.tearT < 0) B.tearT = sim.t;
    { const td = performance.now(); try { detachScan(B); } catch (e) { console.error('blast: detach', e); } const dd = performance.now() - td; stats.detachMs = Math.max(stats.detachMs || 0, dd); }
    if (m.final) { B.state = 'done'; B.final = m; B.res = m.results; B.doneT = sim.t; try { simHoles(B); } catch (e) { console.error('blast: sim holes', e); } if (m.debris && m.debris.length) bodies.dotsOf(B.uid, B, m.debris, 1); settle(B); setTimeout(() => { try { settleSupport(B); } catch (e) { console.error('blast: support', e); } }, 0); }
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
      else { S.kind = 'dent'; S.r = Math.max(.3, (B.setMax || 0) * 8); if (S.fire && !(B.byPlate || []).some(x => x > .05)) { try { S.fire.stop(sim.t); } catch (e) { /* */ } S.fire = null; } }   // (no hole anywhere: no fire burning on intact plating)
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

  /* ------------------------------------------------------------ what stood on the plating: loose pieces (support.js) */
  const bodies = createBodies(), taken = new Map();            // unit -> the model's dots already flying (Uint8Array)
  const bandOf = B => Math.max(Math.min(1.6, Math.max(.8, .6 + .08 * (B.spec.Rp || 5))), Math.min(3.5, (B.spec.band || 0) + .35));
  const entOf = u => { try { return ML.get(u.def.model); } catch (e) { return null; } };
  /* the plating that tore, went or lost its support since the last snapshot: the model's dots over it (the shader leaves
     them out from now on) fly as pieces of their part */
  function detachScan(B, budgetMs) {
    const u = sim.units.get(B.uid); if (!u) return;
    const ent = entOf(u); if (!ent) return;
    const Md = modelDots(ent); if (!Md.n) return;
    B.band = bandOf(B); B.depth = B.spec.depth || 4;
    takenOf(B.uid, Md);
    // (the model's dots grew (interior parts first drawn round the hole): every dead texel looked at again)
    const regen = B.mdGen !== Md.gen; B.mdGen = Md.gen;
    const F = B.spec.frame, S = B.spec.gridS || S_GRID, cols = new Set(), reach = Md.gen ? 8.5 : .5;
    let k = 0;
    for (const r of B.rects) {
      if (!r.cpu || k > 1) continue;
      k++;
      if (regen && r.dead) r.dead.fill(0);
      const W = r.nu + 1, A = r.ax === 0 ? F.X : r.ax === 1 ? F.Y : F.Z, e0 = A[1] > .7 ? 0 : -(B.spec.depth || 4) - reach, e1 = A[1] > .7 ? 0 : 3;
      for (let j = 0; j <= r.nv; j++) for (let i = 0; i <= r.nu; i++) {
        const t = j * W + i, C4 = r.cpu, f = ((C4[4 * t + 3] | 0) & 11) | (C4[4 * t] ** 2 + C4[4 * t + 1] ** 2 + C4[4 * t + 2] ** 2 > .64 ? 16 : 0);   // (16: thrown > 0.8 m)
        if (!f || r.dead[t] === f) continue;
        r.dead[t] = f;
        const l = [0, 0, 0]; l[r.ax] = r.val;
        if (r.ax === 0) { l[2] = r.u0 + i * S; l[1] = r.v0 + j * S; } else if (r.ax === 1) { l[0] = r.u0 + i * S; l[2] = r.v0 + j * S; } else { l[0] = r.u0 + i * S; l[1] = r.v0 + j * S; }
        for (let e = e0; e <= e1; e += 1) {
          const x = F.O[0] + F.X[0] * l[0] + F.Y[0] * l[1] + F.Z[0] * l[2] + A[0] * e, z = F.O[2] + F.X[2] * l[0] + F.Y[2] * l[1] + F.Z[2] * l[2] + A[2] * e;
          for (let a1 = -1; a1 <= 1; a1++) for (let b1 = -1; b1 <= 1; b1++) cols.add((Math.floor(x) + a1 + 32768) * 65536 + Math.floor(z) + b1 + 32768);
        }
      }
    }
    if (cols.size) { const P = B.pendCols || (B.pendCols = new Set()); for (const c of cols) P.add(c); pendDetach.add(B); }
    if (budgetMs !== undefined) detachWork(B, budgetMs);
  }
  /* the sim's holes (sim/ship.js u.ship.holes: model frame x y z, r, A) are what floods her: where the solve tore less
     than the sim's hole, the hole is opened on the patch's skin to at least the sim's outline (ragged: its radius varies
     round it, the edge bitten texel by texel), so the picture never shows an intact side over a flooding space */
  function simHoles(B) {
    const u = sim.units.get(B.uid), Hs = u && u.ship && u.ship.holes; if (!Hs || !Hs.length) return 0;
    const F = B.spec.frame, S = B.spec.gridS || S_GRID, O = F.O;
    const seen = B.simSeen || (B.simSeen = new Map());
    let added = 0; const touched = new Set();
    // (a hole no patch of hers covers: the scars system's analytic hole there, once)
    const covered = h => { for (const b of byUnit.get(B.uid) || []) { const G = b.spec.frame, e = [h.x - G.O[0], h.y - G.O[1], h.z - G.O[2]], q = [0, 1, 2].map(k => { const A = k === 0 ? G.X : k === 1 ? G.Y : G.Z; return e[0] * A[0] + e[1] * A[1] + e[2] * A[2]; });
      for (const r of b.rects) { const pl2 = b.spec.plates[r.p]; if (!pl2 || !pl2.skin) continue; const S2 = b.spec.gridS || S_GRID, off = q[r.ax] - r.val, cu = ((r.ax === 0 ? q[2] : q[0]) - r.u0) / S2, cv = ((r.ax === 1 ? q[2] : q[1]) - r.v0) / S2;
        if (Math.abs(off) < 4 && cu > 0 && cv > 0 && cu < r.nu && cv < r.nv) return true; } } return false; };
    const done = B.simOut || (B.simOut = new Set());
    for (const h of Hs) {
      if (!(h.A > .05)) continue;
      const hk = h.c + ':' + Math.round(h.z) + ':' + Math.round(h.y);
      if (!covered(h)) { if (!done.has(hk) && game.scars && game.scars.holeAt) { done.add(hk); const sx = h.x >= 0 ? 1 : -1; try { game.scars.holeAt(B.uid, h.x, h.y, h.z, [sx, 0, 0], Math.sqrt(h.A / Math.PI)); } catch (e) { console.error('blast: sim hole scar', e); } } continue; }
      const key = h.c + ':' + Math.round(h.z * 2) + ':' + Math.round(h.y * 2); if ((seen.get(key) || 0) >= h.A - .05) continue; seen.set(key, h.A);
      const d = [h.x - O[0], h.y - O[1], h.z - O[2]], l = [d[0] * F.X[0] + d[1] * F.X[1] + d[2] * F.X[2], d[0] * F.Y[0] + d[1] * F.Y[1] + d[2] * F.Y[2], d[0] * F.Z[0] + d[1] * F.Z[1] + d[2] * F.Z[2]];
      const R0 = Math.sqrt(h.A / Math.PI), sd = (Math.round(h.z * 7) * 131 + Math.round(h.y * 5) * 17 + h.c) | 0;
      // the outline: the radius round the hole, 12 lobes of random size (smoothly joined), the texel's own bite
      const lobe = k => .72 + .5 * ((Math.imul((k & 15) + sd * 16, 0x9E3779B1) >>> 0) / 4294967296);
      for (const r of B.rects) {
        if (!r.cpu) continue;
        const pl = B.spec.plates[r.p]; if (!pl || !pl.skin) continue;   // (the ship's own shell only)
        const off = l[r.ax] - r.val; if (Math.abs(off) > 4) continue;   // (the sim's boxes are coarser than the model: a hole up to 4 m off the plating is on it)
        const cu = ((r.ax === 0 ? l[2] : l[0]) - r.u0) / S, cv = ((r.ax === 1 ? l[2] : l[1]) - r.v0) / S, Rt = R0 * 1.25 / S, W = r.nu + 1;
        // (the solve's own tear there: no more than the sim asks)
        let torn = 0, all = 0;
        for (let j = Math.max(0, Math.floor(cv - Rt * .8)); j <= Math.min(r.nv, Math.ceil(cv + Rt * .8)); j++) for (let i = Math.max(0, Math.floor(cu - Rt * .8)); i <= Math.min(r.nu, Math.ceil(cu + Rt * .8)); i++) {
          if ((i - cu) ** 2 + (j - cv) ** 2 > (Rt * .8) ** 2) continue; all++; if ((r.cpu[4 * (j * W + i) + 3] | 0) & 3) torn++; }
        if (!all || torn > .7 * all) continue;
        for (let j = Math.max(0, Math.floor(cv - Rt)); j <= Math.min(r.nv, Math.ceil(cv + Rt)); j++) for (let i = Math.max(0, Math.floor(cu - Rt)); i <= Math.min(r.nu, Math.ceil(cu + Rt)); i++) {
          const du = i - cu, dv = j - cv, dd = Math.hypot(du, dv) * S; if (dd > R0 * 1.25) continue;
          const a = (Math.atan2(dv, du) / (2 * Math.PI) + 1) * 12, k0 = Math.floor(a), fa = a - k0, sm = fa * fa * (3 - 2 * fa);
          const bite = ((Math.imul(i * 73856093 ^ j * 19349663 ^ sd, 0x85EBCA77) >>> 0) / 4294967296 - .5) * .35 * S;
          if (dd > R0 * (lobe(k0) + (lobe(k0 + 1) - lobe(k0)) * sm) + bite) continue;
          const t = 4 * (j * W + i), f = r.cpu[t + 3] | 0;
          if (f & 1) continue;
          r.cpu[t + 3] = (f | 1) + Math.max(r.cpu[t + 3] % 1, .55); added++; touched.add(r);
        }
      }
    }
    for (const r of touched) { const rows = Math.max(1, Math.floor(cfg.upTexels / (r.nu + 1)));
      for (let j = 0; j <= r.nv; j += rows) { const hh = Math.min(rows, r.nv + 1 - j); upQ.push({ r, k: { i0: 0, j0: j, w: r.nu + 1, h: hh, data: r.cpu.subarray(4 * j * (r.nu + 1), 4 * (j + hh) * (r.nu + 1)) } }); } }
    if (added) { const S2 = S * S * added; B.simTorn = (B.simTorn || 0) + S2; B.torn = Math.max(B.torn || 0, (B.torn || 0) + S2); detachScan(B); }
    return added;
  }
  /* the columns waiting to be looked at, a time budget a frame (a patch's plating going can touch thousands of dots) */
  const pendDetach = new Set();
  let genTick = 0;
  // the dots of unit uid already flying (grown with the model's dots, keeping what it had)
  function takenOf(uid, Md) {
    let T = taken.get(uid);
    if (!T || T.length < Md.n) { const T2 = new Uint8Array(Md.n); if (T) T2.set(T); taken.set(uid, T = T2); }
    return T;
  }
  function detachWork(B, budgetMs) {
    const P = B.pendCols; if (!P || !P.size) { pendDetach.delete(B); return; }
    const u = sim.units.get(B.uid); if (!u) { pendDetach.delete(B); return; }
    const ent = entOf(u), Md = ent && modelDots(ent); if (!Md || !Md.n) return;
    const T = takenOf(B.uid, Md), F = B.spec.frame, t0 = performance.now();
    const D = Md.D, pick = [], offs = [], info = {};
    let nc = 0;
    for (const key of P) {
      if (nc && nc % 4 === 0 && performance.now() - t0 > budgetMs) break;
      P.delete(key); nc++;
      const cx = Math.floor(key / 65536) - 32768, cz = key % 65536 - 32768;
      eachInColumns(Md, cx + .5, cz + .5, cx + .5, cz + .5, i => {
        if (T[i]) return;
        const o = 7 * i, c = classify(B, D[o], D[o + 1], D[o + 2], D[o + 3], D[o + 4], D[o + 5], info, Md.ins && Md.ins[D[o + 6]]);
        if (c !== CK.COLDROP && c !== CK.BEHINDDROP) return;
        T[i] = 1; pick.push(i, info.r, info.i, info.j); offs.push(info.off || 0);
      });
    }
    if (!P.size) pendDetach.delete(B);
    if (!pick.length) return;
    // pieces: the dots of one part joined within 0.7 m; each starts where its plating had carried it, moving with it
    const n = pick.length / 4, par = new Int32Array(n); for (let q = 0; q < n; q++) par[q] = q;
    const fd = q => { while (par[q] !== q) { par[q] = par[par[q]]; q = par[q]; } return q; };
    const cell = new Map(), CL = .7;
    const ck = (p, a, b2, c) => (((p * 4096 + a + 2048) * 4096 + b2 + 2048) * 4096 + c + 2048);
    for (let q = 0; q < n; q++) { const o = 7 * pick[4 * q]; const kk = ck(D[o + 6], Math.floor(D[o] / CL), Math.floor(D[o + 1] / CL), Math.floor(D[o + 2] / CL)); const l = cell.get(kk); if (l) l.push(q); else cell.set(kk, [q]); }
    for (const [kk, l] of cell) {
      for (let dx = 0; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { if (!dx && (dy < 0 || (!dy && dz <= 0))) continue;
        const m2 = cell.get(kk + dx * 16777216 + dy * 4096 + dz); if (!m2) continue; const ra = fd(l[0]), rb = fd(m2[0]); if (ra !== rb) par[ra] = rb; }
      for (let q = 1; q < l.length; q++) { const ra = fd(l[0]), rb = fd(l[q]); if (ra !== rb) par[ra] = rb; }
    }
    // (and cut at 4 m: a torn-away stretch of structure breaks up, it does not leave as one clean block)
    const groups = new Map(); for (let q = 0; q < n; q++) { const o = 7 * pick[4 * q], r0 = fd(q) * 4096 + ((Math.floor(D[o] / 4) & 15) * 256 + (Math.floor(D[o + 1] / 4) & 15) * 16 + (Math.floor(D[o + 2] / 4) & 15)); let g = groups.get(r0); if (!g) groups.set(r0, g = []); g.push(q); }
    const tS = Math.max(.02, B.tSolve || .02), running = B.state !== 'done';
    const singles = [];
    for (const g of groups.values()) {
      const stride = Math.max(1, Math.ceil(g.length / 1500)), pts = [], dd = [];
      let vx = 0, vy = 0, vz = 0;
      for (let q = 0; q < g.length; q += stride) {
        const idx = pick[4 * g[q]], r = pick[4 * g[q] + 1], ti = pick[4 * g[q] + 2], tj = pick[4 * g[q] + 3], o = 7 * idx, t = 4 * (Math.min(r.nv, Math.max(0, tj)) * (r.nu + 1) + Math.min(r.nu, Math.max(0, ti)));
        const dl = [r.cpu[t], r.cpu[t + 1], r.cpu[t + 2]];
        const d = [F.X[0] * dl[0] + F.Y[0] * dl[1] + F.Z[0] * dl[2], F.X[1] * dl[0] + F.Y[1] * dl[1] + F.Z[1] * dl[2], F.X[2] * dl[0] + F.Y[2] * dl[1] + F.Z[2] * dl[2]];
        const so = r.cpu[t + 3] % 1;
        // (steel that went through the blast: charred grey, darker where the soot lay)
        // (charred near the blast; what stood well above it (a stack, a mast, a deckhouse) keeps most of its own light:
        // no black silhouettes, QA D38)
        const hb = Math.min(1, Math.max(0, (Math.abs(offs[g[q]]) - 1) / 3));
        pts.push(D[o], D[o + 1], D[o + 2], (.34 + .5 * hb) * (1 - .6 * so * (1 - hb)), D[o + 3], D[o + 4], D[o + 5]); dd.push(d[0], d[1], d[2]);
        vx += d[0]; vy += d[1]; vz += d[2];
      }
      const m = pts.length / 7; vx /= m; vy /= m; vz /= m;
      // (a piece moves as one: the plating under its dots may have gone many ways (flying pieces of it), so each dot
      // takes the piece's mean displacement, bent by at most 0.4 m off it)
      for (let q = 0; q < m; q++) { const ex = dd[3 * q] - vx, ey = dd[3 * q + 1] - vy, ez = dd[3 * q + 2] - vz, e = Math.hypot(ex, ey, ez), k = e > .4 ? .4 / e : 1;
        pts[7 * q] += vx + ex * k; pts[7 * q + 1] += vy + ey * k; pts[7 * q + 2] += vz + ez * k; }
      // (while the solve runs its plating is moving: the piece leaves with it; at the end it just drops)
      let v = running ? [vx / tS, vy / tS, vz / tS] : [0, 0, 0];
      const sp = Math.hypot(v[0], v[1], v[2]); if (sp > 14) v = v.map(x => x * 14 / sp);
      if (m < 4) { for (let q = 0; q < pts.length; q += 7) singles.push(pts[q], pts[q + 1], pts[q + 2], v[0], v[1], v[2], pts[q + 3], 0); continue; }
      bodies.clump(B.uid, B, pts, v, .25);
    }
    if (singles.length) bodies.dotsOf(B.uid, B, Float32Array.from(singles), .25);
    stats.detached = (stats.detached || 0) + n;
  }
  /* after the solve: whatever of the model is left standing with nothing under it (an overhang whose foot went, a mast
     top over sound plating whose base did not) goes too: its columns are cut (bit 8) and it flies as pieces */
  function settleSupport(B) {
    const u = sim.units.get(B.uid); if (!u || B.state !== 'done') return;
    const ent = entOf(u); if (!ent) return;
    const Md = modelDots(ent); if (!Md.n) return;
    const L = (byUnit.get(B.uid) || []).filter(b => b.state === 'done' && b.rects.some(r => r.cpu));
    const t0 = performance.now(), info = {};
    for (const b of L) detachWork(b, Infinity);
    for (let it = 0; it < 4; it++) {
      const C = connectivity(Md, L, takenOf(B.uid, Md));
      const fl = C.floating;   // (single dots too: nothing left hanging in the air)
      if (!fl.length) break;
      const D = Md.D, touched = new Set();
      for (const g of fl) for (const i of g) {
        const o = 7 * i;
        for (const b of L) { const c = classify(b, D[o], D[o + 1], D[o + 2], D[o + 3], D[o + 4], D[o + 5], info, Md.ins && Md.ins[D[o + 6]]); if (c === CK.NONE || c === CK.HIDDEN) continue;
          const r = info.r; if (!r.cut) r.cut = new Uint8Array((r.nu + 1) * (r.nv + 1));
          const t = Math.max(0, Math.min(r.nv, info.j)) * (r.nu + 1) + Math.max(0, Math.min(r.nu, info.i));
          if (!r.cut[t]) { r.cut[t] = 1; if (!((r.cpu[4 * t + 3] | 0) & 8)) r.cpu[4 * t + 3] += 8; touched.add(r); }
          break; }
      }
      if (!touched.size) break;
      for (const r of touched) { const rows = Math.max(1, Math.floor(cfg.upTexels / (r.nu + 1)));
        for (let j = 0; j <= r.nv; j += rows) { const h = Math.min(rows, r.nv + 1 - j); upQ.push({ r, k: { i0: 0, j0: j, w: r.nu + 1, h, data: r.cpu.subarray(4 * j * (r.nu + 1), 4 * (j + h) * (r.nu + 1)) } }); } }
      for (const b of L) detachScan(b, Infinity);
    }
    stats.supportMs = performance.now() - t0;
  }
  /* the surface under a point of unit uid (model frame): the deck under a hole where a patch's plating is dead, inside a
     patch's box below its plating the floor of the hole, else the model's top surface (a wall if it is 0.6 m over the
     point), else the sea (-1e9) */
  const FL = { y: -1e9, wall: false };
  function floorAt(uid, x, y, z) {
    FL.wall = false;
    const L = byUnit.get(uid), u = sim.units.get(uid);
    if (L) for (const B of L) {
      const F = B.spec.frame, dx = x - F.O[0], dy = y - F.O[1], dz = z - F.O[2];
      const l = [dx * F.X[0] + dy * F.X[1] + dz * F.X[2], dx * F.Y[0] + dy * F.Y[1] + dz * F.Y[2], dx * F.Z[0] + dy * F.Z[1] + dz * F.Z[2]];
      const bx = B.spec.box, up = B.spec.kind === 'deck' ? 2 : 1, S = B.spec.gridS || S_GRID;
      const hole = B.res && B.res.hole && B.res.hole.floor ? B.res.hole.floor[1] : F.O[1] + bx[up] * (up === 2 ? F.Z[1] : F.Y[1]);
      for (const r of B.rects) {
        if (!r.cpu || r.ax !== up) continue;
        const u2 = (r.ax === 0 ? l[2] : l[0]) - r.u0, v2 = (r.ax === 1 ? l[2] : l[1]) - r.v0, i = Math.round(u2 / S), j = Math.round(v2 / S);
        if (i < 0 || j < 0 || i > r.nu || j > r.nv) continue;
        if ((r.cpu[4 * (j * (r.nu + 1) + i) + 3] | 0) & 11) { FL.y = hole; return FL; }
      }
      if (l[0] > bx[0] && l[0] < bx[3] && l[1] > bx[1] && l[1] < bx[4] && l[2] > bx[2] && l[2] < bx[5]) { FL.y = hole; return FL; }
    }
    const ent = u ? entOf(u) : null, Md = ent ? modelDots(ent) : null;
    const top = Md && Md.n ? topAt(Md, x, z) : -1e9;
    if (top > y + .6) { FL.wall = true; FL.y = top; return FL; }
    FL.y = top; return FL;
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
      P.F[o] = F.O[0]; P.F[o + 1] = F.O[1]; P.F[o + 2] = F.O[2]; P.F[o + 3] = B.spec.farWall ? -B.depth : B.depth;
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
  function heatOf(B, t) {
    // (the tear cools over ~10 s; while the fire in the hole burns its rim keeps an ember glow, lit from inside)
    const fk = B.S && B.S.fire ? B.S.fire.k || 0 : 0, ember = .32 * Math.min(1, fk * 1.5);
    if (B.tearT < 0) return (B.torn || 0) > .05 ? ember : 0; const a = t - B.tearT; return a < 0 ? 0 : Math.max(ember, .04 + .96 * Math.exp(-a / 9)); }

  /* ------------------------------------------------------------ per frame */
  const TG = {};
  const gone = new Set();                // units the sim removed whose hull game/structure still draws
  let lastSent = 0;
  let lastBT = null;
  // the frame's wall time, a decaying high mark (~the last half second's worst frames) -> the solver's share, 0.3 .. 1
  let lastF = 0, fHi = 0, fScale = 1;
  function frameScale(now) {
    const dt = lastF ? now - lastF : 0; lastF = now;
    if (!(dt > 0) || dt > 200) return fScale;
    fHi = Math.max(dt, fHi * .93);
    fScale = fHi > 24 ? Math.max(.3, fScale * .85) : fHi < 20 ? Math.min(1, fScale * 1.04) : fScale;   // (cut back only on missed frames (~25 ms at 60 Hz), not the jitter round 16.7)
    stats.frameScale = fScale;
    return fScale;
  }
  let lastRT = null;
  function update() {
    const t0 = performance.now();
    // (a watchdog: a patch the solver has not answered for 12 s of the game's running time is given up: its analytic
    // mark stands, the solver is told to drop it; nothing in the game waits on it)
    { const rt = game.realT || 0, dR = lastRT === null ? 0 : Math.min(.1, Math.max(0, rt - lastRT)); lastRT = rt;
      const lim = game.timeRate < .5 ? 90 : 12;   // (slow motion: the solve is paced to the shown time)
      if (dR > 0 && !game.paused) for (const B of patches.values()) if (B.state === 'wait' || B.state === 'run') { B.silent = (B.silent || 0) + dR;
        if (B.silent > lim) { try { if (client && client.drop) client.drop(B.id); } catch (e) { /* */ } fail(B, 'no answer from the solver for 12 s'); } } }
    // the solver's share of this frame's GPU time: what the game's own frame leaves of ~13.5 ms (game.quality.gpuMs, the
    // perf guard's measure, which counts the solver too: its last share is taken back out), within 1.5 .. gpuMs (more
    // in slow motion, when the plate is watched tearing)
    if (client && client.mode && stats.running) {
      const q = game.quality, mx = game.timeRate < .9 || game.paused ? cfg.gpuMsSlow : cfg.gpuMs;
      const other = q && q.gpuMs > 0 ? Math.max(0, q.gpuMs - stats.budget * .8) : 8;
      stats.budget = Math.max(1.5, Math.min(mx, 13.5 - other));
      // (the shell solver's hits take more steps: its share while one is solving, within the same headroom)
      const mxS = game.timeRate < .9 || game.paused ? cfg.gpuMsShellSlow : cfg.gpuMsShell;
      // (two patches solving at once, e.g. a hit and the cook-off it set: more share, so each still settles in ~4-5 s;
      // the frame guard below cuts it back if the frames run long)
      const kS = 1 + .6 * Math.max(0, Math.min(2, stats.shellRunning - 1));
      stats.budgetShell = stats.shellRunning ? Math.max(1.5, Math.min(mxS * kS, (13.5 - other) * kS)) : 0;
      // (frames running long while a solve goes on: the solver's share cut back until they are under ~16 ms again)
      const fs = frameScale(t0);
      stats.budget = Math.max(1, stats.budget * fs); if (stats.budgetShell) stats.budgetShell = Math.max(1, stats.budgetShell * fs);
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
    // (the sim's holes grow as she floods and as later hits land: looked at again every ~second)
    if (genTick % 60 === 30) for (const L of byUnit.values()) for (const B of L) if (B.state === 'done') { try { simHoles(B); } catch (e) { console.error('blast: sim holes', e); } }
    // (the interior parts round a hole are sampled once shown: their dots join the model's, and are looked at then)
    if (++genTick % 20 === 0) for (const [uid, L] of byUnit) { const u = sim.units.get(uid), ent = u && entOf(u), Md = ent && modelDots(ent);
      if (Md && Md.n) for (const B of L) if (B.mdGen !== undefined && B.mdGen !== Md.gen && B.rects.some(r => r.cpu)) { try { detachScan(B); } catch (e) { console.error('blast: detach', e); } } }
    if (pendDetach.size) { const td = performance.now(); for (const B of [...pendDetach]) { try { detachWork(B, cfg.detachMs); } catch (e) { console.error('blast: detach', e); pendDetach.delete(B); } if (performance.now() - td > cfg.detachMs) break; } stats.detachWorkMs = performance.now() - td; }
    { const tt = game.t, h = lastBT === null ? 0 : tt - lastBT; lastBT = tt; if (bodies.list.length && h > 0) bodies.step(h, floorAt); }
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
    const capEach = cfg.maxDots * .6 / Math.max(1, nShow);
    for (const [uid, L] of byUnit) {
      const u = sim.units.get(uid), hull = game.structure && game.structure.draws && game.structure.draws(uid);
      if (!hull && (!u || !game.drawn.has(uid))) continue;
      const rec = game.scars && game.scars.of(uid);
      if (rec && rec.vis === false) continue;
      const sea = !u || u.def.domain === 'sea';
      for (const B of L) {
        // (a patch with no inner dots of its own still shows the floodwater behind a hole the sim opened)
        if ((!B.inner || !B.nIn) && !(u && u.ship && (B.torn || 0) > .05)) continue;
        const Fr = B.spec.frame;
        // the piece of a broken hull the patch is on (game/structure), else the unit's drawn pose
        const pz = hull && game.structure.poseAt ? game.structure.poseAt(uid, Fr.O[2]) : null;
        let p0;
        // (a broken hull: each dot rides the piece its own station is on, poses taken a metre of station at a time)
        const byZ = pz ? new Map() : null;
        const poseZ = z => { const k = Math.round(z); let q = byZ.get(k); if (q === undefined) { q = game.structure.poseAt(uid, k); byZ.set(k, q); } return q; };
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
        for (let i = 0; i < (I ? B.nIn : 0); i += stride) {
          const o = i * 6, x = I[o], y = I[o + 1], z = I[o + 2], b = I[o + 3], e = I[o + 4], lz = I[o + 5];
          let MM = M, pp = p0;
          if (byZ) { const q = poseZ(z); if (!q) continue; MM = q.R; pp = q.T; }
          const wx = pp[0] + MM[0] * x + MM[1] * y + MM[2] * z, wy = pp[1] + MM[3] * x + MM[4] * y + MM[5] * z, wz = pp[2] + MM[6] * x + MM[7] * y + MM[8] * z;
          if (wy < .05 && sea) continue;                                    // flooded: under the sea
          const hs = (Math.imul(i + B.seed, 0x9E3779B1) >>> 0) / 4294967296;
          const torn = (e & 1) !== 0, fr = (e & 2) !== 0;
          // charred steel: dark, the torn edges and frames catching more light; the fire's glow deep inside, flickering
          // (readable: steel catching the fire's light, its edges and frames brighter; the glow strongest deep in the hole)
          let c = (.26 + .34 * b) * (fr ? 1.35 : 1) * (.8 + .4 * hs);
          const gw = sat(.45 + .3 * Math.min(4, -lz) / 4);
          const fl2 = .72 + .28 * FLK[((tr * (40 + 24 * hs)) + i * 5.6) & 255];
          const g = Math.max(Math.max(fk, .35 * heat) * (.25 + .95 * gw * gw) * fl2, torn ? heat * .9 : 0);
          const rr = 255 * Math.min(1, c * .95 + .62 * g), gg = 255 * Math.min(1, c * .9 + .36 * g), bb = 255 * Math.min(1, c * .84 + .12 * g);
          sink.dot(wx, wy, wz, size, rr, gg, bb, 1);
          drawn++;
        }
        // the floodwater in the spaces behind the hole (the sim's water level a space), seen through it
        if (u && u.ship && !byZ) drawn += drawWater(sink, u, B, M, p0, size, tr);
      }
    }
    return drawn;
  }

  /* floodwater: a flat sheet of dim sea dots at the sim's water level in each flooded space the patch opens into
     (sim/ship.js: water[c] m^3 over the space's floor area and permeability), within reach of the hole */
  function drawWater(sink, u, B, M, p0, size, tr) {
    const S = u.ship, Lt = S && S.L; if (!Lt || !S.water) return 0;
    const fireK = B.S && B.S.fire ? Math.min(1, B.S.fire.k || 0) : 0;
    const Fr = B.spec.frame, bx = B.spec.box, Fo = Fr.O;
    // the patch's reach (model frame, x z): the box's corners
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const a of [bx[0], bx[3]]) for (const c of [bx[2], bx[5]]) { const x = Fo[0] + Fr.X[0] * a + Fr.Z[0] * c, z = Fo[2] + Fr.X[2] * a + Fr.Z[2] * c; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    let n = 0;
    for (let c = 0; c < S.water.length; c++) {
      if (!(S.water[c] > .5)) continue;
      const o = c * 6, b = Lt.box;
      const ax0 = Math.max(x0, b[o]), ax1 = Math.min(x1, b[o + 3]), az0 = Math.max(z0, b[o + 2]), az1 = Math.min(z1, b[o + 5]);
      if (ax1 - ax0 < .5 || az1 - az0 < .5) continue;
      const lv = Math.min(b[o + 4] - .1, b[o + 1] + S.water[c] / Math.max(1e-6, (Lt.perm ? Lt.perm[c] : .85) * (Lt.floorA ? Lt.floorA[c] : (b[o + 3] - b[o]) * (b[o + 5] - b[o + 2]))));
      if (!(lv > b[o + 1] + .05)) continue;
      const st = .28;
      for (let x0 = ax0 + st * .5; x0 < ax1; x0 += st) for (let z0 = az0 + st * .5; z0 < az1; z0 += st) {
        // (scattered, not a lattice: each dot jittered in its cell; the surface heaves a little and glints now and then)
        const hh = Math.imul(Math.round(x0 * 20) * 73856093 ^ Math.round(z0 * 20) * 19349663, 0x9E3779B1) >>> 0, h = hh / 4294967296, h2 = (Math.imul(hh ^ (hh >>> 15), 0x85EBCA77) >>> 0) / 4294967296;
        const x = x0 + (h - .5) * st, z = z0 + (h2 - .5) * st;
        const y = lv + .05 * Math.sin(tr * 1.3 + x * 1.7 + z * 1.1 + h * 6.3);
        const wx = p0[0] + M[0] * x + M[1] * y + M[2] * z, wy = p0[1] + M[3] * x + M[4] * y + M[5] * z, wz = p0[2] + M[6] * x + M[7] * y + M[8] * z;
        const gl = Math.max(0, Math.sin(tr * (1.1 + h2) + h * 40)) ** 12, k = .55 + .6 * h2 + 1.4 * gl;
        // (dark water, brighter than the steel round it, the fire's glow on it)
        const fg = fireK * (.5 + .5 * FLK[((tr * 30 + x * 9 + z * 7) | 0) & 255]);
        sink.dot(wx, wy, wz, size, Math.min(255, 95 * k + 150 * fg), Math.min(255, 125 * k + 80 * fg), Math.min(255, 150 * k + 30 * fg), 1);
        n++;
      }
    }
    return n;
  }

  /* the pieces that came loose: dots flying on from where the solver left them (linear drag, gravity), landing on the
     deck when over the hull, sinking when they reach the sea; hot at first, then charred. Model frame, the unit's pose */
  const DK = .6, GR = 9.81, FLK = Float32Array.from({ length: 256 }, (_, k) => Math.sin(k / 256 * 2 * Math.PI));
  function drawBodies(frame) {
    const sink = frame.sink;
    if (!sink || !sink.cam || R.pcOff || R.style === 'orbital' || !bodies.list.length) return 0;
    const cam = sink.cam, eye = cam.eye, f = cam.f, fl = cam.fl || 1300;
    const poses = new Map(), M0 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const poseOf = (uid, B, z) => {
      const key = uid + ':' + Math.round(z / 2); let P = poses.get(key); if (P !== undefined) return P;
      const u = sim.units.get(uid), hull = game.structure && game.structure.draws && game.structure.draws(uid);
      P = null;
      if (hull || (u && game.drawn.has(uid))) {
        const pz = hull && game.structure.poseAt ? game.structure.poseAt(uid, Math.round(z / 2) * 2) : null;
        const M = M0.slice();
        if (pz) { for (let i = 0; i < 9; i++) M[i] = pz.R[i]; P = { M, p: pz.T }; }
        else if (u) { const pose = game.unitPose(u); attitudeM(pose.hdg, pose.pitch || 0, pose.roll || 0, M); P = { M, p: pose.pos }; }
        if (P) { const c = P.p, zc = (c[0] - eye[0]) * f[0] + (c[1] - eye[1]) * f[1] + (c[2] - eye[2]) * f[2]; P.pxm = fl / Math.max(1, zc); if (zc < -200 || P.pxm * 20 < 2) P = null; }
      }
      poses.set(key, P); return P;
    };
    // (each piece as dense as it needs on screen: a near one in full (its dots ~0.3 m apart about 1.6 px), far ones
    // thinned; the total held near 14000 dots)
    const n = bodies.count(), kAll = Math.max(1, n / 14000);
    const stride = b => { const P = poseOf(b.uid, b.B, b.kind === 'clump' ? b.p[2] : 0); if (!P) return 0;
      const px = .3 * P.pxm; return Math.max(1, Math.round(Math.min(40, Math.max(1, (1.6 / Math.max(.05, px)) ** 2)) * (px > 2.5 ? 1 : kAll))); };
    // (the moon in the model frame of the first unit drawn: the ships roll little)
    const sun = R.sun || [-.5, .62, -.6];
    let lightModel = sun;
    for (const b of bodies.list) { const u = sim.units.get(b.uid); if (u) { const pose = game.unitPose(u), M = [1, 0, 0, 0, 1, 0, 0, 0, 1]; attitudeM(pose.hdg, pose.pitch || 0, pose.roll || 0, M);
      lightModel = [M[0] * sun[0] + M[3] * sun[1] + M[6] * sun[2], M[1] * sun[0] + M[4] * sun[1] + M[7] * sun[2], M[2] * sun[0] + M[5] * sun[1] + M[8] * sun[2]]; break; } }
    let drawn = 0, fillLeft = 4000;
    bodies.each((uid, B, x, y, z, b, heat, fade, i) => {
      const P = poseOf(uid, B, z); if (!P) return;
      const M = P.M, p0 = P.p;
      const wx = p0[0] + M[0] * x + M[1] * y + M[2] * z, wy = p0[1] + M[3] * x + M[4] * y + M[5] * z, wz = p0[2] + M[6] * x + M[7] * y + M[8] * z;
      const hs = (Math.imul(i + 7, 0x9E3779B1) >>> 0) / 4294967296, g = heat * (.6 + .4 * hs), bb = b * (.8 + .4 * hs);
      const size = P.pxm * .2 > 3 ? 3 : P.pxm * .2 > 1.4 ? 2 : 1;
      const cr = 255 * Math.min(1, bb * .95 + 1.1 * g), cg = 255 * Math.min(1, bb * .9 + .55 * g), cb = 255 * Math.min(1, bb * .84 + .15 * g);
      sink.dot(wx, wy, wz, size, cr, cg, cb, fade);
      drawn++;
      // (close up a piece's dots (~0.3 m apart) are filled in round each one, so it reads as a solid torn piece and not
      // a scatter of specks: up to 8 more a dot, within 0.15 m, a little darker)
      const extra = fillLeft > 0 ? Math.min(6, Math.floor((.3 * P.pxm / 2.6) ** 2) - 1, fillLeft) : 0; if (extra > 0) fillLeft -= extra;   // (a budget of 4000 a frame)
      for (let e = 0; e < extra; e++) { const h1 = (Math.imul(i * 9 + e + 11, 0x9E3779B1) >>> 0) / 4294967296 - .5, h2 = (Math.imul(i * 9 + e + 29, 0x85EBCA77) >>> 0) / 4294967296 - .5, h3 = (Math.imul(i * 9 + e + 47, 0xC2B2AE35) >>> 0) / 4294967296 - .5;
        const k2 = .82 + .3 * h3; sink.dot(wx + .3 * h1, wy + .3 * h3 * .5, wz + .3 * h2, size, cr * k2, cg * k2, cb * k2, fade); drawn++; }
    }, stride, lightModel);
    return drawn;
  }

  const sys = {
    name: 'blast', priority: 12.5, stats, patches, byUnit, cfg,
    get mode() { return mode; }, get err() { return err; }, get client() { return client; },
    accepts, hit, cook, drop, dropUnit, bodies, floorAt, taken,
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
      stats.dots = (byUnit.size ? drawInner(frame) : 0) + drawBodies(frame);
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
