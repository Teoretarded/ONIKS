/* Voxel ships (prototype): the game system. A ship drawn and damaged as one lattice of 0.25 m plating cells
   (vox/build.js), its hits solved off the main thread (vox/worker.js -> vox/solver.js) and played back as a pure
   function of the time since the hit (exact scrubbing, stills, re-runs), drawn by vox/render.js in place of the model.

   Opt-in per unit (the lab's Voxel mode; nothing in a match uses it yet):
     game.vox = {
       enable(uid) -> Promise          build the class's lattice (once a class) and draw this unit with it
       disable(uid)                    the model again
       hit(uid, o) -> shot             o: { C (charge, model frame), entry, dir (inward unit), W (kg TNT), fuze, kind, speed,
                                        dia, tHit (game time of the impact; the solve starts now, so it can start before) }
       state(uid)                      { state: 'off' | 'building' | 'ready' | 'solving' | 'done' | 'error', tSolved, wall, meta, metrics }
       data(uid, o)                    what the picture holds at tau: the pieces and fragments (model frame, with velocities),
                                       the attached plating moved, the metrics (for the lab's recorder)
       on(uid)                         drawn as voxels
     } */
import { modelDots, dotsReady } from '../blast/support.js';
import { createVoxRender } from './render.js';
import { attitude } from '../engine/models.js';

export async function createVox(game) {
  const R = game.R, sim = game.sim;
  if (!R || !R.gl) return null;
  const VR = createVoxRender(R);
  let worker = null;
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); }
  catch (e) { console.warn('vox: no worker', e); return null; }
  const built = new Map();       // model key -> { state, B, cloudKeyBase, waiters }
  const units = new Map();       // uid -> U
  let shotN = 0;
  worker.onerror = e => { const msg = 'vox worker failed to load: ' + (e && e.message || 'a module error (import a vox module in the console to see it)'); console.error(msg); for (const K of built.values()) if (K.state === 'building') { K.state = 'error'; K.err = msg; for (const f of K.wait) f(); K.wait.length = 0; } };
  worker.onmessage = e => {
    const m = e.data;
    if (m.op === 'built') { const K = built.get(m.key); if (!K) return; K.B = m; K.state = 'ready'; for (const f of K.wait) f(); K.wait.length = 0; return; }
    if (m.op === 'error') { console.error('vox worker', m.err); const K = built.get(m.key); if (K && K.state === 'building') { K.state = 'error'; K.err = m.err; for (const f of K.wait) f(); } for (const U of units.values()) if (U.shot && U.shot.id === m.shot) { U.shot.state = 'error'; U.shot.err = m.err; } return; }
    for (const U of units.values()) {
      const s = U.shot; if (!s || s.id !== m.shot) continue;
      if (m.op === 'meta') { s.meta = m; s.act = m.act; s.nFree = m.nFree; s.sootM = m.soot; s.tornAt = new Float32Array(m.nFree).fill(1e9); let a = 1e9, b = -1; for (const g of m.act) { if (g < a) a = g; if (g > b) b = g; } s.g0 = a; s.g1 = b + 1; }
      else if (m.op === 'fa') { s.FA.push(m); s.tSolved = m.t; for (let i = 0; i < s.nFree; i++) if ((m.flg[i] & 1) && s.tornAt[i] > 1e8) s.tornAt[i] = m.t; s.dirty = true; }
      else if (m.op === 'endA') { s.endA = m; s.tSolved = m.t; s.metrics = m.metrics; s.dirty = true; }
      else if (m.op === 'fb') { s.FB.push(m); s.tSolved = m.t; s.dirty = true; }
      else if (m.op === 'done') { s.state = 'done'; s.done = m; s.metrics = m.metrics; s.wall = m.wallMs; s.tSolved = 1e9; }
    }
  };
  function ensureBuilt(key, type) {
    let K = built.get(key);
    if (K && K.state !== 'error') return K.state === 'ready' ? Promise.resolve(K) : new Promise(r => K.wait.push(() => r(K)));
    K = { state: 'building', wait: [] }; built.set(key, K);
    const ent = R.models.get(key);
    // (the finest level of every part, the interior's too: the lattice's cells come from it)
    try { R.models.warm(key, [0]); } catch (e) { /* */ }
    const M = modelDots(ent);
    const D = M.D.slice(0, M.n * 7), ins = Array.from(M.ins);
    worker.postMessage({ op: 'build', key, type, D, n: M.n, parts: M.parts, ins }, [D.buffer]);
    return new Promise(r => K.wait.push(() => r(K)));
  }
  async function enable(uid) {
    const u = sim.units.get(uid); if (!u) throw new Error('vox: no unit ' + uid);
    const key = u.def.model, ent = R.models.get(key);
    if (!ent) throw new Error('vox: no model ' + key);
    for (let i = 0; i < 400 && !dotsReady(ent); i++) await new Promise(r => setTimeout(r, 25));
    let U = units.get(uid);
    if (!U) units.set(uid, U = { uid, key, type: u.type, state: 'building', cloud: null, shot: null, hideModel: true });
    const K = await ensureBuilt(key, u.type);
    if (K.state !== 'ready') { U.state = 'error'; throw new Error('vox: build failed ' + (K.err || '')); }
    if (!U.cloud) { U.cloud = VR.add('u' + uid, K.B); U.B = K.B; }
    U.state = 'ready'; U.cloud.visible = true;
    return { n: K.B.n, S: K.B.S, ms: K.B.ms };
  }
  function disable(uid) { const U = units.get(uid); if (!U) return; if (U.cloud) VR.drop('u' + uid); units.delete(uid); }
  function hit(uid, o) {
    const U = units.get(uid); if (!U || !U.cloud) throw new Error('vox: not enabled ' + uid);
    U.cloud.reset();
    const s = { id: ++shotN, o, tHit: o.tHit !== undefined ? o.tHit : game.t, tPost: game.t, FA: [], FB: [], endA: null, state: 'solving', tSolved: -1, meta: null, dirty: true, wall0: performance.now() };
    U.shot = s;
    const oo = Object.assign({}, o); delete oo.tHit;
    worker.postMessage({ op: 'hit', key: U.key, shot: s.id, o: oo });
    return s;
  }
  function state(uid) {
    const U = units.get(uid); if (!U) return { state: 'off' };
    const s = U.shot;
    return { state: s ? s.state : U.state, tSolved: s ? s.tSolved : 0, wall: s ? (s.wall || performance.now() - s.wall0) : 0, meta: s && s.meta && { nFree: s.meta.nFree, nAnchor: s.meta.nAnchor, bonds: s.meta.bonds, R: s.meta.R, gas: s.meta.gas, dt: s.meta.dt, tA: s.meta.tA, punched: s.meta.punched, pocked: s.meta.pocked },
      metrics: s && s.metrics, n: U.B ? U.B.n : 0, err: s && s.err, lead: s ? s.tHit - s.tPost : 0 };
  }

  /* ------------------------------------------------------------ playback: the picture at tau */
  const lerpF = (arr, t) => { let k = 0; while (k + 1 < arr.length && arr[k + 1].t <= t) k++; const a = arr[k], b = arr[Math.min(arr.length - 1, k + 1)]; const f = b === a || b.t <= a.t ? 0 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))); return [a, b, f]; };
  function compose(U, tau) {
    const s = U.shot, C = U.cloud; if (!s || !s.act || !s.FA.length) return;
    if (tau === s.lastTau && !s.dirty) return;
    s.lastTau = tau; s.dirty = false;
    const pos = C.pos, nrm = C.nrm, act = s.act, nF = s.nFree;
    if (tau < 0) { for (let a = 0; a < nF; a++) { const g = act[a]; for (let k = 0; k < 4; k++) { pos[4 * g + k] = C.rest.pos[4 * g + k]; nrm[4 * g + k] = C.rest.nrm[4 * g + k]; } } C.upload(s.g0, s.g1); return; }
    const inB = s.endA && tau >= s.endA.t && s.FB.length;
    const [A0, A1, fa] = inB ? [s.FA[s.FA.length - 1], s.FA[s.FA.length - 1], 0] : lerpF(s.FA, tau);
    const soot = s.sootM;
    for (let a = 0; a < nF; a++) {
      const g = act[a], q = 3 * a, o = 4 * g;
      pos[o] = A0.pos[q] + (A1.pos[q] - A0.pos[q]) * fa; pos[o + 1] = A0.pos[q + 1] + (A1.pos[q + 1] - A0.pos[q + 1]) * fa; pos[o + 2] = A0.pos[q + 2] + (A1.pos[q + 2] - A0.pos[q + 2]) * fa;
      let nx = A0.nrm[q] + (A1.nrm[q] - A0.nrm[q]) * fa, ny = A0.nrm[q + 1] + (A1.nrm[q + 1] - A0.nrm[q + 1]) * fa, nz = A0.nrm[q + 2] + (A1.nrm[q + 2] - A0.nrm[q + 2]) * fa;
      const l = Math.hypot(nx, ny, nz); if (l > 1) { nx /= l; ny /= l; nz /= l; } else { nx = C.rest.nrm[o]; ny = C.rest.nrm[o + 1]; nz = C.rest.nrm[o + 2]; }
      nrm[o] = nx; nrm[o + 1] = ny; nrm[o + 2] = nz;
      let fl = A0.flg[a];
      if (inB) fl |= s.endA.flags[a] & 2;
      const ta = s.tornAt[a], heat = (fl & 1) && tau >= ta ? Math.exp(-(tau - ta) / .9) : 0;
      if (!((fl & 1) && tau >= ta)) fl &= ~1;
      pos[o + 3] = fl;
      nrm[o + 3] = Math.round(heat * 255) * 256 + (soot ? (soot[a] & 128) + Math.round((soot[a] & 127) * Math.min(1, tau / .02)) : 0);
    }
    if (inB) {
      const [B0, B1, fb] = lerpF(s.FB, tau), mov = s.endA.mov;
      for (let j = 0; j < mov.length; j++) {
        const a = mov[j], g = act[a], q = 3 * j, o = 4 * g;
        pos[o] = B0.pos[q] + (B1.pos[q] - B0.pos[q]) * fb; pos[o + 1] = B0.pos[q + 1] + (B1.pos[q + 1] - B0.pos[q + 1]) * fb; pos[o + 2] = B0.pos[q + 2] + (B1.pos[q + 2] - B0.pos[q + 2]) * fb;
        let nx = (B0.nrm[q] + (B1.nrm[q] - B0.nrm[q]) * fb) / 127, ny = (B0.nrm[q + 1] + (B1.nrm[q + 1] - B0.nrm[q + 1]) * fb) / 127, nz = (B0.nrm[q + 2] + (B1.nrm[q + 2] - B0.nrm[q + 2]) * fb) / 127;
        const l = Math.hypot(nx, ny, nz) || 1; nrm[o] = nx / l; nrm[o + 1] = ny / l; nrm[o + 2] = nz / l;
        const st = B0.st[j];
        pos[o + 3] = (pos[o + 3] & 9) | 2 | (st & 4) | (st & 16);
        // (a fragment glows for a moment, a piece's torn edges as the plating's)
        if (st & 4) { const h = Math.exp(-tau / .35); nrm[o + 3] = Math.round(h * 255) * 256 + (nrm[o + 3] % 256); }
      }
    }
    C.upload(s.g0, s.g1);
  }

  /* ------------------------------------------------------------ data for the lab's recorder */
  function data(uid, o = {}) {
    const U = units.get(uid); if (!U || !U.shot) return null;
    const s = U.shot, tau = o.tau !== undefined ? o.tau : game.t - s.tHit;
    const out = { tau, state: s.state, phase: s.endA && tau >= s.endA.t ? 'B' : 'A', metrics: s.metrics || null, meta: state(uid).meta, bodies: [], frags: [], plating: null };
    const B = s.endA && s.FB.length ? lerpF(s.FB, tau) : null;
    if (B && out.phase === 'B') {
      // (velocities from the frame after (or before, at the last): never a frame against itself)
      const [b0, b1x] = B, k0 = s.FB.indexOf(b0), b1 = b1x !== b0 ? b1x : s.FB[k0 - 1] || b0, mov = s.endA.mov, by = s.endA.bodyOf, acc = new Map();
      const prev = b1.t < b0.t ? b1 : b0, nxt = b1.t < b0.t ? b0 : b1, dt = Math.max(1e-3, nxt.t - prev.t);
      for (let j = 0; j < mov.length; j++) {
        const q = 3 * j, p = [b0.pos[q], b0.pos[q + 1], b0.pos[q + 2]], vv = prev === nxt ? [0, 0, 0] : [(nxt.pos[q] - prev.pos[q]) / dt, (nxt.pos[q + 1] - prev.pos[q + 1]) / dt, (nxt.pos[q + 2] - prev.pos[q + 2]) / dt];
        if (by[j] < 0) { out.frags.push([...p, ...vv, b0.st[j]]); continue; }
        let A = acc.get(by[j]); if (!A) acc.set(by[j], A = { id: by[j], n: 0, c: [0, 0, 0], v: [0, 0, 0], st: b0.st[j], lo: 1e9 });
        A.n++; for (let k = 0; k < 3; k++) { A.c[k] += p[k]; A.v[k] += vv[k]; } A.lo = Math.min(A.lo, p[1]);
      }
      for (const A of acc.values()) { for (let k = 0; k < 3; k++) { A.c[k] /= A.n; A.v[k] /= A.n; } out.bodies.push({ id: A.id, n: A.n, c: A.c.map(r2), v: A.v.map(r2), speed: r2(Math.hypot(...A.v)), low: r2(A.lo), sea: !!(A.st & 16), rest: !!(A.st & 32), touch: !!(A.st & 64) }); }
      out.frags = out.frags.map(f => f.map(r2));
    } else if (s.FA.length && s.act) {
      // phase A: every node of the region that moved, with its speed (from the frames either side)
      const [a0, a1] = lerpF(s.FA, tau), dt = Math.max(1e-5, a1.t - a0.t), n = s.nFree, base = s.FA[0];
      let moved = 0, vmax = 0; const vec = [];
      for (let a = 0; a < n; a++) {
        const q = 3 * a, d = Math.hypot(a0.pos[q] - base.pos[q], a0.pos[q + 1] - base.pos[q + 1], a0.pos[q + 2] - base.pos[q + 2]);
        if (d < .02) continue; moved++;
        const vv = [(a1.pos[q] - a0.pos[q]) / dt, (a1.pos[q + 1] - a0.pos[q + 1]) / dt, (a1.pos[q + 2] - a0.pos[q + 2]) / dt], sp = Math.hypot(...vv); vmax = Math.max(vmax, sp);
        if (vec.length < (o.max || 3000)) vec.push([a0.pos[q], a0.pos[q + 1], a0.pos[q + 2], ...vv, a0.flg[a]].map(r2));
      }
      out.plating = { moved, vmax: r2(vmax), nodes: vec };
    }
    return out;
  }

  /* the displacement field at the tau last drawn (compose): every cell of the hit's region, model frame:
     { S, C (the charge), n, rest (3n), d (3n: now - rest), n0 (3n rest normal), flg (1 torn edge, 2 loose, 4 fragment,
     8 pocked, 16 in the sea), ins (1 interior) } */
  function field(uid, tau) {
    const U = units.get(uid); if (!U || !U.shot || !U.shot.act) return null;
    const s = U.shot, C = U.cloud, B = U.B, n = s.nFree;
    if (tau !== undefined) compose(U, tau);
    const rest = new Float32Array(n * 3), d = new Float32Array(n * 3), n0 = new Float32Array(n * 3), flg = new Uint8Array(n), ins = new Uint8Array(n);
    for (let a = 0; a < n; a++) {
      const g = s.act[a];
      for (let k = 0; k < 3; k++) { rest[3 * a + k] = C.rest.pos[4 * g + k]; d[3 * a + k] = C.pos[4 * g + k] - C.rest.pos[4 * g + k]; n0[3 * a + k] = B.N[3 * g + k] / 127; }
      flg[a] = C.pos[4 * g + 3]; ins[a] = B.info[4 * g];
    }
    return { S: B.S, C: s.o.C.slice(), n, rest, d, n0, flg, ins };
  }

  /* ------------------------------------------------------------ the system */
  const Rm = new Array(9);
  const sys = {
    name: 'vox', priority: 13,
    draw3d() {
      for (const U of units.values()) {
        const u = sim.units.get(U.uid);
        if (!u || !U.cloud) { if (U.cloud) U.cloud.visible = false; continue; }
        const P = game.unitPose ? game.unitPose(u) : { pos: u.pos, hdg: u.hdg, pitch: 0, roll: 0 };
        const A = attitude(P.hdg, P.pitch || 0, P.roll || 0); for (let k = 0; k < 9; k++) Rm[k] = A[k];
        U.cloud.setPose(Rm.slice(), P.pos.slice()); U.cloud.visible = true;
        // the model itself is not drawn while its lattice is
        if (U.hideModel) { const d = game.drawn && game.drawn.get(U.uid); if (d) { const i = R.queue.indexOf(d); if (i >= 0) R.queue.splice(i, 1); } }
        if (U.shot) compose(U, game.t - U.shot.tHit);
      }
    },
    dispose() { VR.dispose(); worker.terminate(); },
  };
  game.vox = { enable, disable, hit, state, data, field, units, built, render: VR, on: uid => units.has(uid), compose: (uid, tau) => { const U = units.get(uid); if (U) compose(U, tau); } };
  return sys;
}
const r2 = v => Math.round(v * 100) / 100;
