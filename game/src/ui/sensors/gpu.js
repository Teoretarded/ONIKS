/* SENSORS' own point passes on the GPU, drawn right after the engine's frame (same frame uniform block, same
   log depth, the terrain occluder still in the depth buffer, max blending like every film dot):
   - the sea clutter height field of the radar scope (p2_clutter / pa_picture_scope): a range x azimuth lattice
     of resolution cells round a radar; each sweep draws every cell's return (sea clutter ~R^-3 inside the
     critical range, ~R^-7 beyond, brighter upwind, wind rows, spikes, rain in the squalls, a CA-CFAR threshold);
     the cells pop up as the beam paints them and settle through the rotation, lime at the leading edge, the
     detections as stalks. All of it per vertex from hashes of (cell, sweep): nothing is stored per frame.
     In the normal view the same lattice shows only its strong returns (the sea close to the radar, the rain of
     the squalls) flat on the sea: the speckle the sweep paints and leaves to fade.
   - the storm's cloud ceiling: a sparse layer of dark dots over the squalls, lit from inside by lightning. */
import { HEAD, FRAME, COMMON, CULL } from '../../engine/shaders.js';
import { program } from '../../engine/gl.js';
import { rng, TAU, DEG } from './core.js';

const NOISE = `
float hv2(vec2 p) { ivec2 i = ivec2(floor(p)); return u01(hash2(uo(i.x), uo(i.y))); }
float vnoise(vec2 p) {
  vec2 f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hv2(p), hv2(p + vec2(1.0, 0.0)), u.x), mix(hv2(p + vec2(0.0, 1.0)), hv2(p + vec2(1.0, 1.0)), u.x), u.y) * 2.0 - 1.0;
}
float fbm2(vec2 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 17.1) + 0.125 * vnoise(p * 4.1 + 3.7); }
`;

const VS_CLUT = HEAD + FRAME + COMMON + NOISE + `
layout(location = 0) in vec4 aA;      // x, z from the lattice origin (m); cell id; spike probability
layout(location = 1) in float aK;     // wave phase (rad)
uniform vec4 uO;      // lattice origin relative to the eye (x, y, z)
uniform vec4 uOw;     // lattice origin world (x, z) in km; z: critical range (km, 64 km scale); w: wind bearing
uniform vec4 uRad;    // radar relative to the lattice origin (x, z) m; z: range (m); w: display height (m per dB)
uniform vec4 uS;      // x: beam phase (continuous rad); y: alpha; z: mode 1 scope / 0 rain speckle; w: stalk fraction
uniform vec4 uSq[8];  // squalls relative to the lattice origin: x, z, r (m), strength
uniform int uNSq;
out vec4 vC;
void main() {
  vec2 d = aA.xy - uRad.xy;
  float r = length(d), RM = uRad.z;
  if (r > RM || r < RM * 0.005) { ${CULL} return; }
  float az = atan(d.x, d.y);
  float dd = uS.x - az;
  float s = floor(dd / 6.2831853);
  dd -= s * 6.2831853;
  uint id = uint(aA.z), si = uint(int(s) + 1048576);
  // rain returns
  float rc = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uNSq) break;
    vec4 q = uSq[i];
    float dq = length(aA.xy - q.xy) / q.z;
    if (dq < 1.0) {
      float qq = q.w * (1.0 - smoothstep(0.3, 1.0, dq)) * (0.55 + 0.45 * vnoise(aA.xy / 2600.0 + float(i) * 7.3 + vec2(s * 0.01, 0.0)));
      rc = max(rc, pow(10.0, 5.0 * qq) - 1.0);
    }
  }
  bool scope = uS.z > 0.5;
  // sea clutter power / receiver noise (the p2 model on a 64 km scale)
  float rn = max(0.2, r / RM * 64.0), RH = uOw.z;
  float g = rn < RH ? pow(RH / rn, 3.0) : pow(RH / rn, 7.0);
  float wd = 0.5 + 0.5 * cos(az - uOw.w);
  vec2 wk = uOw.xy + aA.xy / 1000.0;
  float sw = sin(uOw.w), cw = cos(uOw.w);
  float tu = wk.x * sw + wk.y * cw, tv = wk.x * cw - wk.y * sw;
  float tex = exp(1.4 * fbm2(vec2(tu * 0.14, tv * 0.7) + 3.7) - 0.25);
  float c = 6.3 * g * (0.3 + 0.7 * wd * wd) * tex * (1.0 + 0.45 * sin(aK + s * 1.3)) + rc;
  // the normal view keeps only the strong returns (near the radar, the rain), flat on the sea
  if (!scope && c < 1.1) { ${CULL} return; }
  float spike = u01(hash2(id, uint(int(floor((s + float(id % 3u)) / 3.0)) + 1048576) * 7u + 3u)) < aA.w + (rc > 30.0 ? 0.0022 : 0.0) ? 14.0 : 1.0;
  float h1 = max(1e-7, u01(hash2(id, si * 2u + 1u))), h2 = max(1e-7, u01(hash2(id, si * 2u + 2u)));
  float P = -log(h1) + c * spike * -log(h2);
  bool det = P / (1.0 + c) > 8.2;
  float db = 4.343 * log(P);
  float br = clamp((db + 14.0) / 40.0, 0.16, 1.0);
  float glow = exp(-dd * 0.75), rise = dd < 0.5 ? 1.0 - exp(-dd * 16.0) : 1.0;
  float y = uRad.w * (max(0.0, db - 2.0) + (det ? 12.0 : 0.0)) * rise * (0.45 + 0.55 * glow);
  if (uS.w > 0.0) { if (!det) { ${CULL} return; } y *= uS.w; }
  // over the swell (the sea surface is an occluder)
  y += scope ? 4.0 : 2.5;
  if (!scope) y = 2.5;
  vec3 p = vec3(uO.x + aA.x, uO.y + y, uO.z + aA.y);
  p.y -= curveDrop(p);
  vec4 cl = toClip(p);
  if (cl.w < uCam.w) { ${CULL} return; }
  gl_Position = cl;
  float b = br * (0.5 + 0.9 * glow) * 1.5;
  vec3 col = WH;
  if (dd < 0.6) { float k = exp(-dd * 7.0); col = mix(col, LIME, k); b = max(b, k * 0.7); }
  if (det) b = max(b, 0.5 + 0.5 * glow);
  if (uS.w > 0.0) b *= 0.5;
  if (!scope) b = min(1.0, c / 10.0) * br * (0.22 + 0.9 * glow) * 1.25 + (dd < 0.25 ? 0.55 * exp(-dd * 12.0) : 0.0);
  vC = vec4(col, min(1.0, b) * uS.y);
  float ps = (det || cl.w < RM * 0.6) ? 2.0 : 1.0;
  if (!scope) ps = 1.0;
  gl_PointSize = max(1.0, floor(ps * uCam.y + 0.5));
}
`;

const VS_CEIL = HEAD + FRAME + COMMON + NOISE + `
/* the ceiling as nested lattices round the eye (no buffers: the vertex id is the cell), spacing x3 per level,
   stable in the world (cells snap to the world grid, jitter from the world cell's hash) */
uniform vec4 uC;      // x: overcast, y: base altitude (m), z: thickness (m), w: alpha
uniform vec4 uSq[8];  // squalls (world): x, z, r, strength
uniform int uNSq;
uniform vec4 uFl[4];  // flashes (world): x, z, radius, intensity
uniform vec4 uT;      // x: time (s); y: fade from the eye height; zw: how far the wind has carried the cloud texture (m)
uniform vec4 uLv;     // x: spacing (m), y: cells per side, z: inner half-extent to skip (m), w: level index
uniform vec4 uMap;    // map half-extents + margin: x, z
out vec4 vC;
void main() {
  int N = int(uLv.y), id = gl_VertexID;
  float sp = uLv.x;
  vec2 cell0 = floor(uEyeW.xz / sp) - float(N / 2);
  vec2 cl2 = cell0 + vec2(float(id % N), float(id / N));
  uint hc = hash2(uo(int(cl2.x)), uo(int(cl2.y)) + uint(sp) * 7919u);
  float h1 = u01(hc), h2 = u01(hash1(hc ^ 0x9E3779B9u)), h3 = u01(hash1(hc ^ 0x85EBCA6Bu)), h4 = u01(hash1(hc ^ 0x27d4eb2fu));
  vec2 w = (cl2 + vec2(h1, h2)) * sp;
  if (abs(w.x) > uMap.x || abs(w.y) > uMap.y) { ${CULL} return; }
  // inside the finer level: skip (with a dissolve band so the seam never shows)
  vec2 dl = abs(w - uEyeW.xz);
  float m = max(dl.x, dl.y);
  if (uLv.z > 0.0 && m < uLv.z * mix(0.8, 1.0, h4)) { ${CULL} return; }
  // cheap frustum test at the layer's mid height before any noise
  vec3 p0 = vec3(w.x - uEyeW.x, uC.y + uC.z * 0.5 - uEyeW.y, w.y - uEyeW.z);
  p0.y -= curveDrop(p0);
  vec4 c0 = uVP * vec4(p0, 1.0);
  float mg = uC.z + 500.0;
  if (c0.w < -mg || abs(c0.x) > c0.w * 1.1 + mg * 2.0 || abs(c0.y) > c0.w * 1.1 + mg * 2.0) { ${CULL} return; }
  vec2 wn = w - uT.zw;
  float cov = uC.x;
  for (int i = 0; i < 8; i++) {
    if (i >= uNSq) break;
    float d = length(w - uSq[i].xy) / uSq[i].z;
    cov = max(cov, (1.0 - smoothstep(0.25, 1.35, d)) * min(1.0, uSq[i].w * 2.0));
  }
  if (cov < 0.02) { ${CULL} return; }
  // cells: big billows, broken into clumps with gaps between them
  float n = fbm2(wn / 6000.0) * 0.6 + 0.5, cl = fbm2(wn / 1500.0 + 5.3) * 0.9 + 0.5;
  float dens = cov * (0.2 + 0.8 * smoothstep(0.3, 0.62, n + cov * 0.15)) * (0.15 + 0.85 * smoothstep(0.32, 0.6, cl));
  // thin the fine levels so the on-screen density stays even
  float keep = dens;
  if (h3 > keep) { ${CULL} return; }
  float lump = clamp(fbm2(wn / 3200.0 + 11.0) * 0.8 + 0.5, 0.0, 1.0);
  float alt = uC.y + uC.z * lump * (0.4 + 0.6 * cl) - (1.0 - dens) * 250.0 + (h4 - 0.5) * min(sp * 3.0, 400.0);
  vec3 p = vec3(w.x - uEyeW.x, alt - uEyeW.y, w.y - uEyeW.z);
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  gl_Position = c;
  // the billow tops catch the light, the gaps and the undersides stay dark
  float b = (0.22 + 0.26 * h2) * (0.45 + 0.75 * cl * lump);
  vec3 fc = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 F = uFl[i];
    if (F.w <= 0.0) continue;
    vec2 dv = w - F.xy;
    float q = dot(dv, dv) / (F.z * F.z);
    if (q < 1.0) { float k = 1.0 - q; k *= k; fc += vec3(0.86, 0.95, 1.0) * k * F.w; }
  }
  vec3 col = WH * b * mix(1.0, 0.6, clamp(c.w / 70000.0, 0.0, 1.0)) + fc;
  vC = vec4(min(col, vec3(1.0)), uC.w * uT.y);
  gl_PointSize = max(1.0, floor((c.w < 4000.0 ? 2.0 : 1.0) * uCam.y + 0.5));
}
`;

const FS = HEAD + `
in vec4 vC; out vec4 o;
void main() { o = vec4(vC.rgb * vC.a, 1.0); }
`;

export function createGPU(R) {
  const gl = R.gl;
  let pC = null, pK = null, ok = true;
  try { pC = program(gl, VS_CLUT, FS, 'sensors.clutter'); pK = program(gl, VS_CEIL, FS, 'sensors.ceiling'); }
  catch (e) { console.error('sensors: GPU passes unavailable', e); ok = false; }

  /* ---------- the clutter lattice of one radar ---------- */
  const lats = new Map();          // radar unit id -> lattice { ox, oz, RM, n, vao, vb, kb, job }
  function lattice(id, ox, oz, RM, map) {
    let L = lats.get(id);
    const moved = L ? Math.hypot(L.ox - ox, L.oz - oz) : 1e9;
    if (L && L.RM === RM && moved < Math.max(1500, RM * .025)) { lats.delete(id); lats.set(id, L); step(L, map); return L.n ? L : (L.prev && L.prev.n ? L.prev : null); }
    // start (re)building; keep drawing the old one meanwhile
    const prev = L && L.n ? L : (L && L.prev) || null;
    L = { ox, oz, RM, n: 0, vao: null, vb: null, kb: null, prev, job: { bin: 0, A: [], K: [], id: 0 } };
    lats.delete(id); lats.set(id, L);
    // keep a few radars' lattices (the oldest go)
    while (lats.size > 3) { const k0 = lats.keys().next().value, L0 = lats.get(k0); lats.delete(k0); free(L0); if (L0.prev) free(L0.prev); }
    step(L, map);
    return L.n ? L : prev;
  }
  const DAZ = .42 * DEG, NAZ = Math.round(360 / .42);
  function step(L, map) {
    const J = L.job; if (!J) return;
    const r0 = rng(2402 + J.bin * 7919), km = L.RM / 64000;
    const rstep = r => (40 + r / km * .012) * km;
    const t0 = performance.now();
    while (J.bin < NAZ && performance.now() - t0 < 1.2) {
      const azc = (J.bin + .5) * DAZ;
      for (let r = 500 * km; r < L.RM; r += rstep(r)) {
        const az = azc + (r0() - .5) * DAZ * .7, rr = r + (r0() - .5) * rstep(r) * .6;
        const x = Math.sin(az) * rr, z = Math.cos(az) * rr;
        const h = map.h(L.ox + x, L.oz + z);
        if (h > -3) continue;
        J.A.push(x, z, J.id++, .00008 * (h > -40 ? 3 : 1));
        J.K.push(r0() * TAU);
      }
      J.bin++;
    }
    if (J.bin < NAZ) return;
    // upload
    const n = J.A.length / 4;
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(J.A), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
    const kb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, kb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(J.K), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 4, 0);
    gl.bindVertexArray(null);
    L.vao = vao; L.vb = vb; L.kb = kb; L.n = n; L.job = null;
    if (L.prev) { free(L.prev); L.prev = null; }
  }
  function free(L) { if (L.vao) { gl.deleteVertexArray(L.vao); gl.deleteBuffer(L.vb); gl.deleteBuffer(L.kb); L.vao = null; L.n = 0; } }

  /* ---------- the ceiling: attribute-less lattices (the vertex id is the cell) ---------- */
  let emptyVao = null;
  const CN = 400, CLV = [0, 0, 0, 0, 0];

  /* ---------- drawing (after R.end(): the frame block still holds this frame) ---------- */
  function begin() {
    gl.viewport(0, 0, R.G.W, R.G.H);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, R.ubo);
  }
  function end() {
    gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
  }
  const SQ = new Float32Array(32), FL = new Float32Array(16);
  /* o: { L (lattice), radar [x, z] world, phase, alpha, scope (bool), heightK, wind (rad), rhor (km), squalls } */
  function drawClutter(o) {
    if (!ok || !o.L || !o.L.n) return;
    const L = o.L, e = R.camera.eye, u = pC.u;
    gl.useProgram(pC.p);
    gl.uniform4f(u.uO, L.ox - e[0], -e[1], L.oz - e[2], 0);
    gl.uniform4f(u.uOw, L.ox / 1000, L.oz / 1000, o.rhor, o.wind);
    gl.uniform4f(u.uRad, o.radar[0] - L.ox, o.radar[1] - L.oz, L.RM, o.heightK);
    let n = 0;
    if (o.squalls) for (const s of o.squalls) { if (n >= 8) break; SQ[n * 4] = s.x - L.ox; SQ[n * 4 + 1] = s.z - L.oz; SQ[n * 4 + 2] = s.r; SQ[n * 4 + 3] = s.q; n++; }
    gl.uniform4fv(u.uSq, SQ); gl.uniform1i(u.uNSq, n);
    gl.bindVertexArray(L.vao);
    const passes = o.scope ? [0, .25, .5, .75] : [0];
    for (const f of passes) {
      gl.uniform4f(u.uS, o.phase, o.alpha, o.scope ? 1 : 0, f);
      gl.drawArrays(gl.POINTS, 0, L.n);
    }
  }
  /* o: { map, overcast, base, thick, alpha, squalls [{x, z, r, q}], flashes [{x, z, r, i}], t, eyeFade, drift [x, z] } */
  function drawCeiling(o) {
    if (!ok) return;
    if (!emptyVao) emptyVao = gl.createVertexArray();
    const u = pK.u;
    gl.useProgram(pK.p);
    gl.uniform4f(u.uC, o.overcast, o.base, o.thick, o.alpha);
    let n = 0;
    for (const s of o.squalls || []) { if (n >= 8) break; SQ[n * 4] = s.x; SQ[n * 4 + 1] = s.z; SQ[n * 4 + 2] = s.r; SQ[n * 4 + 3] = s.q; n++; }
    gl.uniform4fv(u.uSq, SQ); gl.uniform1i(u.uNSq, n);
    FL.fill(0);
    let m = 0;
    for (const f of o.flashes || []) { if (m >= 4) break; FL[m * 4] = f.x; FL[m * 4 + 1] = f.z; FL[m * 4 + 2] = f.r; FL[m * 4 + 3] = f.i; m++; }
    gl.uniform4fv(u.uFl, FL);
    gl.uniform4f(u.uT, o.t, o.eyeFade, o.drift ? o.drift[0] : 0, o.drift ? o.drift[1] : 0);
    gl.uniform4f(u.uMap, o.map.W / 2 + 15000, o.map.H / 2 + 15000, 0, 0);
    gl.bindVertexArray(emptyVao);
    // nested lattices, spacing x2 per level; the finest from the lens' height over the layer (a power of two
    // of 10 m, so the lattice only changes when that step changes)
    const hAbove = Math.max(300, Math.abs(R.camera.eye[1] - (o.base + o.thick * .5)));
    const sp0 = 10 * Math.pow(2, Math.max(0, Math.round(Math.log2(hAbove * 2.4 / CN / 10))));
    for (let l = 0; l < CLV.length; l++) {
      const sp = sp0 * Math.pow(2, l), inner = l ? sp * .5 * CN / 2 : 0;
      CLV[l] = sp;
      gl.uniform4f(u.uLv, sp, CN, inner, l);
      gl.drawArrays(gl.POINTS, 0, CN * CN);
    }
  }
  return { ok, lattice, drawClutter, drawCeiling, begin, end, lats, get pK() { return pK; }, get pC() { return pC; }, CLV, CN };
}
