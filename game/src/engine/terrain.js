/* Terrain and sea as a POINT CLIPMAP around the lens.
   Nested square lattices of dots, spacing doubling per level, every level snapped to its world lattice (dots
   never swim), jitter from a hash of the dot's absolute lattice position (stable), heights read in the vertex
   shader from a float texture of map.heights. Level transitions dissolve: in the outer band of a level the
   dots that are not on the next level's lattice drop out one by one while the shared ones slide to the coarser
   jitter, so the hand-over is seamless; the finest level does the same with the zoom fraction, so zooming
   never pops. The lattice is centred on the eye's ground point, finest spacing from the lens height: from
   20 m to 150 km the dots keep the same density on screen.
   Land is the films' LiDAR survey (lit by a low moon from the slope, contour and ridge emphasis, a bright surf
   band at the waterline); the sea is the films' dot sea (a swell moving in the vertex shader, brightness from
   the swell, wind rows, sparse at range); shallow seabed shows faintly. An invisible depth mesh (lower
   envelope of the land, then the sea surface) occludes what is behind hills and below the horizon: with the
   Earth's curvature (d^2 / 2R) distant ships go hull-down. */
import { HEAD, FRAME, COMMON, FS_POINT, CULL } from './shaders.js';
import { program, floatTex } from './gl.js';

const MAXL = 20;
const B = 32;                 // block side (dots)
const MB = 8;                 // depth mesh quads per block side
const R_EARTH = 6371000;
const BASE_SHIFT = 6;         // absolute lattice unit = 1/64 m (hash coordinates)

/* ---------- JS mirrors of the shader's hash and noise (units sit on what is drawn) ---------- */
function hash2(x, y) {
  let h = (Math.imul(x >>> 0, 0x9E3779B1) ^ (Math.imul(y >>> 0, 0x85EBCA77) + 0x7f4a7c15)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297A2D39) >>> 0; h ^= h >>> 15;
  return h >>> 0;
}
const u01 = h => (h >>> 8) / 16777216;
const uo = v => (v + 0x40000000) >>> 0;
function vnoise(px, pz, out) {
  const ix = Math.floor(px), iz = Math.floor(pz), fx = px - ix, fz = pz - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz), dx = 6 * fx * (1 - fx), dz = 6 * fz * (1 - fz);
  const a = u01(hash2(uo(ix), uo(iz))), b = u01(hash2(uo(ix + 1), uo(iz))), c = u01(hash2(uo(ix), uo(iz + 1))), e = u01(hash2(uo(ix + 1), uo(iz + 1)));
  const k1 = b - a, k2 = c - a, k3 = a - b - c + e;
  if (out) { out[0] = 2 * dx * (k1 + k3 * uz); out[1] = 2 * dz * (k2 + k3 * ux); }
  return (a + k1 * ux + k2 * uz + k3 * ux * uz) * 2 - 1;
}
const DET = { a1: .7, l1: 47, a2: .16, l2: 9.3, h0: 1.5, h1: 14 };   // detail relief (m), fades in above the shore
const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- shaders ---------- */
const LATTICE = `
layout(location = 0) in ivec3 aBlk;       // level, block origin i0, j0 (lattice units, relative to the level centre)
uniform int uG;
uniform int uB;
uniform float uBand;
uniform vec4 uLv[${MAXL}];                // s, rte offset x, rte offset z, level-0 zoom fraction
uniform ivec4 uLvI[${MAXL}];              // centre I, J (lattice units), hash shift, last level
uniform ivec4 uHole[${MAXL}];             // finer level's grid (relative): i0, i1, j0, j1
uniform sampler2D uHTex;                  // heights R32F, node grid, row 0 = south
uniform sampler2D uNTex;                  // RGBA16F: dh/dx, dh/dz, ridge, unused
uniform vec4 uMap;                        // world x0, z0, 1/cell, cell
uniform ivec2 uMapN;                      // cols, rows
uniform uint uSalt;
uniform float uJit;
uniform float uRelief;

/* one lattice dot: rte xz, effective spacing, visibility, hash; false = no dot here */
bool latticeDot(out vec2 xz, out float sEff, out float vis, out uint hs, out float tb) {
  int l = aBlk.x;
  int li = gl_VertexID % uB, lj = gl_VertexID / uB;
  int i = aBlk.y + li, j = aBlk.z + lj;
  ivec4 hb = uHole[l];
  if (i >= hb.x && i < hb.y && j >= hb.z && j < hb.w) return false;
  vec4 L = uLv[l]; ivec4 LI = uLvI[l];
  float s = L.x;
  int I = LI.x + i, J = LI.y + j;
  hs = hash2(uo(I << LI.z) ^ uSalt, uo(J << LI.z));
  vec2 q = L.yz + vec2(float(i), float(j)) * s;
  float dn = max(abs(q.x), abs(q.y)) / s;
  float hg = float(uG / 2);
  float t = smoothstep(hg - uBand - 2.0, hg - 2.0, dn);
  if (l == 0) t = max(t, L.w);
  tb = t;
  vis = 1.0; sEff = s;
  float js = 1.0;
  if (((I | J) & 1) == 0) { js = 1.0 + t; sEff = s * js; }
  else {
    float hv = u01(hash1(hs ^ 0x68bc21ebu));
    vis = clamp((hv - t) / 0.12, 0.0, 1.0);
    if (vis <= 0.0) return false;
  }
  if (LI.w == 1) vis *= 1.0 - smoothstep(hg - uBand, hg - 2.0, dn);
  uint h2 = hash1(hs + 0x9e3779b9u);
  xz = q + vec2(u01(hs) - 0.5, u01(h2) - 0.5) * uJit * s * js;
  return vis > 0.001;
}
/* map height (bilinear on the node grid) at world xz; outside the map it falls off to open sea */
float mapH(vec2 w, out float dout) {
  vec2 f = (w - uMap.xy) * uMap.z;
  vec2 mx = vec2(uMapN - 1);
  vec2 fc = clamp(f, vec2(0.0), mx);
  ivec2 i0 = min(ivec2(floor(fc)), uMapN - 2);
  vec2 u = fc - vec2(i0);
  float a = texelFetch(uHTex, i0, 0).r, b = texelFetch(uHTex, i0 + ivec2(1, 0), 0).r;
  float c = texelFetch(uHTex, i0 + ivec2(0, 1), 0).r, d = texelFetch(uHTex, i0 + ivec2(1, 1), 0).r;
  float h = mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  vec2 o = max(max(-f, f - mx), 0.0) * uMap.w;
  dout = length(o);
  if (dout > 0.0) h = mix(h, -80.0, smoothstep(0.0, 12000.0, dout));
  return h;
}
vec4 mapN(vec2 w) {
  vec2 f = clamp((w - uMap.xy) * uMap.z, vec2(0.0), vec2(uMapN - 1));
  return texture(uNTex, (f + 0.5) / vec2(uMapN));
}
float vnoise(vec2 p, out vec2 d) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  ivec2 ii = ivec2(i);
  float a = u01(hash2(uo(ii.x), uo(ii.y))), b = u01(hash2(uo(ii.x + 1), uo(ii.y)));
  float c = u01(hash2(uo(ii.x), uo(ii.y + 1))), e = u01(hash2(uo(ii.x + 1), uo(ii.y + 1)));
  float k1 = b - a, k2 = c - a, k3 = a - b - c + e;
  d = 2.0 * du * vec2(k1 + k3 * u.y, k2 + k3 * u.x);
  return (a + k1 * u.x + k2 * u.y + k3 * u.x * u.y) * 2.0 - 1.0;
}
/* metre-scale relief the 100 m grid cannot carry (same as Terrain.detail in JS) */
float detail(vec2 w, float h, out vec2 g) {
  float k = smoothstep(${DET.h0.toFixed(2)}, ${DET.h1.toFixed(2)}, h);
  g = vec2(0.0);
  if (k <= 0.0) return 0.0;
  vec2 d1, d2;
  float n1 = vnoise(w / ${DET.l1.toFixed(2)}, d1), n2 = vnoise(w / ${DET.l2.toFixed(2)} + 17.3, d2);
  g = k * (${DET.a1.toFixed(3)} * d1 / ${DET.l1.toFixed(2)} + ${DET.a2.toFixed(3)} * d2 / ${DET.l2.toFixed(2)});
  return k * (${DET.a1.toFixed(3)} * n1 + ${DET.a2.toFixed(3)} * n2);
}
`;

const SEA_GLSL = `
uniform vec4 uWave[4];      // kx, kz, amplitude, phase (includes k.eye - w t)
uniform vec4 uSeaP;         // x: brightness, y: keep fraction, z: wind-row angle, w: total amplitude
uniform vec4 uSurf;         // x: surf width (m), y: waterline brightness, z: time, w: contour interval (m)
uniform vec4 uLand;         // x: brightness, y: contour strength, z: ridge gain, w: outside-map dim
uniform vec4 uDot;          // x: 2 px above this on-screen spacing, y: 3 px above, z: dim above (px), w: min screen area per dot (px^2)
float swell(vec2 p, out vec2 g) {
  float y = 0.0; g = vec2(0.0);
  for (int k = 0; k < 4; k++) {
    vec4 W = uWave[k];
    float a = dot(W.xy, p) + W.w;
    y += W.z * sin(a); g += W.z * W.xy * cos(a);
  }
  return y;
}
`;

const VS_SURF = HEAD + FRAME + COMMON + LATTICE + SEA_GLSL + `
out vec3 vCol;
void main() {
  vec2 xz; float sEff, vis, tb; uint hs;
  if (!latticeDot(xz, sEff, vis, hs, tb)) { ${CULL} return; }
  vec2 w = xz + uEyeW.xz;
  float dout;
  float h = mapH(w, dout);
  vec4 N = mapN(w);
  vec3 col = WH;
  float b, y, big = 0.0, seaK = 1.0;
  vec3 n;
  float dsh = abs(h) / max(0.002, length(N.xy));       // distance to the waterline (m)
  float wl = max(0.75 * sEff, 2.0);
  if (dsh < wl && dout <= 0.0) {
    // the waterline: the returns either side of it snapped onto the h = 0 contour (a Newton step along the
    // gradient), so the coast prints as one crisp dotted line
    float g2 = max(1e-6, dot(N.xy, N.xy));
    xz -= N.xy * (h / g2);
    y = 0.35;
    n = vec3(0.0, 1.0, 0.0);
    b = uSurf.y * (0.72 + 0.28 * u01(hash1(hs ^ 0x51ed27u)));
    big = 1.0;
  } else if (h > 0.0) {
    vec2 dg;
    y = h + detail(w, h, dg);
    vec2 g = N.xy + dg;
    n = normalize(vec3(-g.x, 1.0, -g.y));
    // shading from an exaggerated normal: the relief reads like the films' survey at true height
    vec2 gs = N.xy * uRelief + dg * 1.5;
    float sh = max(0.0, dot(normalize(vec3(-gs.x, 1.0, -gs.y)), uSun.xyz));
    b = 0.05 + 0.85 * pow(sh, 2.0);
    b += 0.06 * clamp(h / 500.0, 0.0, 1.0);
    b += clamp(N.z * uLand.z, 0.0, 0.28);
    float hv = h / uSurf.w;
    if (hv - floor(hv) < 0.1) b += uLand.y;
    b *= uLand.x;
    b *= mix(1.0, uLand.w, smoothstep(0.0, 3000.0, dout));
  } else {
    // sea: sparse returns riding the swell
    vec2 g;
    y = swell(xz, g) * uMisc.x;
    g *= uMisc.x;
    n = normalize(vec3(-g.x, 1.0, -g.y));
    float A = max(0.05, uSeaP.w * uMisc.x);
    float sw = clamp((y / A + 1.0) * 0.5, 0.0, 1.0);
    // more returns off the crests and the faces turned to the lens: the swell reads in the density
    float face = clamp(-dot(n, normalize(vec3(xz.x, y - uEyeW.y, xz.y))) * 3.0, 0.0, 1.0);
    seaK = uSeaP.y * (0.35 + 0.9 * sw * sw + 0.35 * face);
    if (u01(hash1(hs ^ 0x2545f491u)) > seaK) { ${CULL} return; }
    float ca = uSeaP.z, cs = cos(ca), sn = sin(ca);
    vec2 wr = vec2(cs * w.x - sn * w.y, sn * w.x + cs * w.y);
    vec2 dd;
    float tex = exp(1.4 * (0.65 * vnoise(wr * vec2(0.00042, 0.0007) + 3.7, dd) + 0.35 * vnoise(wr * vec2(0.0011, 0.0019) + 9.1, dd)) - 0.25);
    float crest = fract(u01(hs) + uEyeW.w * 0.37);
    crest = crest < 0.5 ? crest * 2.0 : 2.0 - crest * 2.0;
    float slope = clamp(length(g) * 6.0, 0.0, 1.0);
    b = uSeaP.x * (0.34 + 0.5 * sw * sw + 0.18 * crest + 0.25 * slope) * mix(1.0, tex, 0.65);
    // surf: lines of foam walking in to the shore
    if (dsh < uSurf.x) {
      float k = 1.0 - dsh / uSurf.x;
      float wv = 0.5 + 0.5 * sin(dsh * 0.45 - uSurf.z * 1.3 + u01(hs) * 1.5);
      b = max(b, (0.25 + 0.6 * wv * wv) * k * uSurf.y);
    }
  }
  vec3 p = vec3(xz.x, y - uEyeW.y, xz.y);
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  gl_Position = c;
  float pxs = sEff * uCam.x / c.w;
  // keep the dots about as dense on screen at grazing angles as face-on (and as sparse as the films near the
  // lens): thin where they crowd, never the waterline
  float area = pxs * pxs * max(0.015, abs(dot(n, normalize(p))));
  if (big < 0.5) {
    float keep = clamp(area / uDot.w, 0.0, 1.0);
    if (u01(hash1(hs ^ 0x3c6ef372u)) > keep) { ${CULL} return; }
  }
  float eff = sqrt(max(area, uDot.w));
  if (eff > uDot.z) b *= uDot.z / eff;
  b *= depthFade(c.w) * vis * uFade.z;
  vec2 sc = scanAt(p);
  vec2 sw2 = sweepAt(p);
  col = mix(col, uScanC[0].rgb, 0.35 * sc.y);
  vec3 lit = lightsAt(p, n);
  vec3 rgb = col * b + lit * 0.9;
  float ke = max(sc.x, sw2.x);
  if (ke > 0.01) rgb = max(mix(rgb, LIME * max(b, 0.9), ke), rgb);
  rgb += WH * b * 0.55 * sw2.y;
  vCol = min(rgb, vec3(1.0));
  float dth = 0.75 + 0.5 * u01(hash1(hs ^ 0x85ebca6bu));
  float effS = eff * inversesqrt(max(0.05, seaK));      // the sea is thinned: its dots sit further apart
  float ps = effS > uDot.y * dth ? 3.0 : (effS > uDot.x * dth ? 2.0 : 1.0);
  if (seaK < 1.0) ps = effS > 7.5 * dth ? 2.0 : 1.0;
  if (big > 0.5 && c.w < 32000.0) ps = max(ps, 2.0);
  gl_PointSize = max(1.0, floor(ps * uCam.y + 0.5));
}
`;

const VS_SEABED = HEAD + FRAME + COMMON + LATTICE + SEA_GLSL + `
out vec3 vCol;
void main() {
  vec2 xz; float sEff, vis, tb; uint hs;
  if (!latticeDot(xz, sEff, vis, hs, tb)) { ${CULL} return; }
  vec2 w = xz + uEyeW.xz;
  float dout;
  float h = mapH(w, dout);
  if (h > -0.4 || h < -40.0 || u01(hash1(hs ^ 0x1b873593u)) > 0.55) { ${CULL} return; }
  vec4 N = mapN(w);
  vec3 n = normalize(vec3(-N.x, 1.0, -N.y));
  vec3 p = vec3(xz.x, h - uEyeW.y, xz.y);
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  gl_Position = c;
  float b = 0.3 * exp(h / 9.0) * (0.45 + 0.55 * max(0.0, dot(n, uSun.xyz)));
  float pxs = sEff * uCam.x / c.w;
  float area = pxs * pxs * max(0.015, abs(dot(n, normalize(p))));
  if (u01(hash1(hs ^ 0x3c6ef372u)) > clamp(area / uDot.w, 0.0, 1.0)) { ${CULL} return; }
  float eff = sqrt(max(area, uDot.w));
  if (eff > uDot.z) b *= uDot.z / eff;
  b *= depthFade(c.w) * vis * uFade.z;
  vCol = WH * b;
  gl_PointSize = max(1.0, floor((eff > 10.0 ? 2.0 : 1.0) * uCam.y + 0.5));
}
`;

/* the invisible occluder: a coarse mesh per block, below the drawn surface */
const VS_DEPTH = HEAD + FRAME + COMMON + `
layout(location = 0) in ivec3 aBlk;
uniform int uB;
uniform vec4 uLv[${MAXL}];
uniform sampler2D uHTex;
uniform sampler2D uMinTex;
uniform vec4 uMap;
uniform ivec2 uMapN;
uniform float uSeaY;        // > -1e5: clamp to the sea surface (second pass)
uniform int uMB;
uniform int uMinLv;
out float vLz;
float nodeH(ivec2 q) { q = clamp(q, ivec2(0), uMapN - 1); return texelFetch(uHTex, q, 0).r; }
float bil(vec2 f) {
  vec2 fc = clamp(f, vec2(0.0), vec2(uMapN - 1));
  ivec2 i0 = min(ivec2(floor(fc)), uMapN - 2);
  vec2 u = fc - vec2(i0);
  return mix(mix(nodeH(i0), nodeH(i0 + ivec2(1, 0)), u.x), mix(nodeH(i0 + ivec2(0, 1)), nodeH(i0 + ivec2(1, 1)), u.x), u.y);
}
void main() {
  int l = aBlk.x;
  int n1 = uMB + 1;
  int a = gl_VertexID % n1, bq = gl_VertexID / n1;
  int step = uB / uMB;
  vec4 L = uLv[l];
  float s = L.x, ms = s * float(step);
  vec2 q = L.yz + vec2(float(aBlk.y + a * step), float(aBlk.z + bq * step)) * s;
  vec2 w = q + uEyeW.xz;
  vec2 f = (w - uMap.xy) * uMap.z;
  vec2 mx = vec2(uMapN - 1);
  vec2 o = max(max(-f, f - mx), 0.0) * uMap.w;
  float dout = length(o);
  float h;
  if (ms * 4.0 <= uMap.w) h = bil(f) - 0.02 * ms;
  else {
    // lower envelope over the quads round this vertex, from the min pyramid
    float lod = clamp(ceil(log2((2.0 * ms + uMap.w) * uMap.z)), 0.0, float(uMinLv - 1));
    ivec2 sz = textureSize(uMinTex, int(lod));
    float sc = exp2(lod);
    vec2 lo = clamp((f - ms * uMap.z) / sc, vec2(0.0), vec2(sz - 1)), hi = clamp((f + ms * uMap.z + 1.0) / sc, vec2(0.0), vec2(sz - 1));
    ivec2 A = ivec2(lo), Bq = ivec2(hi);
    h = min(min(texelFetch(uMinTex, A, int(lod)).r, texelFetch(uMinTex, ivec2(Bq.x, A.y), int(lod)).r),
            min(texelFetch(uMinTex, ivec2(A.x, Bq.y), int(lod)).r, texelFetch(uMinTex, Bq, int(lod)).r));
  }
  if (dout > 0.0) h = mix(h, -80.0, smoothstep(0.0, 12000.0, dout));
  h -= ${(DET.a1 + DET.a2 + .25).toFixed(2)};
  if (uSeaY > -1e5) h = max(h, uSeaY);
  vec3 p = vec3(q.x, h - uEyeW.y, q.y);
  p.y -= curveDrop(p);
  vec4 c = uVP * vec4(p, 1.0);
  vLz = 1.0 + c.w * 1.0015;
  c.z = (log2(max(1e-6, vLz)) * uCam.z - 1.0) * c.w;
  gl_Position = c;
}
`;
const FS_DEPTH = HEAD + FRAME + `
in float vLz;
out vec4 o;
void main() { gl_FragDepth = log2(max(1e-6, vLz)) * uCam.z * 0.5; o = vec4(0.0); }
`;

/* sky: stars and a faint band of returns low over the horizon, at infinity */
const VS_SKY = HEAD + FRAME + COMMON + `
layout(location = 0) in vec4 aDir;     // xyz direction, w brightness
layout(location = 1) in float aPh;
out vec3 vCol;
uniform float uSkyK;
void main() {
  vec4 c = uVP * vec4(aDir.xyz * 1.0e7, 1.0);
  if (c.w <= 0.0) { ${CULL} return; }
  c.z = c.w * 0.999999;
  gl_Position = c;
  float tw = 0.8 + 0.2 * sin(uEyeW.w * 1.3 + aPh);
  vCol = vec3(0.88, 0.9, 0.87) * aDir.w * tw * uSkyK * uFade.z;
  gl_PointSize = max(1.0, floor(uCam.y + 0.5));
}
`;

export class Terrain {
  constructor(G, map, opts) {
    opts = opts || {};
    this.G = G; this.gl = G.gl; this.map = map;
    this.N = opts.grid || 640;                 // dots per level side (multiple of 64)
    this.densNear = opts.densNear || 140;      // lens height / finest spacing, near the ground ...
    this.densFar = opts.densFar || 380;        // ... and from high up
    this.jitter = opts.jitter || .7;           // of the spacing (the films' survey: +-0.35)
    this.relief = opts.relief || 0;            // normal exaggeration for the shading (heights stay true); 0 = from the map's slopes
    this.areaNear = opts.areaNear || 20;       // min screen px^2 per dot (thins the crowd at grazing angles)
    this.areaFar = opts.areaFar || 11;
    this.dotPx = opts.dotPx || [6, 14, 16];  // 2 px / 3 px thresholds, dimming above (on-screen spacing, 1080-px)
    this.seaKeep = opts.seaKeep !== undefined ? opts.seaKeep : .3;
    this.stats = { blocks: 0, levels: 0, s0: 0, dots: 0 };
    this._prepData();
    this._prepGL();
  }

  /* ---------- data ---------- */
  _prepData() {
    const m = this.map, cols = m.cols, rows = m.rows, H = m.heights, cell = m.cell;
    this.cols = cols; this.rows = rows; this.cell = cell;
    this.x0 = -m.W / 2; this.z0 = -m.H / 2;
    // gradient + ridge (for shading and the waterline distance)
    const NT = new Float32Array(cols * rows * 4);
    const at = (i, j) => H[Math.min(rows - 1, Math.max(0, j)) * cols + Math.min(cols - 1, Math.max(0, i))];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const h = at(i, j), gx = (at(i + 1, j) - at(i - 1, j)) / (2 * cell), gz = (at(i, j + 1) - at(i, j - 1)) / (2 * cell);
      const lap = (at(i + 1, j) + at(i - 1, j) + at(i, j + 1) + at(i, j - 1) - 4 * h) / (cell * cell);
      const o = (j * cols + i) * 4;
      NT[o] = gx; NT[o + 1] = gz; NT[o + 2] = -lap * 900; NT[o + 3] = 0;
    }
    this.NT = NT;
    // shading exaggeration from the land's 90th-percentile slope, so gentle coasts still read as relief
    if (!this.relief) {
      const sl = [];
      for (let k = 0; k < H.length; k += 7) if (H[k] > 2) sl.push(Math.hypot(NT[k * 4], NT[k * 4 + 1]));
      sl.sort((a, b) => a - b);
      const s90 = sl.length ? sl[Math.floor(sl.length * .9)] : .1;
      this.relief = Math.max(1.5, Math.min(9, .2 / Math.max(1e-3, s90)));
    }
    // min / max pyramids (culling, occluder envelope)
    const mins = [H], maxs = [H], dims = [[cols, rows]];
    let w = cols, h = rows, mn = H, mxA = H;
    while (w > 1 || h > 1) {
      const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1);
      const a = new Float32Array(w2 * h2), b = new Float32Array(w2 * h2);
      for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++) {
        const i0 = i * 2, i1 = i === w2 - 1 ? w - 1 : i * 2 + 1, j0 = j * 2, j1 = j === h2 - 1 ? h - 1 : j * 2 + 1;
        let lo = 1e9, hi = -1e9;
        for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) { const v = mn[jj * w + ii], V = mxA[jj * w + ii]; if (v < lo) lo = v; if (V > hi) hi = V; }
        a[j * w2 + i] = lo; b[j * w2 + i] = hi;
      }
      mins.push(a); maxs.push(b); dims.push([w2, h2]);
      mn = a; mxA = b; w = w2; h = h2;
    }
    this.pyr = { mins, maxs, dims };
    this.hMax = maxs[maxs.length - 1][0]; this.hMin = mins[mins.length - 1][0];
  }
  _prepGL() {
    const gl = this.gl, m = this.map;
    this.hTex = floatTex(gl, this.cols, this.rows, m.heights, false);
    // RGBA16F gradient texture (filterable)
    this.nTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.nTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.cols, this.rows, 0, gl.RGBA, gl.FLOAT, this.NT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // min pyramid as a mip chain (level 0 = the node grid)
    this.minTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.minTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const P = this.pyr;
    gl.texStorage2D(gl.TEXTURE_2D, P.mins.length, gl.R32F, P.dims[0][0], P.dims[0][1]);
    for (let k = 0; k < P.mins.length; k++) {
      // texStorage mip sizes are floor(w / 2^k): the pyramid above uses the same rule
      const [w, h] = P.dims[k];
      gl.texSubImage2D(gl.TEXTURE_2D, k, 0, 0, w, h, gl.RED, gl.FLOAT, P.mins[k]);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.pSurf = program(gl, VS_SURF, FS_POINT, 'terrain.surface');
    this.pBed = program(gl, VS_SEABED, FS_POINT, 'terrain.seabed');
    this.pDepth = program(gl, VS_DEPTH, FS_DEPTH, 'terrain.depth');
    this.pSky = program(gl, VS_SKY, FS_POINT, 'terrain.sky');

    // instance buffer: (level, i0, j0) as int16
    this.maxInst = 8192;
    this.inst = new Int16Array(this.maxInst * 3);
    this.instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribIPointer(0, 3, gl.SHORT, 6, 0);
    gl.vertexAttribDivisor(0, 1);
    // depth mesh index buffer (MB x MB quads)
    const idx = [], n1 = MB + 1;
    for (let b = 0; b < MB; b++) for (let a = 0; a < MB; a++) { const v = b * n1 + a; idx.push(v, v + 1, v + n1, v + 1, v + n1 + 1, v + n1); }
    this.meshIdx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.meshIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    this.meshN = idx.length;
    gl.bindVertexArray(null);

    // sky
    const S = [], rs = mulberry(303);
    for (let i = 0; i < 2600; i++) {              // stars
      const u = rs(), az = rs() * Math.PI * 2, el = Math.asin(Math.pow(u, 1.4)) * .98 + .01, mg = Math.pow(rs(), 3.2);
      S.push(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az), .1 + .62 * mg, rs() * 6.28);
    }
    for (let i = 0; i < 9000; i++) {              // the band of returns low over the horizon
      const az = rs() * Math.PI * 2, el = Math.pow(rs(), 2.4) * 14 * Math.PI / 180;
      const b = (.1 + .38 * Math.exp(-el / (3 * Math.PI / 180))) * (.7 + .3 * rs());
      S.push(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az), b, rs() * 6.28);
    }
    this.nSky = S.length / 5;
    this.skyVao = gl.createVertexArray();
    gl.bindVertexArray(this.skyVao);
    const sb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(S), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16);
    gl.bindVertexArray(null);

    // per-level uniform arrays
    this.uLv = new Float32Array(MAXL * 4);
    this.uLvI = new Int32Array(MAXL * 4);
    this.uHole = new Int32Array(MAXL * 4);
    this.uWave = new Float32Array(16);
    this.setWeather(this.map.weather || {});
  }

  /* sea state from the map's weather: swell components round the wind direction */
  setWeather(w) {
    const wind = w.wind || [3, -2], ang = Math.atan2(wind[0], wind[1]), sea = w.sea !== undefined ? w.sea : .3;
    this.seaAmp = .45 + 1.7 * sea;
    this.windAng = ang;
    const comps = [[144, .85, 0], [96, .45, .55], [58, .25, -.7], [31, .12, 1.2]];
    this.waves = comps.map(([L, A, da], k) => { const kk = 2 * Math.PI / L, a = ang + da; return { kx: Math.sin(a) * kk, kz: Math.cos(a) * kk, A, w: Math.sqrt(9.81 * kk), ph: k * 1.7 + .3 }; });
    this.waveA = comps.reduce((s, c) => s + c[1], 0);
  }

  /* ---------- JS mirrors (what is drawn) ---------- */
  mapH(x, z) {
    const cols = this.cols, rows = this.rows, H = this.map.heights, inv = 1 / this.cell;
    const fx = (x - this.x0) * inv, fz = (z - this.z0) * inv;
    let cx = fx < 0 ? 0 : fx > cols - 1 ? cols - 1 : fx, cz = fz < 0 ? 0 : fz > rows - 1 ? rows - 1 : fz;
    let i = Math.min(cols - 2, cx | 0), j = Math.min(rows - 2, cz | 0);
    const u = cx - i, v = cz - j, o = j * cols + i;
    let h = (H[o] + (H[o + 1] - H[o]) * u) * (1 - v) + (H[o + cols] + (H[o + cols + 1] - H[o + cols]) * u) * v;
    const ox = Math.max(-fx, fx - (cols - 1), 0) * this.cell, oz = Math.max(-fz, fz - (rows - 1), 0) * this.cell;
    const dout = Math.hypot(ox, oz);
    if (dout > 0) h += (-80 - h) * ss(0, 12000, dout);
    return h;
  }
  detail(x, z, h, g) {
    const k = ss(DET.h0, DET.h1, h);
    if (g) { g[0] = 0; g[1] = 0; }
    if (k <= 0) return 0;
    const d1 = [0, 0], d2 = [0, 0];
    const n1 = vnoise(x / DET.l1, z / DET.l1, d1), n2 = vnoise(x / DET.l2 + 17.3, z / DET.l2 + 17.3, d2);
    if (g) { g[0] = k * (DET.a1 * d1[0] / DET.l1 + DET.a2 * d2[0] / DET.l2); g[1] = k * (DET.a1 * d1[1] / DET.l1 + DET.a2 * d2[1] / DET.l2); }
    return k * (DET.a1 * n1 + DET.a2 * n2);
  }
  /* the drawn ground height: land with its relief, the mean sea surface (0) over water */
  heightAt(x, z) { const h = this.mapH(x, z); return h > 0 ? h + this.detail(x, z, h) : 0; }
  /* the ground under water too (seabed) */
  groundAt(x, z) { const h = this.mapH(x, z); return h > 0 ? h + this.detail(x, z, h) : h; }
  /* surface normal of the drawn ground ([0,1,0] at sea) */
  normalAt(x, z) {
    const h = this.mapH(x, z); if (h <= 0) return [0, 1, 0];
    const e = 2, g = [0, 0];
    const gx = (this.mapH(x + e, z) - this.mapH(x - e, z)) / (2 * e), gz = (this.mapH(x, z + e) - this.mapH(x, z - e)) / (2 * e);
    this.detail(x, z, h, g);
    const nx = -(gx + g[0]), nz = -(gz + g[1]), l = Math.hypot(nx, 1, nz);
    return [nx / l, 1 / l, nz / l];
  }
  /* swell height and slope at world xz, time t (for ships to ride it) */
  seaAt(x, z, t) {
    let y = 0, gx = 0, gz = 0;
    for (const w of this.waves) { const a = w.kx * x + w.kz * z - w.w * t + w.ph; y += w.A * Math.sin(a); gx += w.A * w.kx * Math.cos(a); gz += w.A * w.kz * Math.cos(a); }
    const s = this.seaAmp;
    return { y: y * s, gx: gx * s, gz: gz * s };
  }
  /* min / max map height over a world rectangle (from the pyramid) */
  rangeOver(x0, z0, x1, z1) {
    const P = this.pyr, inv = 1 / this.cell;
    let fx0 = (x0 - this.x0) * inv, fx1 = (x1 - this.x0) * inv, fz0 = (z0 - this.z0) * inv, fz1 = (z1 - this.z0) * inv;
    const outside = fx1 < 0 || fz1 < 0 || fx0 > this.cols - 1 || fz0 > this.rows - 1;
    fx0 = Math.max(0, Math.min(this.cols - 1, fx0)); fx1 = Math.max(0, Math.min(this.cols - 1, fx1));
    fz0 = Math.max(0, Math.min(this.rows - 1, fz0)); fz1 = Math.max(0, Math.min(this.rows - 1, fz1));
    const span = Math.max(fx1 - fx0, fz1 - fz0, 1);
    let k = Math.min(P.mins.length - 1, Math.max(0, Math.ceil(Math.log2(span))));
    const [w, h] = P.dims[k], sc = 1 << k;
    const a0 = Math.min(w - 1, Math.floor(fx0 / sc)), a1 = Math.min(w - 1, Math.floor(fx1 / sc)), b0 = Math.min(h - 1, Math.floor(fz0 / sc)), b1 = Math.min(h - 1, Math.floor(fz1 / sc));
    let lo = 1e9, hi = -1e9;
    const mn = P.mins[k], mx = P.maxs[k];
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) { const q = b * w + a; if (mn[q] < lo) lo = mn[q]; if (mx[q] > hi) hi = mx[q]; }
    if (outside) { lo = Math.min(lo, -80); }
    return [lo, hi];
  }

  /* ---------- per frame: lattice levels and the visible blocks ---------- */
  prepare(cam, t) {
    const eye = cam.eye, N = this.N;
    const gnd = Math.max(0, this.heightAt(eye[0], eye[2]));
    const Hc = Math.max(.6, eye[1] - gnd);
    { const k = ss(Math.log(250), Math.log(40000), Math.log(Hc)); this.altK = k; this.area = Math.exp(Math.log(this.areaNear) + (Math.log(this.areaFar) - Math.log(this.areaNear)) * k); }
    const kA = ss(Math.log(250), Math.log(40000), Math.log(Hc));
    const s0f = Math.max(1 / 64, Hc / Math.exp(Math.log(this.densNear) + (Math.log(this.densFar) - Math.log(this.densNear)) * kA));
    const e = Math.log2(s0f), e0 = Math.floor(e), frac = e - e0, s0 = Math.pow(2, e0);
    const horizon = Math.sqrt(2 * R_EARTH * Math.max(1, eye[1]));
    const rMax = Math.min(3.2e6, Math.max(horizon * 1.08 + 15000, 70000, cam.dist * 4));
    let L = 1; while (L < MAXL && s0 * Math.pow(2, L - 1) * N / 2 < rMax) L++;
    this.L = L; this.s0 = s0; this.frac = frac;
    const uLv = this.uLv, uLvI = this.uLvI, uHole = this.uHole;
    const cs = [];
    for (let l = 0; l < L; l++) {
      const s = s0 * Math.pow(2, l);
      const cI = 2 * Math.round(eye[0] / (2 * s)), cJ = 2 * Math.round(eye[2] / (2 * s));
      cs.push([cI, cJ]);
      uLv[l * 4] = s; uLv[l * 4 + 1] = cI * s - eye[0]; uLv[l * 4 + 2] = cJ * s - eye[2]; uLv[l * 4 + 3] = l === 0 ? frac : 0;
      uLvI[l * 4] = cI; uLvI[l * 4 + 1] = cJ; uLvI[l * 4 + 2] = Math.round(Math.log2(s)) + BASE_SHIFT; uLvI[l * 4 + 3] = l === L - 1 ? 1 : 0;
      if (l === 0) { uHole[0] = 0; uHole[1] = 0; uHole[2] = 0; uHole[3] = 0; }
      else {
        const [pI, pJ] = cs[l - 1];
        uHole[l * 4] = pI / 2 - cI - N / 4; uHole[l * 4 + 1] = pI / 2 - cI + N / 4;
        uHole[l * 4 + 2] = pJ / 2 - cJ - N / 4; uHole[l * 4 + 3] = pJ / 2 - cJ + N / 4;
      }
    }
    // frustum planes (RTE): n.p + d >= 0 inside
    const f = cam.f, r = cam.r, u = cam.u, tx = (cam.W / 2) / cam.fl * 1.04, ty = (cam.H / 2) / cam.fl * 1.04;
    const planes = [
      [f[0], f[1], f[2], -cam.near],
      [r[0] + f[0] * tx, r[1] + f[1] * tx, r[2] + f[2] * tx, 0],
      [-r[0] + f[0] * tx, -r[1] + f[1] * tx, -r[2] + f[2] * tx, 0],
      [u[0] + f[0] * ty, u[1] + f[1] * ty, u[2] + f[2] * ty, 0],
      [-u[0] + f[0] * ty, -u[1] + f[1] * ty, -u[2] + f[2] * ty, 0],
    ];
    const inst = this.inst, nb = N / B, seaTop = this.seaAmp * this.waveA + 1;
    let n = 0;
    for (let l = 0; l < L && n < this.maxInst; l++) {
      const s = uLv[l * 4], ox = uLv[l * 4 + 1], oz = uLv[l * 4 + 2];
      const hb = [uHole[l * 4], uHole[l * 4 + 1], uHole[l * 4 + 2], uHole[l * 4 + 3]];
      for (let bj = 0; bj < nb; bj++) for (let bi = 0; bi < nb; bi++) {
        const i0 = -N / 2 + bi * B, j0 = -N / 2 + bj * B;
        if (l > 0 && i0 >= hb[0] && i0 + B <= hb[1] && j0 >= hb[2] && j0 + B <= hb[3]) continue;
        const x0 = ox + (i0 - 1) * s, x1 = ox + (i0 + B) * s, z0 = oz + (j0 - 1) * s, z1 = oz + (j0 + B) * s;
        const [lo, hi] = this.rangeOver(x0 + eye[0], z0 + eye[2], x1 + eye[0], z1 + eye[2]);
        // horizontal distance range to the eye (for the curvature drop)
        const nx = x0 > 0 ? x0 : x1 < 0 ? -x1 : 0, nz = z0 > 0 ? z0 : z1 < 0 ? -z1 : 0;
        const fx = Math.max(Math.abs(x0), Math.abs(x1)), fz = Math.max(Math.abs(z0), Math.abs(z1));
        const dMin = (nx * nx + nz * nz) / (2 * R_EARTH), dMax = (fx * fx + fz * fz) / (2 * R_EARTH);
        const y0 = Math.min(lo, -40) - 2 - eye[1] - dMax, y1 = Math.max(hi + 3, seaTop) - eye[1] - dMin;
        let vis = true;
        for (const P of planes) {
          const px = P[0] > 0 ? x1 : x0, py = P[1] > 0 ? y1 : y0, pz = P[2] > 0 ? z1 : z0;
          if (P[0] * px + P[1] * py + P[2] * pz + P[3] < 0) { vis = false; break; }
        }
        if (!vis) continue;
        inst[n * 3] = l; inst[n * 3 + 1] = i0; inst[n * 3 + 2] = j0; n++;
        if (n >= this.maxInst) break;
      }
    }
    this.nInst = n;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst, 0, n * 3);
    // swell phases relative to the eye (exact in doubles)
    const W = this.uWave;
    this.waves.forEach((w, k) => {
      let ph = (w.kx * eye[0] + w.kz * eye[2] - w.w * t + w.ph) % (2 * Math.PI);
      W[k * 4] = w.kx; W[k * 4 + 1] = w.kz; W[k * 4 + 2] = w.A; W[k * 4 + 3] = ph;
    });
    this.t = t;
    // contour interval grows with the view
    this.contour = cam.dist < 3000 ? 10 : cam.dist < 15000 ? 25 : cam.dist < 60000 ? 50 : 100;
    Object.assign(this.stats, { blocks: n, levels: L, s0, frac: +frac.toFixed(2), dots: n * B * B });
  }

  _bindCommon(P) {
    const gl = this.gl, u = P.u;
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.hTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.nTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.minTex);
    if (u.uHTex) gl.uniform1i(u.uHTex, 0);
    if (u.uNTex) gl.uniform1i(u.uNTex, 1);
    if (u.uMinTex) gl.uniform1i(u.uMinTex, 2);
    if (u.uG) gl.uniform1i(u.uG, this.N);
    if (u.uB) gl.uniform1i(u.uB, B);
    if (u.uMB) gl.uniform1i(u.uMB, MB);
    if (u.uMinLv) gl.uniform1i(u.uMinLv, this.pyr.mins.length);
    if (u.uBand) gl.uniform1f(u.uBand, this.N / 8);
    if (u.uJit) gl.uniform1f(u.uJit, this.jitter);
    if (u.uRelief) gl.uniform1f(u.uRelief, this.relief);
    if (u.uDot) gl.uniform4f(u.uDot, this.dotPx[0], this.dotPx[1], this.dotPx[2], this.area);
    if (u.uLv) gl.uniform4fv(u.uLv, this.uLv);
    if (u.uLvI) gl.uniform4iv(u.uLvI, this.uLvI);
    if (u.uHole) gl.uniform4iv(u.uHole, this.uHole);
    if (u.uMap) gl.uniform4f(u.uMap, this.x0, this.z0, 1 / this.cell, this.cell);
    if (u.uMapN) gl.uniform2i(u.uMapN, this.cols, this.rows);
    if (u.uWave) gl.uniform4fv(u.uWave, this.uWave);
    gl.bindVertexArray(this.vao);
  }
  /* depth-only occluder: pass 0 land envelope (with the seabed), pass 1 clamped up to the sea surface */
  drawDepth(pass) {
    const gl = this.gl, P = this.pDepth;
    this._bindCommon(P);
    gl.uniform1f(P.u.uSeaY, pass ? -(this.seaAmp * this.waveA * 1.05 + .35) : -1e6);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.meshIdx);
    gl.drawElementsInstanced(gl.TRIANGLES, this.meshN, gl.UNSIGNED_SHORT, 0, this.nInst);
  }
  drawSeabed() {
    const gl = this.gl, P = this.pBed;
    this._bindCommon(P);
    gl.uniform1ui(P.u.uSalt, 0xa511e9b3);
    gl.drawArraysInstanced(gl.POINTS, 0, B * B, this.nInst);
  }
  drawSurface(o) {
    const gl = this.gl, P = this.pSurf, u = P.u;
    o = o || {};
    this._bindCommon(P);
    gl.uniform1ui(u.uSalt, 0);
    const k = this.altK || 0;
    gl.uniform4f(u.uSeaP, (o.seaBright || .75) * (1 + .3 * k), this.seaKeep, this.windAng, this.waveA);
    gl.uniform4f(u.uSurf, 70, 1.0, this.t, this.contour);
    gl.uniform4f(u.uLand, (o.landBright || 1.15) * (.85 + .75 * k), .16, 1, .45);
    gl.drawArraysInstanced(gl.POINTS, 0, B * B, this.nInst);
  }
  drawSky(k) {
    const gl = this.gl, P = this.pSky;
    gl.useProgram(P.p);
    gl.uniform1f(P.u.uSkyK, k === undefined ? 1 : k);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.POINTS, 0, this.nSky);
  }
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
