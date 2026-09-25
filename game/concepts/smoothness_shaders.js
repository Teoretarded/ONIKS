/* Concept (smoothness study, game/concepts/SMOOTHNESS.md): box-filtered dots.

   The engine draws every return as a crisp square of 1, 2 or 3 px snapped to the pixel grid (FS_POINT). A return
   that moves by a fraction of a pixel stays put and then jumps a whole pixel, and two returns that fall in one pixel
   merge (MAX blend): slow camera moves make dense dots crawl and twinkle. Here the vertex shader carries the dot's
   true centre (window px) and size to the fragment shader, the sprite is drawn one pixel larger, and each pixel takes
   the share of the dot's square that covers it (a box filter), raised to `gamma` (< 1: a dot straddling pixels keeps
   more of its brightness under MAX blending, which cannot add the shares back up). Off (uAA.x = 0) it is the
   engine's crisp square. */
import { HEAD } from '../src/engine/shaders.js';

/* vertex side: call aaDot(clip, size_px) after gl_Position and gl_PointSize are set */
export const AA_GLSL = `
uniform vec4 uAA;          // x: on, y: gamma, z: W, w: H (backing px)
out vec3 vDot;             // window px centre, size (px)
void aaDot(vec4 c, float sz) {
  vDot = vec3((c.xy / c.w * 0.5 + 0.5) * uAA.zw, sz);
  if (uAA.x > 0.5) gl_PointSize = floor(sz) + 2.0;
}
`;

export const FS_AA = HEAD + `
in vec3 vCol;
in vec3 vDot;
uniform vec4 uAA;
out vec4 o;
void main() {
  if (uAA.x < 0.5) { o = vec4(vCol, 1.0); return; }
  vec2 p = gl_FragCoord.xy, h = vec2(vDot.z * 0.5);
  vec2 cv = clamp(min(p + 0.5, vDot.xy + h) - max(p - 0.5, vDot.xy - h), 0.0, 1.0);
  float c = cv.x * cv.y;
  if (c <= 0.004) discard;
  o = vec4(vCol * pow(c, uAA.y), 1.0);
}
`;
