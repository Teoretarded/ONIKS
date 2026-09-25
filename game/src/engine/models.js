/* Model point caches: GEO.sample of the HD models, per part, at up to 4 levels of detail (spacing chosen from
   the model's size), uploaded to the GPU on first use. Each frame every part gets its rigid transform
   part.xf(st) and visibility part.show(st); dyn parts (telescoping rams, folding wings, fans with their blades
   in the geometry) are sampled lazily at quantized states and kept in a bounded LRU per part and level. The
   dependencies of a dyn part on the state are found by calling it once through a Proxy.
   Shading is the films' (pc_anatomy_film.js runPts): low moon + facing + rim, back faces thinned to a third
   at 0.09, two-sided panels at 0.45, depth fade, dot size from on-screen spacing; plus a fill light fixed to the
   view. Density is capped per pixel, not per metre (dotSpacing): big hulls seen close keep the films' dot structure
   instead of saturating into a white slab, small units stay dense silhouettes (see README, Models). */
import { HEAD, FRAME, COMMON, FS_POINT, CULL } from './shaders.js';
import { program } from './gl.js';

const TAU = Math.PI * 2;
/* state keys that are angles: wrapped and quantized round the circle */
const ANGLE_KEYS = new Set(['wheel', 'fan', 'rotor', 'trotor', 'prop', 'ant', 'sAnt', 'sps', 'ciwsSpin', 'spin', 'rot', 'radar', 'radars', 'spy']);
const ANGLE_STEPS = [72, 48, 24, 12];
const LIN_STEP = 1 / 40;
const LRU_MAX = 64;

export const VS = HEAD + FRAME + COMMON + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aNrm;
uniform mat3 uR;          // part -> world rotation
uniform vec3 uT;          // part origin, relative to the eye
uniform vec4 uTint;       // rgb, strength at the silhouette
uniform vec4 uP;          // alpha, x-ray, damage, sample spacing (m)
uniform vec4 uQ;          // no back faces, tint on the faces (fraction), brightness, dissolve
uniform vec4 uG;          // x-ray gate (Inspect): x mode (0 off, 1 shell: x-ray only behind the front, 2 hidden: drawn
                          // only behind it, 3 part: always drawn), z front band width (m), w afterglow (m)
uniform vec4 uGP;         // gate plane: xyz unit normal (world), w: the front as n.p_rte
uniform vec4 uDen;        // dots per pixel: x least spacing of the kept dots on screen (1080 px, 0: off), y grazing
                          // floor of the facing, z least kept share (the model's coarsest level)
uniform vec4 uFill;       // the view's fill light: xyz direction (toward it), w strength
out vec3 vCol;
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
  // the Inspect x-ray slice: a plane front along the model; lime band on this model only
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
      // back face: a third of them at 0.09 (more under the x-ray: the far wall shows through)
      if (uQ.x > 0.5 && xr <= 0.0) { ${CULL} return; }
      if ((gl_VertexID % 3) != 0 && hr > xr * 0.5) { ${CULL} return; }
      b = 0.09; lit = 0.1;
    } else {
      // the moon, and a fill fixed to the view (behind the lens, over its left shoulder): a hull side turned to the
      // camera never goes black from the wrong heading (the films frame their hulls lit); the moon keeps the decks
      float fac = min(1.0, -dn), lam = max(dot(n, uSun.xyz), uFill.w * dot(n, uFill.xyz)), w = 1.0 - fac;
      fk = max(fac, uDen.y);
      b = 0.06 + 0.74 * max(lam, 0.0) + 0.14 * fac + 0.34 * w * w * w;
      b *= 0.55 + 0.45 * b;
      lit = b;
      rim = fac < 0.18 ? 1.0 - fac / 0.18 : 0.0; rim *= rim;
    }
  }
  // dots per pixel, not per metre (the films keep the dot structure on a hull at any framing): the kept dots never
  // pack closer than uDen.x px on screen, faces seen edge-on counted by their facing (down to a floor, so the
  // silhouettes still gather), never thinner than the model's coarsest level (far off a unit stays a solid little
  // silhouette that pops, as in the films). The samples are a jittered grid: a hash keeps it free of moire
  float pxs = uP.w * uCam.x / c.w;
  if (uDen.x > 0.0) {
    float keep = max(pxs * pxs * fk / (uDen.x * uDen.x), uDen.z);
    if (keep < 1.0 && u01(hash1(hid ^ 0x5bd1e995u)) > keep) { ${CULL} return; }
  }
  if (xr > 0.0) {
    // the x-ray: the shell thins to a ghost so what is inside reads through it
    if (hr < xr * 0.5) { ${CULL} return; }
    b = mix(b, 0.05 + 0.2 * lit, xr);
  }
  b *= mix(1.0, 0.55, clamp(c.w / uMisc.w, 0.0, 1.0)) * uP.x * uQ.z * uMisc.z;
  if (yw < 0.0) b *= 0.35;
  vec3 col = mix(WH, uTint.rgb, uTint.a * mix(uQ.y, 1.0, rim));
  if (dmg > 0.0) col = mix(col, CORAL, min(1.0, dmg * 1.1));
  vec2 sc = scanAt(p);
  vec3 rgb = col * b;
  if (sc.x > 0.01) rgb = max(mix(rgb, uScanC[0].rgb * max(b, 0.95), sc.x), rgb);
  if (sc.y > 0.0) rgb = mix(rgb, rgb * 0.6 + uScanC[0].rgb * b * 0.5, 0.3 * sc.y);
  if (gk > 0.01) rgb = max(mix(rgb, LIME * max(b, 0.95), gk), rgb);
  rgb += lightsAt(p, two ? vec3(0.0) : n) * (0.35 + 0.65 * lit) * uP.x;
  vCol = min(rgb, vec3(1.0));
  gl_PointSize = dotPx(max(pxs, uDen.x) * (0.8 + 0.4 * hr));
}
`;

/* rotation (row-major 3x3) from heading (0 = north), pitch (+ nose up), roll (+ right wing down) */
export function attitude(hdg, pitch, roll) {
  const ch = Math.cos(hdg || 0), sh = Math.sin(hdg || 0), cp = Math.cos(-(pitch || 0)), sp = Math.sin(-(pitch || 0)), cr = Math.cos(-(roll || 0)), sr = Math.sin(-(roll || 0));
  // Ry(h) * Rx(-p) * Rz(-r)
  const Ry = [ch, 0, sh, 0, 1, 0, -sh, 0, ch], Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp], Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  return mul3(mul3(Ry, Rx), Rz);
}
export function mul3(A, B) {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return o;
}
const ap3 = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];

const BUILTIN = {
  tel: () => HD.tel(), radar: () => HD.radar(), pantsir: () => HD.pantsir(), oniks: () => HD.oniks(), oniksBooster: () => HD.oniksBooster(),
  sm6: () => HD.sm6(), mk72: () => HD.mk72(), destroyer: () => HD.destroyer(), carrier: () => HD.carrier(), helo: () => HD.helo(),
  fighter: () => HD.fighter(), fighterStores: () => HD.fighter({ stores: true }), drone: () => HD.drone(), catapult: () => HD.catapult(), satellite: () => HD.satellite(),
};

export class ModelLib {
  constructor(G) {
    this.G = G; this.gl = G.gl;
    this.P = program(this.gl, VS, FS_POINT, 'models');
    this.factories = new Map(Object.entries(BUILTIN));
    this.opts = new Map();
    this.entries = new Map();
    this.budgetMs = 6;              // sampling time per frame
    this.spent = 0;
    this.lodPx = 2.8;               // coarsest level whose spacing stays under this many 1080-px (the films: 4.4)
    this.dotSpacing = 1.8;          // dots per pixel: the kept dots never pack closer than this on screen (1080 px; 0 off)
    this.grazing = .3;              // ... faces seen edge-on counted by their facing down to this floor (large parts)
    this.fill = .6;                 // the view's fill light (behind the lens, over its left shoulder; 0 off)
    this.fillAz = Math.PI - .6; this.fillEl = .44;   // its bearing off the view heading (rad) and elevation (rad)
    this.stats = { parts: 0, points: 0, sampled: 0, gpuMB: 0 };
    this._m9 = new Float32Array(9);
  }
  /* register a model factory: factory() -> {parts: [...]} in the GEO/HD part format.
     opts: { lods: [spacings], quant: {stateKey: step}, angles: [stateKeys], deps: {partName: [keys]} } */
  registerModel(key, factory, opts) {
    this.factories.set(key, factory); if (opts) this.opts.set(key, opts);
    const e = this.entries.get(key); if (e) { this._free(e); this.entries.delete(key); }
  }
  /* register a table of factories (e.g. data/models.js EXTRA_MODELS / CUT_MODELS); info[key].s = suggested
     spacings [near, mid, far] (data/models.js MODEL_INFO) become the levels of detail */
  registerAll(table, info) {
    for (const [k, f] of Object.entries(table || {})) {
      if (typeof f !== 'function') continue;
      const s = info && info[k] && info[k].s;
      this.registerModel(k, () => f(), s ? { lods: [s[0], s[1], s[2], s[2] * 2.5] } : undefined);
    }
  }
  has(key) { return this.factories.has(key); }
  /* the model entry (built on first use) */
  get(key) {
    let e = this.entries.get(key);
    if (e) return e;
    const f = this.factories.get(key);
    if (!f) throw new Error(`model '${key}' is not registered`);
    const model = f(), o = this.opts.get(key) || {};
    // rest-pose bounds (with each part's rest transform)
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    const parts = model.parts.map(part => {
      let b;
      try { b = GEO.bounds(part); } catch (err) { b = [[-1, -1, -1], [1, 1, 1]]; }
      let X0 = null; try { X0 = part.xf ? part.xf({}) : null; } catch (err) { X0 = null; }
      const c = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2];
      const rad = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]) / 2;
      const cw = X0 ? [X0.R[0] * c[0] + X0.R[1] * c[1] + X0.R[2] * c[2] + X0.T[0], X0.R[3] * c[0] + X0.R[4] * c[1] + X0.R[5] * c[2] + X0.T[1], X0.R[6] * c[0] + X0.R[7] * c[1] + X0.R[8] * c[2] + X0.T[2]] : c;
      if (rad < 1e6) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], cw[k] - rad * .8); mx[k] = Math.max(mx[k], cw[k] + rad * .8); }
      const P = { part, name: part.name, label: part.label, center: c, rad: Math.max(.05, rad), bounds: b, dyn: !!part.dyn, clouds: [], lru: null, deps: null, exact: true };
      if (P.dyn) this._deps(P, o);
      return P;
    });
    const L = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
    const sp0 = o.lods ? o.lods[0] : Math.max(.02, L / (L > 100 ? 1000 : 380));
    const lods = o.lods || [sp0, sp0 * 2.4, sp0 * 6, sp0 * 15];
    e = { key, model, parts, lods, L, center: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], radius: Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2, o, anchors: model };
    for (const P of parts) { P.clouds = lods.map(() => null); if (P.dyn) P.lru = lods.map(() => new Map()); }
    this.entries.set(key, e);
    return e;
  }
  /* which state keys a dyn part reads */
  _deps(P, o) {
    if (o.deps && o.deps[P.name]) { P.deps = o.deps[P.name]; return; }
    const keys = new Set();
    const px = new Proxy({}, { get(t, k) { if (typeof k === 'string') keys.add(k); return undefined; }, has(t, k) { if (typeof k === 'string') keys.add(k); return false; } });
    try { P.part.dyn(px); } catch (err) { P.exact = false; }
    P.deps = [...keys];
    P.angleOnly = P.exact && P.deps.length > 0 && P.deps.every(k => ANGLE_KEYS.has(k) || (o.angles && o.angles.includes(k)));
  }
  _quant(e, P, st, lod) {
    const o = e.o, q = {}, ks = [];
    const keys = P.exact ? P.deps : Object.keys(st);
    for (const k of keys) {
      let v = st[k];
      if (typeof v === 'number') {
        if (ANGLE_KEYS.has(k) || (o.angles && o.angles.includes(k))) {
          const n = ANGLE_STEPS[Math.min(lod, 3)];
          let a = v % TAU; if (a < 0) a += TAU;
          v = Math.round(a / TAU * n) % n * (TAU / n);
        } else { const s = (o.quant && o.quant[k]) || LIN_STEP; v = Math.round(v / s) * s; }
        ks.push(k + '=' + v.toFixed(4));
      } else if (v !== undefined && v !== null && typeof v === 'object') ks.push(k + '=' + JSON.stringify(v));
      else ks.push(k + '=' + v);
      q[k] = v;
    }
    return { key: ks.join('|'), st: Object.assign({}, st, q) };
  }
  _sample(e, P, lod, st) {
    const t0 = performance.now();
    const sp = e.lods[lod];
    const seed = 7 + lod * 13 + (P.name.length * 31) % 97;
    const res = GEO.sample({ parts: [P.part] }, sp, seed, st || {}, lod >= 2 ? { fine: false } : undefined)[0];
    const pts = res.pts, n = pts.length / 6;
    const cl = this._upload(pts, n, sp);
    this.spent += performance.now() - t0;
    this.stats.sampled++;
    return cl;
  }
  _upload(pts, n, sp) {
    const gl = this.gl;
    if (!n) return { n: 0, sp };
    const buf = new ArrayBuffer(n * 16), f = new Float32Array(buf), b = new Int8Array(buf);
    for (let i = 0; i < n; i++) {
      const j = i * 6;
      f[i * 4] = pts[j]; f[i * 4 + 1] = pts[j + 1]; f[i * 4 + 2] = pts[j + 2];
      let nx = pts[j + 3], ny = pts[j + 4], nz = pts[j + 5];
      const l = Math.hypot(nx, ny, nz);
      if (l > 1e-6) { nx /= l; ny /= l; nz /= l; }
      b[i * 16 + 12] = Math.round(nx * 127); b[i * 16 + 13] = Math.round(ny * 127); b[i * 16 + 14] = Math.round(nz * 127); b[i * 16 + 15] = 0;
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.BYTE, true, 16, 12);
    gl.bindVertexArray(null);
    this.stats.points += n; this.stats.gpuMB += n * 16 / 1048576;
    return { vao, vb, n, sp, pts: f };
  }
  _freeCloud(c) { if (c && c.vao) { this.gl.deleteVertexArray(c.vao); this.gl.deleteBuffer(c.vb); this.stats.points -= c.n; this.stats.gpuMB -= c.n * 16 / 1048576; } }
  _free(e) { for (const P of e.parts) { P.clouds.forEach(c => this._freeCloud(c)); if (P.lru) P.lru.forEach(m => m.forEach(c => this._freeCloud(c))); } }

  /* the cloud of part P at level lod for state st: cached, or sampled within the frame's budget, or the
     nearest thing available (a coarser level, the last state) */
  cloud(e, P, lod, st, force) {
    if (!P.dyn) {
      let c = P.clouds[lod];
      if (c) return c;
      if (force || this.spent < this.budgetMs) return (P.clouds[lod] = this._sample(e, P, lod, {}));
      for (let k = lod + 1; k < e.lods.length; k++) if (P.clouds[k]) return P.clouds[k];
      for (let k = lod - 1; k >= 0; k--) if (P.clouds[k]) return P.clouds[k];
      return (P.clouds[lod] = this._sample(e, P, lod, {}));
    }
    const lru = P.lru[lod], q = this._quant(e, P, st, lod);
    let c = lru.get(q.key);
    if (c) { lru.delete(q.key); lru.set(q.key, c); return c; }
    if (force || this.spent < this.budgetMs || !lru.size) {
      c = this._sample(e, P, lod, q.st);
      lru.set(q.key, c);
      // a part that only turns (fans with the blades in the geometry) keeps every step of its turn
      const cap = P.angleOnly ? ANGLE_STEPS[Math.min(lod, 3)] + 4 : LRU_MAX;
      if (lru.size > cap) { const k0 = lru.keys().next().value; this._freeCloud(lru.get(k0)); lru.delete(k0); }
      return c;
    }
    // over budget: the most recent state at this level, or at a coarser one
    let last = null; for (const v of lru.values()) last = v;
    return last;
  }
  /* pre-sample every part of a model at the given levels (default: the two coarsest), outside the frame budget */
  warm(key, lods) {
    const e = this.get(key);
    const ls = lods || [e.lods.length - 1, e.lods.length - 2];
    for (const l of ls) for (const P of e.parts) if (!P.dyn) this.cloud(e, P, l, {}, true);
    return e;
  }

  /* ---------- drawing ---------- */
  begin() { this.spent = 0; }
  /* draw one instance. d = {key, R (row-major 3x3 world rotation), T (world position), st, tint [r,g,b] 0..1,
     tintK, alpha, xray, damage {part: 0..1}, partAlpha {part: a}, partXray {part: x}, partX {part: X}, explode,
     noBack, bright, dissolve}. Returns the number of points drawn. */
  draw(d, cam, frame) {
    const e = this.get(d.key), gl = this.gl, P = this.P, u = P.u, eye = cam.eye, st = d.st || {};
    const flc = frame.fl1080, R0 = d.R, T0 = d.T;
    // whole-model cull
    const cw = [R0[0] * e.center[0] + R0[1] * e.center[1] + R0[2] * e.center[2] + T0[0], R0[3] * e.center[0] + R0[4] * e.center[1] + R0[5] * e.center[2] + T0[1], R0[6] * e.center[0] + R0[7] * e.center[1] + R0[8] * e.center[2] + T0[2]];
    const dv = [cw[0] - eye[0], cw[1] - eye[1], cw[2] - eye[2]];
    const dist = Math.hypot(dv[0], dv[1], dv[2]);
    const rad = e.radius * (1 + (d.explode || 0) * 1.5);
    if (!frame.sphereVisible(dv, rad)) return 0;
    if (e.radius * flc / Math.max(1, dist) < .7) { d.speck = true; return 0; }
    d.speck = false;
    gl.useProgram(P.p);
    const tint = d._rgb || [1, 1, 1];
    gl.uniform4f(u.uTint, tint[0], tint[1], tint[2], d._k || 0);
    gl.uniform4f(u.uQ, d.noBack ? 1 : 0, d._face || 0, d.bright === undefined ? 1 : d.bright, d.dissolve || 0);
    { const f = cam.f, az = Math.atan2(f[0], f[2]) + this.fillAz, ce = Math.cos(this.fillEl);
      gl.uniform4f(u.uFill, ce * Math.sin(az), Math.sin(this.fillEl), ce * Math.cos(az), this.fill); }
    // Inspect x-ray gate: d.gate = { n: world unit normal, d: n.p of the front (world), w: band (m), g: afterglow (m),
    // mode: default per part }, d.partGate = { part: mode } (0 off, 1 shell, 2 hidden, 3 part; see the shader)
    const G = d.gate || null;
    if (G) gl.uniform4f(u.uGP, G.n[0], G.n[1], G.n[2], G.d - (G.n[0] * eye[0] + G.n[1] * eye[1] + G.n[2] * eye[2]));
    let drawn = 0;
    const ex = d.explode || 0;
    for (const Pt of e.parts) {
      const part = Pt.part;
      if (part.show && !part.show(st)) continue;
      const pa = (d.partAlpha && d.partAlpha[Pt.name] !== undefined ? d.partAlpha[Pt.name] : 1) * (d.alpha === undefined ? 1 : d.alpha);
      if (pa <= .004) continue;
      let X = part.xf ? part.xf(st) : null;
      let Rp = X ? mul3(R0, X.R) : R0;
      let Tp = X ? [R0[0] * X.T[0] + R0[1] * X.T[1] + R0[2] * X.T[2] + T0[0], R0[3] * X.T[0] + R0[4] * X.T[1] + R0[5] * X.T[2] + T0[1], R0[6] * X.T[0] + R0[7] * X.T[1] + R0[8] * X.T[2] + T0[2]] : T0;
      if (d.partX && d.partX[Pt.name]) { const Y = d.partX[Pt.name]; Tp = [Tp[0] + Rp[0] * Y.T[0] + Rp[1] * Y.T[1] + Rp[2] * Y.T[2], Tp[1] + Rp[3] * Y.T[0] + Rp[4] * Y.T[1] + Rp[5] * Y.T[2], Tp[2] + Rp[6] * Y.T[0] + Rp[7] * Y.T[1] + Rp[8] * Y.T[2]]; Rp = mul3(Rp, Y.R); }
      if (ex > 0) {
        // exploded view: each assembly floats away from the model's centre along its own offset
        const pc = X ? [X.R[0] * Pt.center[0] + X.R[1] * Pt.center[1] + X.R[2] * Pt.center[2] + X.T[0], X.R[3] * Pt.center[0] + X.R[4] * Pt.center[1] + X.R[5] * Pt.center[2] + X.T[1], X.R[6] * Pt.center[0] + X.R[7] * Pt.center[1] + X.R[8] * Pt.center[2] + X.T[2]] : Pt.center;
        const off = [(pc[0] - e.center[0]) * ex * 1.1, (pc[1] - e.center[1]) * ex * 1.1 + ex * e.L * .08 * ((Pt.name.length % 3) + 1) / 3, (pc[2] - e.center[2]) * ex * 1.1];
        const ow = ap3(R0, off); Tp = [Tp[0] + ow[0], Tp[1] + ow[1], Tp[2] + ow[2]];
      }
      // this part's level of detail from its own distance
      const pc = ap3(Rp, Pt.center);
      const px = Tp[0] + pc[0] - eye[0], py = Tp[1] + pc[1] - eye[1], pz = Tp[2] + pc[2] - eye[2];
      const pd = Math.hypot(px, py, pz);
      if (!frame.sphereVisible([px, py, pz], Pt.rad)) continue;
      const dd = Math.max(.3, pd - Pt.rad * .6);
      let lod = e.lods.length - 1;
      while (lod > 0 && e.lods[lod] * flc / dd > this.lodPx) lod--;
      if (d.lodBias) lod = Math.max(0, Math.min(e.lods.length - 1, lod + d.lodBias));
      const cl = this.cloud(e, Pt, lod, st);
      if (!cl || !cl.n) continue;
      const m = this._m9;
      m[0] = Rp[0]; m[1] = Rp[3]; m[2] = Rp[6]; m[3] = Rp[1]; m[4] = Rp[4]; m[5] = Rp[7]; m[6] = Rp[2]; m[7] = Rp[5]; m[8] = Rp[8];
      gl.uniformMatrix3fv(u.uR, false, m);
      gl.uniform3f(u.uT, Tp[0] - eye[0], Tp[1] - eye[1], Tp[2] - eye[2]);
      const xr = d.partXray && d.partXray[Pt.name] !== undefined ? d.partXray[Pt.name] : (d.xray || 0);
      const dm = d.damage && d.damage[Pt.name] ? d.damage[Pt.name] : 0;
      gl.uniform4f(u.uP, pa, xr, dm, cl.sp);
      const gm = G ? (d.partGate && d.partGate[Pt.name] !== undefined ? d.partGate[Pt.name] : (G.mode || 0)) : 0;
      gl.uniform4f(u.uG, gm, 0, G ? G.w || 1 : 1, G ? G.g || 1 : 1);
      // dots per pixel: thinned on screen, never below the density of the model's coarsest level. Faces seen edge-on
      // are counted by their facing only on parts large on screen (a deck, a hull side: no slab); a small part keeps
      // its silhouette's pile-up (a wing, a mast: the films' crisp edges)
      const spMax = e.lods[e.lods.length - 1], dsp = d.dotSpacing !== undefined ? d.dotSpacing : this.dotSpacing;
      // A part small on screen is not thinned at all: a unit seen from play range stays a dense bright silhouette that
      // pops over the ground (the films' small ships); the cap comes in as the part grows past ~70-220 px
      const spr = Pt.rad * flc / Math.max(.3, pd), kb = Math.max(0, Math.min(1, (spr - 140) / 460));
      const ks = Math.max(0, Math.min(1, (spr - 70) / 150)), kSmall = 1 - ks * ks * (3 - 2 * ks);
      gl.uniform4f(u.uDen, dsp, 1 - (1 - this.grazing) * kb * kb * (3 - 2 * kb), Math.max(kSmall, Math.min(1, (cl.sp / spMax) * (cl.sp / spMax))), 0);
      gl.bindVertexArray(cl.vao);
      gl.drawArrays(gl.POINTS, 0, cl.n);
      drawn += cl.n;
    }
    return drawn;
  }

  /* screen box of an instance as drawn (thinned points of the coarse level through cam.project) */
  screenBox(d, cam) {
    const e = this.get(d.key), st = d.st || {}, R0 = d.R, T0 = d.T, q = [0, 0, 0];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, ok = false;
    const lod = Math.min(e.lods.length - 1, 2);
    for (const Pt of e.parts) {
      const part = Pt.part;
      if (part.show && !part.show(st)) continue;
      if (d.partAlpha && d.partAlpha[Pt.name] === 0) continue;
      const cl = this.cloud(e, Pt, lod, st, true);
      if (!cl || !cl.n) continue;
      const X = part.xf ? part.xf(st) : null;
      const Rp = X ? mul3(R0, X.R) : R0;
      const Tp = X ? [R0[0] * X.T[0] + R0[1] * X.T[1] + R0[2] * X.T[2] + T0[0], R0[3] * X.T[0] + R0[4] * X.T[1] + R0[5] * X.T[2] + T0[1], R0[6] * X.T[0] + R0[7] * X.T[1] + R0[8] * X.T[2] + T0[2]] : T0;
      const f = cl.pts, n = cl.n, step = Math.max(1, Math.floor(n / 160));
      for (let i = 0; i < n; i += step) {
        const x = f[i * 4], y = f[i * 4 + 1], z = f[i * 4 + 2];
        const w = [Rp[0] * x + Rp[1] * y + Rp[2] * z + Tp[0], Rp[3] * x + Rp[4] * y + Rp[5] * z + Tp[1], Rp[6] * x + Rp[7] * y + Rp[8] * z + Tp[2]];
        if (!cam.project(w, q)) continue;
        ok = true;
        if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
      }
    }
    return ok ? [x0, y0, x1, y1] : null;
  }
  /* world transform of a named part of an instance (for anchors: muzzles, tubes, rotor hubs) */
  partWorld(d, name) {
    const e = this.get(d.key), Pt = e.parts.find(p => p.name === name); if (!Pt) return null;
    const X = Pt.part.xf ? Pt.part.xf(d.st || {}) : { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: [0, 0, 0] };
    const R = mul3(d.R, X.R), T = ap3(d.R, X.T);
    return { R, T: [T[0] + d.T[0], T[1] + d.T[1], T[2] + d.T[2]] };
  }
}
