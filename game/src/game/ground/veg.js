/* Ground detail · vegetation and boulders, procedural on the GPU (no per-tree data anywhere).

   The ground is a world-fixed lattice of 5 m slots. A slot holds at most one object, decided in the vertex shader
   from hashes of its lattice index and the map's masks (ground/climate.js): a tree (spruce, pine, broadleaf,
   poplar), scrub (a bush, a reed clump, dwarf pine, tundra shrub) or a boulder; field belts snap their slots onto
   rows along the terrain's own field edges (the same hashes as engine/terrain.js); roads, streets and the added
   houses clear their slots (a list of segments per 200 m cell). Each object is a small cloud of returns: a crown
   as a noisy cone or ellipsoid seen mostly from above, a few trunk returns, a boulder's upper half.

   Level of detail, like the terrain and the sea ice:
   - ordered thinning: a slot's rank is the coarsest sub-lattice it is on (min of the trailing zeros of its
     indices); where the view packs the objects tighter on screen than a set area per object (with a grazing floor),
     only the higher ranks survive, the last one dissolving dot by dot. So from far off a forest is a canopy texture
     of returns on its crowns, from high up a faint density over the ground, and close up every tree is there.
   - a quadtree of tiles (32 x 32 slots of one rank each), walked on the CPU from the eye: frustum, the 1 km presence
     grid and the need decide which tiles are drawn (the ice layer's walk); the result is kept while the view holds.
   - dots per object from its crown's size on screen (a prefix of a low-discrepancy sequence, so the kept returns
     are always spread evenly and the last one fades in), bucketed per tile: one instanced draw per bucket.
   Everything after the object is the terrain's rules: the metre relief it stands on, the units' pools, haze, depth
   fade, the scan fronts, the radar sweep and the dynamic lights. */
import { program } from '../../engine/gl.js';
import { HEAD, FRAME, COMMON, CULL, GROUND_GLSL, bindGround } from './glsl.js';
import { FS_POINT } from '../../engine/shaders.js';

export const SLOT = 5, TN = 32;
const R_EARTH = 6371000;
const SCRUB = { bush: 0, reeds: 1, dwarfpine: 2, tundra: 3 };

const UNI = `
uniform int uTop;                          // top level: its tiles hold every rank >= uTop
uniform float uC;                          // slot spacing (m)
uniform sampler2D uMaskA;                  // unit 3: trees, scrub, rocks, conifer share
uniform sampler2D uMaskB;                  // unit 4: field belts, shore rocks
uniform highp usampler2D uClrIdx;          // unit 5: per 200 m cell: first << 8 | count
uniform highp usampler2D uClrList;         // unit 6: segment ids
uniform sampler2D uClrSeg;                 // unit 7: segments, two texels: (ax, az, bx, bz), (radius, ...)
uniform vec4 uClr;                         // x0, z0, 1 / cell, cols
uniform vec4 uVeg;                         // x, y: tree heights (m), z: crown factor, w: stand density
uniform vec4 uVeg2;                        // x: stand scale (m), y: stand contrast, z: tree line (m), w: field belts on
uniform vec4 uVeg3;                        // x: scrub kind, y: poplar share of the belts, z: boulder size, w: canopy brightness
uniform vec4 uVeg4;                        // x: terrain fields strength, y: density scale, z: unused, w: unused
`;
/* the object in a slot: false if none. P: world (x, ground y, z); S: H, R, crown base, phase; Q: brightness, rank
   dissolve, class (0 tree, 1 scrub, 2 boulder) */
const SLOT_GLSL = `
/* the terrain's field plots (engine/terrain.js): the belt through (w) along the plot rows, if any.
   Returns true and moves w onto a row of the belt */
bool beltAt(inout vec2 w, float h, float slope, out float pb) {
  pb = 0.0;
  float flatk = 1.0 - smoothstep(0.012, 0.05, slope);
  float fk = uVeg4.x * flatk * smoothstep(3.0, 9.0, h) * (1.0 - smoothstep(140.0, 260.0, h));
  if (fk < 0.4) return false;
  vec2 dw1, dw2;
  vec2 dc = floor((w + 900.0 * vec2(vnoise(w / 2300.0 + 3.1, dw1), vnoise(w / 2300.0 - 5.7, dw2))) / 3100.0);
  uint hd = hash2(uo(int(dc.x)) ^ 0x6a09e667u, uo(int(dc.y)));
  float ang = u01(hd) * 1.5708, ca = cos(ang), sa = sin(ang);
  vec2 r = vec2(ca * w.x + sa * w.y, -sa * w.x + ca * w.y);
  vec2 cs = vec2(360.0 + 240.0 * u01(hash1(hd)), 170.0 + 130.0 * u01(hash1(hd ^ 0x9e37u)));
  float row = floor(r.y / cs.y), fy = r.y - row * cs.y;
  // the nearest row edge and which one it is
  float edge = fy < cs.y * 0.5 ? row : row + 1.0, dy = r.y - edge * cs.y;
  if (abs(dy) > 7.5) return false;
  uint he = hash1(uint(int(edge)) ^ hd ^ 0x3c6ef372u);
  if (u01(he) > 0.42) return false;                                  // not every edge has a belt
  // gaps along it (a crossing track, a dead stretch)
  if (u01(hash2(uo(int(floor(r.x / 110.0))), he)) < 0.14) return false;
  // three rows, 3.2 m apart: snap across onto the nearest
  float rowOff = clamp(floor(dy / 3.2 + 0.5), -1.0, 1.0) * 3.2;
  r.y = edge * cs.y + rowOff;
  w = vec2(ca * r.x - sa * r.y, sa * r.x + ca * r.y);
  pb = fk;
  return true;
}
bool slotObj(ivec4 T, int slot, out vec3 P, out int kind, out vec4 S, out vec4 Q) {
  int L = T.x;
  int ii = T.y * ${TN} + (slot & ${TN - 1}), jj = T.z * ${TN} + (slot >> ${Math.log2(TN)});
  if (L < uTop && ((ii | jj) & 1) == 0) return false;               // a coarser tile's slot
  int sc = 1 << L, I = ii * sc, J = jj * sc;
  int rank = L < uTop ? L : min(ctz(I), ctz(J));
  uint hs = hash2(uo(I) ^ 0x2f6a1b3du, uo(J));
  // the slot's object sits in the slot, jittered by its own rank's lattice (coarse ranks wander further)
  vec2 jit = vec2(u01(hs), u01(hash1(hs ^ 0x9e3779b9u))) - 0.5;
  vec2 w = (vec2(float(I), float(J)) + 0.5) * uC + jit * uC * min(exp2(float(rank)), 4.0) * 0.84;
  vec2 tuv = ((w - uMap.xy) * uMap.z + 0.5) / vec2(uMapN);
  vec4 MA = textureLod(uMaskA, tuv, 0.0), MB = textureLod(uMaskB, tuv, 0.0);
  if (max(max(MA.r, MA.g), max(MA.b, max(MB.r, MB.g))) < 0.008) return false;
  float h, gy = groundY(w, h);
  if (h < 0.3) return false;
  vec4 N = mapN(w);
  float slope = length(N.xy);
  // what grows here: stands and glades broken out of the smooth masks by noise at the stand scale
  float pn = 0.62 * vn(w / uVeg2.x + 3.7) + 0.38 * vn(w / (uVeg2.x * 0.31) - 8.1);
  float cover = smoothstep(0.36, 0.64, MA.r + 0.5 * uVeg2.y * pn);
  float pT = (cover * uVeg.w * (0.78 + 0.22 * MA.r) + MA.r * 0.05) * uVeg4.y;
  float pS = MA.g * (0.45 + 0.55 * smoothstep(-0.45, 0.5, 0.1 * vn(w / 41.0) - pn)) * uVeg4.y;
  float dsh = h * inversesqrt(max(1e-6, dot(N.xy, N.xy)));            // m to the waterline
  float shore = MB.g * (1.0 - smoothstep(10.0, 55.0, dsh)) * smoothstep(0.05, 0.16, slope);
  float pR = (MA.b * 0.5 * (0.2 + 0.8 * smoothstep(-0.25, 0.55, vn(w / 46.0 + 21.0))) + 0.5 * shore) * uVeg4.y;
  float u1 = u01(hash1(hs ^ 0x51ed27u)), u2 = u01(hash1(hs ^ 0x1b873593u));
  int cls = 0;
  kind = -1;
  float pb = 0.0;
  if (uVeg2.w > 0.5 && MB.r > 0.02) {
    vec2 wb = w;
    if (beltAt(wb, h, slope, pb) && u1 < 0.9 * MB.r / max(pb, 0.4)) {
      kind = u2 < uVeg3.y ? 3 : 2; w = wb; gy = groundY(w, h);
    }
  }
  float scrubKind = uVeg3.x;
  if (kind < 0) {
    if (u1 < pT) kind = u2 < MA.a ? (u01(hash1(hs ^ 0x27d4eb2fu)) < 0.55 ? 0 : 1) : 2;
    else if (u1 < pT + pS * (1.0 - pT)) {
      cls = 1;
      kind = scrubKind < 0.5 ? 4 : scrubKind < 1.5 ? (h < 3.8 ? 5 : 4) : scrubKind < 2.5 ? 6 : 7;
    }
    else if (u2 < pR) { cls = 2; kind = 8; }
    else return false;
  }
  // ordered thinning: keep this rank where the objects are not packed tighter on screen than the set area
  vec3 p0 = vec3(w.x - uEyeW.x, gy - uEyeW.y, w.y - uEyeW.z);
  float d0 = max(1.0, length(p0));
  float sinT = max(uNeed.y, abs(p0.y) / d0);
  float dens = clamp(pT + pS + pR + pb * 0.3, 0.35, 1.0);
  float rNeed = 0.5 * log2(max(1e-9, d0 * d0 / sinT * uNeed.x * dens));
  float va = clamp((float(rank) + 1.0 - rNeed - u01(hash1(hs ^ 0x68bc21ebu))) / 0.18, 0.0, 1.0);
  if (va <= 0.0) return false;
  // the object's size
  uint hp = hash1(hs ^ 0x7f4a7c15u);
  float r1 = u01(hp), r2 = u01(hash1(hp)), r3 = u01(hash1(hp ^ 0x85ebca6bu)), ph = u01(hash1(hp ^ 0xc2b2ae35u));
  float H, R, hb, base;
  if (cls == 0) {
    float tl = 1.0 - 0.6 * smoothstep(uVeg2.z - 170.0, uVeg2.z + 20.0, h);
    H = mix(uVeg.x, uVeg.y, pow(r1, 0.85)) * tl;
    if (kind == 0) { R = H * (0.17 + 0.06 * r2); hb = H * (0.06 + 0.12 * r3); }
    else if (kind == 1) { R = H * (0.18 + 0.08 * r2); hb = H * (0.5 + 0.15 * r3); }
    else if (kind == 3) { H = mix(15.0, 24.0, r1); R = 1.3 + 0.8 * r2; hb = 1.5 + r3; }
    else { R = H * (0.26 + 0.1 * r2); hb = H * (0.28 + 0.14 * r3); }
    if (pb > 0.0 && kind == 2) { H = mix(8.0, 14.0, r1); R = H * 0.3; }
    R *= uVeg.z; base = uVeg3.w;
  } else if (cls == 1) {
    if (kind == 5) { H = 1.6 + 1.3 * r1; R = 1.2 + 0.8 * r2; hb = 0.0; base = 0.75; }
    else if (kind == 6) { H = 1.4 + 2.2 * r1; R = 1.8 + 1.7 * r2; hb = 0.0; base = 1.0; }
    else if (kind == 7) { H = 0.3 + 0.5 * r1; R = 0.5 + 0.8 * r2; hb = 0.0; base = 0.85; }
    else { H = 1.0 + 1.8 * r1; R = 0.9 + 1.2 * r2; hb = 0.0; base = 0.9; }
  } else { R = (0.45 + 1.6 * r1 * r1) * uVeg3.z; H = R * (0.55 + 0.3 * r2); hb = 0.0; base = 1.05; }
  // roads, streets, the added houses keep their ground clear
  {
    vec2 fc = (w - uClr.xy) * uClr.z;
    ivec2 ci = ivec2(floor(fc));
    if (ci.x >= 0 && ci.y >= 0 && ci.x < int(uClr.w)) {
      uint e = texelFetch(uClrIdx, ci, 0).r, st0 = e >> 8u, cnt = min(e & 255u, 16u);
      float rr = cls == 2 ? R : R * 0.55;
      for (uint q = 0u; q < cnt; q++) {
        uint idx = st0 + q, id = texelFetch(uClrList, ivec2(int(idx & 4095u), int(idx >> 12u)), 0).r * 2u;
        vec4 Sg = texelFetch(uClrSeg, ivec2(int(id & 4095u), int(id >> 12u)), 0);
        float sr = texelFetch(uClrSeg, ivec2(int((id + 1u) & 4095u), int((id + 1u) >> 12u)), 0).r;
        vec2 ab = Sg.zw - Sg.xy, ap = w - Sg.xy;
        float t = clamp(dot(ap, ab) / max(1e-4, dot(ab, ab)), 0.0, 1.0);
        if (length(ap - ab * t) < sr + rr) return false;
      }
    }
  }
  P = vec3(w.x, gy, w.y);
  S = vec4(H, R, hb, ph);
  Q = vec4(base * (0.82 + 0.36 * u01(hash1(hp ^ 0x165667b1u))), va, float(cls), 0.0);
  return true;
}
`;
/* one return of an object: its place on the crown (or the stalks, the boulder), lit like the land */
const DOT_GLSL = `
out vec3 vCol;
/* one return of an object, in its own frame (y up from its base). k: the return's index, u / q: its radical
   inverses. n: the surface normal there, bm: brightness factor */
vec3 objDot(int kind, uint k, float H, float R, float hb, float ph, bool trunk, out vec3 n, out float bm) {
  float u = vdc(k), q = vdc3(k), ang = float(k) * 2.39996323 + ph * 6.2831853;
  float ca = cos(ang), sa = sin(ang);
  bm = 1.0;
  if (trunk && k >= 10u && (k % 6u) == 5u) {
    float t = vdc(k / 6u);
    n = vec3(ca, 0.0, sa); bm = 0.42;
    return vec3(ca * 0.2, hb * (0.04 + 1.05 * t), sa * 0.2);
  }
  if (kind == 0) {                   // spruce: a cone in tiers
    float s = sqrt(0.004 + u * 0.996), y = H - s * (H - hb);
    float tier = fract((H - y) / 1.3 + ph * 3.0);
    float rr = R * s * (0.6 + 0.4 * smoothstep(0.0, 0.85, tier)) * (1.0 - 0.5 * q * q);
    n = normalize(vec3(ca, 0.5, sa));
    return vec3(ca * rr, y, sa * rr);
  }
  if (kind == 5) {                   // reeds: a clump of stalks
    uint s = k % 7u;
    float a2 = float(s) * 2.39996 + ph * 6.2831853, r2 = R * sqrt(u01(hash1(s * 747796405u + uint(ph * 65536.0))));
    float t = vdc(k / 7u), y = H * (0.15 + 0.85 * t), lean = 0.12 * y;
    n = vec3(0.0, 1.0, 0.0); bm = 0.75 + 0.25 * t;
    return vec3(cos(a2) * r2 + lean * cos(ph * 9.0), y, sin(a2) * r2 + lean * sin(ph * 9.0));
  }
  if (kind == 8) {                   // a boulder: the upper part of a lumpy ellipsoid, half sunk
    float ct = 1.0 - u * 0.92, st = sqrt(max(0.0, 1.0 - ct * ct));
    float lob = 1.0 + 0.22 * sin(3.0 * ang + ph * 7.0) * st + 0.1 * sin(5.0 * ang + ph * 3.0);
    n = normalize(vec3(ca * st, ct, sa * st));
    return vec3(ca * st * R * lob, (ct - 0.3) * H, sa * st * R * lob * 0.78);
  }
  // pine (a rounded, flat-topped crown high on a bare trunk), broadleaf, poplar, bush, dwarf pine, tundra shrub:
  // a lumpy ellipsoid, most returns from its upper side
  // most returns from the upper side of a crown (the pulse comes from above); scrub is a dome, its underside in the grass
  float ct = kind >= 4 ? 1.0 - 1.35 * pow(u, 1.1) : 1.0 - 2.0 * pow(u, kind == 3 ? 1.0 : 1.25), st = sqrt(max(0.0, 1.0 - ct * ct));
  float lob = 1.0 + (kind == 1 ? 0.24 : 0.18) * sin(2.0 * ang + ph * 5.0) * sin(3.0 * ct + ph * 3.0) + (kind == 1 ? 0.12 * sin(5.0 * ang) : 0.0);
  float D = (H - hb) * 0.5, inner = 1.0 - 0.3 * q * q;
  float rr = R * st * lob * inner;
  float y = hb + D + ct * D * (kind == 1 && ct > 0.0 ? 0.6 : 1.0) * inner;
  n = normalize(vec3(ca * st, ct, sa * st));
  return vec3(ca * rr, y, sa * rr);
}
/* returns a crown gets for its radius on screen (px): an even density while small, then growing with the radius only
   (near crowns are the sparse sprays of a close scan, their returns bigger) */
float crownK(float Rpx) {
  float R1 = 10.0, K1 = 3.14159 * R1 * R1 / uNeed.z;
  return Rpx < R1 ? 3.14159 * Rpx * Rpx / uNeed.z : K1 * pow(Rpx / R1, 1.3);
}
void emitDot(int k, int K, vec3 P, int kind, vec4 S, vec4 Q) {
  float H = S.x, R = S.y, hb = S.z, ph = S.w;
  vec3 p0 = P - uEyeW.xyz;
  float d0 = max(1.0, length(p0));
  // returns for this object: from its crown's size on screen (a prefix of the sequence: the last fades in)
  float Rpx = R * uNeed.w / d0;
  float Kt = clamp(crownK(Rpx), 1.0, float(K));
  float fk = float(k);
  if (fk >= ceil(Kt - 1e-3)) { ${CULL} return; }
  float ka = fk < floor(Kt) ? 1.0 : max(0.0, Kt - floor(Kt));
  // the objects right by the lens dissolve (a close look at a unit is never through a curtain of leaves)
  float nf = smoothstep(14.0, 48.0, d0 - R);
  if (nf <= 0.0 || u01(hash1(uint(k) * 747796405u + floatBitsToUint(P.x))) > nf * 1.15) { ${CULL} return; }
  vec3 n; float bm;
  vec3 lp = objDot(kind, uint(k), H, R, hb, ph, Q.z < 0.5 && Kt >= 20.0, n, bm);
  vec3 p = vec3(p0.x + lp.x, p0.y - 0.25 + lp.y, p0.z + lp.z);
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  gl_Position = c;
  // lit like the land (the view's light), the top of a crown brightest
  float sh = clamp((dot(n, uLit.xyz) + 0.3) / 1.3, 0.0, 1.0);
  float b = Q.x * (0.45 + 0.55 * sh) * bm * (0.75 + 0.35 * clamp(lp.y / max(H, 0.5), 0.0, 1.0));
  b *= uLook.x * Q.y * ka;
  vCol = finish(p, c, b, n, WH);
  float spx = Rpx * sqrt(3.14159 / Kt);
  float ps = spx > 12.0 ? 3.0 : (spx > 2.6 && Rpx > 3.0) ? 2.0 : 1.0;
  gl_PointSize = max(1.0, floor(ps * uCam.y + 0.5));
}
`;
/* far tiles (few returns an object): slot and returns in one pass */
const VS_DIRECT = HEAD + FRAME + COMMON + GROUND_GLSL + UNI + SLOT_GLSL + DOT_GLSL + `
layout(location = 0) in ivec4 aT;          // tile: level, i, j
uniform int uK;
void main() {
  int v = gl_VertexID, slot = v / uK, k = v - slot * uK;
  vec3 P; int kind; vec4 S, Q;
  if (!slotObj(aT, slot, P, kind, S, Q)) { ${CULL} return; }
  emitDot(k, uK, P, kind, S, Q);
}
`;
/* near tiles, stage 1: each slot's object once, into a transform feedback buffer */
const VS_SLOTS = HEAD + FRAME + COMMON + GROUND_GLSL + UNI + SLOT_GLSL + `
layout(location = 0) in ivec4 aT;
out vec4 tA;          // world x, ground y, z; brightness
out vec4 tB;          // H, R, crown base, phase
flat out uint tC;     // kind + 1 (0: none) | rank dissolve << 8 | class << 16
void main() {
  vec3 P = vec3(0.0); int kind = 0; vec4 S = vec4(0.0), Q = vec4(0.0);
  bool ok = slotObj(aT, gl_VertexID, P, kind, S, Q);
  tA = vec4(P, Q.x); tB = S;
  tC = ok ? uint(kind + 1) | (uint(Q.y * 255.0) << 8u) | (uint(Q.z) << 16u) : 0u;
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0;
}
`;
const FS_NULL = HEAD + `flat in uint tC; out vec4 o; void main() { o = vec4(0.0); }`;
/* near tiles, stage 2: the objects' returns */
const VS_DOTS = HEAD + FRAME + COMMON + GROUND_GLSL + DOT_GLSL + `
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
layout(location = 2) in uint aC;
uniform int uK;
void main() {
  if (aC == 0u) { ${CULL} return; }
  emitDot(gl_VertexID, uK, aA.xyz, int(aC & 255u) - 1, aB, vec4(aA.w, float((aC >> 8u) & 255u) / 255.0, float((aC >> 16u) & 255u), 0.0));
}
`;
/* near tiles, the canopy's depth (before the terrain's dots): a disc a crown, so the ground behind a canopy drops out
   as the pulse loses it under the trees; the occluders are put back before the units draw (ground.js) */
const VS_OCC = HEAD + FRAME + COMMON + `
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
layout(location = 2) in uint aC;
uniform float uPtMax;
uniform float uOccMax;                     // crowns larger on screen than this (1080 px radius) do not occlude
uniform vec4 uKeep[32];                    // the models on screen (x, y: 1080 px from the centre, z: radius): no crown hides them
uniform int uNKeep;
uniform float uAspect;
void main() {
  int kind = int(aC & 255u) - 1;
  if (aC == 0u || kind == 5) { ${CULL} return; }
  float H = aB.x, R = aB.y, hb = aB.z;
  float yc, r;
  if (kind == 0) { yc = hb + (H - hb) * 0.33; r = R * 0.62; }
  else if (kind == 8) { yc = H * 0.15; r = R * 0.75; }
  else { yc = hb + (H - hb) * 0.5; r = min(R, (H - hb) * 0.5) * 0.8; }
  vec3 p = aA.xyz - uEyeW.xyz + vec3(0.0, yc - 0.25, 0.0);
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  float rpx = r * uCamF.w / c.w, r1080 = r * uCam.x / c.w;
  vec2 sp = c.xy / c.w * vec2(540.0 * uAspect, 540.0);
  for (int i = 0; i < 32; i++) {
    if (i >= uNKeep) break;
    if (length(sp - uKeep[i].xy) < uKeep[i].z * 1.25 + r1080 + 6.0) { ${CULL} return; }
  }
  // small crowns hide little; very near ones are a sparse spray (their returns are capped): neither occludes
  if (rpx < 1.5 || r * uCam.x / c.w > uOccMax) { ${CULL} return; }
  gl_Position = c;
  gl_PointSize = min(2.0 * rpx, uPtMax);
}
`;
const FS_OCC = HEAD + `
out vec4 o;
void main() { vec2 d = gl_PointCoord * 2.0 - 1.0; if (dot(d, d) > 1.0) discard; o = vec4(0.0); }
`;
const STRIDE = 36;

export class VegLayer {
  /* R: renderer, map, masks: buildMasks() output, clim: climateOf(map.id), clear: [[ax, az, bx, bz, r], ...] */
  constructor(R, map, masks, clim, clear) {
    this.R = R; this.map = map; this.clim = clim; this.pres = masks.presence; this.masks = masks;
    const gl = this.gl = R.gl, T = R.terrain;
    this.PD = program(gl, VS_DIRECT, FS_POINT, 'ground.veg.direct');
    this.PB = program(gl, VS_DOTS, FS_POINT, 'ground.veg.dots');
    this.PA = tfProgram(gl, VS_SLOTS, FS_NULL, ['tA', 'tB', 'tC'], 'ground.veg.slots');
    this.PO = program(gl, VS_OCC, FS_OCC, 'ground.veg.occ');
    const tex = (w, h, fmt, ifmt, type, data, lin) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
      const f = lin ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.tA = tex(T.cols, T.rows, gl.RGBA, gl.RGBA8, gl.UNSIGNED_BYTE, masks.A, true);
    this.tB = tex(T.cols, T.rows, gl.RGBA, gl.RGBA8, gl.UNSIGNED_BYTE, masks.B, true);
    // clearance: segments per 200 m cell
    const CC = 200, ccols = Math.ceil(map.W / CC) + 2, crows = Math.ceil(map.H / CC) + 2, cx0 = -map.W / 2 - CC, cz0 = -map.H / 2 - CC;
    const nS = clear.length, count = new Uint32Array(ccols * crows), M = 5;          // M: the widest crown's overhang
    const cellsOf = (s, f) => {
      const [ax, az, bx, bz, r] = s, e = r + M;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - e - cx0) / CC)), i1 = Math.min(ccols - 1, Math.floor((Math.max(ax, bx) + e - cx0) / CC));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - e - cz0) / CC)), j1 = Math.min(crows - 1, Math.floor((Math.max(az, bz) + e - cz0) / CC));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(j * ccols + i);
    };
    for (let k = 0; k < nS; k++) cellsOf(clear[k], c => { count[c]++; });
    const start = new Uint32Array(ccols * crows);
    let tot = 0;
    for (let c = 0; c < count.length; c++) { start[c] = tot; tot += Math.min(255, count[c]); }
    const LW = 4096, lrows = Math.max(1, Math.ceil(tot / LW)), list = new Uint32Array(LW * lrows), fill = new Uint32Array(ccols * crows);
    for (let k = 0; k < nS; k++) cellsOf(clear[k], c => { if (fill[c] < 255) { list[start[c] + fill[c]] = k; fill[c]++; } });
    const idx = new Uint32Array(ccols * crows);
    for (let c = 0; c < idx.length; c++) idx[c] = (start[c] << 8) | Math.min(255, count[c]);
    const srows = Math.max(1, Math.ceil(nS * 2 / LW)), seg = new Float32Array(LW * srows * 4);
    for (let k = 0; k < nS; k++) { const s = clear[k], o = k * 8; seg[o] = s[0]; seg[o + 1] = s[1]; seg[o + 2] = s[2]; seg[o + 3] = s[3]; seg[o + 4] = s[4]; }
    this.tCI = tex(ccols, crows, gl.RED_INTEGER, gl.R32UI, gl.UNSIGNED_INT, idx, false);
    this.tCL = tex(LW, lrows, gl.RED_INTEGER, gl.R32UI, gl.UNSIGNED_INT, list, false);
    this.tCS = tex(LW, srows, gl.RGBA, gl.RGBA32F, gl.FLOAT, seg, false);
    this.clr = [cx0, cz0, 1 / CC, ccols];
    this.nClear = nS;
    // instances: (level, i, j, 0) per tile
    this.cap = 4096;
    this.inst = new Int32Array(this.cap * 4);
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribIPointer(0, 4, gl.INT, 16, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.bindVertexArray(null);
    // the near tiles' objects (transform feedback), read back as per-object attributes
    this.tfCap = 360;                                   // tiles
    this.tfBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tfBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.tfCap * TN * TN * STRIDE, gl.DYNAMIC_COPY);
    this.tf = gl.createTransformFeedback();
    this.vaoB = gl.createVertexArray();
    gl.bindVertexArray(this.vaoB);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tfBuf);
    for (let k = 0; k < 3; k++) gl.enableVertexAttribArray(k);
    this._ptrB(0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.nTF = 0; this.tfDirty = true; this.nbT = new Int32Array(9);
    // the top level: one tile covers the map
    let top = 0; while (TN * SLOT * (1 << top) < Math.max(map.W, map.H) + 4000) top++;
    this.top = top;
    this.hLo = T.hMin; this.hHi = T.hMax;
    this.buckets = Array.from({ length: 9 }, () => []);
    this.nb = new Int32Array(9);
    this.key = '';
    this.stats = { tiles: 0, verts: 0, walk: 0, ms: 0 };
    this.Rref = .18 * clim.treeH[1] * clim.crownK;          // a typical crown (the buckets: its returns at the tile's nearest point)
    this._pl = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  }

  /* the tiles to draw for this view (kept while the view holds). o: { Kn, G0, Adot, fl, dens } */
  walk(cam, o) {
    const e = cam.eye, f = cam.f, K = this._k || (this._k = new Float64Array(10));
    // kept while the view holds: the eye within 1.5 % of its height over the ground, the heading within ~2.3 degrees
    // (the frustum below has the margin for it), the same viewport and density. The GPU does the exact per-object test
    const hg = Math.max(15, e[1] - Math.max(0, this.R.terrain.heightAt(e[0], e[2]))), mv = Math.hypot(e[0] - K[0], e[1] - K[1], e[2] - K[2]);
    if (K[9] && mv < .015 * hg && f[0] * K[3] + f[1] * K[4] + f[2] * K[5] > .9992 && K[6] === cam.W && K[7] === cam.H && K[8] === o.Kn * 1e9 + o.Adot) return false;
    K[0] = e[0]; K[1] = e[1]; K[2] = e[2]; K[3] = f[0]; K[4] = f[1]; K[5] = f[2]; K[6] = cam.W; K[7] = cam.H; K[8] = o.Kn * 1e9 + o.Adot; K[9] = 1;
    const t0 = performance.now();
    const r = cam.r, u = cam.u, tx = (cam.W / 2) / cam.fl * 1.06 + .045, ty = (cam.H / 2) / cam.fl * 1.06 + .045, PL = this._pl;
    const setP = (P, a, b, c, d) => { P[0] = a; P[1] = b; P[2] = c; P[3] = d; };
    setP(PL[0], f[0], f[1], f[2], -cam.near);
    setP(PL[1], r[0] + f[0] * tx, r[1] + f[1] * tx, r[2] + f[2] * tx, 0);
    setP(PL[2], -r[0] + f[0] * tx, -r[1] + f[1] * tx, -r[2] + f[2] * tx, 0);
    setP(PL[3], u[0] + f[0] * ty, u[1] + f[1] * ty, u[2] + f[2] * ty, 0);
    setP(PL[4], -u[0] + f[0] * ty, -u[1] + f[1] * ty, -u[2] + f[2] * ty, 0);
    const B = this.buckets; for (const b of B) b.length = 0;
    const T = this.R.terrain, ex = e[0], ey = e[1], ez = e[2], pres = this.pres, top = this.top;
    const Kn = o.Kn * o.dens, G0 = o.G0, fl = o.fl, K1 = Math.PI * 100 / o.Adot, Rfl = this.Rref * fl;
    const dFar = 16000 + 3 * Math.max(0, ey - Math.max(0, T.heightAt(ex, ez)));
    let n = 0, visits = 0;
    const cap = 2600;
    const walk = (L, ti, tj) => {
      visits++;
      const S = TN * SLOT * (1 << L), x0 = ti * S, z0 = tj * S, x1 = x0 + S, z1 = z0 + S;
      if (!pres.any(x0, z0, x1, z1)) return;
      // nearest point of the tile (horizontal), its distance
      const qx = ex < x0 ? x0 : ex > x1 ? x1 : ex, qz = ez < z0 ? z0 : ez > z1 ? z1 : ez;
      const dh = Math.hypot(qx - ex, qz - ez);
      if (dh > dFar) return;
      let lo, hi;
      if (L >= 6) { lo = this.hLo; hi = this.hHi; } else { const rg = T.rangeOver(x0, z0, x1, z1); lo = rg[0]; hi = rg[1]; }
      lo = Math.max(lo, -2); hi = Math.max(hi, 0) + 30;
      // the frustum (RTE box; the curvature drop at the far corner widens it downward)
      const fxm = Math.max(Math.abs(x0 - ex), Math.abs(x1 - ex)), fzm = Math.max(Math.abs(z0 - ez), Math.abs(z1 - ez));
      const bx0 = x0 - ex, bx1 = x1 - ex, bz0 = z0 - ez, bz1 = z1 - ez, by0 = lo - ey - (fxm * fxm + fzm * fzm) / (2 * R_EARTH), by1 = hi - ey;
      for (let k = 0; k < 5; k++) {
        const P = PL[k];
        if (P[0] * (P[0] > 0 ? bx1 : bx0) + P[1] * (P[1] > 0 ? by1 : by0) + P[2] * (P[2] > 0 ? bz1 : bz0) + P[3] < 0) return;
      }
      const vy = ey > hi ? ey - hi : ey < lo ? lo - ey : 0, dmin = Math.max(1, Math.hypot(dh, vy));
      const sinT = Math.max(G0, (ey - hi) / dmin);
      const need = dmin * dmin / sinT * Kn * .88;                   // (slack: the view may move a little before the next walk)
      if (L < top && need >= Math.pow(4, L + 1)) return;               // none of this rank is wanted in it
      if (n < cap) {
        const rp = Rfl / dmin, kw = rp < 10 ? Math.PI * rp * rp / o.Adot : K1 * Math.pow(rp / 10, 1.3);
        let bi = 0; while (bi < 6 && (1 << bi) < kw) bi++;                  // up to 64 returns a crown (a close crown is a spray)
        B[bi].push(L, ti, tj);
        n++;
      }
      if (L > 0 && need < Math.pow(4, L)) {
        const c = 2 * ti, d = 2 * tj;
        walk(L - 1, c, d); walk(L - 1, c + 1, d); walk(L - 1, c, d + 1); walk(L - 1, c + 1, d + 1);
      }
    };
    const S = TN * SLOT * (1 << top), m = this.map;
    for (let tj = Math.floor((-m.H / 2 - 2000) / S); tj * S < m.H / 2 + 2000; tj++) for (let ti = Math.floor((-m.W / 2 - 2000) / S); ti * S < m.W / 2 + 2000; ti++) walk(top, ti, tj);
    // pack the instances, bucket by bucket
    if (n > this.cap) { this.cap = n + 256; this.inst = new Int32Array(this.cap * 4); }
    // the near tiles (4 and more returns an object) first, through the transform feedback (up to its capacity, the
    // nearest buckets first); then the far tiles, direct
    const I = this.inst;
    let w = 0, verts = 0, tf = 0;
    const put = (L, k) => { I[w * 4] = L[k]; I[w * 4 + 1] = L[k + 1]; I[w * 4 + 2] = L[k + 2]; I[w * 4 + 3] = 0; w++; };
    this.nbT.fill(0);
    for (let bi = 8; bi >= 2; bi--) {
      const L = B[bi]; let m = 0;
      for (let k = 0; k < L.length && tf < this.tfCap; k += 3) { put(L, k); tf++; m++; L[k] = -1; }
      this.nbT[bi] = m; verts += m * TN * TN * (1 << bi);
    }
    this.nTF = tf; this.tfDirty = true;
    for (let bi = 0; bi < 9; bi++) {
      const L = B[bi]; let m = 0;
      for (let k = 0; k < L.length; k += 3) if (L[k] >= 0) { put(L, k); m++; }
      this.nb[bi] = m; verts += m * TN * TN * (1 << bi);
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    if (I.byteLength > (this._bufBytes || 0)) { gl.bufferData(gl.ARRAY_BUFFER, I.byteLength, gl.DYNAMIC_DRAW); this._bufBytes = I.byteLength; }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, I, 0, w * 4);
    this.stats.tiles = n; this.stats.visits = visits; this.stats.verts = verts;
    this.stats.walk = performance.now() - t0;
    return true;
  }

  _ptrB(first) {
    const gl = this.gl, o = first * STRIDE;
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, STRIDE, o);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE, o + 16);
    gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_INT, STRIDE, o + 32);
    for (let k = 0; k < 3; k++) gl.vertexAttribDivisor(k, 1);
  }
  _uniforms(P, o) {
    const gl = this.gl, u = P.u, T = this.R.terrain, c = this.clim;
    gl.useProgram(P.p);
    bindGround(gl, P, T, o);
    const unit = (i, t, name) => { if (u[name] === undefined) return; gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u[name], i); };
    unit(3, this.tA, 'uMaskA'); unit(4, this.tB, 'uMaskB'); unit(5, this.tCI, 'uClrIdx'); unit(6, this.tCL, 'uClrList'); unit(7, this.tCS, 'uClrSeg');
    gl.activeTexture(gl.TEXTURE0);
    if (u.uTop) gl.uniform1i(u.uTop, this.top);
    if (u.uC) gl.uniform1f(u.uC, SLOT);
    if (u.uClr) gl.uniform4f(u.uClr, this.clr[0], this.clr[1], this.clr[2], this.clr[3]);
    if (u.uVeg) gl.uniform4f(u.uVeg, c.treeH[0], c.treeH[1], c.crownK, c.dens);
    if (u.uVeg2) gl.uniform4f(u.uVeg2, c.patch, c.contrast, c.treeline, c.windbreak > 0 ? 1 : 0);
    if (u.uVeg3) gl.uniform4f(u.uVeg3, SCRUB[c.scrub] || 0, c.poplar || 0, c.rockK || 1, o.canopy);
    if (u.uVeg4) gl.uniform4f(u.uVeg4, T.fields, o.vegK, 0, 0);
  }
  /* the near tiles' objects, once per view (transform feedback) */
  objects(o) {
    const gl = this.gl;
    if (this.nTF && this.tfDirty) {
      {
        const P = this.PA;
        this._uniforms(P, o);
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        gl.vertexAttribIPointer(0, 4, gl.INT, 16, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.enable(gl.RASTERIZER_DISCARD);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tf);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.tfBuf);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArraysInstanced(gl.POINTS, 0, TN * TN, this.nTF);
        gl.endTransformFeedback();
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
        gl.disable(gl.RASTERIZER_DISCARD);
        this.tfDirty = false;
      }
    }
  }
  /* the canopy's depth: a disc a near crown (the caller sets depth writes on, colour off) */
  occlude(occMax, keep, nKeep) {
    if (!this.nTF) return 0;
    const gl = this.gl, P = this.PO;
    gl.useProgram(P.p);
    gl.uniform1f(P.u.uPtMax, this.R.G.pointMax || 256);
    gl.uniform1f(P.u.uOccMax, occMax);
    gl.uniform1i(P.u.uNKeep, nKeep);
    if (nKeep && P.u.uKeep) gl.uniform4fv(P.u.uKeep, keep);
    gl.uniform1f(P.u.uAspect, this.R.G.W / Math.max(1, this.R.G.H));
    gl.bindVertexArray(this.vaoB);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tfBuf);
    this._ptrB(0);
    gl.drawArraysInstanced(gl.POINTS, 0, 1, this.nTF * TN * TN);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return this.nTF;
  }
  draw(o) {
    const gl = this.gl;
    let off = 0;
    // near tiles: the objects' returns
    if (this.nTF) {
      const P = this.PB;
      this._uniforms(P, o);
      gl.bindVertexArray(this.vaoB);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.tfBuf);
      let first = 0;
      for (let bi = 8; bi >= 2; bi--) {
        const n = this.nbT[bi];
        if (!n) continue;
        this._ptrB(first * TN * TN);
        gl.uniform1i(P.u.uK, 1 << bi);
        gl.drawArraysInstanced(gl.POINTS, 0, 1 << bi, n * TN * TN);
        first += n;
      }
      off = this.nTF;
    }
    // far tiles: slot and returns in one pass
    const P = this.PD;
    this._uniforms(P, o);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    for (let bi = 0; bi < 9; bi++) {
      const nI = this.nb[bi];
      if (!nI) continue;
      gl.vertexAttribIPointer(0, 4, gl.INT, 16, off * 16);
      gl.uniform1i(P.u.uK, 1 << bi);
      gl.drawArraysInstanced(gl.POINTS, 0, TN * TN * (1 << bi), nI);
      off += nI;
    }
    gl.vertexAttribIPointer(0, 4, gl.INT, 16, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
}

/* a program whose vertex outputs go to a transform feedback buffer (interleaved) */
function tfProgram(gl, vs, fs, varyings, name) {
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader ${name}: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.transformFeedbackVaryings(p, varyings, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link ${name}: ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i), loc = gl.getUniformLocation(p, info.name); if (loc) u[info.name.replace(/\[0\]$/, '')] = loc; }
  const bi = gl.getUniformBlockIndex(p, 'Frame');
  if (bi !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, bi, 0);
  return { p, u, name };
}
