/* Voxel ships (prototype): the picture. Every cell of the lattice is a dot in the films' Point Cloud look (the model
   shading of engine/models.js: low moon, a fill fixed to the view, facing, back faces thinned), filled close up with a
   stratified sub-lattice on its own plate (sub-dots: the dots never pack closer than `spacing` px), and splatted into
   the depth buffer so the gaps between them hide what is behind (the far side, the interior, the sea).

   The cells' places and normals are two float textures (the lattice's own order: index i at texel (i & 1023, i >> 10)),
   rest state at first; the hit's run of cells is rewritten each frame from the solver's frames (vox/index.js), so a
   frame uploads only that run.

   createVoxRender(R) -> { add(key, built) -> cloud, draw list (R.extra hook): depth(), color() }
   cloud: { key, n, setPose(R3x3 row-major, T world), upload(i0, i1, pos4, nrm4), reset(), visible } */
import { HEAD, FRAME, COMMON, CULL } from '../engine/shaders.js';
import { FS_DEPTH } from '../engine/models.js';
import { program } from '../engine/gl.js';

const TW = 1024;
const SUB = `
vec2 subAt(int r) {
  int x = 0, y = 0;
  for (int k = 0; k < 4; k++) { int d = (r >> (2 * k)) & 3; x |= ((d == 1 || d == 2) ? 1 : 0) << (3 - k); y |= (d & 1) << (3 - k); }
  return (vec2(float((x + 8) & 15), float((y + 8) & 15)) + 0.5) / 16.0 - 0.5;
}
/* a cell's footprint on its plate: the two model axes across its dominant axis, each leaning along that axis to stay
   on the plate (n: model frame), so neighbouring cells tile the plate without seams */
void tile(vec3 n, out vec3 U, out vec3 V) {
  vec3 a = abs(n);
  if (a.x >= a.y && a.x >= a.z) { U = vec3(-n.y / n.x, 1.0, 0.0); V = vec3(-n.z / n.x, 0.0, 1.0); }
  else if (a.y >= a.z) { U = vec3(1.0, -n.x / n.y, 0.0); V = vec3(0.0, -n.z / n.y, 1.0); }
  else { U = vec3(1.0, 0.0, -n.x / n.z); V = vec3(0.0, 1.0, -n.y / n.z); }
}
void basis(vec3 n, out vec3 U, out vec3 V) {
  if (n.z < -0.9999999) { U = vec3(0.0, -1.0, 0.0); V = vec3(-1.0, 0.0, 0.0); return; }
  float a = 1.0 / (1.0 + n.z), b = -n.x * n.y * a;
  U = vec3(1.0 - n.x * n.x * a, b, -n.x); V = vec3(b, 1.0 - n.y * n.y * a, -n.y);
}
`;
const HEADV = HEAD + FRAME + COMMON + `
layout(location = 0) in uvec4 aInfo;     // interior, material, two-sided, part
uniform highp sampler2D uPos;            // xyz model frame, w flags (1 torn edge, 2 loose, 4 fragment, 8 pocked, 16 in the sea)
uniform highp sampler2D uNrm;            // xyz normal (model), w heat * 256 + soot (0..255 each)
uniform highp sampler2D uRest;           // xyz the cell where it was built, w its normal packed (the deformation view)
uniform mat3 uR;                         // model -> world
uniform vec3 uT;                         // model origin, relative to the eye
uniform vec4 uV;                         // x cell (m), y least sub-dot spacing (px @1080), z largest dot (px), w most sub-dots a cell
` + SUB;

const VS_COLOR = HEADV + `
uniform vec4 uFill;                      // the view's fill light (as models.js)
uniform vec4 uL;                         // x time (s), y brightness, z interior brightness, w neutral (1) / tint
out vec3 vCol;
void main() {
  int id = gl_VertexID, inst = gl_InstanceID;
  ivec2 tc = ivec2(id & ${TW - 1}, id >> 10);
  vec4 P = texelFetch(uPos, tc, 0), N = texelFetch(uNrm, tc, 0);
  int fl = int(P.w + 0.5);
  vec3 p = uR * P.xyz + uT;
  vec3 n = uR * N.xyz;
  bool two = aInfo.z > 0u || dot(N.xyz, N.xyz) < 0.01;
  float heat = floor(N.w / 256.0) / 255.0, sb = mod(N.w, 256.0), soot = mod(sb, 128.0) / 127.0;
  bool sootFront = sb >= 128.0;
  uint hid = hash1(uint(id) * 747796405u + uint(inst) * 2654435761u + 2891336453u);
  float hr = u01(hid);
  float cw = dot(uCamF.xyz, p);
  if (cw < uCam.w) { ${CULL} return; }
  float k = uCam.x / cw, pxs = uV.x * k;
  float need = min((pxs / uV.y) * (pxs / uV.y), uV.w);
  float dist = length(p);
  vec3 v = p / max(dist, 1e-4);
  if (two) n = -v;
  n = normalize(n);
  float dn = dot(n, v);
  bool loose = (fl & 6) != 0;
  if (inst > 0) {
    if (float(inst) >= need) { ${CULL} return; }
    if (!two && dn > 0.0 && !loose) { ${CULL} return; }
    vec3 U, V;
    if (two) basis(n, U, V); else { tile(normalize(N.xyz), U, V); U = uR * U; V = uR * V; }
    // (the sub-lattice shifted by its own amount in each cell, wrapped in the cell: neighbouring cells' patterns never
    // line up into one lattice across the hull, which beats with the pixels into rings)
    vec2 sh = vec2(u01(hash1(uint(id) * 3266489917u + 11u)), u01(hash1(uint(id) * 668265263u + 5u)));
    vec2 o = fract(subAt(inst) + 0.5 + sh) - 0.5 + (vec2(u01(hash1(hid ^ 0x9e3779b9u)), u01(hash1(hid ^ 0x7f4a7c15u))) - 0.5) * 0.35 * exp2(-floor(log2(float(inst)) * 0.5) - 1.0);
    p += (U * o.x + V * o.y) * uV.x;
  } else {
    // (the cell's own dot jittered on its plate: the lattice's rows never print)
    vec3 U, V;
    if (two) basis(n, U, V); else { tile(normalize(N.xyz), U, V); U = uR * U; V = uR * V; }
    vec2 j = vec2(u01(hash1(uint(id) * 2654435761u + 7u)), u01(hash1(uint(id) * 2246822519u + 3u))) - 0.5;
    p += (U * j.x + V * j.y) * uV.x * 0.7;
    // far off: the dots thinned to the spacing (by their facing), never under a floor (a far ship stays a silhouette)
    float keep = max(need * max(abs(dn), 0.3), 0.06);
    if (keep < 1.0 && hr > keep) { ${CULL} return; }
  }
  float b, lit = 0.45, rim = 0.0;
  if (two) b = 0.45;
  else if (dn > 0.0 && !loose) {
    if ((hid % 3u) != 0u) { ${CULL} return; }
    b = 0.09; lit = 0.1;
  } else {
    float fac = min(1.0, abs(dn)), lam = max(dot(n, uSun.xyz), uFill.w * dot(n, uFill.xyz)), w = 1.0 - fac;
    b = 0.06 + 0.74 * max(lam, 0.0) + 0.14 * fac + 0.34 * w * w * w;
    b *= 0.55 + 0.45 * b;
    lit = b;
    rim = fac < 0.18 ? 1.0 - fac / 0.18 : 0.0;
  }
  if (aInfo.x > 0u) b *= uL.z;
  b *= mix(1.0, 0.55, clamp(cw / uMisc.w, 0.0, 1.0)) * uL.y * uMisc.z;
  vec3 pw = p + uEyeW.xyz;
  // the outside of the hull under the sea is not seen from above it (the sea is opaque); what is inside is (through a hole)
  if (pw.y < -0.25 && uEyeW.y > 0.0 && aInfo.x == 0u && (fl & 6) == 0) { ${CULL} return; }
  if (pw.y < 0.0 || (fl & 16) != 0) b *= 0.35;
  vec3 col = WH;
  // soot on the face the fire was on (the inside of a space the charge filled is not the outside of its plating)
  bool seenFront = two || dn <= 0.0;
  if (soot > 0.0 && (loose || two || seenFront == sootFront)) { col = mix(col, vec3(0.62, 0.6, 0.56), soot); b *= 1.0 - 0.6 * soot * (0.7 + 0.3 * hr); }
  // fragment pocks: specks, not whole cells
  if ((fl & 8) != 0 && hr < 0.12) b *= 0.25;
  // a torn edge: the bare steel of the tear, a light speckled line (the hole reads from afar), hot while fresh
  if ((fl & 1) != 0 && hr < 0.45) { b = max(b, 0.6 * (0.8 + 0.4 * hr)); col = mix(col, vec3(0.86, 0.84, 0.8), 0.6); }
  vec3 rgb = col * b;
  if (heat > 0.01 && ((fl & 4) != 0 || hr < 0.5)) rgb = max(rgb, vec3(1.0, 0.72, 0.45) * heat * (0.75 + 0.25 * sin(uL.x * 11.0 + hr * 40.0)));
  rgb += lightsAt(p, two ? vec3(0.0) : n) * (0.35 + 0.65 * lit);
  // the deformation view: coloured by how far the cell moved from where it was built (loose: coral, as gone)
  if (uL.w > 0.5) {
    vec4 Rr = texelFetch(uRest, tc, 0);
    float pk = Rr.w; vec3 n0 = vec3(mod(pk, 256.0), mod(floor(pk / 256.0), 256.0), floor(pk / 65536.0)) / 127.5 - 1.0;
    rgb = loose ? CORAL * (0.6 + 0.4 * hr) : defoCol(uR * (P.xyz - Rr.xyz), uR * n0, rgb, b);
  }
  vCol = min(rgb, vec3(1.0));
  vec3 pc = p; pc.y -= curveDrop(pc);
  gl_Position = toClip(pc);
  float pe = pxs / sqrt(max(need, 1.0));
  gl_PointSize = dotPx(min(max(pe, uV.y), uV.z) * (loose ? 1.15 : 1.0));
}
`;
const FS_COLOR = HEAD + `
in vec3 vCol; out vec4 o;
void main() { o = vec4(vCol, 1.0); }
`;
/* the occlusion splat: a front-facing cell's square on its plate, depth only (engine/models.js FS_DEPTH) */
const VS_DEPTH = HEADV + `
uniform vec4 uVp;                        // xy half the viewport (px), z largest splat (px), w least splat (px)
out vec4 vAx;
out float vSz;
void main() {
  int id = gl_VertexID;
  ivec2 tc = ivec2(id & ${TW - 1}, id >> 10);
  vec4 P = texelFetch(uPos, tc, 0), N = texelFetch(uNrm, tc, 0);
  int fl = int(P.w + 0.5);
  if (aInfo.z > 0u || dot(N.xyz, N.xyz) < 0.01 || (fl & 7) != 0) { ${CULL} return; }
  vec3 p = uR * P.xyz + uT, n = normalize(uR * N.xyz);
  float dist = length(p); vec3 v = p / max(dist, 1e-4);
  float dn = dot(n, v); if (dn > -0.02) { ${CULL} return; }
  float fac = -dn;
  vec3 U, V; tile(normalize(N.xyz), U, V); U = uR * U; V = uR * V;
  float s = uV.x;
  vec3 pc = p; pc.y -= curveDrop(pc);
  vec4 c = uVP * vec4(pc, 1.0);
  if (c.w < uCam.w * 1.5) { ${CULL} return; }
  vec4 du = uVP * vec4(U * s, 0.0), dw = uVP * vec4(V * s, 0.0);
  float iw = 1.0 / (c.w * c.w);
  vec2 a = (du.xy * c.w - c.xy * du.w) * iw * uVp.xy, b = (dw.xy * c.w - c.xy * dw.w) * iw * uVp.xy;
  float sz = max(abs(a.x) + abs(b.x), abs(a.y) + abs(b.y));
  if (sz < uVp.w) { ${CULL} return; }
  if (sz > 2.5) sz += 0.5;
  vAx = vec4(a, b); vSz = sz;
  float bias = (0.25 + 0.55 * sqrt(max(0.0, 1.0 - fac * fac)) / max(fac, 0.25)) * s;
  p *= 1.0 + bias / dist;
  p.y -= curveDrop(p);
  gl_Position = toClip(p);
  gl_PointSize = min(sz, uVp.z);
}
`;

export function createVoxRender(R) {
  const gl = R.gl, G = R.G;
  let pC = null, pD = null;
  const clouds = new Map();
  const ensure = () => {
    if (pC) return;
    pC = program(gl, VS_COLOR, FS_COLOR, 'vox color');
    pD = program(gl, VS_DEPTH, FS_DEPTH, 'vox depth');
  };
  function tex(w, h, data) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }
  function add(key, B) {
    ensure();
    const n = B.n, th = Math.ceil(n / TW);
    const pos = new Float32Array(TW * th * 4), nrm = new Float32Array(TW * th * 4);
    for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) { pos[4 * i + k] = B.P[3 * i + k]; nrm[4 * i + k] = B.N[3 * i + k] / 127; } }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, B.info, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribIPointer(0, 4, gl.UNSIGNED_BYTE, 4, 0);
    gl.bindVertexArray(null);
    // (the rest texture: where each cell was built, its normal packed in w (8 bits an axis))
    const rest = new Float32Array(TW * th * 4);
    for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) rest[4 * i + k] = B.P[3 * i + k]; const q = k => Math.round((B.N[3 * i + k] / 127 + 1) * 127.5); rest[4 * i + 3] = q(0) + 256 * q(1) + 65536 * q(2); }
    const C = { key, n, th, S: B.S, rest: { pos: pos.slice(), nrm: nrm.slice() }, pos, nrm, tP: tex(TW, th, pos), tN: tex(TW, th, nrm), tR: tex(TW, th, rest), vao, vb, R: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: [0, 0, 0], visible: false,
      bright: 1, interior: .55, dirty: null, radius: Math.hypot(...B.dim) * B.S * .5, center: [0, 0, 0] };
    // (the centre of the cloud, for the cull)
    { let c = [0, 0, 0]; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += B.P[3 * i + k]; C.center = c.map(v => v / Math.max(1, n)); }
    C.setPose = (Rm, T) => { C.R = Rm; C.T = T; };
    /* rows [r0, r1) of the staging arrays to the textures (the caller wrote pos / nrm there) */
    C.upload = (i0, i1) => {
      const r0 = Math.max(0, Math.floor(i0 / TW)), r1 = Math.min(th, Math.ceil(i1 / TW)); if (r1 <= r0) return;
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.bindTexture(gl.TEXTURE_2D, C.tP); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r0, TW, r1 - r0, gl.RGBA, gl.FLOAT, C.pos, r0 * TW * 4);
      gl.bindTexture(gl.TEXTURE_2D, C.tN); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r0, TW, r1 - r0, gl.RGBA, gl.FLOAT, C.nrm, r0 * TW * 4);
    };
    C.reset = () => { C.pos.set(C.rest.pos); C.nrm.set(C.rest.nrm); C.upload(0, n); };
    clouds.set(key, C);
    return C;
  }
  function uniforms(P, C, cam) {
    const u = P.u, R0 = C.R, m = [R0[0], R0[3], R0[6], R0[1], R0[4], R0[7], R0[2], R0[5], R0[8]];
    gl.uniformMatrix3fv(u.uR, false, m);
    gl.uniform3f(u.uT, C.T[0] - cam.eye[0], C.T[1] - cam.eye[1], C.T[2] - cam.eye[2]);
    const H = G.H / 1080;
    gl.uniform4f(u.uV, C.S, R.models.dotSpacing || 1.8, R.models.dotCap || 7.4, C.maxSub || 64);
    gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_2D, C.tP); gl.uniform1i(u.uPos, 12);
    gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D, C.tN); gl.uniform1i(u.uNrm, 13);
    if (u.uRest) { gl.activeTexture(gl.TEXTURE14); gl.bindTexture(gl.TEXTURE_2D, C.tR); gl.uniform1i(u.uRest, 14); }
    gl.activeTexture(gl.TEXTURE0);
    return H;
  }
  const visible = (C, cam) => {
    if (!C.visible) return false;
    const c = C.center, R0 = C.R, w = [C.T[0] + R0[0] * c[0] + R0[1] * c[1] + R0[2] * c[2] - cam.eye[0], C.T[1] + R0[3] * c[0] + R0[4] * c[1] + R0[5] * c[2] - cam.eye[1], C.T[2] + R0[6] * c[0] + R0[7] * c[1] + R0[8] * c[2] - cam.eye[2]];
    return !R.frameInfo || R.frameInfo.sphereVisible(w, C.radius + 80);
  };
  /* how many sub-dots the nearest cells need (the instanced draw's count) */
  function subCount(C, cam) {
    const R0 = C.R, c = C.center;
    const w = [C.T[0] + R0[0] * c[0] + R0[1] * c[1] + R0[2] * c[2] - cam.eye[0], C.T[1] + R0[3] * c[0] + R0[4] * c[1] + R0[5] * c[2] - cam.eye[1], C.T[2] + R0[6] * c[0] + R0[7] * c[1] + R0[8] * c[2] - cam.eye[2]];
    const d = Math.max(1, Math.hypot(w[0], w[1], w[2]) - C.radius), fl = 540 / Math.tan(cam.fov / 2), px = C.S * fl / d, sp = R.models.dotSpacing || 1.8;
    return Math.max(1, Math.min(C.maxSub || 64, Math.ceil((px / sp) ** 2)));
  }
  const pass = {
    depth() {
      if (!clouds.size) return;
      const cam = R.camera;
      gl.useProgram(pD.p);
      gl.uniform4f(pD.u.uVp, G.W / 2, G.H / 2, Math.min(G.pointMax || 256, 511), .9 * G.H / 1080);
      for (const C of clouds.values()) {
        if (!visible(C, cam)) continue;
        uniforms(pD, C, cam);
        gl.bindVertexArray(C.vao); gl.drawArrays(gl.POINTS, 0, C.n);
      }
      gl.bindVertexArray(null);
    },
    color() {
      if (!clouds.size) return;
      const cam = R.camera, M = R.models;
      gl.useProgram(pC.p);
      { const f = cam.f, az = Math.atan2(f[0], f[2]) + (M.fillAz || Math.PI - .6), el = M.fillEl || .44, ce = Math.cos(el); gl.uniform4f(pC.u.uFill, ce * Math.sin(az), Math.sin(el), ce * Math.cos(az), M.fill === undefined ? .6 : M.fill); }
      let pts = 0;
      for (const C of clouds.values()) {
        if (!visible(C, cam)) continue;
        uniforms(pC, C, cam);
        gl.uniform4f(pC.u.uL, R.t || 0, C.bright, C.interior, R.models.defo ? 1 : 0);
        const k = subCount(C, cam);
        gl.bindVertexArray(C.vao); gl.drawArraysInstanced(gl.POINTS, 0, C.n, k);
        pts += C.n; C.lastSub = k;
      }
      gl.bindVertexArray(null);
      pass.stats = { pts };
    },
  };
  if (!R.extra) R.extra = [];
  R.extra.push(pass);
  return {
    add, clouds, pass,
    drop(key) { const C = clouds.get(key); if (!C) return; gl.deleteTexture(C.tP); gl.deleteTexture(C.tN); gl.deleteTexture(C.tR); gl.deleteBuffer(C.vb); gl.deleteVertexArray(C.vao); clouds.delete(key); },
    dispose() { for (const k of [...clouds.keys()]) this.drop(k); const i = R.extra.indexOf(pass); if (i >= 0) R.extra.splice(i, 1); },
  };
}
