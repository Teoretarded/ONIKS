/* The shell solver's runner (bench e00312c: shell/model.js; shell/gpu_wgpu.js WebGPU, shell/gpu.js WebGL2): the same
   interface as the lattice runner (blast/runner.js), so the worker and the game system take either. One GPU instance
   per patch, two patches solved at a time (buffers sized to each patch, freed when it settles), the rest queued. Grid
   0.25 m (spec.shellS): the bench's cost figures are at that grid.

   Backends: WebGPU where the context has a device (o.wg): many steps a command buffer, read backs by mapAsync that
   never stall (the bench's interactive path); else WebGL2, whose torn-cell and node reads are asynchronous once a pump
   (a fence polled or a buffer read is a round trip to Chrome's GPU process, busy with the game's frames). A check run
   (spec.syncReads, WebGL2) reads blocking every sync, as the bench's headless runCase. The snapshots and results are the
   same shape as the lattice runner's (skins in each plate's grid order, through the cell map). */
import { sceneOf, buildShell, loadShell, commonSync, checkEnd, markDebris, openCell, gpuModel, attachedCell, MATS } from './model.js';
import { createGPU } from './gpu.js';
import { createWGPU } from './gpu_wgpu.js';

const SYNC = 25;
const SNAP_DT = .0004, SNAP_MS = 60, MAXIN = 9000, RUNNING = 2;

export function createShellRunner(gl, o = {}) {
  const pats = new Map(), queue = [];
  const stats = { readMs: 0, nodeMs: 0, stepMs: 0, steps: 0, pumps: 0, gpuSteps: 0, built: 0, done: 0, buildMs: 0, snapMs: 0, pumpMs: 0, backend: o.wg ? 'webgpu' : 'webgl2', skipped: 0 };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function submit(id, spec) {
    const t0 = now();
    const S = spec.shellS || .25, scene = sceneOf(spec, S), M = buildShell(scene, S);
    const ch = spec.charge;
    loadShell(M, { C: ch.C, fill: ch.fill !== undefined ? ch.fill : ch.W, Mc: ch.Mc || 0, mf: ch.mf || .03, Wgas: ch.Wgas || 0, vapour: ch.vapour || 0, frags: ch.frags !== false });
    const R = { id, M, spec, gpu: null, state: 'queued', target: 0, watch: spec.watch !== false, lastSnapT: -1, lastSnapMs: 0, tReal0: now(), buildMs: now() - t0, runMs: 0, steps: 0 };
    stats.buildMs = R.buildMs; stats.built++;
    pats.set(id, R); queue.push(R);
    admit();
    return { N: M.N, NS: M.NH + M.NT, NC: M.NC, K: 0, dt: M.dt, T1: M.sim.T1, buildMs: R.buildMs, solver: 'shell', backend: stats.backend, S, massAdded: M.massAdded };
  }
  function admit() {
    let running = 0; for (const R of pats.values()) if (R.state === 'run' || R.state === 'finishing') running++;
    while (queue.length && running < RUNNING) {
      const R = queue.shift();
      if (R.state !== 'queued') continue;
      try {
        const wg = o.wg && !R.spec.syncReads;
        R.gpu = wg ? createWGPU(o.wg, gpuModel(R.M), { batch: o.batch || 200, depth: o.depth || 2 }) : createGPU(gl, gpuModel(R.M));
        R.wg = !!wg; R.gpu.upload(); R.gpu.setSources(R.M.sim.SRC); R.gpu.setGas(R.M.GP);
        R.state = 'run'; running++;
      } catch (e) { R.state = 'failed'; R.err = String(e && e.message || e); if (R.gpu) { try { R.gpu.dispose(); } catch (e2) { /* */ } R.gpu = null; } }
    }
  }
  function target(id, t, watch) { const R = pats.get(id); if (R) { R.target = Math.max(R.target, t); if (watch !== undefined) R.watch = !!watch; } }
  function drop(id) { const R = pats.get(id); if (!R) return; if (R.gpu) R.gpu.dispose(); R.gpu = null; R.state = 'dropped'; pats.delete(id); admit(); }
  const tornFrom = (M, cl) => { let torn = false; if (cl) for (let c = 0; c < M.NC; c++) if (cl[4 * c] > .5 && !M.CER[c]) { M.CER[c] = 1; M.CTE[c] = cl[4 * c + 1]; openCell(M, c, M.CTE[c]); if (attachedCell(M, c)) torn = true; } return torn; };

  function pump(stepsMax = 24) {
    stats.pumps++;
    const out = [];
    for (const R of pats.values()) if (R.state === 'failed' && !R.sentFail) { R.sentFail = true; out.push({ type: 'fail', id: R.id, err: R.err }); }
    for (const R of pats.values()) if (R.state === 'final') { out.push(R.finalMsg); pats.delete(R.id); }
    const run = [...pats.values()].filter(R => R.state === 'run');
    if (!run.length) { admit(); return out; }
    const t0 = now();
    let did = 0;
    // the steps go round the running patches, each its share
    const each = Math.max(1, Math.round(stepsMax / run.length));
    for (const R of run) {
      const M = R.M, s = M.sim, g = R.gpu, sync = R.spec.syncReads;
      if (R.wg && g.busy()) { stats.skipped++; continue; }          // WebGPU: its queue is full, the GPU is behind
      // the latest read back (asynchronous: a pump or so behind the solve)
      let torn = false;
      if (!sync) {
        const tq = now(); torn = tornFrom(M, g.readCellsAsync()); stats.readMs += now() - tq;
        const tn = now();
        if (g.readNodesAsync(M.X, M.V, M.FREE)) { R.fresh = true; if (s.n - (R.endN || 0) >= 200) { R.endN = s.n; checkEnd(M); } }
        stats.nodeMs += now() - tn;
      }
      for (let k = 0; k < each; k++) {
        if (!(s.t < s.T1 && s.t < R.target + M.dt)) break;
        const tq0 = now(); g.step(s.t, M.dt, s.relax ? 250 : s.alpha); stats.stepMs += now() - tq0;
        s.t += M.dt; s.n++; R.steps++; did++;
        if (s.n % SYNC === 0) {
          if (sync && tornFrom(M, g.readCells())) torn = true;
          const dmg = commonSync(M, s.t, torn, SYNC * M.dt); torn = false;
          g.setSources(s.SRC); g.setGas(M.GP);
          if (s.IMPN.length) { g.setImpulses(s.IMPN); s.IMPN.length = 0; }
          if (dmg) g.setDamage(M.CFD);
        }
        if (sync && s.n % 200 === 0) { g.readNodes(true, M.X, M.V, M.FREE); checkEnd(M); }
        if (s.t >= s.T1) break;
      }
      if (R.wg) g.submit();
      if (s.t >= s.T1) R.state = 'finish';
    }
    stats.steps = did; stats.gpuSteps += did;
    const dtMs = now() - t0; stats.pumpMs = dtMs;
    for (const R of run) R.runMs += dtMs / run.length;
    for (const R of run) {
      if (R.state === 'finish') {
        if (R.wg) { R.state = 'finishing'; finishWG(R); continue; }
        out.push(finish(R)); pats.delete(R.id); continue;
      }
      const s = R.M.sim;
      if (R.watch && s.t - R.lastSnapT >= SNAP_DT && now() - R.lastSnapMs >= SNAP_MS) {
        // (the positions and torn cells of the last asynchronous read back: a frame or so behind the solve)
        if (R.spec.syncReads) { R.gpu.readNodes(false, R.M.X, R.M.V, R.M.FREE); R.fresh = true; }
        if (R.fresh) { R.fresh = false; out.push(snapshot(R, false)); }
      }
    }
    admit();
    return out;
  }
  // WebGPU end of run: wait for the queue, then everything the settle reads (bench finishWG); the final goes out on the
  // next pump
  async function finishWG(R) {
    const M = R.M, g = R.gpu;
    try {
      await g.readStateAsync({ CEP: M.CEP, CDM: M.CDM, TFL: M.TFL, HTP: M.HTP, HTH: M.HTH, HTPS: M.HTPS, TBP: M.TBP });
      if (R.state !== 'finishing') return;
      g.readNodes(true, M.X, M.V, M.FREE);
      tornFrom(M, g.readCells());
      R.finalMsg = finalize(R); R.state = 'final';
    } catch (e) { R.state = 'failed'; R.err = String(e && e.message || e); }
  }
  function finish(R) {
    const M = R.M, g = R.gpu;
    g.readNodes(true, M.X, M.V, M.FREE);
    tornFrom(M, g.readCells());
    g.readState({ CEP: M.CEP, CDM: M.CDM, TFL: M.TFL, HTP: M.HTP, HTPS: M.HTPS, TBP: M.TBP });
    return finalize(R);
  }
  function finalize(R) {
    const M = R.M;
    R.gpu.dispose(); R.gpu = null;
    R.debris = markDebris(M);
    R.state = 'done'; stats.done++;
    const m = snapshot(R, true);
    m.results = results(R);
    return m;
  }

  /* ------------------------------------------------------------ what the game draws (as the lattice runner) */
  function snapshot(R, final) {
    const ts0 = now();
    try { return snapshot1(R, final); } finally { stats.snapMs = now() - ts0; }
  }
  function snapshot1(R, final) {
    const M = R.M, s = M.sim, sp = R.spec, F = sp.frame, S = M.S, X = M.X, R0 = M.R0, up = M.up;
    R.lastSnapT = s.t; R.lastSnapMs = now();
    const deb = R.debris;
    const gone = i => M.FREE[i] || (deb && deb[i]);
    const open = c => c >= 0 && (M.CER[c] || (gone(M.CN[4 * c]) + gone(M.CN[4 * c + 1]) + gone(M.CN[4 * c + 2]) + gone(M.CN[4 * c + 3]) >= 2));
    const CM = M.CMAP;
    if (final) R.open = open;
    const skins = [], tr = [];
    R.lastSkin = R.lastSkin || [];
    M.PAN.forEach((L, p) => {
      if (!L.skin) return;
      const nu = L.nu, nv = L.nv, d = new Float32Array((nu + 1) * (nv + 1) * 4);
      const inside = s.C[L.ax] < L.val;
      const so = inside ? outerSoot(M, L, open) : null;
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const k = j * (nu + 1) + i, n = L.at[k], o = 4 * k;
        d[o] = X[3 * n] - R0[3 * n]; d[o + 1] = X[3 * n + 1] - R0[3 * n + 1]; d[o + 2] = X[3 * n + 2] - R0[3 * n + 2];
        let f = 0;
        if (i < nu && j < nv && open(CM[L.off + j * nu + i])) f |= 1;
        if (gone(n)) f |= 2;
        if (M.TBRK[n] >= 0) f |= 4;
        d[o + 3] = f + Math.min(.99, so ? so[k] : M.SOOT[n]);
        if (!(d[o] === d[o])) { d[o] = d[o + 1] = d[o + 2] = 0; d[o + 3] = 2; }
      }
      const last = R.lastSkin[p];
      let i0 = nu + 1, i1 = -1, j0 = nv + 1, j1 = -1;
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const o = 4 * (j * (nu + 1) + i);
        const ch = last ? Math.abs(d[o] - last[o]) > 2e-4 || Math.abs(d[o + 1] - last[o + 1]) > 2e-4 || Math.abs(d[o + 2] - last[o + 2]) > 2e-4 || Math.abs(d[o + 3] - last[o + 3]) > .02
          : d[o] !== 0 || d[o + 1] !== 0 || d[o + 2] !== 0 || d[o + 3] !== 0;
        if (ch) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
      }
      R.lastSkin[p] = d;
      if (i1 < 0 && last) return;
      if (i1 < 0) { i0 = 0; j0 = 0; i1 = 0; j1 = 0; }
      const w = i1 - i0 + 1, h = j1 - j0 + 1, sb = new Float32Array(w * h * 4);
      for (let j = 0; j < h; j++) sb.set(d.subarray(4 * ((j0 + j) * (nu + 1) + i0), 4 * ((j0 + j) * (nu + 1) + i0 + w)), 4 * j * w);
      skins.push({ p, ax: L.ax, val: L.val, u0: L.u0, v0: L.v0, nu, nv, i0, j0, w, h, data: sb });
      tr.push(sb.buffer);
    });
    // the inner structure near the holes of the struck plate
    const L0 = M.PAN[0], ua = L0.ax === 0 ? 2 : 0, va = L0.ax === 1 ? 2 : 1;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, nt = 0;
    for (let k = L0.off; k < L0.off + L0.nu * L0.nv; k++) { const c = CM[k]; if (!open(c)) continue;
      const u = M.CRC[3 * c + ua], v = M.CRC[3 * c + va]; nt++;
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
      const PAT = [[.27, .31], [.74, .69]], cells = [];
      M.PAN.forEach((L, p) => {
        if (L.skin) return;
        for (let k = L.off; k < L.off + L.nu * L.nv; k++) { const c = CM[k]; if (c < 0) continue; const cx = M.CRC[3 * c + ua], cy = M.CRC[3 * c + va];
          if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) cells.push(c); }
      });
      const stride = Math.max(1, Math.ceil(cells.length * 2 / (MAXIN * .85)));
      const base = [0, .55, .42, .42, .38, .38];
      for (let q = 0; q < cells.length; q += stride) {
        const c = cells[q], a = M.CN[4 * c], b = M.CN[4 * c + 1], cc = M.CN[4 * c + 2], dd = M.CN[4 * c + 3], torn = open(c);
        if (!torn && (gone(a) || gone(b) || gone(cc) || gone(dd))) continue;
        for (const [u, v] of PAT) {
          let x, y, z, m = -1;
          const w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = u * v, w3 = (1 - u) * v;
          if (!torn) {
            x = X[3 * a] * w0 + X[3 * b] * w1 + X[3 * cc] * w2 + X[3 * dd] * w3;
            y = X[3 * a + 1] * w0 + X[3 * b + 1] * w1 + X[3 * cc + 1] * w2 + X[3 * dd + 1] * w3;
            z = X[3 * a + 2] * w0 + X[3 * b + 2] * w1 + X[3 * cc + 2] * w2 + X[3 * dd + 2] * w3;
          } else {
            m = u < .5 ? (v < .5 ? a : dd) : (v < .5 ? b : cc);
            if (gone(m)) continue;
            const rx = R0[3 * a] * w0 + R0[3 * b] * w1 + R0[3 * cc] * w2 + R0[3 * dd] * w3;
            const ry = R0[3 * a + 1] * w0 + R0[3 * b + 1] * w1 + R0[3 * cc + 1] * w2 + R0[3 * dd + 1] * w3;
            const rz = R0[3 * a + 2] * w0 + R0[3 * b + 2] * w1 + R0[3 * cc + 2] * w2 + R0[3 * dd + 2] * w3;
            x = X[3 * m] + (rx - R0[3 * m]) * .8; y = X[3 * m + 1] + (ry - R0[3 * m + 1]) * .8; z = X[3 * m + 2] + (rz - R0[3 * m + 2]) * .8;
          }
          const n0 = m >= 0 ? m : a, so = M.SOOT[n0], fr = M.NFRM[n0];
          const bb = (base[M.CPAN[c] + 1] || .4) * (fr === 2 ? 1.25 : fr === 1 ? 1.1 : 1) * (1 - .72 * so);
          push(x, y, z, bb, (torn || M.TBRK[n0] >= 0 ? 1 : 0) + (fr ? 2 : 0));
        }
      }
      // the struck plate's stiffener webs behind the rim
      const nn = L0.n;
      for (let k = 0; k < L0.at.length; k++) {
        const n = L0.at[k];
        if (!M.NFRM[n] || gone(n)) continue;
        const u = R0[3 * n + ua], v = R0[3 * n + va];
        if (u < x0 || u > x1 || v < y0 || v > y1) continue;
        const w = M.NFRM[n] === 2 ? .4 : .18, so = M.SOOT[n], e = M.TBRK[n] >= 0 ? 1 : 0, sg = s.C[L0.ax] < L0.val ? -1 : -1;
        for (let q = 1; q <= (M.NFRM[n] === 2 ? 3 : 1); q++) push(X[3 * n] + nn[0] * sg * w * q / 3, X[3 * n + 1] + nn[1] * sg * w * q / 3, X[3 * n + 2] + nn[2] * sg * w * q / 3, .5 * (1 - .6 * so), e + 2);
      }
      inner = A.subarray(0, nIn * 6).slice();
      tr.push(inner.buffer);
    }
    let torn0 = 0, below = 0, setMax = 0;
    const byPlate = new Array(M.PAN.length).fill(0);
    for (let c = 0; c < M.NC; c++) {
      if (!open(c)) continue;
      byPlate[M.CPAN[c]] += M.CAR[c];
      if (!M.PAN[M.CPAN[c]].skin) continue;
      torn0 += M.CAR[c];
      const lx = M.CRC[3 * c], ly = M.CRC[3 * c + 1], lz = M.CRC[3 * c + 2];
      if (F.O[1] + F.X[1] * lx + F.Y[1] * ly + F.Z[1] * lz < (sp.wl || 0)) below += M.CAR[c];
    }
    for (const n of L0.at) if (!gone(n)) { const d = Math.hypot(X[3 * n] - R0[3 * n], X[3 * n + 1] - R0[3 * n + 1], X[3 * n + 2] - R0[3 * n + 2]); if (d > setMax) setMax = d; }
    void up;
    return { type: 'state', id: R.id, final, t: s.t, T1: s.T1, skins, inner, nIn, tornSkin: torn0, tornBelow: below, byPlate, setMax,
      runMs: R.runMs, steps: R.steps, wallMs: now() - R.tReal0, transfer: tr };
  }
  function outerSoot(M, L, open) {
    const nu = L.nu, nv = L.nv, W = nu + 1, D = new Float32Array(W * (nv + 1)).fill(1e9), Q = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) if (open(M.CMAP[L.off + j * nu + i])) for (const [a, b] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) { const k = b * W + a; if (D[k] > 0) { D[k] = 0; Q.push(k); } }
    const out = new Float32Array(W * (nv + 1));
    if (!Q.length) return out;
    const upv = L.ax === 1 ? 0 : 1, lim = 3 / M.S;
    for (let h = 0; h < Q.length; h++) {
      const k = Q[h], i = k % W, j = (k / W) | 0, d0 = D[k];
      if (d0 >= lim * 2) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a > nu || b > nv) continue;
        const c = dj > 0 && upv ? .5 : 1, q = b * W + a;
        if (d0 + c < D[q]) { D[q] = d0 + c; Q.push(q); }
      }
    }
    for (let k = 0; k < out.length; k++) { const x = 1 - D[k] / lim; out[k] = x > 0 ? .95 * x * x : 0; }
    return out;
  }
  function results(R) {
    const M = R.M, F = R.spec.frame, X = M.X, L0 = M.PAN[0];
    // plastic work: the membranes' equivalent plastic strain against the yield (coarse)
    let work = 0;
    for (let c = 0; c < M.NC; c++) { let eb = 0; for (let t = 0; t < 4; t++) eb += M.CEP[16 * c + 4 * t + 3]; eb /= 4; if (eb > 0) work += MATS[M.CMAT[c]].sy * eb * M.CAR[c] * M.CH[c]; }
    const lines = new Set();
    for (let t = 0; t < M.NT; t++) if (M.TFL[t] && M.TKIND[t] === 2 && M.TPAN[t] === 0) lines.add(M.TLINE[t]);
    const gone = i => M.FREE[i] || (R.debris && R.debris[i]);
    const rim = [];
    const ua = L0.ax === 0 ? 2 : 0, va = L0.ax === 1 ? 2 : 1;
    for (const n of L0.at) {
      if (M.TBRK[n] < 0 || gone(n)) continue;
      const lx = X[3 * n], ly = X[3 * n + 1], lz = X[3 * n + 2];
      rim.push(F.O[0] + F.X[0] * lx + F.Y[0] * ly + F.Z[0] * lz, F.O[1] + F.X[1] * lx + F.Y[1] * ly + F.Z[1] * lz, F.O[2] + F.X[2] * lx + F.Y[2] * ly + F.Z[2] * lz, ly);
    }
    let cx = 0, cy = 0, n = 0, A = 0;
    for (let k = L0.off; k < L0.off + L0.nu * L0.nv; k++) { const c = M.CMAP[k]; if (!R.open(c)) continue; cx += M.CRC[3 * c + ua]; cy += M.CRC[3 * c + va]; n++; A += M.CAR[c]; }
    const hole = n ? { x: cx / n, y: cy / n, A } : null;
    let floor = null;
    if (hole) for (const L of M.PAN) if (!L.skin && L.ax === 1 && L.val < hole.y && (!floor || L.val > floor.y)) floor = { y: L.val };
    const loc = (lx, ly, lz) => [F.O[0] + F.X[0] * lx + F.Y[0] * ly + F.Z[0] * lz, F.O[1] + F.X[1] * lx + F.Y[1] * ly + F.Z[1] * lz, F.O[2] + F.X[2] * lx + F.Y[2] * ly + F.Z[2] * lz];
    return { work, framesTorn: lines.size, rim: Float32Array.from(rim.length > 1600 ? rim.filter((_, k) => Math.floor(k / 4) % Math.ceil(rim.length / 1600) === 0) : rim),
      hole: hole ? { c: loc(hole.x, hole.y, 0), A: hole.A, floor: floor ? loc(hole.x, floor.y + .1, -Math.min(2, R.spec.depth || 2) * .5) : null } : null };
  }

  return { submit, target, drop, pump, stats, pats, queue, get busy() { for (const R of pats.values()) if (R.state === 'run' || R.state === 'queued' || R.state === 'finishing' || R.state === 'final') return true; return false; } };
}
