/* The fast damage model's runner (prototype): the same interface as the shell and lattice runners (submit, target,
   drop, pump, stats, pats, busy), so the worker and the game's blast system take it unchanged (?blast=fast).

   submit() works out the whole hit at once (core.js, or the Rust/WebAssembly build of it: o.core) in a few ms; after
   that every snapshot is a pure function of the time since the hit, taken at a few key moments as the game's clock
   passes them (never past the time shown), and the final one carries the results and the debris as the shell's do. */
import { solveCore, PN, AX } from './core.js';

const MAT = { hsla: [550e6, 7850, .16], hts: [324e6, 7850, .2], mild: [235e6, 7850, .2], alu: [228e6, 2660, .1] };
const KEYS = [0, .001, .002, .003, .0045, .006, .008, .011, .015, .02, .026, .034, .044, .056, .07, .09, .115, .145, .18];
const MAXIN = 24000;
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const sm = x => { x = sat(x); return x * x * (3 - 2 * x); };

export function packInput(spec) {
  const S = spec.shellS || spec.gridS || .25, pl = spec.plates.slice(0, 10), P = new Float64Array(pl.length * PN);
  pl.forEach((q, i) => { const m = MAT[q.mat] || MAT.mild, o = i * PN;
    P[o] = q.ax; P[o + 1] = q.val; P[o + 2] = q.u0; P[o + 3] = q.u1; P[o + 4] = q.v0; P[o + 5] = q.v1; P[o + 6] = q.h; P[o + 7] = m[0]; P[o + 8] = m[1]; P[o + 9] = m[2]; P[o + 10] = q.skin ? 1 : 0; });
  const ch = spec.charge, C0 = ch.C;
  let V = 0;
  for (const c of spec.comps || []) { const b = c.b; if (C0[0] >= b[0] && C0[0] <= b[3] && C0[1] >= b[1] && C0[1] <= b[4] && C0[2] >= b[2] && C0[2] <= b[5]) { V = c.V || (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]); break; } }
  if (!V) { const b = spec.box; V = Math.max(40, (b[3] - b[0]) * (b[4] - b[1]) * Math.max(1, Math.min(0, b[5]) - b[2])); }
  return { P, C: new Float64Array([C0[0], C0[1], C0[2], ch.W || 1, ch.Wgas || 0, V, spec.seed | 0 || 1337, S]) };
}

export function createFastRunner(o = {}) {
  const pats = new Map();
  const stats = { built: 0, done: 0, buildMs: 0, coreMs: 0, snapMs: 0, snaps: 0, backend: o.core ? 'wasm' : 'js' };
  const now = () => performance.now();
  const core = o.core || solveCore;

  function submit(id, spec) {
    const t0 = now(), { P, C } = packInput(spec);
    const F = core(P, C);
    const tc = now() - t0;
    // when it is over: the dish risen everywhere, the flaps bent their full way
    let T1 = .02;
    for (const L of F.plates) if (L) for (let m = 0; m < L.TA.length; m++) {
      if (!(L.Q[m] > .05) && !(L.FL[m])) continue;
      const tT = L.TA[m] + .45 * L.TR[m];
      T1 = Math.max(T1, L.TA[m] + L.TR[m], L.FL[m] & 1 ? tT + .012 + .02 * L.FLn[m] : 0);
    }
    T1 = Math.min(.18, T1);
    const R = { id, spec, F, T1, up: spec.kind === 'deck' ? 2 : 1, target: 0, watch: true, next: 0, state: 'run', last: [], t: -1, tReal0: now(), buildMs: now() - t0 };
    R.frags = fragsOf(spec, F);
    pats.set(id, R); stats.built++; stats.buildMs = R.buildMs; stats.coreMs = tc;
    let N = 0; for (const L of F.plates) if (L) N += L.TA.length;
    return { N, NS: 0, NC: N, K: 0, dt: 0, T1, buildMs: R.buildMs, coreMs: tc, solver: 'fast', backend: stats.backend, S: C[7] };
  }
  function target(id, t, watch) { const R = pats.get(id); if (!R) return; R.target = t; if (watch !== undefined) R.watch = watch; }
  function drop(id) { pats.delete(id); }
  function pump() {
    const out = [];
    for (const R of [...pats.values()]) {
      // the latest key moment the game's clock has passed
      let k = R.next; while (k < KEYS.length && KEYS[k] <= R.target && KEYS[k] < R.T1) k++;
      const fin = R.target >= R.T1;
      if (!fin && k === R.next) continue;
      R.next = k;
      const ts = now();
      const m = snapshot(R, fin ? R.T1 : KEYS[k - 1], fin);
      stats.snapMs = now() - ts; stats.snaps++;
      out.push(m);
      if (fin) { m.results = results(R); m.debris = debrisOf(R); if (m.debris) m.transfer.push(m.debris.buffer); pats.delete(R.id); stats.done++; }
    }
    return out;
  }

  /* the plating at time t: displacement (patch frame) + flags (1 torn, 2 gone, 4 torn edge, 8 unsupported) + soot */
  function nodeAt(L, m, t, out) {
    const TA = L.TA[m], TR = L.TR[m], s = sm((t - TA) / TR), o3 = 3 * m, FL = L.FL[m];
    let f = 0;
    out[0] = L.D[o3] * s; out[1] = L.D[o3 + 1] * s; out[2] = L.D[o3 + 2] * s;
    if (FL & 1) {
      const tT = (FL & 16) && L.Q[m] <= 1.0001 ? TA : TA + .45 * TR;
      if (t >= tT) {
        f = FL & 2 ? 3 : 1;
        if (!(FL & 2) && L.FA[m] > 0) {
          const a = L.FA[m] * sm((t - tT) / (.012 + .02 * L.FLn[m])), Lf = L.FLn[m];
          const i = m % (L.nu + 1), j = (m / (L.nu + 1)) | 0, u = L.u0 + i * L.S - L.cu, v = L.v0 + j * L.S - L.cv, r = Math.hypot(u, v) || 1;
          out[L.ax] = L.sgn * (Lf * Math.sin(a) + L.DN[m] * s * .3);
          out[L.ua] = u / r * Lf * (1 - Math.cos(a)); out[L.va] = v / r * Lf * (1 - Math.cos(a));
        }
      }
    }
    return f + Math.min(.99, L.SO[m] * sat((t - TA) / .04));
  }
  const tmp = [0, 0, 0];
  function snapshot(R, t, final) {
    const F = R.F, sp = R.spec, Fr = sp.frame, skins = [], tr = [];
    R.t = t;
    const byPlate = new Array(sp.plates.length).fill(0);
    let tornSkin = 0, below = 0, setMax = 0, open = 0;
    const T = new Map();
    for (const L of F.plates) {
      if (!L) continue;
      L.S = L.S || sp.shellS || sp.gridS || .25;
      const nu = L.nu, nv = L.nv, W1 = nu + 1, n = W1 * (nv + 1), d = new Float32Array(4 * n), A = L.S * L.S;
      for (let m = 0; m < n; m++) {
        const fl = nodeAt(L, m, t, tmp), o = 4 * m;
        // (as the shell runner: drawn plating reaches at most ~3 m from where it was, the tip crumpling in: QA D44)
        { const dl = Math.hypot(tmp[0], tmp[1], tmp[2]); if (dl > 3) { const q = (3 + Math.log(dl / 3)) / dl; tmp[0] *= q; tmp[1] *= q; tmp[2] *= q; } }
        d[o] = tmp[0]; d[o + 1] = tmp[1]; d[o + 2] = tmp[2]; d[o + 3] = fl;
        if ((fl | 0) & 1) { byPlate[L.p] += A; if (L.skin) { tornSkin += A; const p = [0, 0, 0]; p[L.ax] = L.val; p[L.ua] = L.u0 + (m % W1) * L.S; p[L.va] = L.v0 + ((m / W1) | 0) * L.S;
            if (Fr.O[1] + Fr.X[1] * p[0] + Fr.Y[1] * p[1] + Fr.Z[1] * p[2] < (sp.wl || 0)) below += A; } else open += A; }
        else if (L.p === 0) { const dl = Math.hypot(tmp[0], tmp[1], tmp[2]); if (dl > setMax) setMax = dl; }
      }
      // torn edge: intact plating next to a tear
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const o = 4 * (j * W1 + i); if ((d[o + 3] | 0) & 1) continue;
        if ((i > 0 && (d[o - 1] | 0) & 1) || (i < nu && (d[o + 7] | 0) & 1) || (j > 0 && (d[o - 4 * W1 + 3] | 0) & 1) || (j < nv && (d[o + 4 * W1 + 3] | 0) & 1)) d[o + 3] += 4; }
      T.set(L, d);
      if (!L.skin) continue;
      // unsupported columns (as the shell runner): under half the plating within 1.5 m (horizontal) / 0.75 m (a side) left
      const rr = Math.max(1, Math.round((L.ax === R.up ? 1.5 : .75) / L.S)), H1 = nv + 1, sa = new Float32Array((W1 + 1) * (H1 + 1));
      for (let j = 0; j < H1; j++) for (let i = 0; i < W1; i++) { const dead = (d[4 * (j * W1 + i) + 3] | 0) & 3 ? 1 : 0; sa[(j + 1) * (W1 + 1) + i + 1] = dead + sa[j * (W1 + 1) + i + 1] + sa[(j + 1) * (W1 + 1) + i] - sa[j * (W1 + 1) + i]; }
      for (let j = 0; j < H1; j++) for (let i = 0; i < W1; i++) {
        const a0 = Math.max(0, i - rr), a1 = Math.min(W1, i + rr + 1), b0 = Math.max(0, j - rr), b1 = Math.min(H1, j + rr + 1);
        const dead = sa[b1 * (W1 + 1) + a1] - sa[b0 * (W1 + 1) + a1] - sa[b1 * (W1 + 1) + a0] + sa[b0 * (W1 + 1) + a0];
        if (dead > .5 * (a1 - a0) * (b1 - b0)) d[4 * (j * W1 + i) + 3] += 8;
      }
      // only what changed since the last snapshot
      const last = R.last[L.p];
      let i0 = W1, i1 = -1, j0 = nv + 1, j1 = -1;
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const o = 4 * (j * W1 + i);
        const ch = last ? Math.abs(d[o] - last[o]) > 2e-4 || Math.abs(d[o + 1] - last[o + 1]) > 2e-4 || Math.abs(d[o + 2] - last[o + 2]) > 2e-4 || Math.abs(d[o + 3] - last[o + 3]) > .02 : d[o] || d[o + 1] || d[o + 2] || d[o + 3];
        if (ch) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; } }
      R.last[L.p] = d;
      if (i1 < 0 && last) continue;
      if (i1 < 0) { i0 = j0 = i1 = j1 = 0; }
      const w = i1 - i0 + 1, h = j1 - j0 + 1, sb = new Float32Array(w * h * 4);
      for (let j = 0; j < h; j++) sb.set(d.subarray(4 * ((j0 + j) * W1 + i0), 4 * ((j0 + j) * W1 + i0 + w)), 4 * j * w);
      skins.push({ p: L.p, ax: L.ax, val: L.val, u0: L.u0, v0: L.v0, nu, nv, i0, j0, w, h, data: sb, S: L.S });
      tr.push(sb.buffer);
    }
    const inner = innerDots(R, T, t);
    if (inner) tr.push(inner.buffer);
    R.T = T;
    // (the fragments' strikes, once: the game draws them as streaks from the charge, fx in blast/system.js drawFrags)
    let frags = null; if (R.frags && !R.fragsSent) { frags = R.frags; R.fragsSent = true; tr.push(frags.buffer); }
    return { type: 'state', id: R.id, final, t, T1: R.T1, skins, inner, nIn: inner ? inner.length / 6 : 0, tornSkin, tornBelow: below, openM2: +open.toFixed(2), byPlate, setMax,
      runMs: stats.coreMs, steps: 0, wallMs: now() - R.tReal0, frags, transfer: tr };
  }
  /* the structure behind a hole in the struck plate: the other plates' plating near it, as charred dots */
  function innerDots(R, T, t) {
    const F = R.F, Fr = R.spec.frame, L0 = F.plates[0]; if (!L0) return null;
    const d0 = T.get(L0), W0 = L0.nu + 1;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, nt = 0;
    for (let m = 0; m < L0.TA.length; m++) if ((d0[4 * m + 3] | 0) & 1) { const u = L0.u0 + (m % W0) * L0.S, v = L0.v0 + ((m / W0) | 0) * L0.S; nt++; if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v; }
    if (!nt) return null;
    x0 -= 1.5; x1 += 1.5; y0 -= 1.5; y1 += 1.5;
    const A = new Float32Array(MAXIN * 6); let n = 0;
    const push = (lx, ly, lz, b, e) => { if (n >= MAXIN) return; const o = 6 * n++;
      A[o] = Fr.O[0] + Fr.X[0] * lx + Fr.Y[0] * ly + Fr.Z[0] * lz; A[o + 1] = Fr.O[1] + Fr.X[1] * lx + Fr.Y[1] * ly + Fr.Z[1] * lz; A[o + 2] = Fr.O[2] + Fr.X[2] * lx + Fr.Y[2] * ly + Fr.Z[2] * lz; A[o + 3] = b; A[o + 4] = e; A[o + 5] = lz; };
    const p = [0, 0, 0];
    for (const L of F.plates) {
      if (!L || L.skin) continue;
      const d = T.get(L), W1 = L.nu + 1, base = L.ax === 0 ? .42 : .55;
      for (let m = 0; m < L.TA.length; m++) {
        const fl = d[4 * m + 3] | 0; if (fl & 2) continue;
        p[L.ax] = L.val; p[L.ua] = L.u0 + (m % W1) * L.S; p[L.va] = L.v0 + ((m / W1) | 0) * L.S;
        if (p[L0.ua] < x0 || p[L0.ua] > x1 || p[L0.va] < y0 || p[L0.va] > y1) continue;
        if ((fl & 1) && !(L.FA[m] > 0)) continue;
        const so = d[4 * m + 3] - fl;
        for (let k = 0; k < 2; k++) { const h = Math.imul(m * 4 + k + 1, 0x9E3779B1) >>> 0, jx = ((h & 1023) / 1023 - .5) * L.S, jy = (((h >>> 10) & 1023) / 1023 - .5) * L.S;
          const q = [p[0] + d[4 * m], p[1] + d[4 * m + 1], p[2] + d[4 * m + 2]]; q[L.ua] += jx; q[L.va] += jy;
          push(q[0], q[1], q[2], base * (1 - .72 * so), fl & 4 ? 1 : 0); }
      }
    }
    // the far side of the pocket (dark, charred): a hole never shows the sea through the ship
    if (R.spec.farWall !== false) { const bx = R.spec.box, depth = L0.ax === 2 ? bx[2] : L0.ax === 1 ? bx[1] : bx[0], st = Math.max(.3, Math.sqrt((x1 - x0) * (y1 - y0) / 900));
      for (let a = x0; a <= x1; a += st) for (let b = y0; b <= y1; b += st) { const h = Math.imul((a * 97 + b * 13) * 16 | 0, 0x9E3779B1) >>> 0, j1 = (h & 1023) / 1023 - .5, j2 = ((h >>> 10) & 1023) / 1023 - .5;
        p[L0.ax] = depth + .05; p[L0.ua] = a + j1 * st; p[L0.va] = b + j2 * st; push(p[0], p[1], p[2], .3, 2); } }
    return A.slice(0, 6 * n);
  }
  function results(R) {
    const F = R.F, Fr = R.spec.frame, L0 = F.plates[0], d0 = R.T.get(L0), W0 = L0.nu + 1;
    const loc = (lx, ly, lz) => [Fr.O[0] + Fr.X[0] * lx + Fr.Y[0] * ly + Fr.Z[0] * lz, Fr.O[1] + Fr.X[1] * lx + Fr.Y[1] * ly + Fr.Z[1] * lz, Fr.O[2] + Fr.X[2] * lx + Fr.Y[2] * ly + Fr.Z[2] * lz];
    let cx = 0, cy = 0, n = 0, A = 0, bu0 = 1e9, bu1 = -1e9, bv0 = 1e9, bv1 = -1e9, work = 0;
    const rim = [], p = [0, 0, 0];
    for (let m = 0; m < L0.TA.length; m++) {
      const fl = d0[4 * m + 3] | 0, u = L0.u0 + (m % W0) * L0.S, v = L0.v0 + ((m / W0) | 0) * L0.S;
      work += 3e8 * L0.h * L0.DN[m] * L0.S * L0.S * .05;
      if (fl & 1) { cx += u; cy += v; n++; A += L0.S * L0.S; if (u < bu0) bu0 = u; if (u > bu1) bu1 = u; if (v < bv0) bv0 = v; if (v > bv1) bv1 = v; }
      else if (fl & 4) { p[L0.ax] = L0.val + d0[4 * m + L0.ax]; p[L0.ua] = u + d0[4 * m + L0.ua]; p[L0.va] = v + d0[4 * m + L0.va]; rim.push(...loc(p[0], p[1], p[2]), p[1]); }
    }
    const hole = n ? { x: cx / n, y: cy / n, A } : null;
    let floor = null;
    if (hole) {
      if (L0.ax !== 2) { for (const L of F.plates) if (L && !L.skin && L.ax === 1 && L.val < hole.y && (!floor || L.val > floor.y)) floor = { y: L.val }; }
      else { const decks = F.plates.filter(L => L && !L.skin && L.ax === 2 && L.val < 0).sort((a, b) => b.val - a.val);
        for (const L of decks) { const d = R.T.get(L), W1 = L.nu + 1; let tot = 0, op = 0;
          for (let m = 0; m < L.TA.length; m++) { const u = L.u0 + (m % W1) * L.S, v = L.v0 + ((m / W1) | 0) * L.S; if (u < bu0 || u > bu1 || v < bv0 || v > bv1) continue; tot++; if ((d[4 * m + 3] | 0) & 1) op++; }
          if (tot && op < .5 * tot) { floor = { z: L.val }; break; } }
        if (!floor && decks.length) floor = { z: decks[decks.length - 1].val }; }
    }
    const step = Math.ceil(rim.length / 4 / 400) || 1, rimS = []; for (let k = 0; k < rim.length / 4; k += step) rimS.push(rim[4 * k], rim[4 * k + 1], rim[4 * k + 2], rim[4 * k + 3]);
    let lines = 0; const fu = (R.spec.plates[0] && R.spec.plates[0].fu) || 2.4; if (hole) lines = Math.max(0, Math.floor((bu1 - bu0) / fu));
    return { work, framesTorn: lines, rim: Float32Array.from(rimS),
      hole: hole ? { c: loc(hole.x, hole.y, 0), A: hole.A, bb: [bu0 - .3, bu1 + .3, bv0 - .3, bv1 + .3],
        floor: floor ? (floor.z !== undefined ? loc(hole.x, hole.y, floor.z + .1) : loc(hole.x, floor.y + .1, -Math.min(2, R.spec.depth || 2) * .5)) : null } : null };
  }
  /* the plating thrown off (gone texels): dots in the model frame with their speed, in clumps of ~1 m (piece ids) */
  function debrisOf(R) {
    const F = R.F, Fr = R.spec.frame, out = [], t = R.T1, p = [0, 0, 0];
    const w = v => [Fr.X[0] * v[0] + Fr.Y[0] * v[1] + Fr.Z[0] * v[2], Fr.X[1] * v[0] + Fr.Y[1] * v[1] + Fr.Z[1] * v[2], Fr.X[2] * v[0] + Fr.Y[2] * v[1] + Fr.Z[2] * v[2]];
    for (const L of F.plates) {
      if (!L) continue;
      const W1 = L.nu + 1;
      for (let m = 0; m < L.TA.length; m++) {
        if ((L.FL[m] & 3) !== 3) continue;
        const i = m % W1, j = (m / W1) | 0, u = L.u0 + i * L.S - L.cu, v = L.v0 + j * L.S - L.cv, r = Math.hypot(u, v) || 1, sp = L.V[m] || 60;
        const vl = [0, 0, 0]; vl[L.ax] = L.sgn * sp * .85; vl[L.ua] = u / r * sp * .45; vl[L.va] = v / r * sp * .45;
        const fly = Math.max(0, t - (L.TA[m] + .45 * L.TR[m]));
        p[L.ax] = L.val + vl[L.ax] * fly; p[L.ua] = L.u0 + i * L.S + vl[L.ua] * fly; p[L.va] = L.v0 + j * L.S + vl[L.va] * fly;
        const q = w(p), V = w(vl), id = L.p * 100000 + Math.floor((L.u0 + i * L.S) / 1.2) * 300 + Math.floor((L.v0 + j * L.S) / 1.2);
        for (let k = 0; k < 2; k++) out.push(Fr.O[0] + q[0] + (k ? .08 : 0), Fr.O[1] + q[1], Fr.O[2] + q[2] + (k ? .08 : 0), V[0], V[1], V[2], (L.skin ? .55 : .42) * (1 - .6 * L.SO[m]), id);
        if (out.length >= 6000 * 8) break;
      }
    }
    return out.length ? new Float32Array(out) : null;
  }
  return { submit, target, drop, pump, stats, pats, get busy() { return pats.size > 0; } };
}
/* the fragments' strikes (the pocks, texel flag 16) in the model frame: [charge x y z, then x y z through (0/1) each] */
function fragsOf(spec, F) {
  const Fr = spec.frame, C = spec.charge.C, out = [], p = [0, 0, 0];
  const loc = (a, b, c) => [Fr.O[0] + Fr.X[0] * a + Fr.Y[0] * b + Fr.Z[0] * c, Fr.O[1] + Fr.X[1] * a + Fr.Y[1] * b + Fr.Z[1] * c, Fr.O[2] + Fr.X[2] * a + Fr.Y[2] * b + Fr.Z[2] * c];
  out.push(...loc(C[0], C[1], C[2]));
  for (const L of F.plates) { if (!L) continue; const W1 = L.nu + 1;
    for (let m = 0; m < L.FL.length && out.length < 4 * 400; m++) { if (!(L.FL[m] & 16)) continue;
      p[L.ax] = L.val; p[L.ua] = L.u0 + (m % W1) * L.S; p[L.va] = L.v0 + ((m / W1) | 0) * L.S; out.push(...loc(p[0], p[1], p[2]), L.FL[m] & 1 ? 1 : 0); } }
  return out.length > 3 ? new Float32Array(out) : null;
}
export { AX };
