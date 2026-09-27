/* The shell solver's runner (bench 200fe28: shell/model.js; shell/gpu_wgpu.js WebGPU, shell/gpu.js WebGL2): the same
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
const SNAP_DT = .0004, SNAP_MS = 60, MAXIN = 24000, RUNNING = 2;

export function createShellRunner(gl, o = {}) {
  const pats = new Map(), queue = [];
  const stats = { waits: 0, readMs: 0, nodeMs: 0, stepMs: 0, steps: 0, pumps: 0, gpuSteps: 0, built: 0, done: 0, buildMs: 0, snapMs: 0, pumpMs: 0, backend: o.wg ? 'webgpu' : 'webgl2', skipped: 0 };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function submit(id, spec) {
    const t0 = now();
    const S = spec.shellS || .25, scene = sceneOf(spec, S), M = buildShell(scene, S);
    M.fastEnd = !!spec.fastEnd;
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
        R.LAT = SYNC * Math.max(2, Math.round((R.spec.latMs || o.latMs || 1) * 1e-3 / (SYNC * R.M.dt)));
        R.gpu = wg ? createWGPU(o.wg, gpuModel(R.M), { batch: Math.min(200, Math.max(SYNC, R.LAT / 2)), depth: o.depth || 2 }) : createGPU(gl, gpuModel(R.M));
        R.wg = !!wg; R.gpu.upload(); R.gpu.setSources(R.M.sim.SRC); R.gpu.setGas(R.M.GP);
        R.state = 'run'; running++;
      } catch (e) { R.state = 'failed'; R.err = String(e && e.message || e); if (R.gpu) { try { R.gpu.dispose(); } catch (e2) { /* */ } R.gpu = null; } }
    }
  }
  function target(id, t, watch) { const R = pats.get(id); if (R) { R.target = Math.max(R.target, t); if (watch !== undefined) R.watch = !!watch; } }
  function drop(id) { const R = pats.get(id); if (!R) return; if (R.gpu) R.gpu.dispose(); R.gpu = null; R.state = 'dropped'; pats.delete(id); admit(); }
  const tornFrom = (M, cl) => { let torn = false; if (cl) for (let c = 0; c < M.NC; c++) if (cl[4 * c] > .5 && M.CKN[c] !== 1) { M.CER[c] = M.CER[c] || 1; M.CTE[c] = cl[4 * c + 1]; openCell(M, c, M.CTE[c]); if (attachedCell(M, c)) torn = true; } return torn; };

  /* the bench's step (200fe28, AUDIT A6): read-backs tagged with their step and used a fixed LAT steps later (a whole
     number of syncs, ~R.latMs): torn cells for vents, hole sources and fragments at every sync, the node motion for the
     end-of-run test every 200 steps. WebGPU, WebGL2 (async or blocking) all end on the same step with the same result.
     A read not in yet (WebGPU's mapping): the pump stops there and goes on at the next tick. */
  function needWait(R) {
    const s = R.M.sim, n = s.n + 1, m = n - R.LAT, g = R.gpu;
    return (n % SYNC === 0 && m > 0 && m % SYNC === 0 && !g.has('c', m)) || (m > 0 && m % 200 === 0 && !g.has('n', m));
  }
  function syncStep(R) {
    const M = R.M, s = M.sim, g = R.gpu, n = s.n, m = n - R.LAT;
    g.requestCells(n);
    let torn = false;
    if (m > 0 && m % SYNC === 0) { const tq = now(); torn = tornFrom(M, g.cellsOf(m)); stats.readMs += now() - tq; }
    const dmg = commonSync(M, s.t, torn, SYNC * M.dt);
    g.setSources(s.SRC); g.setGas(M.GP);
    if (s.IMPN.length) { g.setImpulses(s.IMPN); s.IMPN.length = 0; }
    if (dmg) g.setDamage(M.CFD);
  }
  function endCheck(R) {
    const M = R.M, s = M.sim, g = R.gpu, m = s.n - R.LAT;
    if (s.n % 200 === 0) g.requestNodes(s.n);
    if (m > 0 && m % 200 === 0) {
      const VE = R.VE || (R.VE = { V: new Float64Array(3 * M.N), FREE: new Uint8Array(M.N), U: new Float64Array(3 * M.N) });
      const tn = now();
      if (g.nodesOf(m, VE.V, VE.FREE, VE.U)) { const V0 = M.V, F0 = M.FREE; M.V = VE.V; M.FREE = VE.FREE; M.U = VE.U; checkEnd(M); M.V = V0; M.FREE = F0; M.U = null; }
      stats.nodeMs += now() - tn;
    }
  }

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
      const M = R.M, s = M.sim, g = R.gpu;
      // (the latest positions for the drawing: an untagged read, not used by the solve)
      if (!R.spec.syncReads && g.readNodesAsync(M.X, M.Vd || (M.Vd = new Float64Array(3 * M.N)), M.FREE)) R.fresh = true;
      if (R.wg && g.busy()) { stats.skipped++; continue; }
      for (let k = 0; k < each; k++) {
        if (!(s.t < s.T1 && s.t < R.target + M.dt)) break;
        if (needWait(R)) { if (R.wg) { g.submit(); stats.waits++; break; } }
        const tq0 = now(); g.step(s.t, M.dt, s.relax ? 250 : s.alpha); stats.stepMs += now() - tq0;
        s.t += M.dt; s.n++; R.steps++; did++;
        if (s.n % SYNC === 0) syncStep(R);
        endCheck(R);
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
      if (g.flush) await g.flush();
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
    m.debris = debrisOf(R); if (m.debris) m.transfer.push(m.debris.buffer);
    return m;
  }
  /* the pieces that came loose (no longer joined to the ship through intact cells and members): dots on their cells,
     in the model frame, with the solver's velocity, for the game to fly on (land on the deck, sink): x y z vx vy vz,
     brightness, a piece id */
  function debrisOf(R) {
    const M = R.M, F = R.spec.frame, deb = R.debris, X = M.X, V = M.V, MAXD = 6000;
    const gone = i => M.FREE[i] || deb[i];
    const cells = [];
    for (let c = 0; c < M.NC; c++) { const q = M.CN, k = 4 * c; if (gone(q[k]) && gone(q[k + 1]) && gone(q[k + 2]) && gone(q[k + 3])) cells.push(c); }
    if (!cells.length) return null;
    const per = Math.max(1, Math.min(4, Math.floor(MAXD / cells.length))), stride = Math.max(1, Math.ceil(cells.length * per / MAXD));
    const PAT = [[.25, .25], [.75, .75], [.75, .25], [.25, .75]], out = new Float32Array(Math.ceil(cells.length / stride) * per * 8);
    const w = v => [F.X[0] * v[0] + F.Y[0] * v[1] + F.Z[0] * v[2], F.X[1] * v[0] + F.Y[1] * v[1] + F.Z[1] * v[2], F.X[2] * v[0] + F.Y[2] * v[1] + F.Z[2] * v[2]];
    let n = 0;
    for (let q = 0; q < cells.length; q += stride) {
      const c = cells[q], a = M.CN[4 * c], b = M.CN[4 * c + 1], cc = M.CN[4 * c + 2], dd = M.CN[4 * c + 3];
      const vel = w([(V[3 * a] + V[3 * b] + V[3 * cc] + V[3 * dd]) / 4, (V[3 * a + 1] + V[3 * b + 1] + V[3 * cc + 1] + V[3 * dd + 1]) / 4, (V[3 * a + 2] + V[3 * b + 2] + V[3 * cc + 2] + V[3 * dd + 2]) / 4]);
      // (a node left alone by eroded cells can carry an unphysical speed: plating fragments leave at 150 m/s at most)
      { const sp = Math.hypot(vel[0], vel[1], vel[2]); if (sp > 150) { vel[0] *= 150 / sp; vel[1] *= 150 / sp; vel[2] *= 150 / sp; } }
      const skin = M.PAN[M.CPAN[c]].skin ? 1 : 0, so = (M.SOOT[a] + M.SOOT[cc]) / 2;
      for (let k = 0; k < per; k++) {
        const [u, v] = PAT[k], w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = u * v, w3 = (1 - u) * v;
        const l = [0, 1, 2].map(z => X[3 * a + z] * w0 + X[3 * b + z] * w1 + X[3 * cc + z] * w2 + X[3 * dd + z] * w3);
        if (!(l[0] === l[0])) continue;
        const p = w(l), o = 8 * n++;
        out[o] = F.O[0] + p[0]; out[o + 1] = F.O[1] + p[1]; out[o + 2] = F.O[2] + p[2];
        out[o + 3] = vel[0]; out[o + 4] = vel[1]; out[o + 5] = vel[2]; out[o + 6] = (skin ? .55 : .42) * (1 - .6 * so); out[o + 7] = c;
      }
    }
    return out.subarray(0, 8 * n).slice();
  }

  /* ------------------------------------------------------------ what the game draws (as the lattice runner) */
  /* a plate's uniform texture grid (S) against its solver grid (ul, vl): for each texel column / row the solver cell
     and fraction under it (nodes), the cell under the texel's middle (cells), and the ease toward anchored edges */
  function skinMap(R, L, S) {
    R.skinMaps = R.skinMaps || new Map();
    let m = R.skinMaps.get(L); if (m) return m;
    const ul = L.ul, vl = L.vl, nu = Math.max(1, Math.round((ul[ul.length - 1] - ul[0]) / S)), nv = Math.max(1, Math.round((vl[vl.length - 1] - vl[0]) / S));
    const find = (Lc, x) => { let k = 0; while (k < Lc.length - 2 && Lc[k + 1] <= x) k++; return k; };
    const ease = (x, a, b, oa, ob) => { let w = 1; const E = 1.5; if (oa) w *= sm((x - a) / E); if (ob) w *= sm((b - x) / E); return w; };
    const sm = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    const axisMap = (Lc, n, oa, ob) => { const I = new Int32Array(n + 1), Fr = new Float32Array(n + 1), C = new Int32Array(n + 1), E = new Float32Array(n + 1);
      for (let i = 0; i <= n; i++) { const x = Math.min(Lc[Lc.length - 1], Lc[0] + i * S), k = find(Lc, x); I[i] = k; Fr[i] = Math.max(0, Math.min(1, (x - Lc[k]) / (Lc[k + 1] - Lc[k])));
        C[i] = find(Lc, Math.min(Lc[Lc.length - 1] - 1e-6, x + S / 2)); E[i] = ease(x, Lc[0], Lc[Lc.length - 1], oa, ob); }
      return [I, Fr, C, E]; };
    const op = L.open || [0, 0, 0, 0];
    const [iu, fx, ciu, eu] = axisMap(ul, nu, op[0], op[1]), [jv, fy, cjv, ev] = axisMap(vl, nv, op[2], op[3]);
    m = { nu, nv, iu, fx, ciu, eu, jv, fy, cjv, ev }; R.skinMaps.set(L, m);
    return m;
  }
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
    // a skin as the game's texture wants it: on a uniform S grid over the plate (a graded plate resampled: bilinear
    // displacement, the torn / gone / broken flags of the cell or node under each texel). While the solve runs, pieces
    // that came loose fly on in it (drawn where the solver has them); at the end they leave as debris (results.debris)
    // and their dots go. The displacement eases to nothing over the last 1.5 m before a plate's anchored edges, so the
    // patch meets the model beyond it without a step.
    M.PAN.forEach((L, p) => {
      if (!L.skin) return;
      const mp = skinMap(R, L, S), nu = mp.nu, nv = mp.nv, d = new Float32Array((nu + 1) * (nv + 1) * 4);
      const inside = s.C[L.ax] < L.val;
      const so = inside ? outerSoot(M, L, open) : null, Wn = L.nu + 1;
      const skGone = i => final ? gone(i) : 0;
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const k = j * (nu + 1) + i, o = 4 * k, ic = mp.iu[i], jc = mp.jv[j], fx = mp.fx[i], fy = mp.fy[j];
        const k00 = jc * Wn + ic, n00 = L.at[k00], n10 = L.at[k00 + 1], n01 = L.at[k00 + Wn], n11 = L.at[k00 + Wn + 1];
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy, eb = mp.eu[i] * mp.ev[j];
        for (let q = 0; q < 3; q++) d[o + q] = eb * ((X[3 * n00 + q] - R0[3 * n00 + q]) * w00 + (X[3 * n10 + q] - R0[3 * n10 + q]) * w10 + (X[3 * n01 + q] - R0[3 * n01 + q]) * w01 + (X[3 * n11 + q] - R0[3 * n11 + q]) * w11);
        const nn = fx < .5 ? (fy < .5 ? n00 : n01) : (fy < .5 ? n10 : n11), kn = fx < .5 ? (fy < .5 ? k00 : k00 + Wn) : (fy < .5 ? k00 + 1 : k00 + Wn + 1);
        let f = 0;
        if (i < nu && j < nv) { const c = CM[L.off + mp.cjv[j] * L.nu + mp.ciu[i]]; if (c >= 0 && (M.CER[c] || (final && open(c)))) f |= 1; }
        if (skGone(nn)) f |= 2;
        if (M.TBRK[nn] >= 0) f |= 4;
        d[o + 3] = f + Math.min(.99, so ? so[kn] : M.SOOT[nn]);
        if (!(d[o] === d[o] && d[o + 1] === d[o + 1] && d[o + 2] === d[o + 2])) { d[o] = d[o + 1] = d[o + 2] = 0; d[o + 3] = 2; }
      }
      // unsupported columns (bit 8): what stands on this plating (a gun on the deck, a deckhouse, rails; on a side the
      // fittings on it) needs the plating round its foot: the share of intact plating within 1.5 m (horizontal plating;
      // 0.75 m on a side) under a half, or the plating there torn or gone. The model's dots over them are left out and
      // the blast system flies them as loose pieces (engine/models.js blastAt, system.js)
      {
        const W1 = nu + 1, H1 = nv + 1, rr = Math.max(1, Math.round((L.ax === M.up ? 1.5 : .75) / S)), sat = new Float32Array((W1 + 1) * (H1 + 1));
        for (let j = 0; j < H1; j++) for (let i = 0; i < W1; i++) { const dead = (d[4 * (j * W1 + i) + 3] | 0) & 3 ? 1 : 0; sat[(j + 1) * (W1 + 1) + i + 1] = dead + sat[j * (W1 + 1) + i + 1] + sat[(j + 1) * (W1 + 1) + i] - sat[j * (W1 + 1) + i]; }
        for (let j = 0; j < H1; j++) for (let i = 0; i < W1; i++) {
          const a0 = Math.max(0, i - rr), a1 = Math.min(W1, i + rr + 1), b0 = Math.max(0, j - rr), b1 = Math.min(H1, j + rr + 1);
          const dead = sat[b1 * (W1 + 1) + a1] - sat[b0 * (W1 + 1) + a1] - sat[b1 * (W1 + 1) + a0] + sat[b0 * (W1 + 1) + a0], n = (a1 - a0) * (b1 - b0);
          const o = 4 * (j * W1 + i);
          if (dead > .5 * n) d[o + 3] += 8;
        }
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
      skins.push({ p, ax: L.ax, val: L.val, u0: L.u0, v0: L.v0, nu, nv, i0, j0, w, h, data: sb, S });
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
      const cells = [];
      M.PAN.forEach((L, p) => {
        if (L.skin) return;
        for (let k = L.off; k < L.off + L.nu * L.nv; k++) { const c = CM[k]; if (c < 0) continue; const cx = M.CRC[3 * c + ua], cy = M.CRC[3 * c + va];
          if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) cells.push(c); }
      });
      const per = c => Math.min(12, Math.max(3, Math.round(4 * M.CAR[c] / (S * S))));
      let want = 0; for (const c of cells) want += per(c);
      const stride = Math.max(1, Math.ceil(want / (MAXIN * .85)));
      const base = [0, .55, .42, .42, .38, .38];
      for (let q = 0; q < cells.length; q += stride) {
        const c = cells[q], a = M.CN[4 * c], b = M.CN[4 * c + 1], cc = M.CN[4 * c + 2], dd = M.CN[4 * c + 3], torn = open(c);
        if (!torn && (gone(a) || gone(b) || gone(cc) || gone(dd))) continue;
        // (jittered in the cell, a hash of the cell: the plating reads as plating, not as a grid of points)
        const np = per(c), PAT = [];
        for (let k = 0; k < np; k++) { let h = Math.imul(c * 16 + k + 1, 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA77); const h2 = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); PAT.push([.06 + .88 * ((h >>> 8) & 1023) / 1023, .06 + .88 * ((h2 >>> 8) & 1023) / 1023]); }
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
        if (!M.NFRM[n] || gone(n) || M.TBRK[n] >= 0) continue;          // (under plating that tore: no web hangs there on its own)
        const u = R0[3 * n + ua], v = R0[3 * n + va];
        if (u < x0 || u > x1 || v < y0 || v > y1) continue;
        const w = M.NFRM[n] === 2 ? .4 : .18, so = M.SOOT[n], e = M.TBRK[n] >= 0 ? 1 : 0, sg = s.C[L0.ax] < L0.val ? -1 : -1;
        for (let q = 1; q <= (M.NFRM[n] === 2 ? 3 : 1); q++) push(X[3 * n] + nn[0] * sg * w * q / 3, X[3 * n + 1] + nn[1] * sg * w * q / 3, X[3 * n + 2] + nn[2] * sg * w * q / 3, .5 * (1 - .6 * so), e + 2);
      }
      // the far side of the pocket (what the patch does not model: the next bulkhead / the ship's far side, dark, charred):
      // a hole never shows the sea through the ship
      if (sp.farWall !== false) { const bx = sp.box, depth = L0.ax === 2 ? bx[2] : L0.ax === 1 ? bx[1] : bx[0], st2 = Math.max(.3, Math.sqrt((x1 - x0) * (y1 - y0) / 900));
        for (let a2 = x0; a2 <= x1; a2 += st2) for (let b2 = y0; b2 <= y1; b2 += st2) {
          const h = Math.imul((a2 * 97 + b2 * 13) * 16 | 0, 0x9E3779B1) >>> 0, j1 = (h & 1023) / 1023 - .5, j2 = ((h >>> 10) & 1023) / 1023 - .5;
          const p = [0, 0, 0]; p[L0.ax] = depth + .05; p[ua] = a2 + j1 * st2; p[va] = b2 + j2 * st2;
          push(p[0], p[1], p[2], .3, 2); } }
      inner = A.subarray(0, nIn * 6).slice();
      tr.push(inner.buffer);
    }
    let torn0 = 0, below = 0, setMax = 0;
    const byPlate = new Array(sp.plates.length).fill(0);
    for (let c = 0; c < M.NC; c++) {
      if (!open(c)) continue;
      byPlate[M.PAN[M.CPAN[c]].plate] += M.CAR[c];
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
    let cx = 0, cy = 0, n = 0, A = 0, bu0 = 1e9, bu1 = -1e9, bv0 = 1e9, bv1 = -1e9;
    for (let k = L0.off; k < L0.off + L0.nu * L0.nv; k++) { const c = M.CMAP[k]; if (!R.open(c)) continue; const u = M.CRC[3 * c + ua], v = M.CRC[3 * c + va]; cx += u; cy += v; n++; A += M.CAR[c];
      if (u < bu0) bu0 = u; if (u > bu1) bu1 = u; if (v < bv0) bv0 = v; if (v > bv1) bv1 = v; }
    const hole = n ? { x: cx / n, y: cy / n, A } : null;
    let floor = null;
    if (hole && L0.ax !== 2) for (const L of M.PAN) if (!L.skin && L.ax === 1 && L.val < hole.y && (!floor || L.val > floor.y)) floor = { y: L.val };
    // (a deck struck: the floor under the hole is the first deck below that still stands there)
    if (hole && L0.ax === 2) {
      const decks = M.PAN.filter(L => !L.skin && L.ax === 2 && L.val < 0).sort((p, q) => q.val - p.val);
      for (const L of decks) { let tot = 0, op = 0; for (let k = L.off; k < L.off + L.nu * L.nv; k++) { const c = M.CMAP[k]; if (c < 0) continue; const u = M.CRC[3 * c], v = M.CRC[3 * c + 1];
          if (u < bu0 || u > bu1 || v < bv0 || v > bv1) continue; tot += M.CAR[c]; if (R.open(c)) op += M.CAR[c]; }
        if (tot > 0 && op < .5 * tot) { floor = { z: L.val }; break; } }
      if (!floor && decks.length) floor = { z: decks[decks.length - 1].val };
    }
    const loc = (lx, ly, lz) => [F.O[0] + F.X[0] * lx + F.Y[0] * ly + F.Z[0] * lz, F.O[1] + F.X[1] * lx + F.Y[1] * ly + F.Z[1] * lz, F.O[2] + F.X[2] * lx + F.Y[2] * ly + F.Z[2] * lz];
    return { work, framesTorn: lines.size, rim: Float32Array.from(rim.length > 1600 ? rim.filter((_, k) => Math.floor(k / 4) % Math.ceil(rim.length / 1600) === 0) : rim),
      hole: hole ? { c: loc(hole.x, hole.y, 0), A: hole.A, bb: [bu0 - .3, bu1 + .3, bv0 - .3, bv1 + .3],
        floor: floor ? (floor.z !== undefined ? loc(hole.x, hole.y, floor.z + .1) : loc(hole.x, floor.y + .1, -Math.min(2, R.spec.depth || 2) * .5)) : null } : null };
  }

  return { submit, target, drop, pump, stats, pats, queue, get busy() { for (const R of pats.values()) if (R.state === 'run' || R.state === 'queued' || R.state === 'finishing' || R.state === 'final') return true; return false; } };
}
