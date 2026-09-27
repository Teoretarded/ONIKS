/* Model point caches: GEO.sample of the HD models, per part, at up to 4 levels of detail (spacing chosen from
   the model's size), uploaded to the GPU on first use. Each frame every part gets its rigid transform
   part.xf(st) and visibility part.show(st); dyn parts (telescoping rams, folding wings, fans with their blades
   in the geometry) are sampled lazily at quantized states and kept in a bounded LRU per part and level. The
   dependencies of a dyn part on the state are found by calling it once through a Proxy.
   Shading is the films' (pc_anatomy_film.js runPts): low moon + facing + rim, back faces thinned to a third
   at 0.09, two-sided panels at 0.45, depth fade, dot size from on-screen spacing; plus a fill light fixed to the
   view. Density is capped per pixel, not per metre (dotSpacing): big hulls seen close keep the films' dot structure
   instead of saturating into a white slab, small units stay dense silhouettes; a cutaway that fills the frame
   (Inspect, the hit replay) prints its interior as the Anatomy films' dotted grey volumes (see README, Models).
   Sampling never stalls a frame: a level is sampled a few primitives at a time within budgetMs, one level at a time. */
import { HEAD, FRAME, COMMON, FS_POINT, CULL } from './shaders.js';
import { program } from './gl.js';

const TAU = Math.PI * 2;
/* state keys that are angles: wrapped and quantized round the circle */
const ANGLE_KEYS = new Set(['wheel', 'fan', 'rotor', 'trotor', 'prop', 'ant', 'sAnt', 'sps', 'ciwsSpin', 'spin', 'rot', 'radar', 'radars', 'spy']);
const ANGLE_STEPS = [72, 48, 24, 12];
const LIN_STEP = 1 / 40;
const LRU_MAX = 64;
const CELL_K = 48;          // cell size code: (c + 128) / CELL_K of the level spacing (0 .. 5.3 x)
const JIT_K = 254;          // jitter code: c / JIT_K cells
const BTMAX = 6;            // blast patches drawn per instance (game/src/blast)
/* sections (game/structure, d.slab): the slab of the model an instance keeps, z0..z1 along the model's +Z, each cut torn
   (jagK: a ragged tear, the same function of the cross-section point on both sides of a break) */
const SLAB_GLSL = `
uniform vec4 uK0;         // the section's lower cut: z (model m), tear amplitude (m), tear seed, heat of the torn edge
uniform vec4 uK1;         // its upper cut (same)
uniform vec4 uKb;         // x torn band (m), y on, z tear wavelength (m), w the hull's axis height (model y, m)
uniform mat3 uKR;         // the instance's model -> world rotation
uniform vec3 uKT;         // its origin, relative to the eye
// (value noise on an integer hash, two octaves and a fine ragged one: an irregular tear, not a sawtooth; game/structure/
// layout.js jagK is the same function)
float jagH(ivec2 c, int s) {
  uint h = (uint(c.x) * 73856093u) ^ (uint(c.y) * 19349663u) ^ (uint(s) * 83492791u);
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h >> 8u) / 16777216.0;
}
float jagV(vec2 q, int s) {
  vec2 i = floor(q), f = q - i, u = f * f * (3.0 - 2.0 * f); ivec2 c = ivec2(i);
  return mix(mix(jagH(c, s), jagH(c + ivec2(1, 0), s), u.x), mix(jagH(c + ivec2(0, 1), s), jagH(c + ivec2(1, 1), s), u.x), u.y);
}
float jagK(vec2 q, float s) {
  int si = int(floor(s * 1000.0));
  vec2 r = q * 3.0 + 4096.0;
  float v = 0.55 * jagV(r * 0.9, si) + 0.3 * jagV(r * 2.3, si + 7) + 0.15 * jagV(r * 6.1, si + 13);
  return clamp((v - 0.5) * 3.2, -1.0, 1.0);
}
`;

export const VS = HEAD + FRAME + COMMON + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aNrm;
layout(location = 2) in vec4 aCU;         // the sample's cell: U axis (x 127), w: its size code
layout(location = 3) in vec4 aCV;         // V axis (x 127), w: its size code
layout(location = 4) in vec4 aCJ;         // xy: where the sample sits in its cell (the jitter, x JIT_K)
uniform mat3 uR;          // part -> world rotation
uniform vec3 uT;          // part origin, relative to the eye
uniform vec4 uTint;       // rgb, strength at the silhouette
uniform vec4 uP;          // alpha, x-ray, damage, sample spacing (m)
uniform vec4 uQ;          // no back faces, tint on the faces (fraction), brightness, dissolve
uniform vec4 uG;          // x-ray gate (Inspect): x mode (0 off, 1 shell: x-ray only behind the front, 2 hidden: drawn
                          // only behind it, 3 part: always drawn), y the part's layering (>= 1: walls stacked along a
                          // line of sight, a bank of cells; the cap counts them), z front band width (m), w afterglow (m)
uniform vec4 uGP;         // gate plane: xyz unit normal (world), w: the front as n.p_rte
uniform vec4 uDen;        // dots per pixel: x least spacing of the kept dots on screen (1080 px, 0: off), y grazing
                          // floor of the facing, z least kept share (the model's coarsest level), w cutaway (0..1: the
                          // highlights on a knee)
uniform vec4 uFill;       // the view's fill light: xyz direction (toward it), w strength
${scarGLSL()}
${blastGLSL()}
uniform vec4 uSub;        // sub-dots: x on-screen spacing of the level they fill to (1080 px; 0 off), y their jitter (of
                          // their lattice's spacing), z largest dot (as an on-screen spacing, 1080 px), w least spacing of
                          // the sub-dots of a finer cell (a stripe, a detail: the per-pixel cap close up)
uniform vec4 uX;          // level cross-fade: x dissolve 0..1, y +1 coming in / -1 going out / 0 none
out vec3 vCol;
${SLAB_GLSL}
/* the sub-lattice: rank r (0..255) of a 16 x 16 Bayer order (every prefix is stratified), rank 0 at the centre */
vec2 subAt(int r) {
  int x = 0, y = 0;
  for (int k = 0; k < 4; k++) { int d = (r >> (2 * k)) & 3; x |= ((d == 1 || d == 2) ? 1 : 0) << (3 - k); y |= (d & 1) << (3 - k); }
  return (vec2(float((x + 8) & 15), float((y + 8) & 15)) + 0.5) / 16.0 - 0.5;
}
float subAt1(int r) {
  int x = 0;
  for (int k = 0; k < 8; k++) x |= ((r >> k) & 1) << (7 - k);
  return (float((x + 128) & 255) + 0.5) / 256.0 - 0.5;
}
void main() {
  vec3 p = uR * aPos + uT;
  int inst = gl_InstanceID;
  uint hid = hash1(uint(gl_VertexID) * 747796405u + uint(inst) * 2654435761u + 2891336453u);
  float hr = u01(hid);
  // sub-dots close up: the sample's cell filled with a stratified sub-lattice (instances 1.. in rank order, each
  // fading in as the range asks for it: no pops), so the dot spacing on screen stays fine at any range. A plate's
  // cells keep their relative size (a painted stripe stays denser than the deck round it); never denser than the
  // per-pixel cap. Instance 0 is the sample itself
  float su = (aCU.w + 128.0) * (1.0 / ${CELL_K.toFixed(1)}) * uP.w, sv = (aCV.w + 128.0) * (1.0 / ${CELL_K.toFixed(1)}) * uP.w;
  float need = 1.0, sub = 1.0;
  bool two0 = dot(aNrm.xyz, aNrm.xyz) < 0.01;
  if (uSub.x > 0.0 && su > 0.0) {
    float cw = dot(uCamF.xyz, p);
    if (cw > uCam.w) {
      float k = uCam.x / cw, pxl = uP.w * k / uSub.x;
      float fk0 = two0 ? 1.0 : max(abs(dot(uR * aNrm.xyz, p)) / max(1e-4, length(p)), uDen.y);
      float cs = max(uDen.x, uSub.w), cap = uDen.x > 0.0 ? cs * cs * max(1.0, uG.y) : 0.0;
      if (sv > 0.0) { need = pxl * pxl; if (cap > 0.0) need = min(need, su * sv * k * k * fk0 / cap); }
      else { need = pxl; if (cap > 0.0) need = min(need, su * k / sqrt(cap)); }
      need = min(need, sv > 0.0 ? 256.0 : 256.0);
    }
  }
  if (inst > 0) {
    if (float(inst) >= need) { ${CULL} return; }
    // what a back face would add is hidden (the depth pass) unless it is an x-ray
    // (on an instance with blast patches they are looked at after them: seen through a hole, the far sides show)
    if (!two0 && uP.y <= 0.0 && uBtN == 0 && dot(uR * aNrm.xyz, p) > 0.0) { ${CULL} return; }
    sub = clamp(need - float(inst), 0.0, 1.0);
    vec2 j = aCJ.xy * (1.0 / ${JIT_K.toFixed(1)}), o;
    vec2 h2 = vec2(u01(hash1(hid ^ 0x9e3779b9u)), u01(hash1(hid ^ 0x7f4a7c15u))) - 0.5;
    if (sv > 0.0) o = subAt(inst) + h2 * uSub.y * exp2(-floor(log2(float(inst)) * 0.5) - 1.0);
    else o = vec2(subAt1(inst) + h2.x * uSub.y * exp2(-floor(log2(float(inst))) - 1.0), j.y);
    p += (uR * (aCU.xyz * (1.0 / 127.0))) * (su * (o.x - j.x)) + (uR * (aCV.xyz * (1.0 / 127.0))) * (sv * (o.y - j.y));
  }
  // a hull broken into sections (game/structure, d.slab): this instance keeps its slab of the model between two torn
  // cuts across its length (jagged; the two sides of a break share the same tear), the plating at the tear peeled out
  float tk = 0.0, th = 0.0;
  if (uKb.y > 0.5) {
    vec3 pm = (p - uKT) * uKR;
    float c0 = uK0.x + uK0.y * jagK(pm.xy / uKb.z, uK0.z), c1 = uK1.x + uK1.y * jagK(pm.xy / uKb.z, uK1.z);
    if (pm.z < c0 || pm.z >= c1) { ${CULL} return; }
    float e0 = (pm.z - c0) / uKb.x, e1 = (c1 - pm.z) / uKb.x;
    if (e0 < 1.0 || e1 < 1.0) {
      bool lo = e0 < e1;
      float e = lo ? e0 : e1, sg = lo ? -1.0 : 1.0, h4 = u01(hash1(hid ^ 0x3c6ef372u));
      tk = 1.0 - e; th = lo ? uK0.w : uK1.w;
      if (h4 < 0.3 * tk * tk) { ${CULL} return; }
      vec2 rd = pm.xy - vec2(0.0, uKb.w);
      float rl = length(rd), cu = tk * tk * uKb.x * (0.2 + 0.6 * h4);
      vec2 rn = rl > 1e-3 ? rd / rl : vec2(0.0, 1.0);
      p += uKR * vec3(rn * cu * 0.6, sg * cu * 0.3);
    }
  }
  // level cross-fade: the outgoing level's dots go out, the incoming one's come in, one by one
  if (uX.y != 0.0) {
    float hh = u01(hash1(hid ^ 0x27d4eb2fu));
    if (uX.y > 0.0 ? hh > uX.x : hh < uX.x) { ${CULL} return; }
  }
  // scars (game/scars.js): the plating dished, bulged, bent, holed, charred where hits struck; the model's own dots in
  // the pocket behind a hole gone (scars.js draws what is inside)
  float burn = 0.0, hot = 0.0, edge = 0.0, heatN = 0.0; gIn = uX.z;
  if (uScN > 0 && scarAt(p, uR * aNrm.xyz, hid, false, burn, hot, edge, heatN) == 1) { ${CULL} return; }
  // blast patches (game/src/blast): the plating as the solver left it
  vec3 btTilt = vec3(0.0);
  if (uBtN > 0 && blastAt(p, uR * aNrm.xyz, false, burn, hot, edge, heatN, btTilt) == 1) { ${CULL} return; }
  if (inst > 0 && !two0 && uP.y <= 0.0 && gHole <= 0.0 && dot(uR * aNrm.xyz, p) > 0.0) { ${CULL} return; }
  if (burn > 0.0 && edge <= 0.0 && u01(hash1(hid ^ 0x1b873593u)) < burn * 0.35) { ${CULL} return; }
  // the torn edge of a section: a bright ragged rim, glowing while the break is fresh, charred behind it
  if (tk > 0.0) { if (tk > 0.6) { edge = max(edge, tk); heatN = max(heatN, th); } hot = max(hot, th * tk * tk * 0.8); burn = max(burn, 0.55 * tk * (1.0 - tk)); }
  float yw = p.y + uEyeW.y;
  float dist = length(p);
  vec3 v = p / max(1e-4, dist);
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  gl_Position = c;
  // (inside a holed hull under the waterline, seen through the hole: the sea surface's occluder (terrain depth pass 1)
  // runs through the ship and would hide it all, black boxes cut at the waterline. Such a dot is drawn at the depth of
  // the point where its line of sight crosses the sea surface, when that point is inside the hull behind the struck
  // plate: it passes the sea's depth, the ship's own splats nearer than that still hide it)
  bool holeWet = false;
  if (gHole > 0.0 && yw < 0.0 && v.y < -1e-3 && uEyeW.y > 0.0) {
    vec3 cx = v * (uEyeW.y / -v.y) * 0.995;
    // (the eye on the struck side, outside; the crossing well inside the plate, not at the waterline's own plating)
    if (gHoleP.w < -0.5 && dot(cx, gHoleP.xyz) - gHoleP.w < -0.6) {
      holeWet = true;
      cx.y -= curveDrop(cx);
      vec4 c2 = toClip(cx);
      if (c2.w > uCam.w) gl_Position.z = c2.z / c2.w * c.w;
    }
  }
  float xr = uP.y, dmg = uP.z;
  if (uQ.w > 0.0 && hr < uQ.w) { ${CULL} return; }
  if (dmg > 0.0 && hr > 1.0 - dmg * 0.22) { ${CULL} return; }
  // the Inspect x-ray slice: a plane front along the model; lime band on this model only
  float gk = 0.0;
  if (uG.x > 0.5) {
    float gd = uGP.w - dot(uGP.xyz, p);
    if (gd <= 0.0) { if (uG.x > 1.5 && uG.x < 2.5) { ${CULL} return; } if (uG.x < 1.5) xr = 0.0; }
    float gw = max(1e-3, uG.z);
    if (gd > -gw * 0.25 && gd < gw) gk = gd < 0.0 ? 1.0 + gd / (gw * 0.25) : 1.0;
    else if (gd >= gw) gk = exp(-(gd - gw) / max(1e-3, uG.w)) * 0.8;
  }
  vec3 n = uR * aNrm.xyz, n0 = n;
  // a blast patch's plating bent: the light follows the bent face (tilted at most ~50 deg: a dent catches light across
  // its slope instead of going black), the facing test stays the model's own face
  if (dot(btTilt, btTilt) > 1e-6 && dot(n, n) > 0.01) { float tl = length(btTilt); n = normalize(n + btTilt * (min(tl, 1.2) / tl) * length(n)); }
  float b, rim = 0.0, fk = 1.0;
  bool two = dot(aNrm.xyz, aNrm.xyz) < 0.01;
  float lit = 0.45;
  // (an interior wall seen through a hole from inside its space: its far side is the face we see)
  if (!two && gHole > 0.0 && dot(n0, v) > 0.0) { n = -n; n0 = -n0; }
  if (two) { b = 0.45; }
  else {
    float dn = dot(n0, v);
    if (dn > 0.0) {
      // back face: a third of them at 0.09 (more under the x-ray: the far wall shows through)
      if (uQ.x > 0.5 && xr <= 0.0) { ${CULL} return; }
      if ((hid % 3u) != 0u && hr > xr * 0.5) { ${CULL} return; }
      b = 0.09; lit = 0.1;
    } else {
      // the moon, and a fill fixed to the view (behind the lens, over its left shoulder): a hull side turned to the
      // camera never goes black from the wrong heading (the films frame their hulls lit); the moon keeps the decks
      float fac = min(1.0, max(-dn, -dot(n, v) * 0.6)), lam = max(dot(n, uSun.xyz), uFill.w * dot(n, uFill.xyz)), w = 1.0 - fac;
      fk = max(fac, uDen.y);
      b = 0.06 + 0.74 * max(lam, 0.0) + 0.14 * fac + 0.34 * w * w * w;
      b *= 0.55 + 0.45 * b;
      // (seen through a hole, the spaces inside keep a little light of their own: walls, decks and ceilings read as
      // dotted structure, never black blocks; the fire adds to it below)
      if (gHole > 0.0) b = max(b, gHole * (0.13 + 0.1 * fac));
      lit = b;
      rim = fac < 0.18 ? 1.0 - fac / 0.18 : 0.0; rim *= rim;
    }
  }
  // dots per pixel, not per metre (the films keep the dot structure on a hull at any framing): the kept dots never
  // pack closer than uDen.x px on screen, faces seen edge-on counted by their facing (down to a floor, so the
  // silhouettes still gather), never thinner than the model's coarsest level (far off a unit stays a solid little
  // silhouette that pops, as in the films). The samples are a jittered grid: a hash keeps it free of moire
  float pxs = uP.w * uCam.x / c.w;
  if (uDen.x > 0.0) {
    float keep = max(pxs * pxs * fk / (uDen.x * uDen.x * max(1.0, uG.y)), uDen.z);
    if (inst == 0 && keep < 1.0 && edge <= 0.0 && u01(hash1(hid ^ 0x5bd1e995u)) > keep) { ${CULL} return; }
  }
  if (xr > 0.0) {
    // the x-ray: the shell thins to a ghost so what is inside reads through it
    if (hr < xr * 0.5) { ${CULL} return; }
    b = mix(b, 0.05 + 0.2 * lit, xr);
  }
  b *= mix(1.0, 0.55, clamp(c.w / uMisc.w, 0.0, 1.0)) * uP.x * uQ.z * uMisc.z;
  if (yw < 0.0 && !holeWet) b *= 0.35;
  // a cutaway's highlights on a knee toward 0.9 (the Anatomy films' interiors and decks top out at ~0.7-0.8): a part
  // brightened over 1 (the interior, the named assemblies) keeps its shading, dotted volumes, never a white block
  if (uDen.w > 0.0 && b > 0.5) b = mix(b, 0.5 + 0.4 * (1.0 - exp((0.5 - b) / 0.4)), uDen.w);
  vec3 col = mix(WH, uTint.rgb, uTint.a * mix(uQ.y, 1.0, rim));
  if (dmg > 0.0) col = mix(col, CORAL, min(1.0, dmg * 1.1));
  if (burn > 0.0) { col = mix(col, vec3(0.62, 0.6, 0.56), burn); b *= 1.0 - 0.72 * burn; }   // (charred, still readable)
  // the torn edge: glowing while hot (warm white to amber), then a charred grey ring
  if (edge > 0.0) { float hk = clamp((heatN - 0.06) / 0.6, 0.0, 1.0); b = max(b, edge * (0.36 + 0.64 * hk) * (0.75 + 0.3 * hr)); col = mix(col, mix(vec3(0.55, 0.53, 0.5), vec3(1.0, 0.72, 0.42), hk), edge); }
  vec2 sc = scanAt(p);
  vec3 rgb = col * b;
  // the rim still hot: warm white at the tear, flickering
  if (hot > 0.01) rgb = max(rgb, vec3(1.0, 0.72, 0.45) * hot * (0.75 + 0.25 * sin(uEyeW.w * 11.0 + hr * 40.0)));
  if (sc.x > 0.01) rgb = max(mix(rgb, uScanC[0].rgb * max(b, 0.95), sc.x), rgb);
  if (sc.y > 0.0) rgb = mix(rgb, rgb * 0.6 + uScanC[0].rgb * b * 0.5, 0.3 * sc.y);
  if (gk > 0.01) rgb = max(mix(rgb, LIME * max(b, 0.95), gk), rgb);
  // charred plating takes little of the light (the fire lights the hull round the hole, the hole stays black); under
  // the water hardly any
  rgb += lightsAt(p, two ? vec3(0.0) : n) * (0.35 + 0.65 * lit) * uP.x * (1.0 - 0.8 * burn * (1.0 - edge)) * (yw < 0.0 && !holeWet ? 0.15 : 1.0);
  vCol = min(rgb * sub, vec3(1.0));
  // the dot's size from the spacing it keeps on screen (the sub-dots' own), capped (never a blob close up)
  float pe = pxs / (sv > 0.0 ? sqrt(max(need, 1.0)) : max(need, 1.0));
  gl_PointSize = dotPx(min(max(pe, uDen.x) * (0.8 + 0.4 * hr), uSub.z) * (edge > 0.0 ? 1.0 + 0.3 * edge : 1.0));
}
`;

/* the occlusion pass: depth only. A front-facing sample splats its whole cell (the parallelogram it stands for on screen,
   exact: the fragment shader drops what lies outside it), pushed back along the line of sight by a share of the cell
   (more for a face seen edge-on), so the model's own dots stay in front and the sea, the sky and the far side behind
   its gaps are hidden */
export const VS_DEPTH = HEAD + FRAME + COMMON + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aNrm;
layout(location = 2) in vec4 aCU;
layout(location = 3) in vec4 aCV;
layout(location = 4) in vec4 aCJ;
uniform mat3 uR;
uniform vec3 uT;
uniform vec4 uP;          // y: push back (cells), w: level spacing (m)
uniform vec4 uVp;         // xy: half the viewport (px), z: largest splat (px), w: least cell splatted (px)
${scarGLSL()}
${blastGLSL()}
out vec4 vAx;             // the cell's axes on screen (px): U xy, V zw
out float vSz;
${SLAB_GLSL}
/* the blast patches' torn field (the cells' torn flags, bilinear: as blastAt reads it) at a point of the undeformed
   plating (n: its normal; 0 for a line): the largest over the plates it is part of (0 intact .. 1 torn) */
float btMk(vec3 p, vec3 n) {
  float m = 0.0;
  for (int i = 0; i < ${BTMAX}; i++) {
    if (i >= uBtN) break;
    vec3 d = p - uBtO[i].xyz;
    if (dot(d, d) > 1600.0) continue;     // (a patch spans 28 m at most)
    vec3 l = vec3(dot(d, uBtX[i].xyz), dot(d, uBtY[i].xyz), dot(d, uBtZ[i].xyz));
    float S = uBtY[i].w, band = uBtZ[i].w;
    for (int k = 0; k < 2; k++) {
      vec4 P = uBtP[i * 2 + k];
      if (P.x < -0.5) continue;
      int ax = int(P.x + 0.5);
      float off = (ax == 0 ? l.x : ax == 1 ? l.y : l.z) - P.y;
      if (abs(off) > band) continue;
      vec3 A = ax == 0 ? uBtX[i].xyz : ax == 1 ? uBtY[i].xyz : uBtZ[i].xyz;
      if (dot(n, n) > 0.01 && abs(dot(n, A)) <= 0.5) continue;
      vec4 Q = uBtQ[i * 2 + k];
      float gx = ((ax == 0 ? l.z : l.x) - P.z) / S - 0.5, gy = ((ax == 1 ? l.z : l.y) - P.w) / S - 0.5;
      if (gx < -0.5 || gy < -0.5 || gx > Q.x - 0.5 || gy > Q.y - 0.5) continue;
      int ci = int(floor(gx)), cj = int(floor(gy)), nx = int(Q.x) - 1, ny = int(Q.y) - 1; float fx = gx - float(ci), fy = gy - float(cj);
      #define TC(a, c) float(int(texelFetch(uBtT, ivec2(int(Q.z) + clamp(a, 0, nx), int(Q.w) + clamp(c, 0, ny)), 0).w) & 1)
      m = max(m, mix(mix(TC(ci, cj), TC(ci + 1, cj), fx), mix(TC(ci, cj + 1), TC(ci + 1, cj + 1), fx), fy));
      #undef TC
    }
  }
  return m;
}
void main() {
  float su = (aCU.w + 128.0) * (1.0 / ${CELL_K.toFixed(1)}) * uP.w, sv = (aCV.w + 128.0) * (1.0 / ${CELL_K.toFixed(1)}) * uP.w;
  if (su <= 0.0 || sv <= 0.0) { ${CULL} return; }
  vec3 U = uR * (aCU.xyz * (1.0 / 127.0)), V = uR * (aCV.xyz * (1.0 / 127.0));
  vec2 j = aCJ.xy * (1.0 / ${JIT_K.toFixed(1)});
  vec3 p = uR * aPos + uT - U * (su * j.x) - V * (sv * j.y);
  // a section of a broken hull (d.slab): only its own slab splats
  if (uKb.y > 0.5) {
    vec3 pm = (p - uKT) * uKR;
    if (pm.z < uK0.x + uK0.y * jagK(pm.xy / uKb.z, uK0.z) || pm.z >= uK1.x + uK1.y * jagK(pm.xy / uKb.z, uK1.z)) { ${CULL} return; }
  }
  // scars: the splats follow the bent plating; a hole's own splats are pushed back to the far end of the pocket
  // behind it (a plug: what is inside shows, the far side of the hull and the sea do not)
  gIn = uP.x;
  bool twoS = false;
  float bendB = 0.0;
  if (uScN > 0) {
    float b0 = 0.0, h0 = 0.0, e0 = 0.0, n0 = 0.0;
    if (scarAt(p, uR * aNrm.xyz, hash1(uint(gl_VertexID) * 747796405u + 2891336453u), true, b0, h0, e0, n0) == 1) { ${CULL} return; }
  }
  if (uBtN > 0) {
    float b0 = 0.0, h0 = 0.0, e0 = 0.0, n0 = 0.0; vec3 t0 = vec3(0.0);
    vec3 pu = p;
    int bk = blastAt(p, uR * aNrm.xyz, true, b0, h0, e0, n0, t0);
    // (the plating's splat: a model cell can be larger than the patch's grid (0.25 m) and reach over the tear from an
    // intact centre, where its own dots are torn away: a black cell-sized block, the hole's outline a staircase. The
    // splat is kept to the part of its cell clear of the torn field: its corners tested at 1, 1/2, 1/4 of the cell)
    // Within ~0.9 m of the tear none at all: the plating there is displaced cell by cell (rolled, dished, its corners
    // flown), a flat splat at its centre's place stands where its own dots are not)
    if (bk == 0 || bk == 4) {
      vec3 nw = uR * aNrm.xyz, U1 = normalize(U), V1 = normalize(V);
      float near = 0.0;
      for (int q = 0; q < 8; q++) {
        float a = float(q) * 0.785398;
        near = max(near, btMk(pu + (U1 * cos(a) + V1 * sin(a)) * 0.9, nw));
      }
      if (near > 0.02) { ${CULL} return; }
      float sk = 1.0;
      for (int q = 0; q < 3; q++) {
        vec3 hu = U * (su * 0.5 * sk), hv = V * (sv * 0.5 * sk);
        if (max(max(btMk(pu + hu + hv, nw), btMk(pu + hu - hv, nw)), max(btMk(pu - hu + hv, nw), btMk(pu - hu - hv, nw))) < 0.02) break;
        sk *= 0.5;
      }
      if (sk < 0.2) { ${CULL} return; }
      su *= sk; sv *= sk;
    }
    if (bk == 1) { ${CULL} return; }
    // (a plug's splat is widened: seen at an angle through the hole, the far end of the pocket is wider than the hole)
    if (bk == 2) { su *= 2.5; sv *= 2.5; }
    if (bk == 4) { su *= 0.4; sv *= 0.4; }
    twoS = bk == 3;
    // (bent plating: the splat is a flat cell at its centre's displacement, the dots follow the bend across it: where
    // the plating is bent steeply (a dent's slope, the lip of a hole) a flat splat stands in front of its neighbours'
    // dots and prints as a black square. Bent past ~22 deg no splat at all (even a small one prints as a dark square
    // in a regular grid), less than that smaller and pushed back by the bend's depth; the
    // buckle facets only light the dots (they do not move them) and are left out of the depth pass's tilt)
    float g = length(t0);
    if (g > 0.4) { ${CULL} return; }
    if (g > 0.04) { bendB = g * 0.55 * max(su, sv); float sk = 1.0 - g; su *= sk; sv *= sk; }
  }
  float dist = length(p);
  vec3 v = p / max(dist, 1e-4);
  float fac;
  if (dot(aNrm.xyz, aNrm.xyz) < 0.01) { vec3 n2 = cross(U, V); fac = abs(dot(n2, v)) / max(1e-4, length(n2)); }
  else { float dn = dot(uR * aNrm.xyz, v); if (dn > -0.02 && !twoS) { ${CULL} return; } fac = abs(dn); }
  if (fac < 0.03) { ${CULL} return; }
  vec3 pc = p; pc.y -= curveDrop(pc);
  vec4 c = uVP * vec4(pc, 1.0);
  if (c.w < uCam.w * 1.5) { ${CULL} return; }
  vec4 du = uVP * vec4(U * su, 0.0), dw = uVP * vec4(V * sv, 0.0);
  float iw = 1.0 / (c.w * c.w);
  vec2 a = (du.xy * c.w - c.xy * du.w) * iw * uVp.xy, b = (dw.xy * c.w - c.xy * dw.w) * iw * uVp.xy;
  // cells under ~1 px need no splat (their dots already touch); a splat larger than its cell would hide the bright
  // edges and decks next to it, which the max blend shows from afar (the films' bright small ships)
  float sz = max(abs(a.x) + abs(b.x), abs(a.y) + abs(b.y));
  if (sz < uVp.w) { ${CULL} return; }
  if (sz > 2.5) sz += 0.5;
  vAx = vec4(a, b); vSz = sz;
  // pushed back: the cell's own depth range (a face seen edge-on spans more) and a little more
  float bias = (uP.y + 0.55 * sqrt(max(0.0, 1.0 - fac * fac)) / max(fac, 0.25)) * max(su, sv) + bendB;
  p *= 1.0 + bias / dist;
  p.y -= curveDrop(p);
  gl_Position = toClip(p);
  gl_PointSize = min(sz, uVp.z);
}
`;
export const FS_DEPTH = HEAD + `
in vec4 vAx;
in float vSz;
out vec4 o;
void main() {
  if (vSz > 2.5) {
    vec2 q = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y) * vSz;
    float det = vAx.x * vAx.w - vAx.z * vAx.y;
    if (abs(det) < 1e-4) discard;
    float s = (q.x * vAx.w - vAx.z * q.y) / det, t = (vAx.x * q.y - q.x * vAx.y) / det;
    if (abs(s) > 0.54 || abs(t) > 0.54) discard;
  }
  o = vec4(0.0);
}
`;

/* scars (game/scars.js, d.scars: its rule and kinds there): the uniforms and scarAt(), shared by the dots and the
   occlusion splats (the splats follow the bent plating; a hole's are pushed back into a plug) */
const SC0 = new Float32Array(32);
function scarGLSL() {
  return `
float gIn = 0.0;                   // this part is inside the hull (an interior part, data/models_interior.js: part.inside)
float gHole = 0.0;                 // (set by blastAt) an interior dot seen through a hole: lit from either side
vec4 gHoleP = vec4(0.0);           // (set with it) the struck plate's plane: xyz its outward normal, w its offset (RTE)
// scars: where hits struck this instance, world-aligned, relative to the eye
uniform vec4 uScA[8];     // xyz: the mark's centre on the surface, w: its radius (m: the hole, the dent, the pockmarks' spread)
uniform vec4 uScB[8];     // xyz: the surface's outward normal there, w: seed
uniform vec4 uScC[8];     // y: reach of the buckling and scorch (x the radius), z: petal depth (x r) | dent depth (x r) |
                          // pockmark hole radius (m), w: heat (0..1)
uniform vec4 uScD[8];     // x: kind (0 hole, 1 dent, 2 pockmarks, 3 rupture), y: depth of the pocket behind a hole (m),
                          // z: +1 blown out (a charge inside) / -1 pushed in, w: pockmarks (< 0: dents only)
uniform int uScN;         // how many (0: none)
/* p (RTE) moved by the marks; n the dot's world normal. -> 1 gone, 2 (depth pass) a hole's plug, 0 kept; burn (charred),
   hot (glowing), edge (a torn edge), heatN (its heat) */
int scarAt(inout vec3 p, vec3 n, uint hid, bool dp, inout float burn, inout float hot, inout float edge, inout float heatN) {
  for (int i = 0; i < 8; i++) {
    if (i >= uScN) break;
    vec4 A = uScA[i], C = uScC[i], K = uScD[i];
    float r = A.w;
    if (r <= 0.0) continue;
    vec3 d = p - A.xyz;
    float reach = r * max(C.y, 1.3) + K.y;
    if (dot(d, d) > reach * reach * 2.0) continue;
    int kind = int(K.x + 0.5);
    vec3 nn = uScB[i].xyz;
    float sd = uScB[i].w, sg = K.z;
    float h2 = u01(hash1(hid ^ 0x68bc21ebu)), h3 = u01(hash1(hid ^ 0x2f6b9a13u));
    float al = dot(d, nn);
    vec3 lat = d - nn * al;
    float ll = length(lat);
    vec3 ax = normalize(abs(nn.y) < 0.9 ? cross(nn, vec3(0.0, 1.0, 0.0)) : cross(nn, vec3(1.0, 0.0, 0.0)));
    vec3 bx = cross(nn, ax);
    float ang = atan(dot(lat, bx), dot(lat, ax));
    if (kind == 2) {
      // pockmarks: a round through the plating at each, a small hole with a dished, scorched ring (dents only on
      // plating too thick for them)
      if (abs(al) > 0.9) continue;
      bool holes = K.w > 0.0;
      int N = int(abs(K.w) + 0.5);
      for (int k = 0; k < 16; k++) {
        if (k >= N) break;
        float fk = float(k) * 1.618 + sd * 0.031;
        float a1 = 6.2832 * fract(sin(fk * 12.9898 + sd) * 43758.5453), r1 = r * sqrt(fract(sin(fk * 78.233 + sd * 1.3) * 24634.6345));
        vec3 o = (ax * cos(a1) + bx * sin(a1)) * r1;
        float rk = C.z * (0.6 + 0.8 * fract(sin(fk * 39.346 + sd * 0.7) * 11235.813));
        float dk = length(lat - o) / rk;
        if (dk < 1.0) {
          if (holes) {
            if (dp) { p -= nn * 0.8; return 2; }
            if (h3 > 0.1) return 1;
          }
          p -= nn * (1.0 - dk) * rk * (holes ? 0.8 : 0.35); burn = 1.0; hot = max(hot, C.w * (holes ? 1.0 : 0.5));
        } else if (dk < 2.3) {
          float e = 1.0 - (dk - 1.0) / 1.3;
          p -= nn * e * e * rk * 0.3;
          burn = max(burn, 0.5 + 0.45 * e);
          if (dk < 1.3 && holes) { edge = max(edge, 0.7); heatN = max(heatN, C.w); }
        }
      }
      float qs = ll / (r * 1.25);
      if (qs < 1.0) burn = max(burn, (1.0 - qs) * 0.3 * (0.6 + 0.8 * h2));
      continue;
    }
    float rag = 1.0 + 0.2 * sin(3.0 * ang + sd) + 0.12 * sin(5.0 * ang + sd * 1.7) + 0.07 * sin(9.0 * ang + sd * 2.9);
    if (kind == 1) {
      // a dent: the plating dished in (bulged out for a charge inside), wrinkled, scorched; no hole
      if (abs(al) > r * 0.8) continue;
      float q = ll / (r * (0.85 + 0.15 * rag));
      if (q < 1.0) {
        float k = 1.0 - q * q; k *= k;
        p += nn * sg * C.z * r * (k + 0.15 * q * k * sin(4.0 * ang + sd));
        burn = max(burn, (0.45 + 0.4 * k) * (0.75 + 0.5 * h2));
        hot = max(hot, k * k * C.w * 0.5);
      } else {
        vec3 ds = d; if (ds.y > 0.0) ds.y *= 0.45;
        float qs = (length(ds) / r - 1.0) / max(1e-3, C.y - 1.0);
        if (qs < 1.0) { float s = 1.0 - max(qs, 0.0); burn = max(burn, s * (0.4 + 0.45 * s) * (0.75 + 0.5 * h2)); }
      }
      continue;
    }
    // a hole (0) or a rupture (3)
    float rr = r * rag * (0.9 + 0.2 * h2);
    float q = sqrt(ll * ll + al * al * 1.5) / rr, lq = ll / rr;
    // the model's own surfaces across the pocket behind it (a far wall, a deck inside a deck hole): gone, scars.js draws
    // the inside (what is beyond, the far side, is behind the plug); plating along the pocket (a hull side under a deck
    // hole, a deck over a side hole) stays
    // (an interior part is spared: charred where it is close to the hole)
    if (lq < 1.05 && al < -0.3 && al > -K.y - 0.4 && abs(dot(n, nn)) > 0.6) { if (gIn < 0.5) return 1; burn = max(burn, 0.6); }
    if (q < 1.0) {
      if (dp) { p -= nn * (K.y + 0.3); return 2; }
      // the hole: gone, a few torn dots left bent the blast's way
      if (h3 > 0.05 + 0.12 * q) return 1;
      p += nn * (sg > 0.0 ? 0.6 : -0.85) * (1.0 - q) * r;
      p.y -= (1.0 - q) * r * 0.3 * h2;
      burn = 1.0; hot = max(hot, (0.5 + 0.5 * q) * C.w);
      continue;
    }
    bool big = kind == 3;
    if (q < 1.6) {
      // the torn rim: petals, most bent the blast's way, strips curled the other; torn in strips
      float e = (1.6 - q) / 0.6;
      float strip = 0.5 + 0.5 * sin(ang * (5.0 + mod(floor(sd), 4.0)) + sd * 3.1);
      bool rim = q < 1.36 + 0.18 * strip;
      if (!rim && h3 < 0.3 * e * e) return 1;
      float curl = strip > 0.55 ? sg : -0.5 * sg;
      vec3 radial = lat / max(1e-3, ll);
      p += nn * curl * e * e * min(r * C.z * (0.5 + 0.9 * strip) * (big ? 1.3 : 1.0), 2.2 + 0.1 * r);
      p += radial * abs(curl) * e * e * r * 0.18 * strip;
      p.y -= e * e * r * 0.12 * strip * h2;
      burn = max(burn, 0.65 + 0.35 * e);
      if (rim) { edge = max(edge, 0.8 + 0.2 * strip); heatN = max(heatN, C.w); }
      hot = max(hot, e * e * C.w);
      continue;
    }
    // round it the plating buckled: a hole's dished the blast's way and rippled; a rupture's displaced in and out over
    // a wide area (ridges where the frames hold it), a deck over it lifted; charred, the stain taller above than below
    float qb = (lq - 1.6) / max(1e-3, C.y - 1.6);
    if (qb < 1.0) {
      float kb = (1.0 - qb) * (1.0 - qb);
      float w1 = sin(2.0 * ang + sd * 0.7), w2 = sin(3.0 * ang + sd * 1.9), w3 = sin(lq * 4.0 + sd);
      if (big) {
        p += nn * min(r, 6.0) * (0.1 * sg + 0.09 * w1 + 0.05 * w2 + 0.03 * w3) * kb;
        p += (lat / max(1e-3, ll)) * r * 0.05 * sin(lq * 6.0 + sd) * kb;
        if (abs(nn.y) < 0.5 && n.y > 0.7 && d.y > -0.5) p.y += min(r * 0.25, 1.6) * kb * (0.7 + 0.3 * w2) * max(sg, 0.3);
      } else p += nn * sg * min(r, 4.0) * (0.12 + 0.07 * w1 + 0.04 * w3) * kb;
    }
    vec3 ds = d; if (ds.y > 0.0) ds.y *= 0.45;
    float qs = (length(ds) - rr * 1.6) / max(1e-3, rr * (C.y - 1.6));
    if (qs < 1.0) { float s = 1.0 - max(qs, 0.0); burn = max(burn, s * (0.45 + 0.45 * s) * (0.75 + 0.5 * h2)); }
  }
  return 0;
}
`;
}

/* blast patches (game/src/blast, d.scars.blast): the plating's own displacement from the structural solver (an atlas of
   the skin plates' grids: local displacement xyz, flags + soot in w: 1 cell torn, 2 node gone, 4 node on a torn edge),
   the dots of a torn cell riding their corner (petals), torn edges hot then charred, the model's surfaces across the
   pocket behind a hole gone and the hole's splats pushed back into a plug */
function blastGLSL() {
  return `
uniform int uBtN;
uniform vec4 uBtO[${BTMAX}];     // xyz: the patch's origin (RTE), w: the pocket's depth behind a hole (m; < 0: the ship has no interior)
uniform vec4 uBtX[${BTMAX}];     // xyz: its local x (world), w: heat of the torn edges (0..1)
uniform vec4 uBtY[${BTMAX}];     // xyz: local y, w: grid (m)
uniform vec4 uBtZ[${BTMAX}];     // xyz: local z (the struck plate's outward normal), w: the skin band (m)
uniform vec4 uBtP[${BTMAX * 2}]; // skin plate k of patch i (i * 2 + k): x axis (-1 none), y plane (local m), z u0, w v0
uniform vec4 uBtQ[${BTMAX * 2}]; // x nu, y nv (cells), zw its first texel in the atlas
uniform highp sampler2D uBtT;
// (an integer hash of the 0.25 m cell of the patch-local point: blast/support.js wreckHash replays it on the CPU)
float wreckHash(vec3 p) {
  uvec3 c = uvec3(ivec3(floor(p * 4.0)) + 65536);
  uint h = (c.x * 73856093u) ^ (c.y * 19349663u) ^ (c.z * 83492791u);
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h >> 8u) / 16777216.0;
}
int blastAt(inout vec3 p, vec3 n, bool dp, inout float burn, inout float hot, inout float edge, inout float heatN, inout vec3 tilt) {
  bool two = dot(n, n) < 0.01;
  for (int i = 0; i < ${BTMAX}; i++) {
    if (i >= uBtN) break;
    vec3 X = uBtX[i].xyz, Y = uBtY[i].xyz, Z = uBtZ[i].xyz;
    vec3 d = p - uBtO[i].xyz;
    vec3 l = vec3(dot(d, X), dot(d, Y), dot(d, Z));
    float S = uBtY[i].w, band = uBtZ[i].w, heat = uBtX[i].w, D = abs(uBtO[i].w), plugD = uBtO[i].w > 0.0 ? 8.3 : 0.3;   // (w < 0: no interior drawn, the plug at the far wall)
    for (int k = 0; k < 2; k++) {
      vec4 P = uBtP[i * 2 + k];
      if (P.x < -0.5) continue;
      int ax = int(P.x + 0.5);
      vec3 A = ax == 0 ? X : ax == 1 ? Y : Z;
      float off = (ax == 0 ? l.x : ax == 1 ? l.y : l.z) - P.y;
      float u = (ax == 0 ? l.z : l.x) - P.z, v = (ax == 1 ? l.z : l.y) - P.w;
      vec4 Q = uBtQ[i * 2 + k];
      float fi = u / S, fj = v / S;
      if (fi < 0.0 || fj < 0.0 || fi > Q.x || fj > Q.y) continue;
      bool face = two || abs(dot(n, A)) > 0.5;
      int i0 = min(int(fi), int(Q.x) - 1), j0 = min(int(fj), int(Q.y) - 1);
      float fx = fi - float(i0), fy = fj - float(j0);
      ivec2 b = ivec2(int(Q.z) + i0, int(Q.w) + j0);
      vec4 t00 = texelFetch(uBtT, b, 0);
      int f00 = int(t00.w);
      // (torn or not: the cells' torn flags interpolated at the point (a smooth field through the cell centres) against a
      // ragged threshold (value noise ~0.35 m and a fine grain at the dot's scale): the hole's outline runs smooth and
      // torn between the texels, never the grid's staircase)
      float mk, thr = 0.5;
      {
        float gx = fi - 0.5, gy = fj - 0.5; int ci = int(floor(gx)), cj = int(floor(gy)); float ax2 = gx - float(ci), ay2 = gy - float(cj);
        int nx = int(Q.x) - 1, ny = int(Q.y) - 1;
        #define TC(a, c) float(int(texelFetch(uBtT, ivec2(int(Q.z) + clamp(a, 0, nx), int(Q.w) + clamp(c, 0, ny)), 0).w) & 1)
        mk = mix(mix(TC(ci, cj), TC(ci + 1, cj), ax2), mix(TC(ci, cj + 1), TC(ci + 1, cj + 1), ax2), ay2);
        #undef TC
      }
      bool torn = mk > 0.999;
      if (mk > 0.001 && mk < 0.999) {
        vec2 q = vec2(u, v) * 2.8; vec2 qi = floor(q), qf = q - qi, qs = qf * qf * (3.0 - 2.0 * qf);
        float n00 = wreckHash(vec3(qi, 3.0) * 0.25 + 0.01), n10 = wreckHash(vec3(qi + vec2(1.0, 0.0), 3.0) * 0.25 + 0.01);
        float n01 = wreckHash(vec3(qi + vec2(0.0, 1.0), 3.0) * 0.25 + 0.01), n11 = wreckHash(vec3(qi + vec2(1.0, 1.0), 3.0) * 0.25 + 0.01);
        float nz = mix(mix(n00, n10, qs.x), mix(n01, n11, qs.x), qs.y) * 0.7 + wreckHash(floor(l * 16.0) * 0.25 + 0.01) * 0.3;
        thr = 0.5 + (nz - 0.5) * 0.8; torn = mk > thr;
      }
      vec4 t10 = texelFetch(uBtT, b + ivec2(1, 0), 0), t01 = texelFetch(uBtT, b + ivec2(0, 1), 0), t11 = texelFetch(uBtT, b + ivec2(1, 1), 0);
      if (abs(off) > band || !face) {
        // not the plating itself: what stands on it (over a deck up to 30 m: a gun, a deckhouse, rails; off a side up to
        // 3 m: its fittings) rides the plating under its foot, and goes where that plating tore, went or lost its support
        // (bit 8: the blast system flies those dots as loose pieces); what is behind it follows it, fading with depth,
        // and is gone behind a hole (the blast system draws what is inside)
        int fN = int((fx < 0.5 ? (fy < 0.5 ? t00 : t01) : (fy < 0.5 ? t10 : t11)).w);
        vec3 dlb = mix(mix(t00.xyz, t10.xyz, fx), mix(t01.xyz, t11.xyz, fx), fy);
        if (off > -0.05 && off < (A.y > 0.7 ? 30.0 : 3.0)) {
          // (torn: the smooth ragged outline, as the plating's own; the nearest texel's flag would cut 0.25 m steps)
          // (the plating under its foot thrown more than 1.5 m: it tears off and falls as a piece, the blast system flies it)
          if (torn || (fN & 10) != 0 || dot(dlb, dlb) > 2.25) return 1;
          p += X * dlb.x + Y * dlb.y + Z * dlb.z;
          // (a structure riding a deck bent more than ~0.2 m: its lowest 1.5 m buckled and scorched, as the deck that
          // carried it into the bend; the rest follows as a whole)
          { float dm = length(dlb), hb = clamp(1.0 - off / 1.5, 0.0, 1.0) * clamp((dm - 0.2) / 0.6, 0.0, 1.0);
            if (hb > 0.0) { vec3 bq = floor(l * 3.0); float b1 = wreckHash(bq) - 0.5, b2 = wreckHash(bq + vec3(7.0, 3.0, 5.0)) - 0.5;
              p += (X * b1 + Z * b2) * 0.18 * hb; burn = max(burn, 0.7 * hb); if (!two) tilt += (X * b2 - Z * b1) * 0.8 * hb; } }
          // (its underside, seen only from inside through a hole in the deck: the ceiling there)
          if (!two && dot(n, A) < -0.5) gHole = max(gHole, 0.6);
          break;
        }
        if (off <= -0.05 && gIn > 0.5 && off > -D - 8.0) {
          // an interior part (bulkheads, decks, machinery...): wrecked where the plating over it tore (most of it gone,
          // the rest charred and pushed with the plating), followed and scorched behind plating that held
          float wd = max(0.0, 1.0 - (-off) / (D + 0.4));
          // (depth pass: none of a wrecked part's cells splat: its dots are a speckle, a splat is a whole cell, and the
          // survivors' cells would print as black blocks over what is behind)
          if (torn || (fN & 2) != 0) { if (dp || wreckHash(l * 3.0) < 0.7 * wd + 0.2) return 1;   // (per ~8 cm cell: a speckle, not 0.25 m blocks)
            burn = max(burn, 0.5); hot = max(hot, heat * 0.4 * wd); edge = max(edge, 0.35 * wd); heatN = max(heatN, heat); }
          else if ((fN & 8) != 0) burn = max(burn, 0.5 * wd);
          p += (X * dlb.x + Y * dlb.y + Z * dlb.z) * wd;
          // (what stands behind a hole is seen from inside its spaces: the walls' far sides lit and splatted too)
          gHole = max(gHole, 0.3 + 0.7 * wd); gHoleP = vec4(A, P.y + dot(uBtO[i].xyz, A)); if (dp) return 3;
          break;
        }
        if (off <= -0.05 && off > -D - 0.4) {
          // (not at the plate's edges: the ship's shell or bulkhead the plate meets there stands on its own)
          float ed = min(min(fi, Q.x - fi), min(fj, Q.y - fj)) * S;
          // (and only the surfaces facing the plate, or lines: the ship's shell and walls across the pocket stay)
          // (a ship with no interior drawn keeps them, charred: they are the far side of the hole, not the sea)
          if ((face || two) && ed > 0.6 && (torn || (fN & 10) != 0)) { if (plugD > 1.0) return 1; burn = max(burn, 0.5); hot = max(hot, heat * 0.25); }
          float wd = 1.0 - (-off) / (D + 0.4);
          p += (X * dlb.x + Y * dlb.y + Z * dlb.z) * wd;
          gHole = max(gHole, 0.3 + 0.7 * wd); gHoleP = vec4(A, P.y + dot(uBtO[i].xyz, A));
          if (dp) return 3;
          break;
        }
        // (a ship with no interior drawn: her own walls across the pocket, seen from inside through the hole, occlude
        // from either side in the depth pass: a dark inner hull, not the sea through her)
        if (dp && plugD < 1.0 && off <= -0.05 && off > -D - 14.0) return 3;
        // (the far side of the space behind the hole, seen through it: lit a little from either side)
        if (!dp && off <= -0.05 && off > -D - 30.0) { gHole = max(gHole, 0.3); gHoleP = vec4(A, P.y + dot(uBtO[i].xyz, A)); }
        continue;
      }
      vec3 dl;
      if (torn) {
        // the hole: the depth splat pushed back to the pocket's far end (a plug); the dots ride their quarter's corner
        // (petals bent the blast's way), gone with it if it went
        if (dp) { p -= A * (D + plugD); return 2; }
        bool lx = fx < 0.5, ly = fy < 0.5;
        vec4 tc = lx ? (ly ? t00 : t01) : (ly ? t10 : t11);
        if ((int(tc.w) & 2) != 0) return 1;
        // (a line of the model over the hole (the sheer, a rail's foot): not plating, it goes with the plating it ran on;
        // the blast system flies it)
        if (two) return 1;
        // (a torn cell's plating: petals only along the tear, hanging off the intact plating and rolled back the way it
        // went; the hole itself is open. Each dot finds the nearest intact cell (5 x 5 round it): past a ragged reach
        // (lobes ~0.4 m along the rim, a fine grain at the dot's scale) it is gone. Never a per-cell pattern: the petal
        // is a strip rolled on a circle about the tear line, its length measured from the intact plating)
        float bd = 9.0; vec2 bv = vec2(0.0);
        {
          int ci = int(floor(fi)), cj = int(floor(fj)), nx = int(Q.x) - 1, ny = int(Q.y) - 1;
          for (int a = -2; a <= 2; a++) for (int c = -2; c <= 2; c++) {
            int ii = ci + a, jj = cj + c;
            if (ii < 0 || jj < 0 || ii > nx || jj > ny) continue;
            if ((int(texelFetch(uBtT, ivec2(int(Q.z) + ii, int(Q.w) + jj), 0).w) & 1) != 0) continue;
            vec2 dv = vec2(float(ii) + 0.5 - fi, float(jj) + 0.5 - fj), e2 = max(abs(dv) - 0.5, 0.0);
            float dd = length(e2);
            if (dd < bd) { bd = dd; bv = dv; }
          }
        }
        if (bd > 2.0) return 1;
        vec2 q2 = vec2(u, v) * 2.4; vec2 qi2 = floor(q2), qf2 = q2 - qi2, qs2 = qf2 * qf2 * (3.0 - 2.0 * qf2);
        float lob = mix(mix(wreckHash(vec3(qi2, 5.0) * 0.25 + 0.01), wreckHash(vec3(qi2 + vec2(1.0, 0.0), 5.0) * 0.25 + 0.01), qs2.x),
                        mix(wreckHash(vec3(qi2 + vec2(0.0, 1.0), 5.0) * 0.25 + 0.01), wreckHash(vec3(qi2 + vec2(1.0, 1.0), 5.0) * 0.25 + 0.01), qs2.x), qs2.y);
        float grain = wreckHash(floor(l * 20.0) * 0.25 + 0.37);
        float s = bd * S, reach = S * (0.15 + 1.5 * lob * lob) * (0.75 + 0.5 * grain);
        if (s > reach) return 1;
        // rolled: a strip of length s on a circle of radius rc about the tear line (back toward the intact plating in
        // the plane, out of it the way the plating went)
        vec3 Ua = ax == 0 ? Z : X, Va = ax == 1 ? Z : Y;
        float bl = length(bv); vec3 toE = bl > 1e-4 ? normalize(Ua * bv.x + Va * bv.y) : Ua;
        dl = mix(mix(t00.xyz, t10.xyz, fx), mix(t01.xyz, t11.xyz, fx), fy);
        { float dL = length(dl); if (dL > 0.8) dl *= 0.8 / dL; }
        float sg = dl[ax] < -0.01 ? -1.0 : 1.0, rc = S * mix(0.5, 1.4, lob), th = s / rc;
        vec3 w = toE * (s - rc * sin(th)) + A * (sg * rc * (1.0 - cos(th)));
        dl += vec3(dot(w, X), dot(w, Y), dot(w, Z));
        // the petal's face turns with the roll (it catches the light across the bend)
        tilt += (A * cos(th) - toE * sg * sin(th)) - A;
        heatN = max(heatN, heat); hot = max(hot, heat * 0.9 * (1.0 - 0.5 * s / max(reach, 1e-3))); burn = max(burn, 0.8);
        // its free end: a ragged edge, glowing while hot
        edge = max(edge, 0.7 * smoothstep(0.55, 1.0, s / max(reach, 1e-3)));
      } else {
        // next to a torn cell: the edge bitten ragged (the tear runs through the plating, not along the cell's side)
        {
          float dmin = 9.0;
          if (i0 > 0 && (int(texelFetch(uBtT, b - ivec2(1, 0), 0).w) & 1) != 0) dmin = min(dmin, fx);
          if (i0 < int(Q.x) - 1 && (int(t10.w) & 1) != 0) dmin = min(dmin, 1.0 - fx);
          if (j0 > 0 && (int(texelFetch(uBtT, b - ivec2(0, 1), 0).w) & 1) != 0) dmin = min(dmin, fy);
          if (j0 < int(Q.y) - 1 && (int(t01.w) & 1) != 0) dmin = min(dmin, 1.0 - fy);
          if (dmin < 0.6) {
            vec3 q = floor(l * 5.0);
            float hn = fract(sin(dot(q, vec3(41.3, 289.1, 97.7))) * 43758.55), hj = fract(sin(dot(floor(l * 1.6), vec3(12.9, 78.2, 37.7))) * 43758.55);
            edge = max(edge, 0.7 * (1.0 - dmin / 0.6)); heatN = max(heatN, heat); hot = max(hot, heat * 0.5 * (1.0 - dmin / 0.6));
          }
        }
        dl = mix(mix(t00.xyz, t10.xyz, fx), mix(t01.xyz, t11.xyz, fx), fy);
        // (the torn edge where the smooth field meets its threshold: hot, then charred)
        if (mk > 0.001) { float ek = clamp(1.0 - (thr - mk) / 0.22, 0.0, 1.0); edge = max(edge, 0.85 * ek); heatN = max(heatN, heat); hot = max(hot, heat * 0.6 * ek); burn = max(burn, 0.9 * ek); }
        // (plating at a hole's edge: the torn cells' corners fly off, it does not stretch after them)
        if (mk > 0.001) { float dL = length(dl); if (dL > 0.8) dl *= 0.8 / dL; }
        // (depth pass: the plating's splats at a hole's edge are small, so the hole's outline is the dots', not the splat grid's;
        // none within reach of the ragged threshold (its noise and grain move it ~0.5 in mk inside a cell): there a
        // splat would stand where the dots are torn away, a dark square in the hole)
        if (dp && mk > 0.001) { p += X * dl.x + Y * dl.y + Z * dl.z; return thr - mk > 0.5 ? 4 : 1; }
        // a torn edge: its corners' flags, fading across the cell
        float e = mix(mix(float((f00 & 4) >> 2), float((int(t10.w) & 4) >> 2), fx), mix(float((int(t01.w) & 4) >> 2), float((int(t11.w) & 4) >> 2), fx), fy);
        if (e > 0.3) { if (mk > 0.001) { edge = max(edge, 0.8 * e); heatN = max(heatN, heat); hot = max(hot, heat * 0.55 * e); } else burn = max(burn, 0.25 * e); }   // (a broken frame or longitudinal away from the hole: scorched, not a glowing grid, QA D42)
        float so = mix(mix(fract(t00.w), fract(t10.w), fx), mix(fract(t01.w), fract(t11.w), fx), fy);
        burn = max(burn, so * so * 0.8);
        // the dent's slope: the normal leans with it
        float gu = mix(t10[ax] - t00[ax], t11[ax] - t01[ax], fy) / S, gv = mix(t01[ax] - t00[ax], t11[ax] - t10[ax], fx) / S;
        vec3 Uw = ax == 0 ? Z : X, Vw = ax == 1 ? Z : Y;
        tilt -= Uw * gu + Vw * gv;
        // plating strained past yield buckles finer than the grid: facets ~0.3 m catching the light unevenly
        float gs = clamp((length(vec2(gu, gv)) - 0.1) * 1.5, 0.0, 0.5);
        if (gs > 0.04 && !dp) { vec3 q = floor(l * 3.3); float h1 = fract(sin(dot(q, vec3(127.1, 311.7, 74.7))) * 43758.55), h2 = fract(sin(dot(q, vec3(269.5, 183.3, 246.1))) * 43758.55);
          tilt += (Uw * (h1 - 0.5) + Vw * (h2 - 0.5)) * gs; }
      }
      p += X * dl.x + Y * dl.y + Z * dl.z;
      break;
    }
  }
  return 0;
}
`;
}

/* rotation (row-major 3x3) from heading (0 = north), pitch (+ nose up), roll (+ right wing down) */
export function attitude(hdg, pitch, roll) {
  const ch = Math.cos(hdg || 0), sh = Math.sin(hdg || 0), cp = Math.cos(-(pitch || 0)), sp = Math.sin(-(pitch || 0)), cr = Math.cos(-(roll || 0)), sr = Math.sin(-(roll || 0));
  // Ry(h) * Rx(-p) * Rz(-r)
  const Ry = [ch, 0, sh, 0, 1, 0, -sh, 0, ch], Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp], Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  return mul3(mul3(Ry, Rx), Rz);
}
export function mul3(A, B) {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return o;
}
const ap3 = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];

/* ---------- sampling straight into the GPU layout ----------
   16 bytes a point (xyz float, normal int8 x 3), plus 12 bytes of cell (the sample's jittered-grid cell on its
   surface: U axis int8 x 3 + its size code, V axis int8 x 3 + its size code, the jitter ju, jv in cells): the
   shader fills a cell with a stratified sub-lattice close up (sub-dots) and the depth pass splats it exactly.
   Every primitive but lines and blades is sampled here as GEO does it (a jittered grid, +-0.3 of a cell), with no
   garbage; lines and blades go through GEO.sample (no cell: never subdivided, never splatted). */
class PtBuf {
  constructor(cap) { this.n = 0; this._alloc(Math.max(64, cap | 0)); }
  _alloc(cap) {
    const buf = new ArrayBuffer(cap * 16), f = new Float32Array(buf), b = new Int8Array(buf), t = new Int8Array(cap * 12);
    if (this.f) { new Uint8Array(buf).set(new Uint8Array(this.f.buffer, 0, this.n * 16)); t.set(this.t.subarray(0, this.n * 12)); }
    this.f = f; this.b = b; this.t = t; this.cap = cap;
  }
  need(k) { if (this.n + k > this.cap) this._alloc(Math.max(this.n + k, this.cap * 2)); }
  /* GEO points (stride 6: xyz, normal; zero normal = two-sided); no cell */
  addGeo(pts) {
    const k = pts.length / 6; this.need(k);
    const f = this.f, b = this.b, t = this.t;
    for (let i = 0, o = this.n; i < k; i++, o++) {
      const j = i * 6;
      f[o * 4] = pts[j]; f[o * 4 + 1] = pts[j + 1]; f[o * 4 + 2] = pts[j + 2];
      let nx = pts[j + 3], ny = pts[j + 4], nz = pts[j + 5];
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l > 1e-6) { nx /= l; ny /= l; nz /= l; }
      b[o * 16 + 12] = Math.round(nx * 127); b[o * 16 + 13] = Math.round(ny * 127); b[o * 16 + 14] = Math.round(nz * 127); b[o * 16 + 15] = 0;
      t.fill(0, o * 12, o * 12 + 12); t[o * 12 + 3] = -128; t[o * 12 + 7] = -128;
    }
    this.n += k;
  }
  /* one point: position, normal (unit or 0), cell axes U, V (unit), sizes su, sv (m), jitter ju, jv (cells); sp: the
     level's spacing (the size codes are relative to it) */
  put(x, y, z, nx, ny, nz, ux, uy, uz, su, vx, vy, vz, sv, ju, jv, sp) {
    const o = this.n++, f = this.f, b = this.b, t = this.t;
    f[o * 4] = x; f[o * 4 + 1] = y; f[o * 4 + 2] = z;
    b[o * 16 + 12] = Math.round(nx * 127); b[o * 16 + 13] = Math.round(ny * 127); b[o * 16 + 14] = Math.round(nz * 127); b[o * 16 + 15] = 0;
    const q = o * 12;
    t[q] = Math.round(ux * 127); t[q + 1] = Math.round(uy * 127); t[q + 2] = Math.round(uz * 127);
    t[q + 3] = Math.max(-128, Math.min(127, Math.round(su / sp * CELL_K) - 128));
    t[q + 4] = Math.round(vx * 127); t[q + 5] = Math.round(vy * 127); t[q + 6] = Math.round(vz * 127);
    t[q + 7] = Math.max(-128, Math.min(127, Math.round(sv / sp * CELL_K) - 128));
    t[q + 8] = Math.max(-127, Math.min(127, Math.round(ju * JIT_K))); t[q + 9] = Math.max(-127, Math.min(127, Math.round(jv * JIT_K)));
    t[q + 10] = 0; t[q + 11] = 0;
  }
  /* the packed bytes: the buffer itself when it is nearly full (no copy, no garbage), else trimmed */
  bytes() { return this.n * 16 * 1.25 >= this.f.buffer.byteLength ? new Uint8Array(this.f.buffer, 0, this.n * 16) : this.f.buffer.slice(0, this.n * 16); }
  cells() { return this.n * 12 * 1.25 >= this.t.byteLength ? new Int8Array(this.t.buffer, 0, this.n * 12) : this.t.slice(0, this.n * 12); }
}
const HEX_FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
const _hn = new Float32Array(18);
/* a hex's outward face normals (GEO's faceNormals) into _hn */
function hexNormals(P) {
  let cx = 0, cy = 0, cz = 0;
  for (let k = 0; k < 8; k++) { cx += P[k][0]; cy += P[k][1]; cz += P[k][2]; }
  cx /= 8; cy /= 8; cz /= 8;
  for (let k = 0; k < 6; k++) {
    const F = HEX_FACES[k], a = P[F[0]], b = P[F[1]], c = P[F[2]], d = P[F[3]];
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.sqrt(nx * nx + ny * ny + nz * nz) < 1e-9) {
      ux = c[0] - b[0]; uy = c[1] - b[1]; uz = c[2] - b[2]; vx = d[0] - b[0]; vy = d[1] - b[1]; vz = d[2] - b[2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
    }
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const fx = (a[0] + b[0] + c[0] + d[0]) / 4 - cx, fy = (a[1] + b[1] + c[1] + d[1]) / 4 - cy, fz = (a[2] + b[2] + c[2] + d[2]) / 4 - cz;
    if (nx * fx + ny * fy + nz * fz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    _hn[k * 3] = nx; _hn[k * 3 + 1] = ny; _hn[k * 3 + 2] = nz;
  }
}
const dist3 = (a, b) => Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) + (b[2] - a[2]) * (b[2] - a[2]));
/* a quad a b c d (GEO's quad) at spacing s into W with its cells; normal n (0: two-sided); sp the level spacing */
function sampleQuad(a, b, c, d, nx, ny, nz, s, rnd, W, sp) {
  const lu = dist3(a, b), lv = dist3(a, d);
  const nu = Math.max(1, Math.round(lu / s)), nv = Math.max(1, Math.round(lv / s));
  W.need(nu * nv);
  // the cell: U along a->b, V along a->d (a skewed face: the local parallelogram, near enough)
  const ux = (b[0] - a[0]) / (lu || 1), uy = (b[1] - a[1]) / (lu || 1), uz = (b[2] - a[2]) / (lu || 1);
  const vx = (d[0] - a[0]) / (lv || 1), vy = (d[1] - a[1]) / (lv || 1), vz = (d[2] - a[2]) / (lv || 1);
  const su = lu / nu, sv = lv / nv;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const ju = (rnd() - .5) * .6, jv = (rnd() - .5) * .6;
    const u = (i + .5 + ju) / nu, v = (j + .5 + jv) / nv, iu = 1 - u, iv = 1 - v;
    W.put((a[0] * iu + b[0] * u) * iv + (d[0] * iu + c[0] * u) * v, (a[1] * iu + b[1] * u) * iv + (d[1] * iu + c[1] * u) * v, (a[2] * iu + b[2] * u) * iv + (d[2] * iu + c[2] * u) * v,
      nx, ny, nz, ux, uy, uz, su, vx, vy, vz, sv, ju, jv, sp);
  }
}
/* one hex at spacing s into W; rnd() in 0..1 */
function sampleHex(pr, s, rnd, W, sp) {
  const P = pr.p;
  hexNormals(P);
  for (let k = 0; k < 6; k++) {
    if (k === 0 && pr.bottom !== true) continue;
    if (pr.skip && pr.skip.includes(k)) continue;
    const F = HEX_FACES[k];
    sampleQuad(P[F[0]], P[F[1]], P[F[2]], P[F[3]], _hn[k * 3], _hn[k * 3 + 1], _hn[k * 3 + 2], s, rnd, W, sp);
  }
}
/* GEO's perp(d): two unit vectors across the axis d */
function perp(d) {
  const a = Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
  let ux = a[1] * d[2] - a[2] * d[1], uy = a[2] * d[0] - a[0] * d[2], uz = a[0] * d[1] - a[1] * d[0];
  const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
  return [[ux, uy, uz], [d[1] * uz - d[2] * uy, d[2] * ux - d[0] * uz, d[0] * uy - d[1] * ux]];
}
/* a surface of revolution (GEO's lathe, with its caps) into W with its cells */
function sampleLathe(pr, s, rnd, W, sp) {
  const dl = Math.hypot(pr.d[0], pr.d[1], pr.d[2]) || 1, d = [pr.d[0] / dl, pr.d[1] / dl, pr.d[2] / dl], A = pr.a, st = pr.st, [U, Vv] = perp(d);
  for (let i = 0; i < st.length - 1; i++) {
    const s0 = st[i][0], r0 = st[i][1], s1 = st[i + 1][0], r1 = st[i + 1][1];
    const L = Math.hypot(s1 - s0, r1 - r0), na = Math.max(1, Math.round(L / s)), rm = Math.max(r0, r1);
    const nt = Math.max(6, Math.round(2 * Math.PI * rm / s));
    W.need(na * nt);
    const gl = L || 1, ga = (s1 - s0) / gl, gr = (r1 - r0) / gl;         // the generator's direction (axial, radial)
    for (let a = 0; a < na; a++) for (let t = 0; t < nt; t++) {
      const ja = (rnd() - .5) * .6, jt = (rnd() - .5) * .6;
      const u = (a + .5 + ja) / na, th = (t + .5 + jt) / nt * Math.PI * 2;
      const sr = s0 + (s1 - s0) * u, rr = r0 + (r1 - r0) * u, c = Math.cos(th), sn = Math.sin(th);
      const nx = U[0] * c + Vv[0] * sn, ny = U[1] * c + Vv[1] * sn, nz = U[2] * c + Vv[2] * sn;
      // cells: along the generator, and round the circumference (its local size at this radius)
      W.put(A[0] + d[0] * sr + nx * rr, A[1] + d[1] * sr + ny * rr, A[2] + d[2] * sr + nz * rr, nx, ny, nz,
        d[0] * ga + nx * gr, d[1] * ga + ny * gr, d[2] * ga + nz * gr, L / na,
        -U[0] * sn + Vv[0] * c, -U[1] * sn + Vv[1] * c, -U[2] * sn + Vv[2] * c, 2 * Math.PI * rr / nt, ja, jt, sp);
    }
  }
  if (pr.caps) for (const i of [0, st.length - 1]) {
    const sc = st[i][0], rc = st[i][1]; if (rc < .01) continue;
    const nr = Math.max(1, Math.round(rc / s)), cx = A[0] + d[0] * sc, cy = A[1] + d[1] * sc, cz = A[2] + d[2] * sc, sg = i ? 1 : -1;
    for (let k = 0; k < nr; k++) {
      const rr = (k + .5) / nr * rc, nt = Math.max(5, Math.round(2 * Math.PI * rr / s));
      W.need(nt);
      for (let t = 0; t < nt; t++) {
        const jt = (rnd() - .5) * .6, th = (t + .5 + jt) / nt * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
        const rx = U[0] * c + Vv[0] * sn, ry = U[1] * c + Vv[1] * sn, rz = U[2] * c + Vv[2] * sn;
        W.put(cx + rx * rr, cy + ry * rr, cz + rz * rr, d[0] * sg, d[1] * sg, d[2] * sg, rx, ry, rz, rc / nr,
          -U[0] * sn + Vv[0] * c, -U[1] * sn + Vv[1] * c, -U[2] * sn + Vv[2] * c, 2 * Math.PI * rr / nt, 0, jt, sp);
      }
    }
  }
}
/* an open polyline (GEO's line: rails, wires, whips) into W, its cells one-dimensional (along the line) */
function sampleLine(pr, s, rnd, W, sp) {
  const P = pr.closed ? pr.p.concat([pr.p[0]]) : pr.p;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], L = dist3(a, b), n = Math.max(1, Math.round(L / s)), l = L || 1;
    const ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l, uz = (b[2] - a[2]) / l;
    W.need(n);
    for (let k = 0; k < n; k++) {
      const j = (rnd() - .5) * .6, t = (k + .5 + j) / n;
      W.put(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 0, 0, 0, ux, uy, uz, L / n, 0, 0, 0, 0, j, 0, sp);
    }
  }
}
/* GEO's destroyer-like hull (hullB, hullD, sampleHull) into W with its cells */
function hullB(pr, s) {
  const B = pr.B / 2;
  if (s > .3) return B * Math.max(0, 1 - Math.pow((s - .3) / .7, 1.75));
  if (s < -.82) return B * (.84 + .16 * (1 - (-.82 - s) / .18));
  return B;
}
const hullD = (pr, s) => pr.D + 3.6 * Math.pow(Math.max(0, (s - .25) / .75), 2);
function sampleHull(pr, s, rnd, W, sp) {
  const L = pr.L, ns = Math.round(L / s), su = L / ns;
  for (let i = 0; i < ns; i++) {
    const ji = (rnd() - .5) * .6, sx = -1 + 2 * (i + .5 + ji) / ns, d = hullD(pr, sx), bD = hullB(pr, sx);
    const nh = Math.max(1, Math.round(d / s)), nz = sx > .3 ? sx - .3 : 0, nl = Math.hypot(1, nz);
    W.need(nh * 2 + Math.max(1, Math.round(2 * bD / s)));
    for (const side of [-1, 1]) for (let j = 0; j < nh; j++) {
      const jj = (rnd() - .5) * .6, y = (j + .5 + jj) / nh * d, b = bD * (.9 + .1 * y / d);
      W.put(side * b, y, sx * L / 2, side / nl, 0, nz / nl, 0, 0, 1, su, 0, 1, 0, d / nh, ji, jj, sp);
    }
    const nb = Math.max(1, Math.round(2 * bD / s));
    for (let j = 0; j < nb; j++) { const jj = (rnd() - .5) * .6; W.put((-1 + 2 * (j + .5 + jj) / nb) * bD, d, sx * L / 2, 0, 1, 0, 0, 0, 1, su, 1, 0, 0, 2 * bD / nb, ji, jj, sp); }
  }
}
/* sort a cloud's points (16 B) and cells (12 B) into bricks of bs m: { f (Float32Array of the sorted points), t
   (Int8Array of the sorted cells), bricks: { n, s: Float32Array [cx cy cz r] x n, r: Int32Array [first count] x n } };
   null when it would be one brick */
const BRICK_MIN = 1500;
function brickSort(f, t, n, bs) {
  const inv = 1 / bs, key = new Int32Array(n);
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = f[i * 4], y = f[i * 4 + 1], z = f[i * 4 + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  if (!(x1 >= x0)) return null;
  const gx = Math.floor((x1 - x0) * inv) + 1, gy = Math.floor((y1 - y0) * inv) + 1, gz = Math.floor((z1 - z0) * inv) + 1;
  let nb = 0;
  if (gx * gy * gz <= 1 << 22) {
    // a grid of brick slots over the cloud's bounds (no hashing)
    const slot = new Int32Array(gx * gy * gz).fill(-1);
    for (let i = 0; i < n; i++) {
      const k = Math.floor((f[i * 4] - x0) * inv) + gx * (Math.floor((f[i * 4 + 1] - y0) * inv) + gy * Math.floor((f[i * 4 + 2] - z0) * inv));
      let b = slot[k]; if (b < 0) { b = slot[k] = nb++; }
      key[i] = b;
    }
  } else {
    const map = new Map();
    for (let i = 0; i < n; i++) {
      const k = Math.floor((f[i * 4] - x0) * inv) + gx * (Math.floor((f[i * 4 + 1] - y0) * inv) + gy * Math.floor((f[i * 4 + 2] - z0) * inv));
      let b = map.get(k); if (b === undefined) { b = nb++; map.set(k, b); }
      key[i] = b;
    }
  }
  if (nb < 2) return null;
  const cnt = new Int32Array(nb + 1);
  for (let i = 0; i < n; i++) cnt[key[i] + 1]++;
  for (let b = 0; b < nb; b++) cnt[b + 1] += cnt[b];
  const first = cnt.slice(0, nb), pos = cnt.slice(0, nb);
  const src = new Uint32Array(f.buffer, f.byteOffset, n * 4), out = new ArrayBuffer(n * 16), dst = new Uint32Array(out);
  const t2 = new Int8Array(n * 12), ts = new Uint32Array(t.buffer, t.byteOffset, n * 3), td = new Uint32Array(t2.buffer);
  for (let i = 0; i < n; i++) {
    const o = pos[key[i]]++;
    dst[o * 4] = src[i * 4]; dst[o * 4 + 1] = src[i * 4 + 1]; dst[o * 4 + 2] = src[i * 4 + 2]; dst[o * 4 + 3] = src[i * 4 + 3];
    td[o * 3] = ts[i * 3]; td[o * 3 + 1] = ts[i * 3 + 1]; td[o * 3 + 2] = ts[i * 3 + 2];
  }
  const g = new Float32Array(out), S = new Float32Array(nb * 4), R = new Int32Array(nb * 2);
  for (let b = 0; b < nb; b++) {
    const a = first[b], m = cnt[b + 1] - a;
    let cx = 0, cy = 0, cz = 0;
    for (let i = a; i < a + m; i++) { cx += g[i * 4]; cy += g[i * 4 + 1]; cz += g[i * 4 + 2]; }
    cx /= m; cy /= m; cz /= m;
    let r = 0;
    for (let i = a; i < a + m; i++) { const dx = g[i * 4] - cx, dy = g[i * 4 + 1] - cy, dz = g[i * 4 + 2] - cz, q = dx * dx + dy * dy + dz * dz; if (q > r) r = q; }
    S[b * 4] = cx; S[b * 4 + 1] = cy; S[b * 4 + 2] = cz; S[b * 4 + 3] = Math.sqrt(r) + bs * .1;
    R[b * 2] = a; R[b * 2 + 1] = m;
  }
  return { f: g, t: t2, bricks: { n: nb, s: S, r: R } };
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const WH1 = [1, 1, 1];
const _one = { name: '', prims: [null] }, _oneM = { parts: [_one] };
const sat01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const sstep = v => { v = sat01(v); return v * v * (3 - 2 * v); };
/* how many walls a line of sight through a part crosses, against a closed solid (1): its sampled area over four times
   the mean projected area of its bounds (Cauchy). A bank of VLS cells, a stack of decks, a truss: 3-16. The density
   cap counts them, so a layered interior prints as a dotted volume, not a white block */
function layering(P, cl) {
  if (!cl || !cl.n) return 1;
  const b = P.bounds, dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1], dz = b[1][2] - b[0][2];
  const mp = (dx * dy + dy * dz + dz * dx) / 2;
  if (!(mp > 1e-6)) return 1;
  return Math.max(1, Math.min(16, cl.n * cl.sp * cl.sp / (4 * mp)));
}
/* how much of a part is one plate (0..1): the share of its samples' normals along the dominant axis (either way;
   two-sided panels count as plate). A wing, a fin, a deck ~.9; a box, a hull, a drum ~.3-.5 */
function flatness(cl) {
  if (!cl || !cl.n || !cl.pts) return 0;
  const b = new Int8Array(cl.pts.buffer, cl.pts.byteOffset), n = cl.n, step = Math.max(1, Math.floor(n / 600));
  let m = 0, two = 0, xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < n; i += step) {
    const o = i * 16, x = b[o + 12], y = b[o + 13], z = b[o + 14], q = x * x + y * y + z * z;
    m++;
    if (q < 400) { two++; continue; }
    const k = 1 / q;
    xx += x * x * k; xy += x * y * k; xz += x * z * k; yy += y * y * k; yz += y * z * k; zz += z * z * k;
  }
  if (!m) return 0;
  // the dominant axis of the normals' second moment (power iteration)
  let vx = .58, vy = .62, vz = .53;
  for (let it = 0; it < 16; it++) {
    const ax = xx * vx + xy * vy + xz * vz, ay = xy * vx + yy * vy + yz * vz, az = xz * vx + yz * vy + zz * vz;
    const l = Math.sqrt(ax * ax + ay * ay + az * az); if (l < 1e-9) break;
    vx = ax / l; vy = ay / l; vz = az / l;
  }
  const lam = vx * (xx * vx + xy * vy + xz * vz) + vy * (xy * vx + yy * vy + yz * vz) + vz * (xz * vx + yz * vy + zz * vz);
  return (two + lam) / m;
}
/* prims[i0..] at spacing sp into W until the end or until performance.now() passes tEnd; returns the next index */
function samplePrims(prims, i0, sp, rnd, skipFine, W, tEnd, seed) {
  let i = i0;
  for (; i < prims.length; i++) {
    const pr = prims[i];
    if (!pr || pr.pts === false || (skipFine && pr.fine)) continue;
    const s = (pr.ds || 1) * sp;
    if (pr.t === 'hex' && pr.p && pr.p.length === 8) sampleHex(pr, s, rnd, W, sp);
    else if (pr.t === 'lathe' && pr.st && pr.st.length > 1) sampleLathe(pr, s, rnd, W, sp);
    else if (pr.t === 'panel' && pr.p && pr.p.length === 4) sampleQuad(pr.p[0], pr.p[1], pr.p[2], pr.p[3], 0, 0, 0, s, rnd, W, sp);
    else if (pr.t === 'hull') sampleHull(pr, s, rnd, W, sp);
    else if (pr.t === 'line' && pr.p && pr.p.length > 1) sampleLine(pr, s, rnd, W, sp);
    else { _one.prims[0] = pr; W.addGeo(GEO.sample(_oneM, sp, seed + i * 7919, {}, skipFine ? { fine: false } : undefined)[0].pts); }
    if (performance.now() > tEnd) return i + 1;
  }
  return i;
}

const BUILTIN = {
  tel: () => HD.tel(), radar: () => HD.radar(), pantsir: () => HD.pantsir(), oniks: () => HD.oniks(), oniksBooster: () => HD.oniksBooster(),
  sm6: () => HD.sm6(), mk72: () => HD.mk72(), destroyer: () => HD.destroyer(), carrier: () => HD.carrier(), helo: () => HD.helo(),
  fighter: () => HD.fighter(), fighterStores: () => HD.fighter({ stores: true }), drone: () => HD.drone(), catapult: () => HD.catapult(), satellite: () => HD.satellite(),
};

/* sections (d.slab): a part wholly outside the slab (its centre in the model frame, its radius) */
function slabOut(K, X, Pt) {
  const c = Pt.center, z = X ? X.R[6] * c[0] + X.R[7] * c[1] + X.R[8] * c[2] + X.T[2] : c[2];
  return z + Pt.rad < K.z0 - (K.a0 || 0) || z - Pt.rad > K.z1 + (K.a1 || 0);
}
/* ... and per brick: the model's +Z in the world and its origin's offset along it (rec.kz), the slab's reach */
function slabRec(r, K, R0, T0, eye) {
  r.kon = !!K;
  if (!K) return;
  const z = r.kz || (r.kz = [0, 0, 0, 0]);
  z[0] = R0[2]; z[1] = R0[5]; z[2] = R0[8]; z[3] = (T0[0] - eye[0]) * R0[2] + (T0[1] - eye[1]) * R0[5] + (T0[2] - eye[2]) * R0[8];
  r.klo = K.z0 - (K.a0 || 0); r.khi = K.z1 + (K.a1 || 0);
}

export class ModelLib {
  constructor(G) {
    this.G = G; this.gl = G.gl;
    this.P = program(this.gl, VS, FS_POINT, 'models');
    this.PD = program(this.gl, VS_DEPTH, FS_DEPTH, 'models.depth');
    this.factories = new Map(Object.entries(BUILTIN));
    this.opts = new Map();
    this.entries = new Map();
    this.budgetMs = 5;              // sampling time per frame (a camera jump never costs more: see cloud())
    this.spent = 0;
    this.lodPx = 2.8;               // coarsest level whose spacing stays under this many 1080-px (the films: 4.4)
    this.dotSpacing = 1.8;          // dots per pixel: the kept dots never pack closer than this on screen (1080 px; 0 off)
    this.grazing = .3;              // ... faces seen edge-on counted by their facing down to this floor (large parts)
    this.dotSpacingCut = 2.2;       // ... in a cutaway that fills the frame (Inspect, the hit replay): the parts that are
                                    // not x-rayed shells (dotted volumes, as the Anatomy films' interiors)
    this.fill = .6;                 // the view's fill light (behind the lens, over its left shoulder; 0 off)
    this.fillAz = Math.PI - .6; this.fillEl = .44;   // its bearing off the view heading (rad) and elevation (rad)
    this.stats = { parts: 0, points: 0, sampled: 0, gpuMB: 0, sub: 0, bricks: 0, occ: 0, culled: 0, brickMs: 0 };
    // close up: sub-dots fill each sample's cell with a stratified sub-lattice so the dots stay this far apart on
    // screen (1080 px; 0 off), a finer cell's (a stripe: ds < 1) never closer than subCap. subScale (>= 1, the auto-quality
    // guard) widens both; subJitter: their jitter (of their lattice's spacing); dotCap: the largest dot, as the
    // on-screen spacing it would stand for (7.4: 2 px at 1080)
    this.subPx = 3.6; this.subCap = 2.5; this.subScale = 1; this.subJitter = .2; this.dotCap = 7.4;
    // occlusion: the depth splats of instances over occPx of radius on screen (1080 px), of cells over occMinPx on
    // screen; occBias: push back (cells)
    this.occlude = true; this.occPx = 40; this.occBias = .2; this.occMinPx = 1;
    // level changes: hysteresis (x the threshold), a per-dot cross-dissolve over xfT s, the next finer level prefetched
    this.hyst = 1.12; this.xfT = .35; this.prefetch = true;
    this.xs = new Map(); this._recs = []; this._np = 0; this._dv = [0, 0, 0]; this.now = 0;
    this.pending = [];              // levels queued by warm(), sampled within the frames' budget (idle())
    this._m9 = new Float32Array(9);
    this._scA = new Float32Array(32); this._scB = new Float32Array(32);   // scars, per instance (d.scars)
    this._km = new Float32Array(9);                                         // sections (d.slab): the instance's rotation
    this._btO = new Float32Array(BTMAX * 4); this._btX = new Float32Array(BTMAX * 4); this._btY = new Float32Array(BTMAX * 4); this._btZ = new Float32Array(BTMAX * 4);
    this.blastTex = null;                                                   // the blast patches' atlas (game/src/blast/system.js), unit 7
  }
  /* register a model factory: factory() -> {parts: [...]} in the GEO/HD part format.
     opts: { lods: [spacings], quant: {stateKey: step}, angles: [stateKeys], deps: {partName: [keys]} } */
  registerModel(key, factory, opts) {
    this.factories.set(key, factory); if (opts) this.opts.set(key, opts);
    const e = this.entries.get(key); if (e) { this._free(e); this.entries.delete(key); }
  }
  /* register a table of factories (e.g. data/models.js EXTRA_MODELS / CUT_MODELS); info[key].s = suggested
     spacings [near, mid, far] (data/models.js MODEL_INFO) become the levels of detail */
  registerAll(table, info) {
    for (const [k, f] of Object.entries(table || {})) {
      if (typeof f !== 'function') continue;
      const s = info && info[k] && info[k].s;
      this.registerModel(k, () => f(), s ? { lods: [s[0], s[1], s[2], s[2] * 2.5] } : undefined);
    }
  }
  has(key) { return this.factories.has(key); }
  /* the model entry (built on first use) */
  get(key) {
    let e = this.entries.get(key);
    if (e) return e;
    const f = this.factories.get(key);
    if (!f) throw new Error(`model '${key}' is not registered`);
    const model = f(), o = this.opts.get(key) || {};
    // rest-pose bounds (with each part's rest transform)
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    const parts = model.parts.map(part => {
      let b;
      try { b = GEO.bounds(part); } catch (err) { b = [[-1, -1, -1], [1, 1, 1]]; }
      let X0 = null; try { X0 = part.xf ? part.xf({}) : null; } catch (err) { X0 = null; }
      const c = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2];
      const rad = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]) / 2;
      const cw = X0 ? [X0.R[0] * c[0] + X0.R[1] * c[1] + X0.R[2] * c[2] + X0.T[0], X0.R[3] * c[0] + X0.R[4] * c[1] + X0.R[5] * c[2] + X0.T[1], X0.R[6] * c[0] + X0.R[7] * c[1] + X0.R[8] * c[2] + X0.T[2]] : c;
      if (rad < 1e6) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], cw[k] - rad * .8); mx[k] = Math.max(mx[k], cw[k] + rad * .8); }
      const P = { part, name: part.name, label: part.label, center: c, rad: Math.max(.05, rad), bounds: b, dyn: !!part.dyn, clouds: [], lru: null, deps: null, exact: true };
      if (P.dyn) this._deps(P, o);
      return P;
    });
    const L = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
    const sp0 = o.lods ? o.lods[0] : Math.max(.02, L / (L > 100 ? 1000 : 380));
    const lods = o.lods || [sp0, sp0 * 2.4, sp0 * 6, sp0 * 15];
    e = { key, model, parts, lods, L, bs: Math.max(1.5, Math.min(12, lods[0] * 24)), center: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], radius: Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2, o, anchors: model };
    for (const P of parts) { P.clouds = lods.map(() => null); if (P.dyn) P.lru = lods.map(() => new Map()); }
    this.entries.set(key, e);
    return e;
  }
  /* which state keys a dyn part reads */
  _deps(P, o) {
    if (o.deps && o.deps[P.name]) { P.deps = o.deps[P.name]; return; }
    const keys = new Set();
    const px = new Proxy({}, { get(t, k) { if (typeof k === 'string') keys.add(k); return undefined; }, has(t, k) { if (typeof k === 'string') keys.add(k); return false; } });
    try { P.part.dyn(px); } catch (err) { P.exact = false; }
    P.deps = [...keys];
    P.angleOnly = P.exact && P.deps.length > 0 && P.deps.every(k => ANGLE_KEYS.has(k) || (o.angles && o.angles.includes(k)));
  }
  _quant(e, P, st, lod) {
    const o = e.o, q = {}, ks = [];
    const keys = P.exact ? P.deps : Object.keys(st);
    for (const k of keys) {
      let v = st[k];
      if (typeof v === 'number') {
        if (ANGLE_KEYS.has(k) || (o.angles && o.angles.includes(k))) {
          const n = ANGLE_STEPS[Math.min(lod, 3)];
          let a = v % TAU; if (a < 0) a += TAU;
          v = Math.round(a / TAU * n) % n * (TAU / n);
        } else { const s = (o.quant && o.quant[k]) || LIN_STEP; v = Math.round(v / s) * s; }
        ks.push(k + '=' + v.toFixed(4));
      } else if (v !== undefined && v !== null && typeof v === 'object') ks.push(k + '=' + JSON.stringify(v));
      else ks.push(k + '=' + v);
      q[k] = v;
    }
    return { key: ks.join('|'), st: Object.assign({}, st, q) };
  }
  _seed(P, lod) { return 7 + lod * 13 + (P.name.length * 31) % 97; }
  _prims(P, st) { try { const p = GEO.primsOf ? GEO.primsOf(P.part, st || {}) : P.part.prims; return Array.isArray(p) ? p : null; } catch (err) { return null; } }
  /* one level of a part at state st, at once */
  _sample(e, P, lod, st) {
    const t0 = performance.now();
    const sp = e.lods[lod], seed = this._seed(P, lod), prims = this._prims(P, st);
    let cl;
    if (prims) {
      const W = new PtBuf(256);
      samplePrims(prims, 0, sp, mulberry(seed), lod >= 2, W, Infinity, seed);
      cl = this._uploadPacked(W.bytes(), W.n, sp, W.cells(), P.dyn ? 0 : e.bs);
    } else {
      const pts = GEO.sample({ parts: [P.part] }, sp, seed, st || {}, lod >= 2 ? { fine: false } : undefined)[0].pts;
      cl = this._upload(pts, pts.length / 6, sp, P.dyn ? 0 : e.bs);
    }
    this.spent += performance.now() - t0;
    this.stats.sampled++;
    return cl;
  }
  /* a static part's level sampled a few primitives at a time, within the frame's budget (limit: ms of this frame's
     sampling it may run up to): a big part (a town's block, a pier) never stalls a frame, it takes a few frames while a
     coarser level shows. Returns the cloud when the level is complete, else null. */
  _advance(e, P, lod, limit) {
    const jobs = P.jobs || (P.jobs = e.lods.map(() => null));
    let J = jobs[lod];
    if (!J) {
      const prims = this._prims(P, {});
      // no primitive list to walk (a custom part): the level at once
      if (!prims) return (P.clouds[lod] = this._sample(e, P, lod, {}));
      const seed = this._seed(P, lod);
      // room for the level at once, from a coarser level's count (no regrowth: less garbage, fewer GC pauses)
      let est = 256;
      for (let k = lod + 1; k < e.lods.length; k++) if (P.clouds[k] && P.clouds[k].n) { est = P.clouds[k].n * (e.lods[k] / e.lods[lod]) ** 2 * 1.1; break; }
      J = jobs[lod] = { prims, i: 0, W: new PtBuf(est), sp: e.lods[lod], seed, rnd: mulberry(seed), fine: lod >= 2 };
    }
    const t0 = performance.now();
    if (this.spent < limit) J.i = samplePrims(J.prims, J.i, J.sp, J.rnd, J.fine, J.W, t0 + (limit - this.spent), J.seed);
    let cl = null;
    if (J.i >= J.prims.length) {
      jobs[lod] = null;
      cl = P.clouds[lod] = this._uploadPacked(J.W.bytes(), J.W.n, J.sp, J.W.cells(), e.bs);
      this.stats.sampled++;
    }
    this.spent += performance.now() - t0;
    return cl;
  }
  /* GEO points (stride 6: xyz, normal) -> the GPU */
  _upload(pts, n, sp, bs) {
    if (!n) return { n: 0, sp };
    const W = new PtBuf(n); W.addGeo(pts);
    return this._uploadPacked(W.bytes(), W.n, sp, W.cells(), bs);
  }
  /* points (16 B) and their cells (12 B) -> the GPU. A big cloud is sorted into bricks (bs m cubes, each with its
     bounding sphere): culled one by one, and each gets its own sub-dot count from its own distance */
  _uploadPacked(buf, n, sp, cells, bs) {
    const gl = this.gl;
    if (!n) return { n: 0, sp };
    let f = buf instanceof ArrayBuffer ? new Float32Array(buf) : new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength >> 2);
    let bricks = null;
    if (bs > 0 && n >= BRICK_MIN) {
      const t0 = performance.now(), S = brickSort(f, cells, n, bs);
      if (S) { f = S.f; buf = S.f; cells = S.t; bricks = S.bricks; }
      const dt = performance.now() - t0; if (dt > this.stats.brickMs) this.stats.brickMs = dt;
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.BYTE, true, 16, 12);
    const vc = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vc);
    gl.bufferData(gl.ARRAY_BUFFER, cells, gl.STATIC_DRAW);
    for (let k = 0; k < 3; k++) { gl.enableVertexAttribArray(2 + k); gl.vertexAttribPointer(2 + k, 4, gl.BYTE, false, 12, k * 4); }
    gl.bindVertexArray(null);
    this.stats.points += n; this.stats.gpuMB += n * 28 / 1048576;
    return { vao, vb, vc, n, sp, pts: f, bricks };
  }
  _freeCloud(c) { if (c && c.vao) { this.gl.deleteVertexArray(c.vao); this.gl.deleteBuffer(c.vb); if (c.vc) this.gl.deleteBuffer(c.vc); this.stats.points -= c.n; this.stats.gpuMB -= c.n * 28 / 1048576; } }
  _free(e) { for (const P of e.parts) { P.clouds.forEach(c => this._freeCloud(c)); if (P.lru) P.lru.forEach(m => m.forEach(c => this._freeCloud(c))); } }

  /* the cloud of part P at level lod for state st: cached, or sampled within the frame's budget, or the
     nearest thing available (a coarser level, the last state). A static part refines one level at a time from what
     it has (the coarsest level first, at once: a few hundred points), each level sampled a few primitives at a time
     within the budget: a camera jump into a town costs a few frames of the coarser level, never one long frame. */
  cloud(e, P, lod, st, force) {
    if (!P.dyn) {
      const C = P.clouds;
      if (C[lod]) return C[lod];
      if (force) return (C[lod] = this._sample(e, P, lod, {}));
      const nl = C.length;
      // what there is to show meanwhile: the finest coarser level, else the nearest finer one
      let co = -1, fi = -1;
      for (let k = lod + 1; k < nl; k++) if (C[k]) { co = k; break; }
      if (co < 0) for (let k = lod - 1; k >= 0; k--) if (C[k]) { fi = k; break; }
      const none = co < 0 && fi < 0;
      let w = co >= 0 ? co - 1 : fi >= 0 ? lod : nl - 1;
      while (w >= lod) {
        // nothing to draw at all: the coarsest level may run a little over (it is small)
        const lim = none && w === nl - 1 ? this.budgetMs * 1.4 : this.budgetMs;
        if (this.spent >= lim) break;
        const c = this._advance(e, P, w, lim);
        if (!c) break;
        if (w === lod) return c;
        co = w; w--;
      }
      return co >= 0 ? C[co] : fi >= 0 ? C[fi] : null;
    }
    const lru = P.lru[lod], q = this._quant(e, P, st, lod);
    let c = lru.get(q.key);
    if (c) { lru.delete(q.key); lru.set(q.key, c); return c; }
    if (force || this.spent < this.budgetMs || !lru.size) {
      c = this._sample(e, P, lod, q.st);
      lru.set(q.key, c);
      // a part that only turns (fans with the blades in the geometry) keeps every step of its turn
      const cap = P.angleOnly ? ANGLE_STEPS[Math.min(lod, 3)] + 4 : LRU_MAX;
      if (lru.size > cap) { const k0 = lru.keys().next().value; this._freeCloud(lru.get(k0)); lru.delete(k0); }
      return c;
    }
    // over budget: the most recent state at this level, or at a coarser one
    let last = null; for (const v of lru.values()) last = v;
    return last;
  }
  /* pre-sample every part of a model at the given levels, outside the frame budget. Without lods: the coarsest level
     now, the next one queued (sampled in the frames that follow, within their budget: see idle()) */
  warm(key, lods) {
    const e = this.get(key);
    if (lods) { for (const l of lods) for (const P of e.parts) if (!P.dyn && l >= 0 && l < e.lods.length) this.cloud(e, P, l, {}, true); return e; }
    const lc = e.lods.length - 1;
    for (const P of e.parts) {
      if (P.dyn) continue;
      this.cloud(e, P, lc, {}, true);
      if (lc > 0 && !P.clouds[lc - 1]) this.pending.push({ e, P, lod: lc - 1 });
    }
    return e;
  }
  /* the queued levels (warm), within what is left of this frame's budget (the renderer calls it after the models) */
  idle() {
    const Q = this.pending;
    while (Q.length && this.spent < this.budgetMs) {
      const q = Q[0];
      if (q.P.clouds[q.lod] || this.entries.get(q.e.key) !== q.e || this._advance(q.e, q.P, q.lod, this.budgetMs)) Q.shift();
    }
  }

  /* ---------- drawing ----------
     Per frame: prepare(d) every queued instance (cull, levels, transforms), drawDepth(d) (the occlusion splats, before
     the sea and sky dots), drawColor(d) (the dots). draw(d) = prepare + drawColor. */
  begin() {
    this.spent = 0;
    this.now = this.clock ? this.clock() : performance.now() / 1000;
    this._np = 0;
    this.stats.sub = 0; this.stats.bricks = 0; this.stats.occ = 0; this.stats.culled = 0;
    // forget the cross-fade state of instances not seen for a while
    if (this.now - (this._pruned || 0) > 2) { this._pruned = this.now; for (const [k, S] of this.xs) if (this.now - S.seen > 5) this.xs.delete(k); }
  }
  _rec() {
    const i = this._np++;
    let r = this._recs[i];
    if (!r) r = this._recs[i] = { m: new Float32Array(9), t: [0, 0, 0], cl: null, cl2: null, k: 1, pa: 1, xr: 0, dm: 0, gm: 0, gy: 1, den: [0, 0, 0, 0], pd: 0, rad: 0, spr: 0, dyn: false };
    return r;
  }
  draw(d, cam, frame) { this.prepare(d, cam, frame); return this.drawColor(d, cam, frame); }
  /* plan one instance for this frame (d as draw() takes it): the whole-model and per-part culls, each part's level
     (hysteresis, a cross-dissolve when the drawn level changes, the next finer level prefetched), its transform and
     uniforms. Sets d.speck (too small: the renderer draws one return), d._occ (writes occlusion). Returns the points
     it will draw (before sub-dots). */
  prepare(d, cam, frame) {
    d._p0 = d._p1 = this._np; d.speck = false; d._occ = false;
    const e = this.get(d.key), eye = cam.eye, st = d.st || {};
    const flc = frame.fl1080, R0 = d.R, T0 = d.T;
    // whole-model cull
    const c0 = e.center, cw0 = R0[0] * c0[0] + R0[1] * c0[1] + R0[2] * c0[2] + T0[0] - eye[0], cw1 = R0[3] * c0[0] + R0[4] * c0[1] + R0[5] * c0[2] + T0[1] - eye[1], cw2 = R0[6] * c0[0] + R0[7] * c0[1] + R0[8] * c0[2] + T0[2] - eye[2];
    const dv = this._dv; dv[0] = cw0; dv[1] = cw1; dv[2] = cw2;
    const dist = Math.hypot(cw0, cw1, cw2);
    const ex = d.explode || 0, rad = e.radius * (1 + ex * 1.5);
    if (!frame.sphereVisible(dv, rad)) { this.stats.culled++; return 0; }
    const mr = e.radius * flc / Math.max(1, dist);
    if (mr < .7) { d.speck = true; return 0; }
    // a cutaway (Inspect, the hit replay, the museum, an x-ray): the Anatomy films' look once it fills the frame (kCut:
    // model radius ~110-260 px); its highlights go on a knee (parts brightened over 1 keep their shading)
    const cut = d.gate || d.xray > 0 || d.partXray ? 1 : 0, kCut = cut ? sstep((mr - 110) / 150) : 0;
    d._cut = cut;
    // occlusion (the depth splats): a solid instance large enough on screen for its gaps to matter
    d._occ = this.occlude && !cut && !(d.alpha < .95) && !(d.dissolve > 0) && !(ex > 0) && !d.noOcc && mr > this.occPx;
    const G = d.gate || null, K = d.slab || null;
    // the cross-fade state (per instance: its id, else its key and place)
    let S = null;
    if (this.xfT > 0) {
      const xk = d.id !== undefined ? d.id : d.key + '@' + Math.round(T0[0]) + ',' + Math.round(T0[1]) + ',' + Math.round(T0[2]);
      S = this.xs.get(xk);
      const np = e.parts.length;
      if (!S || S.e !== e) { S = { e, L: new Int8Array(np).fill(-1), cur: new Array(np).fill(null), prev: new Array(np).fill(null), t0: new Float64Array(np).fill(-1e9) }; this.xs.set(xk, S); }
      S.seen = this.now;
    }
    const nl = e.lods.length, dsp0 = d.dotSpacing !== undefined ? d.dotSpacing : this.dotSpacing;
    let est = 0;
    for (let pi = 0; pi < e.parts.length; pi++) {
      const Pt = e.parts[pi], part = Pt.part;
      if (part.show && !part.show(st)) continue;
      const pa = (d.partAlpha && d.partAlpha[Pt.name] !== undefined ? d.partAlpha[Pt.name] : 1) * (d.alpha === undefined ? 1 : d.alpha);
      if (pa <= .004) continue;
      let X = part.xf ? part.xf(st) : null;
      let Rp = X ? mul3(R0, X.R) : R0;
      let Tp = X ? [R0[0] * X.T[0] + R0[1] * X.T[1] + R0[2] * X.T[2] + T0[0], R0[3] * X.T[0] + R0[4] * X.T[1] + R0[5] * X.T[2] + T0[1], R0[6] * X.T[0] + R0[7] * X.T[1] + R0[8] * X.T[2] + T0[2]] : T0;
      // a section of a broken hull (d.slab): the parts wholly outside its slab are left out
      if (K && slabOut(K, X, Pt)) continue;
      if (d.partX && d.partX[Pt.name]) { const Y = d.partX[Pt.name]; Tp = [Tp[0] + Rp[0] * Y.T[0] + Rp[1] * Y.T[1] + Rp[2] * Y.T[2], Tp[1] + Rp[3] * Y.T[0] + Rp[4] * Y.T[1] + Rp[5] * Y.T[2], Tp[2] + Rp[6] * Y.T[0] + Rp[7] * Y.T[1] + Rp[8] * Y.T[2]]; Rp = mul3(Rp, Y.R); }
      if (ex > 0) {
        // exploded view: each assembly floats away from the model's centre along its own offset
        const pc = X ? [X.R[0] * Pt.center[0] + X.R[1] * Pt.center[1] + X.R[2] * Pt.center[2] + X.T[0], X.R[3] * Pt.center[0] + X.R[4] * Pt.center[1] + X.R[5] * Pt.center[2] + X.T[1], X.R[6] * Pt.center[0] + X.R[7] * Pt.center[1] + X.R[8] * Pt.center[2] + X.T[2]] : Pt.center;
        const off = [(pc[0] - e.center[0]) * ex * 1.1, (pc[1] - e.center[1]) * ex * 1.1 + ex * e.L * .08 * ((Pt.name.length % 3) + 1) / 3, (pc[2] - e.center[2]) * ex * 1.1];
        const ow = ap3(R0, off); Tp = [Tp[0] + ow[0], Tp[1] + ow[1], Tp[2] + ow[2]];
      }
      // this part's level of detail from its own distance
      const pc = ap3(Rp, Pt.center);
      const px = Tp[0] + pc[0] - eye[0], py = Tp[1] + pc[1] - eye[1], pz = Tp[2] + pc[2] - eye[2];
      const pd = Math.hypot(px, py, pz);
      dv[0] = px; dv[1] = py; dv[2] = pz;
      if (!frame.sphereVisible(dv, Pt.rad)) { this.stats.culled++; continue; }
      const dd = Math.max(.3, pd - Pt.rad * .6);
      let L = nl - 1;
      while (L > 0 && e.lods[L] * flc / dd > this.lodPx) L--;
      let cl, cl2 = null, k = 1;
      if (S && Pt.dyn) {
        // a dyn part (sampled per state: no cross-fade) keeps the hysteresis
        let c = S.L[pi];
        if (c < 0) c = L;
        else {
          while (c > 0 && e.lods[c] * flc / dd > this.lodPx * this.hyst) c--;
          while (c < nl - 1 && e.lods[c + 1] * flc / dd < this.lodPx / this.hyst) c++;
        }
        S.L[pi] = c;
        cl = this.cloud(e, Pt, d.lodBias ? Math.max(0, Math.min(nl - 1, c + d.lodBias)) : c, st);
      } else if (S) {
        // hysteresis: the level held until the range is well past its threshold (no flicker at the threshold)
        let c = S.L[pi];
        if (c < 0) c = L;
        else {
          while (c > 0 && e.lods[c] * flc / dd > this.lodPx * this.hyst) c--;
          while (c < nl - 1 && e.lods[c + 1] * flc / dd < this.lodPx / this.hyst) c++;
        }
        S.L[pi] = c;
        const lod = d.lodBias ? Math.max(0, Math.min(nl - 1, c + d.lodBias)) : c;
        // the next finer level sampled before the range asks for it (within the frame's budget)
        if (this.prefetch && lod > 0 && !Pt.clouds[lod - 1] && e.lods[lod] * flc / dd > this.lodPx * .55) this.cloud(e, Pt, lod - 1, st);
        cl = this.cloud(e, Pt, lod, st);
        // whatever the drawn cloud changes to (a level switch, a late level arriving) dissolves in over xfT
        if (cl && cl !== S.cur[pi]) {
          if (S.cur[pi] && S.cur[pi].n) { S.prev[pi] = S.cur[pi]; S.t0[pi] = this.now; }
          S.cur[pi] = cl;
        }
        k = sat01((this.now - S.t0[pi]) / this.xfT);
        if (k < 1 && S.prev[pi] && S.prev[pi] !== cl) cl2 = S.prev[pi]; else { S.prev[pi] = null; k = 1; }
      } else {
        const lod = d.lodBias ? Math.max(0, Math.min(nl - 1, L + d.lodBias)) : L;
        cl = this.cloud(e, Pt, lod, st);
      }
      if (!cl || !cl.n) continue;
      // the cloud's shape, once: a thin plate (a wing, a fin) and its layering (walls stacked along a line of sight)
      if (cl.flat === undefined) { cl.flat = flatness(cl) > .72; cl.layer = layering(Pt, cl); }
      if (cl2 && cl2.flat === undefined) { cl2.flat = flatness(cl2) > .72; cl2.layer = layering(Pt, cl2); }
      const r = this._rec(), m = r.m;
      m[0] = Rp[0]; m[1] = Rp[3]; m[2] = Rp[6]; m[3] = Rp[1]; m[4] = Rp[4]; m[5] = Rp[7]; m[6] = Rp[2]; m[7] = Rp[5]; m[8] = Rp[8];
      r.t[0] = Tp[0] - eye[0]; r.t[1] = Tp[1] - eye[1]; r.t[2] = Tp[2] - eye[2];
      r.cl = cl; r.cl2 = cl2; r.k = k; r.pa = pa; r.pd = pd; r.rad = Pt.rad; r.dyn = Pt.dyn; r.inside = !!part.inside;
      slabRec(r, K, R0, T0, eye);
      r.xr = d.partXray && d.partXray[Pt.name] !== undefined ? d.partXray[Pt.name] : (d.xray || 0);
      // the coral part tint only in a cutaway (Inspect, the hit replay: a cue there), and never on a unit with hit marks:
      // damage is local, the scars show it (no whole deck or superstructure turned coral)
      r.dm = cut && d.damage && d.damage[Pt.name] && !(d.scars && d.scars.n) ? d.damage[Pt.name] : 0;
      r.gm = G ? (d.partGate && d.partGate[Pt.name] !== undefined ? d.partGate[Pt.name] : (G.mode || 0)) : 0;
      r.gy = 1 + (cl.layer - 1) * kCut;
      // dots per pixel: thinned on screen, never below the density of the model's coarsest level. Faces seen edge-on
      // are counted by their facing only on parts large on screen (a deck, a hull side: no slab); a small part keeps
      // its silhouette's pile-up (a wing, a mast: the films' crisp edges). A part small on screen is not thinned at all:
      // a unit seen from play range stays a dense bright silhouette that pops over the ground (the films' small ships);
      // the cap comes in as the part grows past ~70-220 px. A thin plate (a wing, a fin, a deck: its face is large for
      // its radius) comes in sooner, from ~30-110 px
      const spr = Pt.rad * flc / Math.max(.3, pd), kb = sat01((spr - 140) / 460);
      r.spr = spr;
      const s0 = cl.flat ? 30 : 70, s1 = cl.flat ? 110 : 220;
      let kSmall = 1 - sstep((spr - s0) / (s1 - s0)), dsp = dsp0;
      if (kCut > 0) {
        // a cutaway that fills the frame: every part but the smallest capped, the parts that are not x-rayed shells
        // (the interior, the named assemblies) sparser, so they read as dotted volumes with visible structure
        kSmall += (Math.min(kSmall, 1 - sstep((spr - 8) / 28)) - kSmall) * kCut;
        if (r.xr <= 0 && dsp0 > 0) dsp = dsp0 + (Math.max(dsp0, this.dotSpacingCut) - dsp0) * kCut;
      }
      r.den[0] = dsp; r.den[1] = 1 - (1 - this.grazing) * kb * kb * (3 - 2 * kb); r.den[2] = kSmall; r.den[3] = cut;
      est += cl.n + (cl2 ? cl2.n : 0);
    }
    d._p1 = this._np;
    return est;
  }
  /* scars (game/scars.js): model frame -> world-aligned, relative to the eye, into _scA / _scB; returns how many */
  _scars(d, eye) {
    const S = d.scars, ns = S && S.n ? Math.min(8, S.n) : 0, R0 = d.R, T0 = d.T;
    if (!ns) return 0;
    const L = S.L, A = this._scA, B = this._scB;
    for (let i = 0; i < ns; i++) {
      const x = L[i * 8], y = L[i * 8 + 1], z = L[i * 8 + 2], nx = L[i * 8 + 4], ny = L[i * 8 + 5], nz = L[i * 8 + 6];
      A[i * 4] = R0[0] * x + R0[1] * y + R0[2] * z + T0[0] - eye[0];
      A[i * 4 + 1] = R0[3] * x + R0[4] * y + R0[5] * z + T0[1] - eye[1];
      A[i * 4 + 2] = R0[6] * x + R0[7] * y + R0[8] * z + T0[2] - eye[2];
      A[i * 4 + 3] = L[i * 8 + 3];
      B[i * 4] = R0[0] * nx + R0[1] * ny + R0[2] * nz; B[i * 4 + 1] = R0[3] * nx + R0[4] * ny + R0[5] * nz; B[i * 4 + 2] = R0[6] * nx + R0[7] * ny + R0[8] * nz;
      B[i * 4 + 3] = L[i * 8 + 7];
    }
    return ns;
  }
  /* blast patches (d.scars.blast: { n, F: Float32Array(6 x 16: origin xyz, depth, x axis, heat, y axis, grid, z axis,
     band) model frame, P, Q: Float32Array(12 x 4) }): model frame -> world, relative to the eye, into the uniforms */
  _blast(gl, P, d, eye) {
    const u = P.u, B = d.scars && d.scars.blast, n = B && B.n && this.blastTex ? Math.min(BTMAX, B.n) : 0;
    gl.uniform1i(u.uBtN, n);
    if (!n) return 0;
    if (P._bt !== this.blastTex) { gl.uniform1i(u.uBtT, 7); P._bt = this.blastTex; }
    const R0 = d.R, T0 = d.T, F = B.F, O = this._btO, X = this._btX, Y = this._btY, Z = this._btZ;
    for (let i = 0; i < n; i++) {
      const o = i * 16, x = F[o], y = F[o + 1], z = F[o + 2];
      O[i * 4] = R0[0] * x + R0[1] * y + R0[2] * z + T0[0] - eye[0]; O[i * 4 + 1] = R0[3] * x + R0[4] * y + R0[5] * z + T0[1] - eye[1]; O[i * 4 + 2] = R0[6] * x + R0[7] * y + R0[8] * z + T0[2] - eye[2]; O[i * 4 + 3] = F[o + 3];
      for (let q = 0; q < 3; q++) {
        const A = q === 0 ? X : q === 1 ? Y : Z, k = 4 + q * 4, ax = F[o + k], ay = F[o + k + 1], az = F[o + k + 2];
        A[i * 4] = R0[0] * ax + R0[1] * ay + R0[2] * az; A[i * 4 + 1] = R0[3] * ax + R0[4] * ay + R0[5] * az; A[i * 4 + 2] = R0[6] * ax + R0[7] * ay + R0[8] * az; A[i * 4 + 3] = F[o + k + 3];
      }
    }
    gl.uniform4fv(u.uBtO, O); gl.uniform4fv(u.uBtX, X); gl.uniform4fv(u.uBtY, Y); gl.uniform4fv(u.uBtZ, Z);
    gl.uniform4fv(u.uBtP, B.P); gl.uniform4fv(u.uBtQ, B.Q);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, this.blastTex); gl.activeTexture(gl.TEXTURE0);
    return n;
  }
  /* sub-dot instances a cloud needs at distance dn (m): its level's spacing on screen over the sub-dot spacing,
     squared (1..256) */
  _inst(cl, dn, flc) {
    if (!(this.subPx > 0)) return 1;
    const q = cl.sp * flc / Math.max(.05, dn) / (this.subPx * this.subScale), n = q * q;
    return n <= 1 ? 1 : Math.min(256, Math.ceil(n));
  }
  /* one cloud of a part: per brick (culled, each with its own sub-dot count) when it has bricks and is close or large
     on screen, else in one draw. depth: the occlusion pass (no sub-dots) */
  _drawCloud(cl, r, frame, depth) {
    const gl = this.gl, flc = frame.fl1080, near = frame.near || .1;
    gl.bindVertexArray(cl.vao);
    const B = cl.bricks, instP = depth || this._ns ? 1 : this._inst(cl, Math.max(near, r.pd - r.rad), flc);
    if (!B || (instP <= 1 && r.spr < 300 && !r.kon)) {
      if (instP > 1) { gl.drawArraysInstanced(gl.POINTS, 0, cl.n, instP); this.stats.sub += cl.n * (instP - 1); }
      else gl.drawArrays(gl.POINTS, 0, cl.n);
      return cl.n;
    }
    const m = r.m, t = r.t, S = B.s, Rr = B.r, dv = this._dv;
    let f0 = -1, cnt = 0, ci = 1, drawn = 0;
    const flush = () => {
      if (cnt > 0) { if (ci > 1) { gl.drawArraysInstanced(gl.POINTS, f0, cnt, ci); this.stats.sub += cnt * (ci - 1); } else gl.drawArrays(gl.POINTS, f0, cnt); drawn += cnt; }
      cnt = 0; f0 = -1;
    };
    for (let b = 0; b < B.n; b++) {
      const x = S[b * 4], y = S[b * 4 + 1], z = S[b * 4 + 2], br = S[b * 4 + 3];
      // (m is column-major: world = m * p + t)
      dv[0] = m[0] * x + m[3] * y + m[6] * z + t[0]; dv[1] = m[1] * x + m[4] * y + m[7] * z + t[1]; dv[2] = m[2] * x + m[5] * y + m[8] * z + t[2];
      if (!frame.sphereVisible(dv, br)) { flush(); this.stats.bricks++; continue; }
      // a section's slab (d.slab): the bricks wholly outside it
      if (r.kon) { const zm = dv[0] * r.kz[0] + dv[1] * r.kz[1] + dv[2] * r.kz[2] - r.kz[3]; if (zm + br < r.klo || zm - br > r.khi) { flush(); this.stats.bricks++; continue; } }
      const inst = depth || this._ns ? 1 : this._inst(cl, Math.max(near, Math.hypot(dv[0], dv[1], dv[2]) - br), flc);
      const a = Rr[b * 2], n = Rr[b * 2 + 1];
      if (cnt > 0 && (inst !== ci || a !== f0 + cnt)) flush();
      if (cnt === 0) { f0 = a; ci = inst; }
      cnt += n;
    }
    flush();
    return drawn;
  }
  /* the occlusion pass (depth only, before the sea and sky dots): each front-facing sample splats its own cell
     (exactly the parallelogram it stands for on screen), pushed back a little along the line of sight, so the gaps
     between a hull's dots hide the sea and the far side instead of showing them. Not for cutaways, x-rays, faded or
     exploded instances; not round a scar's hole (it shows into the hull) */
  drawDepth(d, cam, frame) {
    if (!d._occ || d._p1 <= d._p0) return 0;
    const gl = this.gl, P = this.PD, u = P.u, G = this.G;
    gl.useProgram(P.p);
    gl.uniform4f(u.uVp, G.W / 2, G.H / 2, Math.min(G.pointMax || 256, 511), this.occMinPx * G.H / 1080);
    const ns = this._scars(d, cam.eye);
    if (ns) { gl.uniform4fv(u.uScA, this._scA); gl.uniform4fv(u.uScB, this._scB); gl.uniform4fv(u.uScC, d.scars.C); gl.uniform4fv(u.uScD, d.scars.D || SC0); }
    gl.uniform1i(u.uScN, ns);
    this._blast(gl, P, d, cam.eye);
    this._slab(gl, u, d, cam.eye);
    let n = 0;
    for (let i = d._p0; i < d._p1; i++) {
      const r = this._recs[i];
      if (r.pa < .95 || r.xr > 0 || r.gm) continue;
      // the finer of the two levels during a cross-fade
      const cl = r.cl2 && r.cl2.sp < r.cl.sp ? r.cl2 : r.cl;
      gl.uniformMatrix3fv(u.uR, false, r.m);
      gl.uniform3f(u.uT, r.t[0], r.t[1], r.t[2]);
      gl.uniform4f(u.uP, r.inside ? 1 : 0, this.occBias, 0, cl.sp);
      n += this._drawCloud(cl, r, frame, true);
    }
    this.stats.occ += n;
    return n;
  }
  /* the dots of a prepared instance. Returns the number of samples drawn (their sub-dots: stats.sub) */
  drawColor(d, cam, frame) {
    if (d._p1 <= d._p0) return 0;
    const gl = this.gl, P = this.P, u = P.u, eye = cam.eye, e = this.get(d.key);
    gl.useProgram(P.p);
    const tint = d._rgb || WH1;
    gl.uniform4f(u.uTint, tint[0], tint[1], tint[2], d._k || 0);
    gl.uniform4f(u.uQ, d.noBack ? 1 : 0, d._face || 0, d.bright === undefined ? 1 : d.bright, d.dissolve || 0);
    { const f = cam.f, az = Math.atan2(f[0], f[2]) + this.fillAz, ce = Math.cos(this.fillEl);
      gl.uniform4f(u.uFill, ce * Math.sin(az), Math.sin(this.fillEl), ce * Math.cos(az), this.fill); }
    const sub = this.subPx > 0 && !d.noSub;
    gl.uniform4f(u.uSub, sub ? this.subPx * this.subScale : 0, this.subJitter, this.dotCap, this.subCap * this.subScale);
    // Inspect x-ray gate: d.gate = { n: world unit normal, d: n.p of the front (world), w: band (m), g: afterglow (m),
    // mode: default per part }, d.partGate = { part: mode } (0 off, 1 shell, 2 hidden, 3 part; see the shader)
    const G = d.gate || null;
    if (G) gl.uniform4f(u.uGP, G.n[0], G.n[1], G.n[2], G.d - (G.n[0] * eye[0] + G.n[1] * eye[1] + G.n[2] * eye[2]));
    const ns = this._scars(d, eye);
    if (ns) { gl.uniform4fv(u.uScA, this._scA); gl.uniform4fv(u.uScB, this._scB); gl.uniform4fv(u.uScC, d.scars.C); gl.uniform4fv(u.uScD, d.scars.D || SC0); }
    gl.uniform1i(u.uScN, ns);
    this._blast(gl, P, d, eye);
    this._slab(gl, u, d, eye);
    const spMax = e.lods[e.lods.length - 1];
    let drawn = 0;
    for (let i = d._p0; i < d._p1; i++) {
      const r = this._recs[i];
      gl.uniformMatrix3fv(u.uR, false, r.m);
      gl.uniform3f(u.uT, r.t[0], r.t[1], r.t[2]);
      gl.uniform4f(u.uG, r.gm, r.gy, G ? G.w || 1 : 1, G ? G.g || 1 : 1);
      for (let c = 0; c < 2; c++) {
        const cl = c ? r.cl2 : r.cl;
        if (!cl) continue;
        const fl = Math.min(1, (cl.sp / spMax) * (cl.sp / spMax));
        gl.uniform4f(u.uP, r.pa, r.xr, r.dm, cl.sp);
        gl.uniform4f(u.uDen, r.den[0], r.den[1], Math.max(r.den[2], fl), r.den[3]);
        gl.uniform4f(u.uX, r.k, r.k < 1 ? (c ? -1 : 1) : 0, r.inside ? 1 : 0, 0);
        this._ns = !sub;
        drawn += this._drawCloud(cl, r, frame, false);
        this._ns = false;
      }
    }
    return drawn;
  }

  /* a section's slab (d.slab = { z0, z1, a0, a1 (tear amplitudes, m), s0, s1 (tear seeds), h0, h1 (heat of the torn
     edges 0..1), band (m), wave (tear wavelength, m), yc (the hull's axis height) }, game/structure) into the uniforms */
  _slab(gl, u, d, eye) {
    const K = d.slab;
    if (!K) { gl.uniform4f(u.uKb, 1, 0, 1, 0); return; }
    const R0 = d.R, m = this._km;
    m[0] = R0[0]; m[1] = R0[3]; m[2] = R0[6]; m[3] = R0[1]; m[4] = R0[4]; m[5] = R0[7]; m[6] = R0[2]; m[7] = R0[5]; m[8] = R0[8];
    gl.uniformMatrix3fv(u.uKR, false, m);
    gl.uniform3f(u.uKT, d.T[0] - eye[0], d.T[1] - eye[1], d.T[2] - eye[2]);
    gl.uniform4f(u.uK0, K.z0, K.a0 || 0, K.s0 || 0, K.h0 || 0);
    gl.uniform4f(u.uK1, K.z1, K.a1 || 0, K.s1 || 0, K.h1 || 0);
    gl.uniform4f(u.uKb, K.band || 1, 1, K.wave || 4, K.yc || 0);
  }
  /* screen box of an instance as drawn (thinned points of the coarse level through cam.project) */
  screenBox(d, cam) {
    const e = this.get(d.key), st = d.st || {}, R0 = d.R, T0 = d.T, q = [0, 0, 0];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, ok = false;
    const lod = Math.min(e.lods.length - 1, 2);
    for (const Pt of e.parts) {
      const part = Pt.part;
      if (part.show && !part.show(st)) continue;
      if (d.partAlpha && d.partAlpha[Pt.name] === 0) continue;
      const cl = this.cloud(e, Pt, lod, st, true);
      if (!cl || !cl.n) continue;
      const X = part.xf ? part.xf(st) : null;
      const Rp = X ? mul3(R0, X.R) : R0;
      const Tp = X ? [R0[0] * X.T[0] + R0[1] * X.T[1] + R0[2] * X.T[2] + T0[0], R0[3] * X.T[0] + R0[4] * X.T[1] + R0[5] * X.T[2] + T0[1], R0[6] * X.T[0] + R0[7] * X.T[1] + R0[8] * X.T[2] + T0[2]] : T0;
      const f = cl.pts, n = cl.n, step = Math.max(1, Math.floor(n / 160));
      for (let i = 0; i < n; i += step) {
        const x = f[i * 4], y = f[i * 4 + 1], z = f[i * 4 + 2];
        const w = [Rp[0] * x + Rp[1] * y + Rp[2] * z + Tp[0], Rp[3] * x + Rp[4] * y + Rp[5] * z + Tp[1], Rp[6] * x + Rp[7] * y + Rp[8] * z + Tp[2]];
        if (!cam.project(w, q)) continue;
        ok = true;
        if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
      }
    }
    return ok ? [x0, y0, x1, y1] : null;
  }
  /* world transform of a named part of an instance (for anchors: muzzles, tubes, rotor hubs) */
  partWorld(d, name) {
    const e = this.get(d.key), Pt = e.parts.find(p => p.name === name); if (!Pt) return null;
    const X = Pt.part.xf ? Pt.part.xf(d.st || {}) : { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: [0, 0, 0] };
    const R = mul3(d.R, X.R), T = ap3(d.R, X.T);
    return { R, T: [T[0] + d.T[0], T[1] + d.T[1], T[2] + d.T[2]] };
  }
}
