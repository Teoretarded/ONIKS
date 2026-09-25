/* Streaming dots for effects, rebuilt every frame between Renderer.begin() and end():
   - fx.dot(p, size, rgb, a, mode)   world-space square dot. size > 0: px at 1080p (1..4); size < 0: metres.
                                     mode 'max' (default, depth-tested, like every film dot), 'add' (glows,
                                     flashes), 'over' (alpha over, no depth test: lime lines that must read over
                                     bright dots, the films' dset)
   - fx.glow(p, radius, rgb, a)      soft additive disc, (1 - d^2/R^2)^2; radius > 0: px at 1080p, < 0: metres
   - fx.lift(v)                      full-frame additive lift (a lightning flash)
   - fx.line / ring / arc / path     dotted world-space lines, dot spacing even on screen, optionally draped
   - Wake                            Kelvin wake of dots behind a ship, fixed in the water, fading with age
   Colours are 0..255 like the films (LIME [198, 244, 50], CORAL [255, 106, 61], WH [238, 238, 228]). */
import { HEAD, FRAME, COMMON, CULL } from './shaders.js';
import { program } from './gl.js';

export const LIME = [198, 244, 50], CORAL = [255, 106, 61], WH = [238, 238, 228];
const DEG = Math.PI / 180, R_EARTH = 6371000;

const VS_DOT = HEAD + FRAME + COMMON + `
layout(location = 0) in vec4 aP;       // xyz: RTE position, w: size (>0 px @1080, <0 metres)
layout(location = 1) in vec4 aC;       // rgba 0..1
out vec4 vC;
uniform float uDepthK;                 // 1: normal, 0: pinned in front (no depth)
void main() {
  vec3 p = aP.xyz;
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  if (uDepthK < 0.5) c.z = -c.w * 0.999;
  gl_Position = c;
  float s = aP.w > 0.0 ? aP.w : (-aP.w * uCam.x / c.w);
  gl_PointSize = clamp(floor(s * uCam.y + 0.5), 1.0, 256.0);
  vC = aC;
}
`;
const FS_MAX = HEAD + `
in vec4 vC; out vec4 o;
void main() { o = vec4(vC.rgb * vC.a, 1.0); }
`;
const FS_OVER = HEAD + `
in vec4 vC; out vec4 o;
void main() { o = vC; }
`;
const VS_GLOW = HEAD + FRAME + COMMON + `
layout(location = 0) in vec4 aP;
layout(location = 1) in vec4 aC;
out vec4 vC;
uniform float uMaxPt;
void main() {
  vec3 p = aP.xyz;
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  gl_Position = c;
  float r = aP.w > 0.0 ? aP.w : (-aP.w * uCam.x / c.w);
  gl_PointSize = clamp(2.0 * r * uCam.y, 2.0, uMaxPt);
  vC = aC;
}
`;
const FS_GLOW = HEAD + `
in vec4 vC; out vec4 o;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float u = 1.0 - dot(d, d);
  if (u <= 0.0) discard;
  o = vec4(vC.rgb * (u * u * vC.a), 1.0);
}
`;
const VS_QUAD = HEAD + `
out vec2 vUv;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }
`;
const FS_LIFT = HEAD + `
in vec2 vUv; out vec4 o;
uniform vec4 uLift;
void main() { o = vec4(uLift.rgb * uLift.a, 1.0); }
`;

class Stream {
  constructor(gl, cap) {
    this.gl = gl; this.cap = cap; this.n = 0;
    this.buf = new ArrayBuffer(cap * 20);
    this.f = new Float32Array(this.buf); this.b = new Uint8Array(this.buf);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.buf.byteLength, gl.DYNAMIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 20, 16);
    gl.bindVertexArray(null);
  }
  grow() {
    const gl = this.gl, cap = this.cap * 2, buf = new ArrayBuffer(cap * 20);
    new Uint8Array(buf).set(this.b);
    this.buf = buf; this.cap = cap; this.f = new Float32Array(buf); this.b = new Uint8Array(buf);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, buf.byteLength, gl.DYNAMIC_DRAW);
  }
  push(x, y, z, s, r, g, b, a) {
    if (this.n >= this.cap) this.grow();
    const i = this.n++, f = this.f, B = this.b, o = i * 5;
    f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = s;
    const q = o * 4 + 16;
    B[q] = r > 255 ? 255 : r < 0 ? 0 : r; B[q + 1] = g > 255 ? 255 : g < 0 ? 0 : g; B[q + 2] = b > 255 ? 255 : b < 0 ? 0 : b; B[q + 3] = a >= 1 ? 255 : a <= 0 ? 0 : a * 255;
  }
  upload() {
    if (!this.n) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.b, 0, this.n * 20);
  }
  draw() { if (!this.n) return; const gl = this.gl; gl.bindVertexArray(this.vao); gl.drawArrays(gl.POINTS, 0, this.n); }
}

export class FX {
  constructor(G, renderer) {
    this.G = G; this.gl = G.gl; this.R = renderer;
    const gl = this.gl;
    this.pDot = program(gl, VS_DOT, FS_MAX, 'fx.dot');
    this.pOver = program(gl, VS_DOT, FS_OVER, 'fx.over');
    this.pGlow = program(gl, VS_GLOW, FS_GLOW, 'fx.glow');
    this.pLift = program(gl, VS_QUAD, FS_LIFT, 'fx.lift');
    this.sMax = new Stream(gl, 65536); this.sAdd = new Stream(gl, 16384); this.sOver = new Stream(gl, 16384);
    this.sGlow = new Stream(gl, 2048); this.sTop = new Stream(gl, 8192);
    this.liftV = [0, 0, 0, 0];
    this._q = [0, 0, 0];
  }
  begin(eye) { this.eye = eye; this.sMax.n = this.sAdd.n = this.sOver.n = this.sGlow.n = this.sTop.n = 0; this.liftV = [0, 0, 0, 0]; }
  get count() { return this.sMax.n + this.sAdd.n + this.sOver.n + this.sGlow.n + this.sTop.n; }

  /* a world dot. rgb 0..255, a 0..1. mode: 'max' | 'add' | 'over' | 'top' (over, never hidden) */
  dot(p, size, rgb, a, mode) {
    const e = this.eye, s = mode === 'add' ? this.sAdd : mode === 'over' ? this.sOver : mode === 'top' ? this.sTop : this.sMax;
    s.push(p[0] - e[0], p[1] - e[1], p[2] - e[2], size || 1, rgb[0], rgb[1], rgb[2], a === undefined ? 1 : a);
  }
  /* same, from numbers (hot loops) */
  dotXYZ(x, y, z, size, r, g, b, a, mode) {
    const e = this.eye, s = mode === 'add' ? this.sAdd : mode === 'over' ? this.sOver : mode === 'top' ? this.sTop : this.sMax;
    s.push(x - e[0], y - e[1], z - e[2], size || 1, r, g, b, a);
  }
  glow(p, radius, rgb, a) { const e = this.eye; this.sGlow.push(p[0] - e[0], p[1] - e[1], p[2] - e[2], radius, rgb[0], rgb[1], rgb[2], a === undefined ? 1 : a); }
  /* full-frame additive lift, v 0..1 (a lightning flash), optional tint */
  lift(v, rgb) { const c = rgb || WH; if (v > this.liftV[3]) this.liftV = [c[0] / 255, c[1] / 255, c[2] / 255, v]; }

  /* ---------- dotted world lines (spacing even on screen) ---------- */
  /* o: { rgb, a, step (px between dots, default 5), size (px), mode, drape (sit on the ground/sea), lift (m) } */
  path(pts, o) {
    o = o || {};
    const cam = this.R.camera, step = o.step || 5, rgb = o.rgb || WH, a = o.a === undefined ? .8 : o.a, size = o.size || 1, mode = o.mode || 'max';
    const T = this.R.terrain, lift = o.lift || 0, drape = !!o.drape;
    const yAt = (x, y, z) => drape ? Math.max(0, T.heightAt(x, z)) + lift : y + lift;
    const q0 = [0, 0, 0], q1 = [0, 0, 0];
    let carry = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], Bp = pts[i + 1];
      const pa = cam.project([A[0], yAt(A[0], A[1] || 0, A[2]), A[2]], q0), pb = cam.project([Bp[0], yAt(Bp[0], Bp[1] || 0, Bp[2]), Bp[2]], q1);
      let n;
      if (pa && pb) {
        if ((pa[0] < -50 && pb[0] < -50) || (pa[0] > cam.W + 50 && pb[0] > cam.W + 50) || (pa[1] < -50 && pb[1] < -50) || (pa[1] > cam.H + 50 && pb[1] > cam.H + 50)) { carry = 0; continue; }
        n = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / step;
      } else if (pa || pb) n = 64; else { carry = 0; continue; }
      n = Math.min(4000, n);
      let t = carry / Math.max(1e-6, n);
      const dt = 1 / Math.max(1e-6, n);
      for (; t < 1; t += dt) {
        const x = A[0] + (Bp[0] - A[0]) * t, z = A[2] + (Bp[2] - A[2]) * t, y = (A[1] || 0) + ((Bp[1] || 0) - (A[1] || 0)) * t;
        this.dotXYZ(x, yAt(x, y, z), z, size, rgb[0], rgb[1], rgb[2], a, mode);
      }
      carry = (t - 1) * n;
    }
  }
  line(a, b, o) { this.path([a, b], o); }
  /* circle of radius r about c (horizontal); arc from bearing a0 to a1 (rad, clockwise from north) */
  arc(c, r, a0, a1, o) {
    const n = Math.max(24, Math.min(720, Math.ceil(Math.abs(a1 - a0) / (2 * Math.PI) * 360))), pts = [];
    for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push([c[0] + Math.sin(a) * r, c[1] || 0, c[2] + Math.cos(a) * r]); }
    this.path(pts, o);
  }
  ring(c, r, o) { this.arc(c, r, 0, 2 * Math.PI, o); }

  /* ---------- draw (called by the renderer) ---------- */
  drawMax() {
    const gl = this.gl;
    this.sMax.upload();
    gl.useProgram(this.pDot.p); gl.uniform1f(this.pDot.u.uDepthK, 1);
    this.sMax.draw();
  }
  drawAdd() {
    const gl = this.gl;
    this.sAdd.upload(); this.sGlow.upload();
    gl.useProgram(this.pDot.p); gl.uniform1f(this.pDot.u.uDepthK, 1);
    this.sAdd.draw();
    if (this.sGlow.n) { gl.useProgram(this.pGlow.p); gl.uniform1f(this.pGlow.u.uMaxPt, this.G.pointMax); this.sGlow.draw(); }
  }
  drawOver() {
    const gl = this.gl;
    this.sOver.upload(); this.sTop.upload();
    gl.useProgram(this.pOver.p);
    gl.uniform1f(this.pOver.u.uDepthK, 1); this.sOver.draw();
    gl.uniform1f(this.pOver.u.uDepthK, 0); this.sTop.draw();
  }
  drawLift() {
    const v = this.liftV; if (v[3] <= 0) return;
    const gl = this.gl;
    gl.useProgram(this.pLift.p);
    gl.uniform4f(this.pLift.u.uLift, v[0], v[1], v[2], v[3]);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

/* Kelvin wake: rows of dots emitted at the stern and left in the water; the arms spread at 19.47 degrees,
   the churned centre line widens; everything fades over ~1.1 km of track. */
export class Wake {
  constructor(o) {
    o = o || {};
    this.L = o.L || 155; this.B = o.B || 20;
    this.len = o.len || 1100;                // m of track
    this.rate = o.rate || 8;                 // rows per second
    this.rows = []; this.lastT = -1e9; this.seed = (o.seed || 1) * 7919;
  }
  /* call every frame with the ship's world position, heading, speed (m/s) and time (s) */
  update(pos, hdg, speed, t) {
    if (t < this.lastT) { this.rows.length = 0; this.lastT = -1e9; }
    const dtE = 1 / this.rate;
    if (this.lastT < t - 5) this.lastT = t - dtE;
    while (this.lastT + dtE <= t) {
      this.lastT += dtE;
      const s = Math.sin(hdg), c = Math.cos(hdg), back = this.L / 2 * .96;
      this.rows.push({ t: this.lastT, x: pos[0] - s * back, z: pos[2] - c * back, s, c, v: Math.max(.5, speed), k: this.rows.length ? this.rows[this.rows.length - 1].k + 1 : 0 });
    }
    const maxAge = this.len / Math.max(1, speed) + 2;
    while (this.rows.length && t - this.rows[0].t > maxAge) this.rows.shift();
    this.pos = pos; this.hdg = hdg; this.speed = speed; this.t = t;
  }
  draw(fx, a, rgb) {
    const t = this.t; if (t === undefined) return;
    rgb = rgb || WH; a = a === undefined ? 1 : a;
    const tanK = Math.tan(19.47 * DEG), rows = this.rows, cam = fx.R.camera;
    for (let i = 0; i < rows.length; i++) {
      const w = rows[i], age = t - w.t, d = age * w.v, u = d / this.len;
      if (u >= 1) continue;
      const fa = a * Math.pow(1 - u, 1.5);
      const px = w.c, pz = -w.s;                                  // starboard
      // the two arms
      const lat = this.B * .45 + d * tanK;
      for (const sd of [-1, 1]) fx.dotXYZ(w.x + px * sd * lat, .25, w.z + pz * sd * lat, 1, rgb[0], rgb[1], rgb[2], fa * .6);
      // feathering of the arms: short transverse crests just inside them
      if ((w.k & 1) === 0) for (const sd of [-1, 1]) { const l2 = lat * (.86 + .1 * hsh(w.k, sd + 3)); fx.dotXYZ(w.x + px * sd * l2 - w.s * 1.5, .25, w.z + pz * sd * l2 - w.c * 1.5, 1, rgb[0], rgb[1], rgb[2], fa * .35); }
      // the churned centre: widening, brighter near the stern
      const nC = u < .15 ? 5 : 3;
      for (let m = 0; m < nC; m++) {
        const r = hsh(w.k * 7 + m, this.seed) - .5, r2 = hsh(w.k * 13 + m, this.seed + 1) - .5;
        const wid = this.B * .55 + d * .06, l = r * wid, al = r2 * 6;
        fx.dotXYZ(w.x + px * l - w.s * al, .3, w.z + pz * l - w.c * al, u < .05 && cam.dist < 900 ? 2 : 1, rgb[0], rgb[1], rgb[2], fa * (.55 + .4 * Math.exp(-u * 8)));
      }
    }
    // bow wave and the foam along the waterline
    if (this.pos) {
      const s = Math.sin(this.hdg), c = Math.cos(this.hdg), px = c, pz = -s, h = this.L / 2, sp = Math.min(1, this.speed / 12);
      for (let k = 0; k < 70; k++) {
        const sd = k & 1 ? 1 : -1, f = (k >> 1) / 35, zz = h * .92 - f * this.L * .95;
        const bw = this.B / 2 * (zz > h * .3 ? Math.max(0, 1 - Math.pow((zz / h - .3) / .7, 1.75)) : 1) + .8 + 1.2 * sp * Math.exp(-f * 4);
        fx.dotXYZ(this.pos[0] + s * zz + px * sd * bw, .35 + .3 * Math.sin(k + t * 3), this.pos[2] + c * zz + pz * sd * bw, 1, rgb[0], rgb[1], rgb[2], a * (.3 + .4 * sp) * (1 - .5 * f));
      }
    }
  }
}
function hsh(a, b) {
  let h = Math.imul(a ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(b + 0x7f4a7c15, 0x85EBCA77);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
  return ((h >>> 0) + .5) / 4294967296;
}
