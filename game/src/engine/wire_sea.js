/* The ground and the sea in the Orbital films' hairlines (reference/films/_brief/sea_excerpts.js), procedural on the
   GPU for the full Orbital render style:
     sea      swell rows laid across the view, world-fixed (rows at multiples of a spacing along the view heading,
              quantised to 30 degree steps, two orientations cross-faded as the view turns), thinned with range by
              ordered levels (a row of level L survives while its spacing on screen stays readable), riding the
              engine's swell (the terrain's waves), broken where land comes up, faded with range as the films'
     horizon  one line on the dipped horizon
     survey   crosses on a world grid on land round the camera target (the films' survey crosses on the plateau)
   const S = new WireSea(R); S.draw(o)   // between the occluder and the flush; o: { a } */
import { HEAD, FRAME, COMMON, CULL } from './shaders.js';
import { program } from './gl.js';
import { QUAD, FS_LINE } from './wire.js';

const NROW = 192, M = 96;
const GRID = [[0, 1], [.5, 1], [1, 1], [0, .5], [.5, .5], [1, .5], [0, .25], [1, .25], [.5, 0], [0, 0], [1, 0]];
const DEG = Math.PI / 180, R_EARTH = 6371000;

const MAPH = `
uniform sampler2D uHTex;
uniform vec4 uMap;          // world x0, z0, 1/cell, cell
uniform ivec2 uMapN;
float mapHw(vec2 w) {
  vec2 f = (w - uMap.xy) * uMap.z;
  vec2 mx = vec2(uMapN - 1);
  vec2 fc = clamp(f, vec2(0.0), mx);
  ivec2 i0 = min(ivec2(floor(fc)), uMapN - 2);
  vec2 u = fc - vec2(i0);
  float a = texelFetch(uHTex, i0, 0).r, b = texelFetch(uHTex, i0 + ivec2(1, 0), 0).r;
  float c = texelFetch(uHTex, i0 + ivec2(0, 1), 0).r, d = texelFetch(uHTex, i0 + ivec2(1, 1), 0).r;
  float h = mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  vec2 o = max(max(-f, f - mx), 0.0) * uMap.w;
  float dout = length(o);
  if (dout > 0.0) h = mix(h, -80.0, smoothstep(0.0, 12000.0, dout));
  return h;
}
`;

const VS_SEA = HEAD + FRAME + COMMON + MAPH + `
uniform vec4 uRow[${NROW}];     // x: row offset along N (m, from the eye), y: first sample along T (m, from the eye), z: step (m), w: alpha
uniform vec4 uNT;               // xy: N (the view heading, xz), zw: T (along the rows)
uniform vec4 uWave[4];          // the terrain's swell: kx, kz, amplitude, phase (relative to the eye)
uniform float uSeaAmp;
uniform vec3 uRgb;
uniform vec4 uHull[16];         // hulls on the water: centre x, z (from the eye), heading sin, cos
uniform vec4 uHull2[16];        // x: half length, y: half beam (m) (0: none)
uniform int uNHull;
${QUAD}
/* the rows break round a hull (as the films' rows do) */
bool inHull(vec2 p) {
  for (int k = 0; k < 16; k++) {
    if (k >= uNHull) break;
    vec2 d = p - uHull[k].xy;
    float f = d.x * uHull[k].z + d.y * uHull[k].w, s = d.x * uHull[k].w - d.y * uHull[k].z;
    vec2 q = vec2(s / uHull2[k].y, f / uHull2[k].x);
    if (dot(q, q) < 1.0) return true;
  }
  return false;
}
float swellY(vec2 p) { float y = 0.0; for (int k = 0; k < 4; k++) { vec4 W = uWave[k]; y += W.z * sin(dot(W.xy, p) + W.w); } return y * uSeaAmp; }
void main() {
  int r = gl_InstanceID / ${M}, i = gl_InstanceID - r * ${M};
  vec4 R = uRow[r];
  if (R.w <= 0.002) { ${CULL} return; }
  vec2 N = uNT.xy, T = uNT.zw;
  vec2 pa = N * R.x + T * (R.y + float(i) * R.z), pb = pa + T * R.z;
  // no sea over land: the row breaks at the coast (as the films' rows break round a hull)
  float ha = mapHw(pa + uEyeW.xz), hb = mapHw(pb + uEyeW.xz);
  if (ha > -0.3 || hb > -0.3) { ${CULL} return; }
  if (uNHull > 0 && (inHull(pa) || inHull(pb))) { ${CULL} return; }
  vec3 a = vec3(pa.x, swellY(pa) - uEyeW.y, pa.y), b = vec3(pb.x, swellY(pb) - uEyeW.y, pb.y);
  // the ends of a row taper away
  float u = (float(i) + 0.5) / float(${M});
  float al = R.w * smoothstep(0.0, 0.12, u) * smoothstep(0.0, 0.12, 1.0 - u);
  if (!quad(a, b, al, uRgb)) { ${CULL} }
}
`;

const VS_SURVEY = HEAD + FRAME + COMMON + MAPH + `
uniform vec4 uSv;               // xy: first cell (world, relative to the eye), z: spacing (m), w: cells per side
uniform vec4 uSv2;              // x: arm (m), y: alpha, z: fade radius (m), w: unused
uniform vec2 uTc;               // the window's centre (relative to the eye, xz)
uniform vec3 uRgb;
${QUAD}
void main() {
  int n = int(uSv.w), c = gl_InstanceID >> 1, arm = gl_InstanceID & 1;
  int ci = c % n, cj = c / n;
  vec2 p = uSv.xy + vec2(float(ci), float(cj)) * uSv.z;
  float h = mapHw(p + uEyeW.xz);
  if (h < 0.8) { ${CULL} return; }
  float r = length(p - uTc) / uSv2.z;
  float al = uSv2.y * (1.0 - smoothstep(0.55, 1.0, r));
  if (al <= 0.003) { ${CULL} return; }
  vec2 d = arm == 0 ? vec2(uSv2.x, 0.0) : vec2(0.0, uSv2.x);
  vec3 a = vec3(p.x - d.x, h + 0.3 - uEyeW.y, p.y - d.y), b = vec3(p.x + d.x, h + 0.3 - uEyeW.y, p.y + d.y);
  if (!quad(a, b, al, uRgb)) { ${CULL} }
}
`;

const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export class WireSea {
  constructor(R) {
    this.R = R; this.G = R.G; this.gl = R.gl;
    this.pSea = program(this.gl, VS_SEA, FS_LINE, 'wire.sea');
    this.pSv = program(this.gl, VS_SURVEY, FS_LINE, 'wire.survey');
    this.rows = new Float32Array(NROW * 4);
    this.hull = new Float32Array(64); this.hull2 = new Float32Array(64); this.nHull = 0;
    this.px = 9;                  // wanted spacing of the rows on screen (1080 px)
    this.fade = 26000;            // rows fade out by this range (the films')
    this.seaA = .24;              // the films' .22
    this.surveyA = .2;
    this.stats = { rows: 0 };
    // the horizon: a unit circle (drawn scaled to the horizon's range round the eye, depth-tested)
    const c = [], n = 720;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      c.push(Math.sin(a0), 0, Math.cos(a0), Math.sin(a1), 0, Math.cos(a1), 0, 0, 0, 1, 0, 0, 0, 0);
    }
    this.circle = R.wire.modelBatch(new Float32Array(c));
    this.horizonA = .32;
  }
  /* the hulls on the water this frame (the rows break round them): [{ T: [x, y, z], hdg, hl, hb }] */
  setHulls(list) {
    const e = this.R.camera.eye, n = Math.min(16, list.length);
    for (let i = 0; i < n; i++) {
      const h = list[i];
      this.hull[i * 4] = h.T[0] - e[0]; this.hull[i * 4 + 1] = h.T[2] - e[2]; this.hull[i * 4 + 2] = Math.sin(h.hdg); this.hull[i * 4 + 3] = Math.cos(h.hdg);
      this.hull2[i * 4] = h.hl; this.hull2[i * 4 + 1] = h.hb;
    }
    this.nHull = n;
  }
  /* queue the horizon line (the films' .34): the sea's edge at the range of the geometric horizon */
  horizon(a) {
    const e = this.R.camera.eye, h = Math.max(1, e[1]), D = Math.sqrt(2 * R_EARTH * h) * .999;
    const k = a * this.horizonA * (1 - ss(20000, 80000, h));
    if (k > .004) this.R.wire.model(this.circle, { R: [D, 0, 0, 0, 1, 0, 0, 0, D], T: [e[0], 0, e[2]], a: k, depth: true, rgb: [1, 1, 1] });
  }
  _bind(P) {
    const gl = this.gl, T = this.R.terrain, u = P.u;
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.hTex);
    gl.uniform1i(u.uHTex, 0);
    gl.uniform4f(u.uMap, T.x0, T.z0, 1 / T.cell, T.cell);
    gl.uniform2i(u.uMapN, T.cols, T.rows);
    const W = this.R.wire;
    gl.uniform2f(u.uHalf, this.G.W / 2, this.G.H / 2);
    gl.uniform2f(u.uFx, 1, 1);
    return u;
  }
  /* rows of one orientation (heading q) with weight wq into this.rows from index n0; returns the new count.
     A row of spacing s at ground range d sits fl * s * h / (d^2 + h^2) px from the next on screen: rows of level L
     (odd multiples of s0 * 2^L) are drawn where that stays over this.px, from the nearest ground in view outward */
  _rows(q, wq, n0, cam, h) {
    const e = cam.eye, N = [Math.sin(q), Math.cos(q)], T = [Math.cos(q), -Math.sin(q)];
    const ce = e[0] * N[0] + e[2] * N[1], te = e[0] * T[0] + e[2] * T[1];
    const fl = 540 / Math.tan(cam.fov / 2), tanX = Math.tan(cam.fov / 2) * cam.W / Math.max(1, cam.H);
    const hh = Math.max(2, h);
    const far = Math.min(this.fade, Math.sqrt(2 * R_EARTH * hh) * 1.05 + 1000);
    // the ground in view: where the rays through the frame's corners, edges and centre meet the sea
    let lo = far, hi = -far;
    for (const [sx, sy] of GRID) {
      const r = cam.ray(sx * cam.W, sy * cam.H), d = r.d;
      if (d[1] < -1e-4) { const t = hh / -d[1], c = (d[0] * N[0] + d[2] * N[1]) * t; lo = Math.min(lo, c); hi = Math.max(hi, c); }
      else hi = far;
    }
    lo = Math.max(-far, lo - 20); hi = Math.min(far, hi);
    if (hi <= lo) return n0;
    const need = d => this.px * (d * d + hh * hh) / (fl * hh);
    const dn = lo > 0 ? lo : hi < 0 ? -hi : 0;
    const s0 = Math.pow(2, Math.ceil(Math.log2(Math.max(.5, need(dn)))));
    const D = this.rows;
    let n = n0;
    for (let L = 0; L < 20 && n < NROW; L++) {
      const sp = s0 * Math.pow(2, L);
      // rows of level exactly L matter out to where their spacing on screen drops under px (then the level above)
      const dMax = Math.sqrt(Math.max(0, sp * fl * hh / this.px - hh * hh)) * 1.2;
      const a0 = Math.max(lo, -dMax), a1 = Math.min(hi, dMax);
      if (a1 < a0) continue;
      const j0 = Math.ceil((ce + a0) / sp), j1 = Math.floor((ce + a1) / sp);
      for (let j = j0; j <= j1 && n < NROW; j++) {
        if (L < 19 && (j & 1) === 0) continue;         // even rows belong to a coarser level
        const d = j * sp - ce, ad = Math.abs(d);
        const kL = ss(1, 1.5, sp / Math.max(1e-3, need(ad)));
        const fa = Math.pow(Math.max(0, 1 - ad / this.fade), 3);
        const a = this.seaA * kL * fa * wq;
        if (a < .004) continue;
        const half = Math.hypot(ad, hh) * tanX * 1.3 + 100;
        const step = Math.pow(2, Math.ceil(Math.log2(2 * half / M)));
        const t0 = Math.floor((te - half) / step) * step - te;
        D[n * 4] = d; D[n * 4 + 1] = t0; D[n * 4 + 2] = step; D[n * 4 + 3] = a;
        n++;
      }
    }
    return n;
  }
  draw(o) {
    o = o || {};
    const gl = this.gl, R = this.R, cam = R.camera, T = R.terrain, e = cam.eye, A = o.a === undefined ? 1 : o.a;
    const h = Math.max(1, e[1]);
    // two orientations 30 degrees apart, cross-faded by the view heading
    const f = cam.f, q = Math.atan2(f[0], f[2]), st = 30 * DEG, qf = q / st, q0 = Math.floor(qf), fr = qf - q0;
    const w1 = ss(.3, .7, fr), w0 = 1 - w1;
    let total = 0;
    const hk = 1 - ss(1500, 5000, h);
    const P = this.pSea;
    const u = this._bind(P);
    gl.uniform4fv(u.uWave, T.uWave);
    gl.uniform4fv(u.uHull, this.hull); gl.uniform4fv(u.uHull2, this.hull2); gl.uniform1i(u.uNHull, this.nHull);
    gl.uniform1f(u.uSeaAmp, T.seaAmp);
    gl.uniform3f(u.uRgb, 1, 1, 1);
    gl.uniform4f(u.uLw, 1, 1, A, .9995);
    gl.uniform4f(u.uFogW, 0, 0, 0, 0);
    for (const [k, w] of [[q0, w0], [q0 + 1, w1]]) {
      if (w < .01 || hk <= .01) continue;
      const qa = k * st;
      const n = this._rows(qa, w * hk, 0, cam, h);
      if (!n) continue;
      for (let i = n; i < NROW; i++) this.rows[i * 4 + 3] = 0;
      gl.uniform4fv(u.uRow, this.rows);
      gl.uniform4f(u.uNT, Math.sin(qa), Math.cos(qa), Math.cos(qa), -Math.sin(qa));
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n * M);
      total += n;
    }
    this.stats.rows = total;
    // survey crosses on land round the camera target
    const svA = this.surveyA * (1 - ss(3000, 12000, cam.dist));
    if (svA > .004) {
      const S = this.pSv, us = this._bind(S), tg = cam.target;
      const cells = 44, g = Math.pow(2, Math.round(Math.log2(Math.max(4, cam.dist / 9))));
      const x0 = (Math.floor(tg[0] / g) - cells / 2) * g, z0 = (Math.floor(tg[2] / g) - cells / 2) * g;
      gl.uniform4f(us.uSv, x0 - e[0], z0 - e[2], g, cells);
      gl.uniform4f(us.uSv2, g * .06, svA * A, cells * g * .5, 0);
      gl.uniform2f(us.uTc, tg[0] - e[0], tg[2] - e[2]);
      gl.uniform3f(us.uRgb, 1, 1, 1);
      gl.uniform4f(us.uLw, 1, 1, 1, .999);
      gl.uniform4f(us.uFogW, 0, 0, 0, 0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cells * cells * 2);
    }
  }
}
