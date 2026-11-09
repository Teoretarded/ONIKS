/* The DEBUG render style (R.style === 'debug', ?style=debug, Settings > Graphics > Render style): every model as a
   solid, lit, triangulated surface instead of dots, so damage reads at a glance.

   - Meshed from the same primitives the dots are sampled from (hex, lathe, panel, hull, blades, line), in part space,
     tessellated to ~L/500 (0.12-0.5 m) so the blast patches and scars can bend it; cached per part (dyn parts per
     quantized state, as the dot clouds are).
   - The same damage as the dots, from the same GLSL (models.js scarGLSL / blastGLSL / SLAB_GLSL): the vertices are
     displaced as the solver left the plating; the holes are cut per pixel (each fragment re-runs the torn test at its
     rest point), so a hole's outline is the dots' ragged outline, not the mesh's triangles.
   - Shading: painted steel (haze grey, a dielectric's soft highlight), bare metal where the plating tore (bright,
     metallic, sharp highlight), soot where it burnt, the torn rim glowing while hot. A faint 1 m grid in the part's own
     frame rides the plating, so a dent bends the grid lines. Facets from the displaced surface's own derivatives.
   - Modes (R.solid.mode): 0 shaded, 1 deformation (how far each point moved: out lime > white > coral, in blue),
     2 parts (a colour per part), 3 normals, 4 damage flags (burn red, hot yellow, torn edge white, intact grey).

   R.solid.grid (0..1), R.solid.stats { meshes, tris, ms }. Data for agents: R.solid.meshData(key) -> per part
   { name, tris, verts, bounds }, R.solid.exportOBJ(key) -> an OBJ string of the rest mesh. */
import { HEAD, FRAME, COMMON } from './shaders.js';
import { program } from './gl.js';
import { scarGLSL, blastGLSL, SLAB_GLSL } from './models.js';

const UNI = `
uniform vec4 uMat;        // rgb: paint albedo, w: part hash (0..1)
uniform vec4 uDbg;        // x: mode, y: grid strength, z: alpha, w: inside (an interior part)
uniform vec4 uKey;        // the key light, fixed to the view (over the lens's left shoulder): xyz toward it, w strength
${scarGLSL()}
${blastGLSL()}
`;

const VS = HEAD + FRAME + COMMON + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNrm;
uniform mat3 uR;
uniform vec3 uT;
${UNI}
out vec3 vRest;   // rest point (RTE, before the damage)
out vec3 vN0;     // rest normal (world)
out vec3 vP;      // displaced point (RTE)
out vec3 vM;      // part-space point (the grid)
out vec3 vNm;     // part-space normal
out vec3 vDisp;   // how far the damage moved it (world m)
out float vLz;
void main() {
  vec3 p = uR * aPos + uT, n = uR * aNrm, pr = p;
  float burn = 0.0, hot = 0.0, edge = 0.0, heatN = 0.0; gIn = uDbg.w;
  if (uScN > 0) { int k = scarAt(p, n, 0u, false, burn, hot, edge, heatN); }
  vec3 tilt = vec3(0.0);
  if (uBtN > 0) { vec3 q = p; if (blastAt(q, n, false, burn, hot, edge, heatN, tilt) == 0) p = q; else p = q; }
  vRest = pr; vN0 = n; vP = p; vM = aPos; vNm = aNrm; vDisp = p - pr;
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  vLz = 1.0 + max(c.w, 0.0);
  gl_Position = c;
}
`;

const FS = HEAD + FRAME + COMMON + `
${UNI}
${SLAB_GLSL}
in vec3 vRest;
in vec3 vN0;
in vec3 vP;
in vec3 vM;
in vec3 vNm;
in vec3 vDisp;
in float vLz;
out vec4 o;
float gridLine(vec3 m, vec3 n) {
  // 1 m lines on the two axes across the face (the one along the normal skipped), anti-aliased by the derivative
  vec3 a = abs(n);
  vec3 f = abs(fract(m + 0.5) - 0.5) / max(fwidth(m), vec3(1e-4));
  float g = 1.0;
  if (a.x < 0.8) g = min(g, f.x);
  if (a.y < 0.8) g = min(g, f.y);
  if (a.z < 0.8) g = min(g, f.z);
  return 1.0 - clamp(g, 0.0, 1.0);
}
void main() {
  gl_FragDepth = log2(max(1e-6, vLz)) * uCam.z * 0.5;
  float burn = 0.0, hot = 0.0, edge = 0.0, heatN = 0.0; gIn = uDbg.w;
  vec3 n0 = normalize(vN0);
  uint hid = hash1(uint(int(floor(vM.x * 16.0)) * 73856093) ^ uint(int(floor(vM.y * 16.0)) * 19349663) ^ uint(int(floor(vM.z * 16.0)) * 83492791));
  if (uScN > 0) { vec3 q = vRest; if (scarAt(q, n0, hid, false, burn, hot, edge, heatN) == 1) discard; }
  vec3 tilt = vec3(0.0);
  if (uBtN > 0 && btNear(vRest)) { vec3 q = vRest; if (blastAt(q, n0, false, burn, hot, edge, heatN, tilt) == 1) discard; }
  if (uKb.y > 0.5) {
    vec3 pm = (vRest - uKT) * uKR;
    float c0 = uK0.x + uK0.y * jagK(pm.xy / uKb.z, uK0.z), c1 = uK1.x + uK1.y * jagK(pm.xy / uKb.z, uK1.z);
    if (pm.z < c0 || pm.z >= c1) discard;
    float e0 = (pm.z - c0) / uKb.x, e1 = (c1 - pm.z) / uKb.x, e = min(e0, e1);
    if (e < 1.0) { edge = max(edge, 1.0 - e); heatN = max(heatN, e0 < e1 ? uK0.w : uK1.w); }
  }
  vec3 v = normalize(vP);
  // the surface as it is now: facets of the displaced mesh where it moved, the smooth rest normal (plus the solver's
  // bend) where it did not
  vec3 ng = cross(dFdx(vP), dFdy(vP));
  float lg = length(ng);
  vec3 n = n0;
  if (dot(tilt, tilt) > 1e-6) n = normalize(n0 + tilt);
  float moved = length(vDisp);
  if (lg > 1e-12 && moved > 0.01) { ng /= lg; if (dot(ng, n) < 0.0) ng = -ng; n = normalize(mix(n, ng, clamp(moved / 0.05, 0.0, 1.0))); }
  bool back = dot(n, v) > 0.0;
  if (back) n = -n;
  float mode = uDbg.x;
  // the key fixed to the view (a face turned to the camera is always lit and readable); the moon as a cool second light
  vec3 L = normalize(uKey.xyz);
  vec3 F = normalize(uSun.xyz + vec3(0.0, 0.25, 0.0));
  float yw = vP.y + uEyeW.y;
  vec3 col;
  if (mode > 0.5 && mode < 1.5) {
    float b = 0.55 + 0.45 * max(dot(n, L), 0.0);
    col = defoCol(vDisp, n0, vec3(0.35) * b, b * 1.4);
  } else if (mode > 1.5 && mode < 2.5) {
    float h = uMat.w;
    vec3 pc = 0.5 + 0.5 * cos(6.2831853 * (h + vec3(0.0, 0.33, 0.67)));
    col = pc * (0.35 + 0.65 * max(dot(n, L), 0.0));
  } else if (mode > 2.5 && mode < 3.5) {
    col = 0.5 + 0.5 * n;
  } else if (mode > 3.5) {
    float b = 0.4 + 0.6 * max(dot(n, L), 0.0);
    col = vec3(0.32) * b;
    col = mix(col, vec3(0.9, 0.12, 0.08), clamp(burn * 1.4, 0.0, 1.0));
    col = mix(col, vec3(1.0, 0.85, 0.1), clamp(hot * 2.0, 0.0, 1.0));
    col = mix(col, vec3(1.0), clamp(edge, 0.0, 1.0));
    if (moved > 0.03) col = mix(col, vec3(0.2, 0.5, 1.0), clamp(log2(moved / 0.03) / 5.0, 0.0, 0.7));
  } else {
    // painted steel; bare metal at a tear and where the plating was wrenched (moved hard); soot where it burnt
    float bare = clamp(edge * 1.2 + clamp((moved - 0.15) / 0.6, 0.0, 0.6), 0.0, 1.0);
    vec3 alb = mix(uMat.rgb, vec3(0.62, 0.63, 0.65), bare);
    alb *= 1.0 - 0.88 * clamp(burn, 0.0, 1.0) * (1.0 - edge);
    float metal = mix(0.0, 1.0, bare);
    float ndl = max(dot(n, L), 0.0), ndf = max(dot(n, F), 0.0);
    vec3 h = normalize(L - v);
    float sp = pow(max(dot(n, h), 0.0), mix(28.0, 110.0, metal)) * mix(0.10, 1.4, metal) * (1.0 - 0.8 * burn);
    float fres = pow(1.0 - max(-dot(n, v), 0.0), 5.0);
    // the sky's reflection: brighter toward the zenith (a metal picks it up, paint a little)
    vec3 rf = reflect(v, n);
    vec3 sky = mix(vec3(0.10, 0.11, 0.12), vec3(0.42, 0.45, 0.50), clamp(rf.y * 0.5 + 0.5, 0.0, 1.0));
    float hemi = 0.5 + 0.5 * n.y;
    vec3 amb = mix(vec3(0.10, 0.10, 0.11), vec3(0.30, 0.31, 0.34), hemi);
    col = alb * (amb + vec3(1.0, 0.97, 0.92) * ndl * 1.05 * uKey.w + vec3(0.6, 0.66, 0.8) * ndf * 0.45);
    col += vec3(1.0, 0.97, 0.92) * sp * ndl;
    col += sky * mix(0.04 + 0.25 * fres, 0.65, metal) * mix(alb, vec3(1.0), 0.3) * (1.0 - 0.85 * burn);
    if (back) col *= 0.45;
  }
  // the 1 m grid on the plating (rides the dents)
  if (uDbg.y > 0.0) col *= 1.0 - 0.35 * uDbg.y * gridLine(vM, normalize(vNm + vec3(1e-6)));
  // the fire's lights
  col += lightsAt(vP, n) * 0.6 * (1.0 - 0.7 * burn);
  // the torn rim glowing while hot: white-yellow to orange to dull red as it cools
  if (edge > 0.0 && heatN > 0.02) {
    float k = clamp(heatN, 0.0, 1.0);
    vec3 glow = mix(vec3(0.55, 0.08, 0.02), mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.9, 0.6), k), k);
    col += glow * edge * k * 1.6;
  }
  if (hot > 0.01) col += vec3(1.0, 0.55, 0.18) * hot * (0.8 + 0.2 * sin(uEyeW.w * 11.0 + vM.x * 7.0));
  // the scan fronts still read
  vec2 sc = scanAt(vP);
  if (sc.x > 0.01) col = mix(col, uScanC[0].rgb, 0.6 * sc.x);
  if (yw < 0.0) col *= vec3(0.35, 0.45, 0.5);
  // a little aerial haze with range
  float dz = length(vP);
  col = mix(col, vec3(0.13, 0.14, 0.15), clamp(dz / 25000.0, 0.0, 0.7));
  o = vec4(col, uDbg.z);
}
`;

/* -------- meshing -------- */
class MeshBuf {
  constructor() { this.p = []; this.n = []; this.i = []; }
  get nv() { return this.p.length / 3; }
  v(x, y, z, nx, ny, nz) { this.p.push(x, y, z); this.n.push(nx, ny, nz); return this.p.length / 3 - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
}
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = a => Math.hypot(a[0], a[1], a[2]);
const norm3 = a => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const NMAX = 320;

/* a bilinear quad a b c d (in order round it), tessellated to ~s, normal n (null: from its corners) */
function quad(B, a, b, c, d, n, s) {
  if (!n) { n = cross(sub3(b, a), sub3(d, a)); if (len3(n) < 1e-12) n = cross(sub3(c, b), sub3(d, b)); n = norm3(n); }
  const nu = Math.max(1, Math.min(NMAX, Math.round(Math.max(len3(sub3(b, a)), len3(sub3(c, d))) / s)));
  const nv = Math.max(1, Math.min(NMAX, Math.round(Math.max(len3(sub3(d, a)), len3(sub3(c, b))) / s)));
  const i0 = B.nv;
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, l = lerp3(a, d, v), r = lerp3(b, c, v);
    for (let i = 0; i <= nu; i++) { const p = lerp3(l, r, i / nu); B.v(p[0], p[1], p[2], n[0], n[1], n[2]); }
  }
  const w = nu + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const k = i0 + j * w + i;
    B.tri(k, k + 1, k + w + 1); B.tri(k, k + w + 1, k + w);
  }
}
const FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
function meshHex(B, pr, s) {
  const P = pr.p, cen = [0, 0, 0];
  for (const p of P) { cen[0] += p[0] / 8; cen[1] += p[1] / 8; cen[2] += p[2] / 8; }
  FACES.forEach((f, k) => {
    if (k === 0 && pr.bottom !== true) return;
    if (pr.skip && pr.skip.includes(k)) return;
    const a = P[f[0]], b = P[f[1]], c = P[f[2]], d = P[f[3]];
    let n = cross(sub3(b, a), sub3(d, a));
    if (len3(n) < 1e-12) n = cross(sub3(c, b), sub3(d, b));
    if (len3(n) < 1e-12) return;
    n = norm3(n);
    const fc = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
    if (dot3(n, sub3(fc, cen)) < 0) n = [-n[0], -n[1], -n[2]];
    quad(B, a, b, c, d, n, s);
  });
}
function perp(d) {
  if (typeof GEO !== 'undefined' && GEO.perp) return GEO.perp(d);
  const a = Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
  const U = norm3(cross(a, d)); return [U, cross(d, U)];
}
function meshLathe(B, pr, s) {
  const d = norm3(pr.d), [U, W] = perp(d), st = pr.st;
  const rm = Math.max(...st.map(q => q[1]));
  const nt = Math.max(12, Math.min(96, Math.round(2 * Math.PI * rm / s)));
  const ring = (sv, rv, nr) => {
    const i0 = B.nv;
    for (let t = 0; t <= nt; t++) {
      const th = t / nt * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      const rad = [U[0] * c + W[0] * sn, U[1] * c + W[1] * sn, U[2] * c + W[2] * sn];
      const nn = norm3([rad[0] * nr[0] + d[0] * nr[1], rad[1] * nr[0] + d[1] * nr[1], rad[2] * nr[0] + d[2] * nr[1]]);
      B.v(pr.a[0] + d[0] * sv + rad[0] * rv, pr.a[1] + d[1] * sv + rad[1] * rv, pr.a[2] + d[2] * sv + rad[2] * rv, nn[0], nn[1], nn[2]);
    }
    return i0;
  };
  for (let i = 0; i < st.length - 1; i++) {
    const [s0, r0] = st[i], [s1, r1] = st[i + 1];
    const ds = s1 - s0, dr = r1 - r0, L = Math.hypot(ds, dr);
    if (L < 1e-6) continue;
    const nr = [ds / L, -dr / L];                // (radial, axial) parts of the normal
    const na = Math.max(1, Math.min(64, Math.round(L / s)));
    let prev = ring(s0, r0, nr);
    for (let a = 1; a <= na; a++) {
      const u = a / na, cur = ring(s0 + ds * u, r0 + dr * u, nr);
      for (let t = 0; t < nt; t++) { B.tri(prev + t, prev + t + 1, cur + t + 1); B.tri(prev + t, cur + t + 1, cur + t); }
      prev = cur;
    }
  }
  if (pr.caps) for (const i of [0, st.length - 1]) {
    const [sc, rc] = st[i]; if (rc < .01) continue;
    const sg = i ? 1 : -1, c = [pr.a[0] + d[0] * sc, pr.a[1] + d[1] * sc, pr.a[2] + d[2] * sc];
    const nr = Math.max(1, Math.min(24, Math.round(rc / s)));
    const ci = B.v(c[0], c[1], c[2], d[0] * sg, d[1] * sg, d[2] * sg);
    let prev = -1;
    for (let k = 1; k <= nr; k++) {
      const i0 = B.nv, rr = k / nr * rc;
      for (let t = 0; t <= nt; t++) { const th = t / nt * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th); B.v(c[0] + (U[0] * cs + W[0] * sn) * rr, c[1] + (U[1] * cs + W[1] * sn) * rr, c[2] + (U[2] * cs + W[2] * sn) * rr, d[0] * sg, d[1] * sg, d[2] * sg); }
      for (let t = 0; t < nt; t++) {
        if (prev < 0) B.tri(ci, i0 + t, i0 + t + 1);
        else { B.tri(prev + t, i0 + t, i0 + t + 1); B.tri(prev + t, i0 + t + 1, prev + t + 1); }
      }
      prev = i0;
    }
  }
}
function hullB(pr, s) {
  const B = pr.B / 2;
  if (s > .3) return B * Math.max(0, 1 - Math.pow((s - .3) / .7, 1.75));
  if (s < -.82) return B * (.84 + .16 * (1 - (-.82 - s) / .18));
  return B;
}
const hullD = (pr, s) => pr.D + 3.6 * Math.pow(Math.max(0, (s - .25) / .75), 2);
function meshHull(B, pr, s) {
  const L = pr.L, ns = Math.max(8, Math.min(NMAX * 2, Math.round(L / s)));
  const nh = Math.max(2, Math.min(64, Math.round((pr.D + 3.6) / s)));
  for (const side of [-1, 1]) {
    const i0 = B.nv;
    for (let i = 0; i <= ns; i++) {
      const sx = -1 + 2 * i / ns, d = hullD(pr, sx), bD = hullB(pr, sx), nz = sx > .3 ? sx - .3 : 0, nl = Math.hypot(1, nz);
      for (let j = 0; j <= nh; j++) { const y = j / nh * d, b = bD * (.9 + .1 * y / Math.max(d, 1e-3)); B.v(side * b, y, sx * L / 2, side / nl, 0, nz / nl); }
    }
    const w = nh + 1;
    for (let i = 0; i < ns; i++) for (let j = 0; j < nh; j++) { const k = i0 + i * w + j; B.tri(k, k + w, k + w + 1); B.tri(k, k + w + 1, k + 1); }
  }
  // the deck
  const nb = Math.max(2, Math.min(96, Math.round(pr.B / s))), i0 = B.nv;
  for (let i = 0; i <= ns; i++) {
    const sx = -1 + 2 * i / ns, d = hullD(pr, sx), bD = hullB(pr, sx);
    for (let j = 0; j <= nb; j++) B.v((-1 + 2 * j / nb) * bD, d, sx * L / 2, 0, 1, 0);
  }
  const w = nb + 1;
  for (let i = 0; i < ns; i++) for (let j = 0; j < nb; j++) { const k = i0 + i * w + j; B.tri(k, k + w, k + w + 1); B.tri(k, k + w + 1, k + 1); }
}
function meshLine(B, pr, s) {
  const P = pr.closed ? pr.p.concat([pr.p[0]]) : pr.p, r = pr.r || .035;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dd = sub3(b, a), L = len3(dd); if (L < 1e-5) continue;
    const d = [dd[0] / L, dd[1] / L, dd[2] / L], [U, W] = perp(d), i0 = B.nv;
    for (let k = 0; k < 4; k++) {
      const th = k * Math.PI / 2, n = [U[0] * Math.cos(th) + W[0] * Math.sin(th), U[1] * Math.cos(th) + W[1] * Math.sin(th), U[2] * Math.cos(th) + W[2] * Math.sin(th)];
      B.v(a[0] + n[0] * r, a[1] + n[1] * r, a[2] + n[2] * r, n[0], n[1], n[2]);
      B.v(b[0] + n[0] * r, b[1] + n[1] * r, b[2] + n[2] * r, n[0], n[1], n[2]);
    }
    for (let k = 0; k < 4; k++) { const a0 = i0 + k * 2, a1 = i0 + ((k + 1) % 4) * 2; B.tri(a0, a1, a1 + 1); B.tri(a0, a1 + 1, a0 + 1); }
  }
}
export function meshPrims(prims, s) {
  const B = new MeshBuf();
  for (const pr of prims) {
    if (!pr || pr.pts === false) continue;
    try {
      if (pr.t === 'hex' && pr.p && pr.p.length === 8) meshHex(B, pr, s);
      else if (pr.t === 'lathe' && pr.st && pr.st.length > 1) meshLathe(B, pr, s);
      else if (pr.t === 'panel' && pr.p && pr.p.length === 4) quad(B, pr.p[0], pr.p[1], pr.p[2], pr.p[3], null, s);
      else if (pr.t === 'hull') meshHull(B, pr, s);
      else if (pr.t === 'blades' && typeof GEO !== 'undefined' && GEO.bladeQuads) for (const q of GEO.bladeQuads(pr)) quad(B, q[0], q[1], q[2], q[3], null, s);
      else if (pr.t === 'line' && pr.p && pr.p.length > 1) meshLine(B, pr, s);
    } catch (err) { /* a malformed primitive: left out */ }
  }
  return B;
}

/* paint by part name (haze grey hull; darker decks; dark glass and arrays; a missile's white body) */
function paintOf(name) {
  const s = (name || '').toLowerCase();
  if (/glass|window|canopy|bridgew/.test(s)) return [.07, .09, .11];
  if (/deck|flight|helipad|nonskid/.test(s)) return [.27, .28, .29];
  if (/tire|tyre|wheel|track|rubber|boot/.test(s)) return [.06, .06, .06];
  if (/spy|array|aesa|panel_face|radome/.test(s)) return [.36, .38, .40];
  if (/oniks|sm6|missile|booster|round|shell|rocket/.test(s)) return [.78, .78, .75];
  if (/funnel|stack|exhaust/.test(s)) return [.33, .34, .35];
  if (/water|bottom|keel|antifoul/.test(s)) return [.36, .14, .12];
  return [.50, .52, .54];
}
const hashName = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };

export class Solid {
  constructor(R) {
    this.R = R; this.gl = R.gl; this.M = R.models;
    this.P = program(this.gl, VS, FS, 'solid');
    this.mode = 0;            // 0 shaded, 1 deformation, 2 parts, 3 normals, 4 damage flags
    this.grid = .6;           // the 1 m grid on the plating (0 off)
    this.bg = [.13, .14, .15];
    this.key = 1;             // the view's key light
    this.stats = { meshes: 0, tris: 0, drawn: 0, buildMs: 0 };
    this._m = new Float32Array(9);
  }
  /* the step a model is meshed at: ~L/500, 0.12 .. 0.5 m (the blast grid is 0.25 m) */
  step(e) { return Math.max(.12, Math.min(.5, e.L / 500)); }
  _upload(B) {
    const gl = this.gl;
    if (!B.i.length) return { n: 0 };
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    const nv = B.nv, f = new Float32Array(nv * 6);
    for (let i = 0; i < nv; i++) { f[i * 6] = B.p[i * 3]; f[i * 6 + 1] = B.p[i * 3 + 1]; f[i * 6 + 2] = B.p[i * 3 + 2]; f[i * 6 + 3] = B.n[i * 3]; f[i * 6 + 4] = B.n[i * 3 + 1]; f[i * 6 + 5] = B.n[i * 3 + 2]; }
    gl.bufferData(gl.ARRAY_BUFFER, f, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    for (let k = 2; k < 5; k++) gl.disableVertexAttribArray(k);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(B.i), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.stats.meshes++; this.stats.tris += B.i.length / 3;
    return { vao, vb, ib, n: B.i.length, nv, pos: f };
  }
  _build(e, Pt, st) {
    const t0 = performance.now();
    const prims = this.M._prims(Pt, st);
    const B = prims ? meshPrims(prims, this.step(e)) : new MeshBuf();
    const m = this._upload(B);
    m.paint = paintOf(Pt.name); m.hash = hashName(Pt.name || '');
    this.stats.buildMs += performance.now() - t0;
    return m;
  }
  meshOf(r) {
    const Pt = r.Pt, e = r.e;
    if (!Pt) return null;
    if (!Pt.dyn) return Pt.solid || (Pt.solid = this._build(e, Pt, {}));
    const q = this.M._quant(e, Pt, r.st || {}, 0), C = Pt.solidLru || (Pt.solidLru = new Map());
    let m = C.get(q.key);
    if (m) { C.delete(q.key); C.set(q.key, m); return m; }
    m = this._build(e, Pt, q.st); C.set(q.key, m);
    if (C.size > 48) { const k0 = C.keys().next().value; this._free(C.get(k0)); C.delete(k0); }
    return m;
  }
  _free(m) { if (m && m.vao) { const gl = this.gl; gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); this.stats.tris -= m.n / 3; this.stats.meshes--; } }
  /* a prepared instance (ModelLib.prepare ran) as solid surfaces: depth written, opaque */
  draw(d, cam) {
    const M = this.M;
    if (d._p1 <= d._p0) return 0;
    const gl = this.gl, P = this.P, u = P.u, eye = cam.eye;
    gl.useProgram(P.p);
    const ns = M._scars(d, eye);
    if (ns) { gl.uniform4fv(u.uScA, M._scA); gl.uniform4fv(u.uScB, M._scB); gl.uniform4fv(u.uScC, d.scars.C); gl.uniform4fv(u.uScD, d.scars.D || new Float32Array(32)); }
    gl.uniform1i(u.uScN, ns);
    M._blast(gl, P, d, eye);
    M._slab(gl, u, d, eye);
    { const f = cam.f, az = Math.atan2(f[0], f[2]) + Math.PI - .7, el = .62, ce = Math.cos(el);
      gl.uniform4f(u.uKey, ce * Math.sin(az), Math.sin(el), ce * Math.cos(az), this.key); }
    let drawn = 0;
    for (let i = d._p0; i < d._p1; i++) {
      const r = M._recs[i];
      if (r.gm === 2) continue;
      const m = this.meshOf(r);
      if (!m || !m.n) continue;
      gl.uniformMatrix3fv(u.uR, false, r.m);
      gl.uniform3f(u.uT, r.t[0], r.t[1], r.t[2]);
      gl.uniform4f(u.uMat, m.paint[0], m.paint[1], m.paint[2], m.hash);
      gl.uniform4f(u.uDbg, M.defo && this.mode === 0 ? 1 : this.mode, this.grid, 1, r.inside ? 1 : 0);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0);
      drawn += m.n / 3;
    }
    gl.bindVertexArray(null);
    this.stats.drawn += drawn;
    return drawn;
  }
  /* data for agents: the meshed parts of a model (rest pose) */
  meshData(key) {
    const e = this.M.get(key), out = [];
    for (const Pt of e.parts) {
      const m = Pt.dyn ? null : (Pt.solid || (Pt.solid = this._build(e, Pt, {})));
      out.push({ name: Pt.name, label: Pt.label, dyn: Pt.dyn, inside: !!Pt.part.inside, tris: m ? m.n / 3 : 0, verts: m ? m.nv : 0, bounds: Pt.bounds, paint: m ? m.paint : null });
    }
    return { key, L: e.L, step: this.step(e), parts: out };
  }
  /* the rest mesh of a model as OBJ (part space = model space for parts without a transform) */
  exportOBJ(key) {
    const e = this.M.get(key), lines = [`# ONIKS ${key} rest mesh (metres; +X starboard, +Y up, +Z bow)`];
    let base = 1;
    for (const Pt of e.parts) {
      if (Pt.dyn) continue;
      const prims = this.M._prims(Pt, {}); if (!prims) continue;
      const B = meshPrims(prims, this.step(e));
      if (!B.i.length) continue;
      let X = null; try { X = Pt.part.xf ? Pt.part.xf({}) : null; } catch (err) { X = null; }
      lines.push(`o ${Pt.name}`);
      for (let i = 0; i < B.nv; i++) {
        let x = B.p[i * 3], y = B.p[i * 3 + 1], z = B.p[i * 3 + 2];
        if (X) { const R = X.R; [x, y, z] = [R[0] * x + R[1] * y + R[2] * z + X.T[0], R[3] * x + R[4] * y + R[5] * z + X.T[1], R[6] * x + R[7] * y + R[8] * z + X.T[2]]; }
        lines.push(`v ${x.toFixed(3)} ${y.toFixed(3)} ${z.toFixed(3)}`);
      }
      for (let i = 0; i < B.i.length; i += 3) lines.push(`f ${B.i[i] + base} ${B.i[i + 1] + base} ${B.i[i + 2] + base}`);
      base += B.nv;
    }
    return lines.join('\n');
  }
}
