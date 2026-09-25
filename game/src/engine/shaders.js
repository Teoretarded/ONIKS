/* GLSL shared by every point program: the per-frame uniform block, log depth, hashes, the film dot rules
   (size from on-screen sample spacing, depth fade), dynamic lights, the lime scan fronts and the radar sweep.

   Coordinates on the GPU are relative to the eye (RTE): p_rte = p_world - eye, computed in doubles on the CPU,
   so a 150 km map keeps centimetre precision. Earth curvature: y_rte -= (x_rte^2 + z_rte^2) / 2R. */

export const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

export const FRAME = `
layout(std140) uniform Frame {
  mat4 uVP;        // RTE -> clip (w = camera depth)
  vec4 uEyeW;      // eye world xyz (float), w: time (s)
  vec4 uCam;       // x: focal length in 1080-px units, y: px scale (canvas H / 1080), z: log-depth Fc, w: near
  vec4 uCamF;      // xyz: camera forward, w: focal length in real px
  vec4 uSun;       // xyz: key light direction (toward the light), w: curvature 1 / 2R
  vec4 uFade;      // x: fade distance (m), y: far floor, z: global brightness, w: light count
  vec4 uScanA[2];  // plane: xyz unit normal; sphere: xyz centre (RTE). w: mode 0 off, 1 plane, 2 sphere
  vec4 uScanB[2];  // x: front (plane: n.p_rte of the front; sphere: radius), y: front width, z: afterglow length, w: amplitude
  vec4 uScanC[2];  // rgb: colour (0..1), w: reveal tint behind the front (0..1)
  vec4 uLP[16];    // xyz: light position (RTE), w: radius (m)
  vec4 uLC[16];    // rgb: colour x intensity
  vec4 uSweep;     // radar sweep: x, z origin (RTE), z: beam bearing (rad, clockwise from north), w: amplitude
  vec4 uSweep2;    // x: afterglow (rad), y: range (m), z: edge width (rad), w: unused
  vec4 uMisc;      // x: sea amplitude scale, y: unused, z: model brightness, w: model fade distance (m)
};
`;

export const COMMON = `
const vec3 WH = vec3(0.933, 0.933, 0.894);
const vec3 LIME = vec3(0.776, 0.957, 0.196);
const vec3 CORAL = vec3(1.0, 0.416, 0.239);

uint hash2(uint x, uint y) {
  uint h = (x * 0x9E3779B1u) ^ (y * 0x85EBCA77u + 0x7f4a7c15u);
  h ^= h >> 15; h *= 0x2C1B3C6Du; h ^= h >> 12; h *= 0x297A2D39u; h ^= h >> 15;
  return h;
}
uint uo(int v) { return uint(v + 0x40000000); }
uint hash1(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float u01(uint h) { return float(h >> 8) * (1.0 / 16777216.0); }

/* clip position with logarithmic depth (exact per point; triangles write gl_FragDepth) */
vec4 toClip(vec3 p) {
  vec4 c = uVP * vec4(p, 1.0);
  c.z = (log2(max(1e-6, 1.0 + c.w)) * uCam.z - 1.0) * c.w;
  return c;
}
float curveDrop(vec3 p) { return (p.x * p.x + p.z * p.z) * uSun.w; }

/* the films' dot size from on-screen sample spacing (1080-px units) */
float dotPx(float pxs) {
  float s = pxs > 7.5 ? 3.0 : (pxs > 3.6 ? 2.0 : 1.0);
  return max(1.0, floor(s * uCam.y + 0.5));
}
/* depth fade: near full, down to the far floor at the fade distance */
float depthFade(float z) {
  float k = clamp(z / uFade.x, 0.0, 1.0);
  return mix(1.0, uFade.y, k);
}
/* dynamic lights: brightness added (rgb), smooth (1 - d^2/r^2)^2, facing-aware when n != 0 */
vec3 lightsAt(vec3 p, vec3 n) {
  vec3 acc = vec3(0.0);
  int nl = int(uFade.w);
  for (int i = 0; i < 16; i++) {
    if (i >= nl) break;
    vec3 d = uLP[i].xyz - p;
    float r = uLP[i].w, q = dot(d, d) / (r * r);
    if (q >= 1.0) continue;
    float w = (1.0 - q); w *= w;
    float f = 1.0;
    if (dot(n, n) > 0.0) f = 0.35 + 0.65 * max(0.0, dot(n, d) * inversesqrt(max(1e-6, dot(d, d))));
    acc += uLC[i].rgb * (w * f);
  }
  return acc;
}
/* the lime scan fronts: returns (k, reveal) where k = flash at the front and its afterglow */
vec2 scanAt(vec3 p) {
  float k = 0.0, rv = 0.0;
  for (int i = 0; i < 2; i++) {
    float m = uScanA[i].w;
    if (m < 0.5) continue;
    float s = m < 1.5 ? dot(uScanA[i].xyz, p) : length(p - uScanA[i].xyz);
    float d = uScanB[i].x - s;           // > 0: the front has passed this point
    float w = max(1e-3, uScanB[i].y), g = max(1e-3, uScanB[i].z);
    float kk = 0.0;
    if (d > -w * 0.25 && d < w) kk = d < 0.0 ? 1.0 + d / (w * 0.25) : 1.0;
    else if (d >= w) kk = exp(-(d - w) / g) * 0.85;
    k = max(k, kk * uScanB[i].w);
    if (d > 0.0) rv = max(rv, uScanC[i].w);
  }
  return vec2(k, rv);
}
vec3 scanColor() { return uScanA[0].w > 0.5 ? uScanC[0].rgb : uScanC[1].rgb; }
/* the radar sweep painting the world: a thin edge, then the afterglow of the paint */
vec2 sweepAt(vec3 p) {
  if (uSweep.w <= 0.0) return vec2(0.0);
  vec2 d = p.xz - uSweep.xy;
  float r = length(d);
  if (r > uSweep2.y) return vec2(0.0);
  float b = atan(d.x, d.y);
  float db = uSweep.z - b; db -= floor(db / 6.2831853) * 6.2831853;
  float edge = db < uSweep2.z * 4.5 ? exp(-db / uSweep2.z) : 0.0;
  float ag = 1.0 / (1.0 + db * (0.9 + db * (0.4 + db * 0.15)) * (1.0 / max(0.05, uSweep2.x)));
  return vec2(edge, ag) * uSweep.w;
}
`;

/* points (max / add / over passes): one colour per point, crisp square */
export const FS_POINT = HEAD + `
in vec3 vCol;
out vec4 o;
void main() { o = vec4(vCol, 1.0); }
`;

export const CULL = 'gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0;';
