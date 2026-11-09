/* The SCAN INSET (p4_track, pd_engagement's top-right inset, the Anatomy films in a box): when a hull the scan
   struck is a speck in the main view, a magnified picture-in-picture opens beside it for the payoff: the hull from
   the bearing the player looks along, a little above (the films' three-quarter view), turning slowly; the sea as
   rows at even steps of depression (the films' EO sea); the target's cutaway model drawn close; a lime slice
   running bow to stern that X-rays it (the shell thins to a ghost, the interior shows lime: VLS canisters, rounds
   in their containers, engines); part boxes that fit the parts popping as the slice passes them, their placards
   decoding out of glyph noise; the track tag counting up to 0.97. Header: SCAN 01 · TRK 27 · ×38 (how much bigger
   than in the player's view) and the range from the scanner. It closes (or slews to the next hull the scan
   caught) when the payoff is over.

   Rendering: our own GPU pass after the engine's frame (like the clutter field), into a scissored rect of the main
   canvas, with its own camera and a linear depth: the model's point clouds straight from the engine's model cache
   (their VAOs), the sea lattice attribute-less. The frame, marks and tags go on the 2D overlay.
   Placement: the right column between the HUD's log and minimap (game.hudRects), else the left, never over the
   hulls the scan struck. Cost while open: ~0.1-0.3 ms CPU, a few 10k points. */
import { CORAL, sat, clamp, outCubic, outExpo, pad2 } from './core.js';
import { decode, flicker, seedOf } from './decode.js';
import { TRACK } from '../../game/labels.js';
import { orbOn } from './orb.js';

const R_EARTH = 6371000, DEG = Math.PI / 180;
const IW = 480, IH = 270;                 // CSS px at 1080p
const SLOT1 = 4.6, SLOTN = 3.2;           // s a single / each of several hulls is shown
const MAX_SLOTS = 4;

/* ---------------- shaders (self-contained: no frame block) ---------------- */
const HEAD = `#version 300 es
precision highp float;
precision highp int;
`;
const HASH = `
uint hash1(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float u01(uint h) { return float(h >> 8) * (1.0 / 16777216.0); }
`;
const CULL = 'gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0; vCol = vec3(0.0); return;';
const VS_MODEL = HEAD + HASH + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aNrm;
uniform mat3 uXR; uniform vec3 uXT;     // part -> model
uniform mat3 uMR; uniform vec3 uMT;     // model -> eye-relative
uniform vec3 uF; uniform vec3 uRt; uniform vec3 uU;
uniform vec4 uCam;                      // fl (device px), half W, half H (device px), near
uniform vec4 uDep;                      // depth near, far; x: px scale (device px per 1080 px), w: seed
uniform vec4 uP;                        // alpha, x-ray, sample spacing (m), bright
uniform vec4 uTint;                     // rgb, strength
uniform vec4 uGate;                     // model-space slice normal, w: the front (n.p)
uniform vec4 uG2;                       // x mode (0 plain, 1 shell, 2 hidden, 3 part, 4 x-ray item), y band (m), z afterglow (m), w interior lime
uniform vec4 uG3;                       // x: band amplitude
uniform vec4 uAcc;                      // the accent: lime (Point Cloud), white (Orbital)
uniform vec3 uSun;
out vec3 vCol;
void main() {
  vec3 pm = uXR * aPos + uXT;
  vec3 p = uMR * pm + uMT;
  float zc = dot(p, uF);
  if (zc < uCam.w) { ${CULL} }
  float sx = dot(p, uRt) / zc * uCam.x, sy = dot(p, uU) / zc * uCam.x;
  float dz = clamp((zc - uDep.x) / (uDep.y - uDep.x), 0.0, 1.0);
  gl_Position = vec4(sx / uCam.y, sy / uCam.z, dz * 2.0 - 1.0, 1.0);
  float hr = u01(hash1(uint(gl_VertexID) * 747796405u + uint(uDep.w)));
  float mode = uG2.x, xr = uP.y, al = uP.x;
  float gd = uGate.w - dot(uGate.xyz, pm);
  if (mode > 1.5 && mode < 2.5 && gd <= 0.0) { ${CULL} }
  if (mode > 3.5 && gd <= 0.0) { ${CULL} }
  if (mode > 0.5 && mode < 1.5 && gd <= 0.0) xr = 0.0;
  if (mode > 2.5 && mode < 3.5) xr = 0.0;
  float gk = 0.0, w = max(1e-3, uG2.y);
  if (gd > -w * 0.25 && gd < w) gk = gd < 0.0 ? 1.0 + gd / (w * 0.25) : 1.0;
  else if (gd >= w) gk = exp(-(gd - w) / max(1e-3, uG2.z)) * 0.7;
  vec3 n = uMR * (uXR * aNrm.xyz);
  vec3 v = normalize(p);
  float b, lit = 0.45, rim = 0.0;
  bool two = dot(aNrm.xyz, aNrm.xyz) < 0.01;
  if (two) b = 0.45;
  else {
    float dn = dot(n, v);
    if (dn > 0.0) {
      if ((gl_VertexID % 3) != 0 && hr > xr * 0.5) { ${CULL} }
      b = 0.09; lit = 0.1;
    } else {
      float fac = min(1.0, -dn), lam = dot(n, uSun), wv = 1.0 - fac;
      b = 0.06 + 0.74 * max(lam, 0.0) + 0.14 * fac + 0.34 * wv * wv * wv;
      b *= 0.55 + 0.45 * b; lit = b;
      rim = fac < 0.18 ? 1.0 - fac / 0.18 : 0.0; rim *= rim;
    }
  }
  if (xr > 0.0) {
    if (hr < xr * 0.55) { ${CULL} }
    b = mix(b, 0.05 + 0.2 * lit, xr);
  }
  const vec3 WH = vec3(0.933, 0.933, 0.894);
  vec3 LIME = uAcc.rgb;
  vec3 col = mix(WH, uTint.rgb, uTint.a * mix(0.08, 1.0, rim));
  if (mode > 1.5 && mode < 2.5) { col = mix(col, LIME, uG2.w); b = max(b, 0.35); }
  if (mode > 3.5) { col = mix(WH, LIME, uG2.w); b = max(b, 0.42 + 0.3 * lit); }
  vec3 rgb = col * b * uP.w * al * (0.78 + 0.44 * hr);
  gk *= uG3.x;
  if (gk > 0.01) rgb = max(mix(rgb, LIME * max(b, 0.95), gk * al), rgb);
  vCol = min(rgb, vec3(1.0));
  float pxs = uP.z * uCam.x / zc / uDep.z;       // sample spacing in 1080-px units
  float s = pxs > 7.5 ? 3.0 : (pxs > 2.6 ? 2.0 : 1.0);
  gl_PointSize = max(1.0, floor(s * uDep.z + 0.5));
}
`;
const VS_SEA = HEAD + HASH + `
uniform vec3 uF; uniform vec3 uRt; uniform vec3 uU;
uniform vec4 uCam;                      // fl, half W, half H (device px), near
uniform vec4 uDep;                      // depth near, far; z: px scale; w: time
uniform vec4 uS1;                       // x: eye height over the surface (m), y: row step (device px), z: col step (device px), w: columns
uniform vec4 uS2;                       // x, z: world of the frame origin (for world-anchored dots and the swell); y: land 0 / 1; w: brightness
uniform vec4 uS3;                       // eye relative to the frame origin (x, y, z); w: swell amplitude (m)
out vec3 vCol;
void main() {
  int NC = int(uS1.w), j = gl_VertexID / NC, i = gl_VertexID - j * NC;
  float h = uS1.x;
  // the row: an even step of depression on screen (from the bottom of the picture up)
  float sy = -uCam.z + (float(j) + 0.5) * uS1.y;
  vec3 d0 = normalize(uF * uCam.x + uU * sy);
  if (d0.y > -1e-5) { ${CULL} }
  float tr = h / -d0.y;
  vec3 g = d0 * tr;                              // eye-relative ground point under the picture's centre column
  float X = length(g.xz);
  vec3 rh = normalize(vec3(uRt.x, 0.0, uRt.z));
  float sj = tr * uS1.z / uCam.x;                // metres per column at this range
  vec2 wo = uS2.xz + uS3.xz;                     // eye world x, z
  float uw0 = dot(wo + g.xz, rh.xz);
  float i0 = floor(uw0 / sj - float(NC) * 0.5);
  float ii = i0 + float(i);
  uint hc = hash1(uint(int(ii) + 1048576) * 2654435761u ^ uint(j * 7919 + 13));
  float jx = u01(hc) - 0.5, jy = u01(hash1(hc ^ 0x9E3779B9u)) - 0.5;
  float off = (ii + jx * 0.85) * sj - uw0;
  vec3 wp = g + vec3(rh.x, 0.0, rh.z) * off;
  // along the line of sight a little, so the rows are not ruled lines
  if (X > 1.0) wp.xz += g.xz / X * jy * tr * uS1.y / uCam.x / max(0.02, -d0.y) * 0.9;
  vec2 W = wo + wp.xz;
  float t = uDep.w, A = uS3.w;
  float y = A * (0.55 * sin(W.x * 0.043 + W.y * 0.021 + t * 1.1) + 0.3 * sin(-W.x * 0.017 + W.y * 0.061 - t * 1.7) + 0.15 * sin(W.x * 0.11 + W.y * 0.09 + t * 2.9));
  if (uS2.y > 0.5) y = 0.0;
  vec3 p = vec3(wp.x, -h + y, wp.z);
  float zc = dot(p, uF);
  if (zc < uCam.w) { ${CULL} }
  float sx = dot(p, uRt) / zc * uCam.x, sy2 = dot(p, uU) / zc * uCam.x;
  if (abs(sx) > uCam.y * 1.02 || abs(sy2) > uCam.z * 1.02) { ${CULL} }
  float dz = clamp((zc - uDep.x) / (uDep.y - uDep.x), 0.0, 1.0);
  gl_Position = vec4(sx / uCam.y, sy2 / uCam.z, dz * 2.0 - 1.0, 1.0);
  float sw = A > 0.0 ? clamp((y / A + 1.0) * 0.5, 0.0, 1.0) : 0.5;
  float fl = fract(u01(hash1(hc ^ 0x27d4eb2fu)) + t * 0.37); fl = fl < 0.5 ? fl * 2.0 : 2.0 - fl * 2.0;
  float haze = 1.0 - 0.55 * smoothstep(2500.0, 40000.0, X);
  float b = uS2.y > 0.5 ? (0.1 + 0.18 * u01(hc)) : (0.06 + 0.62 * sw * sw * sw + 0.1 * fl);
  vCol = vec3(0.933, 0.933, 0.894) * b * haze * uS2.w;
  gl_PointSize = max(1.0, floor(uDep.z + 0.5));
}
`;
const FS = HEAD + `
in vec3 vCol; out vec4 o;
void main() { o = vec4(vCol, 1.0); }
`;

function compile(gl, type, src, name) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('inset ' + name + ': ' + gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs, name) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, name)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, name));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('inset link ' + name + ': ' + gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i), loc = gl.getUniformLocation(p, info.name); if (loc) u[info.name.replace(/\[0\]$/, '')] = loc; }
  return { p, u };
}

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function mul3(A, B, o) { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return o; }
function apX(X, x, y, z, o) {
  if (!X) { o[0] = x; o[1] = y; o[2] = z; return o; }
  const M = X.R, T = X.T;
  o[0] = M[0] * x + M[1] * y + M[2] * z + T[0]; o[1] = M[3] * x + M[4] * y + M[5] * z + T[1]; o[2] = M[6] * x + M[7] * y + M[8] * z + T[2];
  return o;
}
function safe(f) { try { return f(); } catch (e) { return null; } }

export function createInset(S, AN) {
  const { game } = S, sim = game.sim, R = game.R, gl = R.gl;
  let pM = null, pS = null, ok = true, emptyVao = null;
  try { pM = program(gl, VS_MODEL, FS, 'model'); pS = program(gl, VS_SEA, FS, 'sea'); }
  catch (e) { console.error('sensors: scan inset unavailable', e); ok = false; }

  const subjects = new Map();          // model key -> subject (cut model, placards)
  const warmQ = [];                    // [entry, part, lod] still to sample
  const st = {
    slots: [], cur: -1, rect: null, open: 0, t0: 0, show: null, lastRect: null,
    cam: { eye: [0, 0, 0], f: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0], fl: 1000, hw: IW / 2, hh: IH / 2, near: 1, far: 1e5, dist: 1, fov: 0, origin: [0, 0, 0], h: 10, land: false },
  };
  const q = [0, 0, 0], w3 = [0, 0, 0], M9 = new Float32Array(9), M9b = new Float32Array(9), RR = new Array(9);

  /* ---------- the subject: a model key's cutaway and placards ---------- */
  function subjectOf(key) {
    let s = subjects.get(key);
    if (s !== undefined) return s;
    const A = AN && AN.ANATOMY ? AN.ANATOMY[key] : null;
    const cut = A && R.models.has(A.model) ? A.model : key;
    if (!R.models.has(cut)) { subjects.set(key, null); return null; }
    const e = R.models.get(cut);
    const parts = e.parts.map((P, i) => {
      const en = A && AN.entryOf ? AN.entryOf(key, P.name) : null;
      const cls = P.part.inside ? 'hidden' : en ? en.cls : 'part';
      return { P, i, name: P.name, en, mode: cls === 'hidden' ? 2 : cls === 'shell' ? 1 : 3 };
    });
    const entries = [];
    if (A) for (const en of A.parts) {
      if (!en.id) continue;
      const pis = en.parts.map(n => parts.findIndex(p => p.name === n)).filter(i => i >= 0);
      if (!pis.length) continue;
      entries.push({ en, id: en.id, label: en.label, size: en.size || '', pis, hidden: pis.some(i => parts[i].mode === 2), mn: [0, 0, 0], mx: [0, 0, 0], ext: 0, zc: 0, seed: seedOf(en.label) });
    }
    s = { key, cut, e, A, parts, entries, title: A ? A.title : key, stBase: A && A.st ? A.st : {} };
    subjects.set(key, s);
    return s;
  }
  /* model-space bounds of every placard at the unit's state (coarse clouds), and the long-axis extent */
  function bindSubject(s, stNow) {
    const e = s.e, lod = Math.min(e.lods.length - 1, 2);
    let z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
    const pb = new Map();
    for (const p of s.parts) {
      const part = p.P.part;
      if (part.show && !safe(() => part.show(stNow))) continue;
      const cl = safe(() => R.models.cloud(e, p.P, lod, stNow, !p.P.dyn && !p.P.clouds[lod] && !p.P.clouds[lod + 1]));
      if (!cl || !cl.n || !cl.pts) continue;
      const X = part.xf ? safe(() => part.xf(stNow)) : null, f = cl.pts, step = Math.max(1, Math.floor(cl.n / 400));
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (let i = 0; i < cl.n; i += step) {
        apX(X, f[i * 4], f[i * 4 + 1], f[i * 4 + 2], q);
        for (let c = 0; c < 3; c++) { if (q[c] < mn[c]) mn[c] = q[c]; if (q[c] > mx[c]) mx[c] = q[c]; }
      }
      pb.set(p.i, [mn, mx]);
      if (mn[2] < z0) z0 = mn[2]; if (mx[2] > z1) z1 = mx[2];
      if (mn[1] < y0) y0 = mn[1]; if (mx[1] > y1) y1 = mx[1];
      if (mn[0] < x0) x0 = mn[0]; if (mx[0] > x1) x1 = mx[0];
    }
    if (z0 > z1) return false;
    s.z0 = z0; s.z1 = z1; s.L = Math.max(1, z1 - z0); s.y0 = y0; s.y1 = y1; s.x0 = x0; s.x1 = x1;
    s.center = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    s.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
    for (const en of s.entries) {
      en.mn[0] = en.mn[1] = en.mn[2] = 1e9; en.mx[0] = en.mx[1] = en.mx[2] = -1e9; en.ok = false;
      for (const pi of en.pis) { const b = pb.get(pi); if (!b) continue; en.ok = true; for (let c = 0; c < 3; c++) { en.mn[c] = Math.min(en.mn[c], b[0][c]); en.mx[c] = Math.max(en.mx[c], b[1][c]); } }
      en.ext = en.ok ? Math.max(en.mx[0] - en.mn[0], en.mx[1] - en.mn[1], en.mx[2] - en.mn[2]) : 0;
      en.zc = (en.mn[2] + en.mx[2]) / 2;
    }
    // the placards the picture has room for: the containers the x-ray looks into (TLCs with their rounds, VLS),
    // what it finds inside, then the listed order; never the whole hull
    const xpar = new Set(); if (AN && AN.ANATOMY && AN.ANATOMY[s.key]) for (const x of AN.ANATOMY[s.key].xray || []) if (x.parent) xpar.add(x.parent);
    const cand = s.entries.filter(en => en.ok && en.ext < s.L * .72 && en.ext > s.L * .015);
    const box = cand.filter(en => en.en.parts.some(n => xpar.has(n))).slice(0, 2);
    const hid = cand.filter(en => en.hidden && !box.includes(en)).slice(0, 2);
    const rest = cand.filter(en => !box.includes(en) && !hid.includes(en));
    s.shown = box.concat(hid, rest).slice(0, 7).sort((a, b) => b.zc - a.zc);
    return true;
  }

  /* ---------- scheduling ---------- */
  /* list: [{ u, it (the scan's ident record), tF (s after the hit, own clock), sc }] ranked; opens the slots */
  function schedule(sc, list, hitClock) {
    let t = hitClock;
    const n = Math.min(MAX_SLOTS, list.length);
    for (let k = 0; k < n; k++) {
      const o = list[k], len = n === 1 ? SLOT1 : SLOTN;
      const t0 = Math.max(t, hitClock + o.tF + .12);
      st.slots.push({ sc, u: o.u, it: o.it, t0, t1: t0 + len, len, subj: null, stNow: null, xr: null, seed: (o.u.id * 131 + sc.n * 7) | 0, first: k === 0, last: k === n - 1 });
      t = t0 + len;
    }
  }
  function cancel(sc) { st.slots = st.slots.filter(s => s.sc !== sc); }

  /* ---------- the camera: the scan's picture of the hull, from the player's side ---------- */
  function unitXf(u) {
    const d = game.drawn.get(u.id);
    if (d && d.R && d.T) return d;
    return null;
  }
  /* the picture looks at the hull from the bearing the player looks along, from a little above (the Anatomy films'
     three-quarter view), close enough for the films' perspective, turning slowly while it is up */
  function aim(slot) {
    const u = slot.u, d = unitXf(u), s = slot.subj, C = st.cam;
    if (!d || !s) return false;
    const M = d.R, T = d.T, cam = R.camera;
    const c = s.center;
    const cx = M[0] * c[0] + M[1] * c[1] + M[2] * c[2] + T[0], cy = M[3] * c[0] + M[4] * c[1] + M[5] * c[2] + T[1], cz = M[6] * c[0] + M[7] * c[1] + M[8] * c[2] + T[2];
    const land = u.def.domain === 'land', surf = land ? Math.max(0, R.terrain.heightAt(T[0], T[2])) : 0;
    const a = S.clock - slot.t0;
    if (slot.az === undefined) {
      slot.az = Math.atan2(cx - cam.eye[0], cz - cam.eye[2]);
      slot.el = clamp(cam.pitch || .3, 16 * DEG, 36 * DEG);
    }
    const az = slot.az + (a - slot.len * .5) * 3.2 * DEG, el = slot.el;
    const Dv = clamp(s.radius * 6.2, 40, 3000);
    const fx = Math.cos(el) * Math.sin(az), fy = -Math.sin(el), fz = Math.cos(el) * Math.cos(az);
    // the frame: origin on the surface under the target (all relative, metre precision)
    C.origin[0] = T[0]; C.origin[1] = surf; C.origin[2] = T[2];
    // look a little above the centre so the hull sits in the lower middle, under its placards
    const tx = cx - T[0], ty = cy - surf + s.radius * .04, tz = cz - T[2];
    C.eye[0] = tx - fx * Dv; C.eye[1] = Math.max(2, ty - fy * Dv); C.eye[2] = tz - fz * Dv;
    C.land = land; C.h = C.eye[1];
    C.f[0] = fx; C.f[1] = fy; C.f[2] = fz;
    let rx = fz, rz = -fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;      // cross(up, f)
    C.r[0] = rx; C.r[1] = 0; C.r[2] = rz;
    C.u[0] = fy * C.r[2] - fz * C.r[1]; C.u[1] = fz * C.r[0] - fx * C.r[2]; C.u[2] = fx * C.r[1] - fy * C.r[0];
    C.dist = Dv;
    const half = Math.atan((s.radius * 1.38) / Dv);
    C.fov = half * 2;
    C.near = Math.max(.5, Dv - s.radius * 3); C.far = Dv + Math.max(6000, Dv * 30);
    // the range from the scanner to the hull (what the header states)
    const by = sim.units.get(slot.sc.by), bp = by && by.alive ? game.unitPose(by).pos : slot.sc.from;
    C.range = bp ? Math.hypot(bp[0] - cx, bp[1] - cy, bp[2] - cz) : 0;
    if (st.rect) C.fl = (st.rect[4] / 2) / Math.tan(C.fov / 2);
    // how much bigger than in the player's view
    const zc = (cx - cam.eye[0]) * cam.f[0] + (cy - cam.eye[1]) * cam.f[1] + (cz - cam.eye[2]) * cam.f[2];
    C.inView = zc > cam.near && S.V.vis(cx, cy, cz, s.radius);
    C.mag = (C.fl / Dv) / (cam.fl / Math.max(cam.near, zc));
    return true;
  }
  /* once a frame before drawing: aim the lens */
  function prepare() { st.aimed = active() && aim(st.show); return st.aimed; }
  /* inset px of a model-space point of the slot's target (with the rect origin) -> q; false when behind */
  function projM(slot, pm, rect, out) {
    const d = unitXf(slot.u), C = st.cam; if (!d) return false;
    const M = d.R, T = d.T;
    const x = M[0] * pm[0] + M[1] * pm[1] + M[2] * pm[2] + T[0] - C.origin[0] - C.eye[0];
    const y = M[3] * pm[0] + M[4] * pm[1] + M[5] * pm[2] + T[1] - C.origin[1] - C.eye[1];
    const z = M[6] * pm[0] + M[7] * pm[1] + M[8] * pm[2] + T[2] - C.origin[2] - C.eye[2];
    const zc = x * C.f[0] + y * C.f[1] + z * C.f[2]; if (zc < C.near * .5) return false;
    out[0] = rect[0] + rect[4] / 2 + C.fl * (x * C.r[0] + y * C.r[1] + z * C.r[2]) / zc;
    out[1] = rect[1] + rect[5] / 2 - C.fl * (x * C.u[0] + y * C.u[1] + z * C.u[2]) / zc;
    out[2] = zc;
    return true;
  }

  /* ---------- placement ---------- */
  function over(a, b, pad) { return a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad; }
  function place(slot) {
    // the HUD's scale (the overlay's ui: 1 at 1080p, never below .8); its text is drawn at that scale (raw sizes)
    const cam = R.camera, W = cam.W, H = cam.H, k = R.overlay ? R.overlay.ui : clamp(H / 1080, .8, 1.6), w = Math.round(IW * k), h = Math.round(IH * k);
    const rects = game.hudRects || [];
    const keep = [];
    for (const it of slot.sc.idents || []) { const p = game.unitPose(it.u).pos; if (cam.project(p, q)) keep.push(q[0], q[1], it.u === slot.u ? 14 : 5); }
    if (cam.project(slot.sc.pos, q)) keep.push(q[0], q[1], 3);
    const cands = [];
    // right column under the log and its alerts (the HUD keeps their room in its rect, chips up or not); left column
    // under the palette; above the minimap; top middle. The right column's picture shrinks a little (to 80 %) rather
    // than run into the minimap's label on a short window: [x, y, size factor]
    let yR = 60 * k; for (const r of rects) if (r[2] > W - 200 && r[1] < H * .4) yR = Math.max(yR, r[3] + 34 * k);
    let lim = H - 4; for (const r of rects) if (r[1] > yR && r[0] < W - 88 * k && r[2] > W - 88 * k - w) lim = Math.min(lim, r[1]);
    const fR = clamp((lim - 7 - 22 * k - yR) / h, .8, 1);
    cands.push([W - 88 * k - Math.round(w * fR), yR, fR]);
    let yL = 60 * k; for (const r of rects) if (r[0] < 200 && r[1] < H * .5) yL = Math.max(yL, r[3] + 34 * k);
    cands.push([88 * k, yL]);
    cands.push([W - 88 * k - w, H * .5 - h / 2]);
    cands.push([88 * k, H - 150 * k - h]);
    cands.push([W / 2 - w / 2, 70 * k]);
    cands.push([W - 88 * k - w, H - 170 * k - h]);
    cands.push([W * .5 - w / 2, H - 190 * k - h]);
    let best = null, bs = 1e9;
    for (const [x, y, f] of cands) {
      const cw = f ? Math.round(w * f) : w, chh = f ? Math.round(h * f) : h;
      const b = [x, y - 22 * k, x + cw, y + chh + 22 * k];
      let sc = 0;
      if (b[1] < 4 || b[3] > H - 4 || b[0] < 4 || b[2] > W - 4) sc += 50;
      for (const r of rects) if (over(b, r, 6)) sc += 10;
      for (let i = 0; i < keep.length; i += 3) if (keep[i] > b[0] - 50 && keep[i] < b[2] + 50 && keep[i + 1] > b[1] - 50 && keep[i + 1] < b[3] + 50) sc += keep[i + 2];
      if (sc < bs) { bs = sc; best = [Math.round(x), Math.round(y), Math.round(x + cw), Math.round(y + chh), cw, chh, k]; }
      if (sc === 0) break;
    }
    return best;
  }

  /* ---------- per frame ---------- */
  function update() {
    const now = S.clock;
    // drop finished and dead slots
    while (st.slots.length && (now > st.slots[0].t1 || !st.slots[0].u.alive && now > st.slots[0].t0)) st.slots.shift();
    const s = st.slots.length && now >= st.slots[0].t0 - .01 ? st.slots[0] : null;
    if (s !== st.show) {
      const prev = st.show;
      st.show = s;
      if (s) {
        if (!s.subj) {
          s.subj = subjectOf(s.u.def.model);
          const d = game.drawn.get(s.u.id), base = s.subj ? s.subj.stBase : {};
          s.stNow = Object.assign({}, base, d && d.st ? d.st : {}, { xray: 1 });
          if (s.subj && !bindSubject(s.subj, s.stNow)) s.subj = null;
          if (s.subj && AN && AN.xrayOf) s.xr = safe(() => AN.xrayOf(s.u.def.model, s.stNow)) || [];
        }
        if (!prev || !st.rect) { st.rect = place(s); st.t0 = now; }
        s.tIn = now;
      }
    }
    if (!st.show && st.rect && now - (st.lastEnd || 0) > .35) st.rect = null;
    if (st.show) st.lastEnd = st.show.t1;
  }
  /* 0..1: how open the frame is */
  function openK() {
    const s = st.show; if (!s) { const a = 1 - sat((S.clock - (st.lastEnd || 0)) / .3); return st.rect ? a : 0; }
    const a = sat((S.clock - st.t0) / .28), b = s.last ? 1 - sat((S.clock - (s.t1 - .3)) / .3) : 1;
    return Math.min(a, b);
  }
  const active = () => !!st.show && !!st.show.subj && !!st.rect && !S.inspecting && S.scopeK < .5 && !game.ui.hidden;

  /* ---------- GPU ---------- */
  function drawGPU() {
    if (!ok || !st.aimed || !active()) return;
    const s = st.show, subj = s.subj, rect = st.rect, cam = R.camera, G = R.G;
    const a = S.clock - s.t0, open = openK();
    if (open < .05) return;
    const sxk = G.W / cam.W, syk = G.H / cam.H;
    // the image wipes in from the top as the frame opens, and blanks for a beat when it slews to the next hull
    const wipe = s.first ? sat((S.clock - st.t0 - .12) / .18) : 1;
    const slew = !s.first && a < .14;
    const vx = Math.round(rect[0] * sxk), vw = Math.round(rect[4] * sxk), vh = Math.round(rect[5] * syk);
    const vy = Math.round(G.H - rect[3] * syk);
    const C = st.cam;
    const hwD = vw / 2, hhD = vh / 2, flD = hwD / Math.tan(C.fov / 2);
    const flCss = C.fl;
    const pxK = G.H / 1080;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(vx, vy + Math.round(vh * (1 - wipe)), vw, Math.round(vh * wipe));
    gl.viewport(vx, vy, vw, vh);
    const orb = orbOn(R);
    if (orb) gl.clearColor(0, 0, 0, 1); else gl.clearColor(11 / 255, 12 / 255, 10 / 255, 1);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!slew && wipe > 0) {
      gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      // the model (depth written, so the sea behind the hull stays hidden)
      const d = unitXf(s.u);
      const M = d.R, T = d.T;
      const mt = [T[0] - C.origin[0] - C.eye[0], T[1] - C.origin[1] - C.eye[1], T[2] - C.origin[2] - C.eye[2]];
      const sweep = sweepOf(s, a);
      gl.useProgram(pM.p);
      const u = pM.u;
      gl.uniform3f(u.uF, C.f[0], C.f[1], C.f[2]); gl.uniform3f(u.uRt, C.r[0], C.r[1], C.r[2]); gl.uniform3f(u.uU, C.u[0], C.u[1], C.u[2]);
      gl.uniform4f(u.uCam, flD, hwD, hhD, C.near);
      gl.uniform4f(u.uDep, C.near, C.far, pxK, s.seed & 1023);
      gl.uniform4f(u.uG3, sweep.band, 0, 0, 0);
      // the accent: lime, or white in the Orbital style (a sensor's picture in the Orbital frame)
      if (orb) gl.uniform4f(u.uAcc, .96, .96, .94, 0); else gl.uniform4f(u.uAcc, .776, .957, .196, 0);
      gl.uniform3f(u.uSun, -.45, .8, -.4);
      // model -> eye-relative
      M9[0] = M[0]; M9[1] = M[3]; M9[2] = M[6]; M9[3] = M[1]; M9[4] = M[4]; M9[5] = M[7]; M9[6] = M[2]; M9[7] = M[5]; M9[8] = M[8];
      gl.uniformMatrix3fv(u.uMR, false, M9);
      gl.uniform3f(u.uMT, mt[0], mt[1], mt[2]);
      // passed (behind the slice) = model z > front: gd = n.p... with n = -z, w = -front
      gl.uniform4f(u.uGate, 0, 0, -1, -sweep.front);
      const xk = sweep.xk, e = subj.e, st0 = s.stNow;
      const idk = sat((a - .2) / .8);
      const tint = CORAL;
      for (const p of subj.parts) {
        const part = p.P.part;
        if (part.show && !safe(() => part.show(st0))) continue;
        let lod = e.lods.length - 1;
        const zc = Math.max(1, C.dist);
        while (lod > 0 && e.lods[lod] * flCss / zc > 2.8) lod--;
        const cl = R.models.cloud(e, p.P, lod, st0, false);
        if (!cl || !cl.n) continue;
        const X = part.xf ? safe(() => part.xf(st0)) : null;
        setXf(u, X);
        const mode = p.mode;
        const al = mode === 2 ? xk : 1;
        if (al < .01) continue;
        gl.uniform4f(u.uP, al, mode === 1 ? .85 * xk : 0, cl.sp, 1.0);
        gl.uniform4f(u.uTint, tint[0] / 255, tint[1] / 255, tint[2] / 255, (orb ? 0 : .55) * idk * (1 - xk * .6));
        gl.uniform4f(u.uG2, xk > .01 ? mode : 3, Math.max(.6, subj.L * .02), subj.L * .12, .55);
        gl.bindVertexArray(cl.vao);
        gl.drawArrays(gl.POINTS, 0, cl.n);
      }
      // the sea (or the ground) as the long lens sees it
      gl.depthMask(false);
      if (!emptyVao) emptyVao = gl.createVertexArray();
      gl.useProgram(pS.p);
      const v = pS.u;
      gl.uniform3f(v.uF, C.f[0], C.f[1], C.f[2]); gl.uniform3f(v.uRt, C.r[0], C.r[1], C.r[2]); gl.uniform3f(v.uU, C.u[0], C.u[1], C.u[2]);
      gl.uniform4f(v.uCam, flD, hwD, hhD, C.near);
      gl.uniform4f(v.uDep, C.near, C.far, pxK, game.seaT || S.clock);
      const rowStep = Math.max(2, 2.6 * pxK), colStep = Math.max(2, 3.1 * pxK), rows = Math.ceil(vh / rowStep), cols = Math.ceil(vw * 1.15 / colStep);
      gl.uniform4f(v.uS1, C.h, rowStep, colStep, cols);
      gl.uniform4f(v.uS2, C.origin[0], C.land ? 1 : 0, C.origin[2], C.land ? .8 : 1);
      gl.uniform4f(v.uS3, C.eye[0], C.eye[1], C.eye[2], C.land ? 0 : 1.2 + 1.6 * ((game.weather && game.weather.sea) || .3));
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.POINTS, 0, rows * cols);
      // what the x-ray finds inside: lime, behind the slice
      if (s.xr && s.xr.length && xk > .02) {
        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(pM.p);
        for (const o of s.xr) {
          if (!R.models.has(o.model)) continue;
          const e2 = R.models.get(o.model);
          const lod = Math.min(e2.lods.length - 1, 2);
          for (const P of e2.parts) {
            const ost = o.st || {};
            if (P.part.show && !safe(() => P.part.show(ost))) continue;
            const cl = R.models.cloud(e2, P, lod, ost, false);
            if (!cl || !cl.n) continue;
            const Xp = P.part.xf ? safe(() => P.part.xf(ost)) : null;
            // part -> item -> model
            if (Xp) { mul3(o.xf.R, Xp.R, RR); apX(o.xf, Xp.T[0], Xp.T[1], Xp.T[2], w3); setXfRT(u, RR, w3); }
            else setXfRT(u, o.xf.R, o.xf.T);
            gl.uniform4f(u.uP, xk, 0, cl.sp, 1.2);
            gl.uniform4f(u.uTint, 0, 0, 0, 0);
            gl.uniform4f(u.uG2, 4, Math.max(.6, subj.L * .02), subj.L * .12, .8);
            gl.bindVertexArray(cl.vao);
            gl.drawArrays(gl.POINTS, 0, cl.n);
          }
        }
      }
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.viewport(0, 0, G.W, G.H);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(true);
    gl.bindVertexArray(null);
  }
  function setXf(u, X) {
    if (!X) { M9b[0] = 1; M9b[1] = 0; M9b[2] = 0; M9b[3] = 0; M9b[4] = 1; M9b[5] = 0; M9b[6] = 0; M9b[7] = 0; M9b[8] = 1; gl.uniformMatrix3fv(u.uXR, false, M9b); gl.uniform3f(u.uXT, 0, 0, 0); return; }
    setXfRT(u, X.R, X.T);
  }
  function setXfRT(u, Rm, T) {
    M9b[0] = Rm[0]; M9b[1] = Rm[3]; M9b[2] = Rm[6]; M9b[3] = Rm[1]; M9b[4] = Rm[4]; M9b[5] = Rm[7]; M9b[6] = Rm[2]; M9b[7] = Rm[5]; M9b[8] = Rm[8];
    gl.uniformMatrix3fv(u.uXR, false, M9b); gl.uniform3f(u.uXT, T[0], T[1], T[2]);
  }
  /* the slice: bow to stern over 1.3 s; the x-ray stays behind it until near the end of the slot */
  const SW = { front: 0, xk: 0, k: 0, band: 1 };
  function sweepOf(s, a) {
    const subj = s.subj, t0 = .22, dur = 1.35;
    const k = sat((a - t0) / dur);
    SW.k = k;
    SW.band = a < t0 + dur ? 1 : Math.exp(-(a - t0 - dur) * 3);
    // front: model z, from ahead of the bow to past the stern (passed = z > front)
    SW.front = subj.z1 + subj.L * .04 - (subj.L * 1.08) * outCubic(k) * (a < t0 ? 0 : 1);
    if (a < t0) SW.front = subj.z1 + subj.L;
    SW.xk = flicker(a, t0, s.len - 1.05);
    return SW;
  }

  /* ---------- 2D: frame, header, marks, part boxes, placards ---------- */
  const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  const CP = new Float32Array(16);
  function draw2d(ov, TL) {
    const rect = st.rect;
    if (!rect || S.inspecting || S.scopeK > .5 || game.ui.hidden) return;
    const open = openK();
    if (open < .01) return;
    const ctx = ov.ctx, s = st.show, k = rect[6];
    const x0 = rect[0], y0 = rect[1], x1 = rect[2], y1 = rect[3], w = rect[4], h = rect[5];
    // the frame grows out of its middle as it opens
    const g = outExpo(open), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const fx0 = cx - w / 2 * g, fx1 = cx + w / 2 * g, fy0 = cy - h / 2 * g, fy1 = cy + h / 2 * g;
    ctx.save();
    const orb = S.orb, ACC = orb ? '#F6F5F2' : '#C6F432';
    // dotted frame (the Orbital style: a hairline)
    if (orb) { ctx.globalAlpha = .4 * open; ctx.strokeStyle = '#F6F5F2'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(fx0) + .5, Math.round(fy0) + .5, Math.round(fx1 - fx0), Math.round(fy1 - fy0)); }
    else {
      ctx.globalAlpha = .55 * open; ctx.fillStyle = 'rgba(255,255,255,.9)';
      for (let x = fx0; x <= fx1; x += 3) { ctx.fillRect(Math.round(x), Math.round(fy0), 1, 1); ctx.fillRect(Math.round(x), Math.round(fy1), 1, 1); }
      for (let y = fy0; y <= fy1; y += 3) { ctx.fillRect(Math.round(fx0), Math.round(y), 1, 1); ctx.fillRect(Math.round(fx1), Math.round(y), 1, 1); }
    }
    // corner brackets
    ctx.globalAlpha = open; ctx.strokeStyle = orb ? '#F6F5F2' : '#FFFFFF'; ctx.lineWidth = orb ? 1.2 : 1.5; ctx.beginPath();
    const cl = 16 * k;
    for (const [px, py, sx, sy] of [[fx0 - 3, fy0 - 3, 1, 1], [fx1 + 3, fy0 - 3, -1, 1], [fx1 + 3, fy1 + 3, -1, -1], [fx0 - 3, fy1 + 3, 1, -1]]) { ctx.moveTo(px + sx * cl, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * cl); }
    ctx.stroke();
    ctx.restore();
    if (!s || !s.subj || !st.aimed || open < .9) { ctx.globalAlpha = 1; return; }
    const a = S.clock - s.t0, subj = s.subj, u = s.u, c = sim.contact(game.side, u.id);
    const track = c ? c.track : 'TRK ' + pad2(u.id);
    // header: what looks, at what, how narrow, how far
    const C = st.cam;
    const mag = C.mag, mags = mag >= 100 ? Math.round(mag / 10) * 10 : mag >= 10 ? Math.round(mag) : mag.toFixed(1);
    const lab = `SCAN ${pad2(s.sc.n)} · ${track}` + (C.inView ? ` · ×${mags}` : '');
    ov.text(x0, y0 - 9 * k, lab, { size: 11 * k, col: 'rgba(255,255,255,.62)', a: 1, raw: true });
    ov.text(x1, y0 - 9 * k, `${(C.range / 1000).toFixed(1)} KM`, { size: 11 * k, col: '#C6F432', a: 1, align: 'right', raw: true });
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    // the director's marks: a gapped cross
    ctx.globalAlpha = .4; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1; ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(cx + dx * 14 * k, cy + dy * 14 * k); ctx.lineTo(cx + dx * 30 * k, cy + dy * 30 * k); }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // slewing to the next hull: a beat of noise
    if (!s.first && a < .14) {
      ctx.fillStyle = 'rgba(238,238,228,.55)';
      const fr = Math.floor(S.clock * 60);
      for (let i = 0; i < 320; i++) { const hx = ((i * 7919 + fr * 104729) % 9973) / 9973, hy = ((i * 6007 + fr * 1548586) % 9967) / 9967; ctx.fillRect(Math.round(x0 + hx * w), Math.round(y0 + hy * h), 1, 1); }
      ctx.restore(); return;
    }
    const sw = sweepOf(s, a), out = 1 - sat((a - (s.len - .55)) / .35);
    // the track tag, top left: ? 0.31 -> DDG · ARLEIGH BURKE 0.97
    const ta = sat(a / .2) * out;
    if (ta > .01) {
      const it = s.it, conf0 = it ? it.conf0 : .3;
      const k1 = sat((a - .15) / .9), conf = conf0 + (.97 - conf0) * outCubic(sat((a - .1) / 1.1));
      const lab2 = TRACK[u.type] || u.def.name;
      const text = k1 <= 0 ? '?' : decode(lab2, k1, S.clock, s.seed);
      const kind = a < 1.25 ? 'white' : a < 1.6 && Math.sin(a * 30) > -.2 ? 'lime' : 'coral';
      ov.tag(x0 + 8 * k, y0 + 8 * k, track, text, conf.toFixed(2), { kind, a: ta, size: 10 * k, raw: true });
    }
    // the slice's readout, top right, while it runs (the Orbital style: under the frame, left, clear of the placards)
    let xrTxt = '';
    if (sw.k > 0 && sw.k < 1) {
      const zf = sw.front, st2 = stationAt(subj, zf);
      xrTxt = `X-RAY · Z ${zf >= 0 ? '+' : '−'}${Math.abs(zf).toFixed(1)} M${st2 ? ' · ' + st2 : ''}`;
      if (!orb) ov.text(x1 - 8 * k, y0 + 22 * k, xrTxt, { size: 9.5 * k, col: '#C6F432', a: .95, align: 'right', raw: true });
    }
    // part boxes: each pops as the slice passes it, grows in, holds, goes; its placard in a row above or below
    const d = unitXf(u);
    for (let r = 0; r < ROWS.length; r++) ROWS[r].length = 0;
    const fs = 9.5 * k, hB = Math.round(fs + 9 * k);
    for (const en of subj.shown) {
      if (!d) break;
      const tPass = .22 + 1.35 * outCubicInv(sat((subj.z1 + subj.L * .04 - en.zc) / (subj.L * 1.08)));
      const ak = a - tPass - .04;
      if (ak < 0) continue;
      const al = sat(ak / .2) * out;
      if (al < .02) continue;
      const gr = 1 + .35 * (1 - outExpo(sat(ak / .45)));
      const mx = en.mx, mn = en.mn, ccx = (mn[0] + mx[0]) / 2, ccy = (mn[1] + mx[1]) / 2, ccz = (mn[2] + mx[2]) / 2, pad = subj.L * .004;
      const hx = (mx[0] - mn[0]) / 2 * gr + pad, hy = (mx[1] - mn[1]) / 2 * gr + pad, hz = (mx[2] - mn[2]) / 2 * gr + pad;
      let okb = true, tx = 0, ty = 1e9, by = -1e9;
      for (let ci = 0; ci < 8; ci++) {
        w3[0] = ccx + (ci & 1 ? hx : -hx); w3[1] = ccy + (ci & 2 ? hy : -hy); w3[2] = ccz + (ci & 4 ? hz : -hz);
        if (!projM(s, w3, rect, q)) { okb = false; break; }
        CP[ci * 2] = q[0]; CP[ci * 2 + 1] = q[1];
        if (q[1] < ty) { ty = q[1]; tx = q[0]; }
        if (q[1] > by) by = q[1];
      }
      if (!okb) continue;
      ctx.globalAlpha = al * (orb ? .62 : .9); ctx.strokeStyle = ACC; ctx.lineWidth = orb ? 1 : 1.4; if (!orb) ctx.setLineDash([2, 2]);
      ctx.beginPath();
      for (let e = 0; e < 24; e += 2) { const i0 = EDGES[e], i1 = EDGES[e + 1]; ctx.moveTo(CP[i0 * 2], CP[i0 * 2 + 1]); ctx.lineTo(CP[i1 * 2], CP[i1 * 2 + 1]); }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ACC; ctx.globalAlpha = al;
      if (!orb) for (let ci = 0; ci < 8; ci++) ctx.fillRect(Math.round(CP[ci * 2]) - 1, Math.round(CP[ci * 2 + 1]) - 1, 2, 2);
      const text = decode(en.label.toUpperCase(), sat((ak - .06) / .5), S.clock, en.seed);
      const val = ak > .5 ? en.size : '';
      const tw = tagWidth(ov, en.id, en.label, en.size, fs);
      // rows: above the hull for what is on or over the deck, below for what the x-ray found low inside
      const below = en.hidden && (en.mn[1] + en.mx[1]) / 2 < subj.y0 + (subj.y1 - subj.y0) * .35;
      const lx = Math.max(x0 + 6, Math.min(x1 - tw - 6, tx - 6));
      let row = -1;
      const base = below ? 3 : 0, nr = below ? 2 : 3;
      for (let r = 0; r < nr && row < 0; r++) {
        const R0 = ROWS[base + r];
        let free = true; for (let m = 0; m < R0.length; m += 2) if (lx < R0[m + 1] + 8 && R0[m] < lx + tw + 8) { free = false; break; }
        if (free) row = base + r;
      }
      if (row < 0) continue;
      ROWS[row].push(lx, lx + tw);
      const ly = row < 3 ? y0 + (31 + row * 22) * k : y1 - (27 + (row - 3) * 22) * k;
      // dotted stem from the placard to the box
      ctx.globalAlpha = (orb ? .55 : .75) * al; ctx.fillStyle = ACC;
      const sx = Math.round(Math.max(lx + 3, Math.min(lx + tw - 3, tx)));
      if (orb) { if (row < 3) ctx.fillRect(sx, Math.round(ly + hB + 2), 1, Math.max(0, Math.round(ty - 2 - ly - hB - 2))); else ctx.fillRect(sx, Math.round(by + 3), 1, Math.max(0, Math.round(ly - 2 - by - 3))); }
      else if (row < 3) for (let yy = ly + hB + 2; yy < ty - 2; yy += 3) ctx.fillRect(sx, Math.round(yy), 1, 1);
      else for (let yy = by + 3; yy < ly - 2; yy += 3) ctx.fillRect(sx, Math.round(yy), 1, 1);
      ctx.globalAlpha = 1;
      ov.tag(lx, ly, en.id, text, val, { kind: 'lime', a: al, size: fs, raw: true });
    }
    ctx.restore();
    if (orb && xrTxt) ov.text(x0, y1 + 18 * k, xrTxt, { size: 9.5 * k, col: '#F6F5F2', a: .8, raw: true });
    // scale bar, under the frame on the right (at the hull's range in the picture)
    const sb = subj.L > 60 ? 50 : subj.L > 12 ? 10 : 2;
    const mpp = C.dist * Math.tan(C.fov / 2) / (w / 2), len = sb / mpp;
    if (len > 12 && len < w * .45) {
      ctx.globalAlpha = .7 * open; ctx.fillStyle = '#FFFFFF';
      const bx = x1 - len, by2 = y1 + 14 * k;
      if (orb) ctx.fillRect(Math.round(bx), Math.round(by2), Math.round(len), 1);
      else for (let i = 0; i <= len; i += 3) ctx.fillRect(Math.round(bx + i), Math.round(by2), 1, 1);
      ctx.fillRect(Math.round(bx), Math.round(by2 - 3), 1, 7); ctx.fillRect(Math.round(bx + len), Math.round(by2 - 3), 1, 7);
      ctx.globalAlpha = 1;
      ov.text(bx - 8 * k, by2 + 4 * k, sb + ' M', { size: 9.5 * k, col: 'rgba(255,255,255,.55)', align: 'right', raw: true });
    }
    // the thread back to the hull in the world: a dotted leader to a small lime bracket on it
    const tp = game.unitPose(u).pos, cam = R.camera;
    if (cam.project(tp, q) && q[0] > -20 && q[1] > -20 && q[0] < cam.W + 20 && q[1] < cam.H + 20 && !(q[0] > x0 - 4 && q[0] < x1 + 4 && q[1] > y0 - 30 && q[1] < y1 + 4)) {
      const nx = q[0] < x0 ? x0 : q[0] > x1 ? x1 : q[0], ny = q[1] < y0 ? y0 : q[1] > y1 ? y1 : q[1];
      const dd = Math.hypot(nx - q[0], ny - q[1]) || 1, ux = (nx - q[0]) / dd, uy = (ny - q[1]) / dd;
      ov.leader(q[0] + ux * 12, q[1] + uy * 12, nx, ny, 'rgba(198,244,50,.9)', .4 * open);
      ov.bracket([q[0] - 7, q[1] - 7, q[0] + 7, q[1] + 7], '#C6F432', .9 * open, 2, 5);
    }
  }
  const ROWS = [[], [], [], [], []];
  const outCubicInv = v => 1 - Math.cbrt(1 - v);
  function tagWidth(ov, id, label, value, px) {
    if (ov.tagSize) return ov.tagSize(id, label, value, { size: px, raw: true })[0];
    const cw = px * .62, pX = px * .61, pL = px * .7;
    return (id ? id.length * cw + pX * 2 : 0) + (label ? label.length * cw + pL * 2 : 0) + (value ? String(value).length * cw + pL * 2 : 0);
  }
  /* what the slice is cutting through at model z (the smallest placard whose box spans it; inside parts first) */
  function stationAt(subj, z) {
    let best = null, bv = 1e18;
    for (const en of subj.entries) {
      if (!en.ok || z < en.mn[2] || z > en.mx[2]) continue;
      const v = (en.mx[0] - en.mn[0]) * (en.mx[1] - en.mn[1]) * (en.mx[2] - en.mn[2]) * (en.hidden ? .3 : 1);
      if (v < bv) { bv = v; best = en; }
    }
    return best ? best.label.split(' · ')[0].toUpperCase() : '';
  }
  return {
    st, schedule, cancel, update, prepare, drawGPU, draw2d, active, subjectOf,
    /* the rect the world tags keep out of (with the header), or null */
    get rect() { const r = st.rect; return r && openK() > .01 && !S.inspecting ? [r[0] - 6, r[1] - 26 * r[6], r[2] + 6, r[3] + 24 * r[6]] : null; },
    get showing() { return st.show ? st.show.u.id : -1; },
    /* queue a model's cutaway for sampling ahead of its picture (one part a frame, only while the frame has room) */
    warm(key) {
      const s = subjectOf(key); if (!s) return;
      const e = s.e;
      for (const lod of [Math.min(e.lods.length - 1, 2), Math.min(e.lods.length - 1, 1)]) for (const P of e.parts) if (!P.dyn && !P.clouds[lod]) warmQ.push([e, P, lod]);
    },
    warmStep() {
      if (!warmQ.length || R.models.spent > 1.5) return;
      const [e, P, lod] = warmQ.shift();
      if (!P.clouds[lod]) R.models.cloud(e, P, lod, { xray: 1 }, true);
    },
  };
}
