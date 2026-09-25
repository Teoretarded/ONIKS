/* Terrain and sea as a POINT CLIPMAP around the lens.
   Nested square lattices of dots, spacing doubling per level, every level snapped to its world lattice (dots
   never swim), jitter from a hash of the dot's absolute lattice position (stable), heights read in the vertex
   shader from a float texture of map.heights. Level transitions dissolve: in the outer band of a level the
   dots that are not on the next level's lattice drop out one by one; the finest level does the same with the
   zoom fraction, so zooming never pops. The lattice is centred on the eye's ground point, finest spacing from
   the lens height: from 20 m to 150 km the dots keep the same density on screen.

   The films' LiDAR look comes from WHICH dots are drawn, not from random speckle:
   - Ordered thinning. Every lattice dot has a pattern rank (from its absolute lattice index): the dots of rank
     >= k form a regular sub-lattice of density 2^-k whose rows run east-west (scan rows) and whose jitter is
     +-0.35 of its own spacing along the row, tighter across. Thinning keeps whole patterns, so what survives is
     always a jittered lattice with rows, world-fixed and identical in every clipmap level.
   - Land keeps a dot budget per screen area measured on FLAT ground with a grazing floor (the films' survey):
     faces turned to the lens and silhouettes pile up (crisp ridgelines, walls of cliffs), the far field packs
     toward the horizon. Shading from an exaggerated normal lit by the moon blended with a light behind the
     lens, crests brightened, contours snapped into crisp dotted lines from high up, beaches, a field and
     marsh texture on flat low ground.
   - The sea keeps a constant horizontal spacing on screen (the films' Aegis sea), so rows compress into a
     perspective gradient and dissolve into a bright horizon line. Brightness follows the swell: the faces
     turned to the lens return more (back faces seen from low return nothing, so the swell prints as rows
     receding along the crests), crests brighter, the films' slow flicker, glints, whitecaps in a rough sea, a
     glassy dark sea in a calm; the coast is one crisp dotted line with a surf band walking in.
   An invisible depth mesh (lower envelope of the land, then the sea surface) occludes what is behind hills and
   below the horizon: with the Earth's curvature (d^2 / 2R) distant ships go hull-down. The sky is dots at
   infinity: a band of returns riding the dipped horizon (glowing toward dusk) and sparse stars. */
import { HEAD, FRAME, COMMON, FS_POINT, CULL } from './shaders.js';
import { program, floatTex } from './gl.js';

const MAXL = 20;
const B = 32;                 // block side (dots)
const MB = 8;                 // depth mesh quads per block side
const R_EARTH = 6371000;
const BASE_SHIFT = 6;         // absolute lattice unit = 1/64 m (hash coordinates)
const DEG = Math.PI / 180;
const NSUB = 12;              // subjects the world dims round (units on screen)

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
uniform sampler2D uNTex;                  // RGBA16F: dh/dx, dh/dz, ridge, height (mip-mapped: averages)
uniform vec4 uMap;                        // world x0, z0, 1/cell, cell
uniform ivec2 uMapN;                      // cols, rows
uniform uint uSalt;
uniform vec2 uJit;                        // jitter along the land's rows (and the sea's, both ways), across the rows: of the pattern spacing
uniform int uRowK;                        // land rows are 2^uRowK times further apart than the returns along them
uniform float uRelief;

/* trailing zero bits (capped) */
int ctz(int v) {
  if (v == 0) return 15;
  uint u = uint(v);
  u &= (~u + 1u);
  return min(15, int(log2(float(u)) + 0.5));
}
/* the dot's lattice data, shared by the helpers below */
vec2 gQ;        // lattice position (rte, unjittered)
float gS;       // level spacing (m)
ivec2 gC;       // trailing zero bits of I (x) and J (z): the coarsest sub-lattices the dot belongs to
vec2 gH;        // two jitter draws (-.5 .. .5)
/* one lattice dot: its lattice position, level spacing s, visibility (band dissolve), hash; false = no dot here.
   The level's lattice is world-snapped, so every dot keeps its place and its hash at any view. */
bool latticeDot(out float s, out float vis, out uint hs) {
  int l = aBlk.x;
  int li = gl_VertexID % uB, lj = gl_VertexID / uB;
  int i = aBlk.y + li, j = aBlk.z + lj;
  ivec4 hb = uHole[l];
  if (i >= hb.x && i < hb.y && j >= hb.z && j < hb.w) return false;
  vec4 L = uLv[l]; ivec4 LI = uLvI[l];
  s = L.x;
  int I = LI.x + i, J = LI.y + j;
  hs = hash2(uo(I << LI.z) ^ uSalt, uo(J << LI.z));
  vec2 q = L.yz + vec2(float(i), float(j)) * s;
  float dn = max(abs(q.x), abs(q.y)) / s;
  float hg = float(uG / 2);
  float t = smoothstep(hg - uBand - 2.0, hg - 2.0, dn);
  if (l == 0) t = max(t, L.w);
  vis = 1.0;
  if (((I | J) & 1) != 0) {
    float hv = u01(hash1(hs ^ 0x68bc21ebu));
    vis = clamp((hv - t) / 0.12, 0.0, 1.0);
    if (vis <= 0.0) return false;
  }
  if (LI.w == 1) vis *= 1.0 - smoothstep(hg - uBand, hg - 2.0, dn);
  gQ = q; gS = s;
  gC = ivec2(ctz(I), ctz(J));
  gH = vec2(u01(hs), u01(hash1(hs + 0x9e3779b9u))) - 0.5;
  return vis > 0.001;
}
/* LAND: scan rows. Pattern m (m >= 0) keeps columns I % 2^m == 0 on rows J % 2^(m + c) == 0 (rows 2^c times further
   apart than the returns along them), density 2^-(2m + c); rank R = the coarsest pattern of the dot, -1 = the full
   lattice only. Returns jittered along the row, the rows crisp; the full lattice (near the lens) is isotropic. */
float gRank;
vec2 landXZ() {
  int c = uRowK;
  gRank = gC.y >= c ? float(min(gC.x, gC.y - c)) : -1.0;
  if (gRank < 0.0) return gQ + gH * uJit.x * gS;
  float X = gS * exp2(gRank), Z = X * exp2(float(c));
  return gQ + vec2(gH.x * uJit.x * X, gH.y * (c > 0 ? uJit.y : uJit.x) * Z);
}
/* keep to density 2^-kd of the level's lattice: whole patterns survive, the last one dissolving dot by dot */
float keepRows(float kd, uint hs) {
  if (kd <= 0.0) return 1.0;
  float c = float(uRowK), p;
  float u = u01(hash1(hs ^ 0x3c6ef372u));
  if (kd < c) {
    if (gRank >= 0.0) return 1.0;
    p = (exp2(c - kd) - 1.0) / (exp2(c) - 1.0);
  } else {
    float mf = (kd - c) * 0.5, M = floor(mf), f = mf - M;
    if (gRank > M + 0.5) return 1.0;
    if (gRank < M - 0.5) return 0.0;
    p = (exp2(2.0 - 2.0 * f) - 1.0) / 3.0;
  }
  return clamp((p - u * 0.8) / 0.2, 0.0, 1.0);
}
/* SEA (and the waterline, the seabed): isotropic. Pattern k keeps J % 2^ceil(k/2), I % 2^floor(k/2) (density 2^-k);
   the jitter scales with the dot's coarsest pattern, +-uJit.x/2 of its spacing both ways (the films' sea lattice) */
float seaRank() { return float(min(min(2 * gC.y, 2 * gC.x + 1), 20)); }
/* the sea's jitter, capped at the kept lattice: a dot kept at density 2^-kd moves by at most +-jit/2 of the kept
   spacing (not of its own, coarser pattern's), so what survives is an orderly jittered lattice whose rows and files
   read (the films' sea), never the speckle a coarse dot's own wide jitter scatters over the finer lattice round it.
   The cap follows kd, which moves with the range only: the drift is a fraction of a percent of the view's motion */
vec2 seaXZ(float lr, float kd, float jit) {
  return gQ + gH * jit * gS * exp2(min(lr, max(kd, 0.0)) * 0.5);
}
float keepOrdered(float lr, float kd, uint hs) {
  if (kd <= 0.0) return 1.0;
  float K = floor(kd);
  if (lr > K + 0.5) return 1.0;
  if (lr < K - 0.5) return 0.0;
  float f = exp2(K + 1.0 - kd) - 1.0;
  float u = u01(hash1(hs ^ 0x3c6ef372u));
  return clamp((f - u * 0.8) / 0.2, 0.0, 1.0);
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
  return textureLod(uNTex, (f + 0.5) / vec2(uMapN), 0.0);
}
/* the gradient averaged over ~ spacing sp (m) */
vec4 mapNs(vec2 w, float sp) {
  vec2 f = clamp((w - uMap.xy) * uMap.z, vec2(0.0), vec2(uMapN - 1));
  return textureLod(uNTex, (f + 0.5) / vec2(uMapN), max(0.0, log2(sp * uMap.z)));
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
uniform vec4 uSeaP;         // x: brightness, y: horizontal spacing of the returns on screen (1080 px), z: wind angle, w: total amplitude
uniform vec4 uSea2;         // x: roughness 0 glassy .. 1 storm, y: whitecaps, z: glints, w: 2-px dots above this on-screen spacing
uniform vec4 uSurf;         // x: surf width (m), y: waterline brightness, z: time, w: (contour interval, see uCont)
uniform vec4 uLand;         // x: brightness, y: unused, z: ridge gain, w: outside-map dim
uniform vec4 uDot;          // x: 2 px above this on-screen spacing, y: 3 px above, z: dim above (px), w: screen area per land dot (px^2)
uniform vec4 uLit;          // xyz: the view's light (fixed to the camera heading), w: its share of the land light (0 = the moon, uSun)
uniform vec4 uTex;          // x: fields, y: marsh, z: beach, w: grazing floor of the land budget
uniform vec4 uTex2;         // x: prominence shading strength
uniform vec4 uCont;         // contours: x, y two intervals (m), z: share of y, w: share of the returns that may snap
uniform vec4 uCoast;        // x: waterline dots per px of coast, y: surf strength, z: seabed spacing factor, w: sea dots 2 px nearer than (m)
uniform vec4 uDot2;         // x: land dots 2 px nearer than (m), y: shading exaggeration factor (grows with altitude), z: sea fade distance (m), w: sea bands 0..1
uniform float uWl2;         // the waterline's dots are 2 px nearer than this (m)
uniform float uSeaGrp;      // swell-train brightness modulation (grows with the altitude)
uniform vec2 uHz;           // x: horizon dip (rad), y: brightness of the sea at the horizon
uniform vec4 uSea3;         // x: screen area per sea return seen from above (1080 px^2), y: haze distance (m, 0 none),
                            // z: haze floor (what is left far off), w: swell rows from mid altitude (0..1)
uniform vec4 uSeaRow;       // the swell's rows: x strength, y share kept in a trough, z brightness in a trough, w added on a crest
uniform vec4 uSea4;         // x: log2 of the range the steep sea's spacing is set at (m), y: how much the spacing follows
                            // the range (1: constant density on screen, less: denser far off, the plane recedes),
                            // z: brightness of the steep sea's (denser) returns, w: jitter (of the kept spacing)
uniform vec4 uSubA[${NSUB}];      // subjects (the units on screen): xyz centre (RTE), w: world halo radius (m)
uniform vec4 uSubB[${NSUB}];      // x, y: screen centre (1080-px units from the centre), z: screen radius (1080 px), w: depth
uniform vec4 uSubP;         // x: count, y: dimming at a subject, z: aspect (W / H), w: backdrop dimming (behind a subject on screen)
/* the world dims round the units on screen (the films keep the ground dim round their models): a pool round each
   subject in the world, and a soft backdrop behind it on screen */
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
    // a unit that fills the frame (or with the lens inside its pool) needs no pool: the world round it stays as it is
    // (else the near sea goes black under a hull seen close)
    w *= (1.0 - smoothstep(260.0, 700.0, Bq.z)) * smoothstep(1.1, 2.4, length(A.xyz) / A.w);
    k = min(k, 1.0 - clamp(w, 0.0, 1.0));
  }
  return k;
}
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
  float s, vis; uint hs;
  if (!latticeDot(s, vis, hs)) { ${CULL} return; }
  vec2 xz = landXZ();
  vec2 w = xz + uEyeW.xz;
  float dout;
  float h = mapH(w, dout);
  vec4 N = mapN(w);
  float g2 = max(1e-6, dot(N.xy, N.xy));
  float dsh = abs(h) * inversesqrt(g2);                 // distance to the waterline (m)
  // where the dot lands on screen (before the fine relief and the swell): the dot budget is set from this
  vec3 p0 = vec3(xz.x, max(h, 0.0) - uEyeW.y, xz.y);
  p0.y -= curveDrop(p0);
  float cw = dot(uCamF.xyz, p0);
  if (cw < uCam.w) { ${CULL} return; }
  // on-screen spacing of this level's lattice (1080 px), from the distance (not the depth): turning the lens
  // leaves the kept dots as they are
  float pxs = s * uCam.x / length(p0);
  float fg = abs(p0.y) * inversesqrt(dot(p0, p0));      // flat ground's facing: sine of the view's elevation
  vec3 col = WH;
  float b, y, big = 0.0, kd = 0.0, land = 0.0, sea = 0.0, glint = 0.0, glowH = 0.0;
  vec3 n = vec3(0.0, 1.0, 0.0);
  float wl = max(0.75 * s, 2.0);
  if (dsh < wl && dout <= 0.0) {
    // the waterline: the returns either side of it snapped onto the h = 0 contour (a Newton step along the
    // gradient), so the coast prints as one crisp dotted line, as dense on screen at any range
    kd = log2(max(1e-6, 2.0 * wl / (s * pxs) / uCoast.x));
    vis *= keepOrdered(seaRank(), kd, hs);
    if (vis < 0.02) { ${CULL} return; }
    xz -= N.xy * (h / g2);
    y = 0.35;
    b = uSurf.y * (0.72 + 0.28 * u01(hash1(hs ^ 0x51ed27u)));
    big = 1.0;
  } else if (h > 0.0) {
    land = 1.0;
    // a dot budget per screen area of the (map) surface, with a grazing floor: walls turned to the lens keep
    // their returns (cliffs read as cliffs), grazing ground and the far field pack toward the silhouettes and
    // the horizon (crisp crests)
    vec3 nG = normalize(vec3(-N.x, 1.0, -N.y));
    float fa = abs(dot(nG, p0)) * inversesqrt(dot(p0, p0)) / nG.y;
    kd = log2(uDot.w / max(1e-6, pxs * pxs * max(uTex.w, fa)));
    // contours (from high up, the films' chart): the returns within half a spacing of one - on a lattice twice as
    // fine as the fill - snap onto it, so it prints as a crisp dotted line
    // (they dissolve in with the altitude, and from one interval to the next, dot by dot: no pops)
    float dhc = 0.0;
    uint hcn = hash1(hs ^ 0x6c8e9cf5u);
    if (u01(hcn) < uCont.w) {
      float ci = u01(hash1(hcn)) < uCont.z ? uCont.y : uCont.x;
      if (h > ci * 0.5) {
        dhc = (fract(h / ci + 0.5) - 0.5) * ci;
        float kc = kd - 2.0, sc = s * exp2(0.5 * max(kc, 0.0));
        if (abs(dhc) * inversesqrt(g2) < 0.5 * sc) { big = 0.5; kd = kc; }
      }
    }
    vis *= keepRows(kd, hs);
    if (vis < 0.02) { ${CULL} return; }
    vec2 dg;
    y = h + detail(w, h, dg);
    vec2 g = N.xy + dg;
    // the metre relief shades only where the returns resolve it (else it is noise between the dots)
    float kept0 = s * exp2(0.5 * max(kd, 0.0));
    dg *= 1.0 - smoothstep(${(DET.l2 * .35).toFixed(2)}, ${(DET.l1 * .45).toFixed(2)}, kept0);
    n = normalize(vec3(-g.x, 1.0, -g.y));
    float slope = sqrt(g2);
    if (big > 0.25) { xz -= N.xy * (dhc / g2); y -= dhc; }
    // shading from an exaggerated normal: the relief reads like the films' survey at true height; the light is
    // the view's (behind the lens, to the left, like a map's hillshade) blended with the moon, so the faces the
    // camera sees are the lit ones from any heading. The relief is taken at the scale the returns resolve
    vec4 Ns = mapNs(w, 1.4 * kept0);
    vec2 gs = Ns.xy * (uRelief * uDot2.y) + dg * 4.0;
    vec3 ns = normalize(vec3(-gs.x, 1.0, -gs.y));
    vec3 Lk = normalize(mix(uSun.xyz, uLit.xyz, uLit.w));
    float sh = clamp((dot(ns, Lk) + 0.25) / 1.25, 0.0, 1.0);      // wrapped: faces turned away stay faintly lit
    b = 0.06 + 0.84 * pow(sh, 1.8);
    b += 0.07 * clamp(h / 500.0, 0.0, 1.0);
    b += clamp(Ns.z * uLand.z * clamp(1.4 * kept0 * uMap.z, 1.0, 6.0), -0.12, 0.4);   // crests bright, gullies dark
    // prominence over the land round about (at ~10 spacings): hills and bluffs brighter, valleys darker, so the
    // relief reads at the map scale from high up
    float hb = mapNs(w, 10.0 * kept0).w;
    b += uTex2.x * clamp((h - hb) / max(8.0, 0.2 * kept0), -1.0, 1.0);
    if (big > 0.25) b = max(b, 0.3) + 0.3;
    float flatk = 1.0 - smoothstep(0.012, 0.05, slope);
    // beaches: sand just above the waterline on gentle ground returns bright and smooth
    float beach = uTex.z * (1.0 - smoothstep(0.8, 2.8, h)) * (1.0 - smoothstep(0.02, 0.1, slope));
    b = mix(b, 0.28 + 0.24 * sh, beach);
    // flat low ground: a patchwork of fields (tone per plot, darker tracks between them), districts turned
    float fk = uTex.x * flatk * smoothstep(3.0, 9.0, h) * (1.0 - smoothstep(140.0, 260.0, h));
    if (fk > 0.01) {
      vec2 dw1, dw2;
      vec2 dc = floor((w + 900.0 * vec2(vnoise(w / 2300.0 + 3.1, dw1), vnoise(w / 2300.0 - 5.7, dw2))) / 3100.0);
      uint hd = hash2(uo(int(dc.x)) ^ 0x6a09e667u, uo(int(dc.y)));
      float ang = u01(hd) * 1.5708, ca = cos(ang), sa = sin(ang);
      vec2 r = vec2(ca * w.x + sa * w.y, -sa * w.x + ca * w.y);
      vec2 cs = vec2(360.0 + 240.0 * u01(hash1(hd)), 170.0 + 130.0 * u01(hash1(hd ^ 0x9e37u)));
      float row = floor(r.y / cs.y);
      r.x += cs.x * u01(hash1(uint(int(row)) ^ hd));
      vec2 cid = vec2(floor(r.x / cs.x), row);
      vec2 fr = r / cs - cid;
      uint hc = hash2(uo(int(cid.x)) ^ hd, uo(int(cid.y)));
      float tone = u01(hc) - 0.5, ex = min(fr.x, 1.0 - fr.x) * cs.x;
      float sp = 0.3 + 0.4 * u01(hash1(hc ^ 0x85ebu));
      if (u01(hash1(hc)) < 0.45) { ex = min(ex, abs(fr.x - sp) * cs.x); if (fr.x > sp) tone = u01(hash1(hc ^ 0x27d4u)) - 0.5; }
      float edge = min(ex, min(fr.y, 1.0 - fr.y) * cs.y);
      b *= 1.0 + fk * (0.28 * tone - 0.34 * (1.0 - smoothstep(1.5, 5.5, edge)));
    }
    // marsh: flat ground a few metres up, standing water swallowing the pulse in patches
    float mk = uTex.y * flatk * (1.0 - smoothstep(2.0, 5.5, h));
    if (mk > 0.01) {
      vec2 dm;
      float pool = smoothstep(0.05, 0.5, vnoise(w / 170.0 + 5.3, dm)) * mk;
      if (u01(hash1(hs ^ 0x1f83d9abu)) < pool * 0.7) { ${CULL} return; }
      b *= 1.0 - 0.3 * pool;
    }
    b = min(1.0, b * uLand.x);
    b *= mix(1.0, uLand.w, smoothstep(0.0, 3000.0, dout));
  } else {
    sea = 1.0;
    // the sea: returns at a constant horizontal spacing on screen, denser in the surf zone
    float sf = dout <= 0.0 ? clamp(1.0 - dsh / uSurf.x, 0.0, 1.0) : 0.0;
    // the kept spacing (world m) grows with the range; banded like the films' sea (each band keeps one lattice,
    // denser on screen toward its far edge, then thins into the next): rows of density receding to the horizon
    // (the films' Aegis sea: the wanted spacing follows the horizontal distance, so steep views are denser)
    // seen low, the returns keep a constant horizontal spacing on screen (the rows compress toward the horizon and
    // pile up into its band); seen steeply they keep a screen area each (the films' fine sea from a few km up: the
    // sea reads as a surface, never as a sparse star field)
    float dh = length(p0.xz) + 0.6 * abs(p0.y);
    float usH = log2(uSeaP.y * (1.0 - 0.5 * sf * sf) * dh / uCam.x);
    float usA = log2(sqrt(uSea3.x / max(fg, 0.02)) * (1.0 - 0.3 * sf * sf) / uCam.x) + mix(uSea4.x, log2(length(p0)), uSea4.y);
    float us = min(usH, usA), kSteep = clamp((usH - usA) * 1.5, 0.0, 1.0);
    float ub = us * 0.5;
    us = mix(us, 2.0 * (floor(ub) + smoothstep(0.8, 1.0, fract(ub))) + 0.8, uDot2.w);
    kd = 2.0 * (us - log2(s));
    float lr = seaRank();
    vis *= keepOrdered(lr, kd, hs);
    if (vis < 0.02) { ${CULL} return; }
    // the sea's own (isotropic) jitter; near the coast it must not land on land
    vec2 xs = seaXZ(lr, kd, uSea4.w);
    if (dsh < length(xs - xz) + 2.0) { float d2; if (mapH(xs + uEyeW.xz, d2) > 0.0) { ${CULL} return; } }
    xz = xs;
    vec2 gw;
    y = swell(xz, gw) * uMisc.x;
    gw *= uMisc.x;
    n = normalize(vec3(-gw.x, 1.0, -gw.y));
    float A = max(0.05, uSeaP.w * uMisc.x);
    float sw = clamp((y / A + 1.0) * 0.5, 0.0, 1.0);     // 0 trough .. 1 crest
    vec3 pv = vec3(xz.x, y - uEyeW.y, xz.y);
    pv.y -= curveDrop(pv);
    vec3 v = normalize(pv);
    // facing: the faces of the swell turned to the lens return more; its backs, seen from low, return little
    float face = clamp(-dot(n, v) / max(0.003, -v.y), 0.0, 2.5);
    vis *= 0.3 + 0.7 * smoothstep(0.03, 0.3, face);
    // the films' slow flicker: each return has its own phase
    float tw = fract(u01(hs) + uSurf.z * 0.37);
    tw = tw < 0.5 ? tw * 2.0 : 2.0 - tw * 2.0;
    // wind rows: a slow texture stretched along the wind
    float cs = cos(uSeaP.z), sn = sin(uSeaP.z);
    vec2 wr = vec2(cs * w.x - sn * w.y, sn * w.x + cs * w.y);
    vec2 dd;
    float tex = exp(1.2 * (0.65 * vnoise(wr * vec2(0.00042, 0.0007) + 3.7, dd) + 0.35 * vnoise(wr * vec2(0.0011, 0.0019) + 9.1, dd)) - 0.2);
    b = uSeaP.x * (0.1 + 0.5 * sw * sw + 0.22 * min(face, 2.5) + 0.12 * tw) * mix(1.0, tex, 0.45);
    // swell trains: long groups of waves walking downwind, what the sea shows from high up
    vec2 wd = vec2(sin(uSeaP.z), cos(uSeaP.z)), wd2 = vec2(sin(uSeaP.z + 0.7), cos(uSeaP.z + 0.7));
    float gm = 0.5 + 0.3 * sin(dot(w, wd) * 0.00571 - uSurf.z * 0.236) + 0.2 * sin(dot(w, wd2) * 0.00898 - uSurf.z * 0.297 + 1.3);
    b *= mix(1.0, 0.3 + 1.1 * gm, uSeaGrp);
    // the swell's rows, near and mid range (the films' orderly sea): the long swell's crests print as rows of returns,
    // kept and bright, with dark thinned troughs between them; world-fixed, walking downwind with the swell. Where the
    // rows resolve on screen (their spacing there: the wavelength foreshortened across and along the view)
    vec2 k0 = uWave[0].xy;
    float kl = length(k0), rc = 0.5 + 0.5 * sin(dot(k0, xz) + uWave[0].w);
    vec2 kh = k0 / max(1e-6, kl), fh = p0.xz * inversesqrt(max(1e-6, dot(p0.xz, p0.xz)));
    float rowPx = 6.2832 / kl * uCam.x / length(p0) * length(vec2(kh.x * fh.y - kh.y * fh.x, dot(kh, fh) * fg));
    float kRow = uSeaRow.x * smoothstep(2.5, 7.0, rowPx) * (1.0 - 0.6 * uSea2.x);
    float rv = mix(sw, rc, 0.7);
    float kR = uSea3.w * (1.0 - kRow);
    float rowv = rv, kk = kRow;
    // from a few km up, where the swell itself is too fine on screen, its trains print instead
    if (kR > kRow) { rowv = gm; kk = kR; }
    if (kk > 0.0) {
      if (u01(hash1(hs ^ 0x2545f491u)) > mix(1.0, uSeaRow.y + (1.0 - uSeaRow.y) * smoothstep(0.18, 0.72, rowv), kk)) { ${CULL} return; }
      b *= mix(1.0, uSeaRow.z + uSeaRow.w * rowv * rowv, kk);
    }
    // seen steeply the returns are denser, so each is dimmer: a fine surface, not a scatter of bright points
    b *= mix(1.0, uSea4.z, kSteep);
    // glints: now and then a facet flashes at the lens
    uint hg = hash1(hs ^ 0x7f4a7c15u);
    if (u01(hg) < uSea2.z * (0.02 + 0.05 * face) * (1.0 - kR)) {
      float gp = u01(hash1(hg)) * 6.2832 + uSurf.z * (1.3 + 2.6 * u01(hg ^ 0x5bd1u));
      glint = pow(max(0.0, sin(gp)), 14.0);
      b = max(b, glint * (0.55 + 0.25 * face));
    }
    // whitecaps: breaking crests in a rough sea, each patch lives a few seconds
    if (uSea2.y > 0.0) {
      vec2 cc = floor(w / 28.0);
      uint hc = hash2(uo(int(cc.x)) ^ 0x2f1u, uo(int(cc.y)));
      float cyc = fract(u01(hc) + uSurf.z / (5.0 + 5.0 * u01(hash1(hc))));
      float life = smoothstep(0.0, 0.06, cyc) * (1.0 - smoothstep(0.2, 0.55, cyc));
      float wc = smoothstep(0.6, 0.9, sw) * life * step(u01(hash1(hc ^ 0x7feb1u)), 0.2 + 0.5 * uSea2.y) * uSea2.y;
      if (wc > 0.05) { b = max(b, 0.95 * wc); glint = max(glint, wc); }
    }
    // the horizon: the last returns before it pile up into a bright line (the films' band below the horizon)
    float hz = asin(clamp(v.y, -1.0, 1.0)) + uHz.x;       // elevation above the geometric horizon (rad, <= 0)
    glowH = uHz.y * exp(hz / (0.0079 + 0.3 * uHz.x)) * (0.55 + 0.45 * u01(hash1(hs ^ 0x2b7e1516u)));
    // surf: lines of foam walking in to the shore
    if (sf > 0.0) {
      float wv = 0.5 + 0.5 * sin(dsh * 0.45 - uSurf.z * 1.3 + u01(hs) * 1.5);
      b = max(b, (0.2 + 0.6 * wv * wv) * sf * uSurf.y * uCoast.y);
    }
  }
  vec3 p = vec3(xz.x, y - uEyeW.y, xz.y);
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  gl_Position = c;
  // spacing of the kept dots on screen (1080 px): it sets the dot size (and dims the sparse near field a little)
  float pk = s * exp2(0.5 * max(kd, 0.0)) * uCam.x / c.w;
  float eff = land > 0.5 ? pk * sqrt(max(0.05, abs(dot(n, normalize(p))))) : pk * sqrt(max(0.02, fg));
  if (eff > uDot.z) b *= mix(1.0, uDot.z / eff, 0.6);
  // the sea keeps its brightness out to the horizon (the films'), the land fades with the view
  b = max(b * (sea > 0.5 ? max(0.33, 1.0 - c.w / uDot2.z) : depthFade(c.w)), glowH) * vis * uFade.z;
  // haze: the returns fade with the range (the near sea and ground as they are, the far field and the horizon's band
  // going out toward a floor)
  if (uSea3.y > 0.0) b *= mix(uSea3.z, 1.0, exp(-c.w / uSea3.y));
  b *= subjDim(p, c);
  vec2 sc = scanAt(p);
  vec2 sw2 = sweepAt(p);
  col = mix(col, uScanC[0].rgb, 0.35 * sc.y);
  vec3 lit = lightsAt(p, n);
  vec3 rgb = col * min(b, 1.0) + lit * 0.9;
  float ke = max(sc.x, sw2.x);
  if (ke > 0.01) rgb = max(mix(rgb, LIME * max(b, 0.9), ke), rgb);
  rgb += WH * b * 0.55 * sw2.y;
  vCol = min(rgb, vec3(1.0));
  // dot size (the films): the sea's returns are 2 px only near the lens, the land's out to a few lens heights
  // where they sit apart on screen, 3 px on the nearest faces; glints and whitecaps flash 2 px
  float dth = 0.8 + 0.4 * u01(hash1(hs ^ 0x85ebca6bu));
  float ps;
  if (sea > 0.5) ps = (eff > uSea2.w * dth && c.w < uCoast.w * dth) || glint > 0.5 ? 2.0 : 1.0;
  else ps = c.w > uDot2.x * dth ? 1.0 : eff > uDot.y * dth ? 3.0 : (eff > uDot.x * dth ? 2.0 : 1.0);
  if (big > 0.75 && c.w < uWl2) ps = max(ps, 2.0);
  gl_PointSize = max(1.0, floor(ps * uCam.y + 0.5));
}
`;

const VS_SEABED = HEAD + FRAME + COMMON + LATTICE + SEA_GLSL + `
out vec3 vCol;
void main() {
  float s, vis; uint hs;
  if (!latticeDot(s, vis, hs)) { ${CULL} return; }
  float lr = seaRank();
  // the kept density from the lattice position (the jitter below is capped at the kept spacing)
  vec3 q0 = vec3(gQ.x, -uEyeW.y, gQ.y);
  float kd = 2.0 * log2(uSeaP.y * uCoast.z * length(q0) / (s * uCam.x));
  vec2 xz = seaXZ(lr, kd, uSea4.w);
  vec2 w = xz + uEyeW.xz;
  float dout;
  float h = mapH(w, dout);
  if (h > -0.4 || h < -40.0) { ${CULL} return; }
  vec3 p = vec3(xz.x, h - uEyeW.y, xz.y);
  p.y -= curveDrop(p);
  float cw = dot(uCamF.xyz, p);
  if (cw < uCam.w) { ${CULL} return; }
  vis *= keepOrdered(lr, kd, hs);
  if (vis < 0.02) { ${CULL} return; }
  vec4 N = mapN(w);
  vec3 n = normalize(vec3(-N.x, 1.0, -N.y));
  vec4 c = toClip(p);
  gl_Position = c;
  float b = 0.28 * exp(h / 9.0) * (0.45 + 0.55 * max(0.0, dot(n, uSun.xyz)));
  b *= depthFade(c.w) * vis * uFade.z;
  vCol = WH * b;
  gl_PointSize = max(1.0, floor(uCam.y + 0.5));
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

/* sky: dots at infinity. The band of returns rides the horizon (dipped by the lens height), glowing toward one
   azimuth (dusk); sparse stars above it */
const VS_SKY = HEAD + FRAME + COMMON + `
layout(location = 0) in vec4 aDir;     // xyz direction, w brightness
layout(location = 1) in float aPh;     // twinkle phase; + 10: a return of the horizon band
out vec3 vCol;
uniform vec4 uSkyP;                    // x: stars, y: band, z: horizon dip (rad), w: glow azimuth (rad, clockwise from north)
uniform float uSkyG;                   // glow: 0 even all round .. 1 all toward the azimuth
void main() {
  vec3 d = aDir.xyz;
  float k = uSkyP.x, ph = aPh;
  if (aPh >= 10.0) {
    ph -= 10.0;
    float ce = length(d.xz), se = d.y, cd = cos(uSkyP.z), sd = sin(uSkyP.z);
    vec2 hz = d.xz / max(1e-6, ce);
    d = vec3(hz * (ce * cd + se * sd), se * cd - ce * sd).xzy;
    float gl = pow(max(0.0, cos(atan(hz.x, hz.y) - uSkyP.w)), 3.0);
    k = uSkyP.y * mix(1.0, 0.3 + 0.7 * gl, uSkyG);
  }
  if (k <= 0.002) { ${CULL} return; }
  vec4 c = uVP * vec4(d * 1.0e7, 1.0);
  if (c.w <= 0.0) { ${CULL} return; }
  c.z = c.w * 0.999999;
  gl_Position = c;
  float tw = 0.8 + 0.2 * sin(uEyeW.w * 1.3 + ph);
  vCol = vec3(0.866, 0.906, 0.824) * aDir.w * tw * k * uFade.z;
  gl_PointSize = max(1.0, floor(uCam.y + 0.5));
}
`;

/* the look per weather: sea brightness, spacing on screen, roughness, whitecaps, glints; sky stars and band */
const WEATHER_LOOK = {
  calm: { seaB: .82, seaPx: 1.12, stars: 1, band: 1, glintK: 1, hazeD: 0 },
  haze: { seaB: .82, seaPx: 1.12, stars: .35, band: .8, glintK: .6, hazeD: 9000 },
  rain: { seaB: .9, seaPx: 1, stars: 0, band: .75, glintK: .3, hazeD: 0 },
  storm: { seaB: .9, seaPx: 1, stars: 0, band: .55, glintK: .4, hazeD: 0 },
};
const TIME_LOOK = {
  night: { stars: .9, band: 1.1, glowAz: 250, glow: .6 },
  dusk: { stars: .45, band: 1.1, glowAz: 288, glow: .66 },
  day: { stars: 0, band: 1, glowAz: 110, glow: .3 },
};

export class Terrain {
  constructor(G, map, opts) {
    opts = opts || {};
    this.G = G; this.gl = G.gl; this.map = map;
    this.N = opts.grid || 640;                 // dots per level side (multiple of 64)
    this.densNear = opts.densNear || 140;      // lens height / finest spacing, near the ground ...
    this.densFar = opts.densFar || 380;        // ... and from high up
    this.jitter = opts.jitter || .75;          // along the scan rows, of the pattern spacing (the films: +-0.35)
    this.rowJitter = opts.rowJitter !== undefined ? opts.rowJitter : .25;   // across the land's rows when rowK > 0 (small: the scan rows read)
    this.rowK = opts.rowK !== undefined ? opts.rowK : 1;    // land rows 2^rowK times further apart than the returns along them (subtle scan rows; 0: an even lattice)
    this.relief = opts.relief || 0;            // normal exaggeration for the shading (heights stay true); 0 = from the map's slopes
    this.areaNear = opts.areaNear || 56;       // screen px^2 per land dot (the films' survey: ~42-65), near the ground ...
    this.areaFar = opts.areaFar || 22;         // ... and from high up (the films' coast map: ~20-30)
    this.landHigh = opts.landHigh !== undefined ? opts.landHigh : 1.15;     // land brighter from high up (x 1 + landHigh): the coast map reads
    this.seaHigh = opts.seaHigh || [.5, .45];  // from high up the sea's returns thin (x 1 + [0]) and dim (x 1 - [1]): the coast map reads
    this.grazing = opts.grazing !== undefined ? opts.grazing : .1;          // floor of the land budget's facing (packs the far field)
    this.seaPx = opts.seaPx || 16;             // horizontal spacing of the sea returns on screen seen low (1080 px; the films: Aegis 7, Engagement 15-45)
    this.seaArea = opts.seaArea || 12;         // screen area per sea return seen steeply (1080 px^2, before the bands and the swell rows thin it)
    this.seaRows = opts.seaRows !== undefined ? opts.seaRows : 1;          // the swell's rows and trains from mid altitude (0 off)
    this.seaRecede = opts.seaRecede !== undefined ? opts.seaRecede : .5;   // seen steeply: 1 an even density on screen, less denser far off
    this.seaMidBright = opts.seaMidBright !== undefined ? opts.seaMidBright : .15;   // the sea's returns brighten from the lens to a few km up
    this.seaSteepB = opts.seaSteepB !== undefined ? opts.seaSteepB : .65;   // brightness of the (denser) returns of the sea seen steeply
    this.haze = opts.haze !== undefined ? opts.haze : null;                 // haze distance (m): null from the weather, 0 none
    this.hazeFloor = opts.hazeFloor !== undefined ? opts.hazeFloor : .22;   // what haze leaves of the far field
    this.hazeTop = opts.hazeTop || 1500;       // the haze layer's top (m): from above it the view down is clear (only the
                                               // part of the ray inside the layer hazes)
    this.seaNear = opts.seaNear || 1200;       // sea returns are 2 px nearer than this (m; less from low down, more from high up)
    this.seaBands = opts.seaBands !== undefined ? opts.seaBands : .7;       // the films' banded sea (0 = even, 1 = Engagement)
    this.seaJitter = opts.seaJitter !== undefined ? opts.seaJitter : .6;    // the sea lattice's jitter, of the kept spacing (the films: .7)
    this.seaSwellRows = opts.seaSwellRows !== undefined ? opts.seaSwellRows : 1;   // the long swell's crest rows, near and mid range (0 off)
    this.seaRowKeep = opts.seaRowKeep !== undefined ? opts.seaRowKeep : .3;      // ... share of the returns kept in a trough
    this.seaRowDark = opts.seaRowDark !== undefined ? opts.seaRowDark : .42;     // ... brightness in a trough
    this.seaRowCrest = opts.seaRowCrest !== undefined ? opts.seaRowCrest : 1.05; // ... added on a crest
    this.reliefHigh = opts.reliefHigh !== undefined ? opts.reliefHigh : 2;    // extra shading exaggeration from high up
    this.coastPx = opts.coastPx || .34;        // waterline dots per px of coast
    this.lightFollow = opts.lightFollow !== undefined ? opts.lightFollow : 1;     // land light: 0 the moon (renderer.sun) .. 1 the view's light
    this.lightAz = opts.lightAz !== undefined ? opts.lightAz : -2.0;              // the view's light: off the camera heading (rad, + clockwise; -2 = behind left)
    this.lightEl = opts.lightEl !== undefined ? opts.lightEl : 32 * DEG;          // ... and its elevation
    this.fields = opts.fields !== undefined ? opts.fields : 1;               // field patchwork on flat low ground
    this.marsh = opts.marsh !== undefined ? opts.marsh : 1;
    this.beach = opts.beach !== undefined ? opts.beach : .6;
    this.landBright = opts.landBright || .8;     // at play altitudes the ground stays under the units (the films)
    this.dotPx = opts.dotPx || [4.2, 15, 22];  // 2 px / 3 px thresholds, dimming above (on-screen spacing, 1080-px)
    this.seaDot2 = opts.seaDot2 || 3.4;        // sea dots are 2 px above this on-screen spacing
    this.contours = opts.contours !== undefined ? opts.contours : 1;        // contour emphasis from high up
    this.prominence = opts.prominence !== undefined ? opts.prominence : .22; // hills bright, valleys dark at the map scale
    this.subjectDim = opts.subjectDim !== undefined ? opts.subjectDim : .5;   // world dimming round the units on screen (0 off)
    this.subjectBack = opts.subjectBack !== undefined ? opts.subjectBack : .55; // ... and behind them on screen
    this.seaKeep = opts.seaKeep !== undefined ? opts.seaKeep : .3;          // (kept for compatibility; seaPx sets the sea)
    this.stats = { blocks: 0, levels: 0, s0: 0, dots: 0 };
    // sky knobs (the weather and the time of day set them; SENSORS may override: stars 0 under a storm ceiling)
    this.sky = { stars: 1, band: 1, glowAz: 220 * DEG, glow: .35 };
    this.time = map.time || 'night';
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
      NT[o] = gx; NT[o + 1] = gz; NT[o + 2] = -lap * 900; NT[o + 3] = h;
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
    // RGBA16F gradient texture (filterable), with a box-filtered mip chain: the land is shaded from the relief at
    // the scale its returns resolve (hillshade that stays readable from high up instead of aliasing into noise)
    this.nTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.nTex);
    {
      let w = this.cols, h = this.rows, src = this.NT;
      const levels = [[w, h, src]];
      while (w > 1 || h > 1) {
        const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1), dst = new Float32Array(w2 * h2 * 4);
        for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++) {
          const i0 = Math.min(w - 1, i * 2), i1 = Math.min(w - 1, i * 2 + 1), j0 = Math.min(h - 1, j * 2), j1 = Math.min(h - 1, j * 2 + 1);
          const a = (j0 * w + i0) * 4, b = (j0 * w + i1) * 4, c = (j1 * w + i0) * 4, d = (j1 * w + i1) * 4, o = (j * w2 + i) * 4;
          for (let k = 0; k < 4; k++) dst[o + k] = (src[a + k] + src[b + k] + src[c + k] + src[d + k]) * .25;
        }
        levels.push([w2, h2, dst]); w = w2; h = h2; src = dst;
      }
      gl.texStorage2D(gl.TEXTURE_2D, levels.length, gl.RGBA16F, this.cols, this.rows);
      levels.forEach(([lw, lh, data], k) => gl.texSubImage2D(gl.TEXTURE_2D, k, 0, 0, lw, lh, gl.RGBA, gl.FLOAT, data));
      this.nLevels = levels.length;
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
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
    for (let i = 0; i < 1500; i++) {              // stars: sparse and dim above the band (the films' skies are nearly empty:
      // the sky must never read like the sea's returns)
      const u = rs(), az = rs() * Math.PI * 2, el = Math.asin(.14 + .86 * Math.pow(u, 1.25)), mg = Math.pow(rs(), 3.4);
      if (i % 3 === 2) continue;
      S.push(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az), .05 + .36 * mg, rs() * 6.28);
    }
    for (let i = 0; i < 26000; i++) {             // the band of returns low over the horizon (the films' sky)
      const az = rs() * Math.PI * 2, el = Math.pow(rs(), 2.4) * 20 * DEG;
      const b = (.16 + .6 * Math.exp(-el / (3.4 * DEG))) * (.75 + .25 * rs());
      S.push(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az), b, 10 + rs() * 6.28);
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
    this.subA = new Float32Array(NSUB * 4); this.subB = new Float32Array(NSUB * 4); this.nSub = 0;
    this.setWeather(this.map.weather || {});
  }

  /* sea state from the map's weather: swell components round the wind direction. w: { kind, wind: [dx, dz],
     sea: 0..1 } (kind is kept from before when left out). Also sets the sky's stars and band (this.sky). */
  setWeather(w) {
    w = w || {};
    const wind = w.wind || this.wind || [3, -2], ang = Math.atan2(wind[0], wind[1]), sea = w.sea !== undefined ? w.sea : this.sea !== undefined ? this.sea : .3;
    // the look follows the kind; without one, a rough sea reads as a storm and a storm that calms down clears
    this.kind = w.kind || (sea >= .75 ? 'storm' : this.kind === 'storm' && sea < .5 ? 'calm' : this.kind) || 'calm';
    this.wind = wind; this.sea = sea;
    this.seaAmp = .45 + 1.7 * sea;
    this.windAng = ang;
    // a longer, steeper swell as the sea gets up; a glassy low swell in a calm
    const Ls = .8 + .6 * sea;
    const comps = [[144 * Ls, .85, 0], [96 * Ls, .45, .55], [58 * Ls, .25, -.7], [31 * Ls, .12, 1.2]];
    this.waves = comps.map(([L, A, da], k) => { const kk = 2 * Math.PI / L, a = ang + da; return { kx: Math.sin(a) * kk, kz: Math.cos(a) * kk, A, w: Math.sqrt(9.81 * kk), ph: k * 1.7 + .3 }; });
    this.waveA = comps.reduce((s, c) => s + c[1], 0);
    const L = WEATHER_LOOK[this.kind] || WEATHER_LOOK.calm, T = TIME_LOOK[this.time] || TIME_LOOK.night;
    this.rough = ss(.1, .8, sea);                         // 0 glassy .. 1 storm
    this.whitecaps = ss(.45, .85, sea) * (this.kind === 'storm' ? 1 : .7);
    this.glints = L.glintK * (1 - .5 * this.rough);
    this.seaLook = { bright: L.seaB * (.85 + .2 * this.rough), px: this.seaPx * L.seaPx * (1.1 - .15 * this.rough) };
    this.sky.stars = T.stars * L.stars; this.sky.band = T.band * L.band; this.sky.glowAz = T.glowAz * DEG; this.sky.glow = T.glow;
    this.hazeD = this.haze !== null && this.haze !== undefined ? this.haze : L.hazeD;
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
    // contour interval grows with the view; contours show from high up
    // (two intervals and a blend: contours hand over dot by dot as the view grows)
    {
      const CI = [10, 25, 50, 100, 250], x = Math.log(Math.max(1, cam.dist) / 2500) / Math.log(2.6);
      const i = Math.max(0, Math.min(CI.length - 2, Math.floor(x))), f = x < 0 ? 0 : x > CI.length - 1 ? 1 : ss(.75, 1, x - i);
      this.contI = [CI[i], CI[i + 1], f];
      this.contour = f < .5 ? CI[i] : CI[i + 1];
    }
    // land returns are 2 px out to a few lens heights; the relief's shading grows with the altitude (the films
    // exaggerate the relief of their maps)
    this.landNear = Math.min(20000, Math.max(1500, 4 * Hc));
    this.seaAltK = ss(Math.log(6000), Math.log(60000), Math.log(Hc));   // the sea gives way to the coast map from high up
    this.seaMidK = ss(Math.log(400), Math.log(4000), Math.log(Hc));
    this.seaNearD = Math.max(this.seaNear, Math.min(this.seaNear * 2, 6 * Hc));
    this.lookD = cam.dist || Hc;
    // haze sits in a layer over the water: a ray down from above it runs only its last hazeTop / altitude inside it
    this.hazeEff = this.hazeD > 0 ? this.hazeD * Math.max(1, Math.max(1, eye[1]) / this.hazeTop) : 0;
    this.seaFade = 1.5 * horizon + 8000;
    this.wl2 = Math.max(32000, 2.2 * Hc);
    this.reliefK = 1 + this.reliefHigh * this.altK;
    this.contourK = this.contours * ss(Math.log(1500), Math.log(9000), Math.log(Hc));
    // the land's second light, fixed to the view (like a map's hillshade): from lightAz off the camera heading,
    // lightEl up, so the relief reads from any heading
    const fh = Math.hypot(f[0], f[2]), az = (fh > 1e-4 ? Math.atan2(f[0], f[2]) : cam.yaw || 0) + this.lightAz, le = this.lightEl;
    this.litCam = [Math.cos(le) * Math.sin(az), Math.sin(le), Math.cos(le) * Math.cos(az)];
    this.dip = Math.acos(R_EARTH / (R_EARTH + Math.max(1, eye[1])));
    Object.assign(this.stats, { blocks: n, levels: L, s0, frac: +frac.toFixed(2), dots: n * B * B });
  }

  /* the units on screen, biggest first (the renderer calls this every frame): list of { c: centre RTE [x, y, z],
     r: halo radius (m), sx, sy: screen centre (1080-px units from the centre), sr: screen radius (1080 px), z: depth } */
  setSubjects(list) {
    const n = Math.min(NSUB, list.length), A = this.subA, Bq = this.subB;
    for (let i = 0; i < n; i++) {
      const s = list[i];
      A[i * 4] = s.c[0]; A[i * 4 + 1] = s.c[1]; A[i * 4 + 2] = s.c[2]; A[i * 4 + 3] = s.r;
      Bq[i * 4] = s.sx; Bq[i * 4 + 1] = s.sy; Bq[i * 4 + 2] = s.sr; Bq[i * 4 + 3] = s.z;
    }
    this.nSub = n;
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
    if (u.uJit) gl.uniform2f(u.uJit, this.jitter, this.rowJitter);
    if (u.uRowK) gl.uniform1i(u.uRowK, this.rowK);
    if (u.uRelief) gl.uniform1f(u.uRelief, this.relief);
    if (u.uDot) gl.uniform4f(u.uDot, this.dotPx[0], this.dotPx[1], this.dotPx[2], this.area);
    if (u.uLv) gl.uniform4fv(u.uLv, this.uLv);
    if (u.uLvI) gl.uniform4iv(u.uLvI, this.uLvI);
    if (u.uHole) gl.uniform4iv(u.uHole, this.uHole);
    if (u.uMap) gl.uniform4f(u.uMap, this.x0, this.z0, 1 / this.cell, this.cell);
    if (u.uMapN) gl.uniform2i(u.uMapN, this.cols, this.rows);
    if (u.uWave) gl.uniform4fv(u.uWave, this.uWave);
    if (u.uSeaP) gl.uniform4f(u.uSeaP, this._seaB || 0, this.seaLook.px * (1 + this.seaHigh[0] * (this.seaAltK || 0)), this.windAng, this.waveA);
    if (u.uCoast) gl.uniform4f(u.uCoast, this.coastPx * (1 + .4 * (this.altK || 0)), 1, 1.35, this.seaNearD);
    if (u.uDot2) gl.uniform4f(u.uDot2, this.landNear, this.reliefK, this.seaFade, this.seaBands);
    if (u.uWl2) gl.uniform1f(u.uWl2, this.wl2);
    if (u.uSeaGrp) gl.uniform1f(u.uSeaGrp, .3 + .5 * (this.altK || 0));
    if (u.uHz) gl.uniform2f(u.uHz, this.dip || 0, .6 * this.sky.band);
    // (the screen-area rule takes over from a few hundred metres up: close to the water the films' spacing rule holds)
    if (u.uSea3) gl.uniform4f(u.uSea3, this.seaArea * Math.pow(16, 1 - (this.seaMidK || 0)) * Math.pow(1 + this.seaHigh[0] * (this.seaAltK || 0), 2), this.hazeEff || 0, this.hazeFloor, this.seaRows * (this.seaMidK || 0));
    if (u.uSeaRow) gl.uniform4f(u.uSeaRow, this.seaSwellRows, this.seaRowKeep, this.seaRowDark, this.seaRowCrest);
    if (u.uSea4) gl.uniform4f(u.uSea4, Math.log2(Math.max(50, this.lookD || 1000)), this.seaRecede, this.seaSteepB, this.seaJitter);
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
    const k = this.altK || 0;
    // the sea brightens from the lens out to a few km up (the films'), then gives way to the coast map
    this._seaB = (o.seaBright || 1) * this.seaLook.bright * 1.1 * (1 + this.seaMidBright * (this.seaMidK || 0)) * (1 - this.seaHigh[1] * (this.seaAltK || 0));
    this._bindCommon(P);
    gl.uniform1ui(u.uSalt, 0);
    gl.uniform4f(u.uSea2, this.rough, this.whitecaps, this.glints, this.seaDot2);
    gl.uniform4f(u.uSurf, 70, 1.0, this.t, this.contour);
    gl.uniform4f(u.uLand, (o.landBright || this.landBright) * (1 + this.landHigh * k), 0, 1, .45);
    gl.uniform4f(u.uCont, this.contI[0], this.contI[1], this.contI[2], Math.min(1, this.contourK));
    gl.uniform4f(u.uLit, this.litCam[0], this.litCam[1], this.litCam[2], this.lightFollow);
    gl.uniform4f(u.uTex, this.fields, this.marsh, this.beach, this.grazing);
    gl.uniform4f(u.uTex2, this.prominence * (.4 + .6 * k), 0, 0, 0);
    gl.uniform4fv(u.uSubA, this.subA); gl.uniform4fv(u.uSubB, this.subB);
    gl.uniform4f(u.uSubP, this.nSub, this.subjectDim, this.G.W / Math.max(1, this.G.H), this.subjectBack);
    gl.drawArraysInstanced(gl.POINTS, 0, B * B, this.nInst);
  }
  drawSky(k) {
    const gl = this.gl, P = this.pSky, S = this.sky;
    k = k === undefined ? 1 : k;
    gl.useProgram(P.p);
    gl.uniform4f(P.u.uSkyP, S.stars * k, S.band * k, this.dip || 0, S.glowAz);
    gl.uniform1f(P.u.uSkyG, S.glow);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.POINTS, 0, this.nSky);
  }
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
