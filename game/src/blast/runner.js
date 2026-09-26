/* The runner: patches from a spec to a final state on one GPU pool (gpu.js). Used by the worker (worker.js) and, where
   a worker cannot have WebGL2, on the main thread (client.js). No DOM.

   submit(id, spec)     spec (blast/spec.js): { S, plates, box, comps, frame: { O, X, Y, Z } (local -> model), charge:
                        { C, W, Wgas, vapour }, wl (model y of the waterline), region }; built and loaded at once, queued
                        until the pool has room
   target(id, t)        the physical time the game shows now (s after the hit): the solver never runs past it, so a hit
                        watched in slow motion tears as the fireball grows; at x1 it runs as fast as the budget allows
   pump(stepsMax)       steps every running patch (one set of passes for all), syncs gas / cells every 25 steps, settles
                        and finishes them -> messages to send: { type: 'state', id, ... } snapshots and finals
   drop(id)

   A snapshot: the skin plates (the model surfaces the patch stands for) as RGBA grids of local displacement (xyz) and
   flags (w: 1 cell torn, 2 node gone, 4 node on a torn edge; + soot 0..0.99), the inner structure near the damage as
   dots in the model frame, and the numbers (torn areas, set, time). */
import { buildPatch, loadPatch, gasStep, sources, tearCells } from './patch.js';
import { createPool } from './gpu.js';
import { MSC, DIFF, V_CRACK } from './phys.js';

const SYNC = 25;
const SNAP_DT = .0004;                 // s of physical time between snapshots at least
const SNAP_MS = 45;                    // ms of real time between snapshots of one patch at least
const MAXIN = 9000;                    // inner dots sent per patch

export function createRunner(gl, o = {}) {
  const pool = createPool(gl, o.pool || {});
  const pats = new Map();              // id -> R { id, P, H, spec, state, target, lastSnap, lastSnapT, t0 }
  const queue = [];
  const stats = { steps: 0, pumps: 0, gpuSteps: 0, built: 0, done: 0, buildMs: 0 };
  let nstep = 0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function submit(id, spec) {
    const t0 = now();
    const P = buildPatch(spec);
    P.V_CRACK = V_CRACK; P.diff = DIFF;
    loadPatch(P, spec.charge);
    const R = { id, P, H: null, spec, state: 'queued', target: 0, watch: spec.watch !== false, lastSnapT: -1, lastSnapMs: 0, tReal0: now(), buildMs: now() - t0, runMs: 0, steps: 0 };
    stats.buildMs = R.buildMs; stats.built++;
    pats.set(id, R); queue.push(R);
    admit();
    return { N: P.N, NS: P.NS, NC: P.NC, K: P.K, dt: P.dt, T1: P.sim.T1, buildMs: R.buildMs };
  }
  function admit() {
    for (let i = 0; i < queue.length; i++) {
      const R = queue[i];
      if (R.state !== 'queued') { queue.splice(i--, 1); continue; }
      let H = null;
      try { H = pool.add(R.P); } catch (e) { R.state = 'failed'; R.err = String(e && e.message || e); queue.splice(i--, 1); continue; }
      if (!H) break;                    // no room yet (first in, first served)
      R.H = H; R.state = 'run'; R.tRun0 = now(); queue.splice(i--, 1);
    }
  }
  /* t: the physical time shown now; watch: snapshots wanted (on screen, close enough to see it move) */
  function target(id, t, watch) { const R = pats.get(id); if (R) { R.target = Math.max(R.target, t); if (watch !== undefined) R.watch = !!watch; } }
  function drop(id) {
    const R = pats.get(id); if (!R) return;
    if (R.H) pool.release(R.H);
    R.H = null; R.state = 'dropped'; pats.delete(id);
    admit();
  }

  /* -> messages */
  function pump(stepsMax = 48) {
    stats.pumps++;
    const out = [];
    for (const R of pats.values()) if (R.state === 'failed' && !R.sentFail) { R.sentFail = true; out.push({ type: 'fail', id: R.id, err: R.err }); }
    const run = [...pats.values()].filter(R => R.state === 'run');
    if (!run.length) return out;
    const all = run.map(R => R.H);
    const t0 = now();
    let did = 0;
    for (let k = 0; k < stepsMax; k++) {
      let any = false;
      for (const R of run) {
        const P = R.P, s = P.sim;
        if (s.slow && s.msc === 1 && s.t > s.tFast) s.msc = MSC;
        const h = P.dt * Math.sqrt(s.msc);
        if (R.state === 'run' && s.t < s.T1 && s.t < R.target + h) {
          pool.setStep(R.H, s.t, h, s.msc, 1 - (s.t > s.tLoad && !s.slow ? 250 : 30) * h);
          R.adv = h; any = true;
        } else { pool.freeze(R.H); R.adv = 0; }
      }
      if (!any) break;
      pool.step(all);
      did++; nstep++;
      for (const R of run) {
        if (!R.adv) continue;
        const s = R.P.sim; s.t += R.adv; s.n++; R.steps++;
        if (s.n % SYNC === 0) sync(R, R.adv * SYNC);
        if (s.t >= s.T1) R.state = 'finish';
      }
      if (run.every(R => R.state !== 'run')) break;
    }
    stats.steps = did; stats.gpuSteps += did;
    const dtMs = now() - t0;
    for (const R of run) if (R.adv || R.state === 'finish') R.runMs += dtMs / run.length;
    // finals, then snapshots of those the game is watching move
    for (const R of run) {
      if (R.state === 'finish') { out.push(finish(R)); continue; }
      const s = R.P.sim;
      if (R.watch && s.t - R.lastSnapT >= SNAP_DT && now() - R.lastSnapMs >= SNAP_MS) out.push(snapshot(R, false));
    }
    return out;
  }
  function sync(R, hs) {
    const P = R.P, s = P.sim, t = s.t;
    sources(P, t);
    // torn cells matter here only for the gas (vents): read without stalling
    if (s.srcs.length && R.spec.syncReads) {
      // (checks: deterministic, a blocking read every 2nd sync as the bench does)
      if ((s.n / SYNC) % 2 === 0) tearCells(P, pool.readCells(R.H), t);
    } else if (s.srcs.length) {
      const cl = pool.readCellsAsync();
      if (cl) for (const Q of pats.values()) if (Q.H && Q.state === 'run' && Q.P.sim.srcs.length) {
        const c0 = Q.H.cb0, b = new Uint8Array(Q.P.NC); for (let c = 0; c < Q.P.NC; c++) b[c] = cl[4 * (c0 + c)] > .5 ? 1 : 0;
        tearCells(Q.P, b, Q.P.sim.t);
      }
    }
    gasStep(P, hs);
    pool.setGas(R.H);
    // settled early: after the load, the gas vented, nothing moving
    let g = 0; for (let c = 0; c < P.nC; c++) g += P.GP[c];
    if (s.n % 400 === 0 && t > s.tLoad && s.srcs.every(q => q.F > .98) && g < 2e4) {
      pool.readNodes(R.H, true); let v2 = 0;
      for (let i = 0; i < P.N; i++) { if (P.FIX[i] || P.FREE[i]) continue; const q = P.V[3 * i] ** 2 + P.V[3 * i + 1] ** 2 + P.V[3 * i + 2] ** 2; if (q > v2) v2 = q; }
      if (v2 < 1) s.T1 = t;
    }
  }
  function finish(R) {
    const P = R.P, s = P.sim;
    pool.readNodes(R.H, true); pool.readBonds(R.H);
    tearCells(P, pool.readCells(R.H), s.t);
    for (let q = 0; q < P.NS; q++) if (P.SBRK[q]) { const a = P.SA[q], b = P.SB[q]; if (P.TBRK[a] < 0) P.TBRK[a] = s.t; if (P.TBRK[b] < 0) P.TBRK[b] = s.t; }
    pool.release(R.H); R.H = null;
    R.state = 'done'; stats.done++;
    admit();
    const m = snapshot(R, true);
    m.results = results(R);
    // the CPU model is kept a while (the game may ask for it: a second hit there), then dropped by the owner
    return m;
  }

  /* ------------------------------------------------------------ what the game draws */
  function snapshot(R, final) {
    const P = R.P, s = P.sim, sp = R.spec, F = sp.frame;
    if (!final) { pool.readNodes(R.H, false); tearCells(P, pool.readCells(R.H), s.t); }
    R.lastSnapT = s.t; R.lastSnapMs = now();
    const S = P.S, X = P.X, R0 = P.R0, gone = i => P.FREE[i] || P.DISC[i];
    // skins
    const skins = [], tr = [];
    P.PL.forEach((L, p) => {
      if (!L.skin) return;
      const nu = L.nu, nv = L.nv, d = new Float32Array((nu + 1) * (nv + 1) * 4);
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const k = j * (nu + 1) + i, n = L.at[k], o = 4 * k;
        d[o] = X[3 * n] - R0[3 * n]; d[o + 1] = X[3 * n + 1] - R0[3 * n + 1]; d[o + 2] = X[3 * n + 2] - R0[3 * n + 2];
        let f = 0;
        if (i < nu && j < nv && P.CTORN[L.off + j * nu + i]) f |= 1;
        if (gone(n)) f |= 2;
        if (P.TBRK[n] >= 0) f |= 4;
        d[o + 3] = f + Math.min(.99, P.SOOT[n]);
        if (!(d[o] === d[o])) { d[o] = d[o + 1] = d[o + 2] = 0; d[o + 3] = 2; }
      }
      skins.push({ p, ax: L.ax, val: L.val, u0: L.u0, v0: L.v0, nu, nv, data: d });
      tr.push(d.buffer);
    });
    // the region the holes open: the struck plate's torn cells, grown 1.5 m
    const L0 = P.PL[0];
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, nt = 0;
    for (let j = 0; j < L0.nv; j++) for (let i = 0; i < L0.nu; i++) if (P.CTORN[L0.off + j * L0.nu + i]) {
      const u = L0.u0 + (i + .5) * S, v = L0.v0 + (j + .5) * S; nt++;
      if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v;
    }
    let inner = null, nIn = 0;
    if (nt) {
      x0 -= 1.5; x1 += 1.5; y0 -= 1.5; y1 += 1.5;
      const A = new Float32Array(MAXIN * 6);
      const push = (lx, ly, lz, b, e) => {
        if (nIn >= MAXIN) return;
        const o = nIn * 6;
        A[o] = F.O[0] + F.X[0] * lx + F.Y[0] * ly + F.Z[0] * lz; A[o + 1] = F.O[1] + F.X[1] * lx + F.Y[1] * ly + F.Z[1] * lz; A[o + 2] = F.O[2] + F.X[2] * lx + F.Y[2] * ly + F.Z[2] * lz;
        A[o + 3] = b; A[o + 4] = e; A[o + 5] = lz; nIn++;
      };
      // the inner plates' cells in the region: 2 dots a cell (a fixed pattern), a torn cell's quarters riding their corners
      const PAT = [[.27, .31], [.74, .69]];
      let cand = 0;
      const inReg = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
      const cells = [];
      P.PL.forEach((L, p) => {
        if (L.skin) return;
        for (let j = 0; j < L.nv; j++) for (let i = 0; i < L.nu; i++) {
          const a = L.at[j * (L.nu + 1) + i], c2 = L.at[(j + 1) * (L.nu + 1) + i + 1];
          const cx = (R0[3 * a] + R0[3 * c2]) / 2, cy = (R0[3 * a + 1] + R0[3 * c2 + 1]) / 2;
          if (inReg(cx, cy)) { cells.push(p, i, j); cand++; }
        }
      });
      const stride = Math.max(1, Math.ceil(cand * 2 / (MAXIN * .85)));
      const base = [0, .55, .42, .42, .38, .38];
      for (let q = 0; q < cells.length; q += 3 * stride) {
        const L = P.PL[cells[q]], i = cells[q + 1], j = cells[q + 2], nu1 = L.nu + 1;
        const a = L.at[j * nu1 + i], b = L.at[j * nu1 + i + 1], c = L.at[(j + 1) * nu1 + i + 1], d = L.at[(j + 1) * nu1 + i];
        const torn = P.CTORN[L.off + j * L.nu + i];
        for (const [u, v] of PAT) {
          let x, y, z, m = -1;
          if (!torn) {
            const w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = u * v, w3 = (1 - u) * v;
            x = X[3 * a] * w0 + X[3 * b] * w1 + X[3 * c] * w2 + X[3 * d] * w3;
            y = X[3 * a + 1] * w0 + X[3 * b + 1] * w1 + X[3 * c + 1] * w2 + X[3 * d + 1] * w3;
            z = X[3 * a + 2] * w0 + X[3 * b + 2] * w1 + X[3 * c + 2] * w2 + X[3 * d + 2] * w3;
          } else {
            m = u < .5 ? (v < .5 ? a : d) : (v < .5 ? b : c);
            if (gone(m)) continue;
            const w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = u * v, w3 = (1 - u) * v;
            const rx = R0[3 * a] * w0 + R0[3 * b] * w1 + R0[3 * c] * w2 + R0[3 * d] * w3;
            const ry = R0[3 * a + 1] * w0 + R0[3 * b + 1] * w1 + R0[3 * c + 1] * w2 + R0[3 * d + 1] * w3;
            const rz = R0[3 * a + 2] * w0 + R0[3 * b + 2] * w1 + R0[3 * c + 2] * w2 + R0[3 * d + 2] * w3;
            x = X[3 * m] + (rx - R0[3 * m]) * .8; y = X[3 * m + 1] + (ry - R0[3 * m + 1]) * .8; z = X[3 * m + 2] + (rz - R0[3 * m + 2]) * .8;
          }
          const n0 = m >= 0 ? m : a;
          const so = P.SOOT[n0], fr = P.FRM[n0];
          const bb = (base[P.SURF[n0]] || .4) * (fr === 2 ? 1.25 : fr === 1 ? 1.1 : 1) * (1 - .72 * so);
          push(x, y, z, bb, (torn || P.TBRK[n0] >= 0 ? 1 : 0) + (fr ? 2 : 0));
        }
      }
      // the struck plate's frames and stiffeners behind the hole's rim: their webs (standing in from the plating)
      for (let j = 0; j <= L0.nv; j++) for (let i = 0; i <= L0.nu; i++) {
        const n = L0.at[j * (L0.nu + 1) + i];
        if (!P.FRM[n] || gone(n)) continue;
        const u = L0.u0 + i * S, v = L0.v0 + j * S;
        if (!inReg(u, v)) continue;
        const w = P.FRM[n] === 2 ? .45 : .22, so = P.SOOT[n], e = P.TBRK[n] >= 0 ? 1 : 0;
        for (let k = 1; k <= (P.FRM[n] === 2 ? 3 : 1); k++) push(X[3 * n], X[3 * n + 1], X[3 * n + 2] - w * k / 3, .5 * (1 - .6 * so), e + 2);
      }
      inner = A.subarray(0, nIn * 6).slice();
      tr.push(inner.buffer);
    }
    // numbers
    let torn0 = 0, below = 0, setMax = 0;
    for (let c = 0; c < P.NC; c++) if (P.CTORN[c] && P.PL[P.CSURF[c]].skin) {
      torn0++;
      const a = P.CN[4 * c], cc = P.CN[4 * c + 2];
      const lx = (R0[3 * a] + R0[3 * cc]) / 2, ly = (R0[3 * a + 1] + R0[3 * cc + 1]) / 2, lz = (R0[3 * a + 2] + R0[3 * cc + 2]) / 2;
      if (F.O[1] + F.X[1] * lx + F.Y[1] * ly + F.Z[1] * lz < (sp.wl || 0)) below++;
    }
    for (let i = 0; i < P.N; i++) if (P.SURF[i] === 0 && !gone(i)) { const d = Math.hypot(X[3 * i] - R0[3 * i], X[3 * i + 1] - R0[3 * i + 1], X[3 * i + 2] - R0[3 * i + 2]); if (d > setMax) setMax = d; }
    const byPlate = new Array(P.nP).fill(0); for (let c = 0; c < P.NC; c++) if (P.CTORN[c]) byPlate[P.CSURF[c]] += S * S;
    return { type: 'state', id: R.id, final, t: s.t, T1: s.T1, skins, inner, nIn, tornSkin: torn0 * S * S, tornBelow: below * S * S, byPlate, setMax,
      runMs: R.runMs, steps: R.steps, wallMs: now() - R.tReal0, transfer: tr };
  }

  /* for the game's girder and flooding (structure/) and fires: plastic work, frames torn, the rim */
  function results(R) {
    const P = R.P, F = R.spec.frame, S = P.S, X = P.X, R0 = P.R0;
    let work = 0; for (let q = 0; q < P.NS; q++) work += P.SFY[q] * Math.abs(P.SLP[q] - P.SL0[q]);
    const L0 = P.PL[0], lines = new Set();
    for (let j = 0; j <= L0.nv; j++) for (let i = 0; i <= L0.nu; i++) { const n = L0.at[j * (L0.nu + 1) + i]; if (P.FRM[n] === 2 && (P.FREE[n] || P.TBRK[n] >= 0)) lines.add(i); }
    // the torn rim of the struck plate (model frame): where the fires sit
    const rim = [];
    for (let j = 0; j <= L0.nv; j++) for (let i = 0; i <= L0.nu; i++) {
      const n = L0.at[j * (L0.nu + 1) + i];
      if (P.TBRK[n] < 0 || P.FREE[n] || P.DISC[n]) continue;
      const lx = X[3 * n], ly = X[3 * n + 1], lz = X[3 * n + 2];
      rim.push(F.O[0] + F.X[0] * lx + F.Y[0] * ly + F.Z[0] * lz, F.O[1] + F.X[1] * lx + F.Y[1] * ly + F.Z[1] * lz, F.O[2] + F.X[2] * lx + F.Y[2] * ly + F.Z[2] * lz, ly);
    }
    // the hole's middle and equivalent radius (struck plate)
    let cx = 0, cy = 0, n = 0;
    for (let j = 0; j < L0.nv; j++) for (let i = 0; i < L0.nu; i++) if (P.CTORN[L0.off + j * L0.nu + i]) { cx += L0.u0 + (i + .5) * S; cy += L0.v0 + (j + .5) * S; n++; }
    const hole = n ? { x: cx / n, y: cy / n, A: n * S * S } : null;
    // the floor of the space behind: the highest intact inner deck under the hole
    let floor = null;
    if (hole) for (const L of P.PL) if (!L.skin && L.ax === 1 && L.val < hole.y && (!floor || L.val > floor.y)) floor = { y: L.val };
    const loc = (lx, ly, lz) => [F.O[0] + F.X[0] * lx + F.Y[0] * ly + F.Z[0] * lz, F.O[1] + F.X[1] * lx + F.Y[1] * ly + F.Z[1] * lz, F.O[2] + F.X[2] * lx + F.Y[2] * ly + F.Z[2] * lz];
    return { work, framesTorn: lines.size, rim: Float32Array.from(rim.length > 4 * 400 ? rim.filter((_, k) => Math.floor(k / 4) % Math.ceil(rim.length / 1600) === 0) : rim),
      hole: hole ? { c: loc(hole.x, hole.y, 0), A: hole.A, floor: floor ? loc(hole.x, floor.y + .1, -Math.min(2, R.spec.depth || 2) * .5) : null } : null };
  }

  return { submit, target, drop, pump, stats, pats, pool, queue, get busy() { for (const R of pats.values()) if (R.state === 'run' || R.state === 'queued') return true; return false; } };
}
