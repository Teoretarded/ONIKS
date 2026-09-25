/* GPU hairlines: the Orbital films' wireframe (reference/menus/common/wire.js) drawn by the GPU.
   Every segment is an instanced screen-space quad, 1 px at 1080p (scaled with the canvas), antialiased across its
   width by a coverage ramp, near-clipped in the vertex shader, depth-faded (fog) and optionally near-faded (lines
   brushing the lens). Blending is MAX (like the films' dots): joints never bead, crossings never burn, order does
   not matter; colours are premultiplied by alpha, so a faint line is a dim line on black, as on the films' canvas.

   const W = R.wire;                         // one per renderer
   W.seg(ax, ay, az, bx, by, bz, r, g, b, a) // world segment for this frame (colour 0..1)
   W.path(pts, o) / W.ring(c, r, o) / W.poly // helpers (o: { rgb, a, n, closed })
   const B = W.batch(f32 [ax, ay, az, bx, by, bz, ...])   // static batch (world metres), uploaded once
   W.add(B, { rgb, a, width, fog: [full, none], depth })   // queue a batch for this frame
   W.model(M, { R, T, rgb, a, back, fog, ... })            // queue a facing-aware model batch (see WireModel)
   W.flush({ exclude: [x0, y0, x1, y1] })                   // draw everything queued (the renderer does it at the end
                                                             // of the frame when W.auto, else the caller does)
   Facing-aware model batches (the films' GEO.draw on the GPU): each segment carries one or two face normals and a
   mode: 0 plain, 1 edge (front when either adjacent face turns to the lens, else `back`), 2 generator (smooth:
   gen * (.35 + .65 f) front, genBack behind), 3 silhouette candidate (bright where the surface turns edge-on). */
import { HEAD, FRAME, COMMON, CULL } from './shaders.js';
import { program } from './gl.js';

/* shared: project a segment (RTE, curved) and expand it into a quad on screen */
export const QUAD = `
uniform vec4 uLw;          // x: width (px at 1080p), y: depth test (1) / on top (0), z: alpha, w: depth bias
uniform vec4 uFogW;        // x, y: depth fade full .. none (m, 0 = off); z, w: near fade none .. full (m, 0 = off)
uniform vec2 uHalf;        // canvas half-size (px)
uniform vec2 uFx;          // x: the lime scan fronts light the lines, y: the dynamic lights brighten them
out vec4 vC;
out vec2 vD;               // distance across the line (px) x w, and w: divided in the fragment shader (screen-linear)
flat out float vHW;
bool quad(vec3 a, vec3 b, float al, vec3 rgb) {
  a.y -= curveDrop(a); b.y -= curveDrop(b);
  float n = uCam.w;
  float za = dot(uCamF.xyz, a), zb = dot(uCamF.xyz, b);
  if (za < n && zb < n) return false;
  if (za < n) { a = mix(a, b, (n - za) / (zb - za)); za = n; }
  else if (zb < n) { b = mix(b, a, (n - zb) / (za - zb)); zb = n; }
  vec4 ca = uVP * vec4(a, 1.0), cb = uVP * vec4(b, 1.0);
  bool atB = gl_VertexID >= 2;
  float side = (gl_VertexID & 1) == 0 ? -1.0 : 1.0;
  vec2 hv = uHalf;
  vec2 sa = ca.xy / ca.w * hv, sb = cb.xy / cb.w * hv;
  vec2 d = sb - sa;
  float L = length(d);
  vec2 t = L > 1e-5 ? d / L : vec2(1.0, 0.0);
  vec2 nr = vec2(-t.y, t.x);
  float w = uLw.x * uCam.y;                       // px on this canvas
  float hw = max(0.5, 0.5 * w);
  vHW = hw;
  float ext = hw + 1.0;
  vec4 c = atB ? cb : ca;
  vec2 s = (atB ? sb : sa) + nr * side * ext;
  vD = vec2(side * ext * c.w, c.w);
  float z = atB ? zb : za;
  // fog (depth fade) and the near fade
  float k = 1.0;
  if (uFogW.y > 0.0) k *= 1.0 - smoothstep(uFogW.x, uFogW.y, z);
  if (uFogW.w > 0.0) k *= smoothstep(uFogW.z, uFogW.w, z);
  al *= uLw.z * k * min(1.0, w);
  if (uFx.x > 0.0 || uFx.y > 0.0) {
    vec3 pm = 0.5 * (a + b);
    if (uFx.x > 0.0) { vec2 sc = scanAt(pm); float kk = clamp(sc.x, 0.0, 1.0); rgb = mix(rgb, scanColor(), max(kk, 0.35 * sc.y)); al = max(al, 0.95 * kk * uFx.x); }
    if (uFx.y > 0.0) { vec3 lt = lightsAt(pm, vec3(0.0)) * uFx.y; float li = max(lt.r, max(lt.g, lt.b)); rgb = max(rgb, lt / max(1e-3, li)); al = max(al, min(1.0, li)); }
  }
  vC = vec4(rgb, al);
  if (vC.a < 0.002) return false;
  float cz = uLw.y > 0.5 ? (log2(max(1e-6, 1.0 + c.w * uLw.w)) * uCam.z - 1.0) * c.w : 0.0;
  gl_Position = vec4(s / hv * c.w, cz, c.w);
  return true;
}
`;

const VS_LINE = HEAD + FRAME + COMMON + `
layout(location = 0) in vec3 aA;
layout(location = 1) in vec3 aB;
layout(location = 2) in vec4 aC;
uniform vec4 uRgb;         // rgb multiplier, w: 1 = positions are world metres (the eye is subtracted), 0 = RTE
uniform vec3 uEyeD;        // eye (world) split: the part the float uEyeW misses, for world batches
${QUAD}
void main() {
  vec3 a = aA, b = aB;
  if (uRgb.w > 0.5) { a = (a - uEyeW.xyz) - uEyeD; b = (b - uEyeW.xyz) - uEyeD; }
  if (!quad(a, b, aC.a, aC.rgb * uRgb.rgb)) { ${CULL} }
}
`;

const VS_MODEL = HEAD + FRAME + COMMON + `
layout(location = 0) in vec3 aA;
layout(location = 1) in vec3 aB;
layout(location = 2) in vec4 aN1;       // xyz: face normal (model space) or the lathe axis (mode 4), w: alpha weight
layout(location = 3) in vec4 aN2;       // xyz: second face normal, or (r0, r1, side) (mode 4); w: mode + back ratio (fraction)
uniform mat3 uR;                        // model -> world rotation
uniform vec3 uT;                        // model origin, RTE
uniform vec3 uEm;                       // the eye in model space
uniform vec4 uRgb;                      // rgb, w: unused
uniform vec4 uFace;                     // x: back (edges), y: gen, z: genBack, w: silhouette
${QUAD}
void main() {
  vec3 A = aA, B = aB;
  vec3 m = 0.5 * (A + B);
  vec3 v = uEm - m;
  v /= max(1e-6, length(v));
  float mode = floor(aN2.w), bw = aN2.w - mode, al = aN1.w;
  if (mode > 3.5) {
    // a lathe's silhouette: the generator turned edge-on to the lens (GEO.draw), found here per frame
    vec3 d = aN1.xyz, w = (uEm - m) - aN1.xyz * dot(uEm - m, aN1.xyz);
    float wl = length(w);
    if (wl < 1e-5) { ${CULL} return; }
    vec3 sd = cross(d, w / wl);
    A += sd * (aN2.z * aN2.x); B += sd * (aN2.z * aN2.y);
    al *= uFace.w;
  } else if (mode > 0.5 && mode < 1.5) {
    bool fr = dot(aN1.xyz, v) > 0.0 || dot(aN2.xyz, v) > 0.0;
    al *= fr ? 1.0 : (bw > 0.001 ? bw : uFace.x);
  } else if (mode > 1.5 && mode < 2.5) {
    float f = dot(aN1.xyz, v);
    al *= f > 0.0 ? uFace.y * (0.35 + 0.65 * f) : uFace.z;
  } else if (mode > 2.5) {
    float f = abs(dot(aN1.xyz, v));
    al *= uFace.w * max(0.0, 1.0 - f / 0.2);
  }
  vec3 a = uR * A + uT, b = uR * B + uT;
  if (!quad(a, b, al, uRgb.rgb)) { ${CULL} }
}
`;

export const FS_LINE = HEAD + `
in vec4 vC;
in vec2 vD;
flat in float vHW;
out vec4 o;
void main() {
  float cov = clamp(vHW + 0.5 - abs(vD.x / vD.y), 0.0, 1.0);
  float a = vC.a * cov;
  if (a < 0.002) discard;
  o = vec4(vC.rgb * a, 1.0);
}
`;

const VS_VEIL = HEAD + `
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }
`;
const FS_VEIL = HEAD + `
uniform vec4 uC;           // rgb, a: how far the frame is gone
uniform vec2 uDis;         // x: 0 an even fade .. 1 a dissolve (the returns go out one by one), y: cell (px)
out vec4 o;
void main() {
  float a = uC.a;
  if (uDis.x > 0.0) {
    uvec2 p = uvec2(gl_FragCoord.xy / uDis.y);
    uint h = (p.x * 0x9E3779B1u) ^ (p.y * 0x85EBCA77u + 0x7f4a7c15u);
    h ^= h >> 15; h *= 0x2C1B3C6Du; h ^= h >> 12; h *= 0x297A2D39u; h ^= h >> 15;
    float r = float(h >> 8) * (1.0 / 16777216.0);
    float d = clamp((a * 1.3 - r) / 0.3, 0.0, 1.0);
    a = mix(a, d, uDis.x);
  }
  o = vec4(uC.rgb, a);
}
`;

const STRIDE = 10;                // stream: a xyz, b xyz, rgba

/* a static batch of plain segments (world metres) */
class Batch {
  constructor(gl, segs, cols) {
    this.gl = gl; this.n = segs.length / 6;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, segs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); gl.vertexAttribDivisor(1, 1);
    if (cols) {
      this.cbuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cbuf);
      gl.bufferData(gl.ARRAY_BUFFER, cols, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(2, 1);
    } else gl.disableVertexAttribArray(2);
    this.hasCol = !!cols;
    gl.bindVertexArray(null);
  }
  dispose() { const gl = this.gl; gl.deleteBuffer(this.buf); if (this.cbuf) gl.deleteBuffer(this.cbuf); gl.deleteVertexArray(this.vao); this.n = 0; }
}

/* a static facing-aware model batch: model-space segments with normals and modes */
class ModelBatch {
  constructor(gl, data) {
    this.gl = gl; this.n = data.length / 14;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const S = 56;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0); gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 24); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, S, 40); gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
  }
  dispose() { const gl = this.gl; gl.deleteBuffer(this.buf); gl.deleteVertexArray(this.vao); this.n = 0; }
}

export class Wire {
  constructor(G, R) {
    this.G = G; this.gl = G.gl; this.R = R;
    const gl = this.gl;
    this.pLine = program(gl, VS_LINE, FS_LINE, 'wire.line');
    this.pModel = program(gl, VS_MODEL, FS_LINE, 'wire.model');
    this.pVeil = program(gl, VS_VEIL, FS_VEIL, 'wire.veil');
    // the per-frame stream
    this.cap = 8192;
    this.data = new Float32Array(this.cap * STRIDE);
    this.n = 0;
    this.sbuf = gl.createBuffer();
    this.svao = gl.createVertexArray();
    gl.bindVertexArray(this.svao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sbuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    this._streamAttribs();
    gl.bindVertexArray(null);
    this.q = [];              // queued batches this frame
    this.eye = [0, 0, 0];
    this.auto = true;         // the renderer flushes at the end of its frame (false: the caller flushes)
    this.width = 1;           // stream line width (px at 1080p)
    this.streamFog = null;    // [full, none] depth fade of the stream (m)
    this.streamDepth = false;
    this.stats = { segs: 0, batches: 0, ms: 0 };
  }
  _streamAttribs() {
    const gl = this.gl, S = STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0); gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 24); gl.vertexAttribDivisor(2, 1);
  }

  /* ---------- per frame ---------- */
  begin(eye) { this.n = 0; this.q.length = 0; this.eye[0] = eye[0]; this.eye[1] = eye[1]; this.eye[2] = eye[2]; this.flushed = false; }
  /* world segment (metres), colour 0..1 */
  seg(ax, ay, az, bx, by, bz, r, g, b, a) {
    if (a <= .002) return;
    if (this.n >= this.cap) this._grow();
    const D = this.data, o = this.n * STRIDE, e = this.eye;
    D[o] = ax - e[0]; D[o + 1] = ay - e[1]; D[o + 2] = az - e[2];
    D[o + 3] = bx - e[0]; D[o + 4] = by - e[1]; D[o + 5] = bz - e[2];
    D[o + 6] = r; D[o + 7] = g; D[o + 8] = b; D[o + 9] = a;
    this.n++;
  }
  _grow() {
    const d = new Float32Array(this.data.length * 2); d.set(this.data); this.data = d; this.cap *= 2;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sbuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
  }
  /* polyline through world points [[x, y, z], ...] (o: { rgb [0..1], a, closed }) */
  path(pts, o) {
    const c = o.rgb || WHITE, a = o.a === undefined ? 1 : o.a, n = pts.length;
    for (let i = 0; i < n - 1; i++) { const p = pts[i], q = pts[i + 1]; this.seg(p[0], p[1], p[2], q[0], q[1], q[2], c[0], c[1], c[2], a); }
    if (o.closed && n > 2) { const p = pts[n - 1], q = pts[0]; this.seg(p[0], p[1], p[2], q[0], q[1], q[2], c[0], c[1], c[2], a); }
  }
  /* horizontal ring at height y (o: { rgb, a, n segments, a0, a1 bearings clockwise from north, dash [on, off] of the
     segments }) */
  ring(cx, y, cz, r, o) {
    o = o || {};
    const c = o.rgb || WHITE, a = o.a === undefined ? 1 : o.a;
    const a0 = o.a0 || 0, a1 = o.a1 === undefined ? Math.PI * 2 : o.a1;
    const n = Math.max(8, o.n || 192), da = (a1 - a0) / n, dash = o.dash;
    let px = cx + Math.sin(a0) * r, pz = cz + Math.cos(a0) * r;
    for (let i = 1; i <= n; i++) {
      const ang = a0 + i * da, qx = cx + Math.sin(ang) * r, qz = cz + Math.cos(ang) * r;
      if (!dash || (i % (dash[0] + dash[1])) < dash[0]) this.seg(px, y, pz, qx, y, qz, c[0], c[1], c[2], a);
      px = qx; pz = qz;
    }
  }

  /* ---------- static batches ---------- */
  /* segs: Float32Array [ax, ay, az, bx, by, bz, ...] world metres; cols: optional Float32Array rgba per segment */
  batch(segs, cols) { return new Batch(this.gl, segs, cols); }
  /* data: Float32Array, 14 floats per segment: a xyz, b xyz, n1 xyz, weight, n2 xyz, mode (model space) */
  modelBatch(data) { return new ModelBatch(this.gl, data); }
  /* queue a batch for this frame. o: { rgb [0..1], a, width (px at 1080p), fog [full, none] m, near [none, full] m,
     depth (test against the frame's depth buffer) } */
  add(B, o) { if (B && B.n && (o.a === undefined || o.a > .002)) this.q.push({ B, o, m: false }); }
  /* queue a model batch: o: { R (3x3 row-major, model -> world), T (world), rgb, a, width, back, gen, genBack, sil, fog, near, depth } */
  model(B, o) { if (B && B.n && (o.a === undefined || o.a > .002)) this.q.push({ B, o, m: true }); }

  /* ---------- drawing ---------- */
  _bands(ex) {
    const G = this.G, sx = G.W / Math.max(1, G.cssW), sy = G.H / Math.max(1, G.cssH);
    if (!ex) return null;
    const x0 = Math.max(0, Math.round(ex[0] * sx)), x1 = Math.min(G.W, Math.round(ex[2] * sx));
    const y0 = Math.max(0, Math.round(G.H - ex[3] * sy)), y1 = Math.min(G.H, Math.round(G.H - ex[1] * sy));   // GL: bottom-up
    if (x1 <= x0 || y1 <= y0) return null;
    const b = [];
    if (y1 < G.H) b.push([0, y1, G.W, G.H - y1]);
    if (y0 > 0) b.push([0, 0, G.W, y0]);
    if (x0 > 0) b.push([0, y0, x0, y1 - y0]);
    if (x1 < G.W) b.push([x1, y0, G.W - x1, y1 - y0]);
    return b;
  }
  _each(bands, fn) {
    const gl = this.gl;
    if (!bands) { fn(); return; }
    gl.enable(gl.SCISSOR_TEST);
    for (const b of bands) { gl.scissor(b[0], b[1], b[2], b[3]); fn(); }
    gl.disable(gl.SCISSOR_TEST);
  }
  /* darken the finished frame toward black by a (0..1) (rgb: toward that colour instead), leaving the CSS px rect
     `exclude` untouched; dissolve 0..1: instead of an even fade the returns go out one by one (a 1-px hash dither) */
  veil(a, rgb, exclude, dissolve) {
    if (a <= .001) return;
    const gl = this.gl, G = this.G, P = this.pVeil;
    gl.viewport(0, 0, G.W, G.H);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(P.p);
    const c = rgb || BLACK;
    gl.uniform4f(P.u.uC, c[0], c[1], c[2], Math.min(1, a));
    gl.uniform2f(P.u.uDis, dissolve || 0, Math.max(1, Math.round(G.H / 1080)));
    gl.bindVertexArray(null);
    this._each(this._bands(exclude), () => gl.drawArrays(gl.TRIANGLES, 0, 3));
    gl.disable(gl.BLEND); gl.depthMask(true);
  }
  /* draw the queued batches and the stream; o: { exclude: CSS px rect left untouched } */
  flush(o) {
    const gl = this.gl, G = this.G, R = this.R, t0 = performance.now();
    this.flushed = true;
    if (!this.q.length && !this.n) { this.stats.segs = 0; this.stats.batches = 0; return; }
    // the frame's uniform block (the renderer uploaded it for this frame)
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, R.ubo);
    gl.viewport(0, 0, G.W, G.H);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    const bands = this._bands(o && o.exclude);
    let segs = 0;
    const e = this.eye;
    // world batches: the eye split into a float part (uEyeW) and the rest, so world coordinates stay exact
    const ex = Math.fround(e[0]), ey = Math.fround(e[1]), ez = Math.fround(e[2]);
    for (const it of this.q) {
      const B = it.B, op = it.o;
      if (it.m) { segs += this._drawModel(B, op, bands); continue; }
      const P = this.pLine, u = P.u;
      gl.useProgram(P.p);
      this._common(u, op);
      const c = op.rgb || WHITE;
      gl.uniform4f(u.uRgb, c[0], c[1], c[2], 1);
      gl.uniform3f(u.uEyeD, e[0] - ex, e[1] - ey, e[2] - ez);
      gl.bindVertexArray(B.vao);
      if (!B.hasCol) gl.vertexAttrib4f(2, 1, 1, 1, 1);
      this._each(bands, () => gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, B.n));
      segs += B.n;
    }
    if (this.n) {
      const P = this.pLine, u = P.u;
      gl.useProgram(P.p);
      this._common(u, { width: this.width, fog: this.streamFog, depth: this.streamDepth, a: 1 });
      gl.uniform4f(u.uRgb, 1, 1, 1, 0);
      gl.uniform3f(u.uEyeD, 0, 0, 0);
      gl.bindVertexArray(this.svao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.sbuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * STRIDE);
      this._each(bands, () => gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n));
      segs += this.n;
    }
    gl.bindVertexArray(null);
    gl.blendEquation(gl.FUNC_ADD); gl.disable(gl.BLEND); gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
    this.stats.segs = segs; this.stats.batches = this.q.length; this.stats.ms = performance.now() - t0;
    this.q.length = 0; this.n = 0;
  }
  _common(u, op) {
    const gl = this.gl;
    gl.uniform2f(u.uHalf, this.G.W / 2, this.G.H / 2);
    gl.uniform4f(u.uLw, op.width || 1, op.depth ? 1 : 0, op.a === undefined ? 1 : op.a, op.bias || .9985);
    gl.uniform2f(u.uFx, op.scan ? 1 : 0, op.lights ? 1 : 0);
    const f = op.fog, nr = op.near;
    gl.uniform4f(u.uFogW, f ? f[0] : 0, f ? f[1] : 0, nr ? nr[0] : 0, nr ? nr[1] : 0);
    if (op.depth) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); } else gl.disable(gl.DEPTH_TEST);
  }
  _drawModel(B, op, bands) {
    const gl = this.gl, P = this.pModel, u = P.u, e = this.eye;
    gl.useProgram(P.p);
    this._common(u, op);
    const M = op.R, T = op.T;
    // column-major mat3 from the row-major rotation
    const m = this._m3 || (this._m3 = new Float32Array(9));
    m[0] = M[0]; m[1] = M[3]; m[2] = M[6]; m[3] = M[1]; m[4] = M[4]; m[5] = M[7]; m[6] = M[2]; m[7] = M[5]; m[8] = M[8];
    gl.uniformMatrix3fv(u.uR, false, m);
    const tx = T[0] - e[0], ty = T[1] - e[1], tz = T[2] - e[2];
    gl.uniform3f(u.uT, tx, ty, tz);
    // the eye in model space: R^T (eye - T)
    gl.uniform3f(u.uEm, -(M[0] * tx + M[3] * ty + M[6] * tz), -(M[1] * tx + M[4] * ty + M[7] * tz), -(M[2] * tx + M[5] * ty + M[8] * tz));
    const c = op.rgb || WHITE;
    gl.uniform4f(u.uRgb, c[0], c[1], c[2], 0);
    gl.uniform4f(u.uFace, op.back === undefined ? .16 : op.back, op.gen === undefined ? .28 : op.gen, op.genBack === undefined ? .06 : op.genBack, op.sil === undefined ? 1 : op.sil);
    gl.bindVertexArray(B.vao);
    this._each(bands, () => gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, B.n));
    return B.n;
  }
}

const WHITE = [1, 1, 1], BLACK = [0, 0, 0];
