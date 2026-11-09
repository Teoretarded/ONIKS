/* Concept (smoothness study, game/concepts/SMOOTHNESS.md): model dots that load in and densify without pops.
   Not used by the game. Extends the engine's ModelLib (live import: the sampling, the cache, the dyn-part LRU are
   the engine's) and replaces draw() and the point shader (a frozen copy of engine/models.js VS with the changes
   below). The flags live in lib.F and switch at run time:

   F.mode 'xfade'  the engine's four independent levels, plus hysteresis on the level choice (+-12 %) and a 0.35 s
                   cross-dissolve when a part changes level (the old level's dots go out one by one while the new
                   one's come in; both drawn during the change). The smallest change to the engine.
   F.mode 'nested' progressive levels: each part is sampled coarse to fine as the engine does, but every finer level
                   keeps only the samples that fill gaps the coarser ones leave (a grid elimination in half-octave
                   passes), so a coarser level is always a subset of the finer one. Every kept dot carries the
                   spacing (m) at which it comes in (aSig); the buffer is sorted by it, so the dots a view needs are
                   a prefix (one draw), and each dot fades in over half an octave of zoom from its own rank.
                   There are no level switches: density, brightness and dot size follow the distance continuously.
   F.fadeIn        a level (xfade) or a layer (nested) that arrives late fades in over 0.3 s instead of appearing.
   F.prefetch      the next finer level / layer is sampled before the view needs it (one level ahead).
   F.aa            box-filtered dots (smoothness_shaders.js). */
import { ModelLib } from '../src/engine/models.js';
import { HEAD, FRAME, COMMON, CULL } from '../src/engine/shaders.js';
import { program } from '../src/engine/gl.js';
import { FS_AA, AA_GLSL } from './smoothness_shaders.js';

const SIG_ALL = 1e9;       // aSig of a dot that is always drawn (the coarsest layer; the engine's own clouds)

/* the engine's model point shader (engine/models.js VS, copied), with: aSig and the nested density rule (uN), the
   temporal dissolve / fade (uX), a float dot size and the box filter (AA_GLSL) */
const VS = HEAD + FRAME + COMMON + AA_GLSL + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aNrm;
layout(location = 2) in float aSig;   // nested: the spacing (m) at which this dot comes in (1e9: always)
uniform mat3 uR;
uniform vec3 uT;
uniform vec4 uTint;
uniform vec4 uP;          // alpha, x-ray, damage, sample spacing (m)
uniform vec4 uQ;          // no back faces, tint on the faces, brightness, dissolve
uniform vec4 uG;
uniform vec4 uGP;
uniform vec4 uDen;        // x least on-screen spacing (1080 px, 0 off), y grazing floor, z least kept share, w cutaway
uniform vec4 uFill;
uniform vec4 uN;          // nested: x kept spacing the level of detail wants (1080 px), y 1 = nested rule, z finest spacing
                          // loaded (m), w fade band (octaves)
uniform vec4 uX;          // x dissolve 0..1, y +1 in / -1 out / 0 none, z first index of the newest layer, w its fade 0..1
out vec3 vCol;
float dotPxF(float pxs) {
  float s = pxs > 7.5 ? 3.0 : (pxs > 3.6 ? 2.0 : 1.0);
  return max(1.0, s * uCam.y);
}
void main() {
  vec3 p = uR * aPos + uT;
  float yw = p.y + uEyeW.y;
  float dist = length(p);
  vec3 v = p / max(1e-4, dist);
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  gl_Position = c;
  uint hid = hash1(uint(gl_VertexID) * 747796405u + 2891336453u);
  float hr = u01(hid);
  float xr = uP.y, dmg = uP.z;
  if (uQ.w > 0.0 && hr < uQ.w) { ${CULL} return; }
  if (dmg > 0.0 && hr > 1.0 - dmg * 0.22) { ${CULL} return; }
  // temporal cross-dissolve (xfade): the outgoing level's dots go out, the incoming one's come in, one by one
  if (uX.y != 0.0) {
    float hh = u01(hash1(hid ^ 0x27d4eb2fu));
    if (uX.y > 0.0 ? hh > uX.x : hh < uX.x) { ${CULL} return; }
  }
  float gk = 0.0;
  if (uG.x > 0.5) {
    float gd = uGP.w - dot(uGP.xyz, p);
    if (gd <= 0.0) { if (uG.x > 1.5 && uG.x < 2.5) { ${CULL} return; } if (uG.x < 1.5) xr = 0.0; }
    float gw = max(1e-3, uG.z);
    if (gd > -gw * 0.25 && gd < gw) gk = gd < 0.0 ? 1.0 + gd / (gw * 0.25) : 1.0;
    else if (gd >= gw) gk = exp(-(gd - gw) / max(1e-3, uG.w)) * 0.8;
  }
  vec3 n = uR * aNrm.xyz;
  float b, rim = 0.0, fk = 1.0;
  bool two = dot(aNrm.xyz, aNrm.xyz) < 0.01;
  float lit = 0.45;
  if (two) { b = 0.45; }
  else {
    float dn = dot(n, v);
    if (dn > 0.0) {
      if (uQ.x > 0.5 && xr <= 0.0) { ${CULL} return; }
      if ((gl_VertexID % 3) != 0 && hr > xr * 0.5) { ${CULL} return; }
      b = 0.09; lit = 0.1;
    } else {
      float fac = min(1.0, -dn), lam = max(dot(n, uSun.xyz), uFill.w * dot(n, uFill.xyz)), w = 1.0 - fac;
      fk = max(fac, uDen.y);
      b = 0.06 + 0.74 * max(lam, 0.0) + 0.14 * fac + 0.34 * w * w * w;
      b *= 0.55 + 0.45 * b;
      lit = b;
      rim = fac < 0.18 ? 1.0 - fac / 0.18 : 0.0; rim *= rim;
    }
  }
  float a = 1.0, pk;
  if (uN.y > 0.5) {
    // nested: the spacing this dot's distance wants (the level of detail), capped per pixel as the engine does
    // (faces seen edge-on by their facing, walls stacked along the sight line; a small part not capped: uDen.z),
    // and the dot fades in over uN.w octaves below its own spacing: no level switches, no pops. The coarsest
    // layer (aSig 1e9) is always drawn (the engine's floor: never thinner than the coarsest level)
    float wpx = c.w / uCam.x;                     // metres per 1080-px at this depth
    float sL = uN.x * wpx, sN = sL;
    if (uDen.x > 0.0) {
      float sC = uDen.x * sqrt(max(1.0, uG.y)) * wpx / sqrt(max(fk, 1e-3));
      sN = min(max(sL, sC), sL / sqrt(max(uDen.z, 1e-4)));
    }
    if (aSig < 1e8) {
      a = clamp(log2(aSig / sN) / uN.w, 0.0, 1.0);
      if (a <= 0.0) { ${CULL} return; }
    }
    pk = max(sL, uN.z) / wpx;
  } else {
    // the engine's rule (its levels, a hash per sample)
    float pxs = uP.w * uCam.x / c.w;
    if (uDen.x > 0.0) {
      float keep = max(pxs * pxs * fk / (uDen.x * uDen.x * max(1.0, uG.y)), uDen.z);
      if (keep < 1.0 && u01(hash1(hid ^ 0x5bd1e995u)) > keep) { ${CULL} return; }
    }
    pk = max(pxs, uDen.x);
  }
  if (uX.w < 1.0 && float(gl_VertexID) >= uX.z) a *= uX.w;
  if (xr > 0.0) {
    if (hr < xr * 0.5) { ${CULL} return; }
    b = mix(b, 0.05 + 0.2 * lit, xr);
  }
  b *= mix(1.0, 0.55, clamp(c.w / uMisc.w, 0.0, 1.0)) * uP.x * uQ.z * uMisc.z;
  if (yw < 0.0) b *= 0.35;
  if (uDen.w > 0.0 && b > 0.5) b = mix(b, 0.5 + 0.4 * (1.0 - exp((0.5 - b) / 0.4)), uDen.w);
  vec3 col = mix(WH, uTint.rgb, uTint.a * mix(uQ.y, 1.0, rim));
  if (dmg > 0.0) col = mix(col, CORAL, min(1.0, dmg * 1.1));
  vec2 sc = scanAt(p);
  vec3 rgb = col * b;
  if (sc.x > 0.01) rgb = max(mix(rgb, uScanC[0].rgb * max(b, 0.95), sc.x), rgb);
  if (sc.y > 0.0) rgb = mix(rgb, rgb * 0.6 + uScanC[0].rgb * b * 0.5, 0.3 * sc.y);
  if (gk > 0.01) rgb = max(mix(rgb, LIME * max(b, 0.95), gk), rgb);
  rgb += lightsAt(p, two ? vec3(0.0) : n) * (0.35 + 0.65 * lit) * uP.x;
  vCol = min(rgb, vec3(1.0)) * a;
  float sz = dotPxF(pk * (0.8 + 0.4 * hr));
  gl_PointSize = max(1.0, floor(sz + 0.5));
  aaDot(c, sz);
}
`;

const sat01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const sstep = v => { v = sat01(v); return v * v * (3 - 2 * v); };
function mul3(A, B) {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return o;
}
const ap3 = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* same shape tests as the engine (flatness: share of normals along one axis; layering: walls on a sight line) */
function flatnessOf(nrm, n) {
  if (!n) return 0;
  const step = Math.max(1, Math.floor(n / 600));
  let m = 0, two = 0, xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < n; i += step) {
    const x = nrm[i * 4], y = nrm[i * 4 + 1], z = nrm[i * 4 + 2], q = x * x + y * y + z * z;
    m++;
    if (q < 400) { two++; continue; }
    const k = 1 / q;
    xx += x * x * k; xy += x * y * k; xz += x * z * k; yy += y * y * k; yz += y * z * k; zz += z * z * k;
  }
  let vx = .58, vy = .62, vz = .53;
  for (let it = 0; it < 16; it++) {
    const ax = xx * vx + xy * vy + xz * vz, ay = xy * vx + yy * vy + yz * vz, az = xz * vx + yz * vy + zz * vz;
    const l = Math.sqrt(ax * ax + ay * ay + az * az); if (l < 1e-9) break;
    vx = ax / l; vy = ay / l; vz = az / l;
  }
  const lam = vx * (xx * vx + xy * vy + xz * vz) + vy * (xy * vx + yy * vy + yz * vz) + vz * (xz * vx + yz * vy + zz * vz);
  return (two + lam) / m;
}
function layeringOf(P, n, sp) {
  const b = P.bounds, dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1], dz = b[1][2] - b[0][2];
  const mp = (dx * dy + dy * dz + dz * dx) / 2;
  if (!(mp > 1e-6) || !n) return 1;
  return Math.max(1, Math.min(16, n * sp * sp / (4 * mp)));
}
const cellKey = (x, y, z, inv) => (Math.floor(x * inv) + 262144) + 524288 * ((Math.floor(y * inv) + 4096) + 8192 * (Math.floor(z * inv) + 4096));

export class SmoothModels extends ModelLib {
  constructor(G, F) {
    super(G);
    this.F = F || { mode: 'nested', fadeIn: 1, prefetch: 1, aa: 0, gamma: .6 };
    this.PS = program(this.gl, VS, FS_AA, 'concept.models');
    this.lodPxN = 1.3;          // nested: kept spacing on screen the level of detail wants (1080 px). The engine's
                                // levels swing between lodPx / 2.4 and lodPx (1.17-2.8 px); the nested grid keeps ~2/3 of a level's
                                // samples at its spacing, so 1.3 matches the engine's brightness (measured over the dolly)
    this.band = .5;             // nested: fade-in band of a dot (octaves of zoom)
    this.hyst = 1.12;           // xfade: hysteresis on the level choice
    this.xfT = .35;             // xfade: the cross-dissolve (s)
    this.fadeT = .3;            // a late level / layer fades in over this (s)
    this.xs = new Map();        // xfade state per instance part
    this.now = 0;
    this.nstats = { layers: 0, pts: 0, building: 0 };
  }
  begin() { super.begin(); this.now = this.clock ? this.clock() : performance.now() / 1000; }

  /* ---------- nested levels ---------- */
  _nest(e, P) {
    if (P.nest) return P.nest;
    const N = P.nest = { n: 0, cap: 0, pos: null, nrm: null, sig: null, vao: null, vb: null, gpuN: 0, done: e.lods.length, gen: null, genK: -1,
      newStart: 1e9, birth: -1e9, sigMin: e.lods[e.lods.length - 1], flat: false, layer: 1 };
    // the coarsest layer at once (small: a few hundred points), as the engine does
    this._runGen(e, P, N, e.lods.length - 1, Infinity);
    return N;
  }
  _grow(N, k) {
    if (N.n + k <= N.cap) return;
    const cap = Math.max(N.n + k, N.cap * 2, 256);
    const pos = new Float32Array(cap * 3), nrm = new Int8Array(cap * 4), sig = new Float32Array(cap);
    if (N.pos) { pos.set(N.pos.subarray(0, N.n * 3)); nrm.set(N.nrm.subarray(0, N.n * 4)); sig.set(N.sig.subarray(0, N.n)); }
    N.pos = pos; N.nrm = nrm; N.sig = sig; N.cap = cap;
  }
  _uploadNest(N) {
    const gl = this.gl, n = N.n, buf = new ArrayBuffer(n * 20), f = new Float32Array(buf), b = new Int8Array(buf);
    for (let i = 0; i < n; i++) {
      f[i * 5] = N.pos[i * 3]; f[i * 5 + 1] = N.pos[i * 3 + 1]; f[i * 5 + 2] = N.pos[i * 3 + 2];
      b[i * 20 + 12] = N.nrm[i * 4]; b[i * 20 + 13] = N.nrm[i * 4 + 1]; b[i * 20 + 14] = N.nrm[i * 4 + 2]; b[i * 20 + 15] = 0;
      f[i * 5 + 4] = N.sig[i];
    }
    if (!N.vao) {
      N.vao = gl.createVertexArray(); gl.bindVertexArray(N.vao);
      N.vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, N.vb);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.BYTE, true, 20, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
    } else { gl.bindVertexArray(N.vao); gl.bindBuffer(gl.ARRAY_BUFFER, N.vb); }
    gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.nstats.pts += n - N.gpuN; N.gpuN = n;
  }
  /* layer k of part P as a generator: sample (a primitive at a time), then keep what fills the gaps the layers already
     there leave. It may skip levels (a cold jump close in samples only the level the view needs): the passes run from
     the finest spacing there is down to this one; with nothing there yet, the first pass (a grid at the coarsest
     level's spacing) picks the dots that are always drawn. */
  *_layer(e, P, N, k) {
    const sp = e.lods[k], seed = this._seed(P, k), prims = this._prims(P, {}) || [], L = e.lods.length;
    const fine = k >= 2 ? { fine: false } : undefined, chunks = [];
    let m6 = 0;
    for (let i = 0; i < prims.length; i++) {
      const pr = prims[i];
      if (!pr || pr.pts === false || (fine && pr.fine)) continue;
      const pts = GEO.sample({ parts: [{ name: '', prims: [pr] }] }, sp, seed + i * 7919, {}, fine)[0].pts;
      chunks.push(pts); m6 += pts.length;
      yield;
    }
    const raw = new Float32Array(m6);
    { let o = 0; for (const c of chunks) { raw.set(c, o); o += c.length; } }
    const m = m6 / 6;
    const acc = new Float32Array(m);                 // this layer's kept dots: their spacing (0: not kept)
    const rnd = mulberry(seed ^ 0x9e3779b9);
    if (k === L - 1) acc.fill(SIG_ALL);
    else {
      // half-octave passes from the finest spacing there is down to this layer's: a sample is kept at the first pass
      // whose grid cell it has to itself (the dots already there, and the ones kept before it, occupy theirs)
      const first = N.n === 0, hi = first ? e.lods[L - 1] : e.lods[N.done];
      const J = Math.max(1, Math.ceil(2 * Math.log2(hi / sp) - 1e-6));
      const order = new Uint32Array(m); for (let i = 0; i < m; i++) order[i] = i;
      for (let i = m - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
      let sPrev = hi;
      for (let j = first ? 0 : 1; j <= J; j++) {
        const s = Math.max(sp, hi * Math.pow(2, -j / 2)), inv = 1 / s, occ = new Set();
        for (let i = 0; i < N.n; i++) { occ.add(cellKey(N.pos[i * 3], N.pos[i * 3 + 1], N.pos[i * 3 + 2], inv)); if ((i & 16383) === 16383) yield; }
        for (let q = 0; q < m; q++) { const i = order[q]; if (acc[i] > 0) occ.add(cellKey(raw[i * 6], raw[i * 6 + 1], raw[i * 6 + 2], inv)); }
        for (let q = 0; q < m; q++) {
          const i = order[q];
          if (acc[i] > 0) continue;
          const key = cellKey(raw[i * 6], raw[i * 6 + 1], raw[i * 6 + 2], inv);
          if (occ.has(key)) continue;
          occ.add(key);
          acc[i] = j === 0 ? SIG_ALL : s * Math.pow(sPrev / s, rnd());
          if ((q & 8191) === 8191) yield;
        }
        sPrev = s;
      }
      // the finest layer keeps the rest too, coming in below its spacing
      if (k === 0) for (let i = 0; i < m; i++) if (!(acc[i] > 0)) acc[i] = sp * Math.pow(2, -.5 * (1 - rnd()));
    }
    // append, sorted by the spacing they come in at (the whole buffer stays sorted, coarse first)
    const idx = []; for (let i = 0; i < m; i++) if (acc[i] > 0) idx.push(i);
    idx.sort((a, b) => acc[b] - acc[a]);
    this._grow(N, idx.length);
    const start = N.n;
    for (const i of idx) {
      const o = N.n++;
      N.pos[o * 3] = raw[i * 6]; N.pos[o * 3 + 1] = raw[i * 6 + 1]; N.pos[o * 3 + 2] = raw[i * 6 + 2];
      let nx = raw[i * 6 + 3], ny = raw[i * 6 + 4], nz = raw[i * 6 + 5];
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz); if (l > 1e-6) { nx /= l; ny /= l; nz /= l; }
      N.nrm[o * 4] = Math.round(nx * 127); N.nrm[o * 4 + 1] = Math.round(ny * 127); N.nrm[o * 4 + 2] = Math.round(nz * 127);
      N.sig[o] = acc[i];
    }
    yield;
    this._uploadNest(N);
    N.done = k; N.sigMin = sp;
    N.newStart = start; N.birth = this.now;
    if (k === e.lods.length - 1) { N.newStart = 1e9; }
    // the part's shape (as the engine measures it on its clouds)
    N.flat = flatnessOf(N.nrm, N.n) > .72; N.layer = layeringOf(P, N.n, sp);
    this.nstats.layers++;
  }
  _runGen(e, P, N, k, limit) {
    if (!N.gen) { N.gen = this._layer(e, P, N, k); N.genK = k; this.nstats.building++; }
    const t0 = performance.now(), tEnd = t0 + Math.max(0, limit - this.spent);
    let r;
    do { r = N.gen.next(); } while (!r.done && performance.now() < tEnd);
    this.spent += performance.now() - t0;
    if (r.done) { N.gen = null; N.genK = -1; this.nstats.building--; return true; }
    return false;
  }
  /* count of dots with a spacing over s (the buffer is sorted, descending) */
  _count(N, s) {
    let lo = 0, hi = N.n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (N.sig[m] > s) lo = m + 1; else hi = m; }
    return lo;
  }

  /* ---------- drawing ---------- */
  draw(d, cam, frame) {
    const F = this.F, e = this.get(d.key), gl = this.gl, P = this.PS, u = P.u, eye = cam.eye, st = d.st || {};
    const flc = frame.fl1080, R0 = d.R, T0 = d.T;
    const cw = [R0[0] * e.center[0] + R0[1] * e.center[1] + R0[2] * e.center[2] + T0[0], R0[3] * e.center[0] + R0[4] * e.center[1] + R0[5] * e.center[2] + T0[1], R0[6] * e.center[0] + R0[7] * e.center[1] + R0[8] * e.center[2] + T0[2]];
    const dv = [cw[0] - eye[0], cw[1] - eye[1], cw[2] - eye[2]];
    const dist = Math.hypot(dv[0], dv[1], dv[2]);
    if (!frame.sphereVisible(dv, e.radius)) return 0;
    const mr = e.radius * flc / Math.max(1, dist);
    if (mr < .7) { d.speck = true; return 0; }
    d.speck = false;
    gl.useProgram(P.p);
    const tint = d._rgb || [1, 1, 1];
    gl.uniform4f(u.uTint, tint[0], tint[1], tint[2], d._k || 0);
    gl.uniform4f(u.uQ, d.noBack ? 1 : 0, d._face || 0, d.bright === undefined ? 1 : d.bright, d.dissolve || 0);
    { const f = cam.f, az = Math.atan2(f[0], f[2]) + this.fillAz, ce = Math.cos(this.fillEl);
      gl.uniform4f(u.uFill, ce * Math.sin(az), Math.sin(this.fillEl), ce * Math.cos(az), this.fill); }
    gl.uniform4f(u.uAA, F.aa ? 1 : 0, F.gamma || .6, this.G.W, this.G.H);
    gl.uniform4f(u.uG, 0, 1, 1, 1);
    let drawn = 0;
    const nested = F.mode === 'nested', xfade = F.mode === 'xfade';
    for (const Pt of e.parts) {
      const part = Pt.part;
      if (part.show && !part.show(st)) continue;
      const pa = d.alpha === undefined ? 1 : d.alpha;
      const X = part.xf ? part.xf(st) : null;
      const Rp = X ? mul3(R0, X.R) : R0;
      const Tp = X ? [R0[0] * X.T[0] + R0[1] * X.T[1] + R0[2] * X.T[2] + T0[0], R0[3] * X.T[0] + R0[4] * X.T[1] + R0[5] * X.T[2] + T0[1], R0[6] * X.T[0] + R0[7] * X.T[1] + R0[8] * X.T[2] + T0[2]] : T0;
      const pc = ap3(Rp, Pt.center);
      const px = Tp[0] + pc[0] - eye[0], py = Tp[1] + pc[1] - eye[1], pz = Tp[2] + pc[2] - eye[2];
      const pd = Math.hypot(px, py, pz);
      if (!frame.sphereVisible([px, py, pz], Pt.rad)) continue;
      const dd = Math.max(.3, pd - Pt.rad * .6);
      const m = this._m9;
      m[0] = Rp[0]; m[1] = Rp[3]; m[2] = Rp[6]; m[3] = Rp[1]; m[4] = Rp[4]; m[5] = Rp[7]; m[6] = Rp[2]; m[7] = Rp[5]; m[8] = Rp[8];
      gl.uniformMatrix3fv(u.uR, false, m);
      gl.uniform3f(u.uT, Tp[0] - eye[0], Tp[1] - eye[1], Tp[2] - eye[2]);
      const spMax = e.lods[e.lods.length - 1], dsp = d.dotSpacing !== undefined ? d.dotSpacing : this.dotSpacing;
      const spr = Pt.rad * flc / Math.max(.3, pd), kb = sat01((spr - 140) / 460);
      const graz = 1 - (1 - this.grazing) * kb * kb * (3 - 2 * kb);

      if (nested && !Pt.dyn) {
        const N = this._nest(e, Pt);
        // the finest layer this view needs (one more with prefetch), sampled within the frame's budget
        const sMin = .7 * this.lodPxN * Math.max(.3, pd - Pt.rad) / flc;   // (.7: depth, not distance, off the axis)
        let want = e.lods.length - 1;
        const ahead = F.prefetch ? 2.5 : 1;
        while (want > 0 && e.lods[want] > sMin / ahead) want--;
        if ((N.gen || N.done > want) && this.spent < this.budgetMs) this._runGen(e, Pt, N, N.gen ? N.genK : want, this.budgetMs);
        if (!N.n) continue;
        const s0 = N.flat ? 30 : 70, s1 = N.flat ? 110 : 220, kSmall = 1 - sstep((spr - s0) / (s1 - s0));
        gl.uniform4f(u.uP, pa, 0, 0, N.sigMin);
        gl.uniform4f(u.uDen, dsp, graz, Math.max(kSmall, 1e-4), 0);
        gl.uniform4f(u.uN, this.lodPxN, 1, N.sigMin, this.band);
        const age = this.now - N.birth, fk = F.fadeIn ? sat01(age / this.fadeT) : 1;
        gl.uniform4f(u.uX, 0, 0, N.newStart, fk);
        const cnt = this._count(N, sMin);
        if (!cnt) continue;
        gl.bindVertexArray(N.vao);
        gl.drawArrays(gl.POINTS, 0, cnt);
        drawn += cnt;
        continue;
      }
      // the engine's levels (xfade: hysteresis and a cross-dissolve; dyn parts in every mode)
      let lod = e.lods.length - 1;
      while (lod > 0 && e.lods[lod] * flc / dd > this.lodPx) lod--;
      let prev = -1, k = 1;
      if (xfade && !Pt.dyn) {
        const key = (d.id !== undefined ? d.id : d.key) + '|' + Pt.name;
        let S = this.xs.get(key);
        if (!S) { S = { lod, prev: -1, t0: -1e9 }; this.xs.set(key, S); }
        let L = S.lod;
        while (L > 0 && e.lods[L] * flc / dd > this.lodPx * this.hyst) L--;
        while (L < e.lods.length - 1 && e.lods[L + 1] * flc / dd < this.lodPx / this.hyst) L++;
        if (F.prefetch && L > 0 && e.lods[L] * flc / dd > this.lodPx * .55) this.cloud(e, Pt, L - 1, st);
        if (L !== S.lod) {
          const c = this.cloud(e, Pt, L, st);
          if (c && Pt.clouds[L] === c) { S.prev = S.lod; S.lod = L; S.t0 = this.now; }
          else if (!Pt.clouds[S.lod]) { S.lod = L; }
        }
        lod = S.lod; k = sat01((this.now - S.t0) / this.xfT); prev = k < 1 ? S.prev : -1;
      }
      const draws = [[lod, k < 1 ? 1 : 0]];
      if (prev >= 0 && Pt.clouds[prev]) draws.push([prev, -1]);
      for (const [l, mode] of draws) {
        const cl = this.cloud(e, Pt, l, st);
        if (!cl || !cl.n) continue;
        if (cl.flat === undefined) {
          const b8 = new Int8Array(cl.pts.buffer, cl.pts.byteOffset);
          const nrm = new Int8Array(cl.n * 4); for (let i = 0; i < cl.n; i++) { nrm[i * 4] = b8[i * 16 + 12]; nrm[i * 4 + 1] = b8[i * 16 + 13]; nrm[i * 4 + 2] = b8[i * 16 + 14]; }
          cl.flat = flatnessOf(nrm, cl.n) > .72; cl.layer = 1;
        }
        const s0 = cl.flat ? 30 : 70, s1 = cl.flat ? 110 : 220, kSmall = 1 - sstep((spr - s0) / (s1 - s0));
        gl.uniform4f(u.uP, pa, 0, 0, cl.sp);
        gl.uniform4f(u.uDen, dsp, graz, Math.max(kSmall, Math.min(1, (cl.sp / spMax) * (cl.sp / spMax))), 0);
        gl.uniform4f(u.uN, 0, 0, cl.sp, 1);
        gl.uniform4f(u.uX, k, mode, 1e9, 1);
        gl.bindVertexArray(cl.vao);
        gl.vertexAttrib1f(2, SIG_ALL);
        gl.drawArrays(gl.POINTS, 0, cl.n);
        drawn += cl.n;
      }
    }
    return drawn;
  }
}
