/* Ground detail · shared GLSL and the uniforms both passes read from the terrain (game/ground.js).

   The ground's dots must sit exactly on the terrain's returns and be lit like them, so this mirrors the terrain's
   shader (engine/terrain.js): the map height and its metre relief (mapH, detail: same hashes, same constants), the
   world dimming round the units on screen (subjDim), the haze, the depth fade, the lime scan fronts, the radar
   sweep and the dynamic lights (COMMON). Keep DET in step with engine/terrain.js. */
import { HEAD, FRAME, COMMON, CULL } from '../../engine/shaders.js';

export { HEAD, FRAME, COMMON, CULL };
export const NSUB = 12;
const DET = { a1: .7, l1: 47, a2: .16, l2: 9.3, h0: 1.5, h1: 14 };

export const GROUND_GLSL = `
uniform sampler2D uHTex;        // unit 0: the terrain's heights (R32F, node grid, row 0 = south)
uniform sampler2D uNTex;        // unit 1: the terrain's gradient: dh/dx, dh/dz, ridge, height (mip-mapped)
uniform vec4 uMap;              // world x0, z0, 1/cell, cell
uniform ivec2 uMapN;            // cols, rows
uniform vec4 uSubA[${NSUB}];    // subjects (the units on screen): xyz centre (RTE), w: halo radius (m)
uniform vec4 uSubB[${NSUB}];    // x, y: screen centre (1080 px from the centre), z: screen radius, w: depth
uniform vec4 uSubP;             // x: count, y: dimming at a subject, z: aspect, w: backdrop dimming
uniform vec4 uLit;              // xyz: the land's light (the view's, blended with the moon), w: unused
uniform vec4 uLook;             // x: brightness scale (the land's, grows from high up), y: haze distance (0 none),
                                // z: haze floor, w: night 0..1 (lit windows)
uniform vec4 uNeed;             // x: tree need constant, y: grazing floor, z: px^2 per crown dot, w: focal length (1080 px)

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
  return textureLod(uNTex, (f + 0.5) / vec2(uMapN), 0.0);
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
float vn(vec2 p) { vec2 d; return vnoise(p, d); }
float detail(vec2 w, float h) {
  float k = smoothstep(${DET.h0.toFixed(2)}, ${DET.h1.toFixed(2)}, h);
  if (k <= 0.0) return 0.0;
  vec2 d1, d2;
  float n1 = vnoise(w / ${DET.l1.toFixed(2)}, d1), n2 = vnoise(w / ${DET.l2.toFixed(2)} + 17.3, d2);
  return k * (${DET.a1.toFixed(3)} * n1 + ${DET.a2.toFixed(3)} * n2);
}
/* the drawn ground (Terrain.heightAt): land with its metre relief, 0 over water */
float groundY(vec2 w, out float h) {
  float dout;
  h = mapH(w, dout);
  return h > 0.0 ? h + detail(w, h) : 0.0;
}
/* radical inverse, base 2 and 3: any prefix of the sequence is spread evenly */
float vdc(uint k) {
  k = (k << 16u) | (k >> 16u);
  k = ((k & 0x55555555u) << 1u) | ((k & 0xAAAAAAAAu) >> 1u);
  k = ((k & 0x33333333u) << 2u) | ((k & 0xCCCCCCCCu) >> 2u);
  k = ((k & 0x0F0F0F0Fu) << 4u) | ((k & 0xF0F0F0F0u) >> 4u);
  k = ((k & 0x00FF00FFu) << 8u) | ((k & 0xFF00FF00u) >> 8u);
  return float(k) * 2.3283064e-10;
}
float vdc3(uint k) {
  float f = 1.0 / 3.0, r = 0.0;
  for (int i = 0; i < 8; i++) { if (k == 0u) break; r += f * float(k % 3u); k /= 3u; f /= 3.0; }
  return r;
}
int ctz(int v) {
  if (v == 0) return 15;
  uint u = uint(v);
  u &= (~u + 1u);
  return min(15, int(log2(float(u)) + 0.5));
}
/* the world dims round the units on screen (terrain.js subjDim) */
float subjDim(vec3 p, vec4 c) {
  int n = int(uSubP.x);
  if (n == 0) return 1.0;
  vec2 sp = c.xy / c.w * vec2(540.0 * uSubP.z, 540.0);
  float k = 1.0;
  for (int i = 0; i < ${NSUB}; i++) {
    if (i >= n) break;
    vec4 A = uSubA[i], Bq = uSubB[i];
    vec3 d = p - A.xyz;
    float q = sqrt(dot(d, d)) / A.w;
    float w = 1.0 - smoothstep(0.15, 1.0, q);
    if (c.w > Bq.w - A.w) {
      float ds = length(sp - Bq.xy) / Bq.z;
      w = max(w * uSubP.y, (1.0 - smoothstep(0.5, 1.7, ds)) * uSubP.w);
    } else w *= uSubP.y;
    w *= (1.0 - smoothstep(260.0, 700.0, Bq.z)) * smoothstep(1.1, 2.4, length(A.xyz) / A.w);
    k = min(k, 1.0 - clamp(w, 0.0, 1.0));
  }
  return k;
}
/* the terrain's finish: depth fade, haze, the units' pools, scan fronts, sweep, lights. b: brightness (already
   times the dot's alpha), n: normal for the lights (0: none), base: the colour */
vec3 finish(vec3 p, vec4 c, float b, vec3 n, vec3 base) {
  b *= depthFade(c.w) * uFade.z;
  if (uLook.y > 0.0) b *= mix(uLook.z, 1.0, exp(-c.w / uLook.y));
  b *= subjDim(p, c);
  vec2 sc = scanAt(p);
  vec2 sw2 = sweepAt(p);
  vec3 col = mix(base, uScanC[0].rgb, 0.35 * sc.y);
  vec3 lit = lightsAt(p, n);
  vec3 rgb = col * min(b, 1.0) + lit * 0.9 * min(1.0, b * 3.0);
  float ke = max(sc.x, sw2.x);
  if (ke > 0.01) rgb = max(mix(rgb, LIME * max(b, 0.9), ke), rgb);
  rgb += WH * b * 0.55 * sw2.y;
  return min(rgb, vec3(1.0));
}
`;

/* the shared uniforms, from the terrain and the renderer (units 0, 1: the terrain's textures) */
export function bindGround(gl, P, T, o) {
  const u = P.u;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.hTex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.nTex);
  if (u.uHTex) gl.uniform1i(u.uHTex, 0);
  if (u.uNTex) gl.uniform1i(u.uNTex, 1);
  if (u.uMap) gl.uniform4f(u.uMap, T.x0, T.z0, 1 / T.cell, T.cell);
  if (u.uMapN) gl.uniform2i(u.uMapN, T.cols, T.rows);
  if (u.uSubA) gl.uniform4fv(u.uSubA, T.subA);
  if (u.uSubB) gl.uniform4fv(u.uSubB, T.subB);
  if (u.uSubP) gl.uniform4f(u.uSubP, T.nSub, T.subjectDim, T.G.W / Math.max(1, T.G.H), T.subjectBack);
  if (u.uLit) gl.uniform4f(u.uLit, o.lit[0], o.lit[1], o.lit[2], 0);
  if (u.uLook) gl.uniform4f(u.uLook, o.bright, T.hazeEff || 0, T.hazeFloor, o.night);
  if (u.uNeed) gl.uniform4f(u.uNeed, o.need[0], o.need[1], o.need[2], o.need[3]);
}
