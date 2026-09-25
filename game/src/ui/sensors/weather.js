/* Weather as the sensors see it (oh_storm, in the Point Cloud language): every storm cell is a cloud of returns.
     cloud     each cell a cumulonimbus built of billows sampled as LiDAR returns on their surfaces (the faces turned
               to the lens; the tower's core and the deck's inside return nothing): a flat dark base at 1-1.5 km, a
               tower of billows leaning downwind to 8-11 km with an overshooting dome, the anvil spreading ahead, a
               shelf cloud rolling along the leading edge under the base, flanking towers behind. It grows in with the
               cell, boils slowly, drifts with the line. Graphite grey; the tops catch a little sky light.
     flashes   every strike and every intra-cloud flash lights the cloud from inside: the light spreads through the
               billows from the channel's top (a brighter front running out), flickers with the return strokes and
               decays (the flash envelope is fx/lib/weather.js's, shared with the bolt). Launches and blasts under
               the cloud light its base too (the frame's dynamic lights).
     rain      curtains of slanted streaks falling from the base to the sea inside the cells only, drifting with them;
               sparse and structured, lit by the flashes. (The rain round the lens is the FX system's.)
     sea       under a cell the sea is rougher: whitecaps on the steep faces and foam streaks along the wind.
     sky       the stars go out under a cell and come back in the clear night between the cells.
   All of it is three GPU point passes drawn right after the engine's frame (same frame block, log depth, the
   terrain occluder in the depth buffer, max blending): no per-frame allocation, a few hundred instances.
   Plus, on the CPU: rain squalls as clutter on the radar picture (the main radar's sweep paints the rain returns;
   faint in the normal view, full in the radar view), the fallback bolts when the FX system is not running, and the
   reveal: a natural strike shows what is near it to both sides (sim flashReveal) with the same chain lightning as
   the scan, in white. Forks race from where the bolt struck to every unit inside the flash, and each flashes white for a
   moment (its returns lit, a white bracket and tag): the enemy's as the track or contact the player now has
   (TRK 23 · ? · LIGHTNING), the player's own as seen by the enemy (04 · K340P TEL · SEEN).
   A squall line forming / dying writes a line in the HUD's log (and pings the minimap). */
import { WH, sat, clamp, ss, pad2, rng, TAU } from './core.js';
import { stormBolt } from './bolt.js';
import { Fork, reachOf } from './chain.js';
import { sampleOf } from './samples.js';
import { TRACK, SHORT } from '../../game/labels.js';
import { CLASSIFY } from '../../data/units.js';
import { flashLevel, flashLead } from '../../fx/lib/weather.js';
import { HEAD, FRAME, COMMON, CULL } from '../../engine/shaders.js';
import { program } from '../../engine/gl.js';

/* ======================================================================================================== */
/* GPU                                                                                                       */
/* ======================================================================================================== */
const NOISE = `
float h3v(ivec3 i) { return u01(hash2(hash2(uo(i.x), uo(i.y)), uo(i.z))); }
float vn3(vec3 p) {
  ivec3 i = ivec3(floor(p)); vec3 f = fract(p), u = f * f * (3.0 - 2.0 * f);
  float a = h3v(i), b = h3v(i + ivec3(1, 0, 0)), c = h3v(i + ivec3(0, 1, 0)), d = h3v(i + ivec3(1, 1, 0));
  float e = h3v(i + ivec3(0, 0, 1)), g = h3v(i + ivec3(1, 0, 1)), h = h3v(i + ivec3(0, 1, 1)), k = h3v(i + ivec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z) * 2.0 - 1.0;
}
float h2v(ivec2 i) { return u01(hash2(uo(i.x), uo(i.y) ^ 0x5bd1e995u)); }
float vn2(vec2 p) {
  ivec2 i = ivec2(floor(p)); vec2 f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2v(i), h2v(i + ivec2(1, 0)), u.x), mix(h2v(i + ivec2(0, 1)), h2v(i + ivec2(1, 1)), u.x), u.y);
}
uniform vec4 uFp[6];   // flashes: xyz (RTE), radius (m)
uniform vec4 uFi[6];   // x: intensity now, y: how far the light has spread (0..1), z: the running front, w: on the sea
uniform vec4 uFg[6];   // where the flash lights the sea: xyz (RTE), radius (m)
uniform int uNF;
/* the flash on the sea: the faces of the swell turned to it light up */
float flashSea(vec3 p, vec3 n) {
  float acc = 0.0;
  for (int k = 0; k < 6; k++) {
    if (k >= uNF) break;
    vec3 d = uFg[k].xyz - p;
    float q = dot(d, d) / (uFg[k].w * uFg[k].w);
    if (q < 1.0) { float w = 1.0 - q; acc += uFi[k].w * w * w * (0.3 + 0.7 * max(0.0, dot(n, normalize(d)))); }
  }
  return acc;
}
float flashAt(vec3 p) {
  float acc = 0.0;
  for (int k = 0; k < 6; k++) {
    if (k >= uNF) break;
    vec3 d = p - uFp[k].xyz;
    d.y *= 0.5;                                  // the light fills the tower: the cloud glows top to bottom
    float L = length(d), Rr = max(1.0, uFp[k].w * uFi[k].y), q = L / Rr;
    if (q < 1.0) { float w = 1.0 - q * q; acc += uFi[k].x * (0.5 * w + 0.7 * exp(-q * q * 7.0)); }
    float fr = (L - Rr) / (uFp[k].w * 0.09);
    acc += uFi[k].z * exp(-fr * fr);
  }
  return acc;
}
const vec3 FLASH = vec3(0.84, 0.9, 1.0);
`;

/* billows: one instance per billow, the vertex id is the return (an R2 sequence on the sphere: any prefix is even,
   so the level of detail adds returns in the gaps and never moves the ones drawn) */
const VS_PUFF = HEAD + FRAME + COMMON + NOISE + `
layout(location = 0) in vec4 a0;   // centre (RTE), radius (m)
layout(location = 1) in vec4 a1;   // semi-axes along the motion, up, across (x radius); returns m
layout(location = 2) in vec4 a2;   // motion dir x, z; floor y (RTE; very low: none); seed
layout(location = 3) in vec4 a3;   // alpha; the cell's axis at the base x, z (RTE); the tower core radius (m)
layout(location = 4) in vec4 a4;   // base y (RTE); the tower's core top y (RTE); the deck's top y (RTE); deck core radius (m)
layout(location = 5) in vec4 a5;   // lean (m downwind per m up); kind; sky light on the tops; 0
uniform vec4 uP;                   // x: time (s); y, z: near fade from, to (m); w: brightness
out vec3 vCol;
void main() {
  float m = a1.w, fi = float(gl_VertexID);
  if (fi >= m) { ${CULL} return; }
  float fade = clamp((m - fi) / max(6.0, m * 0.12), 0.0, 1.0);
  uint sd = uint(a2.w), h = hash2(uint(gl_VertexID), sd);
  float jr = 0.45 * inversesqrt(m);
  float u = fract(0.5 + (fi + 0.5) * 0.7548776662 + (u01(h) - 0.5) * jr);
  float v = fract(0.5 + (fi + 0.5) * 0.5698402910 + (u01(hash1(h)) - 0.5) * jr);
  float z = 1.0 - 2.0 * v, s = sqrt(max(0.0, 1.0 - z * z)), ph = 6.2831853 * u;
  vec3 dr = vec3(s * cos(ph), z, s * sin(ph));
  // lumpy billows, boiling slowly
  float so = float(sd % 997u);
  float n = 0.2 * vn3(dr * 1.8 + vec3(so, so * 0.37, uP.x * 0.011)) + 0.1 * vn3(dr * 4.4 + vec3(so * 0.51 + 3.1, 7.7, -uP.x * 0.016));
  vec3 e = dr * (1.0 + n);
  vec3 D = vec3(a2.x, 0.0, a2.y), P = vec3(a2.y, 0.0, -a2.x);
  vec3 p = a0.xyz + (D * (e.x * a1.x) + vec3(0.0, e.y * a1.y, 0.0) + P * (e.z * a1.z)) * a0.w;
  vec3 nl = normalize(D * (e.x / a1.x) + vec3(0.0, e.y / a1.y, 0.0) + P * (e.z / a1.z));
  if (p.y < a2.z) { ${CULL} return; }          // cut open at the base: the base is the sheet pass's
  {
    // inside the tower or the deck: no surface there, no return
    vec2 ax = a3.yz + D.xz * (a5.x * (p.y - a4.x));
    if (p.y > a4.x + 250.0 && p.y < a4.y && length(p.xz - ax) < a3.w) { ${CULL} return; }
    if (p.y > a4.x + 140.0 && p.y < a4.z && length(p.xz - a3.yz) < a4.w) { ${CULL} return; }
    // seen from under the base, the base hides what is above it
    if (a4.x > 0.0 && p.y > a4.x) {
      vec2 cr = p.xz * (a4.x / p.y);
      if (length(cr - a3.yz) < a5.w * (0.86 + 0.14 * u01(hash1(h ^ 0x27d4eb2fu)))) { ${CULL} return; }
    }
  }
  // the returns come off the faces turned to the lens
  vec3 ve = normalize(-p);
  float fc = dot(nl, ve);
  if (fc < -0.08) { ${CULL} return; }
  vec3 pw = p;
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  gl_Position = c;
  float hj = u01(hash1(h ^ 0x68bc21ebu));
  float b = (0.13 + 0.25 * smoothstep(-0.5, 1.0, nl.y) + 0.1 * hj) * (0.5 + 0.5 * max(fc, 0.0)) + a5.z * max(nl.y, 0.0) * (0.5 + 0.5 * hj);
  b *= mix(1.0, 0.55, clamp(c.w / 90000.0, 0.0, 1.0));
  float al = a3.x * fade * smoothstep(uP.y, uP.z, c.w) * uP.w;
  float fA = uNF > 0 ? flashAt(pw) : 0.0;
  vec3 col = WH * b + FLASH * fA * (0.7 + 0.6 * hj) + lightsAt(pw, nl) * 0.3;
  vCol = min(col, vec3(1.0)) * al;
  // returns a flash lights swell to 2 px far off, so a lit cloud reads as a mass at 20-40 km
  float spx = a0.w * max(a1.x, a1.z) * 3.5 * inversesqrt(m) * uCam.x / c.w;
  gl_PointSize = max(1.0, floor((spx > 11.0 || fA * al > 0.3 ? 2.0 : 1.0) * uCam.y + 0.5));
}
`;

/* rain: one instance per streak, the vertex id is the drop along it (falling at ~8.5 m/s) */
const VS_RAIN = HEAD + FRAME + COMMON + NOISE + `
layout(location = 0) in vec4 b0;   // top (RTE), drops m
layout(location = 1) in vec4 b1;   // bottom (RTE), alpha
layout(location = 2) in vec4 b2;   // seed, length (m), 0, 0
uniform vec4 uP;                   // x: time (s); y, z: near fade from, to (m); w: brightness
out vec3 vCol;
void main() {
  float m = b0.w, fi = float(gl_VertexID);
  if (fi >= m) { ${CULL} return; }
  uint h = hash2(uint(gl_VertexID), uint(b2.x));
  float s = fract((fi + 0.7 * u01(h)) / m + uP.x * 8.5 / b2.y);
  vec3 p = mix(b0.xyz, b1.xyz, s);
  vec3 pw = p;
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  gl_Position = c;
  float a = b1.w * smoothstep(0.0, 0.2, s) * (0.7 + 0.5 * smoothstep(0.8, 1.0, s)) * (0.5 + 0.5 * u01(hash1(h)));
  a *= smoothstep(uP.y * 0.5, uP.z * 0.5, c.w) * uP.w;
  vec3 col = vec3(0.86, 0.89, 0.93) * 1.6 + FLASH * flashAt(pw) * 2.2 + lightsAt(pw, vec3(0.0)) * 0.5;
  vCol = min(col * a, vec3(1.0));
  gl_PointSize = max(1.0, floor(uCam.y + 0.5));
}
`;

/* the rough sea under the cells: nested lattices round the eye on the sea (the vertex id is the cell), whitecaps on
   the steep faces of the engine's own swell and foam streaks along the wind */
const VS_SEA = HEAD + FRAME + COMMON + NOISE + `
uniform vec4 uLv;       // x: spacing (m); y: cells per side; z: inner half-extent to skip (m); w: level
uniform vec4 uCl[16];   // cells: x, z (RTE), radius, strength
uniform int uNC;
uniform vec4 uWv[4];    // the terrain's swell: kx, kz, amplitude, phase (with k.eye - w t)
uniform vec4 uS;        // x: time; y, z: wind direction; w: brightness
uniform vec4 uC0;       // x, z: the lattice's centre (world); w: 1 = a strike's patch (only the returns it lights)
out vec3 vCol;
void main() {
  int N = int(uLv.y), id = gl_VertexID;
  float sp = uLv.x;
  vec2 cell0 = floor(uC0.xy / sp) - float(N / 2);
  vec2 cl = cell0 + vec2(float(id % N), float(id / N));
  uint hc = hash2(uo(int(cl.x)), uo(int(cl.y)) + uint(sp) * 7919u);
  vec2 w = (cl + vec2(u01(hc), u01(hash1(hc ^ 0x9E3779B9u)))) * sp;
  vec2 dl = abs(w - uEyeW.xz);
  if (uLv.z > 0.0 && max(dl.x, dl.y) < uLv.z) { ${CULL} return; }
  vec2 pr = w - uEyeW.xz;
  float cov = 0.0;
  for (int k = 0; k < 16; k++) {
    if (k >= uNC) break;
    float d = length(pr - uCl[k].xy) / uCl[k].z;
    if (d < 1.0) cov = max(cov, uCl[k].w * (1.0 - smoothstep(0.5, 1.0, d)));
  }
  vec4 c0 = uVP * vec4(pr.x, -uEyeW.y, pr.y, 1.0);
  if (c0.w < uCam.w || abs(c0.x) > c0.w * 1.1 + sp * 2.0 || abs(c0.y) > c0.w * 1.1 + sp * 2.0) { ${CULL} return; }
  // the swell (as the terrain draws it)
  float y = 0.0; vec2 g = vec2(0.0);
  for (int k = 0; k < 4; k++) { vec4 W = uWv[k]; float a = dot(W.xy, pr) + W.w; y += W.z * sin(a); g += W.z * W.xy * cos(a); }
  y *= uMisc.x; g *= uMisc.x;
  // a strike lights the sea round it: the swell shows for an instant
  float fs = uNF > 0 ? flashSea(vec3(pr.x, y - uEyeW.y, pr.y), normalize(vec3(-g.x, 1.0, -g.y))) : 0.0;
  if (uC0.w > 0.5) cov = 0.0;
  if (cov < 0.02 && fs < 0.02) { ${CULL} return; }
  float along = dot(w, uS.yz), across = dot(w, vec2(uS.z, -uS.y));
  float streak = vn2(vec2(along / 190.0, across / 16.0) + vec2(-uS.x * 0.05, 0.0));
  float steep = length(g);
  float pk = cov * (0.035 + 0.5 * smoothstep(0.05, 0.22, steep) * smoothstep(-0.2, 0.6, y / max(0.3, uMisc.x)) + 0.4 * smoothstep(0.62, 0.86, streak));
  uint h3 = hash1(hc ^ 0x85EBCA6Bu);
  bool lit = u01(hash1(h3 ^ 0x51ed270bu)) < min(0.95, fs * (uC0.w > 0.5 ? 3.0 : 1.4));
  if (u01(h3) > pk && !lit) { ${CULL} return; }
  vec3 p = vec3(pr.x, y + 0.9 - uEyeW.y, pr.y);
  vec3 pw = p;
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  gl_Position = c;
  float b = u01(h3) <= pk ? (0.26 + 0.36 * u01(hash1(h3))) * (0.6 + 0.4 * cov) : 0.0;
  b *= mix(1.0, 0.6, clamp(c.w / 40000.0, 0.0, 1.0));
  vec3 col = WH * b + FLASH * (fs * 1.3 + flashAt(pw) * 0.5) + lightsAt(pw, vec3(0.0, 1.0, 0.0)) * 0.3;
  vCol = min(col, vec3(1.0)) * uS.w;
  float spx = sp * uCam.x / c.w;
  gl_PointSize = max(1.0, floor((spx > 14.0 ? 2.0 : 1.0) * uCam.y + 0.5));
}
`;

/* the cloud base: strata of returns across the drift on the base of every cell (the film's hairline strata as rows of
   dots), denser parts hanging lower; nested lattices round the eye in the drift's frame (the vertex id is the cell) */
const VS_BASE = HEAD + FRAME + COMMON + NOISE + `
uniform vec4 uLv;       // x: spacing along the rows (m); y: cells per side; z: inner half-extent (m, along); w: row spacing factor
uniform vec4 uCl[16];   // cells: x, z (RTE), radius, strength
uniform vec4 uCb[16];   // cells: base y (RTE), 0, 0, 0
uniform int uNC;
uniform vec4 uS;        // x: drift (m, along); y, z: the drift direction; w: brightness
uniform vec4 uP;        // x: time; y, z: near fade from, to (m); w: 0
out vec3 vCol;
void main() {
  int N = int(uLv.y), id = gl_VertexID;
  vec2 D = uS.yz, Q = vec2(D.y, -D.x), sp = vec2(uLv.x, uLv.x * uLv.w);
  vec2 e = vec2(dot(uEyeW.xz, D), dot(uEyeW.xz, Q));
  vec2 cl = floor(e / sp) - float(N / 2) + vec2(float(id % N), float(id / N));
  uint hc = hash2(uo(int(cl.x)), uo(int(cl.y)) + uint(uLv.x) * 7919u);
  vec2 lw = (cl + vec2(0.5 + (u01(hc) - 0.5) * 0.95, 0.5 + (u01(hash1(hc ^ 0x9E3779B9u)) - 0.5) * 0.95)) * sp;
  vec2 dl = abs(lw - e) / vec2(1.0, uLv.w);
  if (uLv.z > 0.0 && max(dl.x, dl.y) < uLv.z) { ${CULL} return; }
  vec2 w = D * lw.x + Q * lw.y, pr = w - uEyeW.xz;
  float cov = 0.0, by = 0.0;
  for (int k = 0; k < 16; k++) {
    if (k >= uNC) break;
    float d = length(pr - uCl[k].xy) / (uCl[k].z * 0.98);
    if (d < 1.0) { float c = uCl[k].w * (1.0 - smoothstep(0.55, 1.0, d)); if (c > cov) { cov = c; by = uCb[k].x; } }
  }
  if (cov < 0.02) { ${CULL} return; }
  vec4 c0 = uVP * vec4(pr.x, by, pr.y, 1.0);
  if (c0.w < uCam.w || abs(c0.x) > c0.w * 1.1 + sp.y * 2.0 || abs(c0.y) > c0.w * 1.1 + sp.y * 2.0) { ${CULL} return; }
  // the strata: density along / across the drift, carried with the cloud
  float a = (lw.x - uS.x) / 2600.0, b = lw.y / 900.0;
  float dn = clamp((0.55 * vn2(vec2(a, b)) + 0.3 * vn2(vec2(a * 2.1, b * 2.3) + 5.1) + 0.15 * vn2(vec2(a * 4.3, b * 4.1) + 9.7) - 0.3) / 0.5, 0.0, 1.0);
  uint h3 = hash1(hc ^ 0x85EBCA6Bu);
  if (u01(h3) > cov * (0.45 + 0.55 * dn)) { ${CULL} return; }
  vec3 p = vec3(pr.x, by - 140.0 * dn * cov - 20.0 * u01(hash1(h3)), pr.y);
  vec3 pw = p;
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  gl_Position = c;
  float bb = (0.2 + 0.34 * dn) * (0.7 + 0.6 * u01(hash1(h3 + 7u))) * mix(1.0, 0.6, clamp(c.w / 60000.0, 0.0, 1.0));
  vec3 col = WH * bb + FLASH * flashAt(pw) * (0.8 + 0.4 * dn) + lightsAt(pw, vec3(0.0, -1.0, 0.0)) * 0.4;
  vCol = min(col, vec3(1.0)) * uS.w * smoothstep(uP.y, uP.z, c.w);
  gl_PointSize = max(1.0, floor(uCam.y + 0.5));
}
`;

const FS = HEAD + `
in vec3 vCol; out vec4 o;
void main() { o = vec4(vCol, 1.0); }
`;

const PB = [96, 384, 1536, 6144];           // billow return counts per bucket
const RB = [32, 128, 512, 1536];            // rain drops per streak per bucket
const PF = 24, RF = 12;                     // floats per instance
const MAXP = 1400, MAXR = 1800;             // instances per bucket

function createStormGPU(R) {
  const gl = R.gl;
  let pP = null, pR = null, pS = null, pB = null, ok = true;
  try {
    pP = program(gl, VS_PUFF, FS, 'weather.cloud');
    pB = program(gl, VS_BASE, FS, 'weather.base');
    pR = program(gl, VS_RAIN, FS, 'weather.rain');
    pS = program(gl, VS_SEA, FS, 'weather.sea');
  } catch (e) { console.error('weather: GPU passes unavailable', e); ok = false; }
  const mk = (floats, layout) => {
    const vao = gl.createVertexArray(), vb = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, floats * 4, gl.DYNAMIC_DRAW);
    const stride = layout * 16;
    for (let i = 0; i < layout; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, stride, i * 16); gl.vertexAttribDivisor(i, 1); }
    gl.bindVertexArray(null);
    return { vao, vb };
  };
  const puffB = [], rainB = [];
  if (ok) {
    for (let b = 0; b < PB.length; b++) puffB.push(Object.assign(mk(MAXP * PF, 6), { data: new Float32Array(MAXP * PF), n: 0 }));
    for (let b = 0; b < RB.length; b++) rainB.push(Object.assign(mk(MAXR * RF, 3), { data: new Float32Array(MAXR * RF), n: 0 }));
  }
  const emptyVao = ok ? gl.createVertexArray() : null;
  const FP = new Float32Array(24), FI = new Float32Array(24), CL = new Float32Array(64), CB = new Float32Array(64), WV = new Float32Array(16);

  function flashes(u, fl) {
    gl.uniform4fv(u.uFp, fl.P); gl.uniform4fv(u.uFi, fl.I); if (u.uFg) gl.uniform4fv(u.uFg, fl.G); gl.uniform1i(u.uNF, fl.n);
  }
  function begin() {
    gl.viewport(0, 0, R.G.W, R.G.H);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, R.ubo);
  }
  function end() {
    gl.disable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.depthMask(true); gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
  }
  function drawPuffs(o, fl) {
    const u = pP.u;
    gl.useProgram(pP.p);
    gl.uniform4f(u.uP, o.t, o.nearA, o.nearB, o.bright);
    flashes(u, fl);
    for (let b = 0; b < PB.length; b++) {
      const B = puffB[b]; if (!B.n) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, B.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, B.data, 0, B.n * PF);
      gl.bindVertexArray(B.vao);
      gl.drawArraysInstanced(gl.POINTS, 0, PB[b], B.n);
    }
  }
  function drawRain(o, fl) {
    const u = pR.u;
    gl.useProgram(pR.p);
    gl.uniform4f(u.uP, o.t, o.nearA, o.nearB, o.bright);
    flashes(u, fl);
    for (let b = 0; b < RB.length; b++) {
      const B = rainB[b]; if (!B.n) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, B.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, B.data, 0, B.n * RF);
      gl.bindVertexArray(B.vao);
      gl.drawArraysInstanced(gl.POINTS, 0, RB[b], B.n);
    }
  }
  /* o: { t, cells [{x, z (RTE), r, q}], wind [dx, dz], bright } */
  function drawSea(o, fl) {
    const u = pS.u, cells = o.cells, T = R.terrain;
    let n = 0;
    for (let i = 0; i < cells.length && n < 16; i++) { const c = cells[i]; CL[n * 4] = c.x; CL[n * 4 + 1] = c.z; CL[n * 4 + 2] = c.r; CL[n * 4 + 3] = c.q; n++; }
    if (!n) return;
    gl.useProgram(pS.p);
    gl.uniform4fv(u.uCl, CL); gl.uniform1i(u.uNC, n);
    if (T && T.uWave) WV.set(T.uWave);
    gl.uniform4fv(u.uWv, WV);
    gl.uniform4f(u.uS, o.t, o.wind[0], o.wind[1], o.bright);
    flashes(u, fl);
    gl.bindVertexArray(emptyVao);
    const e = R.camera.eye, eyeH = Math.max(20, e[1]);
    const sp0 = Math.max(2, Math.min(64, Math.pow(2, Math.round(Math.log2(eyeH / 90)))));
    const N = 176;
    gl.uniform4f(u.uC0, e[0], e[2], 0, 0);
    for (let l = 0; l < 5; l++) {
      const sp = sp0 * Math.pow(2, l), inner = l ? sp * .5 * N / 2 : 0;
      gl.uniform4f(u.uLv, sp, N, inner, l);
      gl.drawArrays(gl.POINTS, 0, N * N);
    }
    // the sea a strike lights: a patch of its own round the strike, the returns ~4 px apart on screen
    const fe = R.camera, flL = 540 / Math.tan(fe.fov / 2);
    for (let k = 0; k < fl.n && k < 6; k++) {
      if (fl.I[k * 4 + 3] < .05 || fl.G[k * 4 + 3] < 2000) continue;
      const gx = fl.G[k * 4] + e[0], gz = fl.G[k * 4 + 2] + e[2], rr = fl.G[k * 4 + 3];
      const dx = gx - e[0], dz = gz - e[2], dd = Math.max(300, Math.hypot(dx, dz, e[1]));
      const sp = Math.max(4, dd * 4.5 / flL, 2 * rr / 196);
      const n = Math.min(200, Math.ceil(2 * rr / sp) + 2);
      gl.uniform4f(u.uC0, gx, gz, 0, 1);
      gl.uniform4f(u.uLv, sp, n, 0, 9);
      gl.drawArrays(gl.POINTS, 0, n * n);
    }
  }
  /* o: { t, cells [{x, z (RTE), r, q, base (RTE)}], drift [dx, dz], along (m drifted), bright, nearA, nearB } */
  function drawBase(o, fl) {
    const u = pB.u, cells = o.cells;
    let n = 0;
    for (let i = 0; i < cells.length && n < 16; i++) { const c = cells[i]; if (c.base === undefined) continue; CL[n * 4] = c.x; CL[n * 4 + 1] = c.z; CL[n * 4 + 2] = c.r; CL[n * 4 + 3] = c.q; CB[n * 4] = c.base; n++; }
    if (!n) return;
    gl.useProgram(pB.p);
    gl.uniform4fv(u.uCl, CL); gl.uniform4fv(u.uCb, CB); gl.uniform1i(u.uNC, n);
    gl.uniform4f(u.uS, o.along, o.drift[0], o.drift[1], o.bright);
    gl.uniform4f(u.uP, o.t, o.nearA, o.nearB, 0);
    flashes(u, fl);
    gl.bindVertexArray(emptyVao);
    // the finest spacing from the lens' height over the base (a power of two, so it only changes in steps)
    // returns ~5-9 px apart on screen, a little further apart across the drift; the strata are the density's
    const hA = Math.max(150, Math.abs(R.camera.eye[1] - o.baseY)), fl1080 = 540 / Math.tan(R.camera.fov / 2);
    const sp0 = Math.max(4, Math.pow(2, Math.round(Math.log2(hA * 5 / fl1080))));
    const N = 384, rowK = 1.3;
    for (let l = 0; l < 7; l++) {
      const sp = sp0 * Math.pow(2, l), inner = l ? sp * .5 * N / 2 : 0;
      gl.uniform4f(u.uLv, sp, N, inner, rowK);
      gl.drawArrays(gl.POINTS, 0, N * N);
    }
  }
  return { ok, puffB, rainB, begin, end, drawPuffs, drawRain, drawSea, drawBase, FP, FI };
}

/* ======================================================================================================== */
/* the cloud of one cell (built once per cell seed; normalised so the cell can grow and shrink)             */
/* ======================================================================================================== */
/* a billow: [lx, lz (m along the motion / across it, from the cell's centre, at the reference radius), yk (0: base +
   yv m; 1: base + (top - base) yv; 2: base x yv), yv, R (m at the reference radius), sx, sy, sz, kind] where kind 0 the
   deck, 1 the tower, 2 the anvil, 3 the shelf, 4 the overshooting top, 5 a flanking tower */
const NP = 9;
function buildCell(seed, storm, rRef, base, top) {
  const r = rng(seed), P = [];
  const add = (lx, lz, yk, yv, R, sx, sy, sz, kind) => P.push(lx, lz, yk, yv, R, sx, sy, sz, kind);
  const area = (rRef / 5000) * (rRef / 5000);
  // the deck: wide flat billows, cut flat at the base
  const nd = Math.round(clamp(12 * area, 9, 48));
  for (let i = 0; i < nd; i++) { const a = r() * TAU, d = Math.sqrt(r()) * .8 * rRef; add(Math.cos(a) * d, Math.sin(a) * d, 0, 200 + 380 * r(), 1500 + 900 * r(), 1, .34 + .14 * r(), 1, 0); }
  if (storm) {
    const H = top - base, nt = Math.round(clamp(area * 1.1, 1, 4));
    for (let t = 0; t < nt; t++) {
      // the tower: stacked billows narrowing a little with height, a dome over the top
      const a0 = r() * TAU, d0 = t ? (.35 + .25 * r()) * rRef : 0, cx = Math.cos(a0) * d0, cz = Math.sin(a0) * d0;
      const hT = t ? .7 + .25 * r() : 1, w0 = 1500 + 500 * r(), nl = Math.round(H * hT / 1150);
      for (let j = 0; j < nl; j++) {
        const h = hT * (j + .55) / (nl + .1), w = w0 * (1 - .28 * h);
        const np = j < nl - 1 ? 2 + Math.floor(r() * 2) : 1;
        for (let k = 0; k < np; k++) { const a = r() * TAU, dd = w * (.25 + .45 * r()); add(cx + Math.cos(a) * dd, cz + Math.sin(a) * dd, 1, h, w * (.75 + .35 * r()), 1, .8 + .2 * r(), 1, 1); }
      }
      add(cx, cz, 1, hT * 1.015, w0 * .55, 1, .75, 1, 4);
      // the anvil: flat, spreading ahead of the cell
      const na = t ? 3 + Math.floor(r() * 3) : 7 + Math.floor(r() * 5);
      for (let i = 0; i < na; i++) { const f = r(); add(cx + (.1 + 2 * f) * Math.min(rRef, 6000) * (t ? .6 : 1), cz + (r() - .5) * (1 + 1.5 * f) * Math.min(rRef, 6000), 1, hT * (.9 + .07 * r()), 2000 + 1600 * r(), 1.1, .22 + .08 * r(), 1, 2); }
    }
    // the shelf cloud: a low roll along the leading edge, under the base
    const ns = Math.round(clamp(7 * Math.sqrt(area), 6, 16));
    for (let i = 0; i < ns; i++) { const f = i / (ns - 1) - .5, lz = f * 2.1 * rRef + (r() - .5) * 400, lx = (1.02 + .12 * (1 - 4 * f * f)) * rRef + (r() - .5) * 300; add(lx, lz, 2, .58 + .08 * r(), 700 + 250 * r(), .7, .5, 1.9, 3); }
    // flanking towers on the trailing side
    const nf = 2 + Math.floor(r() * 3);
    for (let i = 0; i < nf; i++) {
      const lx = -(.45 + .45 * r()) * rRef, lz = (r() - .5) * 1.4 * rRef, hm = .3 + .35 * r(), nl2 = Math.max(2, Math.round(H * hm / 1000)), w = 800 + 400 * r();
      for (let j = 0; j < nl2; j++) add(lx + (r() - .5) * 200, lz + (r() - .5) * 200, 1, hm * (j + .6) / nl2, w * (.8 + .3 * r()), 1, .85, 1, 5);
    }
  } else {
    // rain cloud: a thick deck with low rounded tops
    const nh = Math.round(clamp(10 * area, 6, 36));
    for (let i = 0; i < nh; i++) { const a = r() * TAU, d = Math.sqrt(r()) * .75 * rRef; add(Math.cos(a) * d, Math.sin(a) * d, 1, .35 + .45 * r(), 1300 + 700 * r(), 1, .6, 1, 1); }
  }
  // rain curtains: sheets of streaks in the core, each at its own angle
  const C = [], nc = Math.round(clamp(8 * area, 6, 40));
  for (let i = 0; i < nc; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * .72 * rRef, o = r() * Math.PI, w = 500 + 1100 * r(), n = 6 + Math.floor(r() * 9);
    for (let k = 0; k < n; k++) {
      const f = (k / (n - 1) - .5) * w + (r() - .5) * w / n;
      C.push(Math.cos(a) * d + Math.cos(o) * f, Math.sin(a) * d + Math.sin(o) * f, .25 + .75 * r(), (r() * 1e6) | 0);
    }
  }
  return { P: new Float32Array(P), n: P.length / NP, C: new Float32Array(C), nC: C.length / 4, rRef, seed, used: 0 };
}

/* ======================================================================================================== */
export function createWeather(S) {
  const { game } = S, sim = game.sim, R = game.R;
  const flashes = [];              // { kind, x, y, z, top, t0, seed, s, r, bolt, big }
  const SQ = [];                   // pooled { x, z, r, q } for the radar clutter
  const PAL = { core: [250, 253, 255], glow: [200, 220, 255], spark: [236, 244, 255], light: [230, 240, 255], lift: [220, 232, 255] };
  let gpu = null, gpuTried = false;
  const cellCache = new Map();     // seed -> built cell
  let frameN = 0, lastBig = -9, lastBigIc = -9, lastCg = -9;

  const W = () => sim.weather || { kind: 'calm', squalls: [], wind: [0, 0] };
  const cellsNow = () => { const w = W(); return w.cells ? w.cells() : []; };
  /* the cells as rain clutter for the radar picture (faint in the normal view, full in the radar view) */
  function squalls() {
    SQ.length = 0;
    const scope = S.scopeK > .01, list = cellsNow();
    for (let i = 0; i < list.length && SQ.length < 8; i++) {
      const c = list[i], base = c.ltg ? .5 : .42;
      let o = SQ[SQ.length]; if (!o) o = {};
      o.x = c.x; o.z = c.z; o.r = c.r; o.q = (scope ? base : base * .3) * sat(c.q * 1.3);
      SQ.push(o);
    }
    return SQ;
  }
  function windBrg() {
    const w = W().wind || [0, 0];
    // the direction the wind blows FROM (sea clutter is brighter looking into it)
    return Math.hypot(w[0], w[1]) > .01 ? Math.atan2(-w[0], -w[1]) : -.49;
  }

  /* ---------- events ---------- */
  const reveals = [];               // { u, own, tF, t0, fork, from, seed, s }
  const PAL_W = { core: [250, 252, 255], glow: [205, 222, 255], spark: [235, 240, 255], light: [225, 235, 255] };
  const E3 = [0, 0, 0], q = [0, 0, 0], BX = [0, 0, 0, 0], MR = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function cellById(id) { if (id === undefined) return null; for (const c of cellsNow()) if (c.id === id) return c; return null; }
  function onEvent(e) {
    if (e.type === 'weather') return frontLine(e);
    if (e.type !== 'lightning' && e.type !== 'lightning_ic') return;
    const ic = e.type === 'lightning_ic', now = S.clock;
    const seed = e.seed !== undefined ? e.seed : (Math.floor(e.t * 20) * 977 + 13) | 0;
    // the same pacing as the FX system's bolts: no strobing at high time rates
    let big = false, draw = true;
    if (ic) { if (now - lastBigIc > .5 && now - lastBig > .35) { big = true; lastBigIc = now; } else draw = false; }
    else if (now - lastCg < .2) draw = false;
    else { lastCg = now; if (now - lastBig > .7) { big = true; lastBig = now; } }
    if (draw) {
      if (flashes.length > 7) flashes.shift();
      const cell = cellById(e.cell), top = ic ? e.pos : (e.top || [e.pos[0], 3500, e.pos[2]]);
      flashes.push({ kind: ic ? 'ic' : 'cg', x: top[0], y: top[1], z: top[2], gx: e.pos[0], gy: e.pos[1], gz: e.pos[2], top, t0: now, seed, s: e.s || 1, r: ic ? (e.r || 5000) * 1.15 : 9000, bolt: null, big, base: cell ? cell.base : 1250 });
    }
    if (ic) return;
    // what the flash shows: every unit near it, both sides (nearest first, a few)
    const r = e.r || 3000, list = [];
    for (const u of sim.list()) {
      if (!u.alive || u.aboard) continue;
      const d = Math.hypot(u.pos[0] - e.pos[0], u.pos[2] - e.pos[2]);
      if (d < r) list.push({ u, d });
    }
    list.sort((a, b) => a.d - b.d);
    if (reveals.length > 24) reveals.splice(0, reveals.length - 24);
    for (let k = 0; k < list.length && k < 8; k++) {
      const { u, d } = list[k];
      // a unit already showing from a strike a moment ago keeps that one (no stacked tags at high time rates)
      let old = null;
      for (const rv of reveals) if (rv.u === u) { old = rv; break; }
      if (old && S.clock - old.t0 < 2.6) continue;
      const rv = old || {};
      rv.u = u; rv.own = u.side === game.side; rv.tF = .07 + .3 * d / r + .03 * k; rv.t0 = S.clock; rv.fork = null; rv.from = e.pos.slice(); rv.seed = seed + u.id * 31; rv.s = rv.s || null;
      if (!old) reveals.push(rv);
    }
  }
  /* a squall line forming / dying: a line in the HUD's log, a ping on the minimap */
  function frontLine(e) {
    if (e.what !== 'front') return;
    const hud = game.getSystem && game.getSystem('hud');
    const me = game.side, hq = sim.hq ? (sim.hq(me) || sim.alive(me).find(u => !u.aboard)) : null;
    let where = '';
    if (hq && e.pos) {
      const dx = e.pos[0] - hq.pos[0], dz = e.pos[2] - hq.pos[2];
      const b = ((Math.round(Math.atan2(dx, dz) * 180 / Math.PI) % 360) + 360) % 360;
      where = ` · ${String(b).padStart(3, '0')}° · ${Math.round(Math.hypot(dx, dz) / 1000)} km`;
    }
    const kn = Math.round((e.speed || 0) * 1.944);
    const text = e.phase === 'arrive' ? `Squall line${where} · ${kn} kn` : `Squall line · passed`;
    if (hud && hud.log && hud.log.add && !hud.logsWeather) hud.log.add('Wx', text, '');
    else if (game.bus && !hud) game.bus.emit('toast', { text: text.toUpperCase() });
    if (e.phase === 'arrive' && hud && hud.minimap && hud.minimap.ping && e.pos) hud.minimap.ping(e.pos[0], e.pos[2], '#FFFFFF', 6);
  }

  /* world point where a white fork lands on a unit: over the top of it */
  function topOf(rv, out) {
    const u = rv.u, d = game.drawn.get(u.id), p = game.unitPose(u).pos;
    out[0] = p[0]; out[2] = p[2];
    out[1] = p[1] + Math.max(2, (rv.s ? rv.s.mx[1] : (u.def.size[2] || 4)) * .9);
    if (d && d.T) { out[0] = d.T[0]; out[2] = d.T[2]; }
    return out;
  }
  const owns = new Set();           // unit ids whose tag the flash owns right now (the contacts system stands aside)
  function reveals3d() {
    const fx = R.fx, V = S.V;
    owns.clear();
    for (let i = reveals.length - 1; i >= 0; i--) {
      const rv = reveals[i], a = S.clock - rv.t0;
      if (a > 3.2 || !rv.u.alive) { reveals.splice(i, 1); continue; }
      if (a > rv.tF && a < rv.tF + 2.4) owns.add(rv.u.id);
      const u = rv.u, pose = game.unitPose(u), p = pose.pos;
      if (!rv.s) rv.s = sampleOf(R, u.def.model);
      topOf(rv, E3);
      const near = V.vis(p[0], p[1], p[2], 3500);
      // the fork, white
      if (a > .04 && a < rv.tF + .7 && near) {
        const land = u.def.domain === 'land';
        if (!rv.fork) rv.fork = new Fork({ from: rv.from, to: E3, seed: rv.seed, ground: land ? (x, z) => R.terrain.heightAt(x, z) : null, climb: E3[1] - (land ? Math.max(0, R.terrain.heightAt(E3[0], E3[2])) : 0) });
        if (a < rv.tF) rv.fork.draw(fx, V, E3, reachOf(a - .04, Math.max(.05, rv.tF - .04)), .55, PAL_W, true, a);
        else rv.fork.draw(fx, V, E3, 1, Fork.stroke(a - rv.tF), PAL_W, false, a);
      }
      // the unit flashes white: its returns lit for a moment
      const b = a - rv.tF;
      if (b < 0 || b > .9 || !rv.s || !V.vis(p[0], p[1], p[2], rv.s.L)) continue;
      if (b < .3) R.light([E3[0], E3[1] + 4, E3[2]], Math.max(60, rv.s.L * 2.5), PAL_W.light, 1.2 * (1 - b / .3));
      const d = game.drawn.get(u.id), s = rv.s;
      let M, T;
      if (d && d.R && d.T) { M = d.R; T = d.T; }
      else { const c = Math.cos(pose.hdg), sn = Math.sin(pose.hdg); M = MR; MR[0] = c; MR[2] = sn; MR[4] = 1; MR[6] = -sn; MR[8] = c; T = p; }
      const zc = Math.max(V.near, V.depth(p[0], p[1], p[2])), px = s.L * V.fl / zc;
      const al = (b < .06 ? 1 : Math.exp(-(b - .06) * 4)) * (Math.sin(b * 70) > -.6 ? 1 : .5);
      if (px < 4) { fx.dotXYZ(p[0], p[1] + 2, p[2], 3, 255, 255, 255, al, 'over'); continue; }
      const stride = Math.max(1, Math.floor(s.n / clamp(px * 6, 60, s.n))), rest = s.rest;
      for (let j = 0; j < s.n; j += stride) {
        const o = j * 3, x0 = rest[o], y0 = rest[o + 1], z0 = rest[o + 2];
        fx.dotXYZ(M[0] * x0 + M[1] * y0 + M[2] * z0 + T[0], M[3] * x0 + M[4] * y0 + M[5] * z0 + T[1], M[6] * x0 + M[7] * y0 + M[8] * z0 + T[2], px > 90 ? 2 : 1, 250, 252, 255, al * .95, 'over');
      }
    }
  }
  /* the white bracket and tag on each unit the flash showed */
  function draw2d(ov, TL) {
    const cam = R.camera, K = ov.ui || 1;
    for (const rv of reveals) {
      const b = S.clock - rv.t0 - rv.tF; if (b < 0 || b > 2.4) continue;
      const u = rv.u, p = game.unitPose(u).pos;
      if (!cam.project(p, q) || q[0] < -20 || q[1] < -20 || q[0] > cam.W + 20 || q[1] > cam.H + 20) continue;
      const al = sat(b / .08) * (1 - sat((b - 1.8) / .6)) * (b < .5 && Math.sin(b * 50) < -.5 ? .4 : 1);
      const mpp = q[2] / cam.fl, e = R.models.has(u.def.model) ? R.models.get(u.def.model) : null, rpx = e ? e.radius / mpp : 4;
      const hw = Math.max(8 * K, rpx * .9), hh = Math.max(7 * K, rpx * .55);
      BX[0] = q[0] - hw; BX[1] = q[1] - hh; BX[2] = q[0] + hw; BX[3] = q[1] + hh;
      ov.bracket(BX, '#FFFFFF', al, 3, 8);
      let id, label, value, kind;
      if (rv.own) { id = pad2(u.id); label = SHORT[u.type] || u.def.name; value = 'SEEN'; kind = 'ghost'; }
      else {
        const c = sim.contact(game.side, u.id);
        id = c ? c.track : 'TRK'; kind = 'white';
        label = c && c.conf >= CLASSIFY ? (TRACK[u.type] || u.def.name) : '? · LIGHTNING';
        value = c ? c.conf.toFixed(2) : '';
      }
      TL.add({ x: BX[2] + 12 * K, y: BX[1] - 24 * K, ax: BX[2], ay: BX[1], id, label, value, kind, a: al, size: 10, pri: 4, valCol: 'rgba(255,255,255,.72)' });
    }
  }
  /* the flicker of a flash (shared with the bolt) */
  function level(f, a) { return flashLevel(f.seed, f.kind, a) * f.s; }

  function update() {
    for (let i = flashes.length - 1; i >= 0; i--) if (S.clock - flashes[i].t0 > 1.8) flashes.splice(i, 1);
  }

  function draw3d() {
    reveals3d();
    skyStars();
    // the bolts, when the FX system does not draw them
    if (game.getSystem('fx')) return;
    const fx = R.fx, V = S.V;
    for (const f of flashes) {
      if (f.kind !== 'cg') continue;
      const a = S.clock - f.t0;
      if (!f.bolt) f.bolt = stormBolt([f.gx, Math.max(0, f.gy), f.gz], f.top, f.seed);
      const lead = flashLead(f.seed), I = level(f, a);
      if (a < lead) { f.bolt.draw(fx, V, a / lead, .5, PAL, -1, true); continue; }
      if (I < .005) continue;
      f.bolt.draw(fx, V, 1, Math.min(1, I), PAL, -1, false);
      const d = V.dist(f.gx, 800, f.gz);
      if (f.big) fx.lift(Math.min(.18, .18 * I * clamp(2400 / d, .05, 1)), PAL.lift);
      R.light([f.gx, 900, f.gz], 7000, PAL.light, 1.3 * I);
      if (f.big) R.light([f.gx, f.base, f.gz], 14000, PAL.light, .28 * I);
      R.light([f.gx, f.gy + 60, f.gz], 1600, PAL.light, 1.6 * I);
    }
  }

  /* ---------- the sky: the stars go out under the cells ---------- */
  let starsSet = -1, starsBase = 1;
  const TIME_STARS = { night: .8, dusk: .4, day: 0 };
  function skyStars() {
    const T = R.terrain; if (!T || !T.sky) return;
    if (T.sky.stars !== starsSet) starsBase = T.sky.stars;          // the engine re-derived it (setWeather)
    const w = W(), e = R.camera.eye;
    // under a storm or in the rain the engine puts the stars out everywhere: the clear night between the cells keeps them
    let base = starsBase;
    if ((w.kind === 'storm' || w.kind === 'rain') && base < .05) base = (TIME_STARS[game.map.time || 'night'] || 0) * .6;
    // near a cell its cloud covers most of the sky
    let k = 0;
    for (const c of cellsNow()) { const d = Math.hypot(e[0] - c.x, e[2] - c.z); k = Math.max(k, ss(c.r * 2.4, c.r * .9, d) * sat((c.q === undefined ? 1 : c.q) * 1.5)); }
    starsSet = T.sky.stars = base * (1 - k);
  }

  /* ---------- the storm on the GPU (after the engine's frame) ---------- */
  const FLP = new Float32Array(24), FLI = new Float32Array(24), FLG = new Float32Array(24), FL = { P: FLP, I: FLI, G: FLG, n: 0 };
  const SEAC = [], SEAP = [];
  const OPT = { puffs: true, base: true, rain: true, sea: true };
  function flashUniforms(e) {
    FL.n = 0;
    for (let i = flashes.length - 1; i >= 0 && FL.n < 6; i--) {
      const f = flashes[i], a = S.clock - f.t0;
      const I = level(f, a); if (I < .01 && a > .9) continue;
      const k = FL.n++;
      FLP[k * 4] = f.x - e[0]; FLP[k * 4 + 1] = f.y - e[1]; FLP[k * 4 + 2] = f.z - e[2]; FLP[k * 4 + 3] = f.r;
      // the light runs out through the cloud from the channel's top while the leader comes down, and the cloud keeps
      // glowing a moment after the strokes (the flicker rides on top)
      const cg = f.kind === 'cg', lead = cg ? flashLead(f.seed) : 0, b = Math.max(0, a - lead);
      const spread = cg ? (a < lead ? .15 + .45 * a / lead : .6 + .4 * (1 - Math.exp(-b / .04))) : .6 + .4 * (1 - Math.exp(-a / .05));
      const glowK = (cg ? .42 * Math.exp(-b / .3) * ss(0, .01, a - lead * .6) : .3 * Math.exp(-a / .3) * ss(0, .03, a)) * f.s;
      FLI[k * 4] = Math.max(I, glowK) * (cg ? 1.3 : 1.9) * (f.big ? 1 : .7);
      FLI[k * 4 + 1] = spread;
      FLI[k * 4 + 2] = Math.max(I, glowK) * .5 * (1 - spread) * (f.big ? 1 : .7);
      // the sea round the strike (a flash in the cloud lights it only faintly)
      if (cg) { FLG[k * 4] = f.gx - e[0]; FLG[k * 4 + 1] = f.gy - e[1]; FLG[k * 4 + 2] = f.gz - e[2]; FLG[k * 4 + 3] = 2600; FLI[k * 4 + 3] = (a < lead ? 0 : I) * 1.3; }
      else { FLG[k * 4] = f.x - e[0]; FLG[k * 4 + 1] = -e[1]; FLG[k * 4 + 2] = f.z - e[2]; FLG[k * 4 + 3] = f.r * .7; FLI[k * 4 + 3] = I * .18; }
    }
    return FL;
  }
  function drawGPU() {
    if (!gpuTried) { gpuTried = true; try { gpu = createStormGPU(R); } catch (e) { console.error('weather: GPU', e); gpu = null; } }
    if (!gpu || !gpu.ok || R.pcOff || R.style === 'orbital') return;
    const list = cellsNow(); if (!list.length) return;
    frameN++;
    const t0 = performance.now();
    const cam = R.camera, e = cam.eye, V = S.V, fl = 540 / Math.tan(cam.fov / 2);
    const w = W(), wv = w.wind || [0, 0], wl = Math.hypot(wv[0], wv[1]) || 1, wdx = wv[0] / wl, wdz = wv[1] / wl;
    const slant = clamp(wl / 9 * .45, .12, .5);
    const bright = (R.worldBright === undefined ? 1 : Math.min(1, R.worldBright / .8)) * (1 - .55 * S.scopeK);
    const dist = cam.dist || 3000, nearA = Math.max(400, dist * .3), nearB = Math.max(1200, dist * .75);
    const PBk = gpu.puffB, RBk = gpu.rainB;
    for (const B of PBk) B.n = 0;
    for (const B of RBk) B.n = 0;
    SEAC.length = 0;
    let nearestD = 1e12, baseY = 1300;
    const tS = sim.t;
    for (let ci = 0; ci < list.length; ci++) {
      const c = list[ci], storm = !!c.ltg;
      const key = c.seed * 2 + (storm ? 1 : 0);
      let C = cellCache.get(key);
      if (!C) { C = buildCell(c.seed, storm, c.r0 || c.r, c.base, c.top); cellCache.set(key, C); }
      C.used = frameN;
      const q = c.q === undefined ? 1 : c.q, sc = c.r / C.rRef;
      const vl = Math.hypot(c.vx || 0, c.vz || 0), dx = vl > .1 ? c.vx / vl : wdx, dz = vl > .1 ? c.vz / vl : wdz, px = dz, pz = -dx;
      const base = c.base, top = c.top, Hq = base + (top - base) * Math.pow(ss(0, .85, q), .8);
      const cx = c.x - e[0], cz = c.z - e[2];
      // the sea under it and its base (near the lens first)
      if (SEAC.length < 16) {
        const d = Math.hypot(cx, cz);
        if (d < c.r + 90000) {
          let o = SEAP[SEAC.length]; if (!o) o = SEAP[SEAC.length] = {};
          o.x = cx; o.z = cz; o.r = c.r * 1.05; o.q = sat(q * 1.2) * (storm ? 1 : .6); o.base = base - e[1]; o.d = d;
          SEAC.push(o);
          if (d < nearestD) { nearestD = d; baseY = base; }
        }
      }
      if (!V.vis(c.x, (base + top) / 2, c.z, c.r * 2.4 + (top - base))) continue;
      const lean = storm ? .1 : 0, coreR = 550 * sc + 250, deckTop = base + 700 * (.6 + .4 * q), deckR = c.r * .62;
      const P = C.P;
      for (let i = 0; i < C.n; i++) {
        const o = i * NP, kind = P[o + 8];
        let y = P[o + 2] === 0 ? base + P[o + 3] : P[o + 2] === 1 ? base + (top - base) * P[o + 3] : base * P[o + 3];
        let R0 = P[o + 4] * (kind === 0 || kind === 3 ? Math.min(1, .5 + .5 * sc) : (.55 + .45 * sc));
        // growth: the tower rises, the anvil spreads out at the top, the shelf rolls in
        let al;
        if (kind === 0) al = ss(0, .3, q);
        else if (kind === 3) al = ss(.35, .75, q);
        else if (kind === 2) al = ss(.72, .95, q);
        else if (kind === 4) al = ss(.88, 1, q);
        else al = ss(Hq + 200, Hq - 700, y);
        if (al < .01) continue;
        if (kind === 1 || kind === 5) { y = Math.min(y, Hq - R0 * .3); }
        const lx = P[o] * sc + (kind === 1 || kind === 4 ? lean * (y - base) : 0), lz = P[o + 1] * sc;
        const wx = c.x + dx * lx + px * lz, wz = c.z + dz * lx + pz * lz;
        const sx = P[o + 5], sy = P[o + 6], sz = P[o + 7], ext = R0 * Math.max(sx, sy, sz) * 1.25;
        if (!V.vis(wx, y, wz, ext)) continue;
        // the level of detail: returns about 5.5 px apart on the faces turned to the lens
        const zc = Math.max(V.depth(wx, y, wz), ext * .6, 50), Rpx = R0 * fl / zc;
        const Arel = Math.pow((Math.pow(sx * sy, 1.6) + Math.pow(sx * sz, 1.6) + Math.pow(sy * sz, 1.6)) / 3, 1 / 1.6);
        let m = 12.57 * Rpx * Rpx * Arel / 30;
        if (zc < nearA * .6 && zc + ext < nearA) continue;      // wholly inside the near fade
        m = clamp(m, 24, PB[PB.length - 1]);
        let b = 0; while (PB[b] < m) b++;
        const B = PBk[b]; if (B.n >= MAXP) continue;
        const d = B.data, k = B.n++ * PF;
        d[k] = wx - e[0]; d[k + 1] = y - e[1]; d[k + 2] = wz - e[2]; d[k + 3] = R0;
        d[k + 4] = sx; d[k + 5] = sy; d[k + 6] = sz; d[k + 7] = m;
        d[k + 8] = dx; d[k + 9] = dz; d[k + 10] = (kind === 2 || kind === 3 || kind === 4) ? -1e7 : base - e[1]; d[k + 11] = (c.seed + i * 131) % 16000000;
        d[k + 12] = al; d[k + 13] = cx; d[k + 14] = cz; d[k + 15] = storm ? coreR : 0;
        d[k + 16] = base - e[1]; d[k + 17] = Hq - 600 - e[1]; d[k + 18] = deckTop - e[1]; d[k + 19] = deckR;
        d[k + 20] = lean; d[k + 21] = kind; d[k + 22] = kind === 2 || kind === 4 ? .1 : .05; d[k + 23] = c.r * .92;
      }
      // rain curtains: from the base to the sea, blown downwind
      const rq = ss(.25, .7, q) * (storm ? 1 : .8);
      if (rq < .02) continue;
      const Cc = C.C;
      for (let i = 0; i < C.nC; i++) {
        const o = i * 4, lx = Cc[o] * sc, lz = Cc[o + 1] * sc;
        const tx = c.x + dx * lx + px * lz, tz = c.z + dz * lx + pz * lz, ty = base - 40 - 160 * Cc[o + 2];
        const bx = tx + wdx * slant * ty, bz = tz + wdz * slant * ty, by = 2;
        const mx = (tx + bx) / 2, mz = (tz + bz) / 2;
        if (!V.vis(mx, ty / 2, mz, ty * .6)) continue;
        const z0 = V.depth(tx, ty, tz), z1 = V.depth(bx, by, bz);
        if (z0 < 30 && z1 < 30) continue;
        const za = Math.max(z0, 30), zb = Math.max(z1, 30);
        // projected length (1080 px) decides the drops
        const len = Math.hypot(bx - tx, ty - by, bz - tz), lpx = len * fl / Math.min(za, zb) * .8;
        const m = clamp(lpx / 3.2, 6, RB[RB.length - 1]);
        let b = 0; while (RB[b] < m) b++;
        const B = RBk[b]; if (B.n >= MAXR) continue;
        const d = B.data, k = B.n++ * RF;
        d[k] = tx - e[0]; d[k + 1] = ty - e[1]; d[k + 2] = tz - e[2]; d[k + 3] = m;
        d[k + 4] = bx - e[0]; d[k + 5] = by - e[1]; d[k + 6] = bz - e[2]; d[k + 7] = rq * (.1 + .1 * Cc[o + 2]);
        d[k + 8] = Cc[o + 3]; d[k + 9] = len; d[k + 10] = 0; d[k + 11] = 0;
      }
    }
    // cells gone: forget their clouds after a while
    if ((frameN & 255) === 0) for (const [k, C] of cellCache) if (frameN - C.used > 600) cellCache.delete(k);
    const fu = flashUniforms(e);
    const o = { t: tS, nearA, nearB, bright };
    gpu.begin();
    if (OPT.sea && SEAC.length && e[1] < 30000) gpu.drawSea({ t: tS, cells: SEAC, wind: [wdx, wdz], bright: bright * (1 - ss(12000, 30000, e[1])) }, fu);
    if (OPT.base && SEAC.length) {
      // the drift: the base's strata ride with the cells
      const c0 = list[0], vx = c0.vx || 0, vz = c0.vz || 0, vl = Math.hypot(vx, vz);
      const ddx = vl > .1 ? vx / vl : wdx, ddz = vl > .1 ? vz / vl : wdz;
      const under = 1 - ss(baseY - 150, baseY + 450, e[1]);
      if (under > .01) gpu.drawBase({ t: tS, cells: SEAC, drift: [ddx, ddz], along: (vl || 5) * tS, bright: bright * under, nearA: nearA * .5, nearB: nearB * .6, baseY }, fu);
    }
    if (OPT.rain) gpu.drawRain(o, fu);
    if (OPT.puffs) gpu.drawPuffs(o, fu);
    gpu.end();
    stats.cpu = stats.cpu * .9 + (performance.now() - t0) * .1;
  }
  const stats = { cpu: 0 };

  /* the storm's GPU passes are drawn here, over the finished frame (SENSORS calls this after the engine's frame;
     the old uniform ceiling of gpu.js is no longer used: null) */
  function ceilingParams() {
    try { drawGPU(); } catch (err) { console.error('weather: storm pass', err); gpu = null; }
    return null;
  }
  return { flashes, reveals, owns, squalls, windBrg, onEvent, update, draw3d, draw2d, ceilingParams, level, stats, cellCache, OPT, get gpu() { return gpu; } };
}
