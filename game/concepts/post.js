/* Screen-space passes for the visibility concepts (A: outline, B: contrast grading). The game's renderer draws the
   frame into our framebuffer S (it binds none of its own), then:
   - a unit mask M: the unit instances drawn again with the game's model shader, patched (a copy of the source string,
     changed here, never in game/src) to write a flat side code instead of their shading: red hostile, green own.
     M shares S's depth buffer, so what the hills and the sea surface hide stays hidden; units too small to resolve
     (the renderer's specks) get a dot of their own.
   - A: a square max-dilation of M at two radii (separable); the ring between them is the outline (lime / coral).
   - B: M reduced to a quarter, a soft separable "max with falloff" (a halo round every unit, ~40 px at 1080p), then
     the world outside the units dimmed under it; unit pixels pass through untouched.
   Everything reuses the engine's shader text (engine/models.js VS, engine/shaders.js) read-only. */
import { VS as MODEL_VS } from '../src/engine/models.js';
import { HEAD, FRAME, COMMON, FS_POINT } from '../src/engine/shaders.js';
import { program } from '../src/engine/gl.js';

const VS_FULL = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }
`;

/* A: the outline. Pass 1 (horizontal): max of M's own / hostile over r1 and r2 */
const FS_DIL_H = `#version 300 es
precision highp float;
uniform sampler2D uM; uniform int uR1; uniform int uR2;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), sz = textureSize(uM, 0);
  vec2 a = vec2(0.0), b = vec2(0.0);
  for (int k = -12; k <= 12; k++) {
    if (k < -uR2 || k > uR2) continue;
    int x = p.x + k; if (x < 0 || x >= sz.x) continue;
    vec2 m = texelFetch(uM, ivec2(x, p.y), 0).rg;
    b = max(b, m);
    if (k >= -uR1 && k <= uR1) a = max(a, m);
  }
  o = vec4(a, b);
}
`;
/* A: pass 2 (vertical) + composite: the ring between the two dilations, over the scene */
const FS_OUTLINE = `#version 300 es
precision highp float;
uniform sampler2D uS; uniform sampler2D uT; uniform sampler2D uM;
uniform int uR1; uniform int uR2; uniform vec4 uLine;   // x: alpha, y: fill inside (between the dots), z: fill alpha
out vec4 o;
const vec3 LIME = vec3(0.776, 0.957, 0.196), CORAL = vec3(1.0, 0.416, 0.239);
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), sz = textureSize(uT, 0);
  vec2 a = vec2(0.0), b = vec2(0.0);
  for (int k = -12; k <= 12; k++) {
    if (k < -uR2 || k > uR2) continue;
    int y = p.y + k; if (y < 0 || y >= sz.y) continue;
    vec4 t = texelFetch(uT, ivec2(p.x, y), 0);
    b = max(b, t.ba);
    if (k >= -uR1 && k <= uR1) a = max(a, t.rg);
  }
  a = step(vec2(0.25), a); b = step(vec2(0.25), b);     // real dots are 1, the small units' blocks 0.5
  vec3 s = texelFetch(uS, p, 0).rgb;
  vec2 ring = clamp(b - max(a, vec2(max(a.r, a.g))), 0.0, 1.0);
  vec3 col = s;
  if (ring.r > 0.5) col = mix(s, CORAL, uLine.x);
  else if (ring.g > 0.5) col = mix(s, LIME, uLine.x);
  o = vec4(col, 1.0);
}
`;
/* B: quarter-res coverage (max over the 4 x 4 block) */
const FS_DOWN = `#version 300 es
precision highp float;
uniform sampler2D uM;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 4, sz = textureSize(uM, 0);
  float v = 0.0;
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    ivec2 q = min(p + ivec2(i, j), sz - 1);
    vec2 m = texelFetch(uM, q, 0).rg; v = max(v, step(0.25, max(m.r, m.g)));
  }
  o = vec4(v, 0.0, 0.0, 1.0);
}
`;
/* B: soft dilation, separable: max over k of v(x + k) * w(k), w flat to uCore then falling to 0 at uRad */
const FS_SOFT = `#version 300 es
precision highp float;
uniform sampler2D uQ; uniform ivec2 uDir; uniform int uRad; uniform float uCore;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), sz = textureSize(uQ, 0);
  float v = 0.0;
  for (int k = -24; k <= 24; k++) {
    if (k < -uRad || k > uRad) continue;
    ivec2 q = p + uDir * k;
    if (q.x < 0 || q.y < 0 || q.x >= sz.x || q.y >= sz.y) continue;
    float w = 1.0 - smoothstep(uCore, float(uRad) + 0.5, abs(float(k)));
    v = max(v, texelFetch(uQ, q, 0).r * w);
  }
  o = vec4(v, 0.0, 0.0, 1.0);
}
`;
/* B: the grade: the world dims under the halo (and a touch everywhere), unit pixels pass through */
const FS_GRADE = `#version 300 es
precision highp float;
uniform sampler2D uS; uniform sampler2D uM; uniform sampler2D uH;
uniform vec4 uG;          // x: dimming under the halo, y: dimming everywhere (world), z: unit lift, w: desaturation
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 s = texelFetch(uS, p, 0).rgb;
  vec2 m = texelFetch(uM, p, 0).rg;
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uS, 0));
  float h = texture(uH, uv).r;
  h = h * h * (3.0 - 2.0 * h);
  vec3 col;
  if (max(m.r, m.g) > 0.75) col = min(vec3(1.0), s * uG.z);     // a unit's own returns (not the small units' blocks)
  else {
    float l = dot(s, vec3(0.3, 0.55, 0.15));
    vec3 w = mix(s, vec3(l), uG.w * h);
    col = w * (1.0 - uG.y) * (1.0 - uG.x * h);
  }
  o = vec4(col, 1.0);
}
`;
const FS_BLIT = `#version 300 es
precision highp float;
uniform sampler2D uS;
out vec4 o;
void main() { o = vec4(texelFetch(uS, ivec2(gl_FragCoord.xy), 0).rgb, 1.0); }
`;
/* a speck (a unit under a pixel): one square dot at a world point, depth-tested like the film dots */
const VS_SPECK = HEAD + FRAME + COMMON + `
uniform vec3 uP; uniform float uSize; uniform vec3 uC;
out vec3 vCol;
void main() {
  vec3 p = uP; p.y -= curveDrop(p);
  gl_Position = toClip(p);
  gl_PointSize = uSize;
  vCol = uC;
}
`;

/* a batch of world points into the mask (B: the skimmers' trails count as the unit, never dimmed) */
const VS_PTS = HEAD + FRAME + COMMON + `
layout(location = 0) in vec3 aP;
uniform float uSize; uniform vec3 uC;
out vec3 vCol;
void main() { vec3 p = aP; p.y -= curveDrop(p); gl_Position = toClip(p); gl_PointSize = uSize; vCol = uC; }
`;

function patch(src, from, to, what) {
  if (!src.includes(from)) { console.warn('concepts/post: model shader changed, patch skipped:', what); return src; }
  return src.replace(from, to);
}

export class Post {
  constructor(R) {
    this.R = R; const gl = this.gl = R.gl;
    // the model shader, patched: the mask (flat side code), and A's heavier dots (never under 2 px, a brightness floor
    // on the faces the lens sees, so a fin seen edge-on or in the moon's shadow keeps its returns)
    let vsMask = patch(MODEL_VS, 'vCol = min(rgb, vec3(1.0));', 'vCol = uTint.rgb;', 'mask colour');
    this.pMask = program(gl, vsMask, FS_POINT, 'vis-mask');
    // (the size line is matched loosely: the engine's own size rule inside it may change)
    const mSize = /gl_PointSize = (dotPx\(.*\));/.exec(MODEL_VS);
    let vsThick = mSize ? MODEL_VS.replace(mSize[0], 'float thk = smoothstep(0.75, 0.95, uDen.z); gl_PointSize = max(' + mSize[1] + ', floor(mix(1.0, uThick.x, thk) * uCam.y + 0.5));')
      : (console.warn('concepts/post: model shader changed, patch skipped: dot size'), MODEL_VS);
    vsThick = patch(vsThick, 'vCol = min(rgb, vec3(1.0));', 'float thk2 = smoothstep(0.75, 0.95, uDen.z); rgb = max(rgb, col * uP.x * mix(uThick.w, uThick.y, thk2)); vCol = min(rgb * mix(1.0, uThick.z, thk2), vec3(1.0));', 'brightness floor');
    vsThick = patch(vsThick, 'out vec3 vCol;', 'out vec3 vCol;\nuniform vec4 uThick;', 'uniform');
    this.pThick = program(gl, vsThick, FS_POINT, 'vis-thick');
    this.thick = [2, .5, 1.12, .3];     // min dot px (small parts), their brightness floor, their lift, the floor on every unit dot
    this.pDilH = program(gl, VS_FULL, FS_DIL_H, 'vis-dilh');
    this.pOutline = program(gl, VS_FULL, FS_OUTLINE, 'vis-outline');
    this.pDown = program(gl, VS_FULL, FS_DOWN, 'vis-down');
    this.pSoft = program(gl, VS_FULL, FS_SOFT, 'vis-soft');
    this.pGrade = program(gl, VS_FULL, FS_GRADE, 'vis-grade');
    this.pBlit = program(gl, VS_FULL, FS_BLIT, 'vis-blit');
    this.pSpeck = program(gl, VS_SPECK, FS_POINT, 'vis-speck');
    this.pPts = program(gl, VS_PTS, FS_POINT, 'vis-pts');
    this.ptsBuf = gl.createBuffer(); this.ptsVao = gl.createVertexArray(); this.ptsF = new Float32Array(3 * 2048);
    gl.bindVertexArray(this.ptsVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.ptsBuf); gl.bufferData(gl.ARRAY_BUFFER, this.ptsF.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    this.W = 0; this.H = 0;
    // knobs
    this.A = { r1: 2, w: 1, a: .95 };
    this.B = { rad: 11, core: 2.5, dim: .72, all: .12, lift: 1.0, desat: .6 };
  }
  _tex(w, h, linear) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  _fbo(tex, depth) {
    const gl = this.gl, f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (depth) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return f;
  }
  ensure() {
    const gl = this.gl, G = this.R.G, W = G.W, H = G.H;
    if (W === this.W && H === this.H) return;
    for (const t of [this.tS, this.tM, this.tT, this.tQ0, this.tQ1, this.tQ2]) if (t) gl.deleteTexture(t);
    for (const f of [this.fS, this.fM, this.fT, this.fQ0, this.fQ1, this.fQ2]) if (f) gl.deleteFramebuffer(f);
    if (this.rbD) gl.deleteRenderbuffer(this.rbD);
    this.W = W; this.H = H;
    this.rbD = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.rbD);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
    this.tS = this._tex(W, H); this.fS = this._fbo(this.tS, this.rbD);
    this.tM = this._tex(W, H); this.fM = this._fbo(this.tM, this.rbD);
    this.tT = this._tex(W, H); this.fT = this._fbo(this.tT);
    const qw = Math.ceil(W / 4), qh = Math.ceil(H / 4); this.qw = qw; this.qh = qh;
    this.tQ0 = this._tex(qw, qh); this.fQ0 = this._fbo(this.tQ0);
    this.tQ1 = this._tex(qw, qh); this.fQ1 = this._fbo(this.tQ1);
    this.tQ2 = this._tex(qw, qh, true); this.fQ2 = this._fbo(this.tQ2);
  }
  /* before R.end(): the frame goes into S */
  begin() { this.ensure(); this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fS); }
  /* A's heavier unit dots: the game's model program swapped for the patched one while the frame renders */
  thickOn() { const M = this.R.models; this._P = M.P; M.P = this.pThick; const gl = this.gl; gl.useProgram(this.pThick.p); gl.uniform4fv(this.pThick.u.uThick, this.thick); }
  thickOff() { if (this._P) { this.R.models.P = this._P; this._P = null; } }

  /* after R.end(): the unit mask (list: the unit instances drawn this frame; own / hostile from d.side) */
  mask(list) {
    const gl = this.gl, R = this.R, M = R.models, cam = R.camera;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fM);
    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, R.ubo);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    const P0 = M.P; M.P = this.pMask;
    const specks = [];
    for (const d of list) {
      if (!d.live || (d.alpha !== undefined && d.alpha < .05)) continue;
      const r = d._rgb, k = d._k, f = d._face;
      d._rgb = d.side === 'hostile' ? RED : GREEN; d._k = 1; d._face = 1;
      M.draw(d, cam, R.frameInfo);
      d._rgb = r; d._k = k; d._face = f;
      if (d.speck) specks.push(d);
    }
    M.P = P0;
    // units small on screen (a speck, a round a few px long) also get a block of minPx round their centre: A's outline
    // then never shrinks under a findable square, B's halo never under its full size
    const q = this._q || (this._q = [0, 0, 0]), sc = this.H / 1080, minPx = (this.minPx || 5) * sc, kpx = this.H / cam.H;
    for (const d of list) {
      if (!d.live || (d.alpha !== undefined && d.alpha < .05) || specks.includes(d)) continue;
      if (!cam.project(d.T, q)) continue;
      if (M.get(d.key).radius * cam.fl / q[2] * kpx < minPx) specks.push(d);
    }
    if (specks.length) {
      const P = this.pSpeck, e = cam.eye; gl.useProgram(P.p);
      gl.uniform1f(P.u.uSize, Math.max(2, Math.round(2 * minPx)));
      gl.bindVertexArray(null);
      for (const d of specks) {
        const c = d.side === 'hostile' ? RED : GREEN;
        gl.uniform3f(P.u.uP, d.T[0] - e[0], d.T[1] - e[1], d.T[2] - e[2]); gl.uniform3f(P.u.uC, c[0] * .5, c[1] * .5, c[2] * .5);
        gl.drawArrays(gl.POINTS, 0, 1);
      }
      // a unit under a pixel: its one return (the renderer's speck) counts as the unit itself
      gl.uniform1f(P.u.uSize, Math.max(2, Math.round(2 * sc)));
      for (const d of specks) {
        if (!d.speck) continue;
        const c = d.side === 'hostile' ? RED : GREEN;
        gl.uniform3f(P.u.uP, d.T[0] - e[0], d.T[1] - e[1], d.T[2] - e[2]); gl.uniform3f(P.u.uC, c[0], c[1], c[2]);
        gl.drawArrays(gl.POINTS, 0, 1);
      }
    }
    gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST);
    this.specks = specks;
  }
  /* world points [x, y, z, ...] (n of them) into the mask, as a side's unit (call right after mask()) */
  maskPoints(P, n, side, size) {
    if (!n) return;
    const gl = this.gl, R = this.R, e = R.camera.eye, F = this.ptsF; n = Math.min(n, 2048);
    for (let i = 0; i < n; i++) { F[i * 3] = P[i * 3] - e[0]; F[i * 3 + 1] = P[i * 3 + 1] - e[1]; F[i * 3 + 2] = P[i * 3 + 2] - e[2]; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fM); gl.viewport(0, 0, this.W, this.H);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, R.ubo);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    const Pp = this.pPts, c = side === 'hostile' ? RED : GREEN; gl.useProgram(Pp.p);
    gl.uniform1f(Pp.u.uSize, Math.max(1, Math.round((size || 2) * this.H / 1080))); gl.uniform3f(Pp.u.uC, c[0], c[1], c[2]);
    gl.bindVertexArray(this.ptsVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.ptsBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, F, 0, n * 3);
    gl.drawArrays(gl.POINTS, 0, n); gl.bindVertexArray(null);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST);
  }
  /* A's specks drawn into S a little larger (the renderer gives them one 1 px return) */
  thickSpecks(list) {
    const gl = this.gl, R = this.R, cam = R.camera, e = cam.eye, P = this.pSpeck;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fS);
    gl.viewport(0, 0, this.W, this.H);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, R.ubo);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P.p); gl.bindVertexArray(null);
    gl.uniform1f(P.u.uSize, Math.max(2, Math.round(2 * this.H / 1080)));
    for (const d of list) {
      if (!d.live || !d.speck) continue;
      const c = d.side === 'hostile' ? [1, .62, .5] : [.9, 1, .75];
      gl.uniform3f(P.u.uP, d.T[0] - e[0], d.T[1] - e[1], d.T[2] - e[2]); gl.uniform3f(P.u.uC, c[0], c[1], c[2]);
      gl.drawArrays(gl.POINTS, 0, 1);
    }
    gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST);
  }
  _full(P, fbo, w, h) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, w, h);
    gl.useProgram(P.p); gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(false);
  }
  _bind(P, name, unit, tex) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(P.u[name], unit); }
  /* A: outline composite to the screen */
  outline() {
    const gl = this.gl, sc = this.H / 1080, r1 = Math.max(1, Math.round(this.A.r1 * sc)), r2 = r1 + Math.max(1, Math.round(this.A.w * sc));
    let P = this.pDilH; this._full(P, this.fT, this.W, this.H);
    this._bind(P, 'uM', 0, this.tM); gl.uniform1i(P.u.uR1, r1); gl.uniform1i(P.u.uR2, r2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    P = this.pOutline; this._full(P, null, this.W, this.H);
    this._bind(P, 'uS', 0, this.tS); this._bind(P, 'uT', 1, this.tT); this._bind(P, 'uM', 2, this.tM);
    gl.uniform1i(P.u.uR1, r1); gl.uniform1i(P.u.uR2, r2); gl.uniform4f(P.u.uLine, this.A.a, 0, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this._done();
  }
  /* B: grade composite to the screen */
  grade() {
    const gl = this.gl, B = this.B, sc = this.H / 1080, rad = Math.min(24, Math.max(3, Math.round(B.rad * sc)));
    let P = this.pDown; this._full(P, this.fQ0, this.qw, this.qh); this._bind(P, 'uM', 0, this.tM); gl.drawArrays(gl.TRIANGLES, 0, 3);
    P = this.pSoft; this._full(P, this.fQ1, this.qw, this.qh); this._bind(P, 'uQ', 0, this.tQ0);
    gl.uniform2i(P.u.uDir, 1, 0); gl.uniform1i(P.u.uRad, rad); gl.uniform1f(P.u.uCore, B.core * sc); gl.drawArrays(gl.TRIANGLES, 0, 3);
    this._full(P, this.fQ2, this.qw, this.qh); this._bind(P, 'uQ', 0, this.tQ1);
    gl.uniform2i(P.u.uDir, 0, 1); gl.uniform1i(P.u.uRad, rad); gl.uniform1f(P.u.uCore, B.core * sc); gl.drawArrays(gl.TRIANGLES, 0, 3);
    P = this.pGrade; this._full(P, null, this.W, this.H);
    this._bind(P, 'uS', 0, this.tS); this._bind(P, 'uM', 1, this.tM); this._bind(P, 'uH', 2, this.tQ2);
    gl.uniform4f(P.u.uG, B.dim, B.all, B.lift, B.desat);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this._done();
  }
  blit() {
    const P = this.pBlit; this._full(P, null, this.W, this.H); this._bind(P, 'uS', 0, this.tS);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3); this._done();
  }
  _done() { const gl = this.gl; for (let i = 2; i >= 0; i--) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, null); } gl.depthMask(true); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
}
const RED = [1, 0, 0], GREEN = [0, 1, 0];
